import "server-only";
import { parseAgentCredential, tokenDigest } from "@allen-saji/praxis-control-plane";
import { authRepository, HttpError, requiredSecret } from "./control-plane.server";

export async function authorizeAgentRequest(request: Request) {
  const value = request.headers.get("authorization");
  if (!value || value.length > 256 || value.includes(",") || !value.startsWith("Bearer ") || value.slice(7).includes(" ")) {
    throw new HttpError(401, "AGENT_UNAUTHENTICATED", "Agent credential is invalid");
  }
  const token = value.slice(7);
  try {
    const { prefix } = parseAgentCredential(token);
    const repository = authRepository();
    const authorized = await repository.authorizeAgent({ tokenPrefix: prefix, tokenHash: tokenDigest(token, requiredSecret("PRAXIS_CREDENTIAL_PEPPER")), requestsPerMinute: Number(process.env.PRAXIS_AGENT_RATE_LIMIT ?? "60") });
    await repository.touchCredential(authorized.credential.id, authorized.now).catch(() => undefined);
    return authorized;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "RATE_LIMITED") throw new HttpError(429, "RATE_LIMITED", "Too many requests for this credential");
    throw new HttpError(401, "AGENT_UNAUTHENTICATED", "Agent credential is invalid");
  }
}
