import { NextRequest } from 'next/server';
import { createPublicClient, http, formatEther, parseAbiItem, isAddress } from 'viem';
import { base } from 'viem/chains';

const COINFLIP_CONTRACT = "0x25B19C2634A2F8338D5a1821F96AF339A5066fbE" as const;

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

interface RivalRecord {
  address: string;
  name: string;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: string;
  totalWagered: bigint;
}

// GET /api/rivals - Get an agent's top rivals/opponents
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '10'), 20);

  if (!address || !isAddress(address)) {
    return Response.json({ error: 'Valid address required' }, { status: 400 });
  }

  try {
    const agentAddr = address.toLowerCase();

    // Get agent name
    const agentName = await client.readContract({
      address: COINFLIP_CONTRACT,
      abi: COINFLIP_ABI,
      functionName: "agentNames",
      args: [address as `0x${string}`],
    }).catch(() => '');

    // Scan for all games involving this agent
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock > BigInt(100000) ? currentBlock - BigInt(100000) : BigInt(0);

    // Get game creation events for this player
    const [createdLogs, joinedLogs, resolvedLogs] = await Promise.all([
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

    // Collect all game IDs this agent participated in
    const myGameIds = new Set<string>();
    createdLogs.forEach((log: any) => {
      if (log.args?.gameId) myGameIds.add(log.args.gameId.toString());
    });
    joinedLogs.forEach((log: any) => {
      if (log.args?.gameId) myGameIds.add(log.args.gameId.toString());
    });

    // Build rival records
    const rivalMap: Record<string, RivalRecord> = {};

    // Process resolved games
    for (const log of resolvedLogs) {
      const gameId = (log as any).args?.gameId?.toString();
      const winner = (log as any).args?.winner;

      if (!gameId || !myGameIds.has(gameId)) continue;

      try {
        const game = await client.readContract({
          address: COINFLIP_CONTRACT,
          abi: COINFLIP_ABI,
          functionName: "games",
          args: [BigInt(gameId)],
        });

        const player1 = game[0].toLowerCase();
        const player2 = game[1].toLowerCase();
        const betAmount = game[3];

        // Determine opponent
        let opponent: string;
        if (player1 === agentAddr) {
          opponent = player2;
        } else if (player2 === agentAddr) {
          opponent = player1;
        } else {
          continue; // Not our game
        }

        // Skip if opponent is zero address (incomplete game)
        if (opponent === '0x0000000000000000000000000000000000000000') continue;

        // Initialize rival record
        if (!rivalMap[opponent]) {
          const opponentName = await client.readContract({
            address: COINFLIP_CONTRACT,
            abi: COINFLIP_ABI,
            functionName: "agentNames",
            args: [opponent as `0x${string}`],
          }).catch(() => '');

          rivalMap[opponent] = {
            address: opponent,
            name: opponentName || `Agent ${opponent.slice(0, 8)}`,
            wins: 0,
            losses: 0,
            totalGames: 0,
            winRate: '0',
            totalWagered: BigInt(0),
          };
        }

        // Update record
        const didWin = winner?.toLowerCase() === agentAddr;
        rivalMap[opponent].totalGames++;
        rivalMap[opponent].totalWagered += betAmount;
        if (didWin) {
          rivalMap[opponent].wins++;
        } else {
          rivalMap[opponent].losses++;
        }
      } catch {
        continue;
      }
    }

    // Calculate win rates and sort
    const rivals = Object.values(rivalMap)
      .map(r => ({
        ...r,
        winRate: r.totalGames > 0 ? ((r.wins / r.totalGames) * 100).toFixed(1) : '0',
        totalWagered: formatEther(r.totalWagered),
      }))
      .sort((a, b) => b.totalGames - a.totalGames)
      .slice(0, limit);

    // Find nemesis (most losses against) and prey (most wins against)
    const nemesis = rivals.reduce((worst, r) => 
      r.losses > (worst?.losses || 0) ? r : worst, null as typeof rivals[0] | null);
    const prey = rivals.reduce((best, r) => 
      r.wins > (best?.wins || 0) ? r : best, null as typeof rivals[0] | null);

    return Response.json({
      agent: {
        address,
        name: agentName || `Agent ${address.slice(0, 8)}`,
      },
      rivals,
      insights: {
        nemesis: nemesis && nemesis.losses > 0 ? {
          address: nemesis.address,
          name: nemesis.name,
          record: `${nemesis.wins}-${nemesis.losses}`,
          note: `Your biggest rival - ${nemesis.losses} losses against them!`,
        } : null,
        prey: prey && prey.wins > 0 ? {
          address: prey.address,
          name: prey.name,
          record: `${prey.wins}-${prey.losses}`,
          note: `Your favorite opponent - ${prey.wins} wins against them!`,
        } : null,
        uniqueOpponents: rivals.length,
        totalRivalGames: rivals.reduce((sum, r) => sum + r.totalGames, 0),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Rivals API error:', error);
    return Response.json({ error: 'Failed to fetch rivals' }, { status: 500 });
  }
}
