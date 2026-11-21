
async function hashToken(token) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );

  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

export async function onRequestPost({ request, env }) {
  try {
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/(?:^|;\s*)astrix_session=([^;]+)/);

    if (match) {
      const token = decodeURIComponent(match[1]);
      const tokenHash = await hashToken(token);

      await env.DB.prepare(
        "DELETE FROM sessions WHERE token_hash = ?"
      ).bind(tokenHash).run();
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": "astrix_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
      }
    });
  } catch (error) {
    return Response.json(
      { error: "Logout failed." },
      { status: 500 }
    );
  }
}
