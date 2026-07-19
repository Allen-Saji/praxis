import { describe, expect, it } from "vitest";
import {
  canUseBrowserBack,
  isSameOriginReferrer,
} from "./navigation-history";

describe("isSameOriginReferrer", () => {
  it("accepts a referrer from the current origin", () => {
    expect(
      isSameOriginReferrer(
        "https://praxis.example/app/agents",
        "https://praxis.example",
      ),
    ).toBe(true);
  });

  it("rejects external, empty, and invalid referrers", () => {
    expect(
      isSameOriginReferrer(
        "https://example.com/app/agents",
        "https://praxis.example",
      ),
    ).toBe(false);
    expect(isSameOriginReferrer("", "https://praxis.example")).toBe(false);
    expect(isSameOriginReferrer("not a url", "https://praxis.example")).toBe(
      false,
    );
  });
});

describe("canUseBrowserBack", () => {
  it("uses browser history only for an internal navigation with a prior entry", () => {
    expect(canUseBrowserBack("1", 2)).toBe(true);
    expect(canUseBrowserBack("0", 2)).toBe(false);
    expect(canUseBrowserBack(null, 2)).toBe(false);
    expect(canUseBrowserBack("1", 1)).toBe(false);
  });
});
