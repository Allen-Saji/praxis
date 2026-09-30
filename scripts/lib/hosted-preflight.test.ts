import { test } from "node:test";
import assert from "node:assert/strict";
import { hostedPreflight, preflightConfig, type ChainState } from "./hosted-preflight";
const wallet = `0x${"2".repeat(64)}`;
const recipient = `0x${"3".repeat(64)}`;
const environment = { APP_ORIGIN: "https://praxis.example", PRAXIS_SHARED_AGENT_A_TOKEN: `px_agent_${"a".repeat(12)}_${"a".repeat(43)}`, PRAXIS_SHARED_AGENT_B_TOKEN: `px_agent_${"b".repeat(12)}_${"b".repeat(43)}`, PRAXIS_PHASE1_WALLET_ADDRESS: wallet, PRAXIS_SHARED_RECIPIENT: recipient, PRAXIS_SHARED_AMOUNT_MIST: "1" };
const config = preflightConfig(environment);
function fixture() {
  const calls: Array<{ path: string; method?: string; redirect?: string }> = [];
  const chain: ChainState = { network: "testnet", capOwner: wallet, capType: "expected-cap", balanceMist: "100" };
  let identityCount = 0;
  let previewCount = 0;
  const identities = ["a", "b"].map((id) => ({ authenticated: true, network: "testnet", agentId: id, assignmentId: id, walletId: "shared", walletAddress: wallet }));
  const previews = ["a", "b"].map(() => ({ network: "testnet", executionAuthorized: false, simulationStatus: "completed", recommendation: "proceed", payment: { recipient, amountMist: "1", coinType: "0x2::sui::SUI" }, budgets: { agent: { day: { remainingMist: "1" } }, wallet: { day: { remainingMist: "10" }, month: { remainingMist: "10" } } } }));
  const fetcher: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    calls.push({ path, method: init?.method, redirect: init?.redirect });
    assert.ok(["/api/v1/agent", "/api/v1/simulations"].includes(path), "preflight must not call a spending endpoint");
    return Response.json(path === "/api/v1/agent" ? identities[identityCount++] : previews[previewCount++]);
  };
  return { calls, chain, identities, previews, deps: { fetch: fetcher, chain: async () => chain, expectedCapType: "expected-cap" } };
}
test("valid preflight is advisory and only reads identity or previews", async () => {
  const f = fixture(); const result = await hostedPreflight(config, f.deps);
  assert.equal(result.checksPassed, true); assert.equal(result.executionAuthorized, false); assert.equal(result.principalMist, "2");
  assert.equal(f.calls.length, 4); assert.ok(f.calls.every((call) => call.redirect === "error"));
  assert.ok(!JSON.stringify(result).includes(config.tokens[0]));
});
test("same assignment or different wallet stops previews", async () => {
  for (const field of ["agentId", "assignmentId", "walletId", "walletAddress"] as const) {
    const f = fixture(); f.identities[1]![field] = field === "agentId" || field === "assignmentId" ? "a" : "other";
    const result = await hostedPreflight(config, f.deps);
    assert.equal(result.checksPassed, false); assert.equal(f.calls.length, 2);
  }
});
test("wrong network, cap owner, cap type or insufficient funds fails", async () => {
  for (const change of [{ network: "mainnet" }, { capOwner: recipient }, { capType: "other" }, { balanceMist: "2" }]) {
    const f = fixture(); Object.assign(f.chain, change);
    assert.equal((await hostedPreflight(config, f.deps)).checksPassed, false);
  }
});
test("unavailable, stale or mismatched previews and shared budgets fail", async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.previews[0]!.recommendation = "abort"; },
    (f: ReturnType<typeof fixture>) => { f.previews[0]!.executionAuthorized = true; },
    (f: ReturnType<typeof fixture>) => { f.previews[0]!.payment.recipient = wallet; },
    (f: ReturnType<typeof fixture>) => { f.previews[0]!.budgets.agent.day.remainingMist = "2"; },
    (f: ReturnType<typeof fixture>) => { f.previews[0]!.budgets.wallet.month.remainingMist = "1"; },
  ]) { const f = fixture(); mutate(f); assert.equal((await hostedPreflight(config, f.deps)).checksPassed, false); }
});
test("HTTP failures and transport exceptions never expose response bodies or credentials", async () => {
  for (const status of [401, 429, 503]) {
    const f = fixture(); f.deps.fetch = async () => new Response(config.tokens[0], { status });
    const report = await hostedPreflight(config, f.deps);
    assert.equal(report.checksPassed, false); assert.ok(!JSON.stringify(report).includes(config.tokens[0]));
  }
  const f = fixture(); f.deps.fetch = async () => { throw new Error(`Credential ${config.tokens[0]}`); };
  assert.ok(!JSON.stringify(await hostedPreflight(config, f.deps)).includes(config.tokens[0]));
});
test("configuration rejects mainnet, insecure origins, duplicate credentials and invalid amounts", () => {
  for (const change of [{ PRAXIS_NETWORK: "mainnet" }, { APP_ORIGIN: "http://praxis.example" }, { APP_ORIGIN: "https://private@praxis.example" }, { PRAXIS_SHARED_AGENT_B_TOKEN: environment.PRAXIS_SHARED_AGENT_A_TOKEN }, { PRAXIS_SHARED_AMOUNT_MIST: "0" }, { PRAXIS_SHARED_AMOUNT_MIST: "18446744073709551616" }]) assert.throws(() => preflightConfig({ ...environment, ...change }));
});
