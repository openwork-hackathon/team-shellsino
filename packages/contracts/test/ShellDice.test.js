const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ShellDice", function () {
  let shellToken;
  let shellDice;
  let owner;
  let player1;
  let player2;

  const ONE_TOKEN = ethers.parseEther("1");
  const TEN_TOKENS = ethers.parseEther("10");
  const HUNDRED_TOKENS = ethers.parseEther("100");
  const THOUSAND_TOKENS = ethers.parseEther("1000");

  beforeEach(async function () {
    [owner, player1, player2] = await ethers.getSigners();

    // Deploy mock SHELL token
    const MockToken = await ethers.getContractFactory("MockShell");
    shellToken = await MockToken.deploy();
    await shellToken.waitForDeployment();

    // Deploy ShellDice
    const ShellDice = await ethers.getContractFactory("ShellDice");
    shellDice = await ShellDice.deploy(await shellToken.getAddress());
    await shellDice.waitForDeployment();

    // Mint tokens to players
    await shellToken.mint(player1.address, THOUSAND_TOKENS);
    await shellToken.mint(player2.address, THOUSAND_TOKENS);

    // Fund the house bankroll
    await shellToken.mint(await shellDice.getAddress(), THOUSAND_TOKENS * 10n);
  });

  describe("Deployment", function () {
    it("Should set the correct token address", async function () {
      expect(await shellDice.shellToken()).to.equal(await shellToken.getAddress());
    });

    it("Should set the correct owner", async function () {
      expect(await shellDice.owner()).to.equal(owner.address);
    });

    it("Should have correct initial settings", async function () {
      expect(await shellDice.minBet()).to.equal(ONE_TOKEN);
      expect(await shellDice.maxBet()).to.equal(HUNDRED_TOKENS);
      expect(await shellDice.houseEdgeBps()).to.equal(200);
    });
  });

  describe("Agent Registration", function () {
    it("Should allow registering as an agent", async function () {
      await shellDice.connect(player1).registerAgent("TestAgent");
      expect(await shellDice.verifiedAgents(player1.address)).to.be.true;
      expect(await shellDice.agentNames(player1.address)).to.equal("TestAgent");
    });

    it("Should reject empty name", async function () {
      await expect(
        shellDice.connect(player1).registerAgent("")
      ).to.be.revertedWith("Invalid name");
    });

    it("Should reject name over 32 characters", async function () {
      const longName = "A".repeat(33);
      await expect(
        shellDice.connect(player1).registerAgent(longName)
      ).to.be.revertedWith("Invalid name");
    });
  });

  describe("Rolling Dice", function () {
    beforeEach(async function () {
      // Register as agent
      await shellDice.connect(player1).registerAgent("Player1");
      // Approve tokens
      await shellToken.connect(player1).approve(await shellDice.getAddress(), THOUSAND_TOKENS);
    });

    it("Should reject roll from non-verified agent", async function () {
      await shellToken.connect(player2).approve(await shellDice.getAddress(), THOUSAND_TOKENS);
      await expect(
        shellDice.connect(player2).roll(TEN_TOKENS, 50)
      ).to.be.revertedWith("Not a verified agent");
    });

    it("Should reject bet below minimum", async function () {
      await expect(
        shellDice.connect(player1).roll(ethers.parseEther("0.1"), 50)
      ).to.be.revertedWith("Bet too small");
    });

    it("Should reject bet above maximum", async function () {
      await expect(
        shellDice.connect(player1).roll(ethers.parseEther("200"), 50)
      ).to.be.revertedWith("Bet too large");
    });

    it("Should reject invalid target (too low)", async function () {
      await expect(
        shellDice.connect(player1).roll(TEN_TOKENS, 0)
      ).to.be.revertedWith("Target out of range");
    });

    it("Should reject invalid target (too high)", async function () {
      await expect(
        shellDice.connect(player1).roll(TEN_TOKENS, 100)
      ).to.be.revertedWith("Target out of range");
    });

    it("Should successfully execute a roll", async function () {
      const balanceBefore = await shellToken.balanceOf(player1.address);
      
      const tx = await shellDice.connect(player1).roll(TEN_TOKENS, 50);
      const receipt = await tx.wait();
      
      // Check event was emitted
      const event = receipt.logs.find(log => {
        try {
          return shellDice.interface.parseLog(log)?.name === "DiceRolled";
        } catch { return false; }
      });
      expect(event).to.not.be.undefined;
      
      // Stats should be updated
      expect(await shellDice.totalGamesPlayed()).to.equal(1);
    });

    it("Should update player stats after roll", async function () {
      await shellDice.connect(player1).roll(TEN_TOKENS, 50);
      
      const wins = await shellDice.wins(player1.address);
      const losses = await shellDice.losses(player1.address);
      expect(wins + losses).to.equal(1n);
      expect(await shellDice.totalWagered(player1.address)).to.equal(TEN_TOKENS);
    });

    it("Should track total volume", async function () {
      await shellDice.connect(player1).roll(TEN_TOKENS, 50);
      expect(await shellDice.totalVolume()).to.equal(TEN_TOKENS);
      
      await shellDice.connect(player1).roll(TEN_TOKENS, 50);
      expect(await shellDice.totalVolume()).to.equal(TEN_TOKENS * 2n);
    });
  });

  describe("Payout Calculation", function () {
    it("Should calculate correct payout for 50% chance", async function () {
      // Target 50 = 49% win chance (roll under 50 means 1-49)
      // With 2% house edge, multiplier ≈ (100 / 49) * 0.98 ≈ 2x
      const payout = await shellDice.calculatePayout(ONE_TOKEN, 50);
      // Payout should be roughly 2x minus house edge
      expect(payout).to.be.gt(ONE_TOKEN);
      expect(payout).to.be.lt(ONE_TOKEN * 3n);
    });

    it("Should calculate higher payout for lower target", async function () {
      const payoutLow = await shellDice.calculatePayout(ONE_TOKEN, 10);
      const payoutHigh = await shellDice.calculatePayout(ONE_TOKEN, 90);
      // Lower target = higher payout
      expect(payoutLow).to.be.gt(payoutHigh);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to set min bet", async function () {
      await shellDice.setMinBet(ethers.parseEther("5"));
      expect(await shellDice.minBet()).to.equal(ethers.parseEther("5"));
    });

    it("Should allow owner to set max bet", async function () {
      await shellDice.setMaxBet(ethers.parseEther("500"));
      expect(await shellDice.maxBet()).to.equal(ethers.parseEther("500"));
    });

    it("Should reject non-owner setting min bet", async function () {
      await expect(
        shellDice.connect(player1).setMinBet(ethers.parseEther("5"))
      ).to.be.reverted;
    });

    it("Should allow owner to fund house", async function () {
      await shellToken.mint(owner.address, THOUSAND_TOKENS);
      await shellToken.approve(await shellDice.getAddress(), THOUSAND_TOKENS);
      await shellDice.fundHouse(THOUSAND_TOKENS);
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await shellDice.connect(player1).registerAgent("Player1");
      await shellToken.connect(player1).approve(await shellDice.getAddress(), THOUSAND_TOKENS);
      await shellDice.connect(player1).roll(TEN_TOKENS, 50);
    });

    it("Should return correct agent stats", async function () {
      const [_wins, _losses, _totalWagered, _name] = await shellDice.getAgentStats(player1.address);
      expect(_wins + _losses).to.equal(1n);
      expect(_totalWagered).to.equal(TEN_TOKENS);
      expect(_name).to.equal("Player1");
    });

    it("Should track roll history", async function () {
      const rollIds = await shellDice.playerRollIds(player1.address, 0);
      expect(rollIds).to.equal(0n); // First roll has ID 0
    });
  });
});
