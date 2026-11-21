
export async function onRequest({ env }) {
  try {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    ).all();

    return Response.json({
      status: "online",
      project: "ASTRIX CLOUD",
      database: "connected",
      tables: result.results.map(row => row.name)
    });
  } catch (error) {
    return Response.json({
      status: "error",
      message: "Database connection failed"
    }, { status: 500 });
  }
}
