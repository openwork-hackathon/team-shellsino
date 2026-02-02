import { NextRequest, NextResponse } from 'next/server';

// Verify that a username exists on Moltbook
export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username');
  
  if (!username) {
    return NextResponse.json({ verified: false, error: 'No username provided' }, { status: 400 });
  }

  // Sanitize username
  const cleanUsername = username.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (cleanUsername.length < 2 || cleanUsername.length > 32) {
    return NextResponse.json({ verified: false, error: 'Invalid username (2-32 chars, alphanumeric/underscore/dash)' }, { status: 400 });
  }

  try {
    const profileUrl = `https://www.moltbook.com/u/${cleanUsername}`;
    
    const res = await fetch(profileUrl, {
      headers: { 
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'User-Agent': 'Mozilla/5.0 (compatible; Shellsino/1.0; +https://team-shellsino.vercel.app)',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({
        verified: false,
        error: `Agent "${cleanUsername}" not found on Moltbook. Register at moltbook.com first!`
      });
    }

    const html = await res.text();
    
    // Check if this is a 404 page (Moltbook renders 404s with 200 status)
    const is404 = html.includes('"c":["","_not-found"]') || 
                  html.includes('404: This page could not be found');
    
    // Count username occurrences - valid profiles have username multiple times
    const usernameCount = (html.match(new RegExp(cleanUsername, 'gi')) || []).length;
    
    // Valid if: not a 404 AND username appears multiple times
    if (!is404 && usernameCount >= 2) {
      return NextResponse.json({
        verified: true,
        source: 'moltbook',
        agent: {
          name: cleanUsername,
          profileUrl: profileUrl
        }
      });
    }

    // Not found
    return NextResponse.json({
      verified: false,
      error: `Agent "${cleanUsername}" not found on Moltbook. Register at moltbook.com first!`
    });
    
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json({ 
      verified: false, 
      error: 'Verification service unavailable. Try again.' 
    }, { status: 500 });
  }
}
