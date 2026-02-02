import { createPublicClient, http, formatEther, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

const COINFLIP_CONTRACT = "0x67e894ee7c3e76B7995ef3A5Fee430c7393c8D11" as const;

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

// Fix #60: Discover agents from on-chain events instead of hardcoding
const BLOCKS_TO_SCAN = BigInt(50000); // ~7 hours on Base

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
] as const;

export async function GET() {
  try {
    // Get current block for event scanning
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock > BLOCKS_TO_SCAN ? currentBlock - BLOCKS_TO_SCAN : BigInt(0);

    // Scan GameResolved events to find active players
    const gameLogs = await client.getLogs({
      address: COINFLIP_CONTRACT,
      event: parseAbiItem('event GameResolved(uint256 indexed gameId, address indexed winner, uint256 payout)'),
      fromBlock,
      toBlock: 'latest',
    }).catch(() => []);

    // Also scan GameCreated events
    const createLogs = await client.getLogs({
      address: COINFLIP_CONTRACT,
      event: parseAbiItem('event GameCreated(uint256 indexed gameId, address indexed player1, uint256 betAmount)'),
      fromBlock,
      toBlock: 'latest',
    }).catch(() => []);

    // Collect unique addresses
    const addresses = new Set<string>();
    gameLogs.forEach((log: any) => {
      if (log.args?.winner) addresses.add(log.args.winner);
    });
    createLogs.forEach((log: any) => {
      if (log.args?.player1) addresses.add(log.args.player1);
    });

    // If no events found, use fallback addresses
    if (addresses.size === 0) {
      addresses.add("0xDE4d70bD43c3BE4f6745d47a2C93400cB61910F1");
    }

    // Fetch stats for discovered agents (limit to 20)
    const agentAddresses = Array.from(addresses).slice(0, 20);
    
    const agentStats = await Promise.all(
      agentAddresses.map(async (address) => {
        try {
          const stats = await client.readContract({
            address: COINFLIP_CONTRACT,
            abi: COINFLIP_ABI,
            functionName: "getAgentStats",
            args: [address as `0x${string}`],
          });
          
          const wins = Number(stats[0]);
          const losses = Number(stats[1]);
          const total = wins + losses;
          
          // Only include agents who have played at least 1 game
          if (total === 0) return null;
          
          return {
            address,
            name: stats[3] || address.slice(0, 8),
            wins,
            losses,
            totalWagered: formatEther(stats[2]),
            winRate: total > 0 ? ((wins / total) * 100).toFixed(1) : '0',
            gamesPlayed: total,
          };
        } catch {
          return null;
        }
      })
    );

    const validStats = agentStats.filter(Boolean);
    const byWins = [...validStats].sort((a, b) => (b?.wins || 0) - (a?.wins || 0));

    return Response.json({
      topWinners: byWins.slice(0, 10),
      totalAgents: validStats.length,
      totalAddressesScanned: addresses.size,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Leaderboard API error:', error);
    return Response.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
