import { createPublicClient, http, formatEther, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

const COINFLIP_CONTRACT = "0x67e894ee7c3e76B7995ef3A5Fee430c7393c8D11" as const;
const ROULETTE_CONTRACT = "0xdF8E88d90c5D6C0A0a3bF695fb145B905593B7ee" as const;

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

// Get recent game events
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);
  
  try {
    // Get recent coinflip game resolved events
    const coinflipLogs = await client.getLogs({
      address: COINFLIP_CONTRACT,
      event: parseAbiItem('event GameResolved(uint256 indexed gameId, address indexed winner, uint256 payout)'),
      fromBlock: 'earliest',
      toBlock: 'latest',
    }).catch(() => []);

    // Get recent roulette round completed events  
    const rouletteLogs = await client.getLogs({
      address: ROULETTE_CONTRACT,
      event: parseAbiItem('event RoundCompleted(uint256 indexed roundId, address eliminated)'),
      fromBlock: 'earliest',
      toBlock: 'latest',
    }).catch(() => []);

    // Format events
    const coinflipGames = coinflipLogs.slice(-limit).map((log: any) => ({
      type: 'coinflip',
      gameId: log.args?.gameId?.toString() || '?',
      winner: log.args?.winner || '0x',
      payout: log.args?.payout ? formatEther(log.args.payout) : '0',
      blockNumber: log.blockNumber?.toString() || '0',
    }));

    const rouletteGames = rouletteLogs.slice(-limit).map((log: any) => ({
      type: 'roulette',
      roundId: log.args?.roundId?.toString() || '?',
      eliminated: log.args?.eliminated || '0x',
      blockNumber: log.blockNumber?.toString() || '0',
    }));

    // Combine and sort by block
    const allGames = [...coinflipGames, ...rouletteGames]
      .sort((a, b) => parseInt(b.blockNumber) - parseInt(a.blockNumber))
      .slice(0, limit);

    return Response.json({
      games: allGames,
      total: allGames.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('History API error:', error);
    return Response.json({ 
      games: [],
      error: 'Failed to fetch game history' 
    }, { status: 200 }); // Return 200 with empty array instead of 500
  }
}
