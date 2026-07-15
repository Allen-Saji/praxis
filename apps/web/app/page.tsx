import { SiteNav } from "@/components/marketing/SiteNav";
import { HeroPremium } from "@/components/marketing/HeroPremium";
import { ThreePartyDiagram } from "@/components/marketing/ThreePartyDiagram";
import { LiveStatStrip } from "@/components/marketing/LiveStatStrip";
import { ProblemSection } from "@/components/marketing/ProblemSection";
import { LandingIntervention } from "@/components/marketing/LandingIntervention";
import { TrustBoundary } from "@/components/marketing/TrustBoundary";
import { DeveloperQuickstart } from "@/components/marketing/DeveloperQuickstart";
import { FinalCta } from "@/components/marketing/FinalCta";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { getIndexStats, getStream } from "@/lib/praxis.server";
import { DEPLOYMENTS } from "@allen-saji/praxis";
import { GradientField } from "@/components/visual/GradientField";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const packageId = DEPLOYMENTS.testnet.packageId;
  // Keep the marketing proof real while allowing the page to recover from a
  // temporary public RPC failure.
  const [statsResult, streamResult] = await Promise.allSettled([
    getIndexStats(),
    getStream(25),
  ]);
  const initialStats =
    statsResult.status === "fulfilled"
      ? statsResult.value
      : { totalCount: 0, totalAborts: 0, abortRate: 0 };
  const stream = streamResult.status === "fulfilled" ? streamResult.value : [];
  const latestIntervention = stream.find((entry) => entry.status === "aborted");

  return (
    <div className="grain relative z-10 flex min-h-screen flex-col">
      <GradientField />
      <SiteNav />
      <main className="flex-1">
        <section className="relative flex min-h-[calc(84svh-3.5rem)] w-full flex-col items-center justify-center px-5 pb-[7vh] pt-8">
          <div className="flex w-full max-w-[920px] flex-col items-center gap-7 text-center">
            <HeroPremium />
          </div>
          <div className="w-full max-w-[1080px] pt-14">
            <LiveStatStrip initial={initialStats} />
          </div>
        </section>

        <ProblemSection />

        {latestIntervention ? <LandingIntervention entry={latestIntervention} /> : null}

        <section className="bg-[rgba(5,7,10,0.94)]">
          <div className="mx-auto w-full max-w-[1080px] px-5 py-20 md:py-28">
            <div className="mb-10 grid gap-5 md:grid-cols-[0.72fr_1.28fr] md:items-end">
              <div>
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                  One controlled handoff
                </span>
                <h2 className="mt-4 max-w-[12ch] font-display text-[clamp(32px,4.5vw,54px)] font-semibold leading-[1.03] tracking-[-0.035em] text-[var(--text-hi)]">
                  Decision first. Signature second.
                </h2>
              </div>
              <p className="max-w-[56ch] text-[16px] leading-7 text-[var(--text-mid)] md:justify-self-end">
                The report returns to the agent before the wallet is asked to sign, so the agent can self-correct on evidence instead of guessing.
              </p>
            </div>
            <ThreePartyDiagram />
          </div>
        </section>

        <TrustBoundary />
        <DeveloperQuickstart />
        <FinalCta />
      </main>
      <SiteFooter packageId={packageId} />
    </div>
  );
}
