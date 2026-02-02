/**
 * Agent Store - Server-side storage for registered agents
 * 
 * For hackathon MVP: Uses file-based JSON storage
 * Production: Replace with proper database (Supabase, Postgres, etc.)
 */

import { randomBytes, createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.data');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export interface Agent {
  id: string;
  name: string;
  apiKey: string;           // Hashed for storage
  apiKeyPrefix: string;     // First 8 chars for identification
  depositAddress: string;   // Unique deposit address for this agent
  balance: string;          // Internal $SHELL balance (wei string)
  webhook?: string;         // Optional callback URL
  walletAddress?: string;   // Optional linked wallet for direct on-chain play
  createdAt: string;
  lastActiveAt: string;
  stats: {
    gamesPlayed: number;
    totalWagered: string;
    totalWon: string;
    totalLost: string;
  };
}

interface AgentStore {
  agents: Record<string, Agent>;  // Keyed by apiKeyHash
  nameIndex: Record<string, string>;  // name -> apiKeyHash
  depositIndex: Record<string, string>;  // depositAddress -> apiKeyHash
}

function loadStore(): AgentStore {
  ensureDataDir();
  try {
    if (fs.existsSync(AGENTS_FILE)) {
      const data = fs.readFileSync(AGENTS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load agent store:', e);
  }
  return { agents: {}, nameIndex: {}, depositIndex: {} };
}

function saveStore(store: AgentStore) {
  ensureDataDir();
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(store, null, 2));
}

function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

function generateApiKey(): string {
  // Format: sk_shell_<32 random hex chars>
  return `sk_shell_${randomBytes(16).toString('hex')}`;
}

function generateAgentId(): string {
  return `agent_${randomBytes(8).toString('hex')}`;
}

function generateDepositAddress(): string {
  // For MVP: Generate a deterministic address from agent ID
  // Production: Use actual HD wallet derivation or smart contract accounts
  return `0x${randomBytes(20).toString('hex')}`;
}

// ============ Public API ============

export function registerAgent(name: string, webhook?: string): { 
  agent: Omit<Agent, 'apiKey'> & { apiKey: string }; 
  error?: string;
} {
  const store = loadStore();
  
  // Check if name is taken
  const normalizedName = name.toLowerCase().trim();
  if (store.nameIndex[normalizedName]) {
    return { 
      agent: null as any, 
      error: `Agent name "${name}" is already taken. Please choose a different name.` 
    };
  }
  
  // Validate name
  if (name.length < 2 || name.length > 32) {
    return { agent: null as any, error: 'Name must be 2-32 characters' };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return { agent: null as any, error: 'Name can only contain letters, numbers, underscores, and hyphens' };
  }
  
  // Generate credentials
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);
  const agentId = generateAgentId();
  const depositAddress = generateDepositAddress();
  
  const agent: Agent = {
    id: agentId,
    name,
    apiKey: apiKeyHash,  // Store hashed
    apiKeyPrefix: apiKey.slice(0, 16),  // sk_shell_XXXXXXXX
    depositAddress,
    balance: '0',
    webhook,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    stats: {
      gamesPlayed: 0,
      totalWagered: '0',
      totalWon: '0',
      totalLost: '0',
    },
  };
  
  // Save to store
  store.agents[apiKeyHash] = agent;
  store.nameIndex[normalizedName] = apiKeyHash;
  store.depositIndex[depositAddress.toLowerCase()] = apiKeyHash;
  saveStore(store);
  
  // Return with unhashed API key (only time it's shown!)
  return {
    agent: {
      ...agent,
      apiKey,  // Return unhashed for user to save
    },
  };
}

export function getAgentByApiKey(apiKey: string): Agent | null {
  const store = loadStore();
  const apiKeyHash = hashApiKey(apiKey);
  const agent = store.agents[apiKeyHash];
  
  if (agent) {
    // Update last active
    agent.lastActiveAt = new Date().toISOString();
    saveStore(store);
  }
  
  return agent || null;
}

export function getAgentByName(name: string): Omit<Agent, 'apiKey'> | null {
  const store = loadStore();
  const normalizedName = name.toLowerCase().trim();
  const apiKeyHash = store.nameIndex[normalizedName];
  
  if (!apiKeyHash) return null;
  
  const agent = store.agents[apiKeyHash];
  if (!agent) return null;
  
  // Don't expose apiKey hash
  const { apiKey, ...safeAgent } = agent;
  return safeAgent;
}

export function getAgentById(id: string): Omit<Agent, 'apiKey'> | null {
  const store = loadStore();
  
  for (const agent of Object.values(store.agents)) {
    if (agent.id === id) {
      const { apiKey, ...safeAgent } = agent;
      return safeAgent;
    }
  }
  
  return null;
}

export function updateAgentBalance(apiKey: string, newBalance: string): boolean {
  const store = loadStore();
  const apiKeyHash = hashApiKey(apiKey);
  const agent = store.agents[apiKeyHash];
  
  if (!agent) return false;
  
  agent.balance = newBalance;
  agent.lastActiveAt = new Date().toISOString();
  saveStore(store);
  return true;
}

export function updateAgentStats(
  apiKey: string, 
  wagered: string, 
  won: string, 
  lost: string
): boolean {
  const store = loadStore();
  const apiKeyHash = hashApiKey(apiKey);
  const agent = store.agents[apiKeyHash];
  
  if (!agent) return false;
  
  agent.stats.gamesPlayed += 1;
  agent.stats.totalWagered = (BigInt(agent.stats.totalWagered) + BigInt(wagered)).toString();
  agent.stats.totalWon = (BigInt(agent.stats.totalWon) + BigInt(won)).toString();
  agent.stats.totalLost = (BigInt(agent.stats.totalLost) + BigInt(lost)).toString();
  agent.lastActiveAt = new Date().toISOString();
  saveStore(store);
  return true;
}

export function linkWallet(apiKey: string, walletAddress: string): boolean {
  const store = loadStore();
  const apiKeyHash = hashApiKey(apiKey);
  const agent = store.agents[apiKeyHash];
  
  if (!agent) return false;
  
  agent.walletAddress = walletAddress;
  agent.lastActiveAt = new Date().toISOString();
  saveStore(store);
  return true;
}

export function listAgents(limit = 50): Array<Omit<Agent, 'apiKey'>> {
  const store = loadStore();
  
  return Object.values(store.agents)
    .map(({ apiKey, ...agent }) => agent)
    .sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime())
    .slice(0, limit);
}

// Validate API key format
export function isValidApiKeyFormat(apiKey: string): boolean {
  return /^sk_shell_[a-f0-9]{32}$/.test(apiKey);
}
