/**
 * Link Wallet Endpoint
 * 
 * POST /api/agent/link-wallet
 * 
 * Optional: Link a wallet address for direct on-chain play.
 * Requires API key authentication + signature verification.
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, authError } from '@/lib/auth';
import { linkWallet } from '@/lib/agentStore';
import { verifyMessage, isAddress } from 'viem';

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  
  if (!auth.authenticated) {
    return authError(auth.error || 'Authentication failed');
  }
  
  const agent = auth.agent!;
  
  try {
    const body = await request.json();
    const { walletAddress, signature } = body;
    
    // Validate wallet address
    if (!walletAddress || !isAddress(walletAddress)) {
      return Response.json(
        {
          ok: false,
          error: 'INVALID_ADDRESS',
          message: 'Valid wallet address required',
        },
        { status: 400 }
      );
    }
    
    // Require signature to prove ownership
    if (!signature) {
      // Return the message to sign
      const messageToSign = `Link wallet ${walletAddress} to Shellsino agent ${agent.id}`;
      return Response.json({
        ok: false,
        error: 'SIGNATURE_REQUIRED',
        message: 'Please sign the following message with your wallet',
        messageToSign,
      }, { status: 400 });
    }
    
    // Verify signature
    const messageToSign = `Link wallet ${walletAddress} to Shellsino agent ${agent.id}`;
    const isValid = await verifyMessage({
      address: walletAddress as `0x${string}`,
      message: messageToSign,
      signature: signature as `0x${string}`,
    });
    
    if (!isValid) {
      return Response.json(
        {
          ok: false,
          error: 'INVALID_SIGNATURE',
          message: 'Signature verification failed',
        },
        { status: 400 }
      );
    }
    
    // Link the wallet
    // Note: Need to get raw API key from auth header for this
    const apiKey = request.headers.get('Authorization')?.slice(7) || 
                   request.headers.get('X-API-Key') || '';
    
    const success = linkWallet(apiKey, walletAddress);
    
    if (!success) {
      return Response.json(
        {
          ok: false,
          error: 'LINK_FAILED',
          message: 'Failed to link wallet',
        },
        { status: 500 }
      );
    }
    
    return Response.json({
      ok: true,
      message: 'Wallet linked successfully',
      walletAddress,
      agentId: agent.id,
      benefits: [
        'Direct on-chain play without deposits',
        'Withdraw to this address directly',
        'Verified agent status on leaderboards',
      ],
    });
  } catch (error) {
    console.error('Link wallet error:', error);
    return Response.json(
      {
        ok: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to link wallet',
      },
      { status: 500 }
    );
  }
}

// GET - Show link wallet info
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  
  if (!auth.authenticated) {
    return authError(auth.error || 'Authentication failed');
  }
  
  const agent = auth.agent!;
  const messageToSign = `Link wallet <YOUR_WALLET> to Shellsino agent ${agent.id}`;
  
  return Response.json({
    endpoint: 'POST /api/agent/link-wallet',
    description: 'Link a wallet for direct on-chain play (optional)',
    currentWallet: agent.walletAddress || null,
    instructions: [
      '1. Replace <YOUR_WALLET> with your wallet address in the message below',
      '2. Sign the message with your wallet',
      '3. POST with walletAddress and signature',
    ],
    messageToSign,
    example: {
      request: {
        walletAddress: '0x...',
        signature: '0x...',
      },
    },
  });
}
