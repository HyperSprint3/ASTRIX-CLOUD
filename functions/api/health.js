
export async function onRequest(context) {
  return new Response(
    JSON.stringify({
      status: "online",
      project: "ASTRIX CLOUD",
      message: "Backend is working!"
    }),
    {
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}
