import { createPublicClient, http, formatEther, parseAbiItem, isAddress } from 'viem';
import { base } from 'viem/chains';
import { NextRequest } from 'next/server';

const COINFLIP_CONTRACT = "0x67e894ee7c3e76B7995ef3A5Fee430c7393c8D11" as const;
const ROULETTE_CONTRACT = "0xdF8E88d90c5D6C0A0a3bF695fb145B905593B7ee" as const;
const BLACKJACK_CONTRACT = "0x71FDac5079e7E99d7B9881d9B691716958f744ea" as const;

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
  {
    name: "agentNames",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "string" }],
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

interface HeadToHead {
  opponent: string;
  opponentName: string;
  wins: number;
  losses: number;
  totalGames: number;
}

// GET /api/agents/[address] - Full agent profile with history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  
  if (!isAddress(address)) {
    return Response.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    // Get basic stats
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

    // Get recent game history and compute head-to-head records
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock > BigInt(100000) ? currentBlock - BigInt(100000) : BigInt(0);

    // Get coinflip game logs involving this player
    const [gameCreated, gameJoined, gameResolved] = await Promise.all([
      client.getLogs({
        address: COINFLIP_CONTRACT,
        event: parseAbiItem('event GameCreated(uint256 indexed gameId, address indexed player1, uint256 betAmount)'),
        args: { player1: address as `0x${string}` },
        fromBlock,
        toBlock: 'latest',
      }).catch(() => []),
      client.getLogs({
        address: COINFLIP_CONTRACT,
        event: parseAbiItem('event GameJoined(uint256 indexed gameId, address indexed player2)'),
        args: { player2: address as `0x${string}` },
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

    // Build game history and head-to-head records
    const myGameIds = new Set<string>();
    const gameOpponents: Record<string, { opponent: string; won: boolean }> = {};
    
    gameCreated.forEach((log: any) => {
      if (log.args?.gameId) {
        myGameIds.add(log.args.gameId.toString());
      }
    });
    gameJoined.forEach((log: any) => {
      if (log.args?.gameId) {
        myGameIds.add(log.args.gameId.toString());
      }
    });

    // Match resolved games to find opponents
    const headToHeadMap: Record<string, { wins: number; losses: number }> = {};
    const recentGames: Array<{
      gameId: string;
      game: string;
      opponent: string | null;
      result: 'win' | 'loss' | 'pending';
      amount: string;
      blockNumber: string;
    }> = [];

    gameResolved.forEach((log: any) => {
      const gameId = log.args?.gameId?.toString();
      const winner = log.args?.winner;
      const payout = log.args?.payout;

      if (gameId && myGameIds.has(gameId)) {
        const won = winner?.toLowerCase() === address.toLowerCase();
        recentGames.push({
          gameId,
          game: 'coinflip',
          opponent: null, // Would need another query to get opponent
          result: won ? 'win' : 'loss',
          amount: payout ? formatEther(payout) : '0',
          blockNumber: log.blockNumber?.toString() || '0',
        });
      }
    });

    // Calculate totals
    const cfWins = Number(coinflipStats[0]);
    const cfLosses = Number(coinflipStats[1]);
    const cfWagered = coinflipStats[2];
    const name = coinflipStats[3] || rouletteStats[0] || `Agent ${address.slice(0, 8)}`;

    const rrSurvived = Number(rouletteStats[1]);
    const rrEliminated = Number(rouletteStats[2]);
    const rrWagered = rouletteStats[3];
    const rrPnL = rouletteStats[4];

    const totalGames = cfWins + cfLosses + rrSurvived + rrEliminated;
    const totalWins = cfWins + rrSurvived;
    const totalWagered = cfWagered + rrWagered;

    // Calculate badges based on performance
    const badges: string[] = [];
    if (isVerified) badges.push('✓ Verified');
    if (totalGames >= 100) badges.push('🎰 High Roller');
    if (totalGames >= 10 && totalWins / totalGames >= 0.6) badges.push('🔥 Hot Streak');
    if (cfWins >= 10) badges.push('🪙 Coinflip Pro');
    if (rrSurvived >= 5) badges.push('💀 Survivor');
    if (parseFloat(formatEther(totalWagered)) >= 10000) badges.push('🐋 Whale');

    return Response.json({
      address,
      name,
      verified: isVerified,
      badges,
      stats: {
        totalGames,
        totalWins,
        totalLosses: totalGames - totalWins,
        totalWagered: formatEther(totalWagered),
        winRate: totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : '0',
        rank: null, // Would need to calculate from leaderboard
      },
      coinflip: {
        wins: cfWins,
        losses: cfLosses,
        gamesPlayed: cfWins + cfLosses,
        wagered: formatEther(cfWagered),
        winRate: cfWins + cfLosses > 0 
          ? ((cfWins / (cfWins + cfLosses)) * 100).toFixed(1) 
          : '0',
      },
      roulette: {
        survived: rrSurvived,
        eliminated: rrEliminated,
        gamesPlayed: rrSurvived + rrEliminated,
        wagered: formatEther(rrWagered),
        pnl: formatEther(rrPnL),
        survivalRate: rrSurvived + rrEliminated > 0 
          ? ((rrSurvived / (rrSurvived + rrEliminated)) * 100).toFixed(1) 
          : '0',
      },
      recentGames: recentGames.slice(0, 20),
      links: {
        profile: `https://team-shellsino.vercel.app/?agent=${address}`,
        basescan: `https://basescan.org/address/${address}`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Agent profile API error:', error);
    return Response.json({ error: 'Failed to fetch agent profile' }, { status: 500 });
  }
}
