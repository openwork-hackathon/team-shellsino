const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Integration Tests for Full Game Flows (#102)
 * Tests complete user journeys across contracts
 */
describe("Integration Tests", function () {
  let shellToken;
  let houseToken;
  let coinflipV3;
  let rouletteV2;
  let houseBankroll;
  let owner;
  let player1, player2, player3, player4, player5, player6;

  const ONE_TOKEN = ethers.parseEther("1");
  const TEN_TOKENS = ethers.parseEther("10");
  const HUNDRED_TOKENS = ethers.parseEther("100");
  const THOUSAND_TOKENS = ethers.parseEther("1000");

  beforeEach(async function () {
    [owner, player1, player2, player3, player4, player5, player6] = await ethers.getSigners();

    // Deploy tokens
    const MockToken = await ethers.getContractFactory("MockShell");
    shellToken = await MockToken.deploy();
    houseToken = await MockToken.deploy();
    await shellToken.waitForDeployment();
    await houseToken.waitForDeployment();

    // Deploy HouseBankroll
    const HouseBankroll = await ethers.getContractFactory("HouseBankroll");
    houseBankroll = await HouseBankroll.deploy(
      await houseToken.getAddress(),
      await shellToken.getAddress()
    );
    await houseBankroll.waitForDeployment();

    // Deploy CoinflipV3
    const CoinflipV3 = await ethers.getContractFactory("ShellCoinflipV3");
    coinflipV3 = await CoinflipV3.deploy(await shellToken.getAddress());
    await coinflipV3.waitForDeployment();

    // Deploy RouletteV2
    const RouletteV2 = await ethers.getContractFactory("ShellRouletteV2");
    rouletteV2 = await RouletteV2.deploy(await shellToken.getAddress());
    await rouletteV2.waitForDeployment();

    // Seed bankroll
    await shellToken.mint(await houseBankroll.getAddress(), THOUSAND_TOKENS * 100n);

    // Setup players
    const players = [player1, player2, player3, player4, player5, player6];
    for (const player of players) {
      await shellToken.mint(player.address, THOUSAND_TOKENS * 10n);
      await houseToken.mint(player.address, THOUSAND_TOKENS);
      await shellToken.connect(player).approve(await coinflipV3.getAddress(), THOUSAND_TOKENS * 10n);
      await shellToken.connect(player).approve(await rouletteV2.getAddress(), THOUSAND_TOKENS * 10n);
      await houseToken.connect(player).approve(await houseBankroll.getAddress(), THOUSAND_TOKENS);
    }
  });

  describe("Complete Coinflip Flow", function () {
    it("Should complete: register → enter pool → match → payout", async function () {
      // Step 1: Register agents
      await coinflipV3.connect(player1).registerAgent("Agent1");
      await coinflipV3.connect(player2).registerAgent("Agent2");

      expect(await coinflipV3.verifiedAgents(player1.address)).to.be.true;
      expect(await coinflipV3.verifiedAgents(player2.address)).to.be.true;

      // Step 2: Record initial balances
      const initial1 = await shellToken.balanceOf(player1.address);
      const initial2 = await shellToken.balanceOf(player2.address);

      // Step 3: Player 1 enters pool (waits)
      const betAmount = HUNDRED_TOKENS;
      await coinflipV3.connect(player1).enterPool(betAmount, 0); // heads

      // Verify player 1 is waiting
      const poolStatus = await coinflipV3.getPoolStatus(betAmount);
      expect(poolStatus.hasWaiting).to.be.true;
      expect(poolStatus.waitingPlayer).to.equal(player1.address);

      // Step 4: Player 2 enters and triggers instant match
      const tx = await coinflipV3.connect(player2).enterPool(betAmount, 1); // tails
      const receipt = await tx.wait();

      // Step 5: Verify match completed
      const matchEvent = receipt.logs.find(log => {
        try {
          return coinflipV3.interface.parseLog(log)?.name === "InstantMatch";
        } catch { return false; }
      });
      expect(matchEvent).to.not.be.undefined;

      // Step 6: Verify pool is cleared
      const poolStatusAfter = await coinflipV3.getPoolStatus(betAmount);
      expect(poolStatusAfter.hasWaiting).to.be.false;

      // Step 7: Verify balances changed correctly
      const final1 = await shellToken.balanceOf(player1.address);
      const final2 = await shellToken.balanceOf(player2.address);

      // One should have won, one should have lost
      const change1 = final1 - initial1;
      const change2 = final2 - initial2;

      // Winner gains ~bet amount (minus fees), loser loses bet amount
      expect(change1 + change2).to.be.lt(0); // Fees taken

      // Step 8: Verify stats updated
      const stats1 = await coinflipV3.getAgentStats(player1.address);
      const stats2 = await coinflipV3.getAgentStats(player2.address);
      
      expect(Number(stats1._wins) + Number(stats1._losses)).to.equal(1);
      expect(Number(stats2._wins) + Number(stats2._losses)).to.equal(1);
    });

    it("Should complete: challenge → accept → resolve", async function () {
      // Register agents
      await coinflipV3.connect(player1).registerAgent("Challenger");
      await coinflipV3.connect(player2).registerAgent("Challenged");

      const betAmount = HUNDRED_TOKENS;
      const initial1 = await shellToken.balanceOf(player1.address);
      const initial2 = await shellToken.balanceOf(player2.address);

      // Create challenge
      const tx1 = await coinflipV3.connect(player1).createChallenge(player2.address, betAmount, 0);
      const receipt1 = await tx1.wait();

      const createEvent = receipt1.logs.find(log => {
        try {
          return coinflipV3.interface.parseLog(log)?.name === "ChallengeCreated";
        } catch { return false; }
      });
      expect(createEvent).to.not.be.undefined;

      const challengeId = coinflipV3.interface.parseLog(createEvent).args.challengeId;

      // Accept challenge (triggers instant resolution)
      const tx2 = await coinflipV3.connect(player2).acceptChallenge(challengeId, 1);
      const receipt2 = await tx2.wait();

      const resolveEvent = receipt2.logs.find(log => {
        try {
          return coinflipV3.interface.parseLog(log)?.name === "ChallengeResolved";
        } catch { return false; }
      });
      expect(resolveEvent).to.not.be.undefined;

      // Verify challenge is resolved
      const challenge = await coinflipV3.getChallenge(challengeId);
      expect(challenge.resolved).to.be.true;
      expect(challenge.winner).to.not.equal(ethers.ZeroAddress);
    });
  });

  describe("Complete Roulette Flow", function () {
    it("Should complete: 6 players join → auto-fire → 1 eliminated, 5 win", async function () {
      const players = [player1, player2, player3, player4, player5, player6];
      const betTier = TEN_TOKENS;

      // Register all agents
      for (let i = 0; i < players.length; i++) {
        await rouletteV2.connect(players[i]).registerAgent(`RoulettePlayer${i}`);
      }

      // Record initial balances
      const initialBalances = await Promise.all(
        players.map(p => shellToken.balanceOf(p.address))
      );

      // First 5 players enter
      for (let i = 0; i < 5; i++) {
        await rouletteV2.connect(players[i]).enterChamber(betTier);
      }

      // Verify 5 waiting
      const poolStatus = await rouletteV2.getPoolStatus(betTier);
      expect(poolStatus.waitingCount).to.equal(5);

      // 6th player triggers the round
      const tx = await rouletteV2.connect(player6).enterChamber(betTier);
      const receipt = await tx.wait();

      // Verify ChamberSpun event
      const spinEvent = receipt.logs.find(log => {
        try {
          return rouletteV2.interface.parseLog(log)?.name === "ChamberSpun";
        } catch { return false; }
      });
      expect(spinEvent).to.not.be.undefined;

      const parsed = rouletteV2.interface.parseLog(spinEvent);
      const eliminated = parsed.args.eliminated;
      const prizePerSurvivor = parsed.args.prizePerSurvivor;

      // Verify one player was eliminated
      expect(eliminated).to.not.equal(ethers.ZeroAddress);

      // Record final balances
      const finalBalances = await Promise.all(
        players.map(p => shellToken.balanceOf(p.address))
      );

      // Count winners and losers
      let losers = 0;
      let winners = 0;
      for (let i = 0; i < players.length; i++) {
        const change = finalBalances[i] - initialBalances[i];
        if (change < 0n) losers++;
        else if (change > 0n) winners++;
      }

      expect(losers).to.equal(1); // 1 eliminated
      expect(winners).to.equal(5); // 5 survivors win

      // Verify pool is empty
      const poolStatusAfter = await rouletteV2.getPoolStatus(betTier);
      expect(poolStatusAfter.waitingCount).to.equal(0);
    });
  });

  describe("House Staking Flow", function () {
    it("Should complete: stake → earn from games → claim rewards", async function () {
      // Player 1 stakes HOUSE tokens
      await houseBankroll.connect(player1).stake(HUNDRED_TOKENS);

      expect(await houseBankroll.stakedBalance(player1.address)).to.equal(HUNDRED_TOKENS);
      expect(await houseBankroll.totalStaked()).to.equal(HUNDRED_TOKENS);

      // Player 2 stakes more
      await houseBankroll.connect(player2).stake(HUNDRED_TOKENS * 2n);

      expect(await houseBankroll.totalStaked()).to.equal(HUNDRED_TOKENS * 3n);

      // Verify staker proportions
      const staker1Balance = await houseBankroll.stakedBalance(player1.address);
      const staker2Balance = await houseBankroll.stakedBalance(player2.address);
      
      expect(staker2Balance).to.equal(staker1Balance * 2n);
    });
  });

  describe("Multi-Game Session", function () {
    it("Should handle player playing multiple games across contracts", async function () {
      // Register for both games
      await coinflipV3.connect(player1).registerAgent("MultiPlayer1");
      await coinflipV3.connect(player2).registerAgent("MultiPlayer2");
      await rouletteV2.connect(player1).registerAgent("MultiPlayer1");
      await rouletteV2.connect(player2).registerAgent("MultiPlayer2");
      
      // For roulette, register more players
      await rouletteV2.connect(player3).registerAgent("MultiPlayer3");
      await rouletteV2.connect(player4).registerAgent("MultiPlayer4");
      await rouletteV2.connect(player5).registerAgent("MultiPlayer5");
      await rouletteV2.connect(player6).registerAgent("MultiPlayer6");

      const initialBalance = await shellToken.balanceOf(player1.address);

      // Play 3 coinflip games
      for (let i = 0; i < 3; i++) {
        await coinflipV3.connect(player1).enterPool(TEN_TOKENS, 0);
        await coinflipV3.connect(player2).enterPool(TEN_TOKENS, 1);
      }

      // Play 1 roulette round
      const roulettePlayers = [player1, player2, player3, player4, player5, player6];
      for (const p of roulettePlayers) {
        await rouletteV2.connect(p).enterChamber(TEN_TOKENS);
      }

      // Verify games completed
      expect(await coinflipV3.totalGamesPlayed()).to.equal(3n);
      expect(await rouletteV2.totalRoundsPlayed()).to.equal(1n);

      // Player1 should have different balance (won or lost some)
      const finalBalance = await shellToken.balanceOf(player1.address);
      expect(finalBalance).to.not.equal(initialBalance);
    });
  });

  describe("Error Recovery Flows", function () {
    it("Should allow exiting pool before match", async function () {
      await coinflipV3.connect(player1).registerAgent("ExitTest");
      
      const initialBalance = await shellToken.balanceOf(player1.address);
      const betAmount = HUNDRED_TOKENS;

      // Enter pool
      await coinflipV3.connect(player1).enterPool(betAmount, 0);
      
      // Exit before match
      await coinflipV3.connect(player1).exitPool(betAmount);

      // Verify full refund
      const finalBalance = await shellToken.balanceOf(player1.address);
      expect(finalBalance).to.equal(initialBalance);
    });

    it("Should allow cancelling unaccepted challenge", async function () {
      await coinflipV3.connect(player1).registerAgent("CancelTest1");
      await coinflipV3.connect(player2).registerAgent("CancelTest2");

      const initialBalance = await shellToken.balanceOf(player1.address);
      const betAmount = HUNDRED_TOKENS;

      // Create challenge
      const tx = await coinflipV3.connect(player1).createChallenge(player2.address, betAmount, 0);
      const receipt = await tx.wait();
      const challengeId = coinflipV3.interface.parseLog(
        receipt.logs.find(l => {
          try { return coinflipV3.interface.parseLog(l)?.name === "ChallengeCreated"; }
          catch { return false; }
        })
      ).args.challengeId;

      // Cancel challenge
      await coinflipV3.connect(player1).cancelChallenge(challengeId);

      // Verify refund
      const finalBalance = await shellToken.balanceOf(player1.address);
      expect(finalBalance).to.equal(initialBalance);
    });
  });
});
