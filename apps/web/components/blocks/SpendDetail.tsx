import Link from "next/link";
import { ExternalLink, FileWarning } from "lucide-react";
import { KeyValueRow, KeyValueList } from "./KeyValueRow";
import { Address } from "@/components/data/Address";
import { Amount } from "@/components/data/Amount";
import { BlobLink } from "@/components/data/BlobLink";
import { SealBadge } from "@/components/data/SealBadge";
import { StatusBadge } from "@/components/data/StatusBadge";
import { RiskScore } from "@/components/data/RiskScore";
import { RiskFlagList, PolicyViolationList } from "./RiskFlagList";
import { BalanceChangeList } from "./BalanceChangeRow";
import { ReasoningChain } from "./ReasoningChain";
import { DecryptControl } from "./DecryptControl";
import { Section } from "./Section";
import { absoluteTime, coinSymbol } from "@/lib/format";
import { reasonPlain } from "@/lib/risk";
import { suiscanUrl } from "@/lib/explorer";
import type { SerializedReceipt, SerializedReasoningResult } from "@/lib/serialized";

/**
 * The full spend detail body, shared by SpendDrawer (right-side) and the
 * deep-linkable /app/spend/[id] route. Server-renders the public reasoning if
 * the blob is readable; if sealed, hands off to the client DecryptControl gated
 * by the connected viewer. Maps one-to-one to DESIGN.md section 11.
 */
export function SpendDetail({
  receipt,
  reasoning,
}: {
  receipt: SerializedReceipt;
  reasoning: SerializedReasoningResult;
}) {
  const blob = !reasoning.sealed ? reasoning.reasoning : null;
  const recommendation = blob?.simulation.recommendation;
  const abortReason = blob?.abortReason ?? null;

  return (
    <div className="flex flex-col gap-6">
      {/* Intent */}
      <Section title="Intent">
        <div className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
          <KeyValueList>
            <KeyValueRow label="Agent">
              <Address value={receipt.agent} kind="account" />
            </KeyValueRow>
            <KeyValueRow label="Recipient">
              <Address value={receipt.recipient} kind="account" />
            </KeyValueRow>
            <KeyValueRow label="Coin">
              <span className="font-mono text-[14px] text-[var(--text-mid)]">
                {coinSymbol(blob?.intent.coinType ?? "0x2::sui::SUI")}
              </span>
            </KeyValueRow>
          </KeyValueList>
          <KeyValueList>
            <KeyValueRow label="Wallet">
              <Address value={receipt.wallet} kind="account" />
            </KeyValueRow>
            <KeyValueRow label="Amount">
              <Amount mist={receipt.amount} />
            </KeyValueRow>
            <KeyValueRow label="Time">
              <span className="font-mono text-[13px] text-[var(--text-mid)]">
                {absoluteTime(receipt.timestampMs)}
              </span>
            </KeyValueRow>
          </KeyValueList>
        </div>
      </Section>

      {/* Reasoning chain */}
      <Section
        title="Reasoning chain"
        aside={<SealBadge sealed={receipt.sealed} />}
      >
        {reasoning.sealed ? (
          <DecryptControl blobId={receipt.blobId} auditorCount={reasoning.auditors.length} />
        ) : blob ? (
          <ReasoningChain reasoning={blob} />
        ) : (
          <BlobUnreachable />
        )}
      </Section>

      {/* Simulation report (only when the blob is public/revealed at render time) */}
      {blob ? (
        <Section
          title="Simulation report"
          aside={
            recommendation ? (
              <span className="text-[12px] uppercase tracking-[0.04em] text-[var(--text-mid)]">
                recommendation:{" "}
                <span
                  className="font-medium"
                  style={{
                    color:
                      recommendation === "abort"
                        ? "var(--risk-critical)"
                        : recommendation === "review"
                          ? "var(--risk-medium)"
                          : "var(--risk-low)",
                  }}
                >
                  {recommendation.toUpperCase()}
                </span>
              </span>
            ) : null
          }
        >
          <div className="flex flex-col gap-5">
            <div className="grid gap-x-8 sm:grid-cols-2">
              <KeyValueList>
                <KeyValueRow label="Sim">
                  <StatusBadge status={blob.simulation.success ? "sim_passed" : "sim_failed"} />
                </KeyValueRow>
              </KeyValueList>
              <KeyValueList>
                <KeyValueRow label="Gas">
                  <Amount mist={blob.simulation.gasEstimate} decimals={6} />
                </KeyValueRow>
              </KeyValueList>
            </div>

            <div className="max-w-md">
              <RiskScore score={blob.simulation.riskScore} variant="full" />
            </div>

            <div className="flex flex-col gap-2">
              <SubHeading>Risk flags</SubHeading>
              <RiskFlagList risks={blob.simulation.risks} />
            </div>

            <div className="flex flex-col gap-2">
              <SubHeading>Policy violations</SubHeading>
              <PolicyViolationList violations={blob.policyCheck.violations} />
            </div>

            <div className="flex flex-col gap-2">
              <SubHeading>Balance changes</SubHeading>
              <BalanceChangeList changes={blob.simulation.balanceChanges} />
            </div>
          </div>
        </Section>
      ) : null}

      {/* On-chain + audit */}
      <Section title="On-chain + audit">
        <KeyValueList>
          <KeyValueRow label="Receipt object">
            <Address value={receipt.receiptId} kind="object" />
          </KeyValueRow>
          <KeyValueRow label="Walrus blob">
            <BlobLink blobId={receipt.blobId} />
          </KeyValueRow>
          {blob ? (
            <KeyValueRow label="blake3">
              <Address value={blob.blake3} kind="object" copy link={false} head={8} tail={6} />
            </KeyValueRow>
          ) : null}
        </KeyValueList>
        {abortReason ? (
          <p className="mt-3 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[13px] leading-[20px] text-[var(--text-mid)]">
            Praxis blocked this spend. {reasonPlain(abortReason)}
          </p>
        ) : null}
      </Section>
    </div>
  );
}

/** Header line for the detail body. */
export function SpendDetailHeader({ receipt }: { receipt: SerializedReceipt }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h2 className="text-[22px] font-semibold leading-[28px] text-[var(--text-hi)]">Spend</h2>
      <Address value={receipt.receiptId} kind="object" head={6} tail={4} />
      <StatusBadge status={receipt.status} />
      <Link
        href={suiscanUrl("object", receipt.receiptId)}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-[var(--text-mid)] transition-colors duration-150 hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        Suiscan
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--text-mid)]">
      {children}
    </span>
  );
}

function BlobUnreachable() {
  return (
    <div className="flex items-start gap-3 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5">
      <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-[var(--risk-medium)]" />
      <p className="text-[13px] leading-[20px] text-[var(--text-mid)]">
        Could not load the reasoning blob from Walrus. The on-chain receipt is still valid; retry
        the blob fetch.
      </p>
    </div>
  );
}
