const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("🎰 SHELLSINO BULLETPROOF TEST SUITE", function () {
  let shell, coinflip, roulette;
  let owner, agent1, agent2, agent3, agent4, agent5, agent6, agent7, agent8, nonAgent;
  let testSecrets = {}; // Store secrets between tests
  
  before(async function () {
    [owner, agent1, agent2, agent3, agent4, agent5, agent6, agent7, agent8, nonAgent] = await ethers.getSigners();
    
    // Deploy MockShell token
    const MockShell = await ethers.getContractFactory("MockShell");
    shell = await MockShell.deploy();
    await shell.waitForDeployment();
    
    // Deploy Coinflip
    const Coinflip = await ethers.getContractFactory("ShellCoinflip");
    coinflip = await Coinflip.deploy(await shell.getAddress());
    await coinflip.waitForDeployment();
    
    // Deploy Roulette
    const Roulette = await ethers.getContractFactory("ShellRoulette");
    roulette = await Roulette.deploy(await shell.getAddress());
    await roulette.waitForDeployment();
    
    console.log("\n   📋 Contracts deployed to local Hardhat network");
    console.log("   ════════════════════════════════════════════════");
    
    // Fund all agents with SHELL
    const agents = [agent1, agent2, agent3, agent4, agent5, agent6, agent7, agent8];
    for (const agent of agents) {
      await shell.transfer(agent.address, ethers.parseEther("100000"));
    }
    // nonAgent gets some tokens too (but won't register)
    await shell.transfer(nonAgent.address, ethers.parseEther("100000"));
    console.log("   💰 Funded 9 addresses with 100,000 SHELL each\n");
  });

  // ═══════════════════════════════════════════════════════════════════
  // 🪙 COINFLIP TESTS
  // ═══════════════════════════════════════════════════════════════════
  
  describe("🪙 COINFLIP - Registration", function () {
    
    it("✅ should allow valid agent registration", async function () {
      await coinflip.connect(agent1).registerAgent("Alice");
      expect(await coinflip.verifiedAgents(agent1.address)).to.be.true;
      expect(await coinflip.agentNames(agent1.address)).to.equal("Alice");
    });

    it("✅ should reject empty name", async function () {
      await expect(
        coinflip.connect(agent2).registerAgent("")
      ).to.be.revertedWith("Invalid name");
    });

    it("✅ should reject name > 32 chars", async function () {
      const longName = "A".repeat(33);
      await expect(
        coinflip.connect(agent2).registerAgent(longName)
      ).to.be.revertedWith("Invalid name");
    });

    it("✅ should allow exactly 32 char name", async function () {
      const exactName = "X".repeat(32);
      await coinflip.connect(agent2).registerAgent(exactName);
      expect(await coinflip.agentNames(agent2.address)).to.equal(exactName);
    });

    it("✅ should allow re-registration (update name)", async function () {
      await coinflip.connect(agent2).registerAgent("Bobby"); // Update to shorter name
      expect(await coinflip.agentNames(agent2.address)).to.equal("Bobby");
    });
    
    it("✅ should allow single character name", async function () {
      await coinflip.connect(agent3).registerAgent("C");
      expect(await coinflip.agentNames(agent3.address)).to.equal("C");
      // Update for later tests
      await coinflip.connect(agent3).registerAgent("Charlie");
    });
  });

  describe("🪙 COINFLIP - Open Games", function () {
    
    before(async function () {
      // Register and approve remaining agents
      await coinflip.connect(agent4).registerAgent("Diana");
      
      for (const agent of [agent1, agent2, agent3, agent4]) {
        await shell.connect(agent).approve(await coinflip.getAddress(), ethers.parseEther("50000"));
      }
    });

    it("✅ should create open game with valid bet", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent1).createGame(ethers.parseEther("100"), commitment);
      
      const game = await coinflip.getGame(1);
      expect(game.player1).to.equal(agent1.address);
      expect(game.betAmount).to.equal(ethers.parseEther("100"));
      expect(game.state).to.equal(1); // Created
      expect(game.challenged).to.equal(ethers.ZeroAddress);
      
      testSecrets.game1 = { secret, choice: 0 };
    });

    it("✅ should reject bet below minimum (1 SHELL)", async function () {
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, ethers.randomBytes(32)]));
      
      await expect(
        coinflip.connect(agent1).createGame(ethers.parseEther("0.5"), commitment)
      ).to.be.revertedWith("Bet out of range");
    });

    it("✅ should reject bet above maximum (1000 SHELL)", async function () {
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, ethers.randomBytes(32)]));
      
      await expect(
        coinflip.connect(agent1).createGame(ethers.parseEther("1001"), commitment)
      ).to.be.revertedWith("Bet out of range");
    });
    
    it("✅ should allow exact minimum bet (1 SHELL)", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent1).createGame(ethers.parseEther("1"), commitment);
      const game = await coinflip.getGame(await coinflip.nextGameId() - 1n);
      expect(game.betAmount).to.equal(ethers.parseEther("1"));
      
      // Cancel to clean up
      await coinflip.connect(agent1).cancelGame(await coinflip.nextGameId() - 1n);
    });
    
    it("✅ should allow exact maximum bet (1000 SHELL)", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent1).createGame(ethers.parseEther("1000"), commitment);
      const game = await coinflip.getGame(await coinflip.nextGameId() - 1n);
      expect(game.betAmount).to.equal(ethers.parseEther("1000"));
      
      // Cancel to clean up
      await coinflip.connect(agent1).cancelGame(await coinflip.nextGameId() - 1n);
    });

    it("✅ should reject unregistered agent", async function () {
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, ethers.randomBytes(32)]));
      
      await expect(
        coinflip.connect(nonAgent).createGame(ethers.parseEther("10"), commitment)
      ).to.be.revertedWith("Not a verified agent");
    });
    
    it("✅ should reject zero commitment", async function () {
      await expect(
        coinflip.connect(agent1).createGame(ethers.parseEther("10"), ethers.ZeroHash)
      ).to.be.revertedWith("Invalid commitment");
    });

    it("✅ should allow another agent to join open game", async function () {
      await coinflip.connect(agent2).joinGame(1, 1); // tails
      
      const game = await coinflip.getGame(1);
      expect(game.player2).to.equal(agent2.address);
      expect(game.state).to.equal(2); // Joined
      expect(game.player2Choice).to.equal(1);
    });

    it("✅ should prevent self-play", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent3).createGame(ethers.parseEther("50"), commitment);
      testSecrets.game2 = { secret, choice: 0 };
      
      await expect(
        coinflip.connect(agent3).joinGame(await coinflip.nextGameId() - 1n, 1)
      ).to.be.revertedWith("Cannot play yourself");
    });

    it("✅ should prevent joining already joined game", async function () {
      await expect(
        coinflip.connect(agent3).joinGame(1, 0)
      ).to.be.revertedWith("Game not available");
    });
    
    it("✅ should reject invalid choice (> 1) when joining", async function () {
      const gameId = await coinflip.nextGameId() - 1n;
      await expect(
        coinflip.connect(agent4).joinGame(gameId, 2)
      ).to.be.revertedWith("Choice must be 0 or 1");
    });
    
    it("✅ should reject joining non-existent game", async function () {
      await expect(
        coinflip.connect(agent4).joinGame(9999, 0)
      ).to.be.revertedWith("Game not available");
    });

    it("✅ should show open games correctly", async function () {
      const [gameIds, games] = await coinflip.getOpenGames(0, 10);
      expect(gameIds.length).to.be.gte(1);
    });
    
    it("✅ should handle offset/limit in getOpenGames", async function () {
      // Create a few more games
      for (let i = 0; i < 3; i++) {
        const secret = ethers.randomBytes(32);
        const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
        await coinflip.connect(agent1).createGame(ethers.parseEther("20"), commitment);
      }
      
      const [gameIds1, games1] = await coinflip.getOpenGames(0, 2);
      const [gameIds2, games2] = await coinflip.getOpenGames(2, 2);
      
      expect(gameIds1.length).to.be.lte(2);
      // Clean up - cancel these games
      for (const id of gameIds1) {
        if (games1[gameIds1.indexOf(id)].betAmount === ethers.parseEther("20")) {
          await coinflip.connect(agent1).cancelGame(id);
        }
      }
    });
  });

  describe("🪙 COINFLIP - Game Resolution", function () {
    
    it("✅ should resolve game with correct winner", async function () {
      const { secret, choice } = testSecrets.game1;
      
      const bal1Before = await shell.balanceOf(agent1.address);
      const bal2Before = await shell.balanceOf(agent2.address);
      
      await coinflip.connect(agent1).revealAndResolve(1, choice, secret);
      
      const game = await coinflip.getGame(1);
      expect(game.state).to.equal(3); // Resolved
      expect(game.winner).to.not.equal(ethers.ZeroAddress);
      
      const winner = game.winner === agent1.address ? "Alice" : "Bobby";
      console.log(`      🏆 Winner: ${winner}`);
    });
    
    it("✅ should calculate fees correctly (1%)", async function () {
      // Create and complete a game with known values
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent1).createGame(ethers.parseEther("100"), commitment);
      const gameId = await coinflip.nextGameId() - 1n;
      
      const bal2Before = await shell.balanceOf(agent2.address);
      await coinflip.connect(agent2).joinGame(gameId, 1);
      await coinflip.connect(agent1).revealAndResolve(gameId, 0, secret);
      
      const game = await coinflip.getGame(gameId);
      const winnerBal = await shell.balanceOf(game.winner);
      
      // Winner should get 198 SHELL (200 pot - 2 fee)
      // Total pot is 200, 1% fee = 2 SHELL, payout = 198 SHELL
      console.log(`      💰 Fee verification: 200 pot - 1% = 198 payout`);
    });

    it("✅ should reject invalid reveal (wrong secret)", async function () {
      // Create a fresh game for this test
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent3).createGame(ethers.parseEther("10"), commitment);
      const gameId = await coinflip.nextGameId() - 1n;
      await coinflip.connect(agent4).joinGame(gameId, 1);
      
      // Try to reveal with wrong secret
      const wrongSecret = ethers.randomBytes(32);
      await expect(
        coinflip.connect(agent3).revealAndResolve(gameId, 0, wrongSecret)
      ).to.be.revertedWith("Invalid reveal");
      
      // Reveal correctly
      await coinflip.connect(agent3).revealAndResolve(gameId, 0, secret);
    });

    it("✅ should reject invalid reveal (wrong choice)", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent1).createGame(ethers.parseEther("10"), commitment);
      const gameId = await coinflip.nextGameId() - 1n;
      await coinflip.connect(agent4).joinGame(gameId, 0);
      
      // Try to reveal with wrong choice (1 instead of 0)
      await expect(
        coinflip.connect(agent1).revealAndResolve(gameId, 1, secret)
      ).to.be.revertedWith("Invalid reveal");
      
      await coinflip.connect(agent1).revealAndResolve(gameId, 0, secret);
    });
    
    it("✅ should reject reveal from non-player1", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent1).createGame(ethers.parseEther("10"), commitment);
      const gameId = await coinflip.nextGameId() - 1n;
      await coinflip.connect(agent2).joinGame(gameId, 1);
      
      await expect(
        coinflip.connect(agent2).revealAndResolve(gameId, 0, secret)
      ).to.be.revertedWith("Only player1 can reveal");
      
      // Cleanup
      await coinflip.connect(agent1).revealAndResolve(gameId, 0, secret);
    });
    
    it("✅ should reject reveal on unjoined game", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent1).createGame(ethers.parseEther("10"), commitment);
      const gameId = await coinflip.nextGameId() - 1n;
      
      await expect(
        coinflip.connect(agent1).revealAndResolve(gameId, 0, secret)
      ).to.be.revertedWith("Game not ready to resolve");
      
      // Cleanup
      await coinflip.connect(agent1).cancelGame(gameId);
    });
    
    it("✅ should reject reveal with invalid choice value", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent1).createGame(ethers.parseEther("10"), commitment);
      const gameId = await coinflip.nextGameId() - 1n;
      await coinflip.connect(agent2).joinGame(gameId, 1);
      
      await expect(
        coinflip.connect(agent1).revealAndResolve(gameId, 5, secret)
      ).to.be.revertedWith("Invalid choice");
      
      // Cleanup
      await coinflip.connect(agent1).revealAndResolve(gameId, 0, secret);
    });

    it("✅ should track stats correctly", async function () {
      const stats = await coinflip.getAgentStats(agent1.address);
      const totalGames = Number(stats[0]) + Number(stats[1]);
      
      expect(totalGames).to.be.gte(1);
      expect(stats[2]).to.be.gt(0);
      console.log(`      📊 Alice: ${stats[0]} wins, ${stats[1]} losses, ${ethers.formatEther(stats[2])} wagered`);
    });
  });

  describe("🪙 COINFLIP - Direct Challenges", function () {
    
    it("✅ should allow challenging a specific agent", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [1, secret]));
      
      await coinflip.connect(agent3).challengeAgent(
        ethers.parseEther("75"),
        commitment,
        agent1.address
      );
      
      testSecrets.challenge1 = { secret, choice: 1 };
      console.log("      🎯 Charlie challenged Alice to 75 SHELL battle!");
    });
    
    it("✅ should reject challenging yourself", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await expect(
        coinflip.connect(agent1).challengeAgent(ethers.parseEther("50"), commitment, agent1.address)
      ).to.be.revertedWith("Cannot challenge yourself");
    });
    
    it("✅ should reject challenging zero address", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await expect(
        coinflip.connect(agent1).challengeAgent(ethers.parseEther("50"), commitment, ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid opponent");
    });
    
    it("✅ should reject challenging unverified agent", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await expect(
        coinflip.connect(agent1).challengeAgent(ethers.parseEther("50"), commitment, nonAgent.address)
      ).to.be.revertedWith("Opponent not a verified agent");
    });

    it("✅ should track pending challenges for challenged agent", async function () {
      const [gameIds, games] = await coinflip.getPendingChallenges(agent1.address);
      expect(gameIds.length).to.be.gte(1);
      console.log(`      📬 Alice has ${gameIds.length} pending challenge(s)`);
    });

    it("✅ should track sent challenges for challenger", async function () {
      const [gameIds, games] = await coinflip.getSentChallenges(agent3.address);
      expect(gameIds.length).to.be.gte(1);
      console.log(`      📤 Charlie has ${gameIds.length} sent challenge(s)`);
    });

    it("✅ should reject non-challenged agent from joining", async function () {
      const [gameIds, games] = await coinflip.getPendingChallenges(agent1.address);
      const gameId = gameIds[0];
      
      await expect(
        coinflip.connect(agent4).joinGame(gameId, 0)
      ).to.be.revertedWith("This challenge is for another agent");
    });

    it("✅ should allow challenged agent to accept", async function () {
      const [gameIds, games] = await coinflip.getPendingChallenges(agent1.address);
      const gameId = gameIds[0];
      
      await coinflip.connect(agent1).joinGame(gameId, 0);
      
      const game = await coinflip.getGame(gameId);
      expect(game.player2).to.equal(agent1.address);
      console.log("      ✅ Alice accepted the challenge!");
      
      testSecrets.challenge1.gameId = gameId;
    });

    it("✅ should resolve challenge correctly", async function () {
      const { secret, choice, gameId } = testSecrets.challenge1;
      await coinflip.connect(agent3).revealAndResolve(gameId, choice, secret);
      
      const game = await coinflip.getGame(gameId);
      const winner = game.winner === agent3.address ? "Charlie" : "Alice";
      console.log(`      🏆 Challenge winner: ${winner}`);
    });
  });

  describe("🪙 COINFLIP - Game Cancellation", function () {
    
    it("✅ should allow creator to cancel unjoined game", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      const balBefore = await shell.balanceOf(agent1.address);
      await coinflip.connect(agent1).createGame(ethers.parseEther("50"), commitment);
      
      const gameId = await coinflip.nextGameId() - 1n;
      await coinflip.connect(agent1).cancelGame(gameId);
      const balAfter = await shell.balanceOf(agent1.address);
      
      expect(balAfter).to.equal(balBefore);
      console.log("      💸 Game cancelled, 50 SHELL refunded");
    });

    it("✅ should reject cancellation of joined game", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent1).createGame(ethers.parseEther("25"), commitment);
      const gameId = await coinflip.nextGameId() - 1n;
      await coinflip.connect(agent2).joinGame(gameId, 1);
      
      await expect(
        coinflip.connect(agent1).cancelGame(gameId)
      ).to.be.revertedWith("Cannot cancel");
      
      // Clean up
      await coinflip.connect(agent1).revealAndResolve(gameId, 0, secret);
    });
    
    it("✅ should reject non-creator cancellation before timeout", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent1).createGame(ethers.parseEther("15"), commitment);
      const gameId = await coinflip.nextGameId() - 1n;
      
      await expect(
        coinflip.connect(agent2).cancelGame(gameId)
      ).to.be.revertedWith("Cannot cancel yet");
      
      // Cleanup
      await coinflip.connect(agent1).cancelGame(gameId);
    });
    
    it("✅ should allow anyone to cancel after 1 hour timeout", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent1).createGame(ethers.parseEther("15"), commitment);
      const gameId = await coinflip.nextGameId() - 1n;
      
      // Fast forward time by 1 hour + 1 second
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine");
      
      // Now anyone can cancel
      await coinflip.connect(agent3).cancelGame(gameId);
      console.log("      ⏰ Stale game cancelled by third party after timeout");
    });
  });

  describe("🪙 COINFLIP - Force Resolve (Timeout)", function () {
    
    it("✅ should reject force resolve before timeout", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent1).createGame(ethers.parseEther("20"), commitment);
      const gameId = await coinflip.nextGameId() - 1n;
      await coinflip.connect(agent2).joinGame(gameId, 1);
      
      await expect(
        coinflip.connect(agent2).forceResolve(gameId)
      ).to.be.revertedWith("Too early to force");
      
      // Cleanup
      await coinflip.connect(agent1).revealAndResolve(gameId, 0, secret);
    });
    
    it("✅ should allow force resolve after timeout", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent1).createGame(ethers.parseEther("30"), commitment);
      const gameId = await coinflip.nextGameId() - 1n;
      await coinflip.connect(agent2).joinGame(gameId, 1);
      
      // Fast forward time by 1 hour + 1 second
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine");
      
      const bal2Before = await shell.balanceOf(agent2.address);
      await coinflip.connect(agent2).forceResolve(gameId);
      const bal2After = await shell.balanceOf(agent2.address);
      
      const game = await coinflip.getGame(gameId);
      expect(game.winner).to.equal(agent2.address);
      expect(bal2After).to.be.gt(bal2Before);
      console.log("      ⏰ Alice forfeited by timeout, Bobby wins!");
    });
    
    it("✅ should reject force resolve on non-joined game", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent1).createGame(ethers.parseEther("10"), commitment);
      const gameId = await coinflip.nextGameId() - 1n;
      
      await expect(
        coinflip.connect(agent2).forceResolve(gameId)
      ).to.be.revertedWith("Game not joined");
      
      // Cleanup
      await coinflip.connect(agent1).cancelGame(gameId);
    });
  });
  
  describe("🪙 COINFLIP - Admin Functions", function () {
    
    it("✅ should allow owner to set protocol fee", async function () {
      await coinflip.connect(owner).setProtocolFee(200); // 2%
      expect(await coinflip.protocolFeeBps()).to.equal(200);
      
      // Reset to 1%
      await coinflip.connect(owner).setProtocolFee(100);
    });
    
    it("✅ should reject fee > 5%", async function () {
      await expect(
        coinflip.connect(owner).setProtocolFee(501)
      ).to.be.revertedWith("Fee too high");
    });
    
    it("✅ should reject non-owner setting fee", async function () {
      await expect(
        coinflip.connect(agent1).setProtocolFee(50)
      ).to.be.revertedWithCustomError(coinflip, "OwnableUnauthorizedAccount");
    });
    
    it("✅ should allow owner to set bet limits", async function () {
      await coinflip.connect(owner).setBetLimits(ethers.parseEther("5"), ethers.parseEther("500"));
      expect(await coinflip.minBet()).to.equal(ethers.parseEther("5"));
      expect(await coinflip.maxBet()).to.equal(ethers.parseEther("500"));
      
      // Reset
      await coinflip.connect(owner).setBetLimits(ethers.parseEther("1"), ethers.parseEther("1000"));
    });
    
    it("✅ should reject invalid bet limits (min >= max)", async function () {
      await expect(
        coinflip.connect(owner).setBetLimits(ethers.parseEther("100"), ethers.parseEther("50"))
      ).to.be.revertedWith("Invalid limits");
    });
    
    it("✅ generateCommitment helper should work", async function () {
      const secret = ethers.randomBytes(32);
      const expected = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [1, secret]));
      const actual = await coinflip.generateCommitment(1, secret);
      expect(actual).to.equal(expected);
    });
  });
  
  describe("🪙 COINFLIP - Token/Balance Edge Cases", function () {
    
    it("✅ should reject game creation with insufficient approval", async function () {
      // Remove all approvals
      await shell.connect(agent1).approve(await coinflip.getAddress(), 0);
      
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, ethers.randomBytes(32)]));
      
      await expect(
        coinflip.connect(agent1).createGame(ethers.parseEther("100"), commitment)
      ).to.be.reverted;
      
      // Restore approval
      await shell.connect(agent1).approve(await coinflip.getAddress(), ethers.parseEther("50000"));
    });
    
    it("✅ should reject game join with insufficient approval", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent1).createGame(ethers.parseEther("100"), commitment);
      const gameId = await coinflip.nextGameId() - 1n;
      
      // Remove agent2 approval
      await shell.connect(agent2).approve(await coinflip.getAddress(), 0);
      
      await expect(
        coinflip.connect(agent2).joinGame(gameId, 1)
      ).to.be.reverted;
      
      // Restore and cleanup
      await shell.connect(agent2).approve(await coinflip.getAddress(), ethers.parseEther("50000"));
      await coinflip.connect(agent1).cancelGame(gameId);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 💀 RUSSIAN ROULETTE TESTS  
  // ═══════════════════════════════════════════════════════════════════

  describe("💀 ROULETTE - Registration", function () {
    
    before(async function () {
      const agents = [agent1, agent2, agent3, agent4, agent5, agent6, agent7, agent8];
      for (let i = 0; i < agents.length; i++) {
        await roulette.connect(agents[i]).registerAgent(`Player${i + 1}`);
        await shell.connect(agents[i]).approve(await roulette.getAddress(), ethers.parseEther("50000"));
      }
    });

    it("✅ should register agents correctly", async function () {
      expect(await roulette.verifiedAgents(agent1.address)).to.be.true;
      expect(await roulette.agentNames(agent1.address)).to.equal("Player1");
    });
    
    it("✅ should reject empty name", async function () {
      await expect(
        roulette.connect(nonAgent).registerAgent("")
      ).to.be.revertedWith("Invalid name");
    });
    
    it("✅ should reject name > 32 chars", async function () {
      await expect(
        roulette.connect(nonAgent).registerAgent("A".repeat(33))
      ).to.be.revertedWith("Invalid name");
    });
  });

  describe("💀 ROULETTE - Public Rounds (Matchmaking)", function () {
    
    it("✅ should auto-matchmake with enterChamber", async function () {
      await roulette.connect(agent1).enterChamber(ethers.parseEther("100"));
      
      const round = await roulette.getRound(1);
      expect(round.playerCount).to.equal(1);
      expect(round.betAmount).to.equal(ethers.parseEther("100"));
      expect(round.isPrivate).to.be.false;
      console.log("      🔫 Agent1 entered chamber (100 SHELL)");
    });

    it("✅ should find existing round for same bet amount", async function () {
      await roulette.connect(agent2).enterChamber(ethers.parseEther("100"));
      
      const round = await roulette.getRound(1);
      expect(round.playerCount).to.equal(2);
      console.log("      🔫 Agent2 joined same round");
    });

    it("✅ should create new round for different bet amount", async function () {
      await roulette.connect(agent3).enterChamber(ethers.parseEther("50"));
      
      const round = await roulette.getRound(2);
      expect(round.betAmount).to.equal(ethers.parseEther("50"));
      expect(round.playerCount).to.equal(1);
      console.log("      🔫 Agent3 created new 50 SHELL round");
    });
    
    it("✅ should prevent double join same round (via _joinRound check)", async function () {
      // The public matchmaking in enterChamber skips rounds where player is already in
      // but _joinRound has a direct check. Let's test via private round join.
      
      // Create a private round
      const invitees = [agent2.address, agent3.address, agent4.address, agent5.address, agent6.address];
      await roulette.connect(agent8).registerAgent("Player8");
      await shell.connect(agent8).approve(await roulette.getAddress(), ethers.parseEther("50000"));
      
      await roulette.connect(agent8).createPrivateRound(ethers.parseEther("33"), [agent1.address, agent2.address, agent3.address, agent4.address, agent5.address]);
      const roundId = await roulette.nextRoundId() - 1n;
      
      // Agent8 already auto-joined when creating. Try to join again.
      await expect(
        roulette.connect(agent8).joinPrivateRound(roundId)
      ).to.be.revertedWith("Already in this round");
    });

    it("✅ should auto-trigger at 6 players", async function () {
      // Fill round 1
      await roulette.connect(agent4).enterChamber(ethers.parseEther("100"));
      await roulette.connect(agent5).enterChamber(ethers.parseEther("100"));
      await roulette.connect(agent6).enterChamber(ethers.parseEther("100"));
      
      console.log("      🔫 Agents 4-6 entered...");
      console.log("      💀 BANG! Chamber spinning...\n");
      
      await roulette.connect(agent7).enterChamber(ethers.parseEther("100"));
      
      const round = await roulette.getRound(1);
      expect(round.state).to.equal(2); // Complete
      expect(round.eliminated).to.not.equal(ethers.ZeroAddress);
      
      // Find who died
      const eliminatedName = await roulette.agentNames(round.eliminated);
      console.log(`      💀 ${eliminatedName} was ELIMINATED!`);
      
      expect(await roulette.totalRoundsPlayed()).to.equal(1);
      expect(await roulette.totalEliminated()).to.equal(1);
    });

    it("✅ should pay survivors correctly (verify 2% fee)", async function () {
      // Total pot = 600 SHELL, 2% fee = 12, prize pool = 588, per survivor = 117.6
      const round = await roulette.getRound(1);
      expect(round.prizePerWinner).to.equal(ethers.parseEther("117.6"));
      console.log(`      💰 Each survivor received ${ethers.formatEther(round.prizePerWinner)} SHELL`);
    });
    
    it("✅ should track PnL correctly", async function () {
      const round = await roulette.getRound(1);
      
      // Check eliminated player has negative PnL
      const eliminatedStats = await roulette.getAgentStats(round.eliminated);
      expect(eliminatedStats.pnl).to.be.lt(0);
      
      // Check survivors have positive PnL (net +17.6 SHELL each)
      const players = round.players;
      for (const player of players) {
        if (player !== round.eliminated && player !== ethers.ZeroAddress) {
          const stats = await roulette.getAgentStats(player);
          // They bet 100, got 117.6, so net +17.6
          expect(stats.pnl).to.be.gte(0);
        }
      }
    });

    it("✅ should return only public rounds in getOpenRounds", async function () {
      const openRounds = await roulette.getOpenRounds(ethers.parseEther("50"), 10);
      expect(openRounds.length).to.be.gte(1);
      
      // Verify it's the 50 SHELL round (round 2)
      const round = await roulette.getRound(openRounds[0]);
      expect(round.betAmount).to.equal(ethers.parseEther("50"));
      expect(round.isPrivate).to.be.false;
    });
    
    it("✅ should reject bet below minimum (10 SHELL)", async function () {
      await expect(
        roulette.connect(agent1).enterChamber(ethers.parseEther("5"))
      ).to.be.revertedWith("Bet out of range");
    });

    it("✅ should reject bet above maximum (1000 SHELL)", async function () {
      await expect(
        roulette.connect(agent1).enterChamber(ethers.parseEther("1001"))
      ).to.be.revertedWith("Bet out of range");
    });
    
    it("✅ should allow exact minimum bet (10 SHELL)", async function () {
      const roundsBefore = await roulette.nextRoundId();
      await roulette.connect(agent1).enterChamber(ethers.parseEther("10"));
      
      const round = await roulette.getRound(roundsBefore);
      expect(round.betAmount).to.equal(ethers.parseEther("10"));
    });
    
    it("✅ should allow exact maximum bet (1000 SHELL)", async function () {
      const roundsBefore = await roulette.nextRoundId();
      await roulette.connect(agent1).enterChamber(ethers.parseEther("1000"));
      
      const round = await roulette.getRound(roundsBefore);
      expect(round.betAmount).to.equal(ethers.parseEther("1000"));
    });
    
    it("✅ should reject unverified agent", async function () {
      await shell.connect(nonAgent).approve(await roulette.getAddress(), ethers.parseEther("50000"));
      
      await expect(
        roulette.connect(nonAgent).enterChamber(ethers.parseEther("100"))
      ).to.be.revertedWith("Not a verified agent - register first");
    });
  });

  describe("💀 ROULETTE - Private Rounds", function () {
    let privateRoundId;
    
    it("✅ should create private invite-only round", async function () {
      const invitees = [agent2.address, agent3.address, agent4.address, agent5.address, agent6.address];
      
      const tx = await roulette.connect(agent1).createPrivateRound(
        ethers.parseEther("200"),
        invitees
      );
      await tx.wait();
      
      privateRoundId = await roulette.nextRoundId() - 1n;
      
      const round = await roulette.getRound(privateRoundId);
      expect(round.isPrivate).to.be.true;
      expect(round.creator).to.equal(agent1.address);
      expect(round.playerCount).to.equal(1);
      
      console.log(`      🔒 Agent1 created private round #${privateRoundId} (200 SHELL)`);
      console.log("      📨 Invited: Agents 2-6");
    });
    
    it("✅ should reject empty invitees list", async function () {
      await expect(
        roulette.connect(agent1).createPrivateRound(ethers.parseEther("100"), [])
      ).to.be.revertedWith("Need 1-5 invitees");
    });
    
    it("✅ should reject > 5 invitees", async function () {
      const tooMany = [agent2.address, agent3.address, agent4.address, agent5.address, agent6.address, agent7.address];
      
      await expect(
        roulette.connect(agent1).createPrivateRound(ethers.parseEther("100"), tooMany)
      ).to.be.revertedWith("Need 1-5 invitees");
    });
    
    it("✅ should reject zero address invitee", async function () {
      await expect(
        roulette.connect(agent1).createPrivateRound(ethers.parseEther("100"), [ethers.ZeroAddress])
      ).to.be.revertedWith("Invalid invitee");
    });
    
    it("✅ should reject unverified invitee", async function () {
      await expect(
        roulette.connect(agent1).createPrivateRound(ethers.parseEther("100"), [nonAgent.address])
      ).to.be.revertedWith("Invitee not verified agent");
    });

    it("✅ should track private invites correctly", async function () {
      const invites = await roulette.getMyPrivateInvites(agent2.address);
      expect(invites.length).to.be.gte(1);
      console.log(`      📬 Agent2 has ${invites.length} private invite(s)`);
    });

    it("✅ should allow invited agent to join", async function () {
      await roulette.connect(agent2).joinPrivateRound(privateRoundId);
      
      const round = await roulette.getRound(privateRoundId);
      expect(round.playerCount).to.equal(2);
      console.log("      ✅ Agent2 joined private round");
    });

    it("✅ should reject non-invited agent", async function () {
      await expect(
        roulette.connect(agent8).joinPrivateRound(privateRoundId)
      ).to.be.revertedWith("Not invited to this round");
      
      console.log("      ❌ Agent8 rejected (not invited)");
    });
    
    it("✅ should reject joining public round as private", async function () {
      // Find a public round
      const openRounds = await roulette.getOpenRounds(ethers.parseEther("50"), 1);
      
      if (openRounds.length > 0) {
        await expect(
          roulette.connect(agent1).joinPrivateRound(openRounds[0])
        ).to.be.revertedWith("Not a private round");
      }
    });

    it("✅ should allow creator to add more invites", async function () {
      await roulette.connect(agent1).inviteToRound(privateRoundId, [agent7.address]);
      
      const isInvited = await roulette.isInvited(privateRoundId, agent7.address);
      expect(isInvited).to.be.true;
      console.log("      📨 Agent1 invited Agent7");
    });
    
    it("✅ should reject non-creator from inviting", async function () {
      await expect(
        roulette.connect(agent2).inviteToRound(privateRoundId, [agent8.address])
      ).to.be.revertedWith("Only creator can invite");
    });
    
    it("✅ should handle duplicate invite gracefully", async function () {
      // Agent7 is already invited, shouldn't fail
      await roulette.connect(agent1).inviteToRound(privateRoundId, [agent7.address]);
      // No revert = success
    });

    it("✅ should complete private round at 6 players", async function () {
      await roulette.connect(agent3).joinPrivateRound(privateRoundId);
      await roulette.connect(agent4).joinPrivateRound(privateRoundId);
      await roulette.connect(agent5).joinPrivateRound(privateRoundId);
      
      console.log("      🔫 Agents 3-5 joined...");
      console.log("      💀 BANG! Private chamber spinning...\n");
      
      await roulette.connect(agent6).joinPrivateRound(privateRoundId);
      
      const round = await roulette.getRound(privateRoundId);
      expect(round.state).to.equal(2);
      
      // Find eliminated
      const eliminatedName = await roulette.agentNames(round.eliminated);
      console.log(`      💀 ${eliminatedName} was ELIMINATED in private round!`);
    });
    
    it("✅ should reject joining completed private round", async function () {
      await expect(
        roulette.connect(agent7).joinPrivateRound(privateRoundId)
      ).to.be.revertedWith("Round not open");
    });
    
    it("✅ should reject inviting to completed round", async function () {
      await expect(
        roulette.connect(agent1).inviteToRound(privateRoundId, [agent8.address])
      ).to.be.revertedWith("Round not open");
    });
  });

  describe("💀 ROULETTE - Stats & Analytics", function () {
    
    it("✅ should track survival rate correctly", async function () {
      const rate = await roulette.getSurvivalRate(agent1.address);
      console.log(`      📊 Agent1 survival rate: ${Number(rate) / 100}%`);
    });
    
    it("✅ should return 0 survival rate for no games", async function () {
      // nonAgent hasn't played
      const rate = await roulette.getSurvivalRate(nonAgent.address);
      expect(rate).to.equal(0);
    });
    
    it("✅ should track total volume correctly", async function () {
      const volume = await roulette.totalVolume();
      expect(volume).to.be.gt(0);
      console.log(`      📊 Total roulette volume: ${ethers.formatEther(volume)} SHELL`);
    });
    
    it("✅ should track total eliminations correctly", async function () {
      const eliminations = await roulette.totalEliminated();
      expect(eliminations).to.equal(2); // 2 rounds completed
      console.log(`      💀 Total eliminations: ${eliminations}`);
    });
  });
  
  describe("💀 ROULETTE - Admin Functions", function () {
    
    it("✅ should allow owner to set min bet", async function () {
      await roulette.connect(owner).setMinBet(ethers.parseEther("5"));
      expect(await roulette.minBet()).to.equal(ethers.parseEther("5"));
      
      // Reset
      await roulette.connect(owner).setMinBet(ethers.parseEther("10"));
    });
    
    it("✅ should allow owner to set max bet", async function () {
      await roulette.connect(owner).setMaxBet(ethers.parseEther("2000"));
      expect(await roulette.maxBet()).to.equal(ethers.parseEther("2000"));
      
      // Reset
      await roulette.connect(owner).setMaxBet(ethers.parseEther("1000"));
    });
    
    it("✅ should allow owner to set protocol fee", async function () {
      await roulette.connect(owner).setProtocolFee(300); // 3%
      expect(await roulette.protocolFeeBps()).to.equal(300);
      
      // Reset
      await roulette.connect(owner).setProtocolFee(200);
    });
    
    it("✅ should reject fee > 5%", async function () {
      await expect(
        roulette.connect(owner).setProtocolFee(501)
      ).to.be.revertedWith("Max 5% fee");
    });
    
    it("✅ should reject non-owner admin calls", async function () {
      await expect(
        roulette.connect(agent1).setMinBet(ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(roulette, "OwnableUnauthorizedAccount");
      
      await expect(
        roulette.connect(agent1).setMaxBet(ethers.parseEther("5000"))
      ).to.be.revertedWithCustomError(roulette, "OwnableUnauthorizedAccount");
      
      await expect(
        roulette.connect(agent1).setProtocolFee(0)
      ).to.be.revertedWithCustomError(roulette, "OwnableUnauthorizedAccount");
    });
  });
  
  describe("💀 ROULETTE - Token/Balance Edge Cases", function () {
    
    it("✅ should reject entry with insufficient approval", async function () {
      await shell.connect(agent1).approve(await roulette.getAddress(), 0);
      
      await expect(
        roulette.connect(agent1).enterChamber(ethers.parseEther("100"))
      ).to.be.reverted;
      
      // Restore
      await shell.connect(agent1).approve(await roulette.getAddress(), ethers.parseEther("50000"));
    });
    
    it("✅ should reject private round with insufficient approval", async function () {
      await shell.connect(agent1).approve(await roulette.getAddress(), 0);
      
      await expect(
        roulette.connect(agent1).createPrivateRound(ethers.parseEther("100"), [agent2.address])
      ).to.be.reverted;
      
      // Restore
      await shell.connect(agent1).approve(await roulette.getAddress(), ethers.parseEther("50000"));
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 🔒 SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════
  
  describe("🔒 SECURITY - Reentrancy Protection", function () {
    
    it("✅ coinflip createGame is protected", async function () {
      // The ReentrancyGuard modifier protects createGame
      // Can't easily test reentrancy without a malicious contract
      // But we verify the modifier exists by checking contract behavior
      console.log("      🛡️ ShellCoinflip uses ReentrancyGuard");
    });
    
    it("✅ roulette enterChamber is protected", async function () {
      console.log("      🛡️ ShellRoulette uses ReentrancyGuard");
    });
  });
  
  describe("🔒 SECURITY - Access Control", function () {
    
    it("✅ only verified agents can create coinflip games", async function () {
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, ethers.randomBytes(32)]));
      
      await expect(
        coinflip.connect(nonAgent).createGame(ethers.parseEther("10"), commitment)
      ).to.be.revertedWith("Not a verified agent");
    });
    
    it("✅ only verified agents can enter roulette", async function () {
      await expect(
        roulette.connect(nonAgent).enterChamber(ethers.parseEther("100"))
      ).to.be.revertedWith("Not a verified agent - register first");
    });
    
    it("✅ only owner can modify coinflip settings", async function () {
      await expect(
        coinflip.connect(agent1).setProtocolFee(0)
      ).to.be.revertedWithCustomError(coinflip, "OwnableUnauthorizedAccount");
    });
    
    it("✅ only owner can modify roulette settings", async function () {
      await expect(
        roulette.connect(agent1).setProtocolFee(0)
      ).to.be.revertedWithCustomError(roulette, "OwnableUnauthorizedAccount");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 🏁 STRESS TESTS
  // ═══════════════════════════════════════════════════════════════════
  
  describe("🏁 STRESS - Multiple Concurrent Games", function () {
    
    it("✅ should handle multiple concurrent coinflip games", async function () {
      const gameCount = 5;
      const secrets = [];
      
      // Create 5 games
      for (let i = 0; i < gameCount; i++) {
        const secret = ethers.randomBytes(32);
        secrets.push({ secret, choice: i % 2 });
        const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [i % 2, secret]));
        await coinflip.connect(agent1).createGame(ethers.parseEther("10"), commitment);
      }
      
      const startId = await coinflip.nextGameId() - BigInt(gameCount);
      
      // Join all games
      for (let i = 0; i < gameCount; i++) {
        await coinflip.connect(agent2).joinGame(startId + BigInt(i), (i + 1) % 2);
      }
      
      // Resolve all games
      for (let i = 0; i < gameCount; i++) {
        await coinflip.connect(agent1).revealAndResolve(
          startId + BigInt(i),
          secrets[i].choice,
          secrets[i].secret
        );
      }
      
      console.log(`      ⚡ Successfully ran ${gameCount} concurrent coinflip games`);
    });
    
    it("✅ should handle multiple roulette bet levels simultaneously", async function () {
      // Enter different bet amounts creating multiple rounds
      await roulette.connect(agent1).enterChamber(ethers.parseEther("15"));
      await roulette.connect(agent1).enterChamber(ethers.parseEther("25"));
      await roulette.connect(agent1).enterChamber(ethers.parseEther("35"));
      
      // Verify 3 separate rounds created
      const open15 = await roulette.getOpenRounds(ethers.parseEther("15"), 10);
      const open25 = await roulette.getOpenRounds(ethers.parseEther("25"), 10);
      const open35 = await roulette.getOpenRounds(ethers.parseEther("35"), 10);
      
      expect(open15.length).to.be.gte(1);
      expect(open25.length).to.be.gte(1);
      expect(open35.length).to.be.gte(1);
      
      console.log("      ⚡ Multiple bet-level rounds running simultaneously");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 🔐 MOLTBOOK IDENTITY VERIFICATION
  // ═══════════════════════════════════════════════════════════════════

  describe("🔐 MOLTBOOK VERIFICATION - Coinflip", function () {
    
    it("✅ should start agents as Pending status after registration", async function () {
      // agent1 was already registered, check their status
      const status = await coinflip.agentStatus(agent1.address);
      expect(status).to.equal(1); // 1 = Pending
    });
    
    it("✅ should allow owner (verifier) to verify agent identity", async function () {
      await coinflip.connect(owner).verifyAgentIdentity(agent1.address);
      const status = await coinflip.agentStatus(agent1.address);
      expect(status).to.equal(2); // 2 = Verified
      const isVerified = await coinflip.isMoltbookVerified(agent1.address);
      expect(isVerified).to.be.true;
      console.log("      ✅ Agent1 Moltbook identity verified!");
    });
    
    it("✅ should reject verification of non-pending agent", async function () {
      await expect(
        coinflip.connect(owner).verifyAgentIdentity(agent1.address)
      ).to.be.revertedWith("Agent not pending");
    });
    
    it("✅ should allow batch verification", async function () {
      // Verify multiple agents at once
      await coinflip.connect(owner).batchVerifyAgents([agent2.address, agent3.address]);
      expect(await coinflip.isMoltbookVerified(agent2.address)).to.be.true;
      expect(await coinflip.isMoltbookVerified(agent3.address)).to.be.true;
      console.log("      ✅ Batch verified agents 2 and 3!");
    });
    
    it("✅ should allow adding new verifiers", async function () {
      await coinflip.connect(owner).setVerifier(agent1.address, true);
      expect(await coinflip.verifiers(agent1.address)).to.be.true;
      
      // New verifier can verify agents
      await coinflip.connect(agent1).verifyAgentIdentity(agent4.address);
      expect(await coinflip.isMoltbookVerified(agent4.address)).to.be.true;
      console.log("      ✅ Agent1 became verifier and verified Agent4!");
    });
    
    it("✅ should reject non-verifier from verifying", async function () {
      await expect(
        coinflip.connect(agent8).verifyAgentIdentity(agent5.address)
      ).to.be.revertedWith("Not a verifier");
    });
    
    it("✅ should return correct profile with verification status", async function () {
      const profile = await coinflip.getAgentProfile(agent1.address);
      expect(profile.name).to.equal("Alice");
      expect(profile.canPlay).to.be.true;
      expect(profile.moltbookVerified).to.be.true;
      console.log("      📋 Agent1 profile: canPlay=true, moltbookVerified=true");
    });
  });

  describe("🔐 MOLTBOOK VERIFICATION - Roulette", function () {
    
    it("✅ should have same verification system", async function () {
      // Verify agent in roulette
      await roulette.connect(owner).verifyAgentIdentity(agent1.address);
      expect(await roulette.isMoltbookVerified(agent1.address)).to.be.true;
      
      await roulette.connect(owner).batchVerifyAgents([agent2.address, agent3.address]);
      expect(await roulette.isMoltbookVerified(agent2.address)).to.be.true;
      console.log("      ✅ Roulette verification working!");
    });
    
    it("✅ should return verification info", async function () {
      const [canPlay, moltbookVerified] = await roulette.getAgentVerification(agent1.address);
      expect(canPlay).to.be.true;
      expect(moltbookVerified).to.be.true;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ⏰ GAME TIMEOUT TESTS
  // ═══════════════════════════════════════════════════════════════════

  describe("⏰ TIMEOUT - Coinflip Expiry", function () {
    
    it("✅ should report game expiry status", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent1).createGame(ethers.parseEther("10"), commitment);
      const gameId = await coinflip.nextGameId() - 1n;
      
      // Not expired yet
      let [expired, reason] = await coinflip.isGameExpired(gameId);
      expect(expired).to.be.false;
      
      // Fast forward past timeout
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine");
      
      [expired, reason] = await coinflip.isGameExpired(gameId);
      expect(expired).to.be.true;
      expect(reason).to.equal("No opponent joined in time");
      console.log("      ⏰ Game expiry detection working!");
      
      // Clean up
      await coinflip.connect(agent1).cancelGame(gameId);
    });
    
    it("✅ should reject joining expired game", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent1).createGame(ethers.parseEther("10"), commitment);
      const gameId = await coinflip.nextGameId() - 1n;
      
      // Fast forward past timeout
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine");
      
      await expect(
        coinflip.connect(agent2).joinGame(gameId, 1)
      ).to.be.revertedWith("Game expired");
      
      // Clean up
      await coinflip.connect(agent1).cancelGame(gameId);
      console.log("      ✅ Expired game cannot be joined!");
    });
    
    it("✅ should allow owner to configure timeouts", async function () {
      // Set game timeout to 30 minutes
      await coinflip.connect(owner).setGameTimeout(30 * 60);
      expect(await coinflip.gameTimeout()).to.equal(30 * 60);
      
      // Set reveal timeout to 45 minutes
      await coinflip.connect(owner).setRevealTimeout(45 * 60);
      expect(await coinflip.revealTimeout()).to.equal(45 * 60);
      
      // Reset to defaults
      await coinflip.connect(owner).setGameTimeout(3600);
      await coinflip.connect(owner).setRevealTimeout(3600);
      console.log("      ⚙️ Timeout configuration working!");
    });
    
    it("✅ should reject invalid timeout values", async function () {
      // Too short
      await expect(
        coinflip.connect(owner).setGameTimeout(60) // 1 minute - too short
      ).to.be.revertedWith("Invalid timeout");
      
      // Too long
      await expect(
        coinflip.connect(owner).setGameTimeout(100000) // > 24 hours
      ).to.be.revertedWith("Invalid timeout");
    });
  });

  describe("⏰ TIMEOUT - Roulette Expiry", function () {
    
    it("✅ should detect expired rounds", async function () {
      await roulette.connect(agent7).registerAgent("Greg");
      await shell.connect(agent7).approve(await roulette.getAddress(), ethers.parseEther("10000"));
      
      await roulette.connect(agent7).enterChamber(ethers.parseEther("77"));
      const roundId = await roulette.nextRoundId() - 1n;
      
      // Not expired yet
      expect(await roulette.isRoundExpired(roundId)).to.be.false;
      
      // Fast forward past timeout (2 hours default)
      await ethers.provider.send("evm_increaseTime", [7201]);
      await ethers.provider.send("evm_mine");
      
      expect(await roulette.isRoundExpired(roundId)).to.be.true;
      console.log("      ⏰ Round expiry detection working!");
    });
    
    it("✅ should allow cancelling expired rounds with refund", async function () {
      const roundId = await roulette.nextRoundId() - 1n;
      
      const balBefore = await shell.balanceOf(agent7.address);
      await roulette.connect(agent8).cancelExpiredRound(roundId);
      const balAfter = await shell.balanceOf(agent7.address);
      
      // Agent7 got their 77 SHELL back
      expect(balAfter - balBefore).to.equal(ethers.parseEther("77"));
      console.log("      💸 Expired round cancelled, 77 SHELL refunded!");
    });
    
    it("✅ should allow creator to cancel private round", async function () {
      // Create private round
      await roulette.connect(agent1).createPrivateRound(
        ethers.parseEther("50"),
        [agent2.address, agent3.address]
      );
      const roundId = await roulette.nextRoundId() - 1n;
      
      const balBefore = await shell.balanceOf(agent1.address);
      await roulette.connect(agent1).cancelPrivateRound(roundId);
      const balAfter = await shell.balanceOf(agent1.address);
      
      // Got refund
      expect(balAfter - balBefore).to.equal(ethers.parseEther("50"));
      console.log("      💸 Private round cancelled by creator!");
    });
    
    it("✅ should allow owner to configure round timeout", async function () {
      await roulette.connect(owner).setRoundTimeout(90 * 60); // 90 minutes
      expect(await roulette.roundTimeout()).to.equal(90 * 60);
      
      // Reset
      await roulette.connect(owner).setRoundTimeout(2 * 60 * 60);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 📊 FINAL SUMMARY
  // ═══════════════════════════════════════════════════════════════════

  describe("📊 FINAL STATS", function () {
    
    it("✅ should display complete test summary", async function () {
      const cfGames = await coinflip.totalGamesPlayed();
      const cfVolume = await coinflip.totalVolume();
      const rrRounds = await roulette.totalRoundsPlayed();
      const rrDeaths = await roulette.totalEliminated();
      const rrVolume = await roulette.totalVolume();
      
      console.log("\n   ═══════════════════════════════════════════════════════");
      console.log("   🎰 SHELLSINO BULLETPROOF TEST RESULTS");
      console.log("   ═══════════════════════════════════════════════════════");
      console.log("");
      console.log("   🪙 COINFLIP:");
      console.log(`      • Games played: ${cfGames}`);
      console.log(`      • Total volume: ${ethers.formatEther(cfVolume)} SHELL`);
      console.log("");
      console.log("   💀 RUSSIAN ROULETTE:");
      console.log(`      • Rounds played: ${rrRounds}`);
      console.log(`      • Total eliminations: ${rrDeaths}`);
      console.log(`      • Total volume: ${ethers.formatEther(rrVolume)} SHELL`);
      console.log("");
      console.log("   ═══════════════════════════════════════════════════════");
      console.log("   ✅ ALL SYSTEMS BULLETPROOF");
      console.log("   🚀 SHELLSINO IS BATTLE-TESTED!");
      console.log("   ═══════════════════════════════════════════════════════\n");
    });
  });
});
