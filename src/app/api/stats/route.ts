import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

const COINFLIP_CONTRACT = "0x67e894ee7c3e76B7995ef3A5Fee430c7393c8D11";
const ROULETTE_CONTRACT = "0xdF8E88d90c5D6C0A0a3bF695fb145B905593B7ee";

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
