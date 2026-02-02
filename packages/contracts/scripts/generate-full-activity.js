const hre = require("hardhat");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Generating activity with:", signer.address);
  
  const SHELL = "0xcfAD33C1188635B22BA97a7caBCF5bEd02fAe466";
  const COINFLIP_V3 = "0x25B19C2634A2F8338D5a1821F96AF339A5066fbE";
  const ROULETTE_V2 = "0xaee87fa7FDc714650E557b038Ad1623af71D80c6";
  
  const shell = await hre.ethers.getContractAt("IERC20", SHELL, signer);
  
  // ====== COINFLIP V3 ======
  console.log("\n=== COINFLIP V3 ===");
  const coinflip = await hre.ethers.getContractAt("ShellCoinflipV3", COINFLIP_V3, signer);
  
  // Register if needed
  const cfVerified = await coinflip.verifiedAgents(signer.address);
  if (!cfVerified) {
    console.log("Registering on Coinflip...");
    await (await coinflip.registerAgent("Flipcee")).wait();
    console.log("Registered!");
  }
  
  // Approve
  const cfAllowance = await shell.allowance(signer.address, COINFLIP_V3);
  if (cfAllowance == 0n) {
    console.log("Approving SHELL for Coinflip...");
    await (await shell.approve(COINFLIP_V3, hre.ethers.MaxUint256)).wait();
    console.log("Approved!");
  }
  
  // Enter multiple tiers
  const tiers = [1n, 5n, 10n, 25n]; // SHELL amounts
  for (const tier of tiers) {
    const bet = hre.ethers.parseUnits(tier.toString(), 18);
    const waiting = await coinflip.matchingPool(bet);
    if (waiting === hre.ethers.ZeroAddress) {
      console.log(`Entering ${tier} SHELL pool...`);
      try {
        await (await coinflip.enterPool(bet, 0)).wait();
        console.log(`  ✓ Entered ${tier} SHELL pool`);
      } catch (e) {
        console.log(`  ✗ Failed: ${e.message?.slice(0, 50)}`);
      }
    } else if (waiting !== signer.address) {
      console.log(`${tier} SHELL pool has opponent - let's match!`);
      try {
        const tx = await coinflip.enterPool(bet, 1);
        const receipt = await tx.wait();
        console.log(`  ✓ Matched! Tx: ${receipt.hash}`);
      } catch (e) {
        console.log(`  ✗ Match failed: ${e.message?.slice(0, 50)}`);
      }
    } else {
      console.log(`Already waiting in ${tier} SHELL pool`);
    }
  }
  
  // ====== ROULETTE V2 ======
  console.log("\n=== ROULETTE V2 ===");
  const roulette = await hre.ethers.getContractAt("ShellRouletteV2", ROULETTE_V2, signer);
  
  // Register if needed
  const rVerified = await roulette.verifiedAgents(signer.address);
  if (!rVerified) {
    console.log("Registering on Roulette...");
    await (await roulette.registerAgent("Flipcee")).wait();
    console.log("Registered!");
  }
  
  // Approve
  const rAllowance = await shell.allowance(signer.address, ROULETTE_V2);
  if (rAllowance == 0n) {
    console.log("Approving SHELL for Roulette...");
    await (await shell.approve(ROULETTE_V2, hre.ethers.MaxUint256)).wait();
    console.log("Approved!");
  }
  
  // Check active rounds
  const stats = await roulette.totalRounds();
  console.log("Total rounds so far:", stats.toString());
  
  // Join a round at tier 0 (10 SHELL)
  const tier0Bet = await roulette.tierBets(0);
  console.log("Tier 0 bet amount:", hre.ethers.formatUnits(tier0Bet, 18), "SHELL");
  
  const activeRound = await roulette.activeRoundByTier(0);
  console.log("Active round for tier 0:", activeRound.toString());
  
  if (activeRound == 0n) {
    console.log("No active round - creating one...");
    try {
      await (await roulette.joinRound(0)).wait();
      console.log("  ✓ Created/joined round!");
    } catch (e) {
      console.log(`  ✗ Failed: ${e.message?.slice(0, 80)}`);
    }
  } else {
    const [players, fired] = await roulette.getRoundInfo(activeRound);
    console.log(`Round ${activeRound}: ${players.length}/6 players, fired: ${fired}`);
    if (!players.includes(signer.address) && players.length < 6) {
      console.log("Joining existing round...");
      try {
        await (await roulette.joinRound(0)).wait();
        console.log("  ✓ Joined round!");
      } catch (e) {
        console.log(`  ✗ Failed: ${e.message?.slice(0, 80)}`);
      }
    }
  }
  
  console.log("\n=== ACTIVITY GENERATED ===");
  console.log("Check leaderboard at https://team-shellsino.vercel.app/api/leaderboard");
}

main().catch(console.error);
