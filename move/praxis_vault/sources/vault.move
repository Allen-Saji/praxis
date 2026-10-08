/// Owner-funded SUI vault with explicitly bounded delegate authority.
/// Lifetime ceilings and UTC day/month limits are enforced on-chain.
/// Evidence references are executor assertions, not verified simulation proofs.
module praxis_vault::vault;

use praxis_vault::budget::{Self, Budget};

use sui::balance::{Self, Balance};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::event;
use sui::sui::SUI;
use sui::table::{Self, Table};

const EOwnerOnly: u64 = 0;
const EInvalidPolicy: u64 = 1;
const EGrantExists: u64 = 2;
const ENoGrant: u64 = 3;
const EDelegateOnly: u64 = 4;
const EInactive: u64 = 5;
const EExpired: u64 = 6;
const EPaused: u64 = 7;
const ERecipient: u64 = 8;
const EAmount: u64 = 9;
const EAllowance: u64 = 10;
const ESequence: u64 = 11;
const EVersion: u64 = 12;
const EBalance: u64 = 13;
const EEvidence: u64 = 14;
const MAX_RECIPIENTS: u64 = 32;
const MAX_EVIDENCE_BYTES: u64 = 128;

public struct Vault has key {
    id: UID,
    owner: address,
    funds: Balance<SUI>,
    paused: bool,
    version: u64,
    per_payment: u64,
    allowance: u64,
    spent: u64,
    budget: Budget,
    recipients: vector<address>,
    grants: Table<address, Grant>,
}

/// Keyed by a stable agent identity inside one vault. Reconfiguration preserves
/// spent and sequence, including revoke/re-authorize and delegate rotation.
public struct Grant has store {
    delegate: address,
    active: bool,
    version: u64,
    per_payment: u64,
    allowance: u64,
    spent: u64,
    budget: Budget,
    expires_ms: u64,
    recipients: vector<address>,
    next_sequence: u64,
}

public struct VaultCreated has copy, drop {
    vault: ID,
    owner: address,
}

public struct VaultChanged has copy, drop {
    vault: ID,
    version: u64,
    paused: bool,
}

public struct GrantChanged has copy, drop {
    vault: ID,
    agent: address,
    delegate: address,
    version: u64,
    active: bool,
}

/// Event minted only by the atomic debit path. It identifies the funding vault
/// separately from the transaction signer. Chain digest identifies execution.
public struct Receipt has key {
    id: UID,
    payment: Payment,
}

public struct Payment has copy, drop, store {
    receipt_id: ID,
    vault: ID,
    owner: address,
    agent: address,
    executor: address,
    recipient: address,
    amount: u64,
    sequence: u64,
    vault_version: u64,
    grant_version: u64,
    evidence: vector<u8>,
    timestamp_ms: u64,
}

public struct FundingChanged has copy, drop {
    vault: ID,
    deposited: bool,
    amount: u64,
    balance: u64,
}

public fun create(
    per_payment: u64,
    allowance: u64,
    recipients: vector<address>,
    ctx: &mut TxContext,
) {
    validate_policy(per_payment, allowance, &recipients);
    let vault = Vault {
        id: object::new(ctx), owner: ctx.sender(), funds: balance::zero(),
        paused: false, version: 0, per_payment, allowance, spent: 0,
        recipients, grants: table::new(ctx), budget: budget::create(allowance, allowance),
    };
    event::emit(VaultCreated { vault: object::id(&vault), owner: vault.owner });
    transfer::share_object(vault);
}
#[allow(lint(prefer_mut_tx_context))]
public fun deposit(vault: &mut Vault, payment: Coin<SUI>, ctx: &TxContext) {
    assert_owner(vault, ctx);
    let amount = coin::value(&payment);
    assert!(amount > 0, EAmount);
    balance::join(&mut vault.funds, coin::into_balance(payment));
    event::emit(FundingChanged {
        vault: object::id(vault), deposited: true, amount,
        balance: balance::value(&vault.funds),
    });
}

