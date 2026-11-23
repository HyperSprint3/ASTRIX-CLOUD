
async function getAuthenticatedUser(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)astrix_session=([^;]+)/);

  if (!match) return null;

  let token;

  try {
    token = decodeURIComponent(match[1]);
  } catch {
    return null;
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );

  const hash = btoa(
    String.fromCharCode(...new Uint8Array(digest))
  );

  return env.DB.prepare(`
    SELECT users.id, users.username, users.email, users.role
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
      AND sessions.expires_at > ?
  `).bind(hash, Math.floor(Date.now() / 1000)).first();
}

export async function onRequestGet({ request, env }) {
  try {
    const user = await getAuthenticatedUser(request, env);

    if (!user) {
      return Response.json(
        { error: "Please log in." },
        { status: 401 }
      );
    }

    if (user.role !== "owner") {
      return Response.json(
        { error: "Owner access required." },
        { status: 403 }
      );
    }

    const stats = await env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM users WHERE role = 'owner') AS owners,
        (SELECT COUNT(*) FROM users WHERE role = 'admin') AS admins,
        (SELECT COUNT(*) FROM users WHERE role = 'staff') AS staff,
        (SELECT COUNT(*) FROM users WHERE role = 'member') AS members,
        (SELECT COUNT(*) FROM tickets) AS total_tickets,
        (SELECT COUNT(*) FROM tickets WHERE status = 'open') AS open_tickets,
        (SELECT COUNT(*) FROM tickets WHERE status = 'closed') AS closed_tickets,
        (SELECT COUNT(*) FROM ticket_replies) AS total_replies,
        (SELECT COUNT(*) FROM sessions
          WHERE expires_at > unixepoch()) AS active_sessions
    `).first();

    return Response.json({
      success: true,
      owner: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      stats
    });

  } catch (error) {
    console.error("Owner statistics error:", error);

    return Response.json(
      { error: "Could not load Owner statistics." },
      { status: 500 }
    );
  }
}
