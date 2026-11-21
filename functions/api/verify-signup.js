
async function hashCode(email, code, secret) {
  const data = new TextEncoder().encode(
    `${email}:${code}:${secret}`
  );

  const hash = await crypto.subtle.digest("SHA-256", data);

  return btoa(
    String.fromCharCode(...new Uint8Array(hash))
  );
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;

  let difference = 0;

  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return difference === 0;
}

export async function onRequestPost({ request, env }) {
  try {
    const data = await request.json();

    const email = String(data.email || "").trim().toLowerCase();
    const code = String(data.code || "").trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json(
        { error: "Invalid email address." },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(code)) {
      return Response.json(
        { error: "Enter the six-digit verification code." },
        { status: 400 }
      );
    }

    const verification = await env.DB.prepare(
      `SELECT username, password_hash, code_hash,
              expires_at, attempts
       FROM email_verifications
       WHERE email = ?`
    ).bind(email).first();

    if (!verification) {
      return Response.json(
        { error: "No pending signup found. Request a new code." },
        { status: 404 }
      );
    }

    const now = Math.floor(Date.now() / 1000);

    if (now > verification.expires_at) {
      await env.DB.prepare(
        "DELETE FROM email_verifications WHERE email = ?"
      ).bind(email).run();

      return Response.json(
        { error: "Your code expired. Please request a new one." },
        { status: 410 }
      );
    }

    if (verification.attempts >= 5) {
      await env.DB.prepare(
        "DELETE FROM email_verifications WHERE email = ?"
      ).bind(email).run();

      return Response.json(
        { error: "Too many attempts. Request a new code." },
        { status: 429 }
      );
    }

    const submittedHash = await hashCode(
      email,
      code,
      env.RESEND_API_KEY
    );

    if (!safeEqual(submittedHash, verification.code_hash)) {
      await env.DB.prepare(
        `UPDATE email_verifications
         SET attempts = attempts + 1
         WHERE email = ?`
      ).bind(email).run();

      return Response.json(
        { error: "Incorrect verification code." },
        { status: 400 }
      );
    }

    const existing = await env.DB.prepare(
      "SELECT id FROM users WHERE email = ? OR username = ?"
    ).bind(email, verification.username).first();

    if (existing) {
      await env.DB.prepare(
        "DELETE FROM email_verifications WHERE email = ?"
      ).bind(email).run();

      return Response.json(
        { error: "Email or username is already registered." },
        { status: 409 }
      );
    }

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (username, email, password_hash, role)
         VALUES (?, ?, ?, 'member')`
      ).bind(
        verification.username,
        email,
        verification.password_hash
      ),

      env.DB.prepare(
        "DELETE FROM email_verifications WHERE email = ?"
      ).bind(email)
    ]);

    return Response.json({
      success: true,
      message: "Account verified successfully. You can now log in."
    });

  } catch (error) {
    console.error("Signup verification error:", error);

    return Response.json(
      { error: "Could not verify your account. Please try again." },
      { status: 500 }
    );
  }
}
