import { NextResponse } from 'next/server';

/**
 * Instant Challenge System
 * 
 * Off-chain coordination for challenges:
 * 1. Agent A creates challenge via API (no SHELL locked yet)
 * 2. We notify Agent B via webhook
 * 3. Agent B accepts via API
 * 4. Both agents submit on-chain in quick succession
 * 
 * This removes the "waiting with locked funds" problem.
 */

interface PendingChallenge {
  id: string;
  challenger: string;
  challengerName: string;
  challenged: string;
  challengedName?: string;
  amount: string;
  choice: number; // 0 = heads, 1 = tails
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'accepted' | 'rejected' | 'expired' | 'completed';
  acceptedAt?: number;
  webhookSent?: boolean;
}

// In-memory store (would use Redis/DB in production)
const pendingChallenges = new Map<string, PendingChallenge>();
const challengesByAgent = new Map<string, string[]>(); // agent address => challenge ids

// Registered webhooks
const agentWebhooks = new Map<string, string>(); // agent address => webhook URL

const CHALLENGE_TTL = 5 * 60 * 1000; // 5 minutes

// Generate unique ID
function generateId(): string {
  return `ch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Clean expired challenges
function cleanExpired() {
  const now = Date.now();
  for (const [id, challenge] of pendingChallenges) {
    if (challenge.expiresAt < now && challenge.status === 'pending') {
      challenge.status = 'expired';
    }
  }
}

// Send webhook notification
async function sendWebhook(agentAddress: string, payload: any) {
  const webhookUrl = agentWebhooks.get(agentAddress.toLowerCase());
  if (!webhookUrl) return false;
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (error) {
    console.error(`Webhook failed for ${agentAddress}:`, error);
    return false;
  }
}

/**
 * POST /api/challenge/instant - Create a new challenge
 * 
 * Body: {
 *   challenger: "0x...",
 *   challenged: "0x...",
 *   amount: "100",
 *   choice: 0 | 1,
 *   challengerName?: string
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { challenger, challenged, amount, choice, challengerName } = body;
    
    // Validate
    if (!challenger || !challenged) {
      return NextResponse.json({ error: 'Missing challenger or challenged address' }, { status: 400 });
    }
    if (!amount || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }
    if (choice !== 0 && choice !== 1) {
      return NextResponse.json({ error: 'Choice must be 0 (heads) or 1 (tails)' }, { status: 400 });
    }
    if (challenger.toLowerCase() === challenged.toLowerCase()) {
      return NextResponse.json({ error: 'Cannot challenge yourself' }, { status: 400 });
    }
    
    cleanExpired();
    
    // Check for existing pending challenge between these agents
    const existingIds = challengesByAgent.get(challenger.toLowerCase()) || [];
    for (const id of existingIds) {
      const existing = pendingChallenges.get(id);
      if (existing && 
          existing.challenged.toLowerCase() === challenged.toLowerCase() && 
          existing.status === 'pending') {
        return NextResponse.json({ 
          error: 'You already have a pending challenge to this agent',
          existingChallenge: existing
        }, { status: 409 });
      }
    }
    
    // Create challenge
    const challenge: PendingChallenge = {
      id: generateId(),
      challenger: challenger.toLowerCase(),
      challengerName: challengerName || challenger.slice(0, 8),
      challenged: challenged.toLowerCase(),
      amount,
      choice,
      createdAt: Date.now(),
      expiresAt: Date.now() + CHALLENGE_TTL,
      status: 'pending',
    };
    
    pendingChallenges.set(challenge.id, challenge);
    
    // Track by agent
    const challengerChallenges = challengesByAgent.get(challenge.challenger) || [];
    challengerChallenges.push(challenge.id);
    challengesByAgent.set(challenge.challenger, challengerChallenges);
    
    const challengedChallenges = challengesByAgent.get(challenge.challenged) || [];
    challengedChallenges.push(challenge.id);
    challengesByAgent.set(challenge.challenged, challengedChallenges);
    
    // Send webhook to challenged agent
    const webhookSent = await sendWebhook(challenge.challenged, {
      type: 'challenge_received',
      challenge: {
        id: challenge.id,
        challenger: challenge.challenger,
        challengerName: challenge.challengerName,
        amount: challenge.amount,
        expiresAt: challenge.expiresAt,
      },
      message: `⚔️ ${challenge.challengerName} challenged you to a ${amount} SHELL coinflip!`,
      acceptUrl: `/api/challenge/instant/${challenge.id}/accept`,
      rejectUrl: `/api/challenge/instant/${challenge.id}/reject`,
    });
    
    challenge.webhookSent = webhookSent;
    
    return NextResponse.json({
      success: true,
      challenge: {
        id: challenge.id,
        challenger: challenge.challenger,
        challenged: challenge.challenged,
        amount: challenge.amount,
        expiresAt: challenge.expiresAt,
        expiresIn: Math.floor(CHALLENGE_TTL / 1000),
        webhookSent,
      },
      message: webhookSent 
        ? 'Challenge created and opponent notified via webhook'
        : 'Challenge created (opponent has no webhook registered)',
      nextStep: 'Wait for opponent to accept, then both submit on-chain',
    });
  } catch (error) {
    console.error('Challenge creation error:', error);
    return NextResponse.json({ error: 'Failed to create challenge' }, { status: 500 });
  }
}

/**
 * GET /api/challenge/instant - Get pending challenges for an agent
 * Query: ?address=0x...
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address')?.toLowerCase();
  
  if (!address) {
    return NextResponse.json({ error: 'Missing address parameter' }, { status: 400 });
  }
  
  cleanExpired();
  
  const challengeIds = challengesByAgent.get(address) || [];
  const received: PendingChallenge[] = [];
  const sent: PendingChallenge[] = [];
  
  for (const id of challengeIds) {
    const challenge = pendingChallenges.get(id);
    if (!challenge) continue;
    
    if (challenge.challenged === address && challenge.status === 'pending') {
      received.push(challenge);
    }
    if (challenge.challenger === address && challenge.status === 'pending') {
      sent.push(challenge);
    }
  }
  
  return NextResponse.json({
    address,
    received: received.map(c => ({
      id: c.id,
      challenger: c.challenger,
      challengerName: c.challengerName,
      amount: c.amount,
      expiresAt: c.expiresAt,
      expiresIn: Math.max(0, Math.floor((c.expiresAt - Date.now()) / 1000)),
    })),
    sent: sent.map(c => ({
      id: c.id,
      challenged: c.challenged,
      amount: c.amount,
      expiresAt: c.expiresAt,
      expiresIn: Math.max(0, Math.floor((c.expiresAt - Date.now()) / 1000)),
    })),
    timestamp: new Date().toISOString(),
  });
}

/**
 * PUT /api/challenge/instant - Register webhook for agent
 * Body: { address: "0x...", webhookUrl: "https://..." }
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { address, webhookUrl } = body;
    
    if (!address) {
      return NextResponse.json({ error: 'Missing address' }, { status: 400 });
    }
    
    if (webhookUrl) {
      // Validate URL
      try {
        new URL(webhookUrl);
      } catch {
        return NextResponse.json({ error: 'Invalid webhook URL' }, { status: 400 });
      }
      
      agentWebhooks.set(address.toLowerCase(), webhookUrl);
      
      return NextResponse.json({
        success: true,
        message: 'Webhook registered',
        address: address.toLowerCase(),
        webhookUrl,
      });
    } else {
      // Remove webhook
      agentWebhooks.delete(address.toLowerCase());
      
      return NextResponse.json({
        success: true,
        message: 'Webhook removed',
        address: address.toLowerCase(),
      });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Failed to register webhook' }, { status: 500 });
  }
}
