import { expect, it, vi } from "vitest";
const authorize = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agent-auth.server", () => ({ authorizeAgentRequest: authorize }));
vi.mock("@/lib/control-plane.server", () => ({ safeErrorResponse: () => Response.json({}, { status: 503 }) }));
import { GET } from "./route";
it("returns the authenticated wallet address without credential or organization data", async () => {
  authorize.mockResolvedValue({ agent: { id: "a" }, assignment: { id: "b" }, wallet: { id: "c", suiAddress: "0x2" }, credential: { tokenHash: "private" }, organization: { id: "private" } });
  const response = await GET(new Request("https://praxis.example/api/v1/agent"));
  expect(await response.json()).toEqual({ authenticated: true, agentId: "a", assignmentId: "b", walletId: "c", walletAddress: "0x2", network: "testnet" });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
