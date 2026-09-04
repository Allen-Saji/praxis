import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { requiredSecret, sha256 } from "./control-plane.server";

afterEach(() => {
  delete process.env.PRAXIS_SESSION_PEPPER;
  delete process.env.PRAXIS_CREDENTIAL_PEPPER;
});

describe("control-plane server helpers", () => {
  it("hashes input deterministically without returning the input", () => {
    const secret = "session-token-value";
    const digest = sha256(secret);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain(secret);
    expect(sha256(secret)).toBe(digest);
  });

  it("requires configured non-placeholder peppers", () => {
    expect(() => requiredSecret("PRAXIS_SESSION_PEPPER")).toThrow("PRAXIS_SESSION_PEPPER is not configured");
    process.env.PRAXIS_SESSION_PEPPER = "replace-with-a-real-secret";
    expect(() => requiredSecret("PRAXIS_SESSION_PEPPER")).toThrow("PRAXIS_SESSION_PEPPER is not configured");
    process.env.PRAXIS_SESSION_PEPPER = "test-only-pepper";
    expect(requiredSecret("PRAXIS_SESSION_PEPPER")).toBe("test-only-pepper");
  });
});
