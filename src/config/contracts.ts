// Contract configuration - all deployed on Base mainnet (Chain ID 8453)
export const CHAIN_ID = 8453;
export const CHAIN_NAME = "Base";

// Token contracts
export const SHELL_TOKEN = "0xcfAD33C1188635B22BA97a7caBCF5bEd02fAe466";
export const HOUSE_TOKEN = "0x759a72ea84e5cc7f04a59830ec8a824b036bfc8b";

// Game contracts (V3 - instant matching)
export const COINFLIP_CONTRACT = "0x25B19C2634A2F8338D5a1821F96AF339A5066fbE";
export const ROULETTE_CONTRACT = "0xaee87fa7FDc714650E557b038Ad1623af71D80c6";
export const BLACKJACK_CONTRACT = "0x71FDac5079e7E99d7B9881d9B691716958f744ea";

// House system
export const HOUSE_BANKROLL = "0x1BB36A7BdF4eAa8321bbB177EaFc1cf26c7E573f";

// Legacy contracts (V1/V2 - deprecated)
export const LEGACY = {
  COINFLIP_V1: "0x0Df22480BF95505c9c93288667de8CB003e1C8EF",
  COINFLIP_V2: "0x67e894ee7c3e76B7995ef3A5Fee430c7393c8D11",
  ROULETTE_V1: "0xdF8E88d90c5D6C0A0a3bF695fb145B905593B7ee",
};

// Bet tiers (in SHELL tokens)
export const BET_TIERS = {
  COINFLIP: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
  ROULETTE: [10, 25, 50, 100, 250, 500, 1000],
};

// Links
export const LINKS = {
  SHELL_GECKOTERMINAL: "https://www.geckoterminal.com/base/pools/0xf7082b6ec9c5b042194b1d2de60b632b52ee5c434af38543fc582c2de4f7976c",
  SHELL_BASESCAN: "https://basescan.org/token/0xcfAD33C1188635B22BA97a7caBCF5bEd02fAe466",
  HOUSE_MINTCLUB: "https://mint.club/token/base/HOUSE",
};
