
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

  return await env.DB.prepare(`
    SELECT users.id, users.username, users.email, users.role
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).bind(hash, Math.floor(Date.now() / 1000)).first();
}

export async function onRequestGet({ request, env }) {
  try {
    const user = await getUser(request, env);
    if (!user) return Response.json({ error: "Please log in." }, { status: 401 });

    const staff = ["owner", "admin", "staff"].includes(user.role);

    const result = staff
      ? await env.DB.prepare(`
          SELECT tickets.*, users.username, users.email
          FROM tickets JOIN users ON users.id = tickets.user_id
          ORDER BY tickets.created_at DESC
        `).all()
      : await env.DB.prepare(`
          SELECT * FROM tickets
          WHERE user_id = ?
          ORDER BY created_at DESC
        `).bind(user.id).all();

    return Response.json({ success: true, tickets: result.results });
  } catch (error) {
    return Response.json({ error: "Could not load tickets." }, { status: 500 });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const user = await getUser(request, env);
    if (!user) return Response.json({ error: "Please log in." }, { status: 401 });

    const data = await request.json();
    const subject = String(data.subject || "").trim();
    const category = String(data.category || "").trim();
    const description = String(data.description || "").trim();

    if (!subject || !category || !description) {
      return Response.json({ error: "Complete all ticket fields." }, { status: 400 });
    }

    if (subject.length > 150 || category.length > 60 || description.length > 5000) {
      return Response.json({ error: "Ticket content is too long." }, { status: 400 });
    }

    const result = await env.DB.prepare(`
      INSERT INTO tickets (user_id, subject, category, description, status)
      VALUES (?, ?, ?, ?, 'open')
    `).bind(user.id, subject, category, description).run();

    return Response.json({
      success: true,
      ticketId: result.meta.last_row_id
    });
  } catch (error) {
    return Response.json({ error: "Could not create ticket." }, { status: 500 });
  }
}
