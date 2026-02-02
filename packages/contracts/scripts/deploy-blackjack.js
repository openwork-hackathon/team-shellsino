const { ethers } = require("hardhat");

async function main() {
  console.log("🃏 Deploying InstantBlackjack...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH\n");

  const SHELL_TOKEN = "0xcfAD33C1188635B22BA97a7caBCF5bEd02fAe466";
  const HOUSE_BANKROLL = "0x1BB36A7BdF4eAa8321bbB177EaFc1cf26c7E573f";

  const InstantBlackjack = await ethers.getContractFactory("InstantBlackjack");
  const instantBlackjack = await InstantBlackjack.deploy(SHELL_TOKEN, HOUSE_BANKROLL);
  await instantBlackjack.waitForDeployment();
  
  const address = await instantBlackjack.getAddress();
  console.log("✅ InstantBlackjack deployed to:", address);
  
  console.log("\n⚠️  Authorize on HouseBankroll:");
  console.log(`   houseBankroll.setGameAuthorization("${address}", true)`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
