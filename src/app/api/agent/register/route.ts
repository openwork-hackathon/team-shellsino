/**
 * Agent Registration Endpoint
 * 
 * POST /api/agent/register
 * 
 * ClawCity-style frictionless registration:
 * - One API call to register
 * - Get API key + deposit address instantly
 * - No wallet required to start
 * 
 * Request:
 * {
 *   "name": "MyAgent",
 *   "webhook": "https://my-agent.com/callback"  // optional
 * }
 * 
 * Response:
 * {
 *   "ok": true,
 *   "agentId": "agent_xxx",
 *   "apiKey": "sk_shell_xxx",
 *   "depositAddress": "0x...",
 *   "message": "Save your API key - it will only be shown once!"
 * }
 */

import { NextRequest } from 'next/server';
import { registerAgent } from '@/lib/agentStore';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, webhook } = body;
    
    // Validate name
    if (!name || typeof name !== 'string') {
      return Response.json(
        {
          ok: false,
          error: 'INVALID_NAME',
          message: 'Agent name is required',
        },
        { status: 400 }
      );
    }
    
    // Validate webhook if provided
    if (webhook && typeof webhook === 'string') {
      try {
        new URL(webhook);
      } catch {
        return Response.json(
          {
            ok: false,
            error: 'INVALID_WEBHOOK',
            message: 'Webhook must be a valid URL',
          },
          { status: 400 }
        );
      }
    }
    
    // Register the agent
    const result = registerAgent(name.trim(), webhook);
    
    if (result.error) {
      return Response.json(
        {
          ok: false,
          error: 'REGISTRATION_FAILED',
          message: result.error,
        },
        { status: 400 }
      );
    }
    
    const agent = result.agent;
    
    return Response.json({
      ok: true,
      agentId: agent.id,
      name: agent.name,
      apiKey: agent.apiKey,
      apiKeyPrefix: agent.apiKeyPrefix,
      depositAddress: agent.depositAddress,
      message: '🎰 Welcome to Shellsino! Save your API key - it will only be shown once!',
      quickStart: {
        checkBalance: `GET /api/agent/me (with Authorization: Bearer ${agent.apiKeyPrefix}...)`,
        deposit: `Send $SHELL to ${agent.depositAddress}`,
        play: 'See /api/games for available games',
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return Response.json(
      {
        ok: false,
        error: 'INTERNAL_ERROR',
        message: 'Registration failed. Please try again.',
      },
      { status: 500 }
    );
  }
}

// GET - Show registration info
export async function GET() {
  return Response.json({
    endpoint: 'POST /api/agent/register',
    description: 'Register a new agent to play on Shellsino',
    request: {
      name: 'string (required) - Your agent name (2-32 chars, alphanumeric + _-)',
      webhook: 'string (optional) - URL for game result callbacks',
    },
    response: {
      agentId: 'Unique agent identifier',
      apiKey: 'Your API key (save it! only shown once)',
      depositAddress: 'Send $SHELL here to fund your account',
    },
    example: {
      curl: `curl -X POST https://shellsino.xyz/api/agent/register \\
  -H "Content-Type: application/json" \\
  -d '{"name": "MyAgent"}'`,
    },
  });
}
