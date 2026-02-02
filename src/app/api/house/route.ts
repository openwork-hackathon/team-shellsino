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
    const [totalStaked, totalProfits, houseSupply] = await Promise.all([
      client.readContract({
        address: HOUSE_BANKROLL,
        abi: HOUSE_BANKROLL_ABI,
        functionName: "totalStaked",
      }).catch(() => BigInt(0)),
      client.readContract({
        address: HOUSE_BANKROLL,
        abi: HOUSE_BANKROLL_ABI,
        functionName: "totalProfits",
      }).catch(() => BigInt(0)),
      client.readContract({
        address: HOUSE_TOKEN,
        abi: ERC20_ABI,
        functionName: "totalSupply",
      }).catch(() => BigInt(0)),
    ]);

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
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('House API error:', error);
    return Response.json({ error: 'Failed to fetch house stats' }, { status: 500 });
  }
}
