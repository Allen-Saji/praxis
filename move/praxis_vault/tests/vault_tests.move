#[test_only]
module praxis_vault::vault_tests;

use sui::test_scenario::{Self as ts, Scenario};
use sui::clock;
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use praxis_vault::vault::{Self, Vault};

const OWNER: address = @0xA;
const DELEGATE: address = @0xB;
const RECIPIENT: address = @0xC;
const STRANGER: address = @0xD;
const AGENT: address = @0xE;

fun setup(): Scenario {
    let mut s = ts::begin(OWNER);
    vault::create(100, 150, vector[RECIPIENT], s.ctx());
    s.next_tx(OWNER);
    let mut v = s.take_shared<Vault>();
    let funds = coin::mint_for_testing<SUI>(200, s.ctx());
    vault::deposit(&mut v, funds, s.ctx());
    let c = clock::create_for_testing(s.ctx());
    vault::authorize(&mut v, AGENT, DELEGATE, 60, 100, vector[RECIPIENT], 1000, &c, s.ctx());
    clock::destroy_for_testing(c);
    ts::return_shared(v);
    s
}

fun pay(s: &mut Scenario, amount: u64, sequence: u64, vv: u64, gv: u64) {
    let mut v = s.take_shared<Vault>();
    let c = clock::create_for_testing(s.ctx());
    vault::spend(&mut v, AGENT, RECIPIENT, amount, sequence, vv, gv, b"evidence", &c, s.ctx());
    clock::destroy_for_testing(c);
    ts::return_shared(v);
}

#[test]
fun owner_funds_delegate_pays_owner_recovers() {
    let mut s = setup();
    s.next_tx(DELEGATE);
    pay(&mut s, 60, 0, 0, 0);
    s.next_tx(RECIPIENT);
    let payment = s.take_from_sender<Coin<SUI>>();
    assert!(coin::value(&payment) == 60, 100);
    ts::return_to_sender(&s, payment);
    s.next_tx(OWNER);
    let mut v = s.take_shared<Vault>();
    assert!(vault::owner(&v) == OWNER, 101);
    assert!(vault::balance(&v) == 140 && vault::spent(&v) == 60, 102);
    assert!(vault::grant_spent(&v, AGENT) == 60 && vault::next_sequence(&v, AGENT) == 1, 103);
    vault::revoke(&mut v, AGENT, s.ctx());
    vault::set_paused(&mut v, true, s.ctx());
    vault::withdraw(&mut v, 140, s.ctx());
    assert!(vault::balance(&v) == 0 && vault::spent(&v) == 60, 104);
    ts::return_shared(v);
    s.next_tx(OWNER);
    let returned = s.take_from_sender<Coin<SUI>>();
    assert!(coin::value(&returned) == 140, 105);
    ts::return_to_sender(&s, returned);
    s.end();
}

#[test]
fun rotation_preserves_usage_and_sequence() {
    let mut s = setup();
    s.next_tx(DELEGATE);
    pay(&mut s, 60, 0, 0, 0);
    s.next_tx(OWNER);
    let mut v = s.take_shared<Vault>();
    vault::revoke(&mut v, AGENT, s.ctx());
    let c = clock::create_for_testing(s.ctx());
    vault::update_grant(&mut v, AGENT, STRANGER, 60, 100, vector[RECIPIENT], 1000, &c, s.ctx());
    clock::destroy_for_testing(c);
    assert!(vault::grant_spent(&v, AGENT) == 60 && vault::next_sequence(&v, AGENT) == 1, 106);
    ts::return_shared(v);
    s.next_tx(STRANGER);
    pay(&mut s, 40, 1, 0, 2);
    s.next_tx(OWNER);
    let v = s.take_shared<Vault>();
    assert!(vault::spent(&v) == 100 && vault::grant_spent(&v, AGENT) == 100, 107);
    ts::return_shared(v);
    s.end();
}

#[test]
#[expected_failure(abort_code = 0, location = praxis_vault::vault)]
fun stranger_cannot_withdraw() {
    let mut s = setup();
    s.next_tx(STRANGER);
    let mut v = s.take_shared<Vault>();
    let c = clock::create_for_testing(s.ctx());
    vault::withdraw(&mut v, 1, s.ctx());
    clock::destroy_for_testing(c);
    ts::return_shared(v);
    s.end();
}

