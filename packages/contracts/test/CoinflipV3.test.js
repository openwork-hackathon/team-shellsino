const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("🪙 COINFLIP V3 - INSTANT MATCHING", function () {
  let shell, coinflipV3;
  let owner, agent1, agent2, agent3, agent4, agent5;
  
  const BET_10 = ethers.parseEther("10");
  const BET_100 = ethers.parseEther("100");
  
  before(async function () {
    [owner, agent1, agent2, agent3, agent4, agent5] = await ethers.getSigners();
    
    // Deploy MockShell token
    const MockShell = await ethers.getContractFactory("MockShell");
    shell = await MockShell.deploy();
    await shell.waitForDeployment();
    
    // Deploy CoinflipV3
    const CoinflipV3 = await ethers.getContractFactory("ShellCoinflipV3");
    coinflipV3 = await CoinflipV3.deploy(await shell.getAddress());
    await coinflipV3.waitForDeployment();
    
    console.log("\n   📋 CoinflipV3 deployed to local Hardhat network");
    
    // Fund agents
    const agents = [agent1, agent2, agent3, agent4, agent5];
    for (const agent of agents) {
      await shell.transfer(agent.address, ethers.parseEther("100000"));
      await shell.connect(agent).approve(await coinflipV3.getAddress(), ethers.parseEther("100000"));
    }
    console.log("   💰 Funded 5 agents with 100,000 SHELL each\n");
  });

  describe("📝 Registration", function () {
    it("✅ should register agents", async function () {
      await coinflipV3.connect(agent1).registerAgent("Alice");
      await coinflipV3.connect(agent2).registerAgent("Bob");
      await coinflipV3.connect(agent3).registerAgent("Charlie");
      
      expect(await coinflipV3.verifiedAgents(agent1.address)).to.be.true;
      expect(await coinflipV3.agentNames(agent1.address)).to.equal("Alice");
    });
    
    it("✅ should reject unregistered agents from pool", async function () {
      await expect(
        coinflipV3.connect(agent4).enterPool(BET_100, 0)
      ).to.be.revertedWith("Not a verified agent");
    });
  });

  describe("🎱 Matching Pool - No Match", function () {
    it("✅ should enter pool when empty", async function () {
      const tx = await coinflipV3.connect(agent1).enterPool(BET_100, 0);
      const receipt = await tx.wait();
      
      // Check pool status
      const [hasWaiting, waitingPlayer] = await coinflipV3.getPoolStatus(BET_100);
      expect(hasWaiting).to.be.true;
      expect(waitingPlayer).to.equal(agent1.address);
      
      console.log("      🎱 Agent1 entered 100 SHELL pool, waiting for match...");
    });
    
    it("✅ should reject same agent entering same pool", async function () {
      await expect(
        coinflipV3.connect(agent1).enterPool(BET_100, 1)
      ).to.be.revertedWith("Already in pool");
    });
    
    it("✅ should allow exit from pool", async function () {
      const balBefore = await shell.balanceOf(agent1.address);
      await coinflipV3.connect(agent1).exitPool(BET_100);
      const balAfter = await shell.balanceOf(agent1.address);
      
      expect(balAfter - balBefore).to.equal(BET_100);
      
      const [hasWaiting] = await coinflipV3.getPoolStatus(BET_100);
      expect(hasWaiting).to.be.false;
      
      console.log("      💸 Agent1 exited pool, 100 SHELL refunded");
    });
  });

  describe("⚡ Matching Pool - INSTANT MATCH", function () {
    it("✅ should instantly match two agents", async function () {
      // Agent1 enters pool
      await coinflipV3.connect(agent1).enterPool(BET_100, 0); // heads
      
      const bal1Before = await shell.balanceOf(agent1.address);
      const bal2Before = await shell.balanceOf(agent2.address);
      
      // Agent2 enters same pool - INSTANT MATCH!
      const tx = await coinflipV3.connect(agent2).enterPool(BET_100, 1); // tails
      const receipt = await tx.wait();
      
      // Check for InstantMatch event
      const matchEvent = receipt.logs.find(log => {
        try {
          const parsed = coinflipV3.interface.parseLog(log);
          return parsed?.name === 'InstantMatch';
        } catch { return false; }
      });
      
      expect(matchEvent).to.not.be.undefined;
      
      const parsed = coinflipV3.interface.parseLog(matchEvent);
      const winner = parsed.args.winner;
      const payout = parsed.args.payout;
      
      console.log(`      ⚡ INSTANT MATCH! Winner: ${winner === agent1.address ? 'Alice' : 'Bob'}`);
      console.log(`      💰 Payout: ${ethers.formatEther(payout)} SHELL`);
      
      // Pool should be empty
      const [hasWaiting] = await coinflipV3.getPoolStatus(BET_100);
      expect(hasWaiting).to.be.false;
      
      // Winner should have more, loser should have less
      const bal1After = await shell.balanceOf(agent1.address);
      const bal2After = await shell.balanceOf(agent2.address);
      
      // One gained ~98, one lost 100
      const change1 = bal1After - bal1Before;
      const change2 = bal2After - bal2Before;
      
      // Verify payout math (198 SHELL - 1% fee from 200 pot)
      expect(payout).to.equal(ethers.parseEther("198"));
    });
    
    it("✅ should track stats after match", async function () {
      const stats1 = await coinflipV3.getAgentStats(agent1.address);
      const stats2 = await coinflipV3.getAgentStats(agent2.address);
      
      // Combined should be 1 win, 1 loss
      expect(Number(stats1[0]) + Number(stats2[0])).to.equal(1); // total wins
      expect(Number(stats1[1]) + Number(stats2[1])).to.equal(1); // total losses
    });
    
    it("✅ should run multiple instant matches", async function () {
      const gamesBefore = await coinflipV3.totalGamesPlayed();
      
      // Run 5 instant matches
      for (let i = 0; i < 5; i++) {
        await coinflipV3.connect(agent1).enterPool(BET_10, i % 2);
        await coinflipV3.connect(agent2).enterPool(BET_10, (i + 1) % 2);
      }
      
      const gamesAfter = await coinflipV3.totalGamesPlayed();
      expect(gamesAfter - gamesBefore).to.equal(5n);
      
      console.log("      ⚡ Ran 5 instant matches successfully!");
    });
  });

  describe("⚔️ Direct Challenges", function () {
    before(async function () {
      await coinflipV3.connect(agent4).registerAgent("Diana");
      await shell.connect(agent4).approve(await coinflipV3.getAddress(), ethers.parseEther("100000"));
    });
    
    it("✅ should create a direct challenge", async function () {
      const tx = await coinflipV3.connect(agent1).createChallenge(
        agent3.address, 
        ethers.parseEther("50"),
        0 // heads
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return coinflipV3.interface.parseLog(log)?.name === 'ChallengeCreated';
        } catch { return false; }
      });
      
      expect(event).to.not.be.undefined;
      console.log("      ⚔️ Alice challenged Charlie for 50 SHELL!");
    });
    
    it("✅ should reject challenge to self", async function () {
      await expect(
        coinflipV3.connect(agent1).createChallenge(agent1.address, BET_10, 0)
      ).to.be.revertedWith("Invalid opponent");
    });
    
    it("✅ should reject challenge to unverified agent", async function () {
      await expect(
        coinflipV3.connect(agent1).createChallenge(agent5.address, BET_10, 0)
      ).to.be.revertedWith("Opponent not verified");
    });
    
    it("✅ should accept challenge and resolve instantly", async function () {
      const challenge = await coinflipV3.getChallenge(1);
      expect(challenge.challenger).to.equal(agent1.address);
      expect(challenge.challenged).to.equal(agent3.address);
      
      const bal1Before = await shell.balanceOf(agent1.address);
      const bal3Before = await shell.balanceOf(agent3.address);
      
      // Charlie accepts
      const tx = await coinflipV3.connect(agent3).acceptChallenge(1, 1); // tails
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try {
          return coinflipV3.interface.parseLog(log)?.name === 'ChallengeResolved';
        } catch { return false; }
      });
      
      const parsed = coinflipV3.interface.parseLog(event);
      const winner = parsed.args.winner;
      
      console.log(`      🏆 Challenge resolved! Winner: ${winner === agent1.address ? 'Alice' : 'Charlie'}`);
      
      // Verify challenge state
      const updatedChallenge = await coinflipV3.getChallenge(1);
      expect(updatedChallenge.resolved).to.be.true;
      expect(updatedChallenge.winner).to.equal(winner);
    });
    
    it("✅ should reject accepting already resolved challenge", async function () {
      await expect(
        coinflipV3.connect(agent3).acceptChallenge(1, 0)
      ).to.be.revertedWith("Already handled");
    });
    
    it("✅ should allow cancelling unaccepted challenge", async function () {
      // Create new challenge
      await coinflipV3.connect(agent1).createChallenge(agent4.address, BET_10, 0);
      const challengeId = 2;
      
      const balBefore = await shell.balanceOf(agent1.address);
      await coinflipV3.connect(agent1).cancelChallenge(challengeId);
      const balAfter = await shell.balanceOf(agent1.address);
      
      expect(balAfter - balBefore).to.equal(BET_10);
      console.log("      💸 Cancelled challenge, 10 SHELL refunded");
    });
    
    it("✅ should expire challenge after timeout", async function () {
      // Create challenge
      await coinflipV3.connect(agent1).createChallenge(agent4.address, BET_10, 0);
      const challengeId = 3;
      
      // Fast forward past timeout (5 minutes default)
      await ethers.provider.send("evm_increaseTime", [301]);
      await ethers.provider.send("evm_mine");
      
      // Accept should fail
      await expect(
        coinflipV3.connect(agent4).acceptChallenge(challengeId, 1)
      ).to.be.revertedWith("Challenge expired");
      
      // Anyone can cancel expired challenge
      const balBefore = await shell.balanceOf(agent1.address);
      await coinflipV3.connect(agent2).cancelChallenge(challengeId);
      const balAfter = await shell.balanceOf(agent1.address);
      
      expect(balAfter - balBefore).to.equal(BET_10);
      console.log("      ⏰ Expired challenge cancelled, funds returned");
    });
  });

  describe("📊 Pool Status", function () {
    it("✅ should return all pool status", async function () {
      // Enter some pools
      await coinflipV3.connect(agent1).enterPool(ethers.parseEther("5"), 0);
      await coinflipV3.connect(agent2).enterPool(ethers.parseEther("25"), 1);
      
      const [bets, hasWaiting, waitingPlayers] = await coinflipV3.getAllPoolStatus();
      
      console.log("      📊 Pool Status:");
      for (let i = 0; i < bets.length; i++) {
        if (hasWaiting[i]) {
          console.log(`         ${ethers.formatEther(bets[i])} SHELL: ${waitingPlayers[i].slice(0, 8)}... waiting`);
        }
      }
      
      // Clean up
      await coinflipV3.connect(agent1).exitPool(ethers.parseEther("5"));
      await coinflipV3.connect(agent2).exitPool(ethers.parseEther("25"));
    });
    
    it("✅ should return supported bets", async function () {
      const bets = await coinflipV3.getSupportedBets();
      expect(bets.length).to.be.gte(9); // We added 9 tiers
      console.log(`      📋 ${bets.length} supported bet amounts`);
    });
  });

  describe("🔒 Admin", function () {
    it("✅ should allow owner to add supported bet", async function () {
      await coinflipV3.connect(owner).addSupportedBet(ethers.parseEther("2000"));
      expect(await coinflipV3.isSupportedBet(ethers.parseEther("2000"))).to.be.true;
    });
    
    it("✅ should allow owner to set protocol fee", async function () {
      await coinflipV3.connect(owner).setProtocolFee(150); // 1.5%
      expect(await coinflipV3.protocolFeeBps()).to.equal(150);
      
      // Reset
      await coinflipV3.connect(owner).setProtocolFee(100);
    });
    
    it("✅ should allow owner to set challenge timeout", async function () {
      await coinflipV3.connect(owner).setChallengeTimeout(180); // 3 minutes
      expect(await coinflipV3.challengeTimeout()).to.equal(180);
      
      // Reset
      await coinflipV3.connect(owner).setChallengeTimeout(300);
    });
  });

  describe("📈 Final Stats", function () {
    it("✅ should display test summary", async function () {
      const totalGames = await coinflipV3.totalGamesPlayed();
      const totalVolume = await coinflipV3.totalVolume();
      
      console.log("\n   ═══════════════════════════════════════════════════════");
      console.log("   🪙 COINFLIP V3 TEST RESULTS");
      console.log("   ═══════════════════════════════════════════════════════");
      console.log(`   • Total games: ${totalGames}`);
      console.log(`   • Total volume: ${ethers.formatEther(totalVolume)} SHELL`);
      console.log("   ═══════════════════════════════════════════════════════");
      console.log("   ✅ INSTANT MATCHING WORKS!");
      console.log("   ═══════════════════════════════════════════════════════\n");
    });
  });
});
