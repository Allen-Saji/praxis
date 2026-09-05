import { describe, expect, it } from "vitest";
import { sui, toMist } from "./workspace-display";
describe("SUI amounts", () => {
  it("keeps one MIST and large values exact", () => {
    for (const value of ["1", "50000000", "999999999999999999", "18446744073709551615"]) expect(toMist(sui(value))).toBe(value);
    expect(sui("1")).toBe("0.000000001");
  });
  it.each(["0", "-1", "1e9", "0.0000000001", "1,000", "18446744073.709551616"])("rejects invalid amount %s", (value) => { expect(() => toMist(value)).toThrow(); });
});
