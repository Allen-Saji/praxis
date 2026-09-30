import { normalizeSuiAddress, parseMist } from "@allen-saji/praxis-control-plane";

export type PreflightConfig = { origin: string; tokens: [string, string]; wallet: string; recipient: string; amountMist: string };
export type ChainState = { network: string; capOwner: string; capType: string; balanceMist: string };
type Check = { name: string; status: "passed" | "failed" | "skipped"; message: string };
type Dependencies = { fetch: typeof fetch; chain(wallet: string): Promise<ChainState>; expectedCapType: string };
type RecordValue = Record<string, unknown>;
class PreflightHttpError extends Error {}
const record = (value: unknown): RecordValue => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};

export function preflightConfig(env: Record<string, string | undefined>): PreflightConfig {
  const required = (key: string) => { const value = env[key]; if (!value) throw new Error(`${key} is required`); return value; };
  if ((env.PRAXIS_NETWORK ?? "testnet") !== "testnet") throw new Error("Preflight supports Testnet only");
  let origin: URL;
  try { origin = new URL(required("APP_ORIGIN")); } catch { throw new Error("APP_ORIGIN must be a valid origin"); }
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)))) throw new Error("Use an HTTPS origin or localhost without a path or credentials");
  const tokens: [string, string] = [required("PRAXIS_SHARED_AGENT_A_TOKEN"), required("PRAXIS_SHARED_AGENT_B_TOKEN")];
  if (tokens.some((token) => !/^px_agent_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$/.test(token))) throw new Error("Both agent credentials must use the Praxis token format");
  if (tokens[0] === tokens[1]) throw new Error("Use credentials for two different agents");
  return { origin: origin.origin, tokens, wallet: normalizeSuiAddress(required("PRAXIS_PHASE1_WALLET_ADDRESS")), recipient: normalizeSuiAddress(required("PRAXIS_SHARED_RECIPIENT")), amountMist: parseMist(required("PRAXIS_SHARED_AMOUNT_MIST")).toString() };
}

/** Only connection checks, advisory previews and on-chain reads; no execution API. */
export async function hostedPreflight(config: PreflightConfig, deps: Dependencies) {
  const checks: Check[] = [];
  const check = (name: string, passed: boolean, message: string) => checks.push({ name, status: passed ? "passed" : "failed", message });
  async function request(index: number, path: "/api/v1/agent" | "/api/v1/simulations", body?: unknown) {
    const response = await deps.fetch(new URL(path, config.origin), { method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(15_000), headers: { authorization: `Bearer ${config.tokens[index]}`, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      const message = response.status === 401 ? "Credential rejected; check the credential and service health." : response.status === 429 ? "Credential rate limit reached; retry later." : response.status === 503 ? "Service unavailable; verify application and database health." : `Request failed with HTTP ${response.status}.`;
      throw new PreflightHttpError(message);
    }
    return record(await response.json());
  }
  const connections: Array<RecordValue | null> = [];
  for (let i = 0; i < 2; i++) {
    try {
      const connection = await request(i, "/api/v1/agent");
      const valid = connection.authenticated === true && connection.network === "testnet" && ["agentId", "assignmentId", "walletId"].every((key) => typeof connection[key] === "string" && connection[key] !== "");
      check(`agent_${i + 1}_access`, valid, valid ? "Credential is active on Testnet." : "Connection response is missing an active Testnet identity.");
      connections.push(valid ? connection : null);
    } catch (error) {
      // Only our bounded HTTP messages are reported. Transport exceptions may contain secrets.
      const safe = error instanceof PreflightHttpError ? error.message : "Connection check failed or timed out.";
      check(`agent_${i + 1}_access`, false, safe); connections.push(null);
    }
  }
  const [a, b] = connections;
  const shared = !!a && !!b && a.agentId !== b.agentId && a.assignmentId !== b.assignmentId && a.walletId === b.walletId;
  check("shared_wallet", shared, shared ? "Two different agents share one wallet." : "Use different agents assigned to the same wallet.");
  const addressMatches = shared && a?.walletAddress === config.wallet && b?.walletAddress === config.wallet;
  check("wallet_address", addressMatches, addressMatches ? "Both credentials identify the expected wallet address." : "Wallet address mismatch or missing from the server response. Deploy the current connection endpoint and check configuration.");

  try {
    const chain = await deps.chain(config.wallet);
    check("network", chain.network === "testnet", "The public RPC must report Testnet.");
    check("wallet_authority", chain.capOwner === config.wallet && chain.capType === deps.expectedCapType, "The configured wallet must own the deployed Praxis AgentCap.");
    check("principal_balance", /^\d+$/.test(chain.balanceMist) && BigInt(chain.balanceMist) > 2n * BigInt(config.amountMist), "Balance must exceed both planned payments. Gas and storage costs require additional headroom.");
  } catch { check("chain_reads", false, "Could not verify Testnet wallet balance and AgentCap ownership."); }

  if (shared && addressMatches) {
    const previews: Array<RecordValue | null> = [];
    for (let i = 0; i < 2; i++) {
      try {
        const preview = await request(i, "/api/v1/simulations", { recipient: config.recipient, amountMist: config.amountMist, coinType: "0x2::sui::SUI", privacy: "public", reasoning: { prompt: "Preview the controlled shared-wallet rehearsal payment", decision: "Check limits and simulation without requesting execution", model: "hosted-preflight" } });
        const payment = record(preview.payment);
        const valid = preview.network === "testnet" && preview.executionAuthorized === false && preview.simulationStatus === "completed" && preview.recommendation === "proceed" && payment.recipient === config.recipient && payment.amountMist === config.amountMist && payment.coinType === "0x2::sui::SUI";
        check(`agent_${i + 1}_preview`, valid, valid ? "Preview recommends proceeding; no execution authorized." : "Preview is blocked, incomplete or does not match the configured payment.");
        previews.push(valid ? preview : null);
      } catch { check(`agent_${i + 1}_preview`, false, "Preview failed or timed out; inspect service health before a rehearsal."); previews.push(null); }
    }
    const beforeA = previews[0]; const beforeB = previews[1];
    if (beforeA && beforeB) {
      const aBudget = record(record(record(beforeA.budgets).agent).day);
      check("personal_limit_scenario", aBudget.remainingMist === config.amountMist, "A's payment must exactly exhaust its remaining daily allowance for the demonstration.");
      const sharedBudget = record(record(beforeA.budgets).wallet);
      const enough = ["day", "month"].every((period) => { const remaining = record(sharedBudget[period]).remainingMist; return typeof remaining === "string" && /^\d+$/.test(remaining) && BigInt(remaining) >= 2n * BigInt(config.amountMist); });
      check("shared_headroom", enough, "The shared daily and monthly budgets must cover both planned payments.");
    }
  } else checks.push({ name: "payment_previews", status: "skipped", message: "Resolve credential and wallet identity checks first." });
  return { observedAt: new Date().toISOString(), network: "testnet", executionAuthorized: false, checksPassed: checks.every((item) => item.status === "passed"), principalMist: (2n * BigInt(config.amountMist)).toString(), checks, remaining: ["Live receipt and Walrus readback", "Gas and evidence storage funding", "Restart and reconciliation acceptance", "Explicit authorization for live rehearsal"] };
}
