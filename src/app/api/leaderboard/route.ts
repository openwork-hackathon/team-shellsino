import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

const COINFLIP_CONTRACT = "0x67e894ee7c3e76B7995ef3A5Fee430c7393c8D11" as const;

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

const KNOWN_AGENTS = [
  "0xDE4d70bD43c3BE4f6745d47a2C93400cB61910F1",
];

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
    const agentStats = await Promise.all(
      KNOWN_AGENTS.map(async (address) => {
        try {
          const stats = await client.readContract({
            address: COINFLIP_CONTRACT,
            abi: COINFLIP_ABI,
            functionName: "getAgentStats",
            args: [address as \`0x\${string}\`],
          });
          
          const wins = Number(stats[0]);
          const losses = Number(stats[1]);
          const total = wins + losses;
          
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
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Leaderboard API error:', error);
    return Response.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
