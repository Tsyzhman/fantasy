-- @spec spec://modules/betting/FEAT-001-virtual-league#ledger
CREATE TABLE betting_accounts (
 id TEXT PRIMARY KEY, user_id TEXT UNIQUE REFERENCES "User"(id) ON DELETE RESTRICT,
 bot_name TEXT UNIQUE, name TEXT NOT NULL, balance BIGINT NOT NULL DEFAULT 10000000 CHECK(balance >= 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK ((user_id IS NULL) <> (bot_name IS NULL))
);
CREATE TABLE betting_events (
 id TEXT PRIMARY KEY, match_id BIGINT REFERENCES matches(id) ON DELETE SET NULL,
 league_id BIGINT NOT NULL REFERENCES leagues(id) ON DELETE RESTRICT,
 home TEXT NOT NULL, away TEXT NOT NULL, kickoff TIMESTAMPTZ NOT NULL,
 markets JSONB NOT NULL DEFAULT '[]', model JSONB, fetched_at TIMESTAMPTZ,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), closed BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX betting_events_kickoff_idx ON betting_events(kickoff);
CREATE INDEX betting_events_league_kickoff_idx ON betting_events(league_id,kickoff);
CREATE TABLE betting_bets (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES betting_accounts(id),
 event_id TEXT NOT NULL REFERENCES betting_events(id), request_key TEXT NOT NULL,
 selection_key TEXT NOT NULL, selection JSONB NOT NULL, odds INTEGER NOT NULL CHECK(odds > 10000),
 stake BIGINT NOT NULL CHECK(stake > 0 AND stake <= 10000000), payout BIGINT NOT NULL DEFAULT 0 CHECK(payout >= 0),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','WON','LOST','VOID','HALF_WON','HALF_LOST')),
 recommendations JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), settled_at TIMESTAMPTZ,
 settlement_source TEXT, settled_by TEXT, UNIQUE(account_id,request_key)
);
CREATE INDEX betting_bets_event_status_idx ON betting_bets(event_id,status);
CREATE INDEX betting_bets_account_created_idx ON betting_bets(account_id,created_at DESC);
CREATE TABLE betting_ledger (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES betting_accounts(id),
 bet_id TEXT REFERENCES betting_bets(id), delta BIGINT NOT NULL, kind TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX betting_ledger_account_idx ON betting_ledger(account_id);
CREATE TABLE betting_decisions (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES betting_accounts(id), event_id TEXT NOT NULL REFERENCES betting_events(id),
 decision TEXT NOT NULL, reason TEXT NOT NULL, details JSONB, decided_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(account_id,event_id)
);
CREATE TABLE betting_sync_state (
 id TEXT PRIMARY KEY, lease_until TIMESTAMPTZ, owner TEXT, last_success TIMESTAMPTZ, last_error TEXT, summary JSONB
);
