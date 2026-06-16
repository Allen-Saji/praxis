#[test_only]
module praxis::receipt_registry_tests;

use sui::test_scenario as ts;
use sui::clock;
use sui::coin;
use sui::sui::SUI;
use praxis::agent_registry::{Self, AgentIndex};
use praxis::spending_receipt;

const OPERATOR: address = @0xA11CE;
const AGENT: address = @0x6E7;
const RECIP: address = @0xB0B;

#[test]
fun record_spend_indexes_receipt() {
    let mut s = ts::begin(OPERATOR);
    agent_registry::init_for_testing(s.ctx());

    s.next_tx(OPERATOR);
    {
        let mut index = s.take_shared<AgentIndex>();
        let clock = clock::create_for_testing(s.ctx());
        let coin = coin::mint_for_testing<SUI>(1_000, s.ctx());

        spending_receipt::record_spend<SUI>(
            &mut index,
            coin,
            AGENT,
            RECIP,
            b"walrus_blob_1",
            b"", // public, not sealed
            12,
            true,
            b"tag_one",
            &clock,
            s.ctx(),
        );

        assert!(agent_registry::total_count(&index) == 1, 0);
        assert!(agent_registry::total_aborts(&index) == 0, 1);
        assert!(agent_registry::agent_receipt_count(&index, AGENT) == 1, 2);
        assert!(agent_registry::has_tag(&index, b"tag_one"), 3);

        clock::destroy_for_testing(clock);
        ts::return_shared(index);
    };
    s.end();
}

#[test]
#[expected_failure]
fun replayed_purpose_tag_aborts() {
    let mut s = ts::begin(OPERATOR);
    agent_registry::init_for_testing(s.ctx());

    s.next_tx(OPERATOR);
    {
        let mut index = s.take_shared<AgentIndex>();
        let clock = clock::create_for_testing(s.ctx());
        let c1 = coin::mint_for_testing<SUI>(500, s.ctx());
        let c2 = coin::mint_for_testing<SUI>(500, s.ctx());

        spending_receipt::record_spend<SUI>(
            &mut index, c1, AGENT, RECIP, b"blob", b"", 10, true, b"dup", &clock, s.ctx(),
        );
        // same purpose tag -> registry aborts
        spending_receipt::record_spend<SUI>(
            &mut index, c2, AGENT, RECIP, b"blob", b"", 10, true, b"dup", &clock, s.ctx(),
        );

        clock::destroy_for_testing(clock);
        ts::return_shared(index);
    };
    s.end();
}

#[test]
fun record_abort_increments_counter() {
    let mut s = ts::begin(OPERATOR);
    agent_registry::init_for_testing(s.ctx());

    s.next_tx(OPERATOR);
    {
        let mut index = s.take_shared<AgentIndex>();
        let clock = clock::create_for_testing(s.ctx());

        agent_registry::record_abort(&mut index, AGENT, b"abort_blob", 2, 95, &clock, s.ctx());
        agent_registry::record_abort(&mut index, AGENT, b"abort_blob_2", 0, 50, &clock, s.ctx());

        assert!(agent_registry::total_aborts(&index) == 2, 0);
        assert!(agent_registry::total_count(&index) == 0, 1);

        clock::destroy_for_testing(clock);
        ts::return_shared(index);
    };
    s.end();
}

#[test]
fun two_distinct_spends_index_both() {
    let mut s = ts::begin(OPERATOR);
    agent_registry::init_for_testing(s.ctx());

    s.next_tx(OPERATOR);
    {
        let mut index = s.take_shared<AgentIndex>();
        let clock = clock::create_for_testing(s.ctx());
        let c1 = coin::mint_for_testing<SUI>(500, s.ctx());
        let c2 = coin::mint_for_testing<SUI>(700, s.ctx());

        spending_receipt::record_spend<SUI>(
            &mut index, c1, AGENT, RECIP, b"b1", b"", 10, true, b"t1", &clock, s.ctx(),
        );
        spending_receipt::record_spend<SUI>(
            &mut index, c2, AGENT, RECIP, b"b2", b"seal_id", 40, true, b"t2", &clock, s.ctx(),
        );

        assert!(agent_registry::total_count(&index) == 2, 0);
        assert!(agent_registry::agent_receipt_count(&index, AGENT) == 2, 1);

        clock::destroy_for_testing(clock);
        ts::return_shared(index);
    };
    s.end();
}
