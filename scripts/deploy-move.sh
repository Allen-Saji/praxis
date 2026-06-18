#!/usr/bin/env bash
# Publish praxis_core to the active Sui network and record the package id +
# shared AgentIndex object id into deployments/<network>.json.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NETWORK="$(sui client active-env)"
echo "Publishing praxis_core to ${NETWORK}..."

mkdir -p deployments
RAW="deployments/${NETWORK}.publish.json"

# Always publish a fresh package. The CLI records publications in Published.toml
# and refuses to re-publish; our schema changes are breaking (not upgrade-safe),
# so we drop the recorded entry and mint a new package each deploy.
rm -f move/praxis_core/Published.toml

sui client publish ./move/praxis_core --json --gas-budget 200000000 >"$RAW"

# Sui CLI >= 1.7x emits a protobuf-style response keyed on `changed_objects`
# (the published package shows up as objectType=="package").
PKG="$(jq -r '.changed_objects[] | select(.idOperation=="CREATED" and .objectType=="package") | .objectId' "$RAW")"
INDEX="$(jq -r '.changed_objects[] | select(.objectType != null and (.objectType|test("agent_registry::AgentIndex"))) | .objectId' "$RAW")"
AGENT_CAP="$(jq -r '.changed_objects[] | select(.objectType != null and (.objectType|test("agent_registry::AgentCap"))) | .objectId' "$RAW")"
UPGRADE_CAP="$(jq -r '.changed_objects[] | select(.objectType != null and (.objectType|test("package::UpgradeCap"))) | .objectId' "$RAW")"
STATUS="$(jq -r '.effects.V2.status // .effects.status' "$RAW")"

if [[ "$STATUS" != "Success" ]]; then
  echo "ERROR: publish status=$STATUS. See $RAW" >&2
  exit 1
fi
if [[ -z "$PKG" || "$PKG" == "null" ]]; then
  echo "ERROR: could not parse packageId. See $RAW" >&2
  exit 1
fi

jq -n \
  --arg network "$NETWORK" \
  --arg packageId "$PKG" \
  --arg agentIndexId "$INDEX" \
  --arg agentCapId "$AGENT_CAP" \
  --arg upgradeCapId "$UPGRADE_CAP" \
  '{network:$network, packageId:$packageId, agentIndexId:$agentIndexId, agentCapId:$agentCapId, upgradeCapId:$upgradeCapId, clockId:"0x6"}' \
  >"deployments/${NETWORK}.json"

echo "----------------------------------------"
echo "network:       $NETWORK"
echo "packageId:     $PKG"
echo "agentIndexId:  $INDEX"
echo "agentCapId:    $AGENT_CAP"
echo "upgradeCapId:  $UPGRADE_CAP"
echo "written to:    deployments/${NETWORK}.json"
echo
echo "Now sync packageId/agentIndexId/agentCapId into packages/sdk/src/config.ts."
