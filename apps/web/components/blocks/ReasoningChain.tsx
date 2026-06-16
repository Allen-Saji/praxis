import { KeyValueRow, KeyValueList } from "./KeyValueRow";
import type { SerializedReasoning } from "@/lib/serialized";

/**
 * Renders the model / prompt / decision of a reasoning blob. Prompt and decision
 * are verbatim agent output, so they render in the mono code face. Used both for
 * public reasoning and for the revealed plaintext after a successful decrypt.
 */
export function ReasoningChain({ reasoning }: { reasoning: SerializedReasoning }) {
  const { model, prompt, decision } = reasoning.intent.reasoning;
  return (
    <div className="flex flex-col gap-3">
      <KeyValueList>
        <KeyValueRow label="Model">
          <span className="font-mono text-[14px] text-[var(--text-hi)]">{model}</span>
        </KeyValueRow>
      </KeyValueList>
      <ReasoningPanel label="Prompt" text={prompt} />
      <ReasoningPanel label="Decision" text={decision} />
    </div>
  );
}

function ReasoningPanel({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--text-mid)]">
        {label}
      </span>
      <div className="max-h-56 overflow-y-auto rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
        <p className="font-mono text-[13px] leading-[22px] whitespace-pre-wrap break-words text-[var(--text-hi)]">
          {text}
        </p>
      </div>
    </div>
  );
}
