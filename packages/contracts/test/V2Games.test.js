const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("🎮 V2 INSTANT GAMES TEST SUITE", function () {
  let shell, rouletteV2, instantBlackjack, houseBankroll;
  let owner, agent1, agent2, agent3, agent4, agent5, agent6, agent7;
  
  const BET_100 = ethers.parseEther("100");
  
  before(async function () {
    [owner, agent1, agent2, agent3, agent4, agent5, agent6, agent7] = await ethers.getSigners();
    
    // Deploy MockShell
    const MockShell = await ethers.getContractFactory("MockShell");
    shell = await MockShell.deploy();
    await shell.waitForDeployment();
    
    // Deploy RouletteV2
    const RouletteV2 = await ethers.getContractFactory("ShellRouletteV2");
    rouletteV2 = await RouletteV2.deploy(await shell.getAddress());
    await rouletteV2.waitForDeployment();
    
    // Deploy HouseBankroll for Blackjack
    const HouseBankroll = await ethers.getContractFactory("HouseBankroll");
    // Need house token - use shell for simplicity in tests
    houseBankroll = await HouseBankroll.deploy(await shell.getAddress(), await shell.getAddress());
    await houseBankroll.waitForDeployment();
    
    // Deploy InstantBlackjack
    const InstantBlackjack = await ethers.getContractFactory("InstantBlackjack");
    instantBlackjack = await InstantBlackjack.deploy(
      await shell.getAddress(), 
      await houseBankroll.getAddress()
    );
    await instantBlackjack.waitForDeployment();
    
    // Authorize blackjack to use bankroll
    await houseBankroll.setGameAuthorization(await instantBlackjack.getAddress(), true);
    
    console.log("\n   📋 V2 Games deployed to local Hardhat network");
    
    // Fund agents
    const agents = [agent1, agent2, agent3, agent4, agent5, agent6, agent7];
    for (const agent of agents) {
      await shell.transfer(agent.address, ethers.parseEther("100000"));
      await shell.connect(agent).approve(await rouletteV2.getAddress(), ethers.parseEther("100000"));
      await shell.connect(agent).approve(await instantBlackjack.getAddress(), ethers.parseEther("100000"));
    }
    
    // Fund house bankroll
    await shell.approve(await houseBankroll.getAddress(), ethers.parseEther("10000"));
    await houseBankroll.depositBankroll(ethers.parseEther("10000"));
    
    console.log("   💰 Funded 7 agents + house bankroll\n");
  });

  // ═══════════════════════════════════════════════════════════════════
  // 💀 ROULETTE V2 TESTS
  // ═══════════════════════════════════════════════════════════════════
  
  describe("💀 ROULETTE V2 - Registration", function () {
    it("✅ should register agents", async function () {
      await rouletteV2.connect(agent1).registerAgent("Agent1");
      await rouletteV2.connect(agent2).registerAgent("Agent2");
      await rouletteV2.connect(agent3).registerAgent("Agent3");
      await rouletteV2.connect(agent4).registerAgent("Agent4");
      await rouletteV2.connect(agent5).registerAgent("Agent5");
      await rouletteV2.connect(agent6).registerAgent("Agent6");
      
      expect(await rouletteV2.verifiedAgents(agent1.address)).to.be.true;
    });
    
    it("✅ should reject unsupported bet amount", async function () {
      await expect(
        rouletteV2.connect(agent1).enterChamber(ethers.parseEther("77"))
      ).to.be.revertedWith("Use a supported bet tier");
    });
  });
  
  describe("💀 ROULETTE V2 - Pool Entry", function () {
    it("✅ should enter pool when not full", async function () {
      await rouletteV2.connect(agent1).enterChamber(BET_100);
      
      const [count, players] = await rouletteV2.getPoolStatus(BET_100);
      expect(count).to.equal(1);
      expect(players[0]).to.equal(agent1.address);
      
      console.log("      💀 Agent1 entered 100 SHELL chamber (1/6)");
    });
    
    it("✅ should prevent double entry", async function () {
      await expect(
        rouletteV2.connect(agent1).enterChamber(BET_100)
      ).to.be.revertedWith("Already in a pool");
    });
    
    it("✅ should allow exit before round triggers", async function () {
      const balBefore = await shell.balanceOf(agent1.address);
      await rouletteV2.connect(agent1).exitChamber(BET_100);
      const balAfter = await shell.balanceOf(agent1.address);
      
      expect(balAfter - balBefore).to.equal(BET_100);
      console.log("      💸 Agent1 exited, 100 SHELL refunded");
    });
  });
  
  describe("💀 ROULETTE V2 - INSTANT ROUND", function () {
    it("✅ should trigger round at 6 players", async function () {
      // Enter 6 agents
      await rouletteV2.connect(agent1).enterChamber(BET_100);
      await rouletteV2.connect(agent2).enterChamber(BET_100);
      await rouletteV2.connect(agent3).enterChamber(BET_100);
      await rouletteV2.connect(agent4).enterChamber(BET_100);
      await rouletteV2.connect(agent5).enterChamber(BET_100);
      
      console.log("      💀 5 agents in chamber, waiting for 6th...");
      
      // 6th agent triggers the round
      const tx = await rouletteV2.connect(agent6).enterChamber(BET_100);
      const receipt = await tx.wait();
      
      // Check for ChamberSpun event
      const event = receipt.logs.find(log => {
        try {
          return rouletteV2.interface.parseLog(log)?.name === 'ChamberSpun';
        } catch { return false; }
      });
      
      expect(event).to.not.be.undefined;
      
      const parsed = rouletteV2.interface.parseLog(event);
      const eliminated = parsed.args.eliminated;
      const prizePerSurvivor = parsed.args.prizePerSurvivor;
      
      console.log(`      💥 BANG! Eliminated: ${eliminated.slice(0, 10)}...`);
      console.log(`      💰 Survivors each got: ${ethers.formatEther(prizePerSurvivor)} SHELL`);
      
      // Pool should be empty
      const [count] = await rouletteV2.getPoolStatus(BET_100);
      expect(count).to.equal(0);
      
      // Stats should be updated
      const totalRounds = await rouletteV2.totalRoundsPlayed();
      expect(totalRounds).to.equal(1);
    });
    
    it("✅ should have correct payouts", async function () {
      // 6 x 100 = 600 pot
      // 2% fee = 12
      // 588 / 5 = 117.6 per survivor
      const history = await rouletteV2.getRecentRounds(1);
      expect(history[0].prizePerSurvivor).to.equal(ethers.parseEther("117.6"));
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 🃏 INSTANT BLACKJACK TESTS
  // ═══════════════════════════════════════════════════════════════════
  
  describe("🃏 INSTANT BLACKJACK - Registration", function () {
    it("✅ should register agents", async function () {
      await instantBlackjack.connect(agent1).registerAgent("BJPlayer1");
      expect(await instantBlackjack.verifiedAgents(agent1.address)).to.be.true;
    });
  });
  
  describe("🃏 INSTANT BLACKJACK - Single-TX Play", function () {
    it("✅ should play a complete hand in one transaction", async function () {
      const balBefore = await shell.balanceOf(agent1.address);
      
      const tx = await instantBlackjack.connect(agent1).playHand(ethers.parseEther("10"));
      const receipt = await tx.wait();
      
      // Check for event
      const event = receipt.logs.find(log => {
        try {
          return instantBlackjack.interface.parseLog(log)?.name === 'InstantBlackjackPlayed';
        } catch { return false; }
      });
      
      expect(event).to.not.be.undefined;
      
      const parsed = instantBlackjack.interface.parseLog(event);
      const result = parsed.args.result;
      const playerTotal = parsed.args.playerTotal;
      const dealerTotal = parsed.args.dealerTotal;
      const payout = parsed.args.payout;
      
      console.log(`      🃏 Hand played: Player ${playerTotal} vs Dealer ${dealerTotal}`);
      console.log(`      📊 Result: ${result}, Payout: ${ethers.formatEther(payout)} SHELL`);
    });
    
    it("✅ should play multiple hands", async function () {
      const gamesBefore = await instantBlackjack.totalGamesPlayed();
      
      // Play 5 hands
      for (let i = 0; i < 5; i++) {
        await instantBlackjack.connect(agent1).playHand(ethers.parseEther("10"));
      }
      
      const gamesAfter = await instantBlackjack.totalGamesPlayed();
      expect(gamesAfter - gamesBefore).to.equal(5n);
      
      console.log("      ⚡ Played 5 hands instantly!");
    });
    
    it("✅ should track stats correctly", async function () {
      const stats = await instantBlackjack.getAgentStats(agent1.address);
      const totalHands = Number(stats[1]) + Number(stats[2]) + Number(stats[3]); // wins + losses + pushes
      
      expect(totalHands).to.be.gte(6); // At least 6 hands played
      console.log(`      📊 Agent1 stats: ${stats[1]} wins, ${stats[2]} losses, ${stats[3]} pushes`);
    });
    
    it("✅ should reject bet out of range", async function () {
      await expect(
        instantBlackjack.connect(agent1).playHand(ethers.parseEther("0.5"))
      ).to.be.revertedWith("Bet out of range");
      
      await expect(
        instantBlackjack.connect(agent1).playHand(ethers.parseEther("1000"))
      ).to.be.revertedWith("Bet out of range");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 📊 SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  
  describe("📊 V2 GAMES SUMMARY", function () {
    it("✅ should display test results", async function () {
      const rrRounds = await rouletteV2.totalRoundsPlayed();
      const rrVolume = await rouletteV2.totalVolume();
      const bjGames = await instantBlackjack.totalGamesPlayed();
      const bjVolume = await instantBlackjack.totalVolume();
      
      console.log("\n   ═══════════════════════════════════════════════════════");
      console.log("   🎮 V2 INSTANT GAMES RESULTS");
      console.log("   ═══════════════════════════════════════════════════════");
      console.log("");
      console.log("   💀 ROULETTE V2:");
      console.log(`      • Rounds: ${rrRounds}`);
      console.log(`      • Volume: ${ethers.formatEther(rrVolume)} SHELL`);
      console.log("");
      console.log("   🃏 INSTANT BLACKJACK:");
      console.log(`      • Games: ${bjGames}`);
      console.log(`      • Volume: ${ethers.formatEther(bjVolume)} SHELL`);
      console.log("");
      console.log("   ═══════════════════════════════════════════════════════");
      console.log("   ✅ ALL V2 GAMES INSTANT & FRICTION-FREE!");
      console.log("   ═══════════════════════════════════════════════════════\n");
    });
  });
});