#[test]
#[expected_failure(abort_code = 0, location = praxis_vault::vault)]
fun delegate_cannot_change_policy() {
    let mut s = setup();
    s.next_tx(DELEGATE);
    let mut v = s.take_shared<Vault>();
    let c = clock::create_for_testing(s.ctx());
    vault::set_policy(&mut v, 1000, 1000, vector[RECIPIENT], s.ctx());
    clock::destroy_for_testing(c);
    ts::return_shared(v);
    s.end();
}

#[test]
#[expected_failure(abort_code = 0, location = praxis_vault::vault)]
fun stranger_cannot_authorize() {
    let mut s = setup();
    s.next_tx(STRANGER);
    let mut v = s.take_shared<Vault>();
    let c = clock::create_for_testing(s.ctx());
    vault::authorize(&mut v, STRANGER, STRANGER, 1, 1, vector[RECIPIENT], 1000, &c, s.ctx());
    clock::destroy_for_testing(c);
    ts::return_shared(v);
    s.end();
}

#[test]
#[expected_failure(abort_code = 4, location = praxis_vault::vault)]
fun stranger_cannot_spend() {
    let mut s = setup();
    s.next_tx(STRANGER);
    let mut v = s.take_shared<Vault>();
    let c = clock::create_for_testing(s.ctx());
    vault::spend(&mut v, AGENT, RECIPIENT, 1, 0, 0, 0, b"e", &c, s.ctx());
    clock::destroy_for_testing(c);
    ts::return_shared(v);
    s.end();
}

#[test]
#[expected_failure(abort_code = 9, location = praxis_vault::vault)]
fun grant_payment_limit() {
    let mut s = setup();
    s.next_tx(DELEGATE);
    let mut v = s.take_shared<Vault>();
    let c = clock::create_for_testing(s.ctx());
    vault::spend(&mut v, AGENT, RECIPIENT, 61, 0, 0, 0, b"e", &c, s.ctx());
    clock::destroy_for_testing(c);
    ts::return_shared(v);
    s.end();
}

#[test]
#[expected_failure(abort_code = 9, location = praxis_vault::vault)]
fun wallet_payment_limit() {
    let mut s = setup();
    s.next_tx(DELEGATE);
    let mut v = s.take_shared<Vault>();
    let c = clock::create_for_testing(s.ctx());
    vault::spend(&mut v, AGENT, RECIPIENT, 101, 0, 0, 0, b"e", &c, s.ctx());
    clock::destroy_for_testing(c);
    ts::return_shared(v);
    s.end();
}

#[test]
#[expected_failure(abort_code = 9, location = praxis_vault::vault)]
fun zero_payment() {
    let mut s = setup();
    s.next_tx(DELEGATE);
    let mut v = s.take_shared<Vault>();
    let c = clock::create_for_testing(s.ctx());
    vault::spend(&mut v, AGENT, RECIPIENT, 0, 0, 0, 0, b"e", &c, s.ctx());
    clock::destroy_for_testing(c);
    ts::return_shared(v);
    s.end();
}

#[test]
#[expected_failure(abort_code = 8, location = praxis_vault::vault)]
fun unapproved_recipient() {
    let mut s = setup();
    s.next_tx(DELEGATE);
    let mut v = s.take_shared<Vault>();
    let c = clock::create_for_testing(s.ctx());
    vault::spend(&mut v, AGENT, STRANGER, 1, 0, 0, 0, b"e", &c, s.ctx());
    clock::destroy_for_testing(c);
    ts::return_shared(v);
    s.end();
}

#[test]
#[expected_failure(abort_code = 6, location = praxis_vault::vault)]
fun expired_at_exact_boundary() {
    let mut s = setup();
    s.next_tx(DELEGATE);
    let mut v = s.take_shared<Vault>();
    let mut c = clock::create_for_testing(s.ctx());
    clock::set_for_testing(&mut c, 1000);
    vault::spend(&mut v, AGENT, RECIPIENT, 1, 0, 0, 0, b"e", &c, s.ctx());
    clock::destroy_for_testing(c);
    ts::return_shared(v);
    s.end();
}

