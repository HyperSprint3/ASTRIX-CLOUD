
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    key,
    256
  );

  const encode = bytes =>
    btoa(String.fromCharCode(...new Uint8Array(bytes)));

  return `pbkdf2$210000$${encode(salt)}$${encode(bits)}`;
}

export async function onRequestPost({ request, env }) {
  try {
    const data = await request.json();
    const username = String(data.username || "").trim();
    const email = String(data.email || "").trim().toLowerCase();
    const password = String(data.password || "");

    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      return Response.json({ error: "Invalid username." }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Invalid email." }, { status: 400 });
    }

    if (password.length < 12 || password.length > 128) {
      return Response.json({
        error: "Password must be 12–128 characters."
      }, { status: 400 });
    }

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM users"
    ).first();

    if (count.total !== 0) {
      return Response.json({
        error: "Owner setup is already locked."
      }, { status: 403 });
    }

    const passwordHash = await hashPassword(password);

    await env.DB.prepare(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES (?, ?, ?, 'owner')`
    ).bind(username, email, passwordHash).run();

    return Response.json({
      success: true,
      message: "Owner account created. You can now log in."
    });
    } catch (error) {
    console.error("Owner setup error:", error);

    return Response.json({
      error: error.message || "Unknown setup error."
    }, { status: 500 });
  }
}
