/// Shared object that indexes spend receipts for cheap dashboard queries and
/// tracks the abort counter that powers the "N drains prevented" headline.
///
/// `register` is package-visible only: the sole path to it is
/// `spending_receipt::record_spend`, so an index entry can never exist without
/// a real receipt. Both `record_spend` and `record_abort` require the
/// `AgentCap` minted to the deployer at publish, so only the Praxis operator
/// can write to the index. Without that gate `record_abort` was world-callable,
/// letting anyone inflate the abort counter or emit spoofed abort events
/// pointing at arbitrary agents/blobs.
module praxis::agent_registry;

use sui::clock::{Self, Clock};
use sui::event;
use sui::table::{Self, Table};

const EReplayDetected: u64 = 1;

public struct AgentIndex has key {
    id: UID,
    receipts_by_agent: Table<address, vector<ID>>,
    receipts_by_recipient: Table<address, vector<ID>>,
    receipts_by_day: Table<u32, vector<ID>>,
    /// Purpose-tag set; rejects replayed intents.
    seen_tags: Table<vector<u8>, bool>,
    total_count: u64,
    total_aborts: u64,
}

/// Authority to write to the shared `AgentIndex`. Minted once at publish and
/// transferred to the deployer (the Praxis operator). Recording a spend or an
/// abort requires holding it, so a stranger cannot forge index entries.
public struct AgentCap has key, store {
    id: UID,
}

public struct AbortRecorded has copy, drop {
    agent: address,
    wallet: address,
    /// The spend that was blocked, so aborts can sit in the same stream as confirms.
    recipient: address,
    amount: u64,
    /// Walrus blob holding the reasoning + sim report for the blocked spend.
    walrus_blob_id: vector<u8>,
    /// 0 = agent_decision, 1 = policy_block, 2 = high_risk, 3 = sim_failed.
    reason_code: u8,
    risk_score: u8,
    timestamp_ms: u64,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(AgentIndex {
        id: object::new(ctx),
        receipts_by_agent: table::new(ctx),
        receipts_by_recipient: table::new(ctx),
        receipts_by_day: table::new(ctx),
        seen_tags: table::new(ctx),
        total_count: 0,
        total_aborts: 0,
    });
    transfer::transfer(AgentCap { id: object::new(ctx) }, ctx.sender());
}

/// Index a freshly minted receipt. Package-visible: only `record_spend` calls it.
public(package) fun register(
    index: &mut AgentIndex,
    receipt_id: ID,
    agent: address,
    recipient: address,
    day: u32,
    purpose_tag: vector<u8>,
) {
    assert!(!table::contains(&index.seen_tags, purpose_tag), EReplayDetected);
    table::add(&mut index.seen_tags, purpose_tag, true);

    push(&mut index.receipts_by_agent, agent, receipt_id);
    push(&mut index.receipts_by_recipient, recipient, receipt_id);
    push_day(&mut index.receipts_by_day, day, receipt_id);
    index.total_count = index.total_count + 1;
}

/// Record a blocked/aborted spend. No receipt, no money moved -- just the
/// counter and an event pointing at the Walrus reasoning blob. Requires the
/// `AgentCap` so only the operator can record aborts; otherwise the counter and
/// the abort feed would be forgeable by anyone.
public fun record_abort(
    _cap: &AgentCap,
    index: &mut AgentIndex,
    agent: address,
    recipient: address,
    amount: u64,
    walrus_blob_id: vector<u8>,
    reason_code: u8,
    risk_score: u8,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    index.total_aborts = index.total_aborts + 1;
    event::emit(AbortRecorded {
        agent,
        wallet: ctx.sender(),
        recipient,
        amount,
        walrus_blob_id,
        reason_code,
        risk_score,
        timestamp_ms: clock::timestamp_ms(clock),
    });
}

// === internal helpers ===

fun push(t: &mut Table<address, vector<ID>>, key: address, id: ID) {
    if (!table::contains(t, key)) {
        table::add(t, key, vector::empty<ID>());
    };
    let v = table::borrow_mut(t, key);
    vector::push_back(v, id);
}

fun push_day(t: &mut Table<u32, vector<ID>>, key: u32, id: ID) {
    if (!table::contains(t, key)) {
        table::add(t, key, vector::empty<ID>());
    };
    let v = table::borrow_mut(t, key);
    vector::push_back(v, id);
}

// === views ===

public fun total_count(index: &AgentIndex): u64 { index.total_count }
public fun total_aborts(index: &AgentIndex): u64 { index.total_aborts }

public fun has_tag(index: &AgentIndex, tag: vector<u8>): bool {
    table::contains(&index.seen_tags, tag)
}

public fun agent_receipt_count(index: &AgentIndex, agent: address): u64 {
    if (!table::contains(&index.receipts_by_agent, agent)) return 0;
    vector::length(table::borrow(&index.receipts_by_agent, agent))
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}
