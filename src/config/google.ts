export {};
const { OAuth2Client } = require('google-auth-library');

const clientId = process.env.GOOGLE_CLIENT_ID || '';
const client = new OAuth2Client(clientId);

async function verifyGoogleToken(idToken: string) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId,
  });
  const payload = ticket.getPayload();
  return {
    name: payload?.name || '',
    email: payload?.email || '',
    picture: payload?.picture || '',
    googleId: payload?.sub || '',
  };
}

module.exports = { verifyGoogleToken };