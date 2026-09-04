import { describe, expect, it } from "vitest";
import { blake3Hex, canonicalize } from "../src/canonical";
import { PraxisSdkError } from "../src/errors";
import { buildReasoningEvidence, publishEvidence } from "../src/evidence";
import { WalrusStore } from "../src/walrus";

const publisher = "https://publisher.invalid";
const aggregator = "https://aggregator.invalid";

function response(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("hosted Walrus evidence", () => {
  it.each([
    [{ newlyCreated: { blobObject: { blobId: "blob-new" } } }, "blob-new"],
    [{ alreadyCertified: { blobId: "blob-certified" } }, "blob-certified"],
  ])("accepts the %s response shape", async (publishResponse, blobId) => {
    const bytes = new TextEncoder().encode(canonicalize({ b: 2, a: 1 }));
    const calls: string[] = [];
    const store = new WalrusStore({
      publisher,
      aggregator,
      mode: "hosted",
      fetch: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.startsWith(publisher)) return response(publishResponse);
        return new Response(bytes);
      },
    });

    const result = await store.write(bytes);
    expect(result).toEqual({ blobId, mode: "walrus", hash: blake3Hex(bytes) });
    expect(calls).toHaveLength(2);
  });

  it("publishes canonical bytes and verifies the read-after-write hash", async () => {
    const evidence = buildReasoningEvidence({ z: "last", nested: { b: 2, a: 1 }, a: "first" });
    let published = new Uint8Array();
    const store = new WalrusStore({
      publisher,
      aggregator,
      mode: "hosted",
      fetch: async (input, init) => {
        if (String(input).startsWith(publisher)) {
          published = new Uint8Array(init?.body as ArrayBuffer);
          return response({ newlyCreated: { blobObject: { blobId: "blob-1" } } });
        }
        return new Response(published);
      },
    });

    const result = await publishEvidence({ port: store, evidence, hosted: true });
    expect(new TextDecoder().decode(published)).toBe(canonicalize(evidence.document));
    expect(result.hash).toBe(evidence.hash);
  });

  it("fails closed on a readback mismatch and never returns a local ID in hosted mode", async () => {
    const store = new WalrusStore({
      publisher,
      aggregator,
      mode: "hosted",
      fetch: async (input) =>
        String(input).startsWith(publisher)
          ? response({ newlyCreated: { blobObject: { blobId: "blob-1" } } })
          : new Response(new TextEncoder().encode("tampered")),
    });

    await expect(store.write(new TextEncoder().encode("original"))).rejects.toMatchObject({
      code: "EVIDENCE_READBACK_MISMATCH",
    });
  });

  it("surfaces hosted transport failure as a structured error without local fallback", async () => {
    const store = new WalrusStore({
      publisher,
      aggregator,
      mode: "hosted",
      localFallbackDir: "/tmp/praxis-sdk-hosted-must-not-fallback",
      fetch: async () => {
        throw new Error("network unavailable");
      },
    });
    await expect(store.write(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({
      code: "EVIDENCE_TIMEOUT",
    });
  });

  it("aborts a stalled hosted request at the configured timeout", async () => {
    const store = new WalrusStore({
      publisher,
      aggregator,
      mode: "hosted",
      timeoutMs: 1,
      fetch: async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    });
    await expect(store.write(new Uint8Array([1]))).rejects.toMatchObject({ code: "EVIDENCE_TIMEOUT" });
  });

  it("enforces evidence size bounds before network access", async () => {
    let called = false;
    const store = new WalrusStore({
      publisher,
      aggregator,
      mode: "hosted",
      maxBodyBytes: 2,
      fetch: async () => {
        called = true;
        return response({});
      },
    });
    await expect(store.write(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({ code: "EVIDENCE_TOO_LARGE" });
    expect(called).toBe(false);
  });

  it("rejects local evidence through the hosted evidence port", async () => {
    const evidence = buildReasoningEvidence({ hello: "world" });
    await expect(
      publishEvidence({
        evidence,
        hosted: true,
        port: {
          write: async () => ({ blobId: "local:abc", mode: "local" as const, hash: evidence.hash }),
          read: async () => evidence.bytes,
        },
      }),
    ).rejects.toMatchObject({ code: "LOCAL_EVIDENCE_NOT_ALLOWED" });
  });

  it("does not accept an invalid publisher response", async () => {
    const store = new WalrusStore({
      publisher,
      aggregator,
      mode: "hosted",
      fetch: async () => response({ blobId: "local:bad" }),
    });
    await expect(store.write(new Uint8Array([1]))).rejects.toBeInstanceOf(PraxisSdkError);
  });

  it("bounds publisher response bodies before parsing them", async () => {
    const store = new WalrusStore({
      publisher,
      aggregator,
      mode: "hosted",
      maxBodyBytes: 4,
      fetch: async () => new Response('{"newlyCreated":true}', { status: 200 }),
    });
    await expect(store.write(new Uint8Array([1]))).rejects.toMatchObject({ code: "EVIDENCE_TOO_LARGE" });
  });

  it("handles publisher status, JSON, and blob-ID failures without attempting readback", async () => {
    const cases: Array<[string, () => Response, string]> = [
      ["non-2xx", () => new Response("rejected", { status: 503 }), "EVIDENCE_PUBLISH_FAILED"],
      ["malformed JSON", () => new Response("not-json", { status: 200 }), "EVIDENCE_PUBLISH_FAILED"],
      ["missing blob ID", () => response({ newlyCreated: { blobObject: {} } }), "EVIDENCE_PUBLISH_FAILED"],
    ];
    for (const [, publish, code] of cases) {
      let calls = 0;
      const store = new WalrusStore({
        publisher,
        aggregator,
        mode: "hosted",
        fetch: async () => {
          calls += 1;
          return publish();
        },
      });
      await expect(store.write(new Uint8Array([1]))).rejects.toMatchObject({ code });
      expect(calls).toBe(1);
    }
  });

  it("bounds an oversized aggregator body and wraps aggregator read failures", async () => {
    const oversized = new WalrusStore({
      publisher,
      aggregator,
      mode: "hosted",
      maxBodyBytes: 2,
      fetch: async (input) => String(input).startsWith(publisher)
        ? response({ newlyCreated: { blobObject: { blobId: "blob-1" } } })
        : new Response(new Uint8Array([1, 2, 3])),
    });
    await expect(oversized.write(new Uint8Array([1]))).rejects.toMatchObject({ code: "EVIDENCE_TOO_LARGE" });

    const unavailable = new WalrusStore({
      publisher,
      aggregator,
      mode: "hosted",
      fetch: async () => { throw new Error("aggregator unavailable"); },
    });
    await expect(unavailable.read("blob-1")).rejects.toMatchObject({ code: "EVIDENCE_READBACK_FAILED" });
  });

  it("reuses identical canonical bytes across retries", async () => {
    const evidence = buildReasoningEvidence({ amount: 1n, recipient: "0x2" });
    const published: Uint8Array[] = [];
    const store = new WalrusStore({
      publisher,
      aggregator,
      mode: "hosted",
      fetch: async (input, init) => {
        if (String(input).startsWith(publisher)) {
          published.push(new Uint8Array(init?.body as ArrayBuffer));
          return response({ alreadyCertified: { blobId: "blob-1" } });
        }
        return new Response(evidence.bytes);
      },
    });
    await store.write(evidence.bytes);
    await store.write(evidence.bytes);
    expect(published).toHaveLength(2);
    expect(published[0]).toEqual(published[1]);
    expect(published[0]).toEqual(evidence.bytes);
  });
});
