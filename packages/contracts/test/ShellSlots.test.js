const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ShellSlots", function () {
  let slots, shellToken, owner, player, feeRecipient, bankroll;
  
  beforeEach(async function () {
    [owner, player, feeRecipient, bankroll] = await ethers.getSigners();
    
    // Deploy mock SHELL token
    const MockToken = await ethers.getContractFactory("MockShell");
    shellToken = await MockToken.deploy();
    await shellToken.waitForDeployment();
    
    // Deploy slots
    const ShellSlots = await ethers.getContractFactory("ShellSlots");
    slots = await ShellSlots.deploy(await shellToken.getAddress(), feeRecipient.address);
    await slots.waitForDeployment();
    
    // Setup
    await slots.setBankroll(bankroll.address);
    
    // Fund contracts
    await shellToken.mint(player.address, ethers.parseEther("10000"));
    await shellToken.mint(owner.address, ethers.parseEther("10000"));
    await shellToken.approve(await slots.getAddress(), ethers.parseEther("10000"));
    await slots.depositBankroll(ethers.parseEther("5000"));
  });
  
  describe("Deployment", function () {
    it("Should set correct initial values", async function () {
      expect(await slots.shellToken()).to.equal(await shellToken.getAddress());
      expect(await slots.feeRecipient()).to.equal(feeRecipient.address);
      expect(await slots.minBet()).to.equal(ethers.parseEther("1"));
      expect(await slots.maxBet()).to.equal(ethers.parseEther("100"));
    });
  });
  
  describe("Bankroll Management", function () {
    it("Should allow bankroll deposits", async function () {
      const deposit = ethers.parseEther("1000");
      await expect(slots.depositBankroll(deposit))
        .to.emit(slots, "BankrollDeposit")
        .withArgs(owner.address, deposit);
      
      expect(await slots.houseBalance()).to.equal(ethers.parseEther("6000"));
    });
    
    it("Should allow owner to withdraw bankroll", async function () {
      const withdraw = ethers.parseEther("1000");
      await expect(slots.withdrawBankroll(withdraw))
        .to.emit(slots, "BankrollWithdraw")
        .withArgs(owner.address, withdraw);
      
      expect(await slots.houseBalance()).to.equal(ethers.parseEther("4000"));
    });
  });
  
  describe("Spin", function () {
    beforeEach(async function () {
      await shellToken.connect(player).approve(await slots.getAddress(), ethers.parseEther("1000"));
    });
    
    it("Should reject bets below minimum", async function () {
      await expect(
        slots.connect(player).spin(ethers.parseEther("0.5"))
      ).to.be.revertedWithCustomError(slots, "InvalidBet");
    });
    
    it("Should reject bets above maximum", async function () {
      await expect(
        slots.connect(player).spin(ethers.parseEther("200"))
      ).to.be.revertedWithCustomError(slots, "InvalidBet");
    });
    
    it("Should reject spin if bankroll insufficient", async function () {
      // Drain bankroll
      await slots.withdrawBankroll(await slots.houseBalance());
      
      await expect(
        slots.connect(player).spin(ethers.parseEther("10"))
      ).to.be.revertedWithCustomError(slots, "InsufficientBankroll");
    });
    
    it("Should process spin and emit events", async function () {
      const bet = ethers.parseEther("10");
      
      await expect(slots.connect(player).spin(bet))
        .to.emit(slots, "SpinCreated")
        .and.to.emit(slots, "SpinResult");
      
      const spin = await slots.spins(0);
      expect(spin.player).to.equal(player.address);
      expect(spin.settled).to.be.true;
    });
    
    it("Should take 1% fee", async function () {
      const playerBalanceBefore = await shellToken.balanceOf(player.address);
      const feeBalanceBefore = await shellToken.balanceOf(feeRecipient.address);
      
      const bet = ethers.parseEther("100");
      await slots.connect(player).spin(bet);
      
      const feeBalanceAfter = await shellToken.balanceOf(feeRecipient.address);
      const expectedFee = bet * 1n / 100n; // 1%
      
      expect(feeBalanceAfter - feeBalanceBefore).to.equal(expectedFee);
    });
  });
  
  describe("View Functions", function () {
    it("Should return correct symbol names", async function () {
      expect(await slots.getSymbolName(0)).to.equal("Cherry");
      expect(await slots.getSymbolName(6)).to.equal("BAR");
    });
    
    it("Should track player spins", async function () {
      await shellToken.connect(player).approve(await slots.getAddress(), ethers.parseEther("100"));
      await slots.connect(player).spin(ethers.parseEther("10"));
      await slots.connect(player).spin(ethers.parseEther("10"));
      
      const playerSpins = await slots.getPlayerSpins(player.address);
      expect(playerSpins.length).to.equal(2);
      expect(playerSpins[0]).to.equal(0);
      expect(playerSpins[1]).to.equal(1);
    });
  });
});
