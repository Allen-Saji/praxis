/// Tamper-evident on-chain record of a completed agent spend.
///
/// `record_spend` is the single composable entrypoint the Praxis SDK calls
/// inside its spend PTB. It takes custody of the payment coin, transfers it to
/// the recipient, mints an immutable `SpendingReceipt`, registers it in the
/// shared `AgentIndex`, and emits an event. Because the receipt's `amount` is
/// read directly from the coin being moved, the on-chain record cannot lie
/// about how much was actually spent.
module praxis::spending_receipt;

use std::type_name::{Self, TypeName};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::event;
use praxis::agent_registry::{Self, AgentIndex, AgentCap};

/// Bumped when the receipt schema changes.
const RECEIPT_VERSION: u16 = 2;

/// Immutable record of one completed spend. Owned by the operator.
public struct SpendingReceipt has key, store {
    id: UID,
    /// Logical agent identity that initiated the spend (e.g. trader, researcher).
    agent: address,
    /// Custodial wallet that actually signed and paid (the tx sender).
    wallet: address,
    recipient: address,
    amount: u64,
    coin_type: TypeName,
    /// Walrus blob holding the reasoning + simulation report.
    walrus_blob_id: vector<u8>,
    /// Seal identity bytes; empty when the reasoning is public.
    seal_policy_id: vector<u8>,
    /// 0-100, from the pre-flight risk check.
    risk_score: u8,
    sim_passed: bool,
    /// blake3 hash of the intent, used for replay protection in the registry.
    purpose_tag: vector<u8>,
    timestamp_ms: u64,
    sdk_version: u16,
}

public struct SpendingReceiptCreated has copy, drop {
    receipt_id: ID,
    agent: address,
    wallet: address,
    recipient: address,
    amount: u64,
    risk_score: u8,
    sim_passed: bool,
    sealed: bool,
    walrus_blob_id: vector<u8>,
    timestamp_ms: u64,
}

const MS_PER_DAY: u64 = 86_400_000;

/// Compose a complete spend: move the coin, mint the receipt, index it.
/// The receipt is transferred to the signer (the custodial wallet that paid),
/// which is the intended owner -- hence the self_transfer allow.
#[allow(lint(self_transfer))]
public fun record_spend<T>(
    _cap: &AgentCap,
    index: &mut AgentIndex,
    payment: Coin<T>,
    agent: address,
    recipient: address,
    walrus_blob_id: vector<u8>,
    seal_policy_id: vector<u8>,
    risk_score: u8,
    sim_passed: bool,
    purpose_tag: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let wallet = ctx.sender();
    let amount = coin::value(&payment);
    let timestamp_ms = clock::timestamp_ms(clock);
    let day = ((timestamp_ms / MS_PER_DAY) as u32);
    let sealed = !vector::is_empty(&seal_policy_id);

    // Move the money first; the receipt records what provably happened.
    transfer::public_transfer(payment, recipient);

    let receipt = SpendingReceipt {
        id: object::new(ctx),
        agent,
        wallet,
        recipient,
        amount,
        coin_type: type_name::with_defining_ids<T>(),
        walrus_blob_id,
        seal_policy_id,
        risk_score,
        sim_passed,
        purpose_tag,
        timestamp_ms,
        sdk_version: RECEIPT_VERSION,
    };
    let receipt_id = object::id(&receipt);

    // Replay protection + indexing live in the registry (package-visible only,
    // so a receipt can never be indexed without going through this path).
    agent_registry::register(
        index,
        receipt_id,
        agent,
        recipient,
        day,
        receipt.purpose_tag,
    );

    event::emit(SpendingReceiptCreated {
        receipt_id,
        agent,
        wallet,
        recipient,
        amount,
        risk_score,
        sim_passed,
        sealed,
        walrus_blob_id: receipt.walrus_blob_id,
        timestamp_ms,
    });

    transfer::public_transfer(receipt, wallet);
}

// === views (reads for tests + off-chain indexers) ===

public fun agent(r: &SpendingReceipt): address { r.agent }
public fun wallet(r: &SpendingReceipt): address { r.wallet }
public fun recipient(r: &SpendingReceipt): address { r.recipient }
public fun amount(r: &SpendingReceipt): u64 { r.amount }
public fun walrus_blob_id(r: &SpendingReceipt): vector<u8> { r.walrus_blob_id }
public fun seal_policy_id(r: &SpendingReceipt): vector<u8> { r.seal_policy_id }
public fun risk_score(r: &SpendingReceipt): u8 { r.risk_score }
public fun sim_passed(r: &SpendingReceipt): bool { r.sim_passed }
public fun is_sealed(r: &SpendingReceipt): bool { !vector::is_empty(&r.seal_policy_id) }
public fun timestamp_ms(r: &SpendingReceipt): u64 { r.timestamp_ms }
public fun sdk_version(r: &SpendingReceipt): u16 { r.sdk_version }
