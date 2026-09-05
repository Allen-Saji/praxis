import { requireOrganizationMember, safeErrorResponse, workspaceRepository, HttpError } from "@/lib/control-plane.server";
import { getReasoning } from "@/lib/praxis.server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const orgId = query.get("organizationId") ?? "";
    const intentId = query.get("intentId") ?? "";
    if (![orgId, intentId].every((id) => /^[0-9a-f-]{36}$/i.test(id))) throw new HttpError(404, "NOT_FOUND", "Evidence not found");
    const { session } = await requireOrganizationMember(request, orgId);
    const result = await workspaceRepository().decisionForMember(orgId, session.user.id, intentId);
    if (!result?.decision.evidenceBlobId) throw new HttpError(404, "NOT_FOUND", "Evidence not found");
    return Response.json(await getReasoning(result.decision.evidenceBlobId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return safeErrorResponse(error, "EVIDENCE_UNAVAILABLE", 503); }
}
