export {};

const sequence = [
  "Preview A and B using separate assignment credentials for one wallet.",
  "Confirm A's remaining daily allowance equals the configured payment.",
  "Execute A's payment, then record a blocked one-MIST attempt by A.",
  "Confirm B's individual allowance is unchanged and execute B's payment.",
  "Print intent, transaction and evidence references for inspection.",
];
if (!process.argv.includes("--execute")) {
  console.log(JSON.stringify({ mode: "plan", network: "testnet", sequence, required: ["APP_ORIGIN", "PRAXIS_SHARED_AGENT_A_TOKEN", "PRAXIS_SHARED_AGENT_B_TOKEN", "PRAXIS_SHARED_RECIPIENT", "PRAXIS_SHARED_AMOUNT_MIST", "PRAXIS_SMOKE_RUN_ID"], execution: "Pass --execute and PRAXIS_LIVE_TESTNET_CONFIRM=YES after bounded Testnet spending is authorized. Use a fresh controlled fixture; this script never resets budgets. Preserve the run ID for reconciliation." }, null, 2));
} else {
  await run();
}

async function run() {
  if (process.env.PRAXIS_LIVE_TESTNET_CONFIRM !== "YES" || (process.env.PRAXIS_NETWORK ?? "testnet") !== "testnet") throw new Error("Live execution requires explicit Testnet confirmation");
  const origin = new URL(required("APP_ORIGIN"));
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)))) throw new Error("APP_ORIGIN must be an HTTPS origin or localhost");
  const tokens = { a: required("PRAXIS_SHARED_AGENT_A_TOKEN"), b: required("PRAXIS_SHARED_AGENT_B_TOKEN") };
  if (tokens.a === tokens.b) throw new Error("Use separate credentials for different assignments");
  const amountMist = required("PRAXIS_SHARED_AMOUNT_MIST");
  if (!/^[1-9][0-9]*$/.test(amountMist)) throw new Error("Amount must be positive integer MIST");
  const recipient = required("PRAXIS_SHARED_RECIPIENT");
  const runId = required("PRAXIS_SMOKE_RUN_ID");
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(runId)) throw new Error("Run ID must be 8 to 80 letters, numbers, underscores or hyphens");
  const request = (amount: string) => ({ recipient, amountMist: amount, coinType: "0x2::sui::SUI", privacy: "public", reasoning: { prompt: "Exercise shared wallet limits on a controlled Testnet recipient", decision: "Verify independent agent allowances and a shared wallet cap", model: "shared-wallet-smoke", metadata: { runId } } });
  async function call<T>(agent: "a" | "b", path: string, body?: unknown, key?: string): Promise<T> {
    const response = await fetch(new URL(path, origin), { method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(45_000), headers: { authorization: `Bearer ${tokens[agent]}`, ...(body ? { "content-type": "application/json" } : {}), ...(key ? { "idempotency-key": key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new Error(`HTTP ${response.status}. Reconcile this run before retrying; never change the run ID to retry an uncertain payment.`);
    return response.json() as Promise<T>;
  }
  const preview = (agent: "a" | "b", amount = amountMist) => call<Preview>(agent, "/api/v1/simulations", request(amount));
  const [beforeA, beforeB] = await Promise.all([preview("a"), preview("b")]);
  for (const report of [beforeA, beforeB]) if (report.network !== "testnet" || report.executionAuthorized !== false || report.recommendation !== "proceed") throw new Error("Both initial previews must recommend proceeding on Testnet");
  if (beforeA.walletPolicyVersionId !== beforeB.walletPolicyVersionId || beforeA.assignmentPolicyVersionId === beforeB.assignmentPolicyVersionId) throw new Error("Credentials must identify different agents sharing one wallet");
  if (beforeA.budgets.agent.day.remainingMist !== amountMist) throw new Error("Configure A so this payment exhausts its daily allowance, within its per-payment and monthly caps");
  if (BigInt(beforeA.budgets.wallet.day.remainingMist) < 2n * BigInt(amountMist) || BigInt(beforeA.budgets.wallet.month.remainingMist) < 2n * BigInt(amountMist)) throw new Error("The shared wallet needs headroom for both payments");

  async function spend(agent: "a" | "b", scenario: string, amount: string, expected: string) {
    let intent = await call<Intent>(agent, "/api/v1/spend-intents", request(amount), `${runId}-${scenario}`);
    const reference = () => ({ scenario, intentId: intent.intentId, state: intent.state, txDigest: intent.txDigest, receiptId: intent.receiptId, walrusBlobId: intent.walrusBlobId, budgetViolation: intent.budgetViolation });
    console.log(JSON.stringify(reference()));
    for (let i = 0; i < 12 && !["confirmed", "blocked", "failed", "expired", "submission_unknown"].includes(intent.state); i++) {
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      intent = await call<Intent>(agent, `/api/v1/spend-intents/${encodeURIComponent(intent.intentId)}`);
    }
    console.log(JSON.stringify(reference()));
    if (intent.state !== expected) throw new Error(`Expected ${expected}; got ${intent.state}. Stop and reconcile this intent. Polling does not resume execution.`);
    return intent;
  }
  await spend("a", "allowed-a", amountMist, "confirmed");
  const [exhaustedA, afterB] = await Promise.all([preview("a", "1"), preview("b")]);
  if (exhaustedA.recommendation !== "abort" || exhaustedA.budgets.agent.day.remainingMist !== "0") throw new Error("A's allowance was not exhausted as expected");
  if (afterB.recommendation !== "proceed" || afterB.budgets.agent.day.remainingMist !== beforeB.budgets.agent.day.remainingMist) throw new Error("B's individual allowance changed or payment is no longer eligible");
  const blocked = await spend("a", "personal-limit-a", "1", "blocked");
  if (blocked.budgetViolation?.scope !== "agent" || blocked.budgetViolation.period !== "day") throw new Error("The block did not identify A's daily allowance");
  await spend("b", "allowed-b", amountMist, "confirmed");
  console.log("Shared-wallet sequence completed. Verify receipt sealed=false, recipient balances and Walrus readback, then refresh activity after restart before accepting the deployment.");
}

type Period = { remainingMist: string };
type Preview = { network: string; executionAuthorized: boolean; recommendation: string; walletPolicyVersionId: string; assignmentPolicyVersionId: string; budgets: { wallet: { day: Period; month: Period }; agent: { day: Period; month: Period } } };
type Intent = { intentId: string; state: string; txDigest: string | null; receiptId: string | null; walrusBlobId: string | null; budgetViolation: { scope: string; period: string } | null };
function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }
