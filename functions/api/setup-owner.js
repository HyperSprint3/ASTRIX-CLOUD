
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

  return `pbkdf2$100000$${encode(salt)}$${encode(bits)}`;
}

function safeEqual(a, b) {
  const encoder = new TextEncoder();
  const x = encoder.encode(a);
  const y = encoder.encode(b);

  if (x.length !== y.length) return false;

  let difference = 0;

  for (let i = 0; i < x.length; i++) {
    difference |= x[i] ^ y[i];
  }

  return difference === 0;
}

export async function onRequestPost({ request, env }) {
  try {
    const setupKey = env.OWNER_SETUP_KEY;
    const suppliedKey = request.headers.get("X-Owner-Setup-Key") || "";

    if (!setupKey || !safeEqual(suppliedKey, setupKey)) {
      return Response.json(
        { error: "Unauthorized setup request." },
        { status: 403 }
      );
    }

    const data = await request.json();

    const username = String(data.username || "").trim();
    const email = String(data.email || "").trim().toLowerCase();
    const password = String(data.password || "");

    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      return Response.json(
        { error: "Invalid username." },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json(
        { error: "Invalid email." },
        { status: 400 }
      );
    }

    if (password.length < 12 || password.length > 128) {
      return Response.json(
        { error: "Password must be 12–128 characters." },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);

    const result = await env.DB.prepare(`
      INSERT INTO users (username, email, password_hash, role)
      SELECT ?, ?, ?, 'owner'
      WHERE NOT EXISTS (SELECT 1 FROM users)
    `).bind(username, email, passwordHash).run();

    if (!result.meta || result.meta.changes !== 1) {
      return Response.json(
        { error: "Owner setup is already locked." },
        { status: 403 }
      );
    }

    return Response.json({
      success: true,
      message: "Owner account created. You can now log in."
    });

  } catch (error) {
    console.error("Owner setup error:", error);

    return Response.json(
      { error: "Owner setup failed." },
      { status: 500 }
    );
  }
}
