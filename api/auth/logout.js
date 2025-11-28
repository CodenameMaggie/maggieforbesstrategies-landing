/**
 * LOGOUT - Clear session cookie
 */

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

  // Clear session cookies
  res.setHeader('Set-Cookie', [
    'mfs_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    'mfs_expires=; Secure; SameSite=Strict; Path=/; Max-Age=0'
  ]);

  return res.status(200).json({ success: true });
};
