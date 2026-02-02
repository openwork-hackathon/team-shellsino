import { NextRequest } from 'next/server';
import { isAddress } from 'viem';

// In-memory webhook store (in production, use a database)
// This is reset on deploy, but works for hackathon demo
const webhooks: Map<string, {
  address: string;
  url: string;
  events: string[];
  secret: string;
  createdAt: number;
}> = new Map();

// GET /api/webhooks - List registered webhooks (requires address)
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  
  if (!address || !isAddress(address)) {
    return Response.json({ error: 'Valid address required' }, { status: 400 });
  }

  const webhook = webhooks.get(address.toLowerCase());
  
  if (!webhook) {
    return Response.json({ 
      registered: false,
      message: 'No webhook registered for this address' 
    });
  }

  return Response.json({
    registered: true,
    address: webhook.address,
    url: webhook.url.replace(/^(https?:\/\/[^\/]+).*$/, '$1/***'), // Mask URL for security
    events: webhook.events,
    createdAt: new Date(webhook.createdAt).toISOString(),
  });
}

// POST /api/webhooks - Register a webhook
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, url, events, secret } = body;

    // Validation
    if (!address || !isAddress(address)) {
      return Response.json({ error: 'Valid address required' }, { status: 400 });
    }

    if (!url || !url.startsWith('http')) {
      return Response.json({ error: 'Valid webhook URL required' }, { status: 400 });
    }

    // Validate URL is reachable (optional verification)
    try {
      const testResponse = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      // We don't require 200, just that it's reachable
    } catch {
      // URL might not support HEAD, that's ok
    }

    const validEvents = [
      'game.created',
      'game.joined', 
      'game.resolved',
      'challenge.received',
      'challenge.accepted',
      'roulette.joined',
      'roulette.completed',
      'all'
    ];

    const selectedEvents = events && Array.isArray(events) 
      ? events.filter((e: string) => validEvents.includes(e))
      : ['all'];

    // Generate a secret for webhook verification if not provided
    const webhookSecret = secret || crypto.randomUUID();

    webhooks.set(address.toLowerCase(), {
      address: address.toLowerCase(),
      url,
      events: selectedEvents,
      secret: webhookSecret,
      createdAt: Date.now(),
    });

    return Response.json({
      success: true,
      message: 'Webhook registered successfully',
      address: address.toLowerCase(),
      events: selectedEvents,
      secret: webhookSecret, // Agent should store this to verify incoming webhooks
      note: 'Webhook notifications will be sent with X-Shellsino-Signature header for verification',
    });
  } catch (error) {
    console.error('Webhook registration error:', error);
    return Response.json({ error: 'Failed to register webhook' }, { status: 500 });
  }
}

// DELETE /api/webhooks - Unregister a webhook
export async function DELETE(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  
  if (!address || !isAddress(address)) {
    return Response.json({ error: 'Valid address required' }, { status: 400 });
  }

  const existed = webhooks.delete(address.toLowerCase());

  return Response.json({
    success: true,
    message: existed ? 'Webhook removed' : 'No webhook was registered',
  });
}

// Helper function to send webhook notifications (called from other APIs)
export async function sendWebhookNotification(
  targetAddress: string,
  event: string,
  payload: Record<string, any>
) {
  const webhook = webhooks.get(targetAddress.toLowerCase());
  if (!webhook) return;

  // Check if subscribed to this event
  if (!webhook.events.includes('all') && !webhook.events.includes(event)) {
    return;
  }

  try {
    const body = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    // Create signature for verification
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(webhook.secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(body)
    );
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shellsino-Event': event,
        'X-Shellsino-Signature': signatureHex,
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    console.error(`Failed to send webhook to ${targetAddress}:`, error);
  }
}

// Export for use in other API routes
export { webhooks };
