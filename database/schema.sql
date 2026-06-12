-- =============================================================================
-- Vesta – Personal Finance App
-- PostgreSQL Schema
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- USERS
-- =============================================================================

CREATE TABLE users (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT        NOT NULL UNIQUE,
    display_name TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- USER SETTINGS  (1:1 with users)
-- =============================================================================

CREATE TABLE user_settings (
    user_id         UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    ai_provider     TEXT        NOT NULL DEFAULT 'claude'
                                CHECK (ai_provider IN ('openai','claude','gemini','mistral')),
    ai_api_key      TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- ACCOUNTS  (comptes bancaires / investissement)
-- =============================================================================

CREATE TABLE accounts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    bank            TEXT,
    type            TEXT        NOT NULL DEFAULT 'courant'
                                CHECK (type IN ('courant','epargne','joint','pro','invest')),
    balance         NUMERIC(15,2) NOT NULL DEFAULT 0,
    account_number  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_user ON accounts(user_id);

-- =============================================================================
-- TRANSACTIONS
-- =============================================================================

CREATE TABLE transactions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id  UUID        REFERENCES accounts(id) ON DELETE SET NULL,
    date        DATE        NOT NULL,
    label       TEXT        NOT NULL,
    amount      NUMERIC(15,2) NOT NULL,    -- positif = revenu, négatif = dépense
    category    TEXT        NOT NULL DEFAULT 'divers'
                            CHECK (category IN (
                                'salaire','immo','credit','alimentation','restaurant',
                                'sante','transport','loisirs','vetements','voyage',
                                'travaux','abonnement','epargne','divers'
                            )),
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_user    ON transactions(user_id);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_date    ON transactions(date DESC);
CREATE INDEX idx_transactions_cat     ON transactions(category);

-- =============================================================================
-- ABONNEMENTS  (charges récurrentes)
-- =============================================================================

CREATE TABLE abonnements (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id  UUID        REFERENCES accounts(id) ON DELETE SET NULL,
    name        TEXT        NOT NULL,
    price       NUMERIC(10,2) NOT NULL,   -- mensualité en euros
    category    TEXT        NOT NULL DEFAULT 'abonnement'
                            CHECK (category IN (
                                'salaire','immo','credit','alimentation','restaurant',
                                'sante','transport','loisirs','vetements','voyage',
                                'travaux','abonnement','epargne','divers'
                            )),
    keep        BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_abonnements_user ON abonnements(user_id);

-- =============================================================================
-- CREDITS IMMOBILIERS
-- =============================================================================

CREATE TABLE credits_immo (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id          UUID        REFERENCES accounts(id) ON DELETE SET NULL,
    name                TEXT        NOT NULL,
    montant_initial     NUMERIC(15,2) NOT NULL,
    taux_annuel         NUMERIC(6,4)  NOT NULL,   -- ex: 0.0350 pour 3.50%
    duree_mois          INTEGER     NOT NULL,
    date_debut          DATE        NOT NULL,
    mensualite          NUMERIC(10,2) NOT NULL,
    valeur_bien         NUMERIC(15,2),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credits_immo_user ON credits_immo(user_id);

-- Tableau d'amortissement
CREATE TABLE credit_amortization (
    id              BIGSERIAL   PRIMARY KEY,
    credit_id       UUID        NOT NULL REFERENCES credits_immo(id) ON DELETE CASCADE,
    date            DATE        NOT NULL,
    capital_restant NUMERIC(15,2) NOT NULL
);

CREATE INDEX idx_amortization_credit ON credit_amortization(credit_id);

-- =============================================================================
-- HOLDINGS  (portefeuille boursier, lié à un compte de type 'invest')
-- =============================================================================

CREATE TABLE holdings (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    ticker      TEXT,       -- ISIN ou ticker
    quantity    NUMERIC(18,6) NOT NULL DEFAULT 0,
    price       NUMERIC(15,4) NOT NULL DEFAULT 0,   -- prix unitaire
    value       NUMERIC(15,2) GENERATED ALWAYS AS (quantity * price) STORED,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_holdings_account ON holdings(account_id);

-- =============================================================================
-- BUDGETS  (allocations mensuelles par catégorie)
-- =============================================================================

CREATE TABLE budgets (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category    TEXT        NOT NULL
                            CHECK (category IN (
                                'salaire','immo','credit','alimentation','restaurant',
                                'sante','transport','loisirs','vetements','voyage',
                                'travaux','abonnement','epargne','divers'
                            )),
    amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, category)
);

CREATE INDEX idx_budgets_user ON budgets(user_id);

-- =============================================================================
-- IMPORTED FILES  (historique des imports CSV/PDF)
-- =============================================================================

CREATE TABLE imported_files (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename        TEXT        NOT NULL,
    file_type       TEXT,       -- 'csv', 'pdf', 'image'
    source_bank     TEXT,       -- 'caisse-epargne', 'boursobank', ...
    row_count       INTEGER,
    imported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_imported_files_user ON imported_files(user_id);

-- =============================================================================
-- CHAT HISTORY  (historique de l'assistant IA)
-- =============================================================================

CREATE TABLE chat_messages (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT        NOT NULL CHECK (role IN ('user','assistant','tool')),
    content     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_user_time ON chat_messages(user_id, created_at DESC);

-- =============================================================================
-- BOURSE HISTORY  (snapshots périodiques du portefeuille)
-- =============================================================================

CREATE TABLE bourse_history (
    id              BIGSERIAL   PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    snapshot_date   DATE        NOT NULL,
    total_value     NUMERIC(15,2) NOT NULL,
    holdings_json   JSONB,      -- snapshot complet des positions
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, snapshot_date)
);

CREATE INDEX idx_bourse_history_user ON bourse_history(user_id, snapshot_date DESC);

-- =============================================================================
-- TRIGGER: updated_at automatique
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_abonnements_updated_at
    BEFORE UPDATE ON abonnements
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_credits_immo_updated_at
    BEFORE UPDATE ON credits_immo
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_budgets_updated_at
    BEFORE UPDATE ON budgets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
