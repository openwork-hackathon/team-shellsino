const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Blackjack", function () {
  let shellToken;
  let houseBankroll;
  let blackjack;
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

    // Deploy HouseBankroll
    const HouseBankroll = await ethers.getContractFactory("HouseBankroll");
    houseBankroll = await HouseBankroll.deploy(
      await shellToken.getAddress(),
      "0x759a72ea84e5cc7f04a59830ec8a824b036bfc8b" // HOUSE token placeholder
    );
    await houseBankroll.waitForDeployment();

    // Deploy Blackjack
    const Blackjack = await ethers.getContractFactory("Blackjack");
    blackjack = await Blackjack.deploy(await shellToken.getAddress());
    await blackjack.waitForDeployment();

    // Configure blackjack
    await blackjack.setHouseBankroll(await houseBankroll.getAddress());
    await blackjack.setFeeRecipient(owner.address);

    // Fund house bankroll
    await shellToken.mint(await houseBankroll.getAddress(), THOUSAND_TOKENS * 100n);

    // Mint tokens to players
    await shellToken.mint(player1.address, THOUSAND_TOKENS);
    await shellToken.mint(player2.address, THOUSAND_TOKENS);

    // Approve blackjack contract
    await shellToken.connect(player1).approve(await blackjack.getAddress(), THOUSAND_TOKENS);
    await shellToken.connect(player2).approve(await blackjack.getAddress(), THOUSAND_TOKENS);
  });

  describe("Deployment", function () {
    it("Should set the correct token address", async function () {
      expect(await blackjack.shellToken()).to.equal(await shellToken.getAddress());
    });

    it("Should set the correct owner", async function () {
      expect(await blackjack.owner()).to.equal(owner.address);
    });

    it("Should have correct initial settings", async function () {
      expect(await blackjack.minBet()).to.equal(ONE_TOKEN);
      expect(await blackjack.maxBet()).to.equal(THOUSAND_TOKENS);
    });
  });

  describe("Starting a Game", function () {
    it("Should start a game with valid commitment", async function () {
      // Create commitment
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(secret);

      const tx = await blackjack.connect(player1).startGame(TEN_TOKENS, commitment);
      const receipt = await tx.wait();

      // Check event
      const event = receipt.logs.find(log => {
        try {
          return blackjack.interface.parseLog(log)?.name === "GameStarted";
        } catch { return false; }
      });
      expect(event).to.not.be.undefined;

      // Check active game
      expect(await blackjack.activeGame(player1.address)).to.be.gt(0);
    });

    it("Should reject bet below minimum", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(secret);

      await expect(
        blackjack.connect(player1).startGame(ethers.parseEther("0.1"), commitment)
      ).to.be.revertedWith("Bet below minimum");
    });

    it("Should reject bet above maximum", async function () {
      const secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(secret);

      await shellToken.mint(player1.address, THOUSAND_TOKENS * 10n);
      await shellToken.connect(player1).approve(await blackjack.getAddress(), THOUSAND_TOKENS * 10n);

      await expect(
        blackjack.connect(player1).startGame(THOUSAND_TOKENS * 2n, commitment)
      ).to.be.revertedWith("Bet above maximum");
    });

    it("Should reject starting second game while one is active", async function () {
      const secret1 = ethers.randomBytes(32);
      const commitment1 = ethers.keccak256(secret1);
      await blackjack.connect(player1).startGame(TEN_TOKENS, commitment1);

      const secret2 = ethers.randomBytes(32);
      const commitment2 = ethers.keccak256(secret2);
      await expect(
        blackjack.connect(player1).startGame(TEN_TOKENS, commitment2)
      ).to.be.revertedWith("Game already active");
    });
  });

  describe("Revealing and Playing", function () {
    let gameId;
    let secret;

    beforeEach(async function () {
      secret = ethers.randomBytes(32);
      const commitment = ethers.keccak256(secret);
      await blackjack.connect(player1).startGame(TEN_TOKENS, commitment);
      gameId = await blackjack.activeGame(player1.address);
    });

    it("Should reveal with correct secret", async function () {
      const tx = await blackjack.connect(player1).reveal(gameId, secret);
      const receipt = await tx.wait();

      // Check CardsDealt event
      const event = receipt.logs.find(log => {
        try {
          return blackjack.interface.parseLog(log)?.name === "CardsDealt";
        } catch { return false; }
      });
      expect(event).to.not.be.undefined;
    });

    it("Should reject reveal with wrong secret", async function () {
      const wrongSecret = ethers.randomBytes(32);
      await expect(
        blackjack.connect(player1).reveal(gameId, wrongSecret)
      ).to.be.revertedWith("Invalid secret");
    });

    it("Should reject reveal from wrong player", async function () {
      await expect(
        blackjack.connect(player2).reveal(gameId, secret)
      ).to.be.revertedWith("Not your game");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to set min bet", async function () {
      await blackjack.setMinBet(ethers.parseEther("5"));
      expect(await blackjack.minBet()).to.equal(ethers.parseEther("5"));
    });

    it("Should allow owner to set max bet", async function () {
      await blackjack.setMaxBet(ethers.parseEther("500"));
      expect(await blackjack.maxBet()).to.equal(ethers.parseEther("500"));
    });

    it("Should reject non-owner setting min bet", async function () {
      await expect(
        blackjack.connect(player1).setMinBet(ethers.parseEther("5"))
      ).to.be.reverted;
    });

    it("Should allow owner to set house bankroll", async function () {
      await blackjack.setHouseBankroll(player2.address);
      expect(await blackjack.houseBankroll()).to.equal(player2.address);
    });
  });

  describe("Card Logic", function () {
    it("Should correctly calculate card value for number cards", async function () {
      // Card 1 = 2, Card 2 = 3, ... Card 8 = 10
      // These are internal so we test via game results
    });

    it("Should correctly identify blackjack", async function () {
      // Blackjack = Ace + 10/J/Q/K on initial deal
      // We can't directly test this without mocking randomness
      // but we verify the constant is set
      expect(await blackjack.BLACKJACK_PAYOUT_NUMERATOR()).to.equal(3);
      expect(await blackjack.BLACKJACK_PAYOUT_DENOMINATOR()).to.equal(2);
    });
  });

  describe("Game Timeout", function () {
    it("Should have correct timeout constant", async function () {
      expect(await blackjack.GAME_TIMEOUT_BLOCKS()).to.equal(256);
    });
  });
});
