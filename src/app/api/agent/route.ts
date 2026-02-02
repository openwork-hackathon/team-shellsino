import { createPublicClient, http, formatEther, isAddress } from 'viem';
import { base } from 'viem/chains';
import { NextRequest } from 'next/server';

const COINFLIP_CONTRACT = "0x67e894ee7c3e76B7995ef3A5Fee430c7393c8D11";
const ROULETTE_CONTRACT = "0xdF8E88d90c5D6C0A0a3bF695fb145B905593B7ee";

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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const address = searchParams.get('address');

  if (!address || !isAddress(address)) {
    return Response.json({ error: 'Valid address required' }, { status: 400 });
  }

  try {
    // Fix #61: Use Promise.allSettled to handle individual failures gracefully
    const results = await Promise.allSettled([
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

    // Extract values with fallbacks
    const coinflipStats = results[0].status === 'fulfilled' 
      ? results[0].value 
      : [BigInt(0), BigInt(0), BigInt(0), ''] as readonly [bigint, bigint, bigint, string];
    const isVerified = results[1].status === 'fulfilled' 
      ? results[1].value 
      : false;
    const rouletteStats = results[2].status === 'fulfilled' 
      ? results[2].value 
      : ['', BigInt(0), BigInt(0), BigInt(0), BigInt(0)] as readonly [string, bigint, bigint, bigint, bigint];

    return Response.json({
      address,
      verified: isVerified,
      coinflip: {
        name: coinflipStats[3] || null,
        wins: Number(coinflipStats[0]),
        losses: Number(coinflipStats[1]),
        totalWagered: formatEther(coinflipStats[2]),
        winRate: coinflipStats[0] + coinflipStats[1] > BigInt(0)
          ? (Number(coinflipStats[0]) / (Number(coinflipStats[0]) + Number(coinflipStats[1])) * 100).toFixed(1)
          : '0',
        error: results[0].status === 'rejected' ? 'Failed to fetch' : null,
      },
      roulette: {
        name: rouletteStats[0] || null,
        survived: Number(rouletteStats[1]),
        eliminated: Number(rouletteStats[2]),
        totalWagered: formatEther(rouletteStats[3]),
        pnl: formatEther(rouletteStats[4]),
        survivalRate: rouletteStats[1] + rouletteStats[2] > BigInt(0)
          ? (Number(rouletteStats[1]) / (Number(rouletteStats[1]) + Number(rouletteStats[2])) * 100).toFixed(1)
          : '0',
        error: results[2].status === 'rejected' ? 'Failed to fetch' : null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Agent stats API error:', error);
    return Response.json({ error: 'Failed to fetch agent stats' }, { status: 500 });
  }
}
