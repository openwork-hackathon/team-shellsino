import { createPublicClient, http, formatEther, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

const COINFLIP_CONTRACT = "0x25B19C2634A2F8338D5a1821F96AF339A5066fbE" as const;
const ROULETTE_CONTRACT = "0xaee87fa7FDc714650E557b038Ad1623af71D80c6" as const;

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

// Fix #57: Only scan recent blocks (last ~10k blocks ≈ 5 hours on Base)
const BLOCKS_TO_SCAN = BigInt(10000);

// Get recent game events
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // Fix #58: Validate limit is positive
  const rawLimit = parseInt(searchParams.get('limit') || '10');
  const limit = Math.max(1, Math.min(rawLimit, 50));
  
  try {
    // Get current block number
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock > BLOCKS_TO_SCAN ? currentBlock - BLOCKS_TO_SCAN : BigInt(0);

    // Get recent coinflip game resolved events
    const coinflipLogs = await client.getLogs({
      address: COINFLIP_CONTRACT,
      event: parseAbiItem('event GameResolved(uint256 indexed gameId, address indexed winner, uint256 payout)'),
      fromBlock,
      toBlock: 'latest',
    }).catch(() => []);

    // Get recent roulette round completed events  
    const rouletteLogs = await client.getLogs({
      address: ROULETTE_CONTRACT,
      event: parseAbiItem('event RoundCompleted(uint256 indexed roundId, address eliminated)'),
      fromBlock,
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
    // Fix #56: Return consistent 500 on errors
    return Response.json({ 
      games: [],
      error: 'Failed to fetch game history' 
    }, { status: 500 });
  }
}
