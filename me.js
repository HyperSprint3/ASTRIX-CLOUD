
async function hashToken(token) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );

  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

export async function onRequestGet({ request, env }) {
  try {
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/(?:^|;\s*)astrix_session=([^;]+)/);

    if (!match) {
      return Response.json({ error: "Not logged in." }, { status: 401 });
    }

    const tokenHash = await hashToken(decodeURIComponent(match[1]));

    const session = await env.DB.prepare(`
      SELECT users.id, users.username, users.email, users.role
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).bind(tokenHash, Math.floor(Date.now() / 1000)).first();

    if (!session) {
      return Response.json({ error: "Session expired." }, { status: 401 });
    }

    return Response.json({
      success: true,
      user: session
    });
  } catch (error) {
    return Response.json({ error: "Session check failed." }, { status: 500 });
  }
}
