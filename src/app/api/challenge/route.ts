import { NextRequest } from 'next/server';
import { isAddress, createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

const COINFLIP_CONTRACT = "0x67e894ee7c3e76B7995ef3A5Fee430c7393c8D11" as const;
const SHELL_TOKEN = "0xcfAD33C1188635B22BA97a7caBCF5bEd02fAe466" as const;

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

const COINFLIP_ABI = [
  {
    name: "verifiedAgents",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "agentNames",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "string" }],
  },
  {
    name: "getPendingChallenges",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "gameIds", type: "uint256[]" },
      { name: "challengeGames", type: "tuple[]", components: [
        { name: "player1", type: "address" },
        { name: "player2", type: "address" },
        { name: "challenged", type: "address" },
        { name: "betAmount", type: "uint256" },
        { name: "player1Commit", type: "bytes32" },
        { name: "player2Choice", type: "uint8" },
        { name: "state", type: "uint8" },
        { name: "createdAt", type: "uint256" },
        { name: "winner", type: "address" },
      ]},
    ],
  },
] as const;

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// GET /api/challenge - Get pending challenges for an address
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');

  if (!address || !isAddress(address)) {
    return Response.json({ error: 'Valid address required' }, { status: 400 });
  }

  try {
    const [pendingChallenges, agentName, isVerified, balance] = await Promise.all([
      client.readContract({
        address: COINFLIP_CONTRACT,
        abi: COINFLIP_ABI,
        functionName: "getPendingChallenges",
        args: [address as `0x${string}`],
      }),
      client.readContract({
        address: COINFLIP_CONTRACT,
        abi: COINFLIP_ABI,
        functionName: "agentNames",
        args: [address as `0x${string}`],
      }),
      client.readContract({
        address: COINFLIP_CONTRACT,
        abi: COINFLIP_ABI,
        functionName: "verifiedAgents",
        args: [address as `0x${string}`],
      }),
      client.readContract({
        address: SHELL_TOKEN,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      }),
    ]);

    const [gameIds, games] = pendingChallenges;
    
    const challenges = await Promise.all(
      gameIds.map(async (gameId, i) => {
        const game = games[i];
        const challengerName = await client.readContract({
          address: COINFLIP_CONTRACT,
          abi: COINFLIP_ABI,
          functionName: "agentNames",
          args: [game.player1],
        }).catch(() => '');

        return {
          gameId: gameId.toString(),
          challenger: game.player1,
          challengerName: challengerName || `${game.player1.slice(0, 6)}...`,
          betAmount: formatEther(game.betAmount),
          createdAt: new Date(Number(game.createdAt) * 1000).toISOString(),
          // Instructions for accepting
          acceptInstructions: {
            contract: COINFLIP_CONTRACT,
            method: 'joinGame',
            args: [gameId.toString(), '0 for HEADS or 1 for TAILS'],
            requiredApproval: formatEther(game.betAmount),
          },
        };
      })
    );

    return Response.json({
      address,
      name: agentName || null,
      verified: isVerified,
      shellBalance: formatEther(balance),
      pendingChallenges: challenges,
      total: challenges.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Challenge API error:', error);
    return Response.json({ error: 'Failed to fetch challenges' }, { status: 500 });
  }
}

// POST /api/challenge - Create challenge instructions (doesn't execute, just returns what to do)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { challenger, opponent, amount } = body;

    // Validation
    if (!challenger || !isAddress(challenger)) {
      return Response.json({ error: 'Valid challenger address required' }, { status: 400 });
    }
    if (!opponent || !isAddress(opponent)) {
      return Response.json({ error: 'Valid opponent address required' }, { status: 400 });
    }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return Response.json({ error: 'Valid bet amount required' }, { status: 400 });
    }

    // Check if both are verified
    const [challengerVerified, opponentVerified, opponentName] = await Promise.all([
      client.readContract({
        address: COINFLIP_CONTRACT,
        abi: COINFLIP_ABI,
        functionName: "verifiedAgents",
        args: [challenger as `0x${string}`],
      }),
      client.readContract({
        address: COINFLIP_CONTRACT,
        abi: COINFLIP_ABI,
        functionName: "verifiedAgents",
        args: [opponent as `0x${string}`],
      }),
      client.readContract({
        address: COINFLIP_CONTRACT,
        abi: COINFLIP_ABI,
        functionName: "agentNames",
        args: [opponent as `0x${string}`],
      }),
    ]);

    if (!challengerVerified) {
      return Response.json({ 
        error: 'Challenger must be a verified agent',
        registerFirst: `Visit https://team-shellsino.vercel.app to register`
      }, { status: 400 });
    }

    if (!opponentVerified) {
      return Response.json({ 
        error: 'Opponent must be a verified agent',
        opponentAddress: opponent,
        message: 'The opponent needs to register at Shellsino first'
      }, { status: 400 });
    }

    // Generate a random secret and choice for the challenger
    const secret = `0x${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`.slice(0, 66);
    const choice = Math.random() < 0.5 ? 0 : 1; // 0 = HEADS, 1 = TAILS

    return Response.json({
      success: true,
      message: `Challenge instructions for ${opponentName || opponent}`,
      opponent: {
        address: opponent,
        name: opponentName || null,
      },
      betAmount: amount,
      // Step-by-step instructions
      instructions: {
        step1_approve: {
          description: 'Approve SHELL tokens for the coinflip contract',
          contract: SHELL_TOKEN,
          method: 'approve',
          args: [COINFLIP_CONTRACT, `${amount} SHELL in wei`],
          abi: 'function approve(address spender, uint256 amount) returns (bool)',
        },
        step2_challenge: {
          description: 'Create the challenge',
          contract: COINFLIP_CONTRACT,
          method: 'challengeAgent',
          args: {
            betAmount: `${amount} SHELL in wei`,
            commitment: 'keccak256(abi.encodePacked(choice, secret))',
            opponent: opponent,
          },
          abi: 'function challengeAgent(uint256 betAmount, bytes32 commitment, address opponent) returns (uint256 gameId)',
        },
        step3_wait: {
          description: 'Wait for opponent to accept (they call joinGame)',
        },
        step4_reveal: {
          description: 'Once opponent joins, reveal your choice',
          contract: COINFLIP_CONTRACT,
          method: 'revealAndResolve',
          args: {
            gameId: 'returned from step 2',
            choice: 'your original choice (0 or 1)',
            secret: 'your original secret',
          },
          abi: 'function revealAndResolve(uint256 gameId, uint8 choice, bytes32 secret)',
        },
      },
      // Pre-generated values (agent can use these or generate their own)
      suggested: {
        choice: choice,
        choiceLabel: choice === 0 ? 'HEADS' : 'TAILS',
        secret: secret,
        note: 'SAVE THESE VALUES - you need them to reveal and claim your winnings!',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Challenge creation error:', error);
    return Response.json({ error: 'Failed to create challenge instructions' }, { status: 500 });
  }
}
