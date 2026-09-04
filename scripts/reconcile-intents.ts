export {};

const origin = process.env.APP_ORIGIN;
const token = process.env.PRAXIS_INTERNAL_TOKEN;
if (!origin) throw new Error("APP_ORIGIN is required");
if (!token) throw new Error("PRAXIS_INTERNAL_TOKEN is required");

const response = await fetch(`${origin.replace(/\/$/, "")}/api/internal/reconcile`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
if (!response.ok) throw new Error(`reconciliation request failed with HTTP ${response.status}`);
const body = await response.json() as { reconciled?: unknown[] };
console.log(`Reconciled ${body.reconciled?.length ?? 0} intent(s).`);
