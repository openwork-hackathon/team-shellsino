const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HouseBankroll", function () {
  let shellToken;
  let houseToken;
  let houseBankroll;
  let mockGame;
  let owner;
  let staker1;
  let staker2;
  let player;

  const ONE_TOKEN = ethers.parseEther("1");
  const TEN_TOKENS = ethers.parseEther("10");
  const HUNDRED_TOKENS = ethers.parseEther("100");
  const THOUSAND_TOKENS = ethers.parseEther("1000");

  beforeEach(async function () {
    [owner, staker1, staker2, player, mockGame] = await ethers.getSigners();

    // Deploy mock tokens
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

    // Mint tokens
    await houseToken.mint(staker1.address, THOUSAND_TOKENS);
    await houseToken.mint(staker2.address, THOUSAND_TOKENS);
    await shellToken.mint(await houseBankroll.getAddress(), THOUSAND_TOKENS * 10n); // Seed bankroll

    // Approve
    await houseToken.connect(staker1).approve(await houseBankroll.getAddress(), THOUSAND_TOKENS);
    await houseToken.connect(staker2).approve(await houseBankroll.getAddress(), THOUSAND_TOKENS);
  });

  describe("Deployment", function () {
    it("Should set the correct token addresses", async function () {
      expect(await houseBankroll.houseToken()).to.equal(await houseToken.getAddress());
      expect(await houseBankroll.shellToken()).to.equal(await shellToken.getAddress());
    });

    it("Should set the correct owner", async function () {
      expect(await houseBankroll.owner()).to.equal(owner.address);
    });

    it("Should have correct initial settings", async function () {
      expect(await houseBankroll.maxExposurePercent()).to.equal(10);
      expect(await houseBankroll.minStake()).to.equal(ONE_TOKEN);
      expect(await houseBankroll.totalStaked()).to.equal(0);
    });
  });

  describe("Staking", function () {
    it("Should allow staking HOUSE tokens", async function () {
      await houseBankroll.connect(staker1).stake(HUNDRED_TOKENS);
      
      expect(await houseBankroll.stakedBalance(staker1.address)).to.equal(HUNDRED_TOKENS);
      expect(await houseBankroll.totalStaked()).to.equal(HUNDRED_TOKENS);
    });

    it("Should emit Staked event", async function () {
      await expect(houseBankroll.connect(staker1).stake(HUNDRED_TOKENS))
        .to.emit(houseBankroll, "Staked")
        .withArgs(staker1.address, HUNDRED_TOKENS);
    });

    it("Should reject zero amount stake", async function () {
      await expect(
        houseBankroll.connect(staker1).stake(0)
      ).to.be.revertedWithCustomError(houseBankroll, "ZeroAmount");
    });

    it("Should reject stake below minimum (first stake)", async function () {
      await expect(
        houseBankroll.connect(staker1).stake(ethers.parseEther("0.1"))
      ).to.be.revertedWithCustomError(houseBankroll, "InsufficientStake");
    });

    it("Should allow adding to existing stake below minimum", async function () {
      await houseBankroll.connect(staker1).stake(HUNDRED_TOKENS);
      // Should allow small additional stake
      await houseBankroll.connect(staker1).stake(ethers.parseEther("0.1"));
    });

    it("Should track multiple stakers", async function () {
      await houseBankroll.connect(staker1).stake(HUNDRED_TOKENS);
      await houseBankroll.connect(staker2).stake(HUNDRED_TOKENS * 2n);

      expect(await houseBankroll.stakedBalance(staker1.address)).to.equal(HUNDRED_TOKENS);
      expect(await houseBankroll.stakedBalance(staker2.address)).to.equal(HUNDRED_TOKENS * 2n);
      expect(await houseBankroll.totalStaked()).to.equal(HUNDRED_TOKENS * 3n);
    });
  });

  describe("Unstaking", function () {
    beforeEach(async function () {
      await houseBankroll.connect(staker1).stake(HUNDRED_TOKENS);
    });

    it("Should allow unstaking", async function () {
      const balanceBefore = await houseToken.balanceOf(staker1.address);
      await houseBankroll.connect(staker1).unstake(HUNDRED_TOKENS);
      const balanceAfter = await houseToken.balanceOf(staker1.address);

      expect(balanceAfter - balanceBefore).to.equal(HUNDRED_TOKENS);
      expect(await houseBankroll.stakedBalance(staker1.address)).to.equal(0);
      expect(await houseBankroll.totalStaked()).to.equal(0);
    });

    it("Should emit Unstaked event", async function () {
      await expect(houseBankroll.connect(staker1).unstake(HUNDRED_TOKENS))
        .to.emit(houseBankroll, "Unstaked")
        .withArgs(staker1.address, HUNDRED_TOKENS);
    });

    it("Should allow partial unstake", async function () {
      await houseBankroll.connect(staker1).unstake(TEN_TOKENS);
      expect(await houseBankroll.stakedBalance(staker1.address)).to.equal(HUNDRED_TOKENS - TEN_TOKENS);
    });

    it("Should reject unstaking more than staked", async function () {
      await expect(
        houseBankroll.connect(staker1).unstake(THOUSAND_TOKENS)
      ).to.be.revertedWithCustomError(houseBankroll, "InsufficientBalance");
    });

    it("Should reject zero amount unstake", async function () {
      await expect(
        houseBankroll.connect(staker1).unstake(0)
      ).to.be.revertedWithCustomError(houseBankroll, "ZeroAmount");
    });
  });

  describe("Game Authorization", function () {
    it("Should allow owner to authorize game", async function () {
      await houseBankroll.authorizeGame(mockGame.address, true);
      expect(await houseBankroll.authorizedGames(mockGame.address)).to.be.true;
    });

    it("Should emit GameAuthorized event", async function () {
      await expect(houseBankroll.authorizeGame(mockGame.address, true))
        .to.emit(houseBankroll, "GameAuthorized")
        .withArgs(mockGame.address, true);
    });

    it("Should allow deauthorizing game", async function () {
      await houseBankroll.authorizeGame(mockGame.address, true);
      await houseBankroll.authorizeGame(mockGame.address, false);
      expect(await houseBankroll.authorizedGames(mockGame.address)).to.be.false;
    });

    it("Should reject non-owner authorization", async function () {
      await expect(
        houseBankroll.connect(staker1).authorizeGame(mockGame.address, true)
      ).to.be.reverted;
    });
  });

  describe("Bankroll Functions", function () {
    beforeEach(async function () {
      await houseBankroll.authorizeGame(mockGame.address, true);
    });

    it("Should report correct bankroll", async function () {
      const bankroll = await houseBankroll.getBankroll();
      expect(bankroll).to.equal(THOUSAND_TOKENS * 10n);
    });

    it("Should calculate max exposure correctly", async function () {
      const maxExposure = await houseBankroll.getMaxExposure();
      // 10% of 10000 SHELL = 1000 SHELL
      expect(maxExposure).to.equal(THOUSAND_TOKENS);
    });

    it("Should check if can cover amount", async function () {
      expect(await houseBankroll.canCover(HUNDRED_TOKENS)).to.be.true;
      expect(await houseBankroll.canCover(THOUSAND_TOKENS * 100n)).to.be.false;
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to set max exposure", async function () {
      await houseBankroll.setMaxExposure(20);
      expect(await houseBankroll.maxExposurePercent()).to.equal(20);
    });

    it("Should reject max exposure above 50%", async function () {
      await expect(
        houseBankroll.setMaxExposure(60)
      ).to.be.reverted;
    });

    it("Should allow owner to set min stake", async function () {
      await houseBankroll.setMinStake(TEN_TOKENS);
      expect(await houseBankroll.minStake()).to.equal(TEN_TOKENS);
    });

    it("Should allow owner to deposit to bankroll", async function () {
      await shellToken.mint(owner.address, THOUSAND_TOKENS);
      await shellToken.approve(await houseBankroll.getAddress(), THOUSAND_TOKENS);
      
      await houseBankroll.depositBankroll(THOUSAND_TOKENS);
      
      const newBankroll = await houseBankroll.getBankroll();
      expect(newBankroll).to.equal(THOUSAND_TOKENS * 11n);
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await houseBankroll.connect(staker1).stake(HUNDRED_TOKENS);
    });

    it("Should return staker info", async function () {
      const info = await houseBankroll.getStakerInfo(staker1.address);
      expect(info.staked).to.equal(HUNDRED_TOKENS);
    });

    it("Should calculate pending rewards correctly", async function () {
      // Initially no rewards
      const pending = await houseBankroll.pendingRewards(staker1.address);
      expect(pending).to.equal(0);
    });
  });
});
