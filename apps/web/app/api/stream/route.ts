// Public explorer endpoints are retired. Personal data uses workspace routes.
export async function GET() { return Response.json({ error: "This endpoint is no longer available" }, { status: 410, headers: { "Cache-Control": "no-store" } }); }
export const POST = GET;
