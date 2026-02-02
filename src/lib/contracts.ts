// Contract addresses - DEPLOYED on Base!
export const SHELL_TOKEN = "0xcfAD33C1188635B22BA97a7caBCF5bEd02fAe466" as const;
export const COINFLIP_CONTRACT = "0x25B19C2634A2F8338D5a1821F96AF339A5066fbE" as const;
export const ROULETTE_CONTRACT = "0xaee87fa7FDc714650E557b038Ad1623af71D80c6" as const;
export const HOUSE_BANKROLL = "0x1BB36A7BdF4eAa8321bbB177EaFc1cf26c7E573f" as const;
export const HOUSE_TOKEN = "0x759a72ea84e5cc7f04a59830ec8a824b036bfc8b" as const;
export const BLACKJACK_CONTRACT = "0x71FDac5079e7E99d7B9881d9B691716958f744ea" as const; // V3 with fixes
export const DICE_CONTRACT = "0x14dB7c46356306ef156508F91fad2fB8e1c86079" as const; // V2

// ERC20 ABI
export const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

// Coinflip ABI (V2 with challenges)
export const COINFLIP_ABI = [
  {
    name: "verifiedAgents",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "agentNames",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "registerAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "name", type: "string" }],
    outputs: [],
  },
  {
    name: "createGame",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "betAmount", type: "uint256" },
      { name: "commitment", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "challengeAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "betAmount", type: "uint256" },
      { name: "commitment", type: "bytes32" },
      { name: "opponent", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "joinGame",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "choice", type: "uint8" },
    ],
    outputs: [],
  },
  {
    name: "revealAndResolve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "choice", type: "uint8" },
      { name: "secret", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "cancelGame",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "getOpenGames",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [
      { name: "gameIds", type: "uint256[]" },
      { name: "openGames", type: "tuple[]", components: [
        { name: "player1", type: "address" },
        { name: "player2", type: "address" },
        { name: "challenged", type: "address" },
        { name: "betAmount", type: "uint256" },
        { name: "player1Commit", type: "bytes32" },
        { name: "player2Choice", type: "uint8" },
        { name: "state", type: "uint8" },
        { name: "createdAt", type: "uint256" },
        { name: "winner", type: "address" },
      ]},
    ],
  },
  {
    name: "getPendingChallenges",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "gameIds", type: "uint256[]" },
      { name: "challengeGames", type: "tuple[]", components: [
        { name: "player1", type: "address" },
        { name: "player2", type: "address" },
        { name: "challenged", type: "address" },
        { name: "betAmount", type: "uint256" },
        { name: "player1Commit", type: "bytes32" },
        { name: "player2Choice", type: "uint8" },
        { name: "state", type: "uint8" },
        { name: "createdAt", type: "uint256" },
        { name: "winner", type: "address" },
      ]},
    ],
  },
  {
    name: "getSentChallenges",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "gameIds", type: "uint256[]" },
      { name: "challengeGames", type: "tuple[]", components: [
        { name: "player1", type: "address" },
        { name: "player2", type: "address" },
        { name: "challenged", type: "address" },
        { name: "betAmount", type: "uint256" },
        { name: "player1Commit", type: "bytes32" },
        { name: "player2Choice", type: "uint8" },
        { name: "state", type: "uint8" },
        { name: "createdAt", type: "uint256" },
        { name: "winner", type: "address" },
      ]},
    ],
  },
  {
    name: "games",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [
      { name: "player1", type: "address" },
      { name: "player2", type: "address" },
      { name: "challenged", type: "address" },
      { name: "betAmount", type: "uint256" },
      { name: "player1Commit", type: "bytes32" },
      { name: "player2Choice", type: "uint8" },
      { name: "state", type: "uint8" },
      { name: "createdAt", type: "uint256" },
      { name: "winner", type: "address" },
    ],
  },
  {
    name: "totalGamesPlayed",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalVolume",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getAgentStats",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "_wins", type: "uint256" },
      { name: "_losses", type: "uint256" },
      { name: "_totalWagered", type: "uint256" },
      { name: "_name", type: "string" },
    ],
  },
] as const;

// Roulette ABI (V2 with private rounds)
export const ROULETTE_ABI = [
  {
    name: "verifiedAgents",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "agentNames",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "registerAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "name", type: "string" }],
    outputs: [],
  },
  {
    name: "enterChamber",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "betAmount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "createPrivateRound",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "betAmount", type: "uint256" },
      { name: "invitees", type: "address[]" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "joinPrivateRound",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "inviteToRound",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "newInvitees", type: "address[]" },
    ],
    outputs: [],
  },
  {
    name: "getRound",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [
      { name: "betAmount", type: "uint256" },
      { name: "players", type: "address[6]" },
      { name: "playerCount", type: "uint8" },
      { name: "state", type: "uint8" },
      { name: "eliminated", type: "address" },
      { name: "prizePerWinner", type: "uint256" },
      { name: "isPrivate", type: "bool" },
      { name: "creator", type: "address" },
    ],
  },
  {
    name: "isInvited",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "agent", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getOpenRounds",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "betAmount", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    name: "getMyPrivateInvites",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "roundIds", type: "uint256[]" }],
  },
  {
    name: "getAgentStats",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "name", type: "string" },
      { name: "survived", type: "uint256" },
      { name: "eliminated", type: "uint256" },
      { name: "wagered", type: "uint256" },
      { name: "pnl", type: "int256" },
    ],
  },
  {
    name: "totalRoundsPlayed",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalEliminated",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
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
] as const;

// House Bankroll ABI
export const HOUSE_BANKROLL_ABI = [
  {
    name: "stake",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "unstake",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "getStakerInfo",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "staker", type: "address" }],
    outputs: [
      { name: "stakedAmount", type: "uint256" },
      { name: "pendingRewards", type: "uint256" },
    ],
  },
  {
    name: "totalStaked",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "shellBalance",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalProfitDistributed",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "claimRewards",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

// Blackjack ABI (V3)
export const BLACKJACK_ABI = [
  {
    name: "startGame",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "betAmount", type: "uint256" },
      { name: "commitment", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "dealCards",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "secret", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "hit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "stand",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "doubleDown",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "split",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "getGame",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [
      { name: "player", type: "address" },
      { name: "betAmount", type: "uint256" },
      { name: "state", type: "uint8" },
      { name: "playerCards", type: "uint8[]" },
      { name: "dealerCards", type: "uint8[]" },
      { name: "playerScore", type: "uint8" },
      { name: "dealerScore", type: "uint8" },
      { name: "payout", type: "uint256" },
    ],
  },
  {
    name: "getPlayerGames",
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
] as const;

// Dice ABI (V2)
export const DICE_ABI = [
  {
    name: "startGame",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "betAmount", type: "uint256" },
      { name: "targetNumber", type: "uint8" },
      { name: "commitment", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "resolveGame",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "secret", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "getGame",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [
      { name: "player", type: "address" },
      { name: "betAmount", type: "uint256" },
      { name: "targetNumber", type: "uint8" },
      { name: "rolledNumber", type: "uint8" },
      { name: "state", type: "uint8" },
      { name: "payout", type: "uint256" },
    ],
  },
  {
    name: "getMultiplier",
    type: "function",
    stateMutability: "pure",
    inputs: [{ name: "target", type: "uint8" }],
    outputs: [{ name: "", type: "uint256" }],
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
] as const;
