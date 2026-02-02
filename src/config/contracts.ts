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

// New game contracts (to be deployed)
export const SLOTS_CONTRACT = "0x0000000000000000000000000000000000000000"; // Deploy ShellSlots
export const DICE_V2_CONTRACT = "0x0000000000000000000000000000000000000000"; // Deploy ShellDiceV2
export const PLINKO_CONTRACT = "0x0000000000000000000000000000000000000000"; // Deploy ShellPlinko

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
  SLOTS: [1, 5, 10, 25, 50, 100],
  DICE: [1, 5, 10, 25, 50, 100, 250],
  PLINKO: [1, 5, 10, 25, 50, 100],
};

// Links
export const LINKS = {
  SHELL_GECKOTERMINAL: "https://www.geckoterminal.com/base/pools/0xf7082b6ec9c5b042194b1d2de60b632b52ee5c434af38543fc582c2de4f7976c",
  SHELL_BASESCAN: "https://basescan.org/token/0xcfAD33C1188635B22BA97a7caBCF5bEd02fAe466",
  HOUSE_MINTCLUB: "https://mint.club/token/base/HOUSE",
};

// ABI Exports for new contracts

export const SLOTS_ABI = [
  {
    name: "spin",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "betAmount", type: "uint256" }],
    outputs: [{ name: "spinId", type: "uint256" }],
  },
  {
    name: "getSpin",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "spinId", type: "uint256" }],
    outputs: [
      { name: "player", type: "address" },
      { name: "bet", type: "uint256" },
      { name: "reels", type: "uint256[3]" },
      { name: "payout", type: "uint256" },
      { name: "timestamp", type: "uint256" },
      { name: "settled", type: "bool" },
    ],
  },
  {
    name: "getPlayerSpins",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    name: "minBet",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "maxBet",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "symbolMultipliers",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalWagered",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalPaidOut",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "spinCounter",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "SpinResult",
    type: "event",
    inputs: [
      { name: "spinId", type: "uint256", indexed: true },
      { name: "reels", type: "uint256[3]" },
      { name: "payout", type: "uint256" },
      { name: "result", type: "string" },
    ],
  },
] as const;

export const DICE_V2_ABI = [
  {
    name: "rollUnder",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "betAmount", type: "uint256" },
      { name: "targetNumber", type: "uint8" },
    ],
    outputs: [{ name: "rollId", type: "uint256" }],
  },
  {
    name: "rollOver",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "betAmount", type: "uint256" },
      { name: "targetNumber", type: "uint8" },
    ],
    outputs: [{ name: "rollId", type: "uint256" }],
  },
  {
    name: "getRoll",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "rollId", type: "uint256" }],
    outputs: [
      { name: "player", type: "address" },
      { name: "betAmount", type: "uint256" },
      { name: "targetNumber", type: "uint8" },
      { name: "rolledNumber", type: "uint8" },
      { name: "multiplier", type: "uint256" },
      { name: "payout", type: "uint256" },
      { name: "won", type: "bool" },
      { name: "timestamp", type: "uint256" },
      { name: "rollOver", type: "bool" },
    ],
  },
  {
    name: "getPlayerRolls",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    name: "getMultiplier",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "targetNumber", type: "uint8" },
      { name: "rollOver", type: "bool" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getWinChance",
    type: "function",
    stateMutability: "pure",
    inputs: [
      { name: "targetNumber", type: "uint8" },
      { name: "rollOver", type: "bool" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getPotentialPayout",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "betAmount", type: "uint256" },
      { name: "targetNumber", type: "uint8" },
      { name: "rollOver", type: "bool" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getPlayerStats",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [
      { name: "_wins", type: "uint256" },
      { name: "_losses", type: "uint256" },
      { name: "_totalWagered", type: "uint256" },
      { name: "_profitLoss", type: "int256" },
      { name: "_biggestWin", type: "uint256" },
      { name: "_winRate", type: "uint256" },
    ],
  },
  {
    name: "minBet",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "maxBet",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "houseEdgeBps",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalGamesPlayed",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "DiceRolled",
    type: "event",
    inputs: [
      { name: "rollId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "betAmount", type: "uint256" },
      { name: "targetNumber", type: "uint8" },
      { name: "rolledNumber", type: "uint8" },
      { name: "multiplier", type: "uint256" },
      { name: "payout", type: "uint256" },
      { name: "won", type: "bool" },
      { name: "rollOver", type: "bool" },
    ],
  },
] as const;

export const PLINKO_ABI = [
  {
    name: "drop",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "betAmount", type: "uint256" },
      { name: "numRows", type: "uint8" },
      { name: "riskLevel", type: "uint8" },
    ],
    outputs: [{ name: "dropId", type: "uint256" }],
  },
  {
    name: "getDrop",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "dropId", type: "uint256" }],
    outputs: [
      { name: "player", type: "address" },
      { name: "betAmount", type: "uint256" },
      { name: "numRows", type: "uint8" },
      { name: "riskLevel", type: "uint8" },
      { name: "finalSlot", type: "uint8" },
      { name: "multiplier", type: "uint256" },
      { name: "payout", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
  },
  {
    name: "getPlayerDrops",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    name: "getMultipliers",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "numRows", type: "uint8" },
      { name: "riskLevel", type: "uint8" },
    ],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    name: "getPotentialPayout",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "betAmount", type: "uint256" },
      { name: "numRows", type: "uint8" },
      { name: "riskLevel", type: "uint8" },
      { name: "slot", type: "uint8" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getMaxPayout",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "betAmount", type: "uint256" },
      { name: "numRows", type: "uint8" },
      { name: "riskLevel", type: "uint8" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getPlayerStats",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [
      { name: "_wins", type: "uint256" },
      { name: "_losses", type: "uint256" },
      { name: "_totalWagered", type: "uint256" },
      { name: "_profitLoss", type: "int256" },
      { name: "_biggestWin", type: "uint256" },
      { name: "_winRate", type: "uint256" },
    ],
  },
  {
    name: "getExpectedRTP",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "numRows", type: "uint8" },
      { name: "riskLevel", type: "uint8" },
    ],
    outputs: [{ name: "rtpBps", type: "uint256" }],
  },
  {
    name: "minBet",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "maxBet",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "MIN_ROWS",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "MAX_ROWS",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalGamesPlayed",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "BallDropped",
    type: "event",
    inputs: [
      { name: "dropId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "betAmount", type: "uint256" },
      { name: "numRows", type: "uint8" },
      { name: "riskLevel", type: "uint8" },
      { name: "finalSlot", type: "uint8" },
      { name: "multiplier", type: "uint256" },
      { name: "payout", type: "uint256" },
    ],
  },
] as const;