#[test]
#[expected_failure(abort_code = 12, location = praxis_vault::vault)]
fun stale_vault_version() {
    let mut s = setup();
    s.next_tx(DELEGATE);
    let mut v = s.take_shared<Vault>();
    let c = clock::create_for_testing(s.ctx());
    vault::spend(&mut v, AGENT, RECIPIENT, 1, 0, 1, 0, b"e", &c, s.ctx());
    clock::destroy_for_testing(c);
    ts::return_shared(v);
    s.end();
}

#[test]
#[expected_failure(abort_code = 12, location = praxis_vault::vault)]
fun stale_grant_version() {
    let mut s = setup();
    s.next_tx(DELEGATE);
    let mut v = s.take_shared<Vault>();
    let c = clock::create_for_testing(s.ctx());
    vault::spend(&mut v, AGENT, RECIPIENT, 1, 0, 0, 1, b"e", &c, s.ctx());
    clock::destroy_for_testing(c);
    ts::return_shared(v);
    s.end();
}

#[test]
#[expected_failure(abort_code = 14, location = praxis_vault::vault)]
fun empty_evidence() {
    let mut s = setup();
    s.next_tx(DELEGATE);
    let mut v = s.take_shared<Vault>();
    let c = clock::create_for_testing(s.ctx());
    vault::spend(&mut v, AGENT, RECIPIENT, 1, 0, 0, 0, b"", &c, s.ctx());
    clock::destroy_for_testing(c);
    ts::return_shared(v);
    s.end();
}

#[test]
#[expected_failure(abort_code = 2, location = praxis_vault::vault)]
fun grant_cannot_be_recreated() {
    let mut s = setup();
    s.next_tx(OWNER);
    let mut v = s.take_shared<Vault>();
    let c = clock::create_for_testing(s.ctx());
    vault::authorize(&mut v, AGENT, DELEGATE, 60, 100, vector[RECIPIENT], 1000, &c, s.ctx());
    clock::destroy_for_testing(c);
    ts::return_shared(v);
    s.end();
}

#[test]
#[expected_failure(abort_code = 11, location = praxis_vault::vault)]
fun replay_rejected() {
    let mut s = setup();
    s.next_tx(DELEGATE);
    pay(&mut s, 60, 0, 0, 0);

    s.next_tx(DELEGATE);
    pay(&mut s, 1, 0, 0, 0);
    s.end();
}

#[test]
#[expected_failure(abort_code = 10, location = praxis_vault::vault)]
fun agent_total_limit() {
    let mut s = setup();
    s.next_tx(DELEGATE);
    pay(&mut s, 60, 0, 0, 0);

    s.next_tx(DELEGATE);
    pay(&mut s, 41, 1, 0, 0);
    s.end();
}

#[test]
#[expected_failure(abort_code = 5, location = praxis_vault::vault)]
fun revoked_delegate() {
    let mut s = setup();
    s.next_tx(DELEGATE);
    pay(&mut s, 60, 0, 0, 0);
    s.next_tx(OWNER);
    let mut v = s.take_shared<Vault>();
    vault::revoke(&mut v, AGENT, s.ctx());
    ts::return_shared(v);
    s.next_tx(DELEGATE);
    pay(&mut s, 1, 1, 0, 1);
    s.end();
}

#[test]
#[expected_failure(abort_code = 7, location = praxis_vault::vault)]
fun paused_vault() {
    let mut s = setup();
    s.next_tx(DELEGATE);
    pay(&mut s, 60, 0, 0, 0);
    s.next_tx(OWNER);
    let mut v = s.take_shared<Vault>();
    vault::set_paused(&mut v, true, s.ctx());
    ts::return_shared(v);
    s.next_tx(DELEGATE);
    pay(&mut s, 1, 1, 1, 0);
    s.end();
}

