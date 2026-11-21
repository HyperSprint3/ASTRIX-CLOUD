
export async function onRequest(context) {
  return Response.json({
    status: "online",
    project: "ASTRIX CLOUD",
    message: "Backend is working!"
  });
}
