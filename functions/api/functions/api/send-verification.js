
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

async function hashCode(email, code, secret) {
  const data = new TextEncoder().encode(
    `${email}:${code}:${secret}`
  );

  const hash = await crypto.subtle.digest("SHA-256", data);

  return btoa(
    String.fromCharCode(...new Uint8Array(hash))
  );
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB || !env.RESEND_API_KEY || !env.RESEND_TEST_EMAIL) {
      return Response.json(
        { error: "Email service is not configured." },
        { status: 500 }
      );
    }

    const data = await request.json();

    const username = String(data.username || "").trim();
    const email = String(data.email || "").trim().toLowerCase();
    const password = String(data.password || "");

    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      return Response.json(
        { error: "Username must be 3–30 letters, numbers or underscores." },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json(
        { error: "Enter a valid email address." },
        { status: 400 }
      );
    }

    if (password.length < 12 || password.length > 128) {
      return Response.json(
        { error: "Password must be 12–128 characters." },
        { status: 400 }
      );
    }

    const testEmail = String(env.RESEND_TEST_EMAIL)
      .trim()
      .toLowerCase();

    if (email !== testEmail) {
      return Response.json(
        {
          error: `For now, signup testing is limited to ${testEmail}. A verified domain is needed for other recipients.`
        },
        { status: 403 }
      );
    }

    const existingUser = await env.DB.prepare(
      "SELECT id FROM users WHERE email = ? OR username = ?"
    ).bind(email, username).first();

    if (existingUser) {
      return Response.json(
        { error: "That email or username is already registered." },
        { status: 409 }
      );
    }

    const now = Math.floor(Date.now() / 1000);

    const previous = await env.DB.prepare(
      "SELECT created_at FROM email_verifications WHERE email = ?"
    ).bind(email).first();

    if (previous && now - previous.created_at < 60) {
      return Response.json(
        { error: "Please wait 60 seconds before requesting another code." },
        { status: 429 }
      );
    }

    const code = String(
      crypto.getRandomValues(new Uint32Array(1))[0] % 1000000
    ).padStart(6, "0");

    const passwordHash = await hashPassword(password);
    const codeHash = await hashCode(
      email,
      code,
      env.RESEND_API_KEY
    );

    await env.DB.prepare(
      `INSERT INTO email_verifications
       (email, username, password_hash, code_hash, expires_at, attempts, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT(email) DO UPDATE SET
         username = excluded.username,
         password_hash = excluded.password_hash,
         code_hash = excluded.code_hash,
         expires_at = excluded.expires_at,
         attempts = 0,
         created_at = excluded.created_at`
    ).bind(
      email,
      username,
      passwordHash,
      codeHash,
      now + 600,
      now
    ).run();

    const emailResponse = await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "ASTRIX CLOUD <onboarding@resend.dev>",
          to: [testEmail],
          subject: "Your ASTRIX CLOUD verification code",
          html: `
            <div style="font-family:Arial,sans-serif;padding:24px;color:#172033">
              <h2>ASTRIX CLOUD</h2>
              <p>Your signup verification code is:</p>
              <h1 style="letter-spacing:8px">${code}</h1>
              <p>This code expires in 10 minutes.</p>
              <p>If you did not request this code, ignore this email.</p>
            </div>
          `
        })
      }
    );

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();

      console.error("Resend error:", errorText);

      await env.DB.prepare(
        "DELETE FROM email_verifications WHERE email = ?"
      ).bind(email).run();

      return Response.json(
        { error: "Resend could not send the email. Check your Resend setup." },
        { status: 502 }
      );
    }

    return Response.json({
      success: true,
      message: "Verification code sent to your test email."
    });

  } catch (error) {
    console.error("Verification email error:", error);

    return Response.json(
      { error: "Could not send verification code." },
      { status: 500 }
    );
  }
}
