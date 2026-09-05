import { authorizeAgentRequest } from "@/lib/agent-auth.server";
import { safeErrorResponse } from "@/lib/control-plane.server";
export async function GET(request: Request) {
  try {
    const context = await authorizeAgentRequest(request);
    return Response.json({ authenticated: true, agentId: context.agent.id, assignmentId: context.assignment.id, walletId: context.wallet.id, network: "testnet" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return safeErrorResponse(error, "AGENT_UNAUTHENTICATED", 401); }
}
