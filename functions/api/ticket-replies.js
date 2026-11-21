
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
    SELECT users.id, users.username, users.role
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).bind(hash, Math.floor(Date.now() / 1000)).first();
}

async function canAccessTicket(env, user, ticketId) {
  const ticket = await env.DB.prepare(
    "SELECT id, user_id FROM tickets WHERE id = ?"
  ).bind(ticketId).first();

  if (!ticket) return false;

  const staff = ["owner", "admin", "staff"].includes(user.role);
  return staff || ticket.user_id === user.id;
}

export async function onRequestGet({ request, env }) {
  try {
    const user = await getUser(request, env);
    if (!user) {
      return Response.json({ error: "Please log in." }, { status: 401 });
    }

    const url = new URL(request.url);
    const ticketId = Number(url.searchParams.get("ticket_id"));

    if (!Number.isInteger(ticketId) || ticketId < 1) {
      return Response.json({ error: "Invalid ticket ID." }, { status: 400 });
    }

    if (!(await canAccessTicket(env, user, ticketId))) {
      return Response.json({ error: "Ticket not found or access denied." }, { status: 404 });
    }

    const result = await env.DB.prepare(`
      SELECT ticket_replies.id, ticket_replies.ticket_id,
             ticket_replies.message, ticket_replies.created_at,
             users.username, users.role
      FROM ticket_replies
      JOIN users ON users.id = ticket_replies.sender_id
      WHERE ticket_replies.ticket_id = ?
      ORDER BY ticket_replies.created_at ASC
    `).bind(ticketId).all();

    return Response.json({ success: true, replies: result.results });
  } catch (error) {
    return Response.json({ error: "Could not load replies." }, { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const user = await getUser(request, env);
    if (!user) {
      return Response.json({ error: "Please log in." }, { status: 401 });
    }

    const data = await request.json();
    const ticketId = Number(data.ticket_id);
    const message = String(data.message || "").trim();

    if (!Number.isInteger(ticketId) || ticketId < 1 || !message) {
      return Response.json({ error: "Ticket ID and message are required." }, { status: 400 });
    }

    if (message.length > 5000) {
      return Response.json({ error: "Message is too long." }, { status: 400 });
    }

    if (!(await canAccessTicket(env, user, ticketId))) {
      return Response.json({ error: "Ticket not found or access denied." }, { status: 404 });
    }

    const ticket = await env.DB.prepare(
      "SELECT status FROM tickets WHERE id = ?"
    ).bind(ticketId).first();

    if (ticket.status === "closed" && !["owner", "admin", "staff"].includes(user.role)) {
      return Response.json({ error: "This ticket is closed." }, { status: 403 });
    }

    const result = await env.DB.prepare(`
      INSERT INTO ticket_replies (ticket_id, sender_id, message)
      VALUES (?, ?, ?)
    `).bind(ticketId, user.id, message).run();

    return Response.json({
      success: true,
      replyId: result.meta.last_row_id
    });
  } catch (error) {
    return Response.json({ error: "Could not send reply." }, { status: 500 });
  }
}
