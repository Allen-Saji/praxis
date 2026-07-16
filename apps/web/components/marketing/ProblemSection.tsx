const FAILURE_MODES = [
  {
    code: "01 / INTENT",
    title: "The agent chooses the wrong action.",
    body: "Prompt injection or faulty reasoning can redirect funds, oversize a transfer, or target an unknown recipient.",
  },
  {
    code: "02 / POLICY",
    title: "The transaction crosses a hard limit.",
    body: "Per-transaction limits, daily limits, blocked recipients, failed simulations, and excessive gas need a gate before signing.",
  },
  {
    code: "03 / EVIDENCE",
    title: "The explanation disappears after execution.",
    body: "Without a durable decision record, an operator can see that funds moved but cannot reconstruct the agent's intent and simulation report.",
  },
];

/** Problem framing before mechanism: why an agent wallet needs a pre-sign boundary. */
export function ProblemSection() {
  return (
    <section
      className="border-y border-white/[0.07] bg-[rgba(8,10,13,0.82)]"
      aria-labelledby="problem-title"
    >
      <div className="mx-auto grid w-full max-w-[1080px] gap-12 px-5 pb-20 pt-12 md:grid-cols-[0.82fr_1.18fr] md:gap-16 md:pb-28 md:pt-16">
        <div>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--risk-critical)]">
            The missing control point
          </span>
          <h2
            id="problem-title"
            className="mt-4 max-w-[13ch] font-display text-[clamp(32px,4.5vw,54px)] font-semibold leading-[1.03] tracking-[-0.035em] text-[var(--text-hi)]"
          >
            Agents act fast. Bad transactions move faster.
          </h2>
          <p className="mt-6 max-w-[46ch] text-[17px] leading-7 text-[var(--text-mid)]">
            A wallet can verify a signature. It cannot decide whether an agent&apos;s reasoning was safe. Praxis adds that decision boundary before funds move.
          </p>
        </div>

        <ol className="border-t border-white/10">
          {FAILURE_MODES.map((mode) => (
            <li
              key={mode.code}
              className="grid gap-3 border-b border-white/10 py-6 sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-5"
            >
              <span className="font-mono text-[11px] leading-6 tracking-[0.08em] text-[var(--text-low)]">
                {mode.code}
              </span>
              <div>
                <h3 className="text-[18px] font-semibold leading-6 text-[var(--text-hi)]">
                  {mode.title}
                </h3>
                <p className="mt-2 max-w-[58ch] text-[16px] leading-7 text-[var(--text-mid)]">
                  {mode.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