/// Always available to the owner, including while paused. Withdrawals cannot be
/// redirected by a delegate or deducted from historical spending counters.
public fun withdraw(vault: &mut Vault, amount: u64, ctx: &mut TxContext) {
    assert_owner(vault, ctx);
    assert!(amount > 0, EAmount);
    assert!(amount <= balance::value(&vault.funds), EBalance);
    let payment = coin::from_balance(balance::split(&mut vault.funds, amount), ctx);
    transfer::public_transfer(payment, vault.owner);
    event::emit(FundingChanged {
        vault: object::id(vault), deposited: false, amount,
        balance: balance::value(&vault.funds),
    });
}

#[allow(lint(prefer_mut_tx_context))]
public fun set_policy(
    vault: &mut Vault, per_payment: u64, allowance: u64,
    recipients: vector<address>, ctx: &TxContext,
) {
    assert_owner(vault, ctx);
    validate_policy(per_payment, allowance, &recipients);
    vault.per_payment = per_payment;
    vault.allowance = allowance;
    vault.recipients = recipients;
    vault.version = vault.version + 1;
    emit_vault(vault);
}
#[allow(lint(prefer_mut_tx_context))]
/// Window updates invalidate pending requests and preserve current usage.
public fun set_window_limits(vault: &mut Vault, daily: u64, monthly: u64, ctx: &TxContext) {
    assert_owner(vault, ctx);
    budget::set_limits(&mut vault.budget, daily, monthly);
    vault.version = vault.version + 1;
    emit_vault(vault);
}
#[allow(lint(prefer_mut_tx_context))]
public fun set_agent_window_limits(vault: &mut Vault, agent: address, daily: u64, monthly: u64, ctx: &TxContext) {
    assert_owner(vault, ctx);
    assert!(table::contains(&vault.grants, agent), ENoGrant);
    let grant = table::borrow_mut(&mut vault.grants, agent);
    budget::set_limits(&mut grant.budget, daily, monthly);
    grant.version = grant.version + 1;
    emit_grant(vault, agent);
}
#[allow(lint(prefer_mut_tx_context))]
public fun set_paused(vault: &mut Vault, paused: bool, ctx: &TxContext) {
    assert_owner(vault, ctx);
    vault.paused = paused;
    vault.version = vault.version + 1;
    emit_vault(vault);
}
#[allow(lint(prefer_mut_tx_context))]
public fun authorize(
    vault: &mut Vault, agent: address, delegate: address,
    per_payment: u64, allowance: u64, recipients: vector<address>,
    expires_ms: u64, clock: &Clock, ctx: &TxContext,
) {
    assert_owner(vault, ctx);
    validate_grant(delegate, per_payment, allowance, &recipients, expires_ms, clock);
    assert!(!table::contains(&vault.grants, agent), EGrantExists);
    table::add(&mut vault.grants, agent, Grant {
        delegate, active: true, version: 0, per_payment, allowance, spent: 0,
        expires_ms, recipients, next_sequence: 0, budget: budget::create(allowance, allowance),
    });
    emit_grant(vault, agent);
}
#[allow(lint(prefer_mut_tx_context))]
public fun update_grant(
    vault: &mut Vault, agent: address, delegate: address,
    per_payment: u64, allowance: u64, recipients: vector<address>,
    expires_ms: u64, clock: &Clock, ctx: &TxContext,
) {
    assert_owner(vault, ctx);
    validate_grant(delegate, per_payment, allowance, &recipients, expires_ms, clock);
    assert!(table::contains(&vault.grants, agent), ENoGrant);
    let grant = table::borrow_mut(&mut vault.grants, agent);
    grant.delegate = delegate;
    grant.per_payment = per_payment;
    grant.allowance = allowance;
    grant.recipients = recipients;
    grant.expires_ms = expires_ms;
    grant.active = true;
    grant.version = grant.version + 1;
    emit_grant(vault, agent);
}
#[allow(lint(prefer_mut_tx_context))]
public fun revoke(vault: &mut Vault, agent: address, ctx: &TxContext) {
    assert_owner(vault, ctx);
    assert!(table::contains(&vault.grants, agent), ENoGrant);
    let grant = table::borrow_mut(&mut vault.grants, agent);
    grant.active = false;
    grant.version = grant.version + 1;
    emit_grant(vault, agent);
}

