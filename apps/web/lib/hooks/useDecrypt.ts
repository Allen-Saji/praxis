"use client";

import { useCallback, useState } from "react";
import type { DecryptResult, SerializedReasoning } from "../serialized";
import { buildDecryptChallenge } from "../decrypt-challenge";

/** Decrypt state machine: sealed | decrypting | revealed | denied | error. */
export type DecryptState =
  | { kind: "sealed" }
  | { kind: "decrypting" }
  | { kind: "revealed"; reasoning: SerializedReasoning }
  | { kind: "denied"; auditorCount?: number }
  | { kind: "error"; message: string };

/** Signs the challenge bytes with the connected wallet (dapp-kit personal message). */
export type SignChallenge = (message: Uint8Array) => Promise<{ signature: string }>;

export function useDecrypt() {
  const [state, setState] = useState<DecryptState>({ kind: "sealed" });

  const decrypt = useCallback(
    async (blobId: string, viewer: string, sign: SignChallenge) => {
      setState({ kind: "decrypting" });
      try {
        const message = buildDecryptChallenge(blobId, viewer, new Date().toISOString());
        let signature: string;
        try {
          ({ signature } = await sign(new TextEncoder().encode(message)));
        } catch {
          setState({ kind: "error", message: "Signature was rejected in the wallet." });
          return;
        }

        const res = await fetch("/api/decrypt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blobId, viewer, message, signature }),
        });
        const data = (await res.json()) as DecryptResult;
        if (data.ok) {
          setState({ kind: "revealed", reasoning: data.reasoning });
          return;
        }
        if (res.status === 403) {
          setState({ kind: "denied", auditorCount: data.auditorCount });
          return;
        }
        setState({ kind: "error", message: data.error });
      } catch (err) {
        setState({ kind: "error", message: err instanceof Error ? err.message : "Decrypt failed." });
      }
    },
    [],
  );

  const reset = useCallback(() => setState({ kind: "sealed" }), []);

  return { state, decrypt, reset };
}
