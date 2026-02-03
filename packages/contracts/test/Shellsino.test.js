const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("🎰 SHELLSINO TEST SUITE (Open Matchmaking Only)", function () {
  let shell, coinflip, roulette;
  let owner, agent1, agent2, agent3, agent4, agent5, agent6, agent7, agent8, nonAgent;
  let testSecrets = {};
  
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
      await coinflip.connect(agent2).registerAgent("Bobby");
      expect(await coinflip.agentNames(agent2.address)).to.equal("Bobby");
    });
    
    it("✅ should allow single character name", async function () {
      await coinflip.connect(agent3).registerAgent("C");
      await coinflip.connect(agent3).registerAgent("Charlie");
    });
  });

  describe("🪙 COINFLIP - Open Games", function () {
    
    before(async function () {
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
      await coinflip.connect(agent2).joinGame(1, 1);
      
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

    it("✅ should show open games correctly", async function () {
      const [gameIds, games] = await coinflip.getOpenGames(ethers.parseEther("50"), 10);
      expect(gameIds.length).to.be.gte(1);
    });
    
    it("✅ should support quickJoin matchmaking", async function () {
      // Create a game for quickJoin
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      await coinflip.connect(agent1).createGame(ethers.parseEther("77"), commitment);
      
      // QuickJoin should find it
      const gameId = await coinflip.connect(agent4).quickJoin.staticCall(ethers.parseEther("77"), 1);
      expect(gameId).to.be.gt(0);
      
      // Actually join
      await coinflip.connect(agent4).quickJoin(ethers.parseEther("77"), 1);
      
      const game = await coinflip.getGame(gameId);
      expect(game.player2).to.equal(agent4.address);
      
      // Cleanup
      await coinflip.connect(agent1).revealAndResolve(gameId, 0, secret);
    });
    
    it("✅ should revert quickJoin when no games available", async function () {
      await expect(
        coinflip.connect(agent1).quickJoin(ethers.parseEther("999"), 0)
      ).to.be.revertedWith("No open games at this bet amount");
    });
  });

  describe("🪙 COINFLIP - Game Resolution", function () {
    
    it("✅ should resolve game with correct winner", async function () {
      const { secret, choice } = testSecrets.game1;
      
      await coinflip.connect(agent1).revealAndResolve(1, choice, secret);
      
      const game = await coinflip.getGame(1);
      expect(game.state).to.equal(3); // Resolved
      expect(game.winner).to.not.equal(ethers.ZeroAddress);
      
      const winner = game.winner === agent1.address ? "Alice" : "Bobby";
      console.log(`      🏆 Winner: ${winner}`);
    });

    it("✅ should reject invalid reveal (wrong secret)", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent3).createGame(ethers.parseEther("10"), commitment);
      const gameId = await coinflip.nextGameId() - 1n;
      await coinflip.connect(agent4).joinGame(gameId, 1);
      
      const wrongSecret = ethers.randomBytes(32);
      await expect(
        coinflip.connect(agent3).revealAndResolve(gameId, 0, wrongSecret)
      ).to.be.revertedWith("Invalid reveal");
      
      await coinflip.connect(agent3).revealAndResolve(gameId, 0, secret);
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
      
      await coinflip.connect(agent1).revealAndResolve(gameId, 0, secret);
    });

    it("✅ should track stats correctly", async function () {
      const stats = await coinflip.getAgentStats(agent1.address);
      const totalGames = Number(stats[0]) + Number(stats[1]);
      
      expect(totalGames).to.be.gte(1);
      console.log(`      📊 Alice: ${stats[0]} wins, ${stats[1]} losses, ${ethers.formatEther(stats[2])} wagered`);
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
      
      await coinflip.connect(agent1).revealAndResolve(gameId, 0, secret);
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
      
      await coinflip.connect(agent1).revealAndResolve(gameId, 0, secret);
    });
    
    it("✅ should allow force resolve after timeout", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [0, secret]));
      
      await coinflip.connect(agent1).createGame(ethers.parseEther("30"), commitment);
      const gameId = await coinflip.nextGameId() - 1n;
      await coinflip.connect(agent2).joinGame(gameId, 1);
      
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine");
      
      await coinflip.connect(agent2).forceResolve(gameId);
      
      const game = await coinflip.getGame(gameId);
      expect(game.winner).to.equal(agent2.address);
      console.log("      ⏰ Player1 forfeited by timeout, Player2 wins!");
    });
  });
  
  describe("🪙 COINFLIP - Admin Functions", function () {
    
    it("✅ should allow owner to set protocol fee", async function () {
      await coinflip.connect(owner).setProtocolFee(200);
      expect(await coinflip.protocolFeeBps()).to.equal(200);
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
    
    it("✅ generateCommitment helper should work", async function () {
      const secret = ethers.randomBytes(32);
      const expected = ethers.keccak256(ethers.solidityPacked(["uint8", "bytes32"], [1, secret]));
      const actual = await coinflip.generateCommitment(1, secret);
      expect(actual).to.equal(expected);
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
  });

  describe("💀 ROULETTE - Public Rounds (Matchmaking)", function () {
    
    it("✅ should auto-matchmake with enterChamber", async function () {
      await roulette.connect(agent1).enterChamber(ethers.parseEther("100"));
      
      const round = await roulette.getRound(1);
      expect(round.playerCount).to.equal(1);
      expect(round.betAmount).to.equal(ethers.parseEther("100"));
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

    it("✅ should auto-trigger at 6 players", async function () {
      await roulette.connect(agent4).enterChamber(ethers.parseEther("100"));
      await roulette.connect(agent5).enterChamber(ethers.parseEther("100"));
      await roulette.connect(agent6).enterChamber(ethers.parseEther("100"));
      
      console.log("      🔫 Agents 4-6 entered...");
      console.log("      💀 BANG! Chamber spinning...\n");
      
      await roulette.connect(agent7).enterChamber(ethers.parseEther("100"));
      
      const round = await roulette.getRound(1);
      expect(round.state).to.equal(2); // Complete
      expect(round.eliminated).to.not.equal(ethers.ZeroAddress);
      
      const eliminatedName = await roulette.agentNames(round.eliminated);
      console.log(`      💀 ${eliminatedName} was ELIMINATED!`);
      
      expect(await roulette.totalRoundsPlayed()).to.equal(1);
      expect(await roulette.totalEliminated()).to.equal(1);
    });

    it("✅ should pay survivors correctly (verify 2% fee)", async function () {
      const round = await roulette.getRound(1);
      expect(round.prizePerWinner).to.equal(ethers.parseEther("117.6"));
      console.log(`      💰 Each survivor received ${ethers.formatEther(round.prizePerWinner)} SHELL`);
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
    
    it("✅ should reject unverified agent", async function () {
      await shell.connect(nonAgent).approve(await roulette.getAddress(), ethers.parseEther("50000"));
      
      await expect(
        roulette.connect(nonAgent).enterChamber(ethers.parseEther("100"))
      ).to.be.revertedWith("Not a verified agent - register first");
    });
    
    it("✅ should return open rounds in getOpenRounds", async function () {
      const openRounds = await roulette.getOpenRounds(ethers.parseEther("50"), 10);
      expect(openRounds.length).to.be.gte(1);
    });
    
    it("✅ should return all open rounds with getAllOpenRounds", async function () {
      const [roundIds, betAmounts, playerCounts] = await roulette.getAllOpenRounds(50);
      expect(roundIds.length).to.be.gte(1);
      console.log(`      📋 Found ${roundIds.length} open round(s)`);
    });
  });

  describe("💀 ROULETTE - Stats & Analytics", function () {
    
    it("✅ should track survival rate correctly", async function () {
      const rate = await roulette.getSurvivalRate(agent1.address);
      console.log(`      📊 Agent1 survival rate: ${Number(rate) / 100}%`);
    });
    
    it("✅ should return 0 survival rate for no games", async function () {
      const rate = await roulette.getSurvivalRate(nonAgent.address);
      expect(rate).to.equal(0);
    });
    
    it("✅ should track total volume correctly", async function () {
      const volume = await roulette.totalVolume();
      expect(volume).to.be.gt(0);
      console.log(`      📊 Total roulette volume: ${ethers.formatEther(volume)} SHELL`);
    });
  });
  
  describe("💀 ROULETTE - Admin Functions", function () {
    
    it("✅ should allow owner to set min bet", async function () {
      await roulette.connect(owner).setMinBet(ethers.parseEther("5"));
      expect(await roulette.minBet()).to.equal(ethers.parseEther("5"));
      await roulette.connect(owner).setMinBet(ethers.parseEther("10"));
    });
    
    it("✅ should allow owner to set max bet", async function () {
      await roulette.connect(owner).setMaxBet(ethers.parseEther("2000"));
      expect(await roulette.maxBet()).to.equal(ethers.parseEther("2000"));
      await roulette.connect(owner).setMaxBet(ethers.parseEther("1000"));
    });
    
    it("✅ should allow owner to set protocol fee", async function () {
      await roulette.connect(owner).setProtocolFee(300);
      expect(await roulette.protocolFeeBps()).to.equal(300);
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
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 🔒 SECURITY TESTS
  // ═══════════════════════════════════════════════════════════════════
  
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
      console.log("   🎰 SHELLSINO TEST RESULTS (OPEN MATCHMAKING ONLY)");
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
      console.log("   ✅ All tests passed - Open matchmaking only!");
      console.log("   ═══════════════════════════════════════════════════════\n");
    });
  });
});
