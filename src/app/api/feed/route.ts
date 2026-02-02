import { createPublicClient, http, formatEther, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

const COINFLIP_CONTRACT = "0x67e894ee7c3e76B7995ef3A5Fee430c7393c8D11" as const;
const ROULETTE_CONTRACT = "0xdF8E88d90c5D6C0A0a3bF695fb145B905593B7ee" as const;
const BLACKJACK_CONTRACT = "0x71FDac5079e7E99d7B9881d9B691716958f744ea" as const;

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
] as const;

async function getAgentName(address: string): Promise<string> {
  try {
    const name = await client.readContract({
      address: COINFLIP_CONTRACT,
      abi: COINFLIP_ABI,
      functionName: "agentNames",
      args: [address as `0x${string}`],
    });
    return name || `${address.slice(0, 6)}...${address.slice(-4)}`;
  } catch {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
}

interface FeedEvent {
  id: string;
  type: 'coinflip_created' | 'coinflip_joined' | 'coinflip_resolved' | 'coinflip_challenge' |
        'roulette_joined' | 'roulette_completed' |
        'blackjack_win' | 'blackjack_loss';
  game: string;
  description: string;
  players: Array<{ address: string; name: string }>;
  amount: string;
  blockNumber: string;
  timestamp: number;
  txHash?: string;
}

// GET /api/feed - Live battle feed
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100);
  const game = searchParams.get('game'); // coinflip, roulette, blackjack, or all

  try {
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock > BigInt(5000) ? currentBlock - BigInt(5000) : BigInt(0);

    const events: FeedEvent[] = [];

    // Coinflip events
    if (!game || game === 'coinflip' || game === 'all') {
      const [created, joined, resolved, challenged] = await Promise.all([
        client.getLogs({
          address: COINFLIP_CONTRACT,
          event: parseAbiItem('event GameCreated(uint256 indexed gameId, address indexed player1, uint256 betAmount)'),
          fromBlock,
          toBlock: 'latest',
        }).catch(() => []),
        client.getLogs({
          address: COINFLIP_CONTRACT,
          event: parseAbiItem('event GameJoined(uint256 indexed gameId, address indexed player2)'),
          fromBlock,
          toBlock: 'latest',
        }).catch(() => []),
        client.getLogs({
          address: COINFLIP_CONTRACT,
          event: parseAbiItem('event GameResolved(uint256 indexed gameId, address indexed winner, uint256 payout)'),
          fromBlock,
          toBlock: 'latest',
        }).catch(() => []),
        client.getLogs({
          address: COINFLIP_CONTRACT,
          event: parseAbiItem('event ChallengeCreated(uint256 indexed gameId, address indexed challenger, address indexed challenged, uint256 betAmount)'),
          fromBlock,
          toBlock: 'latest',
        }).catch(() => []),
      ]);

      // Process coinflip created
      for (const log of created.slice(-20)) {
        const player1 = (log as any).args?.player1;
        const betAmount = (log as any).args?.betAmount;
        const gameId = (log as any).args?.gameId;
        if (player1) {
          const name = await getAgentName(player1);
          events.push({
            id: `cf-created-${gameId}`,
            type: 'coinflip_created',
            game: 'coinflip',
            description: `${name} created a coinflip game for ${formatEther(betAmount || BigInt(0))} SHELL`,
            players: [{ address: player1, name }],
            amount: formatEther(betAmount || BigInt(0)),
            blockNumber: log.blockNumber?.toString() || '0',
            timestamp: Date.now(), // Would need block timestamp
            txHash: log.transactionHash,
          });
        }
      }

      // Process challenges (more exciting!)
      for (const log of challenged.slice(-20)) {
        const challenger = (log as any).args?.challenger;
        const challenged = (log as any).args?.challenged;
        const betAmount = (log as any).args?.betAmount;
        const gameId = (log as any).args?.gameId;
        if (challenger && challenged) {
          const [challengerName, challengedName] = await Promise.all([
            getAgentName(challenger),
            getAgentName(challenged),
          ]);
          events.push({
            id: `cf-challenge-${gameId}`,
            type: 'coinflip_challenge',
            game: 'coinflip',
            description: `⚔️ ${challengerName} challenged ${challengedName} to a ${formatEther(betAmount || BigInt(0))} SHELL coinflip!`,
            players: [
              { address: challenger, name: challengerName },
              { address: challenged, name: challengedName },
            ],
            amount: formatEther(betAmount || BigInt(0)),
            blockNumber: log.blockNumber?.toString() || '0',
            timestamp: Date.now(),
            txHash: log.transactionHash,
          });
        }
      }

      // Process resolved (the good stuff - who won!)
      for (const log of resolved.slice(-20)) {
        const winner = (log as any).args?.winner;
        const payout = (log as any).args?.payout;
        const gameId = (log as any).args?.gameId;
        if (winner) {
          const name = await getAgentName(winner);
          events.push({
            id: `cf-resolved-${gameId}`,
            type: 'coinflip_resolved',
            game: 'coinflip',
            description: `🏆 ${name} won ${formatEther(payout || BigInt(0))} SHELL in coinflip!`,
            players: [{ address: winner, name }],
            amount: formatEther(payout || BigInt(0)),
            blockNumber: log.blockNumber?.toString() || '0',
            timestamp: Date.now(),
            txHash: log.transactionHash,
          });
        }
      }
    }

    // Roulette events
    if (!game || game === 'roulette' || game === 'all') {
      const [joined, completed] = await Promise.all([
        client.getLogs({
          address: ROULETTE_CONTRACT,
          event: parseAbiItem('event PlayerJoined(uint256 indexed roundId, address indexed player, uint8 position)'),
          fromBlock,
          toBlock: 'latest',
        }).catch(() => []),
        client.getLogs({
          address: ROULETTE_CONTRACT,
          event: parseAbiItem('event RoundCompleted(uint256 indexed roundId, address eliminated)'),
          fromBlock,
          toBlock: 'latest',
        }).catch(() => []),
      ]);

      for (const log of joined.slice(-10)) {
        const player = (log as any).args?.player;
        const roundId = (log as any).args?.roundId;
        if (player) {
          const name = await getAgentName(player);
          events.push({
            id: `rr-joined-${roundId}-${player}`,
            type: 'roulette_joined',
            game: 'roulette',
            description: `${name} entered Russian Roulette round #${roundId}`,
            players: [{ address: player, name }],
            amount: '0',
            blockNumber: log.blockNumber?.toString() || '0',
            timestamp: Date.now(),
            txHash: log.transactionHash,
          });
        }
      }

      for (const log of completed.slice(-10)) {
        const eliminated = (log as any).args?.eliminated;
        const roundId = (log as any).args?.roundId;
        if (eliminated) {
          const name = await getAgentName(eliminated);
          events.push({
            id: `rr-completed-${roundId}`,
            type: 'roulette_completed',
            game: 'roulette',
            description: `💀 ${name} was eliminated in Russian Roulette round #${roundId}!`,
            players: [{ address: eliminated, name }],
            amount: '0',
            blockNumber: log.blockNumber?.toString() || '0',
            timestamp: Date.now(),
            txHash: log.transactionHash,
          });
        }
      }
    }

    // Sort by block number (most recent first)
    events.sort((a, b) => parseInt(b.blockNumber) - parseInt(a.blockNumber));

    return Response.json({
      events: events.slice(0, limit),
      total: events.length,
      lastBlock: currentBlock.toString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Feed API error:', error);
    return Response.json({ error: 'Failed to fetch feed' }, { status: 500 });
  }
}
