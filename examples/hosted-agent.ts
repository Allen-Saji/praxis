/**
 * pnpm exec tsx examples/hosted-agent.ts
 * Required: APP_ORIGIN, PRAXIS_TOKEN, PRAXIS_RECIPIENT, PRAXIS_AMOUNT_MIST.
 * Preview is the default. To spend on Testnet, also pass --execute and set
 * PRAXIS_LIVE_TESTNET_CONFIRM=YES and a stable PRAXIS_IDEMPOTENCY_KEY.
 * Reuse that key for retries of the same payment. Never use a new key to retry
 * a timeout or an uncertain submission. Reasoning is published publicly.
 */
export {};

const origin = new URL(required("APP_ORIGIN"));
if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("APP_ORIGIN must be an origin without credentials, path, query or fragment");
if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))) throw new Error("Use HTTPS or a local development origin");
const token = required("PRAXIS_TOKEN");
const execute = process.argv.includes("--execute");
const key = execute ? required("PRAXIS_IDEMPOTENCY_KEY") : null;
if (execute && (process.env.PRAXIS_LIVE_TESTNET_CONFIRM !== "YES" || (process.env.PRAXIS_NETWORK ?? "testnet") !== "testnet")) throw new Error("Execution requires explicit Testnet confirmation");
if (key && !/^[\x20-\x7e]{8,128}$/.test(key)) throw new Error("Idempotency key must be 8 to 128 printable ASCII characters");
const payment = {
  recipient: required("PRAXIS_RECIPIENT"),
  amountMist: required("PRAXIS_AMOUNT_MIST"),
  coinType: "0x2::sui::SUI",
  privacy: "public",
  reasoning: { prompt: "Preview the configured example payment", decision: "Pay the recipient explicitly configured by the operator", model: "hosted-agent-example" },
};
const preview = await call("/api/v1/simulations", payment);
console.log(JSON.stringify({ preview }, null, 2));
if (!execute) {
  console.log("Preview complete. No payment was requested.");
} else if (preview.network !== "testnet" || preview.executionAuthorized !== false || preview.recommendation !== "proceed" || preview.simulationStatus !== "completed") {
  throw new Error("Preview did not recommend proceeding. Review the report before requesting payment.");
} else {
  // Execution checks current policies, usage and access, and simulates again.
  // A positive preview is advisory and does not reserve funds.
  let intent = await call("/api/v1/spend-intents", payment, key!);
  if (typeof intent.intentId !== "string") throw new Error("Missing intent ID. Reconcile using the same idempotency key before retrying.");
  const intentId = intent.intentId;
  console.log(JSON.stringify({ intent }, null, 2));
  const terminal = new Set(["confirmed", "blocked", "failed", "expired"]);
  for (let attempt = 0; attempt < 12 && !terminal.has(String(intent.state)) && intent.state !== "submission_unknown"; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    intent = await call(`/api/v1/spend-intents/${encodeURIComponent(intentId)}`);
  }
  console.log(JSON.stringify({ intent }, null, 2));
  if (!terminal.has(String(intent.state))) console.log("Payment is unresolved. Keep the same idempotency key and reconcile this intent; polling does not trigger another transfer.");
}

async function call(path: string, body?: unknown, idempotencyKey?: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(new URL(path, origin), {
      method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(45_000),
      headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}), ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error("Request did not complete. If execution was requested, reconcile with the same idempotency key; do not create another payment.");
  }
  if (!response.ok) throw new Error(`Praxis returned HTTP ${response.status}. Review the workspace activity before retrying a payment.`);
  return await response.json() as Record<string, unknown>;
}
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
