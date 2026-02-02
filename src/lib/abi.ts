/**
 * Contract ABIs - Extracted from page.tsx (#85)
 * Centralized ABI definitions for all game contracts
 */

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
] as const;

// Coinflip V3 ABI (core functions)
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
    name: "enterPool",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "betAmount", type: "uint256" },
      { name: "choice", type: "uint8" },
    ],
    outputs: [
      { name: "matched", type: "bool" },
      { name: "opponent", type: "address" },
      { name: "winner", type: "address" },
    ],
  },
  {
    name: "exitPool",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "betAmount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "createChallenge",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "challenged", type: "address" },
      { name: "betAmount", type: "uint256" },
      { name: "choice", type: "uint8" },
    ],
    outputs: [{ name: "challengeId", type: "uint256" }],
  },
  {
    name: "acceptChallenge",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "challengeId", type: "uint256" },
      { name: "choice", type: "uint8" },
    ],
    outputs: [],
  },
  {
    name: "cancelChallenge",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "challengeId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "getPoolStatus",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "betAmount", type: "uint256" }],
    outputs: [
      { name: "hasWaiting", type: "bool" },
      { name: "waitingPlayer", type: "address" },
      { name: "waitingChoice", type: "uint8" },
      { name: "waitingSince", type: "uint256" },
    ],
  },
  {
    name: "getAllPoolStatus",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "bets", type: "uint256[]" },
      { name: "hasWaiting", type: "bool[]" },
      { name: "waitingPlayers", type: "address[]" },
    ],
  },
  {
    name: "getSupportedBets",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256[]" }],
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
] as const;

// Roulette V2 ABI (core functions)
export const ROULETTE_ABI = [
  {
    name: "verifiedAgents",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
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
    outputs: [
      { name: "triggered", type: "bool" },
      { name: "eliminated", type: "address" },
    ],
  },
  {
    name: "exitChamber",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "betAmount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "getPoolStatus",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "betAmount", type: "uint256" }],
    outputs: [
      { name: "waitingCount", type: "uint8" },
      { name: "waitingPlayers", type: "address[]" },
      { name: "createdAt", type: "uint256" },
    ],
  },
  {
    name: "getSupportedBets",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256[]" }],
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
] as const;

// House Bankroll ABI
export const HOUSE_ABI = [
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
    name: "claimRewards",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "stakedBalance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalStaked",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "pendingRewards",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getBankroll",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
