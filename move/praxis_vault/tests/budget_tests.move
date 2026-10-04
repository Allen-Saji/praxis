#[test_only]
module praxis_vault::budget_tests;
use praxis_vault::budget;

#[test]
fun calendar_boundaries() {
    assert!(budget::month_key(0) == 1970 * 12, 0);
    assert!(budget::month_key(2678400000 - 1) == 1970 * 12, 1);
    assert!(budget::month_key(2678400000) == 1970 * 12 + 1, 2);
    assert!(budget::month_key(1709164800000) == 2024 * 12 + 1, 3);
    assert!(budget::month_key(1709251200000) == 2024 * 12 + 2, 4);
    assert!(budget::month_key(4107542400000 - 1) == 2100 * 12 + 1, 5);
    assert!(budget::month_key(4107542400000) == 2100 * 12 + 2, 6);
    assert!(budget::month_key(1735689600000) == 2025 * 12, 7);
}

#[test]
fun day_resets_month_accumulates() {
    let mut b = budget::create(10, 20);
    budget::consume(&mut b, 10, 0);
    budget::consume(&mut b, 10, 86400000);
    assert!(budget::daily_spent(&b) == 10, 0);
    assert!(budget::monthly_spent(&b) == 20, 1);
    budget::consume(&mut b, 10, 2678400000);
    assert!(budget::monthly_spent(&b) == 10, 2);
    destroy(b);
}

#[test]
#[expected_failure(abort_code = 0, location = praxis_vault::budget)]
fun daily_limit() {
    let mut b = budget::create(10, 20);
    budget::consume(&mut b, 10, 0);
    budget::consume(&mut b, 1, 86399999);
    destroy(b);
}

#[test]
#[expected_failure(abort_code = 1, location = praxis_vault::budget)]
fun monthly_limit() {
    let mut b = budget::create(10, 15);
    budget::consume(&mut b, 10, 0);
    budget::consume(&mut b, 6, 86400000);
    destroy(b);
}

#[test]
#[expected_failure(abort_code = 0, location = praxis_vault::budget)]
fun tightening_preserves_usage() {
    let mut b = budget::create(10, 20);
    budget::consume(&mut b, 10, 0);
    budget::set_limits(&mut b, 5, 20);
    budget::consume(&mut b, 1, 1);
    destroy(b);
}

fun destroy(b: budget::Budget) { budget::destroy_for_testing(b); }
