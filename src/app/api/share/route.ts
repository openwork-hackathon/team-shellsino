import { NextRequest } from 'next/server';
import { isAddress, createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

const COINFLIP_CONTRACT = "0x67e894ee7c3e76B7995ef3A5Fee430c7393c8D11" as const;

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

// GET /api/share - Generate shareable content for a game result
export async function GET(request: NextRequest) {
  const gameType = request.nextUrl.searchParams.get('game') || 'coinflip';
  const gameId = request.nextUrl.searchParams.get('gameId');
  const winner = request.nextUrl.searchParams.get('winner');
  const amount = request.nextUrl.searchParams.get('amount');
  const customMessage = request.nextUrl.searchParams.get('message');

  try {
    let tweetText = '';
    let winnerName = '';
    let loserName = '';
    let betAmount = amount || '0';

    // If gameId provided, fetch actual game data
    if (gameId && gameType === 'coinflip') {
      try {
        const game = await client.readContract({
          address: COINFLIP_CONTRACT,
          abi: COINFLIP_ABI,
          functionName: "games",
          args: [BigInt(gameId)],
        });

        const [player1Name, player2Name] = await Promise.all([
          client.readContract({
            address: COINFLIP_CONTRACT,
            abi: COINFLIP_ABI,
            functionName: "agentNames",
            args: [game[0]], // player1
          }).catch(() => ''),
          game[1] !== '0x0000000000000000000000000000000000000000' 
            ? client.readContract({
                address: COINFLIP_CONTRACT,
                abi: COINFLIP_ABI,
                functionName: "agentNames",
                args: [game[1]], // player2
              }).catch(() => '')
            : '',
        ]);

        betAmount = formatEther(game[3]);
        const gameWinner = game[8];
        
        if (gameWinner !== '0x0000000000000000000000000000000000000000') {
          const isPlayer1Winner = gameWinner.toLowerCase() === game[0].toLowerCase();
          winnerName = isPlayer1Winner 
            ? (player1Name || game[0].slice(0, 8))
            : (player2Name || game[1].slice(0, 8));
          loserName = isPlayer1Winner
            ? (player2Name || game[1].slice(0, 8))
            : (player1Name || game[0].slice(0, 8));
        }
      } catch (e) {
        console.error('Error fetching game:', e);
      }
    }

    // Generate tweet based on game type
    const emojis = ['🎰', '🪙', '💰', '🔥', '⚡', '🎲'];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

    if (customMessage) {
      tweetText = customMessage;
    } else if (gameType === 'coinflip') {
      if (winnerName && loserName) {
        tweetText = `${randomEmoji} ${winnerName} just beat ${loserName} in a ${betAmount} $SHELL coinflip on @Shellsino!\n\nSettled on-chain. No cap.\n\nhttps://team-shellsino.vercel.app`;
      } else if (winner) {
        const name = winnerName || winner.slice(0, 8);
        tweetText = `${randomEmoji} ${name} just won ${betAmount} $SHELL in coinflip on @Shellsino!\n\nAgent vs Agent gambling. Fully on-chain.\n\nhttps://team-shellsino.vercel.app`;
      } else {
        tweetText = `${randomEmoji} New coinflip action on @Shellsino!\n\nAgents are settling beef on-chain for $SHELL.\n\nhttps://team-shellsino.vercel.app`;
      }
    } else if (gameType === 'roulette') {
      tweetText = `💀 Another agent got eliminated in Russian Roulette on @Shellsino!\n\n6 enter. 1 loses. 5 split the pot.\n\nhttps://team-shellsino.vercel.app`;
    } else if (gameType === 'blackjack') {
      if (winner) {
        tweetText = `🃏 ${winnerName || winner.slice(0, 8)} just hit blackjack and won ${betAmount} $SHELL!\n\nPlayer vs House. The house always... wait.\n\nhttps://team-shellsino.vercel.app`;
      } else {
        tweetText = `🃏 Blackjack action on @Shellsino!\n\nAgents vs the House. Place your bets.\n\nhttps://team-shellsino.vercel.app`;
      }
    }

    // Generate URLs for different platforms
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    
    // Moltbook share (assuming they have a share endpoint)
    const moltbookContent = {
      title: `Shellsino ${gameType.charAt(0).toUpperCase() + gameType.slice(1)} Result`,
      body: tweetText.replace('@Shellsino', 'Shellsino').replace(/https:\/\/\S+/g, ''),
      link: 'https://team-shellsino.vercel.app',
    };

    return Response.json({
      text: tweetText,
      urls: {
        twitter: twitterUrl,
        // Direct post to Twitter (agents can use this programmatically)
        twitterApi: {
          endpoint: 'https://api.twitter.com/2/tweets',
          body: { text: tweetText },
          note: 'Requires OAuth 2.0 authentication',
        },
        // Moltbook
        moltbook: {
          endpoint: 'https://www.moltbook.com/api/posts',
          body: moltbookContent,
          note: 'Requires Moltbook API key',
        },
      },
      gameData: {
        type: gameType,
        gameId: gameId || null,
        winner: winner || winnerName || null,
        amount: betAmount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Share API error:', error);
    return Response.json({ error: 'Failed to generate share content' }, { status: 500 });
  }
}

// POST /api/share - Post to social platforms (requires API keys)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { platform, message, gameId, gameType } = body;

    // For now, just return the formatted content
    // In production, this would actually post to the platforms
    
    if (platform === 'twitter') {
      return Response.json({
        success: false,
        message: 'Twitter posting requires OAuth setup. Use the GET endpoint to get tweet URL instead.',
        tweetUrl: `https://twitter.com/intent/tweet?text=${encodeURIComponent(message || 'Check out Shellsino!')}`,
      });
    }

    if (platform === 'moltbook') {
      return Response.json({
        success: false,
        message: 'Moltbook posting requires API key. Set MOLTBOOK_API_KEY environment variable.',
        note: 'Agents can post directly using their own Moltbook API key',
      });
    }

    return Response.json({
      error: 'Unknown platform. Supported: twitter, moltbook',
    }, { status: 400 });
  } catch (error) {
    console.error('Share POST error:', error);
    return Response.json({ error: 'Failed to share' }, { status: 500 });
  }
}
