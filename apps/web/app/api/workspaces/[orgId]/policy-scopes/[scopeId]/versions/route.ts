import { z } from "zod";
import { ownerMutation, policyRepository, readJsonBody } from "@/lib/workspace-mutations.server";

const rule = z.object({ recipient: z.string().min(1), effect: z.enum(["allow", "deny"]) }).strict();
const bodySchema = z.object({ maxPerTxMist: z.string(), maxPerDayMist: z.string(), maxPerMonthMist: z.string(), blockRiskScoreAt: z.number().int().min(1).max(100), requireSimulation: z.literal(true), rules: z.array(rule).max(200).default([]) }).strict();

export async function POST(request: Request, context: { params: Promise<{ orgId: string; scopeId: string }> }) {
  const { orgId, scopeId } = await context.params;
  return ownerMutation(request, orgId, async (actorId) => ({ policyVersion: await policyRepository().createDraft({ organizationId: orgId, scopeId, createdByUserId: actorId, ...await readJsonBody(request, (value) => bodySchema.parse(value)) }) }));
}
