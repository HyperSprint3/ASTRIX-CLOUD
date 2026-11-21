
async function getUser(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)astrix_session=([^;]+)/);
  if (!match) return null;

  const token = decodeURIComponent(match[1]);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));

  return env.DB.prepare(`
    SELECT users.id, users.role
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).bind(hash, Math.floor(Date.now() / 1000)).first();
}

export async function onRequestPatch({ request, env }) {
  try {
    const user = await getUser(request, env);

    if (!user) {
      return Response.json({ error: "Please log in." }, { status: 401 });
    }

    if (!["owner", "admin", "staff"].includes(user.role)) {
      return Response.json({ error: "Staff access required." }, { status: 403 });
    }

    const data = await request.json();
    const ticketId = Number(data.ticket_id);
    const status = String(data.status || "").toLowerCase();

    if (!Number.isInteger(ticketId) || ticketId < 1) {
      return Response.json({ error: "Invalid ticket ID." }, { status: 400 });
    }

    if (!["open", "closed"].includes(status)) {
      return Response.json({ error: "Invalid ticket status." }, { status: 400 });
    }

    const result = await env.DB.prepare(
      "UPDATE tickets SET status = ? WHERE id = ?"
    ).bind(status, ticketId).run();

    if (!result.meta.changes) {
      return Response.json({ error: "Ticket not found." }, { status: 404 });
    }

    return Response.json({ success: true, status });
  } catch (error) {
    return Response.json({ error: "Could not update ticket." }, { status: 500 });
  }
}
