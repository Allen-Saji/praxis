import { ScanSearch, Gauge, FileCheck } from "lucide-react";
import { SiteNav } from "@/components/marketing/SiteNav";
import { HeroPremium } from "@/components/marketing/HeroPremium";
import { ThreePartyDiagram } from "@/components/marketing/ThreePartyDiagram";
import { LiveStatStrip } from "@/components/marketing/LiveStatStrip";
import { FeatureRow } from "@/components/marketing/FeatureRow";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { getIndexStats } from "@/lib/praxis.server";
import { DEPLOYMENTS } from "@praxis/sdk";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const packageId = DEPLOYMENTS.testnet.packageId;
  // Read the live counter server-side so first paint is real, never a placeholder.
  let initialStats = { totalCount: 0, totalAborts: 0, abortRate: 0 };
  try {
    initialStats = await getIndexStats();
  } catch {
    // Counter falls back to 0 and the client SWR poll recovers it.
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="flex-1">
        <HeroPremium />

        <section className="mx-auto w-full max-w-[1080px] px-5 pb-6">
          <LiveStatStrip initial={initialStats} />
        </section>

        <section className="mx-auto w-full max-w-[1080px] px-5 py-16">
          <h2 className="mb-6 text-center text-[22px] font-semibold leading-[28px] text-[var(--text-hi)]">
            The three-party model
          </h2>
          <ThreePartyDiagram />
        </section>

        <section className="mx-auto w-full max-w-[1080px] px-5 py-16">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FeatureRow
              icon={ScanSearch}
              title="Simulate before signing"
              body="Every spend is dry-run against the chain first. Praxis reads the balance changes and gas the transaction would cause, so the agent decides on facts, not guesses."
            />
            <FeatureRow
              icon={Gauge}
              title="Risk-score and gate"
              body="The dry-run is scored 0 to 100. Praxis flags for review at 30 and blocks at 80, and a drain pattern fails outright. The agent self-corrects on the report before it ever signs."
            />
            <FeatureRow
              icon={FileCheck}
              title="Verifiable audit trail"
              body="Each decision is written to Walrus with a tamper-evident on-chain receipt and an optional Seal-encrypted reasoning blob. An auditor can reconstruct exactly why a spend ran or did not."
            />
          </div>
        </section>
      </main>
      <SiteFooter packageId={packageId} />
    </div>
  );
}
