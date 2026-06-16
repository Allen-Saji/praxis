import { runAttacker } from "./attacker";
import { runResearcher } from "./researcher";
import { loadContext } from "./shared";
import { runTrader } from "./trader";

const RUNNERS = {
  researcher: runResearcher,
  trader: runTrader,
  attacker: runAttacker,
} as const;

type AgentName = keyof typeof RUNNERS;

async function main(): Promise<void> {
  const which = (process.argv[2] ?? "all").toLowerCase();
  const ctx = loadContext();
  const names: AgentName[] =
    which === "all" ? ["researcher", "trader", "attacker"] : [which as AgentName];

  for (const name of names) {
    const runner = RUNNERS[name];
    if (!runner) {
      throw new Error(`unknown agent "${name}" (use researcher | trader | attacker | all)`);
    }
    await runner(ctx);
    console.log();
  }
}

main().catch((err) => {
  console.error("agent run failed:", err);
  process.exit(1);
});
