import { describe, expect, it } from "vitest";
import { withSerializationRetry } from "../src/repositories/transactions";

describe("bounded transaction retries", () => {
  it.each(["40001", "40P01"])("retries %s at most twice and never makes a fourth attempt", async (code) => {
    let attempts = 0;
    await expect(withSerializationRetry(async () => {
      attempts += 1;
      throw Object.assign(new Error("retryable database failure"), { code });
    }, 99)).rejects.toMatchObject({ code });
    expect(attempts).toBe(3);
  });
});
