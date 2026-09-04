import { describe, expect, it, vi } from "vitest";
import type { SuiGraphQLClient } from "@mysten/sui/graphql";
import { PraxisReader } from "../src/reader";
import { makeLegacyDashboardEventBridge, makeLegacyEventClient } from "../src/legacy-dashboard";
import { resolveLegacyEventRpcUrl } from "../src/config";
import type { LegacyDashboardEventBridge } from "../src/legacy-dashboard";
import type { SuiTransport } from "../src/ports";

function transport(): SuiTransport {
  return {
    simulateTransaction: async () => ({}),
    executeTransaction: async () => ({}),
    getBalance: async () => ({ balance: { balance: "0" } }),
    getObject: async () => ({ object: { type: "0x2::agent_registry::AgentIndex", json: { total_count: "2", total_aborts: "1" } } }),
  };
}

function page(nodes: Array<{ timestamp: string; json: Record<string, unknown> }>, hasPreviousPage: boolean, startCursor: string | null) {
  return {
    data: {
      events: {
        pageInfo: { hasPreviousPage, startCursor },
        nodes: nodes.map((node) => ({ timestamp: node.timestamp, contents: { json: node.json } })),
      },
    },
  };
}

describe("GraphQL-first read-only dashboard bridge", () => {
  it("paginates through GraphQL history before considering the legacy bridge", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(page([{ timestamp: "2025-01-01T00:00:00.000Z", json: { receipt_id: "old" } }], true, "cursor-1"))
      .mockResolvedValueOnce(page([{ timestamp: "2025-01-02T00:00:00.000Z", json: { receipt_id: "new" } }], false, null));
    const legacy: LegacyDashboardEventBridge = { queryEvents: vi.fn() };
    const reader = new PraxisReader({
      network: "testnet",
      client: transport(),
      graphqlClient: { query } as unknown as SuiGraphQLClient,
      legacyEventBridge: legacy,
    });

    const events = await reader.recent(2);
    expect(events.map((event) => event.receipt_id)).toEqual(["new", "old"]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(legacy.queryEvents).not.toHaveBeenCalled();
  });

  it("uses JSON-RPC only as the explicitly injected dashboard fallback", async () => {
    const legacy: LegacyDashboardEventBridge = {
      queryEvents: vi.fn().mockResolvedValue({ data: [{ parsedJson: { receipt_id: "legacy", timestamp_ms: "2" } }] }),
    };
    const reader = new PraxisReader({
      network: "testnet",
      client: transport(),
      graphqlClient: { query: vi.fn().mockResolvedValue(page([], false, null)) } as unknown as SuiGraphQLClient,
      legacyEventBridge: legacy,
    });

    await expect(reader.recent(1)).resolves.toEqual([expect.objectContaining({ receipt_id: "legacy" })]);
    expect(legacy.queryEvents).toHaveBeenCalledTimes(1);
  });

  it("strictly decodes on-chain object responses", async () => {
    const reader = new PraxisReader({ client: transport() });
    await expect(reader.indexStats()).resolves.toEqual({ totalCount: 2, totalAborts: 1, abortRate: 1 / 3 });
    const malformed = new PraxisReader({
      client: { ...transport(), getObject: async () => ({ object: { type: "bad", json: "not-json" } }) },
    });
    await expect(malformed.indexStats()).rejects.toMatchObject({ code: "TRANSACTION_RESPONSE_MALFORMED" });
  });

  it("wraps provider errors and malformed event nodes in safe error codes", async () => {
    const providerError = new PraxisReader({
      client: transport(),
      graphqlClient: { query: vi.fn().mockResolvedValue({ errors: [{ message: "provider internals" }] }) } as unknown as SuiGraphQLClient,
      legacyEventBridge: { queryEvents: vi.fn() },
    });
    await expect(providerError.recent(1)).rejects.toMatchObject({ code: "EVENT_READ_FAILED", message: "event history is unavailable" });

    const malformedNode = new PraxisReader({
      client: transport(),
      graphqlClient: { query: vi.fn().mockResolvedValue(page([{ timestamp: "2025-01-01T00:00:00.000Z", json: { walrus_blob_id: [256] } }], false, null)) } as unknown as SuiGraphQLClient,
      legacyEventBridge: { queryEvents: vi.fn() },
    });
    await expect(malformedNode.recent(1)).rejects.toMatchObject({ code: "EVENT_RESPONSE_MALFORMED" });
  });

  it("disables the legacy JSON-RPC dashboard bridge outside Testnet", () => {
    expect(() => makeLegacyDashboardEventBridge("mainnet")).toThrowError(/Testnet dashboard-only/);
    expect(() => makeLegacyEventClient("mainnet")).toThrowError(/Testnet dashboard-only/);
    expect(() => resolveLegacyEventRpcUrl("mainnet")).toThrowError(/Testnet dashboard-only/);
    expect(() => new PraxisReader({ network: "mainnet", legacyEventBridge: { queryEvents: vi.fn() } })).toThrowError(/Testnet dashboard-only/);
    expect(() => new PraxisReader({ network: "mainnet", legacyEventClient: { queryEvents: vi.fn() } })).toThrowError(/Testnet dashboard-only/);
  });

  it("does not construct or call a legacy endpoint for the mainnet default", async () => {
    const reader = new PraxisReader({
      network: "mainnet",
      client: transport(),
      graphqlClient: { query: vi.fn().mockResolvedValue(page([], false, null)) } as unknown as SuiGraphQLClient,
    });
    await expect(reader.recent(1)).rejects.toMatchObject({ code: "CONFIGURATION_ERROR" });
  });
});
