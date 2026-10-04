/// UTC calendar windows. Limits cover payment principal, not transaction gas.
module praxis_vault::budget;

const EDailyLimit: u64 = 0;
const EMonthlyLimit: u64 = 1;
const EInvalidLimits: u64 = 2;
const MS_PER_DAY: u64 = 86_400_000;

public struct Budget has store {
    daily_limit: u64,
    monthly_limit: u64,
    day: u64,
    month: u64,
    daily_spent: u64,
    monthly_spent: u64,
}

public(package) fun create(daily_limit: u64, monthly_limit: u64): Budget {
    assert!(daily_limit > 0 && monthly_limit >= daily_limit, EInvalidLimits);
    Budget { daily_limit, monthly_limit, day: 0, month: 0, daily_spent: 0, monthly_spent: 0 }
}

/// Changes ceilings without resetting observed usage.
public(package) fun set_limits(budget: &mut Budget, daily_limit: u64, monthly_limit: u64) {
    assert!(daily_limit > 0 && monthly_limit >= daily_limit, EInvalidLimits);
    budget.daily_limit = daily_limit;
    budget.monthly_limit = monthly_limit;
}

public(package) fun consume(budget: &mut Budget, amount: u64, timestamp_ms: u64) {
    let day = timestamp_ms / MS_PER_DAY;
    let month = month_key(timestamp_ms);
    if (budget.day != day) {
        budget.day = day;
        budget.daily_spent = 0;
    };
    if (budget.month != month) {
        budget.month = month;
        budget.monthly_spent = 0;
    };
    assert!(budget.daily_spent <= budget.daily_limit, EDailyLimit);
    assert!(amount <= budget.daily_limit - budget.daily_spent, EDailyLimit);
    assert!(budget.monthly_spent <= budget.monthly_limit, EMonthlyLimit);
    assert!(amount <= budget.monthly_limit - budget.monthly_spent, EMonthlyLimit);
    budget.daily_spent = budget.daily_spent + amount;
    budget.monthly_spent = budget.monthly_spent + amount;
}

/// Gregorian civil month from Unix milliseconds; constant work, including leap
/// centuries. March-based eras avoid signed arithmetic for post-1970 dates.
public fun month_key(timestamp_ms: u64): u64 {
    let z = timestamp_ms / MS_PER_DAY + 719468;
    let era = z / 146097;
    let doe = z % 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    if (mp < 10) year * 12 + mp + 2
    else (year + 1) * 12 + mp - 10
}

public fun daily_spent(budget: &Budget): u64 { budget.daily_spent }
public fun monthly_spent(budget: &Budget): u64 { budget.monthly_spent }

#[test_only]
public fun destroy_for_testing(b: Budget) {
    let Budget { daily_limit: _, monthly_limit: _, day: _, month: _, daily_spent: _, monthly_spent: _ } = b;
}
