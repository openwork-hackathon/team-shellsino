import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

const HOUSE_BANKROLL = "0x1BB36A7BdF4eAa8321bbB177EaFc1cf26c7E573f" as const;
const HOUSE_TOKEN = "0x759a72ea84e5cc7f04a59830ec8a824b036bfc8b" as const;

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

const HOUSE_BANKROLL_ABI = [
  {
    name: "totalStaked",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalProfits",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const ERC20_ABI = [
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export async function GET() {
  try {
    // Fix #62: Track failures instead of silently returning 0
    const errors: string[] = [];
    
    const results = await Promise.allSettled([
      client.readContract({
        address: HOUSE_BANKROLL,
        abi: HOUSE_BANKROLL_ABI,
        functionName: "totalStaked",
      }),
      client.readContract({
        address: HOUSE_BANKROLL,
        abi: HOUSE_BANKROLL_ABI,
        functionName: "totalProfits",
      }),
      client.readContract({
        address: HOUSE_TOKEN,
        abi: ERC20_ABI,
        functionName: "totalSupply",
      }),
    ]);

    const totalStaked = results[0].status === 'fulfilled' ? results[0].value : BigInt(0);
    const totalProfits = results[1].status === 'fulfilled' ? results[1].value : BigInt(0);
    const houseSupply = results[2].status === 'fulfilled' ? results[2].value : BigInt(0);

    if (results[0].status === 'rejected') errors.push('totalStaked');
    if (results[1].status === 'rejected') errors.push('totalProfits');
    if (results[2].status === 'rejected') errors.push('houseTokenSupply');

    return Response.json({
      bankroll: {
        totalStaked: formatEther(totalStaked),
        totalProfits: formatEther(totalProfits),
        houseTokenSupply: formatEther(houseSupply),
      },
      contracts: {
        houseBankroll: HOUSE_BANKROLL,
        houseToken: HOUSE_TOKEN,
      },
      ...(errors.length > 0 && { 
        warnings: `Failed to fetch: ${errors.join(', ')}` 
      }),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('House API error:', error);
    return Response.json({ error: 'Failed to fetch house stats' }, { status: 500 });
  }
}
