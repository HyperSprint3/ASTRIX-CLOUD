
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

async function requireOwner(request, env) {
  const user = await getAuthenticatedUser(request, env);

  if (!user) {
    return {
      error: Response.json(
        { error: "Please log in." },
        { status: 401 }
      )
    };
  }

  if (user.role !== "owner") {
    return {
      error: Response.json(
        { error: "Owner access required." },
        { status: 403 }
      )
    };
  }

  return { user };
}

function jsonError(message, status = 400) {
  return Response.json({ error: message }, { status });
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validUsername(username) {
  return /^[a-zA-Z0-9_-]{3,30}$/.test(username);
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    key,
    256
  );

  const hash = new Uint8Array(derivedBits);

  const toBase64 = (bytes) =>
    btoa(String.fromCharCode(...bytes));

  return `pbkdf2$100000$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireOwner(request, env);

    if (auth.error) return auth.error;

    const result = await env.DB.prepare(`
      SELECT id, username, email, role, created_at
      FROM users
      WHERE role IN ('admin', 'staff')
      ORDER BY id DESC
    `).all();

    return Response.json({
      success: true,
      accounts: result.results || []
    });

  } catch (error) {
    console.error("Team accounts error:", error);

    return jsonError(
      "Could not load team accounts.",
      500
    );
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireOwner(request, env);

    if (auth.error) return auth.error;

    let body;

    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid request body.");
    }

    const username = String(body.username || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = typeof body.password === "string"
      ? body.password
      : "";
    const role = String(body.role || "").trim().toLowerCase();

    if (!validUsername(username)) {
      return jsonError(
        "Username must be 3–30 characters and contain only letters, numbers, underscores or hyphens."
      );
    }

    if (!validEmail(email) || email.length > 254) {
      return jsonError("Enter a valid email address.");
    }

    if (password.length < 12 || password.length > 128) {
      return jsonError(
        "Password must be between 12 and 128 characters."
      );
    }

    if (!["admin", "staff"].includes(role)) {
      return jsonError(
        "Role must be Admin or Staff."
      );
    }

    const passwordHash = await hashPassword(password);

    const result = await env.DB.prepare(`
      INSERT INTO users (username, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `).bind(
      username,
      email,
      passwordHash,
      role
    ).run();

    return Response.json({
      success: true,
      message: "Team account created successfully.",
      account: {
        id: result.meta.last_row_id,
        username,
        email,
        role
      }
    }, { status: 201 });

  } catch (error) {
    if (
      error.message &&
      /UNIQUE constraint failed/i.test(error.message)
    ) {
      return jsonError(
        "That username or email is already registered.",
        409
      );
    }

    console.error("Team account creation error:", error);

    return jsonError(
      "Could not create team account.",
      500
    );
  }
}
