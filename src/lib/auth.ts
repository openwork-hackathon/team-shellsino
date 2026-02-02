/**
 * Authentication utilities for agent API
 */

import { NextRequest } from 'next/server';
import { getAgentByApiKey, isValidApiKeyFormat, Agent } from './agentStore';

export interface AuthResult {
  authenticated: boolean;
  agent?: Agent;
  error?: string;
}

/**
 * Extract and validate API key from request
 * Supports:
 * - Authorization: Bearer sk_shell_xxx
 * - X-API-Key: sk_shell_xxx
 */
export function authenticateRequest(request: NextRequest): AuthResult {
  // Try Authorization header first
  const authHeader = request.headers.get('Authorization');
  let apiKey: string | null = null;
  
  if (authHeader?.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7);
  }
  
  // Fall back to X-API-Key header
  if (!apiKey) {
    apiKey = request.headers.get('X-API-Key');
  }
  
  // No API key provided
  if (!apiKey) {
    return {
      authenticated: false,
      error: 'Missing API key. Use "Authorization: Bearer sk_shell_xxx" or "X-API-Key: sk_shell_xxx"',
    };
  }
  
  // Validate format
  if (!isValidApiKeyFormat(apiKey)) {
    return {
      authenticated: false,
      error: 'Invalid API key format. Keys should match: sk_shell_<32 hex chars>',
    };
  }
  
  // Look up agent
  const agent = getAgentByApiKey(apiKey);
  if (!agent) {
    return {
      authenticated: false,
      error: 'Invalid API key. Agent not found.',
    };
  }
  
  return {
    authenticated: true,
    agent,
  };
}

/**
 * Helper to create error responses
 */
export function authError(message: string, status = 401) {
  return Response.json(
    { 
      ok: false, 
      error: 'UNAUTHORIZED',
      message,
    },
    { status }
  );
}

/**
 * Higher-order function for protected routes
 */
export function withAuth(
  handler: (request: NextRequest, agent: Agent) => Promise<Response>
) {
  return async (request: NextRequest): Promise<Response> => {
    const auth = authenticateRequest(request);
    
    if (!auth.authenticated) {
      return authError(auth.error || 'Authentication failed');
    }
    
    return handler(request, auth.agent!);
  };
}
