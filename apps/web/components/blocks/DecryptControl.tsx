"use client";

import { Lock, LockOpen, ShieldAlert } from "lucide-react";
import { Button } from "@/components/primitives/Button";
import { useViewer } from "@/components/providers/ViewerProvider";
import { useDecrypt } from "@/lib/hooks/useDecrypt";
import { truncateMiddle } from "@/lib/format";
import { ReasoningChain } from "./ReasoningChain";

/**
 * The "Decrypt with Seal" action and the reasoning panel it gates. A small state
 * machine: sealed-locked -> decrypting -> revealed | denied | error. The decrypt
 * runs server-side (POST /api/decrypt); only the connected viewer address is
 * sent. The seal master secret never reaches the browser (DESIGN.md section 9).
 */
export function DecryptControl({
  blobId,
  auditorCount,
}: {
  blobId: string;
  auditorCount: number;
}) {
  const { viewer, source } = useViewer();
  const { state, decrypt } = useDecrypt();

  if (state.kind === "revealed") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[13px] text-[var(--risk-low)]">
          <LockOpen className="h-4 w-4" />
          <span>
            Decrypted. Visible to you and {Math.max(auditorCount - 1, 0)} other auditor
            {auditorCount - 1 === 1 ? "" : "s"}.
          </span>
        </div>
        <ReasoningChain reasoning={state.reasoning} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--panel-2)] p-4">
      <div className="flex items-center gap-2 text-[14px] text-[var(--accent)]">
        <Lock className="h-4 w-4" />
        <span className="font-medium">Reasoning is sealed</span>
      </div>

      {state.kind === "denied" ? (
        <DeniedPanel auditorCount={state.auditorCount ?? auditorCount} />
      ) : state.kind === "error" ? (
        <p className="text-[13px] leading-[20px] text-[var(--risk-critical)]">{state.message}</p>
      ) : (
        <p className="text-[13px] leading-[20px] text-[var(--text-mid)]">
          Sealed to {auditorCount} auditor{auditorCount === 1 ? "" : "s"}. Connect an allowlisted
          address to decrypt it.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          loading={state.kind === "decrypting"}
          disabled={!viewer || state.kind === "decrypting"}
          onClick={() => viewer && decrypt(blobId, viewer)}
        >
          {state.kind === "decrypting" ? "Decrypting" : "Decrypt with Seal"}
        </Button>
        {viewer ? (
          <span className="text-[12px] text-[var(--text-low)]">
            as {truncateMiddle(viewer)} ({source})
          </span>
        ) : (
          <span className="text-[12px] text-[var(--text-low)]">
            Connect a wallet or enter an address to decrypt.
          </span>
        )}
      </div>
    </div>
  );
}

function DeniedPanel({ auditorCount }: { auditorCount: number }) {
  return (
    <div className="flex items-start gap-2 text-[13px] leading-[20px] text-[var(--risk-high)]">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        This reasoning is sealed to {auditorCount} auditor{auditorCount === 1 ? "" : "s"}. Connect
        an allowlisted address to decrypt it.
      </span>
    </div>
  );
}
