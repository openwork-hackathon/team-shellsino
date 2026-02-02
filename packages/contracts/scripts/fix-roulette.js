const hre = require("hardhat");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Playing Roulette with:", signer.address);
  
  const SHELL = "0xcfAD33C1188635B22BA97a7caBCF5bEd02fAe466";
  const ROULETTE_V2 = "0xaee87fa7FDc714650E557b038Ad1623af71D80c6";
  
  const roulette = await hre.ethers.getContractAt("ShellRouletteV2", ROULETTE_V2, signer);
  
  // Check supported bets
  const bet0 = await roulette.supportedBets(0);
  console.log("Tier 0 bet amount:", hre.ethers.formatUnits(bet0, 18), "SHELL");
  
  // Check current pool
  const [count, players, createdAt] = await roulette.getPoolStatus(bet0);
  console.log(`Current pool: ${count}/6 players`);
  
  // Enter chamber
  console.log("Entering 10 SHELL chamber...");
  const tx = await roulette.enterChamber(bet0);
  console.log("Tx:", tx.hash);
  const receipt = await tx.wait();
  
  // Check for RoundFired event
  const firedEvent = receipt.logs.find(l => {
    try {
      const parsed = roulette.interface.parseLog(l);
      return parsed?.name === 'RoundFired';
    } catch { return false; }
  });
  
  if (firedEvent) {
    const parsed = roulette.interface.parseLog(firedEvent);
    console.log("ROUND FIRED!");
    console.log("  Eliminated:", parsed.args.eliminated);
  } else {
    // Check new pool state
    const [newCount] = await roulette.getPoolStatus(bet0);
    console.log(`Now in pool: ${newCount}/6 players`);
  }
}

main().catch(console.error);
