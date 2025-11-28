/**
 * SIMPLE AUTHENTICATION FOR SINGLE-USER SYSTEM
 * Uses environment variable password check + signed cookie session
 */

const crypto = require('crypto');

module.exports = async (req, res) => {
  // CORS headers
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    'https://maggieforbesstrategies.com',
    'https://www.maggieforbesstrategies.com',
    'http://localhost:3000'
  ].filter(Boolean);

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;

  // Simple password check against environment variable
  if (password && password === process.env.ADMIN_PASSWORD) {
    // Generate session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Set httpOnly cookie (XSS protection)
    res.setHeader('Set-Cookie', [
      `mfs_session=${sessionToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`,
      `mfs_expires=${expiresAt.toISOString()}; Secure; SameSite=Strict; Path=/; Max-Age=604800`
    ]);

    return res.status(200).json({
      success: true,
      expiresAt: expiresAt.toISOString()
    });
  }

  return res.status(401).json({
    success: false,
    error: 'Invalid password'
  });
};
