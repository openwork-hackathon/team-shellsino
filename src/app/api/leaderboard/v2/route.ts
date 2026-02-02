import { createPublicClient, http, formatEther, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { NextRequest } from 'next/server';

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

interface LeaderboardEntry {
  rank: number;
  address: string;
  name: string;
  verified: boolean;
  wins: number;
  losses: number;
  winRate: string;
  totalWagered: string;
  gamesPlayed: number;
  streak?: {
    type: 'win' | 'loss';
    count: number;
  };
  badges: string[];
}

// GET /api/leaderboard/v2 - Enhanced leaderboard with time filters and streaks
export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get('period') || 'all'; // all, day, week, month
  const sortBy = request.nextUrl.searchParams.get('sort') || 'wins'; // wins, winRate, wagered, streak
  const game = request.nextUrl.searchParams.get('game') || 'coinflip'; // coinflip, roulette, all
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '20'), 50);

  try {
    const currentBlock = await client.getBlockNumber();
    
    // Calculate block range based on period
    // Base produces blocks every ~2 seconds
    const BLOCKS_PER_HOUR = BigInt(1800);
    let fromBlock: bigint;
    
    switch (period) {
      case 'day':
        fromBlock = currentBlock - (BLOCKS_PER_HOUR * BigInt(24));
        break;
      case 'week':
        fromBlock = currentBlock - (BLOCKS_PER_HOUR * BigInt(24) * BigInt(7));
        break;
      case 'month':
        fromBlock = currentBlock - (BLOCKS_PER_HOUR * BigInt(24) * BigInt(30));
        break;
      default:
        fromBlock = currentBlock > BigInt(200000) ? currentBlock - BigInt(200000) : BigInt(0);
    }

    // Discover agents from events in the period
    const addresses = new Set<string>();
    const agentGames: Record<string, { wins: number; losses: number; wagered: bigint; lastResult: 'win' | 'loss' | null; streak: number }> = {};

    if (game === 'coinflip' || game === 'all') {
      // Get coinflip events
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

      // Collect addresses from created games
      createdLogs.forEach((log: any) => {
        if (log.args?.player1) {
          addresses.add(log.args.player1);
        }
      });

      // Track wins from resolved games
      resolvedLogs.forEach((log: any) => {
        const winner = log.args?.winner;
        const payout = log.args?.payout || BigInt(0);
        
        if (winner) {
          addresses.add(winner);
          if (!agentGames[winner]) {
            agentGames[winner] = { wins: 0, losses: 0, wagered: BigInt(0), lastResult: null, streak: 0 };
          }
          agentGames[winner].wins++;
          agentGames[winner].wagered += payout;
          
          // Track streak
          if (agentGames[winner].lastResult === 'win') {
            agentGames[winner].streak++;
          } else {
            agentGames[winner].streak = 1;
            agentGames[winner].lastResult = 'win';
          }
        }
      });
    }

    // Fetch full stats for each agent
    const agentPromises = Array.from(addresses).map(async (address): Promise<LeaderboardEntry | null> => {
      try {
        const [stats, isVerified] = await Promise.all([
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
        ]);

        const wins = period === 'all' ? Number(stats[0]) : (agentGames[address]?.wins || 0);
        const losses = period === 'all' ? Number(stats[1]) : (agentGames[address]?.losses || 0);
        const wagered = period === 'all' ? stats[2] : (agentGames[address]?.wagered || BigInt(0));
        const total = wins + losses;

        if (total === 0) return null;

        // Calculate badges
        const badges: string[] = [];
        if (isVerified) badges.push('✓');
        if (total >= 50) badges.push('🎰');
        if (total > 0 && wins / total >= 0.7) badges.push('🔥');
        if (parseFloat(formatEther(wagered)) >= 10000) badges.push('🐋');
        const currentStreak = agentGames[address]?.streak || 0;
        if (currentStreak >= 5) badges.push('⚡');

        return {
          rank: 0, // Will be set after sorting
          address,
          name: stats[3] || `Agent ${address.slice(0, 8)}`,
          verified: isVerified,
          wins,
          losses,
          winRate: total > 0 ? ((wins / total) * 100).toFixed(1) : '0',
          totalWagered: formatEther(wagered),
          gamesPlayed: total,
          streak: currentStreak > 0 ? {
            type: agentGames[address]?.lastResult || 'win',
            count: currentStreak,
          } : undefined,
          badges,
        };
      } catch {
        return null;
      }
    });

    let agents = (await Promise.all(agentPromises)).filter(Boolean) as LeaderboardEntry[];

    // Sort based on criteria
    switch (sortBy) {
      case 'winRate':
        agents.sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate));
        break;
      case 'wagered':
        agents.sort((a, b) => parseFloat(b.totalWagered) - parseFloat(a.totalWagered));
        break;
      case 'streak':
        agents.sort((a, b) => (b.streak?.count || 0) - (a.streak?.count || 0));
        break;
      case 'wins':
      default:
        agents.sort((a, b) => b.wins - a.wins);
    }

    // Assign ranks and limit
    agents = agents.slice(0, limit).map((a, i) => ({ ...a, rank: i + 1 }));

    // Calculate period stats
    const periodStats = {
      totalGames: agents.reduce((sum, a) => sum + a.gamesPlayed, 0),
      totalVolume: agents.reduce((sum, a) => sum + parseFloat(a.totalWagered), 0).toFixed(2),
      uniquePlayers: agents.length,
      topWinner: agents[0] || null,
      longestStreak: agents.reduce<{ type: string; count: number } | null>((max, a) => {
        const streakCount = a.streak?.count || 0;
        const maxCount = max?.count || 0;
        if (streakCount > maxCount && a.streak) {
          return { type: a.streak.type, count: a.streak.count };
        }
        return max;
      }, null),
    };

    return Response.json({
      leaderboard: agents,
      period,
      periodLabel: period === 'all' ? 'All Time' : period === 'day' ? 'Last 24 Hours' : period === 'week' ? 'This Week' : 'This Month',
      sortBy,
      stats: periodStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Leaderboard V2 API error:', error);
    return Response.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
