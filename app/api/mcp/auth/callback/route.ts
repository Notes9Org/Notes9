import { NextRequest, NextResponse } from 'next/server';

// GET /api/mcp/auth/callback - OAuth callback handler
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  if (code) {
    // Success - send code back to opener window
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Authorization Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: rgba(255,255,255,0.1);
      border-radius: 1rem;
      backdrop-filter: blur(10px);
    }
    h1 { margin-bottom: 0.5rem; }
    p { opacity: 0.9; }
    .spinner {
      width: 40px;
      height: 40px;
      margin: 1rem auto;
      border: 3px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <h1>✓ Authorization Successful!</h1>
    <p>Completing connection...</p>
    <div class="spinner"></div>
  </div>
  <script>
    // Send the auth code to the parent window
    if (window.opener) {
      window.opener.postMessage({ 
        type: 'mcp-oauth-success', 
        code: '${code}',
        state: '${state || ''}'
      }, '*');
      setTimeout(() => window.close(), 1500);
    } else {
      // Fallback: redirect to main app with code
      window.location.href = '/catalyst?oauth_code=${code}&oauth_state=${state || ''}';
    }
  </script>
</body>
</html>`;

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  } else if (error) {
    // Error - show error message
    const errorDescription = searchParams.get('error_description') || error;
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Authorization Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: rgba(255,255,255,0.1);
      border-radius: 1rem;
      backdrop-filter: blur(10px);
    }
    h1 { margin-bottom: 0.5rem; }
    p { opacity: 0.9; }
    button {
      margin-top: 1rem;
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 0.5rem;
      background: white;
      color: #c0392b;
      cursor: pointer;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>✗ Authorization Failed</h1>
    <p>${errorDescription}</p>
    <button onclick="window.close()">Close Window</button>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ 
        type: 'mcp-oauth-error', 
        error: '${error}',
        errorDescription: '${errorDescription}'
      }, '*');
    }
  </script>
</body>
</html>`;

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  return new NextResponse('Bad request', { status: 400 });
}
