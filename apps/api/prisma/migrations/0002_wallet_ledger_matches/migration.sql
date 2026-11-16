-- Migration: Wallet, Immutable Double-Entry Ledger, Payphone Intents, Matches & API-Football Quota

CREATE TABLE "wallets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

CREATE TABLE "ledger_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(128) NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "user_id" UUID,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ledger_accounts_code_key" ON "ledger_accounts"("code");
CREATE INDEX "idx_ledger_accounts_user_id" ON "ledger_accounts"("user_id");

CREATE TABLE "ledger_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference_code" VARCHAR(128) NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ledger_transactions_idempotency_key_key" ON "ledger_transactions"("idempotency_key");
CREATE INDEX "idx_ledger_transactions_reference" ON "ledger_transactions"("reference_code");
CREATE INDEX "idx_ledger_transactions_created_at" ON "ledger_transactions"("created_at" DESC);

CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transaction_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "entry_type" VARCHAR(8) NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_ledger_entries_type" CHECK ("entry_type" IN ('DEBIT', 'CREDIT')),
    CONSTRAINT "chk_ledger_entries_amount_positive" CHECK ("amount_cents" > 0)
);

CREATE INDEX "idx_ledger_entries_account_id" ON "ledger_entries"("account_id");
CREATE INDEX "idx_ledger_entries_tx_id" ON "ledger_entries"("transaction_id");

CREATE TABLE "payment_intents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "client_transaction_id" VARCHAR(128) NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "payphone_tx_id" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_payment_intents_amount_positive" CHECK ("amount_cents" > 0)
);

CREATE UNIQUE INDEX "payment_intents_client_transaction_id_key" ON "payment_intents"("client_transaction_id");
CREATE INDEX "idx_payment_intents_user_id" ON "payment_intents"("user_id");

CREATE TABLE "competitions" (
    "id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "country" VARCHAR(64) NOT NULL,
    "sport" VARCHAR(32) NOT NULL DEFAULT 'football',
    "external_id" INTEGER,

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "competitions_external_id_key" ON "competitions"("external_id");

CREATE TABLE "matches" (
    "id" VARCHAR(64) NOT NULL,
    "competition_id" VARCHAR(64) NOT NULL,
    "external_id" INTEGER,
    "home_team" VARCHAR(128) NOT NULL,
    "away_team" VARCHAR(128) NOT NULL,
    "kickoff_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "home_score" INTEGER NOT NULL DEFAULT 0,
    "away_score" INTEGER NOT NULL DEFAULT 0,
    "elapsed_minute" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "matches_external_id_key" ON "matches"("external_id");
CREATE INDEX "idx_matches_status" ON "matches"("status");
CREATE INDEX "idx_matches_competition_id" ON "matches"("competition_id");

CREATE TABLE "betting_markets" (
    "id" VARCHAR(64) NOT NULL,
    "match_id" VARCHAR(64) NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "is_pre_match" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(24) NOT NULL,
    "closed_reason" VARCHAR(48),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "betting_markets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_betting_markets_match_id" ON "betting_markets"("match_id");

CREATE TABLE "market_selections" (
    "id" VARCHAR(64) NOT NULL,
    "market_id" VARCHAR(64) NOT NULL,
    "key" VARCHAR(32) NOT NULL,
    "label" VARCHAR(128) NOT NULL,
    "odds" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "market_selections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_market_selections_market_key" ON "market_selections"("market_id", "key");

CREATE TABLE "api_football_quota_state" (
    "id" VARCHAR(32) NOT NULL,
    "date_utc" VARCHAR(10) NOT NULL,
    "used_today" INTEGER NOT NULL DEFAULT 0,
    "last_sync_at" TIMESTAMPTZ(6),
    "last_sync_outcome" VARCHAR(32) NOT NULL DEFAULT 'idle',
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_football_quota_state_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "betting_markets" ADD CONSTRAINT "betting_markets_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "market_selections" ADD CONSTRAINT "market_selections_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "betting_markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce append-only immutability on financial ledger tables
CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Operación prohibida: el ledger financiero es inmutable (append-only).';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_immutable_ledger_transactions
BEFORE UPDATE OR DELETE ON "ledger_transactions"
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

CREATE TRIGGER trg_immutable_ledger_entries
BEFORE UPDATE OR DELETE ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();
