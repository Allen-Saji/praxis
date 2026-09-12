import { describe, expect, it } from "vitest";
import { SESSION_REVALIDATION_INTERVAL_MS, verifiedAddressAfterCheck, verifiedAddressBeforeRevalidation } from "./session-verification";

describe("private shell session verification", () => {
  it("keeps server-authorized content visible during a transient background failure", () => {
    expect(verifiedAddressAfterCheck("0xowner", "0xowner", "unavailable")).toBe("0xowner");
  });

  it("fails closed when a suspended tab resumes", () => {
    expect(verifiedAddressBeforeRevalidation("0xowner", true)).toBeNull();
    expect(verifiedAddressBeforeRevalidation("0xowner", false)).toBe("0xowner");
  });

  it("blocks content when the session is invalid or changes owner", () => {
    expect(verifiedAddressAfterCheck("0xowner", "0xowner", "invalid")).toBeNull();
    expect(verifiedAddressAfterCheck("0xowner", "0xother", "valid")).toBe("0xother");
  });

  it("uses a background interval instead of polling on every navigation", () => {
    expect(SESSION_REVALIDATION_INTERVAL_MS).toBe(60_000);
  });
});
