import { SuiGrpcClient, GrpcWebFetchTransport } from "@mysten/sui/grpc";
import { DEPLOYMENTS, SUI_GRPC_ENDPOINTS } from "@allen-saji/praxis";
import { hostedPreflight, preflightConfig } from "./lib/hosted-preflight";

try {
  const config = preflightConfig(process.env);
  const client = new SuiGrpcClient({ network: "testnet", transport: new GrpcWebFetchTransport({ baseUrl: SUI_GRPC_ENDPOINTS.testnet, fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }) }) });
  const report = await hostedPreflight(config, {
    fetch,
    expectedCapType: `${DEPLOYMENTS.testnet.packageId}::agent_registry::AgentCap`,
    chain: async (wallet) => {
      const [info, balance, cap] = await Promise.all([client.ledgerService.getServiceInfo({}).response, client.getBalance({ owner: wallet }), client.getObject({ objectId: DEPLOYMENTS.testnet.agentCapId })]);
      return { network: info.chain ?? "unknown", capOwner: cap.object.owner.$kind === "AddressOwner" ? cap.object.owner.AddressOwner : "", capType: cap.object.type, balanceMist: balance.balance.balance };
    },
  });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.checksPassed ? 0 : 1;
} catch {
  console.error("Preflight could not start. Check APP_ORIGIN, Testnet network, two agent credentials, wallet, recipient and MIST amount. No payment was requested.");
  process.exitCode = 1;
}
