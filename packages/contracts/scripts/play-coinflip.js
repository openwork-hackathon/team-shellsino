const hre = require("hardhat");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Playing with:", signer.address);
  
  const SHELL = "0xcfAD33C1188635B22BA97a7caBCF5bEd02fAe466";
  const COINFLIP_V3 = "0x25B19C2634A2F8338D5a1821F96AF339A5066fbE";
  
  const shell = await hre.ethers.getContractAt("IERC20", SHELL, signer);
  const coinflip = await hre.ethers.getContractAt("ShellCoinflipV3", COINFLIP_V3, signer);
  
  // Check if already registered
  const isVerified = await coinflip.verifiedAgents(signer.address);
  console.log("Already registered:", isVerified);
  
  if (!isVerified) {
    console.log("Registering as agent 'Flipcee'...");
    const regTx = await coinflip.registerAgent("Flipcee");
    await regTx.wait();
    console.log("Registered!");
  }
  
  const bet = hre.ethers.parseUnits("1", 18);
  
  // Check current state
  const balance = await shell.balanceOf(signer.address);
  console.log("SHELL balance:", hre.ethers.formatUnits(balance, 18));
  
  const allowance = await shell.allowance(signer.address, COINFLIP_V3);
  console.log("Current allowance:", hre.ethers.formatUnits(allowance, 18));
  
  // Approve if needed
  if (allowance < bet) {
    console.log("Approving SHELL...");
    const tx = await shell.approve(COINFLIP_V3, hre.ethers.MaxUint256);
    await tx.wait();
    console.log("Approved!");
  }
  
  // Check pool
  const waiting = await coinflip.matchingPool(bet);
  console.log("Pool waiting player:", waiting);
  
  // Enter pool
  console.log("Entering 1 SHELL pool (heads)...");
  const enterTx = await coinflip.enterPool(bet, 0);
  console.log("Tx hash:", enterTx.hash);
  const receipt = await enterTx.wait();
  console.log("Entered pool!");
  
  // Check for InstantMatch event
  const matchEvent = receipt.logs.find(l => {
    try {
      const parsed = coinflip.interface.parseLog(l);
      return parsed?.name === 'InstantMatch';
    } catch { return false; }
  });
  
  if (matchEvent) {
    const parsed = coinflip.interface.parseLog(matchEvent);
    console.log("INSTANT MATCH!");
    console.log("  Winner:", parsed.args.winner);
    console.log("  Payout:", hre.ethers.formatUnits(parsed.args.payout, 18), "SHELL");
  } else {
    console.log("Waiting in pool for opponent...");
    const newWaiting = await coinflip.matchingPool(bet);
    console.log("Now waiting:", newWaiting);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
