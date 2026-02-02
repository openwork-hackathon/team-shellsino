const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ShellPlinko", function () {
  let shellPlinko;
  let shellToken;
  let owner;
  let player;
  let feeRecipient;
  
  const SHELL_DECIMALS = 18;
  const parseShell = (amount) => ethers.parseUnits(amount.toString(), SHELL_DECIMALS);

  beforeEach(async function () {
    [owner, player, feeRecipient] = await ethers.getSigners();
    
    // Deploy mock SHELL token
    const MockShell = await ethers.getContractFactory("MockShell");
    shellToken = await MockShell.deploy();
    
    // Deploy ShellPlinko
    const ShellPlinko = await ethers.getContractFactory("ShellPlinko");
    shellPlinko = await ShellPlinko.deploy(shellToken.target, feeRecipient.address);
    
    // Mint tokens to player and fund house
    await shellToken.mint(player.address, parseShell(10000));
    await shellToken.mint(owner.address, parseShell(10000));
    
    // Approve and fund house
    await shellToken.approve(shellPlinko.target, parseShell(10000));
    await shellPlinko.fundHouse(parseShell(10000));
    
    // Player approves plinko contract
    await shellToken.connect(player).approve(shellPlinko.target, parseShell(5000));
  });

  describe("Deployment", function () {
    it("Should set the correct token and fee recipient", async function () {
      expect(await shellPlinko.shellToken()).to.equal(shellToken.target);
      expect(await shellPlinko.feeRecipient()).to.equal(feeRecipient.address);
    });
    
    it("Should have correct initial parameters", async function () {
      expect(await shellPlinko.minBet()).to.equal(parseShell(1));
      expect(await shellPlinko.maxBet()).to.equal(parseShell(500));
      expect(await shellPlinko.PROTOCOL_FEE_BPS()).to.equal(100); // 1%
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to set bet limits", async function () {
      await shellPlinko.setBetLimits(parseShell(5), parseShell(1000));
      expect(await shellPlinko.minBet()).to.equal(parseShell(5));
      expect(await shellPlinko.maxBet()).to.equal(parseShell(1000));
    });
    
    it("Should not allow invalid bet limits", async function () {
      await expect(
        shellPlinko.setBetLimits(parseShell(100), parseShell(50))
      ).to.be.revertedWithCustomError(shellPlinko, "InvalidBet");
    });
    
    it("Should allow owner to update multiplier tables", async function () {
      const newMultipliers = [
        5000, 6000, 8000, 12000, 25000, 
        12000, 8000, 6000, 5000, 0, 0, 0, 0, 0, 0, 0, 0
      ];
      
      await shellPlinko.updateMultiplierTable(0, 8, newMultipliers);
      
      const multipliers = await shellPlinko.getMultipliers(8, 0);
      expect(multipliers[0]).to.equal(5000);
      expect(multipliers[4]).to.equal(25000);
    });
    
    it("Should not allow invalid risk levels", async function () {
      const multipliers = new Array(17).fill(10000);
      
      await expect(
        shellPlinko.updateMultiplierTable(3, 8, multipliers)
      ).to.be.revertedWithCustomError(shellPlinko, "InvalidRiskLevel");
    });
    
    it("Should not allow invalid row counts", async function () {
      const multipliers = new Array(17).fill(10000);
      
      await expect(
        shellPlinko.updateMultiplierTable(0, 5, multipliers)
      ).to.be.revertedWithCustomError(shellPlinko, "InvalidRowCount");
    });
  });

  describe("Ball Drop", function () {
    it("Should allow valid ball drop", async function () {
      const betAmount = parseShell(10);
      const numRows = 8;
      const riskLevel = 0; // Low
      
      const initialBalance = await shellToken.balanceOf(player.address);
      
      await shellPlinko.connect(player).drop(betAmount, numRows, riskLevel);
      
      // Check that bet was taken
      const finalBalance = await shellToken.balanceOf(player.address);
      expect(finalBalance).to.be.lt(initialBalance);
      
      // Check game stats
      expect(await shellPlinko.totalGamesPlayed()).to.equal(1);
    });
    
    it("Should reject invalid bets", async function () {
      // Bet too low
      await expect(
        shellPlinko.connect(player).drop(parseShell(0.5), 8, 0)
      ).to.be.revertedWithCustomError(shellPlinko, "InvalidBet");
      
      // Bet too high
      await expect(
        shellPlinko.connect(player).drop(parseShell(1000), 8, 0)
      ).to.be.revertedWithCustomError(shellPlinko, "InvalidBet");
    });
    
    it("Should reject invalid row counts", async function () {
      // Too few rows
      await expect(
        shellPlinko.connect(player).drop(parseShell(10), 5, 0)
      ).to.be.revertedWithCustomError(shellPlinko, "InvalidRowCount");
      
      // Too many rows
      await expect(
        shellPlinko.connect(player).drop(parseShell(10), 20, 0)
      ).to.be.revertedWithCustomError(shellPlinko, "InvalidRowCount");
    });
    
    it("Should reject invalid risk levels", async function () {
      await expect(
        shellPlinko.connect(player).drop(parseShell(10), 8, 3)
      ).to.be.revertedWithCustomError(shellPlinko, "InvalidRiskLevel");
    });
    
    it("Should prevent dropping too frequently", async function () {
      await shellPlinko.connect(player).drop(parseShell(10), 8, 0);
      
      await expect(
        shellPlinko.connect(player).drop(parseShell(10), 8, 0)
      ).to.be.revertedWithCustomError(shellPlinko, "DropTooFrequent");
    });
    
    it("Should emit BallDropped event", async function () {
      await expect(shellPlinko.connect(player).drop(parseShell(10), 8, 0))
        .to.emit(shellPlinko, "BallDropped")
        .withArgs(
          0, // dropId
          player.address,
          parseShell(10),
          8, // numRows
          0, // riskLevel
          ethers.anyValue, // finalSlot
          ethers.anyValue, // multiplier
          ethers.anyValue  // payout
        );
    });
    
    it("Should work with different risk levels", async function () {
      // Low risk
      await shellPlinko.connect(player).drop(parseShell(10), 8, 0);
      
      await ethers.provider.send("evm_increaseTime", [2]);
      await ethers.provider.send("evm_mine");
      
      // Medium risk
      await shellPlinko.connect(player).drop(parseShell(10), 10, 1);
      
      await ethers.provider.send("evm_increaseTime", [2]);
      await ethers.provider.send("evm_mine");
      
      // High risk
      await shellPlinko.connect(player).drop(parseShell(10), 8, 2);
      
      expect(await shellPlinko.totalGamesPlayed()).to.equal(3);
    });
    
    it("Should work with different row counts", async function () {
      for (let rows = 8; rows <= 16; rows++) {
        await shellPlinko.connect(player).drop(parseShell(5), rows, 0);
        
        await ethers.provider.send("evm_increaseTime", [2]);
        await ethers.provider.send("evm_mine");
      }
      
      expect(await shellPlinko.totalGamesPlayed()).to.equal(9);
    });
  });

  describe("Multipliers", function () {
    it("Should return correct multipliers for configuration", async function () {
      const multipliers = await shellPlinko.getMultipliers(8, 0);
      
      // Should have 9 slots for 8 rows (0 to 8)
      expect(multipliers.length).to.equal(9);
      
      // Center slot (4) should have highest multiplier
      expect(multipliers[4]).to.be.gt(multipliers[0]);
    });
    
    it("Should calculate potential payout correctly", async function () {
      const betAmount = parseShell(100);
      const numRows = 8;
      const riskLevel = 0;
      const slot = 4; // Center slot
      
      const payout = await shellPlinko.getPotentialPayout(betAmount, numRows, riskLevel, slot);
      
      // Should be greater than 0
      expect(payout).to.be.gt(0);
    });
    
    it("Should calculate max payout correctly", async function () {
      const maxPayout = await shellPlinko.getMaxPayout(parseShell(100), 8, 2);
      
      // High risk max should be substantial
      expect(maxPayout).to.be.gt(parseShell(100));
    });
    
    it("Should have higher multipliers for higher risk", async function () {
      const lowRiskMax = await shellPlinko.getMaxPayout(parseShell(100), 8, 0);
      const highRiskMax = await shellPlinko.getMaxPayout(parseShell(100), 8, 2);
      
      expect(highRiskMax).to.be.gt(lowRiskMax);
    });
  });

  describe("Expected RTP", function () {
    it("Should calculate expected RTP for configurations", async function () {
      const rtpLow = await shellPlinko.getExpectedRTP(8, 0);
      const rtpHigh = await shellPlinko.getExpectedRTP(8, 2);
      
      // RTP should be returned in basis points
      expect(rtpLow).to.be.gt(0);
      expect(rtpLow).to.be.lte(10000);
      
      expect(rtpHigh).to.be.gt(0);
      expect(rtpHigh).to.be.lte(10000);
    });
  });

  describe("Player Stats", function () {
    it("Should track player stats correctly", async function () {
      await shellPlinko.connect(player).drop(parseShell(10), 8, 0);
      
      await ethers.provider.send("evm_increaseTime", [2]);
      await ethers.provider.send("evm_mine");
      
      await shellPlinko.connect(player).drop(parseShell(20), 10, 1);
      
      const stats = await shellPlinko.getPlayerStats(player.address);
      
      // stats: [wins, losses, totalWagered, profitLoss, biggestWin, winRate]
      expect(stats[2]).to.equal(parseShell(30)); // total wagered
    });
  });

  describe("House Stats", function () {
    it("Should track house stats correctly", async function () {
      await shellPlinko.connect(player).drop(parseShell(10), 8, 0);
      
      const stats = await shellPlinko.getHouseStats();
      
      // stats: [balance, profitLoss, totalGames, volume, fees]
      expect(stats[2]).to.equal(1); // totalGames
      expect(stats[3]).to.equal(parseShell(10)); // volume
    });
  });

  describe("View Functions", function () {
    it("Should return correct drop data", async function () {
      await shellPlinko.connect(player).drop(parseShell(10), 8, 0);
      
      const drop = await shellPlinko.getDrop(0);
      expect(drop.player).to.equal(player.address);
      expect(drop.numRows).to.equal(8);
      expect(drop.riskLevel).to.equal(0);
    });
    
    it("Should return recent drops", async function () {
      await shellPlinko.connect(player).drop(parseShell(10), 8, 0);
      
      await ethers.provider.send("evm_increaseTime", [2]);
      await ethers.provider.send("evm_mine");
      
      await shellPlinko.connect(player).drop(parseShell(20), 10, 1);
      
      const recent = await shellPlinko.getRecentDrops(2);
      expect(recent.length).to.equal(2);
    });
    
    it("Should return player drops", async function () {
      await shellPlinko.connect(player).drop(parseShell(10), 8, 0);
      
      const playerDrops = await shellPlinko.getPlayerDrops(player.address, 10);
      expect(playerDrops.length).to.equal(1);
    });
  });

  describe("Funding", function () {
    it("Should allow funding the house", async function () {
      const initialBalance = await shellToken.balanceOf(shellPlinko.target);
      
      await shellPlinko.fundHouse(parseShell(1000));
      
      const finalBalance = await shellToken.balanceOf(shellPlinko.target);
      expect(finalBalance).to.equal(initialBalance + parseShell(1000));
    });
    
    it("Should emit HouseFunded event", async function () {
      await expect(shellPlinko.fundHouse(parseShell(1000)))
        .to.emit(shellPlinko, "HouseFunded")
        .withArgs(owner.address, parseShell(1000));
    });
  });
});
