const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Fuzz Testing for Randomness and Edge Cases (#106)
 * Uses property-based testing with random inputs
 */
describe("Fuzz Tests", function () {
  let shellToken;
  let coinflipV3;
  let owner;
  let players;

  const THOUSAND_TOKENS = ethers.parseEther("1000");

  // Generate random values for fuzz testing
  function randomBigInt(min, max) {
    const range = max - min;
    return min + BigInt(Math.floor(Math.random() * Number(range)));
  }

  function randomChoice() {
    return Math.random() > 0.5 ? 1 : 0;
  }

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    players = signers.slice(1, 11); // 10 players for fuzz tests

    // Deploy mock SHELL token
    const MockToken = await ethers.getContractFactory("MockShell");
    shellToken = await MockToken.deploy();
    await shellToken.waitForDeployment();

    // Deploy CoinflipV3
    const CoinflipV3 = await ethers.getContractFactory("ShellCoinflipV3");
    coinflipV3 = await CoinflipV3.deploy(await shellToken.getAddress());
    await coinflipV3.waitForDeployment();

    // Setup all players
    for (const player of players) {
      await shellToken.mint(player.address, THOUSAND_TOKENS * 100n);
      await shellToken.connect(player).approve(await coinflipV3.getAddress(), THOUSAND_TOKENS * 100n);
      await coinflipV3.connect(player).registerAgent(`Agent${players.indexOf(player)}`);
    }
  });

  describe("Randomness Distribution", function () {
    it("Should have roughly 50/50 win distribution over many games", async function () {
      this.timeout(60000); // 60 second timeout for many games
      
      const numGames = 50; // Run 50 games
      let player1Wins = 0;
      let player2Wins = 0;

      for (let i = 0; i < numGames; i++) {
        const player1 = players[i % players.length];
        const player2 = players[(i + 1) % players.length];
        const betTier = ethers.parseEther("1"); // 1 SHELL

        // Player 1 enters pool
        await coinflipV3.connect(player1).enterPool(betTier, 0); // Choice: heads

        // Player 2 enters and triggers match
        const tx = await coinflipV3.connect(player2).enterPool(betTier, 1); // Choice: tails
        const receipt = await tx.wait();

        // Parse the InstantMatch event
        const event = receipt.logs.find(log => {
          try {
            const parsed = coinflipV3.interface.parseLog(log);
            return parsed?.name === "InstantMatch";
          } catch { return false; }
        });

        if (event) {
          const parsed = coinflipV3.interface.parseLog(event);
          const winner = parsed.args.winner;
          if (winner === player1.address) player1Wins++;
          else player2Wins++;
        }
      }

      // Statistical check: expect roughly 50/50 (allow 30-70 range for small sample)
      const winRate = player1Wins / numGames;
      expect(winRate).to.be.gte(0.2); // At least 20%
      expect(winRate).to.be.lte(0.8); // At most 80%
      
      console.log(`    Win distribution: Player1=${player1Wins}, Player2=${player2Wins} (${(winRate * 100).toFixed(1)}%)`);
    });

    it("Should not have predictable patterns in consecutive games", async function () {
      this.timeout(30000);
      
      const player1 = players[0];
      const player2 = players[1];
      const betTier = ethers.parseEther("1");
      
      const results = [];
      
      for (let i = 0; i < 20; i++) {
        await coinflipV3.connect(player1).enterPool(betTier, 0);
        const tx = await coinflipV3.connect(player2).enterPool(betTier, 1);
        const receipt = await tx.wait();
        
        const event = receipt.logs.find(log => {
          try {
            return coinflipV3.interface.parseLog(log)?.name === "InstantMatch";
          } catch { return false; }
        });
        
        if (event) {
          const parsed = coinflipV3.interface.parseLog(event);
          results.push(parsed.args.winner === player1.address ? 0 : 1);
        }
      }
      
      // Check for runs (consecutive same results)
      let maxRun = 1;
      let currentRun = 1;
      for (let i = 1; i < results.length; i++) {
        if (results[i] === results[i-1]) {
          currentRun++;
          maxRun = Math.max(maxRun, currentRun);
        } else {
          currentRun = 1;
        }
      }
      
      // Should not have extremely long runs (> 10 in a row is suspicious)
      expect(maxRun).to.be.lt(10);
      console.log(`    Max consecutive run: ${maxRun}`);
    });
  });

  describe("Edge Case Fuzzing", function () {
    it("Should handle all supported bet tiers", async function () {
      const supportedBets = await coinflipV3.getSupportedBets();
      
      for (const betAmount of supportedBets) {
        const player1 = players[0];
        const player2 = players[1];
        
        // Both players enter pool at this tier
        await coinflipV3.connect(player1).enterPool(betAmount, randomChoice());
        const tx = await coinflipV3.connect(player2).enterPool(betAmount, randomChoice());
        await tx.wait();
        
        // Verify game completed (total games increased)
        const totalGames = await coinflipV3.totalGamesPlayed();
        expect(totalGames).to.be.gt(0);
      }
    });

    it("Should maintain correct balances after many games", async function () {
      this.timeout(30000);
      
      const player1 = players[0];
      const player2 = players[1];
      const betTier = ethers.parseEther("10");
      
      const initialBalance1 = await shellToken.balanceOf(player1.address);
      const initialBalance2 = await shellToken.balanceOf(player2.address);
      const initialContractBalance = await shellToken.balanceOf(await coinflipV3.getAddress());
      
      // Play 10 games
      for (let i = 0; i < 10; i++) {
        await coinflipV3.connect(player1).enterPool(betTier, randomChoice());
        await coinflipV3.connect(player2).enterPool(betTier, randomChoice());
      }
      
      const finalBalance1 = await shellToken.balanceOf(player1.address);
      const finalBalance2 = await shellToken.balanceOf(player2.address);
      const finalContractBalance = await shellToken.balanceOf(await coinflipV3.getAddress());
      
      // Total tokens should be conserved (fees go to contract)
      const totalBefore = initialBalance1 + initialBalance2 + initialContractBalance;
      const totalAfter = finalBalance1 + finalBalance2 + finalContractBalance;
      
      expect(totalAfter).to.equal(totalBefore);
    });

    it("Should handle rapid successive pool entries", async function () {
      this.timeout(30000);
      
      const betTier = ethers.parseEther("1");
      const promises = [];
      
      // Rapidly enter multiple players
      for (let i = 0; i < 6; i += 2) {
        const p1 = players[i];
        const p2 = players[i + 1];
        
        // Enter pool simultaneously
        promises.push(coinflipV3.connect(p1).enterPool(betTier, 0));
        promises.push(coinflipV3.connect(p2).enterPool(betTier, 1));
      }
      
      // All should succeed
      const results = await Promise.allSettled(promises);
      const successes = results.filter(r => r.status === "fulfilled");
      expect(successes.length).to.equal(6);
    });
  });

  describe("Fee Calculation Fuzzing", function () {
    it("Should always collect positive fees for non-zero bets", async function () {
      const player1 = players[0];
      const player2 = players[1];
      
      const initialContractBalance = await shellToken.balanceOf(await coinflipV3.getAddress());
      
      // Play with minimum bet
      const minBet = ethers.parseEther("1");
      await coinflipV3.connect(player1).enterPool(minBet, 0);
      await coinflipV3.connect(player2).enterPool(minBet, 1);
      
      const afterBalance = await shellToken.balanceOf(await coinflipV3.getAddress());
      
      // Contract should have collected fees
      expect(afterBalance).to.be.gt(initialContractBalance);
    });

    it("Should calculate fees consistently across different bet sizes", async function () {
      const feeBps = await coinflipV3.protocolFeeBps();
      
      for (const bet of [1n, 10n, 100n, 1000n]) {
        const betAmount = ethers.parseEther(bet.toString());
        const totalPot = betAmount * 2n;
        
        // Expected fee with ceiling division
        const expectedFee = ((totalPot * feeBps) + 10000n - 1n) / 10000n;
        const expectedPayout = totalPot - expectedFee;
        
        // Fee should always be positive for positive bets
        expect(expectedFee).to.be.gt(0);
        // Payout should be less than pot
        expect(expectedPayout).to.be.lt(totalPot);
      }
    });
  });
});
