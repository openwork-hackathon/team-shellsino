const { ethers } = require("hardhat");

async function main() {
  const HOUSE_BANKROLL = "0x1BB36A7BdF4eAa8321bbB177EaFc1cf26c7E573f";
  const INSTANT_BLACKJACK = "0x0aE4882Ff9820f86452Cb36e078E33525Fd26a53";
  
  console.log("🔐 Authorizing InstantBlackjack on HouseBankroll...\n");
  
  const houseBankroll = await ethers.getContractAt(
    ["function setGameAuthorization(address game, bool authorized) external"],
    HOUSE_BANKROLL
  );
  
  const tx = await houseBankroll.setGameAuthorization(INSTANT_BLACKJACK, true);
  await tx.wait();
  
  console.log("✅ InstantBlackjack authorized!");
  console.log("   TX:", tx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
