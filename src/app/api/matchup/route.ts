import { NextRequest } from 'next/server';
import { createPublicClient, http, formatEther, parseAbiItem, isAddress } from 'viem';
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
] as const;

// GET /api/matchup - Get head-to-head record between two agents
export async function GET(request: NextRequest) {
  const agent1 = request.nextUrl.searchParams.get('agent1');
  const agent2 = request.nextUrl.searchParams.get('agent2');

  if (!agent1 || !isAddress(agent1)) {
    return Response.json({ error: 'Valid agent1 address required' }, { status: 400 });
  }
  if (!agent2 || !isAddress(agent2)) {
    return Response.json({ error: 'Valid agent2 address required' }, { status: 400 });
  }

  if (agent1.toLowerCase() === agent2.toLowerCase()) {
    return Response.json({ error: 'Cannot compare agent with itself' }, { status: 400 });
  }

  try {
    // Get agent names
    const [name1, name2] = await Promise.all([
      client.readContract({
        address: COINFLIP_CONTRACT,
        abi: COINFLIP_ABI,
        functionName: "agentNames",
        args: [agent1 as `0x${string}`],
      }).catch(() => ''),
      client.readContract({
        address: COINFLIP_CONTRACT,
        abi: COINFLIP_ABI,
        functionName: "agentNames",
        args: [agent2 as `0x${string}`],
      }).catch(() => ''),
    ]);

    // Scan for games between these two agents
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock > BigInt(100000) ? currentBlock - BigInt(100000) : BigInt(0);

    // Get all resolved games
    const resolvedLogs = await client.getLogs({
      address: COINFLIP_CONTRACT,
      event: parseAbiItem('event GameResolved(uint256 indexed gameId, address indexed winner, uint256 payout)'),
      fromBlock,
      toBlock: 'latest',
    }).catch(() => []);

    // Check each game to see if it involved both agents
    const matchups: Array<{
      gameId: string;
      winner: string;
      winnerName: string;
      loser: string;
      loserName: string;
      amount: string;
      blockNumber: string;
    }> = [];

    let agent1Wins = 0;
    let agent2Wins = 0;
    let totalWagered = BigInt(0);

    for (const log of resolvedLogs) {
      const gameId = (log as any).args?.gameId;
      const winner = (log as any).args?.winner;
      const payout = (log as any).args?.payout;

      if (!gameId) continue;

      try {
        const game = await client.readContract({
          address: COINFLIP_CONTRACT,
          abi: COINFLIP_ABI,
          functionName: "games",
          args: [gameId],
        });

        const player1Addr = game[0].toLowerCase();
        const player2Addr = game[1].toLowerCase();
        const a1 = agent1.toLowerCase();
        const a2 = agent2.toLowerCase();

        // Check if this game was between our two agents
        if ((player1Addr === a1 && player2Addr === a2) || 
            (player1Addr === a2 && player2Addr === a1)) {
          const winnerAddr = winner?.toLowerCase();
          const isAgent1Winner = winnerAddr === a1;
          
          if (isAgent1Winner) {
            agent1Wins++;
          } else {
            agent2Wins++;
          }

          totalWagered += game[3]; // betAmount

          matchups.push({
            gameId: gameId.toString(),
            winner: winner,
            winnerName: isAgent1Winner ? (name1 || agent1.slice(0, 8)) : (name2 || agent2.slice(0, 8)),
            loser: isAgent1Winner ? agent2 : agent1,
            loserName: isAgent1Winner ? (name2 || agent2.slice(0, 8)) : (name1 || agent1.slice(0, 8)),
            amount: formatEther(payout || BigInt(0)),
            blockNumber: log.blockNumber?.toString() || '0',
          });
        }
      } catch {
        // Skip games we can't fetch
        continue;
      }
    }

    const totalGames = agent1Wins + agent2Wins;
    
    // Determine the leader
    let leader = null;
    let leaderName = null;
    if (agent1Wins > agent2Wins) {
      leader = agent1;
      leaderName = name1 || agent1.slice(0, 8);
    } else if (agent2Wins > agent1Wins) {
      leader = agent2;
      leaderName = name2 || agent2.slice(0, 8);
    }

    return Response.json({
      agents: {
        agent1: {
          address: agent1,
          name: name1 || `Agent ${agent1.slice(0, 8)}`,
          wins: agent1Wins,
        },
        agent2: {
          address: agent2,
          name: name2 || `Agent ${agent2.slice(0, 8)}`,
          wins: agent2Wins,
        },
      },
      summary: {
        totalGames,
        leader: leader ? {
          address: leader,
          name: leaderName,
          margin: Math.abs(agent1Wins - agent2Wins),
        } : null,
        tied: agent1Wins === agent2Wins && totalGames > 0,
        noHistory: totalGames === 0,
        totalWagered: formatEther(totalWagered),
      },
      // Narrative for agents/social
      narrative: totalGames === 0
        ? `${name1 || agent1.slice(0, 8)} and ${name2 || agent2.slice(0, 8)} have never faced off!`
        : agent1Wins === agent2Wins
          ? `${name1 || agent1.slice(0, 8)} and ${name2 || agent2.slice(0, 8)} are tied ${agent1Wins}-${agent2Wins}!`
          : `${leaderName} leads the series ${Math.max(agent1Wins, agent2Wins)}-${Math.min(agent1Wins, agent2Wins)} against ${agent1Wins > agent2Wins ? (name2 || agent2.slice(0, 8)) : (name1 || agent1.slice(0, 8))}`,
      recentGames: matchups.slice(0, 10),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Matchup API error:', error);
    return Response.json({ error: 'Failed to fetch matchup data' }, { status: 500 });
  }
}
