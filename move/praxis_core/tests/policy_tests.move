#[test_only]
module praxis::policy_tests;

use sui::test_scenario as ts;
use praxis::policy::{Self, SpendingPolicy};

const OPERATOR: address = @0xA11CE;
const RECIP: address = @0xB0B;
const OTHER: address = @0xDEAD;

fun build(
    s: &mut ts::Scenario,
    max_per_tx: u64,
    max_per_day: u64,
    allowed: vector<address>,
    blocked: vector<address>,
    min_risk_block: u8,
    require_sim: bool,
): SpendingPolicy {
    policy::new(max_per_tx, max_per_day, allowed, blocked, min_risk_block, require_sim, s.ctx())
}

#[test]
fun allows_normal_spend() {
    let mut s = ts::begin(OPERATOR);
    let p = build(&mut s, 1000, 0, vector[], vector[], 80, true);
    // amount under limit, recipient fine, low risk, sim passed -> allowed
    assert!(policy::is_allowed(&p, RECIP, 500, 10, 0, true), 0);
    transfer::public_transfer(p, OPERATOR);
    s.end();
}

#[test]
fun blocks_over_tx_limit() {
    let mut s = ts::begin(OPERATOR);
    let p = build(&mut s, 1000, 0, vector[], vector[], 80, true);
    assert!(!policy::is_allowed(&p, RECIP, 1500, 10, 0, true), 0);
    transfer::public_transfer(p, OPERATOR);
    s.end();
}

#[test]
fun blocks_blocked_recipient() {
    let mut s = ts::begin(OPERATOR);
    let p = build(&mut s, 1000, 0, vector[], vector[OTHER], 80, true);
    assert!(!policy::is_allowed(&p, OTHER, 100, 10, 0, true), 0);
    transfer::public_transfer(p, OPERATOR);
    s.end();
}

#[test]
fun blocks_recipient_not_in_allowlist() {
    let mut s = ts::begin(OPERATOR);
    let p = build(&mut s, 1000, 0, vector[RECIP], vector[], 80, true);
    assert!(!policy::is_allowed(&p, OTHER, 100, 10, 0, true), 0);
    // the allowlisted one still works
    assert!(policy::is_allowed(&p, RECIP, 100, 10, 0, true), 1);
    transfer::public_transfer(p, OPERATOR);
    s.end();
}

#[test]
fun blocks_daily_limit() {
    let mut s = ts::begin(OPERATOR);
    let p = build(&mut s, 1000, 1000, vector[], vector[], 80, true);
    // already spent 900 today, 200 more would exceed 1000
    assert!(!policy::is_allowed(&p, RECIP, 200, 10, 900, true), 0);
    transfer::public_transfer(p, OPERATOR);
    s.end();
}

#[test]
fun blocks_high_risk() {
    let mut s = ts::begin(OPERATOR);
    let p = build(&mut s, 1000, 0, vector[], vector[], 80, true);
    assert!(!policy::is_allowed(&p, RECIP, 100, 95, 0, true), 0);
    transfer::public_transfer(p, OPERATOR);
    s.end();
}

#[test]
fun blocks_when_sim_required_but_failed() {
    let mut s = ts::begin(OPERATOR);
    let p = build(&mut s, 1000, 0, vector[], vector[], 80, true);
    assert!(!policy::is_allowed(&p, RECIP, 100, 10, 0, false), 0);
    transfer::public_transfer(p, OPERATOR);
    s.end();
}
