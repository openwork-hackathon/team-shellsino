const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ShellDiceV2", function () {
  let shellDice;
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
    
    // Deploy ShellDiceV2
    const ShellDiceV2 = await ethers.getContractFactory("ShellDiceV2");
    shellDice = await ShellDiceV2.deploy(shellToken.target, feeRecipient.address);
    
    // Mint tokens to player and fund house
    await shellToken.mint(player.address, parseShell(10000));
    await shellToken.mint(owner.address, parseShell(10000));
    
    // Approve and fund house
    await shellToken.approve(shellDice.target, parseShell(5000));
    await shellDice.fundHouse(parseShell(5000));
    
    // Player approves dice contract
    await shellToken.connect(player).approve(shellDice.target, parseShell(5000));
  });

  describe("Deployment", function () {
    it("Should set the correct token and fee recipient", async function () {
      expect(await shellDice.shellToken()).to.equal(shellToken.target);
      expect(await shellDice.feeRecipient()).to.equal(feeRecipient.address);
    });
    
    it("Should have correct initial parameters", async function () {
      expect(await shellDice.minBet()).to.equal(parseShell(1));
      expect(await shellDice.maxBet()).to.equal(parseShell(1000));
      expect(await shellDice.houseEdgeBps()).to.equal(200); // 2%
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to set bet limits", async function () {
      await shellDice.setBetLimits(parseShell(5), parseShell(500));
      expect(await shellDice.minBet()).to.equal(parseShell(5));
      expect(await shellDice.maxBet()).to.equal(parseShell(500));
    });
    
    it("Should not allow invalid bet limits", async function () {
      await expect(
        shellDice.setBetLimits(parseShell(100), parseShell(50))
      ).to.be.revertedWithCustomError(shellDice, "InvalidBet");
    });
    
    it("Should allow owner to set house edge within bounds", async function () {
      await shellDice.setHouseEdge(300); // 3%
      expect(await shellDice.houseEdgeBps()).to.equal(300);
    });
    
    it("Should not allow house edge outside bounds", async function () {
      await expect(
        shellDice.setHouseEdge(600) // 6%, over max
      ).to.be.revertedWithCustomError(shellDice, "InvalidHouseEdge");
      
      await expect(
        shellDice.setHouseEdge(40) // 0.4%, under min
      ).to.be.revertedWithCustomError(shellDice, "InvalidHouseEdge");
    });
    
    it("Should not allow non-owner to set parameters", async function () {
      await expect(
        shellDice.connect(player).setHouseEdge(300)
      ).to.be.revertedWithCustomError(shellDice, "OwnableUnauthorizedAccount");
    });
  });

  describe("Roll Under", function () {
    it("Should allow valid roll under", async function () {
      const betAmount = parseShell(10);
      const target = 50;
      
      const initialBalance = await shellToken.balanceOf(player.address);
      
      await shellDice.connect(player).rollUnder(betAmount, target);
      
      // Check that bet was taken
      const finalBalance = await shellToken.balanceOf(player.address);
      expect(finalBalance).to.be.lt(initialBalance);
      
      // Check game stats
      expect(await shellDice.totalGamesPlayed()).to.equal(1);
    });
    
    it("Should reject invalid bets", async function () {
      // Bet too low
      await expect(
        shellDice.connect(player).rollUnder(parseShell(0.5), 50)
      ).to.be.revertedWithCustomError(shellDice, "InvalidBet");
      
      // Bet too high
      await expect(
        shellDice.connect(player).rollUnder(parseShell(2000), 50)
      ).to.be.revertedWithCustomError(shellDice, "InvalidBet");
    });
    
    it("Should reject invalid targets", async function () {
      // Target too low
      await expect(
        shellDice.connect(player).rollUnder(parseShell(10), 1)
      ).to.be.revertedWithCustomError(shellDice, "InvalidTarget");
      
      // Target too high
      await expect(
        shellDice.connect(player).rollUnder(parseShell(10), 99)
      ).to.be.revertedWithCustomError(shellDice, "InvalidTarget");
    });
    
    it("Should prevent rolling too frequently", async function () {
      await shellDice.connect(player).rollUnder(parseShell(10), 50);
      
      await expect(
        shellDice.connect(player).rollUnder(parseShell(10), 50)
      ).to.be.revertedWithCustomError(shellDice, "RollTooFrequent");
    });
    
    it("Should emit DiceRolled event", async function () {
      await expect(shellDice.connect(player).rollUnder(parseShell(10), 50))
        .to.emit(shellDice, "DiceRolled")
        .withArgs(
          0, // rollId
          player.address,
          parseShell(10),
          50, // target
          ethers.anyValue, // rolledNumber
          ethers.anyValue, // multiplier
          ethers.anyValue, // payout
          ethers.anyValue, // won
          false // rollOver
        );
    });
  });

  describe("Roll Over", function () {
    it("Should allow valid roll over", async function () {
      const betAmount = parseShell(10);
      const target = 50;
      
      await shellDice.connect(player).rollOver(betAmount, target);
      
      expect(await shellDice.totalGamesPlayed()).to.equal(1);
    });
    
    it("Should emit correct event for roll over", async function () {
      await expect(shellDice.connect(player).rollOver(parseShell(10), 50))
        .to.emit(shellDice, "DiceRolled")
        .withArgs(
          0,
          player.address,
          parseShell(10),
          50,
          ethers.anyValue,
          ethers.anyValue,
          ethers.anyValue,
          ethers.anyValue,
          true // rollOver = true
        );
    });
  });

  describe("Multiplier Calculation", function () {
    it("Should calculate correct multiplier for roll under", async function () {
      // Target 50 = 49% win chance
      // Fair multiplier = 100/49 = 2.04
      // With 2% house edge = 2.04 * 0.98 = 2.00
      const multiplier = await shellDice.getMultiplier(50, false);
      
      // Should be around 2x (with 18 decimals)
      expect(multiplier).to.be.closeTo(ethers.parseUnits("2", 18), ethers.parseUnits("0.1", 18));
    });
    
    it("Should calculate correct multiplier for roll over", async function () {
      // Target 50 = 50% win chance
      const multiplier = await shellDice.getMultiplier(50, true);
      
      expect(multiplier).to.be.closeTo(ethers.parseUnits("1.96", 18), ethers.parseUnits("0.1", 18));
    });
    
    it("Should have higher multiplier for lower win chance", async function () {
      const multTarget10 = await shellDice.getMultiplier(10, false); // 9% chance
      const multTarget90 = await shellDice.getMultiplier(90, false); // 89% chance
      
      expect(multTarget10).to.be.gt(multTarget90);
    });
  });

  describe("Player Stats", function () {
    it("Should track player stats correctly", async function () {
      // Make a few rolls
      await shellDice.connect(player).rollUnder(parseShell(10), 50);
      
      // Wait a second to avoid rate limit
      await ethers.provider.send("evm_increaseTime", [2]);
      await ethers.provider.send("evm_mine");
      
      await shellDice.connect(player).rollOver(parseShell(20), 60);
      
      const stats = await shellDice.getPlayerStats(player.address);
      
      // stats: [wins, losses, totalWagered, profitLoss, biggestWin, winRate]
      expect(stats[2]).to.equal(parseShell(30)); // total wagered
    });
  });

  describe("House Stats", function () {
    it("Should track house stats correctly", async function () {
      await shellDice.connect(player).rollUnder(parseShell(10), 50);
      
      const stats = await shellDice.getHouseStats();
      
      // stats: [balance, profitLoss, totalGames, volume, fees]
      expect(stats[2]).to.equal(1); // totalGames
      expect(stats[3]).to.equal(parseShell(10)); // volume
    });
  });

  describe("View Functions", function () {
    it("Should return correct roll data", async function () {
      await shellDice.connect(player).rollUnder(parseShell(10), 50);
      
      const roll = await shellDice.getRoll(0);
      expect(roll.player).to.equal(player.address);
      expect(roll.targetNumber).to.equal(50);
      expect(roll.betAmount).to.be.gt(0);
    });
    
    it("Should return recent rolls", async function () {
      await shellDice.connect(player).rollUnder(parseShell(10), 50);
      
      await ethers.provider.send("evm_increaseTime", [2]);
      await ethers.provider.send("evm_mine");
      
      await shellDice.connect(player).rollUnder(parseShell(20), 60);
      
      const recent = await shellDice.getRecentRolls(2);
      expect(recent.length).to.equal(2);
    });
    
    it("Should return player rolls", async function () {
      await shellDice.connect(player).rollUnder(parseShell(10), 50);
      
      const playerRolls = await shellDice.getPlayerRolls(player.address, 10);
      expect(playerRolls.length).to.equal(1);
    });
  });
});
