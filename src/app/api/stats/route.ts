import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

const COINFLIP_CONTRACT = "0x25B19C2634A2F8338D5a1821F96AF339A5066fbE";
const ROULETTE_CONTRACT = "0xaee87fa7FDc714650E557b038Ad1623af71D80c6";

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

const COINFLIP_ABI = [
  {
    name: "totalGamesPlayed",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "totalVolume",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

const ROULETTE_ABI = [
  {
    name: "totalRoundsPlayed",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "totalEliminated",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export async function GET() {
  try {
    const [coinflipGames, coinflipVolume, rouletteRounds, rouletteEliminated] = await Promise.all([
      client.readContract({
        address: COINFLIP_CONTRACT,
        abi: COINFLIP_ABI,
        functionName: "totalGamesPlayed",
      }),
      client.readContract({
        address: COINFLIP_CONTRACT,
        abi: COINFLIP_ABI,
        functionName: "totalVolume",
      }),
      client.readContract({
        address: ROULETTE_CONTRACT,
        abi: ROULETTE_ABI,
        functionName: "totalRoundsPlayed",
      }),
      client.readContract({
        address: ROULETTE_CONTRACT,
        abi: ROULETTE_ABI,
        functionName: "totalEliminated",
      }),
    ]);

    return Response.json({
      coinflip: {
        totalGames: Number(coinflipGames),
        totalVolume: formatEther(coinflipVolume),
        totalVolumeWei: coinflipVolume.toString(),
      },
      roulette: {
        totalRounds: Number(rouletteRounds),
        totalEliminated: Number(rouletteEliminated),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return Response.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
