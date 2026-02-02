import { createPublicClient, http, formatEther, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

const COINFLIP_CONTRACT = "0x25B19C2634A2F8338D5a1821F96AF339A5066fbE" as const;
const ROULETTE_CONTRACT = "0xaee87fa7FDc714650E557b038Ad1623af71D80c6" as const;

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
    name: "getGame",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "player1", type: "address" },
        { name: "player2", type: "address" },
        { name: "challenged", type: "address" },
        { name: "betAmount", type: "uint256" },
        { name: "player1Commit", type: "bytes32" },
        { name: "player2Choice", type: "uint8" },
        { name: "state", type: "uint8" },
        { name: "createdAt", type: "uint256" },
        { name: "joinedAt", type: "uint256" },
        { name: "winner", type: "address" },
      ]
    }],
  },
] as const;

const ROULETTE_ABI = [
  {
    name: "agentNames",
    type: "function", 
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "string" }],
  },
  {
    name: "getRound",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [
      { name: "betAmount", type: "uint256" },
      { name: "players", type: "address[6]" },
      { name: "playerCount", type: "uint8" },
      { name: "state", type: "uint8" },
      { name: "eliminated", type: "address" },
      { name: "prizePerWinner", type: "uint256" },
      { name: "isPrivate", type: "bool" },
      { name: "creator", type: "address" },
    ],
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

export interface LiveEvent {
  id: string;
  type: 'coinflip_created' | 'coinflip_joined' | 'coinflip_flipping' | 'coinflip_resolved' |
        'roulette_joined' | 'roulette_spinning' | 'roulette_bang' |
        'challenge_issued';
  game: 'coinflip' | 'roulette';
  gameId: string;
  timestamp: number;
  data: {
    players?: Array<{ address: string; name: string }>;
    amount?: string;
    winner?: { address: string; name: string };
    loser?: { address: string; name: string };
    payout?: string;
    playerCount?: number;
    message: string;
    emoji: string;
  };
  txHash?: string;
}

// Store for tracking active games (in-memory for simplicity)
const activeGames = new Map<string, LiveEvent>();
const recentEvents: LiveEvent[] = [];
const MAX_RECENT = 50;

// Track last processed block
let lastProcessedBlock = BigInt(0);

async function pollForEvents(): Promise<LiveEvent[]> {
  const newEvents: LiveEvent[] = [];
  
  try {
    const currentBlock = await client.getBlockNumber();
    if (lastProcessedBlock === BigInt(0)) {
      lastProcessedBlock = currentBlock > BigInt(100) ? currentBlock - BigInt(100) : BigInt(0);
    }
    
    if (currentBlock <= lastProcessedBlock) {
      return [];
    }

    // Poll coinflip events
    const [cfCreated, cfJoined, cfResolved, cfChallenged] = await Promise.all([
      client.getLogs({
        address: COINFLIP_CONTRACT,
        event: parseAbiItem('event GameCreated(uint256 indexed gameId, address indexed player1, uint256 betAmount, address indexed challenged)'),
        fromBlock: lastProcessedBlock + BigInt(1),
        toBlock: currentBlock,
      }).catch(() => []),
      client.getLogs({
        address: COINFLIP_CONTRACT,
        event: parseAbiItem('event GameJoined(uint256 indexed gameId, address indexed player2, uint8 choice)'),
        fromBlock: lastProcessedBlock + BigInt(1),
        toBlock: currentBlock,
      }).catch(() => []),
      client.getLogs({
        address: COINFLIP_CONTRACT,
        event: parseAbiItem('event GameResolved(uint256 indexed gameId, address indexed winner, uint256 payout)'),
        fromBlock: lastProcessedBlock + BigInt(1),
        toBlock: currentBlock,
      }).catch(() => []),
      client.getLogs({
        address: COINFLIP_CONTRACT,
        event: parseAbiItem('event ChallengeIssued(uint256 indexed gameId, address indexed challenger, address indexed challenged, uint256 betAmount)'),
        fromBlock: lastProcessedBlock + BigInt(1),
        toBlock: currentBlock,
      }).catch(() => []),
    ]);

    // Process coinflip created
    for (const log of cfCreated) {
      const args = (log as any).args;
      const player1 = args?.player1;
      const betAmount = args?.betAmount;
      const gameId = args?.gameId?.toString();
      const challenged = args?.challenged;
      
      if (player1 && gameId) {
        const name = await getAgentName(player1);
        const isChallenge = challenged && challenged !== '0x0000000000000000000000000000000000000000';
        
        const event: LiveEvent = {
          id: `cf-${gameId}-created`,
          type: isChallenge ? 'challenge_issued' : 'coinflip_created',
          game: 'coinflip',
          gameId,
          timestamp: Date.now(),
          data: {
            players: [{ address: player1, name }],
            amount: formatEther(betAmount || BigInt(0)),
            message: isChallenge 
              ? `${name} threw down the gauntlet!` 
              : `${name} wants to flip for ${formatEther(betAmount || BigInt(0))} SHELL`,
            emoji: isChallenge ? '⚔️' : '🪙',
          },
          txHash: log.transactionHash,
        };
        
        if (isChallenge && challenged) {
          const challengedName = await getAgentName(challenged);
          event.data.players?.push({ address: challenged, name: challengedName });
          event.data.message = `${name} challenged ${challengedName} to a ${formatEther(betAmount || BigInt(0))} SHELL duel!`;
        }
        
        newEvents.push(event);
        activeGames.set(`cf-${gameId}`, event);
      }
    }

    // Process coinflip joined - THE TENSION BEGINS
    for (const log of cfJoined) {
      const args = (log as any).args;
      const player2 = args?.player2;
      const gameId = args?.gameId?.toString();
      
      if (player2 && gameId) {
        const name = await getAgentName(player2);
        
        // First, emit the joined event
        newEvents.push({
          id: `cf-${gameId}-joined`,
          type: 'coinflip_joined',
          game: 'coinflip',
          gameId,
          timestamp: Date.now(),
          data: {
            players: [{ address: player2, name }],
            message: `${name} accepted the challenge!`,
            emoji: '🤝',
          },
          txHash: log.transactionHash,
        });
        
        // Then emit a "flipping" event for suspense
        newEvents.push({
          id: `cf-${gameId}-flipping`,
          type: 'coinflip_flipping',
          game: 'coinflip',
          gameId,
          timestamp: Date.now() + 100,
          data: {
            message: `Coin is in the air...`,
            emoji: '🪙',
          },
        });
      }
    }

    // Process coinflip resolved - THE BIG REVEAL
    for (const log of cfResolved) {
      const args = (log as any).args;
      const winner = args?.winner;
      const payout = args?.payout;
      const gameId = args?.gameId?.toString();
      
      if (winner && gameId) {
        const winnerName = await getAgentName(winner);
        
        newEvents.push({
          id: `cf-${gameId}-resolved`,
          type: 'coinflip_resolved',
          game: 'coinflip',
          gameId,
          timestamp: Date.now(),
          data: {
            winner: { address: winner, name: winnerName },
            payout: formatEther(payout || BigInt(0)),
            message: `${winnerName} WINS ${formatEther(payout || BigInt(0))} SHELL!`,
            emoji: '💰',
          },
          txHash: log.transactionHash,
        });
        
        activeGames.delete(`cf-${gameId}`);
      }
    }

    // Poll roulette events
    const [rrJoined, rrEliminated, rrSurvived] = await Promise.all([
      client.getLogs({
        address: ROULETTE_CONTRACT,
        event: parseAbiItem('event PlayerJoined(uint256 indexed roundId, address indexed player, uint8 position)'),
        fromBlock: lastProcessedBlock + BigInt(1),
        toBlock: currentBlock,
      }).catch(() => []),
      client.getLogs({
        address: ROULETTE_CONTRACT,
        event: parseAbiItem('event AgentEliminated(uint256 indexed roundId, address indexed eliminated, uint256 lostAmount)'),
        fromBlock: lastProcessedBlock + BigInt(1),
        toBlock: currentBlock,
      }).catch(() => []),
      client.getLogs({
        address: ROULETTE_CONTRACT,
        event: parseAbiItem('event AgentSurvived(uint256 indexed roundId, address indexed survivor, uint256 wonAmount)'),
        fromBlock: lastProcessedBlock + BigInt(1),
        toBlock: currentBlock,
      }).catch(() => []),
    ]);

    // Process roulette joins
    for (const log of rrJoined) {
      const args = (log as any).args;
      const player = args?.player;
      const roundId = args?.roundId?.toString();
      const position = args?.position;
      
      if (player && roundId) {
        const name = await getAgentName(player);
        const playerNum = (position || 0) + 1;
        
        newEvents.push({
          id: `rr-${roundId}-joined-${player}`,
          type: 'roulette_joined',
          game: 'roulette',
          gameId: roundId,
          timestamp: Date.now(),
          data: {
            players: [{ address: player, name }],
            playerCount: playerNum,
            message: playerNum === 6 
              ? `${name} is the 6th agent. SPINNING THE CHAMBER...`
              : `${name} entered the chamber (${playerNum}/6)`,
            emoji: playerNum === 6 ? '🔫' : '💀',
          },
          txHash: log.transactionHash,
        });
        
        // If 6th player, add spinning event
        if (playerNum === 6) {
          newEvents.push({
            id: `rr-${roundId}-spinning`,
            type: 'roulette_spinning',
            game: 'roulette',
            gameId: roundId,
            timestamp: Date.now() + 100,
            data: {
              message: 'Chamber spinning... click... click... click...',
              emoji: '🎰',
            },
          });
        }
      }
    }

    // Process eliminations - THE DEATH
    for (const log of rrEliminated) {
      const args = (log as any).args;
      const eliminated = args?.eliminated;
      const roundId = args?.roundId?.toString();
      const lostAmount = args?.lostAmount;
      
      if (eliminated && roundId) {
        const name = await getAgentName(eliminated);
        
        newEvents.push({
          id: `rr-${roundId}-bang`,
          type: 'roulette_bang',
          game: 'roulette',
          gameId: roundId,
          timestamp: Date.now(),
          data: {
            loser: { address: eliminated, name },
            amount: formatEther(lostAmount || BigInt(0)),
            message: `BANG! 💥 ${name} is ELIMINATED! Lost ${formatEther(lostAmount || BigInt(0))} SHELL`,
            emoji: '💀',
          },
          txHash: log.transactionHash,
        });
      }
    }

    lastProcessedBlock = currentBlock;
    
    // Store recent events
    for (const event of newEvents) {
      recentEvents.unshift(event);
    }
    while (recentEvents.length > MAX_RECENT) {
      recentEvents.pop();
    }
    
  } catch (error) {
    console.error('Polling error:', error);
  }
  
  return newEvents;
}

// Server-Sent Events endpoint for real-time updates
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'stream'; // 'stream' or 'poll'
  
  // Simple poll mode - return recent events
  if (mode === 'poll') {
    await pollForEvents();
    return Response.json({
      events: recentEvents.slice(0, 20),
      activeGames: Array.from(activeGames.values()),
      timestamp: new Date().toISOString(),
    });
  }
  
  // SSE streaming mode
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial state
      const initial = JSON.stringify({
        type: 'init',
        recentEvents: recentEvents.slice(0, 10),
        activeGames: Array.from(activeGames.values()),
      });
      controller.enqueue(encoder.encode(`data: ${initial}\n\n`));
      
      // Poll every 2 seconds
      const interval = setInterval(async () => {
        try {
          const newEvents = await pollForEvents();
          
          if (newEvents.length > 0) {
            for (const event of newEvents) {
              const data = JSON.stringify({ type: 'event', event });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          } else {
            // Send heartbeat
            controller.enqueue(encoder.encode(`data: {"type":"heartbeat"}\n\n`));
          }
        } catch (error) {
          console.error('Stream error:', error);
        }
      }, 2000);
      
      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
