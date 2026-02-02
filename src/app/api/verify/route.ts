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
    // Check if Moltbook profile exists by hitting the profile URL
    const profileUrl = `https://www.moltbook.com/u/${cleanUsername}`;
    const res = await fetch(profileUrl, {
      headers: { 
        'Accept': 'text/html',
        'User-Agent': 'Shellsino/1.0 Agent Verification'
      },
      redirect: 'follow',
    });
    
    if (!res.ok) {
      return NextResponse.json({
        verified: false,
        error: `Agent "${cleanUsername}" not found on Moltbook. Register at moltbook.com first!`
      });
    }

    const html = await res.text();
    
    // Check for 404 indicators in the response
    if (html.includes('"c":["","_not-found"]') || 
        html.includes('404: This page could not be found') ||
        html.includes('<title>404:')) {
      return NextResponse.json({
        verified: false,
        error: `Agent "${cleanUsername}" not found on Moltbook. Register at moltbook.com first!`
      });
    }

    // Check for user data in the React hydration script
    // Pattern: "c":["","u","Username"] indicates a valid user profile route
    // Handle both escaped (\") and unescaped (") JSON
    const routeMatch = html.match(/\\?"c\\?":\s*\[\\?"\\?"\s*,\s*\\?"u\\?"\s*,\s*\\?"([^"\\]+)\\?"\s*\]/);
    if (routeMatch) {
      const foundUsername = routeMatch[1];
      // Case-insensitive match
      if (foundUsername.toLowerCase() === cleanUsername.toLowerCase()) {
        return NextResponse.json({
          verified: true,
          source: 'moltbook',
          agent: {
            name: foundUsername,
            profileUrl: profileUrl
          }
        });
      }
    }

    // Also check params in the hydration data (escaped format)
    const paramsMatch = html.match(/\\?"params\\?":\s*\{\\?"name\\?":\s*\\?"([^"\\]+)\\?"\}/);
    if (paramsMatch) {
      const foundUsername = paramsMatch[1];
      if (foundUsername.toLowerCase() === cleanUsername.toLowerCase()) {
        return NextResponse.json({
          verified: true,
          source: 'moltbook',
          agent: {
            name: foundUsername,
            profileUrl: profileUrl
          }
        });
      }
    }
    
    // Fallback: Check for name in children array pattern: ["name","Username","d"]
    const childrenMatch = html.match(/\[\\?"name\\?",\s*\\?"([^"\\]+)\\?",\s*\\?"d\\?"\]/);
    if (childrenMatch) {
      const foundUsername = childrenMatch[1];
      if (foundUsername.toLowerCase() === cleanUsername.toLowerCase()) {
        return NextResponse.json({
          verified: true,
          source: 'moltbook',
          agent: {
            name: foundUsername,
            profileUrl: profileUrl
          }
        });
      }
    }

    // If we got a 200 but can't find user data, check if page looks like a profile
    // (might be a legit profile with different HTML structure)
    if (html.includes(`/u/${cleanUsername}`) || html.includes(cleanUsername)) {
      // Likely a valid profile page
      return NextResponse.json({
        verified: true,
        source: 'moltbook',
        agent: {
          name: cleanUsername,
          profileUrl: profileUrl
        },
        note: 'Verified via page presence'
      });
    }
    
    // Not found on Moltbook
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
