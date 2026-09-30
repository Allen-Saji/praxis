import { normalizeSuiAddress, isValidSuiAddress } from "@mysten/sui/utils";
import { requireOrganizationMember, safeErrorResponse, HttpError } from "@/lib/control-plane.server";
import { assertWalletEnablement } from "@/lib/workspace-mutations.server";
export async function GET(request: Request, context: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await context.params; await requireOrganizationMember(request, orgId, "admin");
    const raw = new URL(request.url).searchParams.get("address") ?? "";
    if (!isValidSuiAddress(raw)) throw new HttpError(400, "INVALID_ADDRESS", "Enter a valid Sui wallet address");
    let eligible = false;
    try { await assertWalletEnablement(normalizeSuiAddress(raw)); eligible = true; }
    catch (error) {
      if (!(error instanceof HttpError) || error.code !== "WALLET_NOT_SUPPORTED") throw error;
    }
    return Response.json({ eligible }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return safeErrorResponse(error, "ELIGIBILITY_UNAVAILABLE", 503); }
}