fun two_agents(shared_allowance: u64): Scenario {
    let mut s = setup();
    s.next_tx(OWNER);
    let mut v = s.take_shared<Vault>();
    vault::set_policy(&mut v, 100, shared_allowance, vector[RECIPIENT], s.ctx());
    let c = clock::create_for_testing(s.ctx());
    vault::authorize(&mut v, STRANGER, STRANGER, 60, 100, vector[RECIPIENT], 1000, &c, s.ctx());
    clock::destroy_for_testing(c);
    ts::return_shared(v);
    s.next_tx(DELEGATE);
    pay(&mut s, 60, 0, 1, 0);
    s.next_tx(DELEGATE);
    pay(&mut s, 40, 1, 1, 0);
    s.next_tx(STRANGER);
    s
}

#[test]
fun exhausted_agent_does_not_block_other_agent() {
    let mut s = two_agents(150);
    let mut v = s.take_shared<Vault>();
    let c = clock::create_for_testing(s.ctx());
    vault::spend(&mut v, STRANGER, RECIPIENT, 50, 0, 1, 0, b"e", &c, s.ctx());
    assert!(vault::spent(&v) == 150, 110);
    assert!(vault::grant_spent(&v, AGENT) == 100, 111);
    assert!(vault::grant_spent(&v, STRANGER) == 50, 112);
    clock::destroy_for_testing(c);
    ts::return_shared(v);
    s.end();
}

#[test]
#[expected_failure(abort_code = 10, location = praxis_vault::vault)]
fun shared_limit_applies_across_agents() {
    let mut s = two_agents(150);
    let mut v = s.take_shared<Vault>();
    let c = clock::create_for_testing(s.ctx());
    vault::spend(&mut v, STRANGER, RECIPIENT, 51, 0, 1, 0, b"e", &c, s.ctx());
    clock::destroy_for_testing(c);
    ts::return_shared(v);
    s.end();
}

#[test]
#[expected_failure(abort_code = 13, location = praxis_vault::vault)]
fun withdrawal_leaves_insufficient_funds() {
    let mut s = setup();
    s.next_tx(OWNER);
    let mut v = s.take_shared<Vault>();
    vault::withdraw(&mut v, 200, s.ctx());
    ts::return_shared(v);
    s.next_tx(DELEGATE);
    pay(&mut s, 1, 0, 0, 0);
    s.end();
}

#[test]
#[expected_failure(abort_code = 10, location = praxis_vault::vault)]
fun reducing_limit_below_spent_fails_closed() {
    let mut s = setup();
    s.next_tx(DELEGATE);
    pay(&mut s, 60, 0, 0, 0);
    s.next_tx(OWNER);
    let mut v = s.take_shared<Vault>();
    vault::set_policy(&mut v, 10, 10, vector[RECIPIENT], s.ctx());
    ts::return_shared(v);
    s.next_tx(DELEGATE);
    pay(&mut s, 1, 1, 1, 0);
    s.end();
}

#[test]
#[expected_failure(abort_code = 0, location = praxis_vault::budget)]
fun vault_daily_limit_applies_to_delegate() {
    let mut s = setup();
    s.next_tx(OWNER);
    let mut v = s.take_shared<Vault>();
    vault::set_window_limits(&mut v, 10, 100, s.ctx());
    ts::return_shared(v);
    s.next_tx(DELEGATE);
    pay(&mut s, 11, 0, 1, 0);
    s.end();
}

#[test]
#[expected_failure(abort_code = 0, location = praxis_vault::budget)]
fun agent_daily_limit_applies_to_delegate() {
    let mut s = setup();
    s.next_tx(OWNER);
    let mut v = s.take_shared<Vault>();
    vault::set_agent_window_limits(&mut v, AGENT, 10, 100, s.ctx());
    ts::return_shared(v);
    s.next_tx(DELEGATE);
    pay(&mut s, 11, 0, 0, 1);
    s.end();
}

#[test]
fun immutable_receipt_matches_debit() {
    let mut s = setup();
    s.next_tx(DELEGATE);
    pay(&mut s, 42, 0, 0, 0);
    s.next_tx(RECIPIENT);
    let receipt = s.take_immutable<vault::Receipt>();
    let payment = vault::receipt_payment(&receipt);
    let v = s.take_shared<Vault>();
    assert!(vault::payment_amount(&payment) == 42, 130);
    assert!(vault::payment_vault(&payment) == object::id(&v), 131);
    assert!(vault::balance(&v) == 158, 132);
    ts::return_shared(v);
    ts::return_immutable(receipt);
    s.end();
}
