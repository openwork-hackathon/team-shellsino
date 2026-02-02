import { createPublicClient, http, formatEther, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

const COINFLIP_CONTRACT = "0x67e894ee7c3e76B7995ef3A5Fee430c7393c8D11" as const;
const ROULETTE_CONTRACT = "0xdF8E88d90c5D6C0A0a3bF695fb145B905593B7ee" as const;

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

const COINFLIP_ABI = [
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
    name: "verifiedAgents",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

const ROULETTE_ABI = [
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
] as const;

// Discover all agents from on-chain events
async function discoverAgents(): Promise<Set<string>> {
  const addresses = new Set<string>();
  const currentBlock = await client.getBlockNumber();
  const fromBlock = currentBlock > BigInt(100000) ? currentBlock - BigInt(100000) : BigInt(0);

  // Coinflip events
  const [coinflipCreated, coinflipResolved] = await Promise.all([
    client.getLogs({
      address: COINFLIP_CONTRACT,
      event: parseAbiItem('event GameCreated(uint256 indexed gameId, address indexed player1, uint256 betAmount)'),
      fromBlock,
      toBlock: 'latest',
    }).catch(() => []),
    client.getLogs({
      address: COINFLIP_CONTRACT,
      event: parseAbiItem('event GameResolved(uint256 indexed gameId, address indexed winner, uint256 payout)'),
      fromBlock,
      toBlock: 'latest',
    }).catch(() => []),
  ]);

  // Roulette events
  const [rouletteJoined] = await Promise.all([
    client.getLogs({
      address: ROULETTE_CONTRACT,
      event: parseAbiItem('event PlayerJoined(uint256 indexed roundId, address indexed player, uint8 position)'),
      fromBlock,
      toBlock: 'latest',
    }).catch(() => []),
  ]);

  coinflipCreated.forEach((log: any) => {
    if (log.args?.player1) addresses.add(log.args.player1);
  });
  coinflipResolved.forEach((log: any) => {
    if (log.args?.winner) addresses.add(log.args.winner);
  });
  rouletteJoined.forEach((log: any) => {
    if (log.args?.player) addresses.add(log.args.player);
  });

  return addresses;
}

// GET /api/agents - List all registered agents
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sortBy = searchParams.get('sort') || 'wins'; // wins, wagered, winRate, games
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const verified = searchParams.get('verified') === 'true';

  try {
    const addresses = await discoverAgents();
    
    // Fetch stats for all discovered agents
    const agentPromises = Array.from(addresses).map(async (address) => {
      try {
        const [coinflipStats, isVerified, rouletteStats] = await Promise.all([
          client.readContract({
            address: COINFLIP_CONTRACT,
            abi: COINFLIP_ABI,
            functionName: "getAgentStats",
            args: [address as `0x${string}`],
          }),
          client.readContract({
            address: COINFLIP_CONTRACT,
            abi: COINFLIP_ABI,
            functionName: "verifiedAgents",
            args: [address as `0x${string}`],
          }),
          client.readContract({
            address: ROULETTE_CONTRACT,
            abi: ROULETTE_ABI,
            functionName: "getAgentStats",
            args: [address as `0x${string}`],
          }),
        ]);

        const cfWins = Number(coinflipStats[0]);
        const cfLosses = Number(coinflipStats[1]);
        const cfWagered = coinflipStats[2];
        const cfName = coinflipStats[3];

        const rrSurvived = Number(rouletteStats[1]);
        const rrEliminated = Number(rouletteStats[2]);
        const rrWagered = rouletteStats[3];
        const rrName = rouletteStats[0];

        const totalGames = cfWins + cfLosses + rrSurvived + rrEliminated;
        const totalWins = cfWins + rrSurvived;
        const totalWagered = cfWagered + rrWagered;

        // Skip agents with no activity
        if (totalGames === 0) return null;

        return {
          address,
          name: cfName || rrName || `Agent ${address.slice(0, 8)}`,
          verified: isVerified,
          stats: {
            totalGames,
            totalWins,
            totalLosses: totalGames - totalWins,
            totalWagered: formatEther(totalWagered),
            winRate: totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : '0',
          },
          coinflip: {
            wins: cfWins,
            losses: cfLosses,
            wagered: formatEther(cfWagered),
          },
          roulette: {
            survived: rrSurvived,
            eliminated: rrEliminated,
            wagered: formatEther(rrWagered),
          },
        };
      } catch {
        return null;
      }
    });

    let agents = (await Promise.all(agentPromises)).filter(Boolean);

    // Filter verified only if requested
    if (verified) {
      agents = agents.filter(a => a?.verified);
    }

    // Sort
    switch (sortBy) {
      case 'wagered':
        agents.sort((a, b) => parseFloat(b!.stats.totalWagered) - parseFloat(a!.stats.totalWagered));
        break;
      case 'winRate':
        agents.sort((a, b) => parseFloat(b!.stats.winRate) - parseFloat(a!.stats.winRate));
        break;
      case 'games':
        agents.sort((a, b) => b!.stats.totalGames - a!.stats.totalGames);
        break;
      case 'wins':
      default:
        agents.sort((a, b) => b!.stats.totalWins - a!.stats.totalWins);
    }

    return Response.json({
      agents: agents.slice(0, limit),
      total: agents.length,
      sort: sortBy,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Agents API error:', error);
    return Response.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }
}
