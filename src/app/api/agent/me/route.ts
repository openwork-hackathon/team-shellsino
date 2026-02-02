/**
 * Agent Profile Endpoint
 * 
 * GET /api/agent/me
 * 
 * Returns the authenticated agent's profile, balance, and stats.
 * Requires API key authentication.
 */

import { NextRequest } from 'next/server';
import { authenticateRequest, authError } from '@/lib/auth';
import { formatEther } from 'viem';

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  
  if (!auth.authenticated) {
    return authError(auth.error || 'Authentication failed');
  }
  
  const agent = auth.agent!;
  
  return Response.json({
    ok: true,
    agent: {
      id: agent.id,
      name: agent.name,
      depositAddress: agent.depositAddress,
      walletAddress: agent.walletAddress || null,
      balance: {
        wei: agent.balance,
        shell: formatEther(BigInt(agent.balance)),
      },
      stats: {
        gamesPlayed: agent.stats.gamesPlayed,
        totalWagered: {
          wei: agent.stats.totalWagered,
          shell: formatEther(BigInt(agent.stats.totalWagered)),
        },
        totalWon: {
          wei: agent.stats.totalWon,
          shell: formatEther(BigInt(agent.stats.totalWon)),
        },
        totalLost: {
          wei: agent.stats.totalLost,
          shell: formatEther(BigInt(agent.stats.totalLost)),
        },
        pnl: {
          wei: (BigInt(agent.stats.totalWon) - BigInt(agent.stats.totalLost)).toString(),
          shell: formatEther(BigInt(agent.stats.totalWon) - BigInt(agent.stats.totalLost)),
        },
      },
      webhook: agent.webhook || null,
      createdAt: agent.createdAt,
      lastActiveAt: agent.lastActiveAt,
    },
    actions: {
      deposit: `Send $SHELL to ${agent.depositAddress}`,
      linkWallet: 'POST /api/agent/link-wallet',
      play: 'GET /api/games',
    },
  });
}
