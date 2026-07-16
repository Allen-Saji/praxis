import Link from "next/link";
import { ExternalLink, FileWarning } from "lucide-react";
import { KeyValueRow, KeyValueList } from "./KeyValueRow";
import { Address } from "@/components/data/Address";
import { Amount } from "@/components/data/Amount";
import { BlobLink } from "@/components/data/BlobLink";
import { SealBadge } from "@/components/data/SealBadge";
import { StatusBadge } from "@/components/data/StatusBadge";
import { RiskBadge } from "@/components/data/RiskBadge";
import { RiskScore } from "@/components/data/RiskScore";
import { RiskFlagList, PolicyViolationList } from "./RiskFlagList";
import { BalanceChangeList } from "./BalanceChangeRow";
import { ReasoningChain } from "./ReasoningChain";
import { DecryptControl } from "./DecryptControl";
import { Section } from "./Section";
import { absoluteTime, coinSymbol } from "@/lib/format";
import { reasonPlain, scoreToBand } from "@/lib/risk";
import { suiscanUrl, walrusBlobUrl } from "@/lib/explorer";
import type { SerializedStreamEntry, SerializedReasoningResult } from "@/lib/serialized";

/**
 * The full spend detail body, shared by SpendDrawer (right-side) and the
 * deep-linkable /app/spend/[id] route. Renders both confirmed spends and aborted
 * ones from a unified stream entry. Confirmed entries carry a receipt object;
 * aborts source everything from the Walrus reasoning blob. Server-renders public
 * reasoning if readable; if sealed, hands off to the client DecryptControl gated
 * by the connected viewer. Maps to DESIGN.md sections 5 and 11.
 */
export function SpendDetail({
  entry,
  reasoning,
}: {
  entry: SerializedStreamEntry;
  reasoning: SerializedReasoningResult;
}) {
  const blob = !reasoning.sealed ? reasoning.reasoning : null;
  const recommendation = blob?.simulation.recommendation;
  const aborted = entry.status === "aborted";
  // The reason an abort was blocked: from the entry (event label) first, then the
  // decoded blob if the entry did not carry it (e.g. a sealed-then-revealed abort).
  const abortReason = entry.abortReason ?? blob?.abortReason ?? null;

  return (
    <div className="flex flex-col gap-6">
      {aborted ? (
        <div className="flex items-start gap-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--panel-2)] px-4 py-3">
          <StatusBadge status="aborted" />
          <p className="text-[13px] leading-[20px] text-[var(--text-mid)]">
            Praxis blocked this spend before it signed.
            {abortReason ? ` ${reasonPlain(abortReason)}` : ""}
          </p>
        </div>
      ) : null}

      {/* Intent */}
      <Section title="Intent">
        <div className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
          <KeyValueList>
            <KeyValueRow label="Agent">
              <Address value={entry.agent} kind="account" />
            </KeyValueRow>
            <KeyValueRow label="Recipient">
              <Address value={entry.recipient} kind="account" />
            </KeyValueRow>
            <KeyValueRow label="Coin">
              <span className="font-mono text-[14px] text-[var(--text-mid)]">
                {coinSymbol(blob?.intent.coinType ?? "0x2::sui::SUI")}
              </span>
            </KeyValueRow>
          </KeyValueList>
          <KeyValueList>
            <KeyValueRow label="Wallet">
              <Address value={entry.wallet} kind="account" />
            </KeyValueRow>
            <KeyValueRow label="Amount">
              <Amount mist={entry.amount} />
            </KeyValueRow>
            <KeyValueRow label="Time">
              <span className="font-mono text-[13px] text-[var(--text-mid)]">
                {absoluteTime(entry.timestampMs)}
              </span>
            </KeyValueRow>
          </KeyValueList>
        </div>
      </Section>

      {/* Reasoning chain */}
      <Section title="Reasoning chain" aside={<SealBadge sealed={entry.sealed} />}>
        {reasoning.sealed ? (
          <DecryptControl blobId={entry.blobId} auditorCount={reasoning.auditors.length} />
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
          {entry.receiptId ? (
            <KeyValueRow label="Receipt object">
              <Address value={entry.receiptId} kind="object" />
            </KeyValueRow>
          ) : null}
          <KeyValueRow label="Walrus blob">
            <BlobLink blobId={entry.blobId} />
          </KeyValueRow>
          {blob ? (
            <KeyValueRow label="blake3">
              <Address value={blob.blake3} kind="object" copy link={false} head={8} tail={6} />
            </KeyValueRow>
          ) : null}
        </KeyValueList>
        {aborted && abortReason ? (
          <p className="mt-3 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[13px] leading-[20px] text-[var(--text-mid)]">
            Praxis blocked this spend. {reasonPlain(abortReason)}
          </p>
        ) : null}
      </Section>
    </div>
  );
}

/** Header line for the detail body. Confirmed links to Suiscan; aborts link to the Walrus blob. */
export function SpendDetailHeader({ entry }: { entry: SerializedStreamEntry }) {
  const aborted = entry.status === "aborted";
  const idValue = entry.receiptId ?? entry.blobId;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className="text-[22px] font-semibold leading-[28px] text-[var(--text-hi)]">Spend</h1>
      {entry.receiptId ? (
        <Address value={entry.receiptId} kind="object" head={6} tail={4} />
      ) : (
        <BlobLink blobId={entry.blobId} />
      )}
      <StatusBadge status={entry.status} />
      {aborted ? <RiskBadge level={scoreToBand(entry.riskScore)} showLabel={false} /> : null}
      <Link
        href={
          entry.receiptId
            ? suiscanUrl("object", idValue)
            : walrusBlobUrl(entry.blobId)
        }
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-2 text-[13px] text-[var(--text-mid)] transition-colors duration-150 hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        {entry.receiptId ? "Suiscan" : "Walrus"}
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
        Could not load the reasoning blob from Walrus. The on-chain record is still valid; retry
        the blob fetch.
      </p>
    </div>
  );
}
