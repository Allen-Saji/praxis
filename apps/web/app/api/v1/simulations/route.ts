import { DbDomainError } from "@allen-saji/praxis-db";
import { authorizeAgentRequest } from "@/lib/agent-auth.server";
import { HttpError, safeErrorResponse } from "@/lib/control-plane.server";
import { previewSpend } from "@/lib/preview.server";
import { readSpendRequest } from "@/lib/spend-request.server";

export async function POST(request: Request) {
  try {
    const context = await authorizeAgentRequest(request);
    const body = await readSpendRequest(request);
    const preview = await previewSpend({ context, request: body });
    return Response.json(preview, { status: preview.simulationStatus === "unavailable" ? 503 : 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const safe = error instanceof DbDomainError && ["PREVIEW_IDENTITY_INACTIVE", "NO_ACTIVE_POLICY"].includes(error.code)
      ? new HttpError(403, "AGENT_ACCESS_UNAVAILABLE", "Agent access or active limits are unavailable") : error;
    const response = safeErrorResponse(safe, "PREVIEW_UNAVAILABLE", 503);
    if (response.status === 429) response.headers.set("Retry-After", "60");
    return response;
  }
}