public fun spend(
    vault: &mut Vault, agent: address, recipient: address, amount: u64,
    sequence: u64, vault_version: u64, grant_version: u64,
    evidence: vector<u8>, clock: &Clock, ctx: &mut TxContext,
) {
    assert!(!vault.paused, EPaused);
    assert!(vault.version == vault_version, EVersion);
    assert!(table::contains(&vault.grants, agent), ENoGrant);
    assert!(vector::contains(&vault.recipients, &recipient), ERecipient);
    assert!(amount > 0 && amount <= vault.per_payment, EAmount);
    assert!(vault.spent <= vault.allowance, EAllowance);
    assert!(amount <= vault.allowance - vault.spent, EAllowance);
    assert!(amount <= balance::value(&vault.funds), EBalance);
    assert!(!vector::is_empty(&evidence) && vector::length(&evidence) <= MAX_EVIDENCE_BYTES, EEvidence);
    let timestamp_ms = clock::timestamp_ms(clock);
    let grant = table::borrow_mut(&mut vault.grants, agent);
    assert!(ctx.sender() == grant.delegate, EDelegateOnly);
    assert!(grant.active, EInactive);
    assert!(timestamp_ms < grant.expires_ms, EExpired);
    assert!(grant.version == grant_version, EVersion);
    assert!(grant.next_sequence == sequence, ESequence);
    assert!(vector::contains(&grant.recipients, &recipient), ERecipient);
    assert!(amount <= grant.per_payment, EAmount);
    assert!(grant.spent <= grant.allowance, EAllowance);
    assert!(amount <= grant.allowance - grant.spent, EAllowance);
    budget::consume(&mut grant.budget, amount, timestamp_ms);
    budget::consume(&mut vault.budget, amount, timestamp_ms);
    grant.spent = grant.spent + amount;
    grant.next_sequence = grant.next_sequence + 1;
    vault.spent = vault.spent + amount;
    let payment = coin::from_balance(balance::split(&mut vault.funds, amount), ctx);
    transfer::public_transfer(payment, recipient);
    let receipt_uid = object::new(ctx);
    let receipt_id = object::uid_to_inner(&receipt_uid);
    let payment_record = Payment {
        receipt_id, vault: object::id(vault), owner: vault.owner, agent,
        executor: ctx.sender(), recipient, amount, sequence,
        vault_version, grant_version, evidence, timestamp_ms,
    };
    event::emit(payment_record);
    transfer::freeze_object(Receipt { id: receipt_uid, payment: payment_record });
}

fun assert_owner(vault: &Vault, ctx: &TxContext) {
    assert!(ctx.sender() == vault.owner, EOwnerOnly);
}

fun validate_policy(per_payment: u64, allowance: u64, recipients: &vector<address>) {
    assert!(per_payment > 0 && allowance >= per_payment, EInvalidPolicy);
    assert!(!vector::is_empty(recipients) && vector::length(recipients) <= MAX_RECIPIENTS, EInvalidPolicy);
}

fun validate_grant(
    delegate: address, per_payment: u64, allowance: u64,
    recipients: &vector<address>, expires_ms: u64, clock: &Clock,
) {
    validate_policy(per_payment, allowance, recipients);
    assert!(delegate != @0x0 && expires_ms > clock::timestamp_ms(clock), EInvalidPolicy);
}

fun emit_vault(vault: &Vault) {
    event::emit(VaultChanged { vault: object::id(vault), version: vault.version, paused: vault.paused });
}

fun emit_grant(vault: &Vault, agent: address) {
    let grant = table::borrow(&vault.grants, agent);
    event::emit(GrantChanged {
        vault: object::id(vault), agent, delegate: grant.delegate,
        version: grant.version, active: grant.active,
    });
}

public fun owner(vault: &Vault): address { vault.owner }
public fun balance(vault: &Vault): u64 { balance::value(&vault.funds) }
public fun spent(vault: &Vault): u64 { vault.spent }
public fun version(vault: &Vault): u64 { vault.version }
public fun grant_spent(vault: &Vault, agent: address): u64 { table::borrow(&vault.grants, agent).spent }
public fun next_sequence(vault: &Vault, agent: address): u64 { table::borrow(&vault.grants, agent).next_sequence }

public fun receipt_payment(receipt: &Receipt): Payment { receipt.payment }
public fun payment_amount(payment: &Payment): u64 { payment.amount }
public fun payment_vault(payment: &Payment): ID { payment.vault }
