import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./control-plane.server", () => ({ HttpError: class extends Error { constructor(public status: number, public code: string, message: string) { super(message); } } }));
import { provisionVaultDelegate } from "./vault-signer.server";
const scope = { organizationId: "org", assignmentId: "assignment", packageId: "0x1", vaultId: "0x2", agent: "0x3" };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("remote signer boundary", () => {
  it("requires encrypted transport in production and does not send credentials to redirects", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("PRAXIS_SIGNER_URL", "http://signer.invalid"); vi.stubEnv("PRAXIS_SIGNER_TOKEN", "secret-test");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(provisionVaultDelegate(scope)).rejects.toMatchObject({ code: "SIGNER_UNAVAILABLE" });
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv("PRAXIS_SIGNER_URL", "https://signer.invalid");
    fetcher.mockResolvedValue(Response.json({ address: `0x${"0".repeat(63)}4` }));
    expect(await provisionVaultDelegate(scope)).toBe(`0x${"0".repeat(63)}4`);
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "error", cache: "no-store" }));
  });
  it("does not expose signer error bodies to the application", async () => {
    vi.stubEnv("PRAXIS_SIGNER_URL", "https://signer.invalid"); vi.stubEnv("PRAXIS_SIGNER_TOKEN", "secret-test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("private-key-material", { status: 500 })));
    try { await provisionVaultDelegate(scope); throw new Error("expected rejection"); }
    catch (error) { expect(String(error)).not.toContain("private-key-material"); expect(String(error)).not.toContain("secret-test"); }
  });
});
