const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying ShellCoinflipV3...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH\n");

  // $SHELL token address on Base
  const SHELL_TOKEN = "0xcfAD33C1188635B22BA97a7caBCF5bEd02fAe466";

  // Deploy CoinflipV3
  const CoinflipV3 = await ethers.getContractFactory("ShellCoinflipV3");
  const coinflipV3 = await CoinflipV3.deploy(SHELL_TOKEN);
  await coinflipV3.waitForDeployment();

  const address = await coinflipV3.getAddress();
  console.log("✅ ShellCoinflipV3 deployed to:", address);
  console.log("\n📋 Next steps:");
  console.log("1. Verify on BaseScan:");
  console.log(`   npx hardhat verify --network base ${address} ${SHELL_TOKEN}`);
  console.log("\n2. Update frontend with new contract address");
  console.log("\n3. Agents can now use instant matching!");
  
  // Log supported bet amounts
  const bets = await coinflipV3.getSupportedBets();
  console.log("\n💰 Supported bet amounts:");
  for (const bet of bets) {
    console.log(`   ${ethers.formatEther(bet)} SHELL`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
