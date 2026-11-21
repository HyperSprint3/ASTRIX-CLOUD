
function decodeBase64(value) {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

function encodeBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

async function verifyPassword(password, storedHash) {
  const parts = storedHash.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;

  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1) return false;

  const salt = decodeBase64(parts[2]);
  const expected = decodeBase64(parts[3]);

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
      iterations,
      hash: "SHA-256"
    },
    key,
    256
  );

  const actual = new Uint8Array(bits);
  if (actual.length !== expected.length) return false;

  let difference = 0;
  for (let i = 0; i < actual.length; i++) {
    difference |= actual[i] ^ expected[i];
  }

  return difference === 0;
}

async function hashToken(token) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return encodeBase64(bytes);
}

export async function onRequestPost({ request, env }) {
  try {
    const data = await request.json();
    const email = String(data.email || "").trim().toLowerCase();
    const password = String(data.password || "");

    if (!email || !password) {
      return Response.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    const user = await env.DB.prepare(
      "SELECT id, username, email, password_hash, role FROM users WHERE email = ?"
    ).bind(email).first();

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return Response.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = encodeBase64(tokenBytes);
    const tokenHash = await hashToken(token);
    const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

    await env.DB.prepare(
      "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)"
    ).bind(user.id, tokenHash, expiresAt).run();

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `astrix_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`
      }
    });
  } catch (error) {
    return Response.json(
      { error: "Login failed. Please try again." },
      { status: 500 }
    );
  }
}
