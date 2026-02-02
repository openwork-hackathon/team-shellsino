import { createPublicClient, http, formatEther, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

const COINFLIP_CONTRACT = "0x67e894ee7c3e76B7995ef3A5Fee430c7393c8D11" as const;

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

const COINFLIP_ABI = [
  {
    name: "agentNames",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "string" }],
  },
  {
    name: "verifiedAgents",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

interface HotAgent {
  address: string;
  name: string;
  verified: boolean;
  recentWins: number;
  recentLosses: number;
  recentVolume: string;
  streak: {
    type: 'win' | 'loss';
    count: number;
  };
  lastActive: string;
  heat: number; // 0-100 "hotness" score
}

// GET /api/hot - Get currently "hot" agents (active, winning)
export async function GET() {
  try {
    const currentBlock = await client.getBlockNumber();
    // Last 2 hours of activity (~3600 blocks on Base)
    const fromBlock = currentBlock - BigInt(3600);

    // Get recent game events
    const [createdLogs, resolvedLogs] = await Promise.all([
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

    // Track agent activity
    const agentActivity: Record<string, {
      wins: number;
      losses: number;
      volume: bigint;
      results: ('win' | 'loss')[];
      lastBlock: bigint;
    }> = {};

    // Process created games
    createdLogs.forEach((log: any) => {
      const player = log.args?.player1;
      const betAmount = log.args?.betAmount || BigInt(0);
      const block = log.blockNumber || BigInt(0);
      
      if (player) {
        if (!agentActivity[player]) {
          agentActivity[player] = { wins: 0, losses: 0, volume: BigInt(0), results: [], lastBlock: BigInt(0) };
        }
        agentActivity[player].volume += betAmount;
        if (block > agentActivity[player].lastBlock) {
          agentActivity[player].lastBlock = block;
        }
      }
    });

    // Process resolved games
    resolvedLogs.forEach((log: any) => {
      const winner = log.args?.winner;
      const payout = log.args?.payout || BigInt(0);
      const block = log.blockNumber || BigInt(0);
      
      if (winner) {
        if (!agentActivity[winner]) {
          agentActivity[winner] = { wins: 0, losses: 0, volume: BigInt(0), results: [], lastBlock: BigInt(0) };
        }
        agentActivity[winner].wins++;
        agentActivity[winner].volume += payout;
        agentActivity[winner].results.push('win');
        if (block > agentActivity[winner].lastBlock) {
          agentActivity[winner].lastBlock = block;
        }
      }
    });

    // Calculate hot agents
    const hotAgents: HotAgent[] = await Promise.all(
      Object.entries(agentActivity).map(async ([address, activity]) => {
        try {
          const [name, verified] = await Promise.all([
            client.readContract({
              address: COINFLIP_CONTRACT,
              abi: COINFLIP_ABI,
              functionName: "agentNames",
              args: [address as `0x${string}`],
            }).catch(() => ''),
            client.readContract({
              address: COINFLIP_CONTRACT,
              abi: COINFLIP_ABI,
              functionName: "verifiedAgents",
              args: [address as `0x${string}`],
            }).catch(() => false),
          ]);

          // Calculate streak
          let streakType: 'win' | 'loss' = 'win';
          let streakCount = 0;
          for (let i = activity.results.length - 1; i >= 0; i--) {
            if (i === activity.results.length - 1) {
              streakType = activity.results[i];
              streakCount = 1;
            } else if (activity.results[i] === streakType) {
              streakCount++;
            } else {
              break;
            }
          }

          // Calculate "heat" score (0-100)
          // Based on: wins, volume, streak, recency
          const totalGames = activity.wins + activity.losses;
          const winRate = totalGames > 0 ? activity.wins / totalGames : 0;
          const volumeScore = Math.min(parseFloat(formatEther(activity.volume)) / 1000, 1); // Normalize to 1000 SHELL
          const streakBonus = streakType === 'win' ? streakCount * 10 : 0;
          const recencyBonus = Number(currentBlock - activity.lastBlock) < 500 ? 20 : 0; // Active in last ~15 min
          
          const heat = Math.min(100, Math.round(
            (winRate * 30) + 
            (volumeScore * 20) + 
            (totalGames * 5) + 
            streakBonus + 
            recencyBonus
          ));

          return {
            address,
            name: name || `Agent ${address.slice(0, 8)}`,
            verified,
            recentWins: activity.wins,
            recentLosses: activity.losses,
            recentVolume: formatEther(activity.volume),
            streak: {
              type: streakType,
              count: streakCount,
            },
            lastActive: `~${Math.floor(Number(currentBlock - activity.lastBlock) * 2 / 60)} min ago`,
            heat,
          };
        } catch {
          return null;
        }
      })
    ).then(results => results.filter(Boolean) as HotAgent[]);

    // Sort by heat score
    hotAgents.sort((a, b) => b.heat - a.heat);

    // Get top 10 hottest
    const top = hotAgents.slice(0, 10);

    // Find the hottest agent
    const hottestAgent = top[0] || null;

    return Response.json({
      hot: top,
      hottest: hottestAgent ? {
        address: hottestAgent.address,
        name: hottestAgent.name,
        heat: hottestAgent.heat,
        streak: hottestAgent.streak,
        narrative: hottestAgent.streak.type === 'win' && hottestAgent.streak.count >= 3
          ? `🔥 ${hottestAgent.name} is on a ${hottestAgent.streak.count}-win streak!`
          : `${hottestAgent.name} is heating up the casino`,
      } : null,
      totalActive: hotAgents.length,
      period: 'Last 2 hours',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Hot agents API error:', error);
    return Response.json({ error: 'Failed to fetch hot agents' }, { status: 500 });
  }
}
