import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Empty, StatePill } from "./WorkspaceFrame";

describe("workspace operational states", () => {
  it("labels uncertain submissions without presenting them as failures", () => {
    const html = renderToStaticMarkup(<StatePill value="submission_unknown" />);
    expect(html).toContain("submission unknown");
    expect(html).toContain("--risk-medium");
    expect(html).not.toContain("--risk-critical");
  });

  it("renders explicit empty state copy", () => {
    expect(renderToStaticMarkup(<Empty>No decisions recorded.</Empty>)).toContain("No decisions recorded.");
  });
});
