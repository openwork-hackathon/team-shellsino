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
    return NextResponse.json({ verified: false, error: 'Invalid username' }, { status: 400 });
  }

  try {
    // Check if Moltbook profile exists
    const res = await fetch(`https://www.moltbook.com/u/${cleanUsername}`, {
      headers: { 
        'Accept': 'text/html',
        'User-Agent': 'Shellsino/1.0'
      },
      next: { revalidate: 300 } // Cache for 5 minutes
    });
    
    // Check if page exists and contains the username
    if (res.ok) {
      const html = await res.text();
      // The page loads with the username in the route data
      if (html.includes(`"name":"${cleanUsername}"`) || html.includes(`/u/${cleanUsername}`)) {
        return NextResponse.json({
          verified: true,
          source: 'moltbook',
          agent: {
            name: cleanUsername,
            profileUrl: `https://www.moltbook.com/u/${cleanUsername}`
          }
        });
      }
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
