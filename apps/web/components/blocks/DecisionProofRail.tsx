import { Check, Database, FileInput, ShieldCheck, WalletCards } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SerializedStreamEntry } from "@/lib/serialized";

interface ProofStep {
  label: string;
  detail: string;
  tone: "complete" | "blocked" | "neutral";
  icon: typeof Check;
}

/**
 * The Praxis signature visual: one causal line from agent intent to durable
 * evidence. It stays compact enough for the dashboard and expands naturally on
 * mobile without hiding the decision behind cards.
 */
export function DecisionProofRail({
  entry,
  finding,
}: {
  entry: SerializedStreamEntry;
  finding?: string | null;
}) {
  const blocked = entry.status === "aborted";
  const steps: ProofStep[] = blocked
    ? [
        { label: "Intent", detail: "captured", tone: "complete", icon: FileInput },
        { label: "Simulation", detail: `risk ${entry.riskScore}`, tone: "complete", icon: Check },
        {
          label: "Gate",
          detail: finding ?? "policy checked",
          tone: "blocked",
          icon: ShieldCheck,
        },
        { label: "Decision", detail: "blocked", tone: "blocked", icon: ShieldCheck },
        { label: "Audit", detail: "Walrus logged", tone: "complete", icon: Database },
      ]
    : [
        { label: "Intent", detail: "captured", tone: "complete", icon: FileInput },
        { label: "Simulation", detail: `risk ${entry.riskScore}`, tone: "complete", icon: Check },
        { label: "Gate", detail: "approved", tone: "complete", icon: ShieldCheck },
        { label: "Decision", detail: "signed", tone: "neutral", icon: WalletCards },
        { label: "Audit", detail: "receipt + Walrus", tone: "complete", icon: Database },
      ];

  return (
    <ol
      aria-label="Praxis decision proof"
      className="grid grid-cols-1 gap-3 md:grid-cols-5 md:gap-0"
    >
      {steps.map((step, index) => {
        const Icon = step.icon;
        return (
          <li
            key={step.label}
            className="relative grid min-w-0 grid-cols-[28px_minmax(0,1fr)] items-center gap-2 md:pr-[18px]"
          >
            <span
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-full border",
                step.tone === "complete" &&
                  "border-[color-mix(in_srgb,var(--accent)_30%,var(--divider))] bg-[color-mix(in_srgb,var(--accent)_7%,var(--workspace))] text-[var(--accent)]",
                step.tone === "blocked" &&
                  "border-[color-mix(in_srgb,var(--risk-critical)_40%,var(--divider))] bg-[var(--risk-critical-tint)] text-[var(--risk-critical)]",
                step.tone === "neutral" &&
                  "border-[var(--divider)] bg-[var(--workspace)] text-[var(--text-mid)]",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">Step {index + 1}</span>
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-mid)]">
                {step.label}
              </span>
              <span
                className={cn(
                  "block truncate font-mono text-[12px] leading-5 text-[var(--text-hi)]",
                  step.tone === "blocked" && "text-[var(--risk-critical)]",
                )}
                title={step.detail}
              >
                {step.detail}
              </span>
            </span>
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute left-[13px] top-[31px] h-3 w-px bg-[var(--divider)] md:left-auto md:right-[5px] md:top-1/2 md:h-px md:w-[9px]"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
