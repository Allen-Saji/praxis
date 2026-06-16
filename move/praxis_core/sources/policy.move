/// On-chain spending policy. V1 stores declarative rules as an owned Move
/// object. The SDK reads it (directly or via dev-inspect `would_block`) to gate
/// spends client-side; storing it on-chain makes the rule set itself auditable
/// and tamper-evident, not buried in a config file.
module praxis::policy;

public struct SpendingPolicy has key, store {
    id: UID,
    owner: address,
    max_per_tx: u64,
    /// 0 = no daily cap.
    max_per_day: u64,
    /// empty = any recipient allowed.
    allowed_recipients: vector<address>,
    blocked_recipients: vector<address>,
    /// Block when risk_score >= this. 0 = block nothing, 80 = high-risk only.
    min_risk_score_to_block: u8,
    require_sim: bool,
}

/// Result codes returned by `would_block` (also the abort reason codes).
const REASON_NONE: u8 = 255;
const REASON_BLOCKED_RECIPIENT: u8 = 10;
const REASON_NOT_ALLOWED_RECIPIENT: u8 = 11;
const REASON_OVER_TX_LIMIT: u8 = 12;
const REASON_OVER_DAILY_LIMIT: u8 = 13;
const REASON_HIGH_RISK: u8 = 2;
const REASON_NO_SIM: u8 = 14;

public fun new(
    max_per_tx: u64,
    max_per_day: u64,
    allowed_recipients: vector<address>,
    blocked_recipients: vector<address>,
    min_risk_score_to_block: u8,
    require_sim: bool,
    ctx: &mut TxContext,
): SpendingPolicy {
    SpendingPolicy {
        id: object::new(ctx),
        owner: ctx.sender(),
        max_per_tx,
        max_per_day,
        allowed_recipients,
        blocked_recipients,
        min_risk_score_to_block,
        require_sim,
    }
}

/// Create and transfer a policy to the signer in one call.
#[allow(lint(self_transfer))]
public fun create(
    max_per_tx: u64,
    max_per_day: u64,
    allowed_recipients: vector<address>,
    blocked_recipients: vector<address>,
    min_risk_score_to_block: u8,
    require_sim: bool,
    ctx: &mut TxContext,
) {
    let p = new(
        max_per_tx,
        max_per_day,
        allowed_recipients,
        blocked_recipients,
        min_risk_score_to_block,
        require_sim,
        ctx,
    );
    transfer::public_transfer(p, ctx.sender());
}

/// Pure evaluation. Returns `REASON_NONE` (255) when the spend is allowed,
/// otherwise the first violated rule's reason code. `day_spent` is the
/// cumulative amount already spent today, supplied by the caller.
public fun would_block(
    policy: &SpendingPolicy,
    recipient: address,
    amount: u64,
    risk_score: u8,
    day_spent: u64,
    sim_passed: bool,
): u8 {
    if (policy.require_sim && !sim_passed) return REASON_NO_SIM;
    if (vector::contains(&policy.blocked_recipients, &recipient)) return REASON_BLOCKED_RECIPIENT;
    if (!vector::is_empty(&policy.allowed_recipients) &&
        !vector::contains(&policy.allowed_recipients, &recipient)) {
        return REASON_NOT_ALLOWED_RECIPIENT
    };
    if (policy.max_per_tx > 0 && amount > policy.max_per_tx) return REASON_OVER_TX_LIMIT;
    if (policy.max_per_day > 0 && day_spent + amount > policy.max_per_day) return REASON_OVER_DAILY_LIMIT;
    if (policy.min_risk_score_to_block > 0 && risk_score >= policy.min_risk_score_to_block) {
        return REASON_HIGH_RISK
    };
    REASON_NONE
}

public fun is_allowed(
    policy: &SpendingPolicy,
    recipient: address,
    amount: u64,
    risk_score: u8,
    day_spent: u64,
    sim_passed: bool,
): bool {
    would_block(policy, recipient, amount, risk_score, day_spent, sim_passed) == REASON_NONE
}

// === views ===

public fun owner(p: &SpendingPolicy): address { p.owner }
public fun max_per_tx(p: &SpendingPolicy): u64 { p.max_per_tx }
public fun max_per_day(p: &SpendingPolicy): u64 { p.max_per_day }
public fun min_risk_score_to_block(p: &SpendingPolicy): u8 { p.min_risk_score_to_block }
public fun require_sim(p: &SpendingPolicy): bool { p.require_sim }

public fun reason_none(): u8 { REASON_NONE }
