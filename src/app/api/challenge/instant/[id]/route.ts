import { NextResponse } from 'next/server';

/**
 * Challenge actions: accept, reject, get status
 */

interface PendingChallenge {
  id: string;
  challenger: string;
  challengerName: string;
  challenged: string;
  challengedName?: string;
  amount: string;
  choice: number;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'accepted' | 'rejected' | 'expired' | 'completed';
  acceptedAt?: number;
  acceptedChoice?: number;
  webhookSent?: boolean;
}

// Import from parent (in real app, use shared store)
// For now, we'll use a simple global (would be Redis in production)
declare global {
  var challengeStore: Map<string, PendingChallenge>;
  var webhookStore: Map<string, string>;
}

if (!global.challengeStore) {
  global.challengeStore = new Map();
}
if (!global.webhookStore) {
  global.webhookStore = new Map();
}

const pendingChallenges = global.challengeStore;
const agentWebhooks = global.webhookStore;

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
 * GET /api/challenge/instant/[id] - Get challenge details
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  const challenge = pendingChallenges.get(id);
  if (!challenge) {
    return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  }
  
  // Check if expired
  if (challenge.status === 'pending' && challenge.expiresAt < Date.now()) {
    challenge.status = 'expired';
  }
  
  return NextResponse.json({
    challenge: {
      id: challenge.id,
      challenger: challenge.challenger,
      challengerName: challenge.challengerName,
      challenged: challenge.challenged,
      amount: challenge.amount,
      status: challenge.status,
      createdAt: challenge.createdAt,
      expiresAt: challenge.expiresAt,
      expiresIn: Math.max(0, Math.floor((challenge.expiresAt - Date.now()) / 1000)),
      acceptedAt: challenge.acceptedAt,
    },
  });
}

/**
 * POST /api/challenge/instant/[id] - Accept or reject challenge
 * Body: { action: "accept" | "reject", address: "0x...", choice?: 0 | 1 }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    const body = await request.json();
    const { action, address, choice } = body;
    
    if (!action || !address) {
      return NextResponse.json({ error: 'Missing action or address' }, { status: 400 });
    }
    
    const challenge = pendingChallenges.get(id);
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }
    
    // Verify caller is the challenged agent
    if (challenge.challenged !== address.toLowerCase()) {
      return NextResponse.json({ error: 'You are not the challenged agent' }, { status: 403 });
    }
    
    // Check status
    if (challenge.status !== 'pending') {
      return NextResponse.json({ 
        error: `Challenge is already ${challenge.status}`,
        challenge 
      }, { status: 400 });
    }
    
    // Check expiry
    if (challenge.expiresAt < Date.now()) {
      challenge.status = 'expired';
      return NextResponse.json({ error: 'Challenge has expired' }, { status: 400 });
    }
    
    if (action === 'accept') {
      if (choice !== 0 && choice !== 1) {
        return NextResponse.json({ error: 'Must provide choice (0 = heads, 1 = tails)' }, { status: 400 });
      }
      
      challenge.status = 'accepted';
      challenge.acceptedAt = Date.now();
      challenge.acceptedChoice = choice;
      
      // Notify challenger via webhook
      await sendWebhook(challenge.challenger, {
        type: 'challenge_accepted',
        challenge: {
          id: challenge.id,
          challenged: challenge.challenged,
          amount: challenge.amount,
        },
        message: `✅ Your challenge was accepted! Submit on-chain now.`,
        // Instructions for on-chain submission
        onChainInstructions: {
          contract: '0x25B19C2634A2F8338D5a1821F96AF339A5066fbE', // V3 when deployed
          method: 'createChallenge',
          args: [challenge.challenged, challenge.amount, challenge.choice],
        },
      });
      
      return NextResponse.json({
        success: true,
        message: 'Challenge accepted! Both agents should now submit on-chain.',
        challenge: {
          id: challenge.id,
          challenger: challenge.challenger,
          challenged: challenge.challenged,
          amount: challenge.amount,
          status: 'accepted',
        },
        nextSteps: [
          `1. Challenger (${challenge.challengerName}) calls createChallenge() on-chain`,
          `2. You call acceptChallenge() on-chain`,
          `3. Winner is determined instantly`,
        ],
        onChainInstructions: {
          contract: 'ShellCoinflipV3',
          challengerMethod: 'createChallenge(challenged, amount, choice)',
          accepterMethod: 'acceptChallenge(challengeId, choice)',
        },
      });
      
    } else if (action === 'reject') {
      challenge.status = 'rejected';
      
      // Notify challenger
      await sendWebhook(challenge.challenger, {
        type: 'challenge_rejected',
        challenge: {
          id: challenge.id,
          challenged: challenge.challenged,
          amount: challenge.amount,
        },
        message: `❌ Your challenge was rejected.`,
      });
      
      return NextResponse.json({
        success: true,
        message: 'Challenge rejected',
        challenge: {
          id: challenge.id,
          status: 'rejected',
        },
      });
      
    } else {
      return NextResponse.json({ error: 'Invalid action. Use "accept" or "reject"' }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Challenge action error:', error);
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 });
  }
}

/**
 * DELETE /api/challenge/instant/[id] - Cancel challenge (challenger only)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address')?.toLowerCase();
  
  if (!address) {
    return NextResponse.json({ error: 'Missing address parameter' }, { status: 400 });
  }
  
  const challenge = pendingChallenges.get(id);
  if (!challenge) {
    return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  }
  
  if (challenge.challenger !== address) {
    return NextResponse.json({ error: 'Only challenger can cancel' }, { status: 403 });
  }
  
  if (challenge.status !== 'pending') {
    return NextResponse.json({ error: `Cannot cancel - challenge is ${challenge.status}` }, { status: 400 });
  }
  
  challenge.status = 'expired'; // Mark as cancelled/expired
  
  return NextResponse.json({
    success: true,
    message: 'Challenge cancelled',
  });
}
