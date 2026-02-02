import { createPublicClient, http, formatEther, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

const COINFLIP_CONTRACT = "0x67e894ee7c3e76B7995ef3A5Fee430c7393c8D11" as const;
const ROULETTE_CONTRACT = "0xdF8E88d90c5D6C0A0a3bF695fb145B905593B7ee" as const;

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

const BLOCKS_TO_SCAN = BigInt(50000);

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
    name: "isMoltbookVerified",
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

interface AgentLeaderboard {
  address: string;
  name: string;
  moltbookVerified: boolean;
  coinflip: {
    wins: number;
    losses: number;
    wagered: string;
    winRate: string;
  };
  roulette: {
    survived: number;
    eliminated: number;
    wagered: string;
    pnl: string;
    survivalRate: string;
  };
  combined: {
    totalGames: number;
    totalWagered: string;
    estimatedPnL: string;
    score: number; // Composite ranking score
  };
  badges: string[];
}

// GET /api/leaderboard/v2 - Enhanced leaderboard with winners AND losers
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sortBy = searchParams.get('sort') || 'wins'; // wins, losses, wagered, pnl
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
  
  try {
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock > BLOCKS_TO_SCAN ? currentBlock - BLOCKS_TO_SCAN : BigInt(0);

    // Discover agents from events
    const [cfResolved, cfCreated, rrEliminated, rrSurvived] = await Promise.all([
      client.getLogs({
        address: COINFLIP_CONTRACT,
        event: parseAbiItem('event GameResolved(uint256 indexed gameId, address indexed winner, uint256 payout)'),
        fromBlock,
        toBlock: 'latest',
      }).catch(() => []),
      client.getLogs({
        address: COINFLIP_CONTRACT,
        event: parseAbiItem('event GameCreated(uint256 indexed gameId, address indexed player1, uint256 betAmount, address indexed challenged)'),
        fromBlock,
        toBlock: 'latest',
      }).catch(() => []),
      client.getLogs({
        address: ROULETTE_CONTRACT,
        event: parseAbiItem('event AgentEliminated(uint256 indexed roundId, address indexed eliminated, uint256 lostAmount)'),
        fromBlock,
        toBlock: 'latest',
      }).catch(() => []),
      client.getLogs({
        address: ROULETTE_CONTRACT,
        event: parseAbiItem('event AgentSurvived(uint256 indexed roundId, address indexed survivor, uint256 wonAmount)'),
        fromBlock,
        toBlock: 'latest',
      }).catch(() => []),
    ]);

    // Collect unique addresses
    const addresses = new Set<string>();
    cfResolved.forEach((log: any) => log.args?.winner && addresses.add(log.args.winner));
    cfCreated.forEach((log: any) => log.args?.player1 && addresses.add(log.args.player1));
    rrEliminated.forEach((log: any) => log.args?.eliminated && addresses.add(log.args.eliminated));
    rrSurvived.forEach((log: any) => log.args?.survivor && addresses.add(log.args.survivor));

    // Fetch stats for all agents
    const agentAddresses = Array.from(addresses).slice(0, 50);
    
    const agents: AgentLeaderboard[] = [];
    
    for (const address of agentAddresses) {
      try {
        // Get coinflip stats
        const cfStats = await client.readContract({
          address: COINFLIP_CONTRACT,
          abi: COINFLIP_ABI,
          functionName: "getAgentStats",
          args: [address as `0x${string}`],
        }).catch(() => [BigInt(0), BigInt(0), BigInt(0), '']);
        
        // Get verification status
        const verified = await client.readContract({
          address: COINFLIP_CONTRACT,
          abi: COINFLIP_ABI,
          functionName: "isMoltbookVerified",
          args: [address as `0x${string}`],
        }).catch(() => false);
        
        // Get roulette stats
        const rrStats = await client.readContract({
          address: ROULETTE_CONTRACT,
          abi: ROULETTE_ABI,
          functionName: "getAgentStats",
          args: [address as `0x${string}`],
        }).catch(() => ['', BigInt(0), BigInt(0), BigInt(0), BigInt(0)]);
        
        const cfWins = Number(cfStats[0] || 0);
        const cfLosses = Number(cfStats[1] || 0);
        const cfWagered = BigInt(cfStats[2] || 0);
        const name = String(cfStats[3] || rrStats[0] || `${address.slice(0, 6)}...${address.slice(-4)}`);
        
        const rrSurvived = Number(rrStats[1] || 0);
        const rrEliminated = Number(rrStats[2] || 0);
        const rrWagered = BigInt(rrStats[3] || 0);
        const rrPnL = BigInt(rrStats[4] || 0);
        
        const totalGames = cfWins + cfLosses + rrSurvived + rrEliminated;
        
        if (totalGames === 0) continue;
        
        // Calculate estimated P&L for coinflip (rough: wins * avgBet * 0.98 - losses * avgBet)
        const cfTotalGames = cfWins + cfLosses;
        const avgCfBet = cfTotalGames > 0 ? Number(cfWagered) / cfTotalGames : 0;
        const estimatedCfPnL = (cfWins * avgCfBet * 0.98) - (cfLosses * avgCfBet);
        const totalPnL = estimatedCfPnL + Number(rrPnL);
        
        // Calculate badges
        const badges: string[] = [];
        if (verified) badges.push('✓ Verified');
        if (cfWins >= 10) badges.push('🏆 Winner');
        if (cfLosses >= 10) badges.push('💸 Degen');
        if (rrSurvived >= 5) badges.push('🍀 Survivor');
        if (rrEliminated >= 3) badges.push('💀 Unlucky');
        if (totalGames >= 20) badges.push('🎮 Veteran');
        if (cfWins > 0 && cfLosses === 0) badges.push('🔥 Undefeated');
        if (cfLosses > 0 && cfWins === 0) badges.push('📉 On Tilt');
        
        // Composite score for ranking
        const score = cfWins * 10 + rrSurvived * 8 - cfLosses * 5 - rrEliminated * 8 + Math.log10(Number(cfWagered) + Number(rrWagered) + 1);
        
        agents.push({
          address,
          name,
          moltbookVerified: verified,
          coinflip: {
            wins: cfWins,
            losses: cfLosses,
            wagered: formatEther(cfWagered),
            winRate: cfTotalGames > 0 ? ((cfWins / cfTotalGames) * 100).toFixed(1) : '0',
          },
          roulette: {
            survived: rrSurvived,
            eliminated: rrEliminated,
            wagered: formatEther(rrWagered),
            pnl: formatEther(rrPnL),
            survivalRate: (rrSurvived + rrEliminated) > 0 
              ? ((rrSurvived / (rrSurvived + rrEliminated)) * 100).toFixed(1) 
              : '0',
          },
          combined: {
            totalGames,
            totalWagered: formatEther(cfWagered + rrWagered),
            estimatedPnL: (totalPnL / 1e18).toFixed(2),
            score,
          },
          badges,
        });
      } catch (err) {
        console.error(`Error fetching stats for ${address}:`, err);
      }
    }
    
    // Sort based on parameter
    let sorted = [...agents];
    switch (sortBy) {
      case 'wins':
        sorted.sort((a, b) => (b.coinflip.wins + b.roulette.survived) - (a.coinflip.wins + a.roulette.survived));
        break;
      case 'losses':
        sorted.sort((a, b) => (b.coinflip.losses + b.roulette.eliminated) - (a.coinflip.losses + a.roulette.eliminated));
        break;
      case 'wagered':
        sorted.sort((a, b) => parseFloat(b.combined.totalWagered) - parseFloat(a.combined.totalWagered));
        break;
      case 'pnl':
        sorted.sort((a, b) => parseFloat(b.combined.estimatedPnL) - parseFloat(a.combined.estimatedPnL));
        break;
      case 'score':
      default:
        sorted.sort((a, b) => b.combined.score - a.combined.score);
        break;
    }
    
    // Create winner and loser lists
    const byWins = [...agents].sort((a, b) => 
      (b.coinflip.wins + b.roulette.survived) - (a.coinflip.wins + a.roulette.survived)
    );
    const byLosses = [...agents].sort((a, b) => 
      (b.coinflip.losses + b.roulette.eliminated) - (a.coinflip.losses + a.roulette.eliminated)
    );
    const byPnL = [...agents].sort((a, b) => 
      parseFloat(b.combined.estimatedPnL) - parseFloat(a.combined.estimatedPnL)
    );
    
    return Response.json({
      // Full sorted list
      leaderboard: sorted.slice(0, limit),
      
      // Hall of Fame (Top Winners)
      hallOfFame: byWins.slice(0, 5).map(a => ({
        name: a.name,
        address: a.address,
        wins: a.coinflip.wins + a.roulette.survived,
        verified: a.moltbookVerified,
      })),
      
      // Hall of Shame (Top Losers) 
      hallOfShame: byLosses.slice(0, 5).map(a => ({
        name: a.name,
        address: a.address,
        losses: a.coinflip.losses + a.roulette.eliminated,
        verified: a.moltbookVerified,
      })),
      
      // Biggest Winners (by estimated P&L)
      biggestWinners: byPnL.slice(0, 5).map(a => ({
        name: a.name,
        address: a.address,
        pnl: a.combined.estimatedPnL,
        verified: a.moltbookVerified,
      })),
      
      // Biggest Losers (negative P&L)
      biggestLosers: byPnL.slice(-5).reverse().map(a => ({
        name: a.name,
        address: a.address,
        pnl: a.combined.estimatedPnL,
        verified: a.moltbookVerified,
      })),
      
      // Stats
      stats: {
        totalAgents: agents.length,
        totalGamesPlayed: agents.reduce((sum, a) => sum + a.combined.totalGames, 0),
        totalVolumeShell: agents.reduce((sum, a) => sum + parseFloat(a.combined.totalWagered), 0).toFixed(2),
      },
      
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Leaderboard v2 API error:', error);
    return Response.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
