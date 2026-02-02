const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying All V2 Instant Games...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH\n");

  // Contract addresses on Base
  const SHELL_TOKEN = "0xcfAD33C1188635B22BA97a7caBCF5bEd02fAe466";
  const HOUSE_BANKROLL = "0x1BB36A7BdF4eAa8321bbB177EaFc1cf26c7E573f";

  const deployed = {};

  // Deploy RouletteV2
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💀 Deploying ShellRouletteV2...");
  const RouletteV2 = await ethers.getContractFactory("ShellRouletteV2");
  const rouletteV2 = await RouletteV2.deploy(SHELL_TOKEN);
  await rouletteV2.waitForDeployment();
  deployed.rouletteV2 = await rouletteV2.getAddress();
  console.log("✅ ShellRouletteV2:", deployed.rouletteV2);

  // Deploy InstantBlackjack
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🃏 Deploying InstantBlackjack...");
  const InstantBlackjack = await ethers.getContractFactory("InstantBlackjack");
  const instantBlackjack = await InstantBlackjack.deploy(SHELL_TOKEN, HOUSE_BANKROLL);
  await instantBlackjack.waitForDeployment();
  deployed.instantBlackjack = await instantBlackjack.getAddress();
  console.log("✅ InstantBlackjack:", deployed.instantBlackjack);

  // Summary
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎉 ALL V2 GAMES DEPLOYED!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("💀 RouletteV2:      ", deployed.rouletteV2);
  console.log("🃏 InstantBlackjack:", deployed.instantBlackjack);
  
  console.log("\n📋 Verification commands:");
  console.log(`npx hardhat verify --network base ${deployed.rouletteV2} ${SHELL_TOKEN}`);
  console.log(`npx hardhat verify --network base ${deployed.instantBlackjack} ${SHELL_TOKEN} ${HOUSE_BANKROLL}`);
  
  console.log("\n⚠️  Don't forget to authorize InstantBlackjack on HouseBankroll!");
  console.log(`   houseBankroll.setGameAuthorization("${deployed.instantBlackjack}", true)`);

  // Check final balance
  const finalBalance = await ethers.provider.getBalance(deployer.address);
  console.log("\n💰 Gas spent:", ethers.formatEther(balance - finalBalance), "ETH");
  console.log("💰 Remaining:", ethers.formatEther(finalBalance), "ETH");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
