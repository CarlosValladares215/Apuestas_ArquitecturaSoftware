# Tasks: Ledger Contable Inmutable, Billetera y Depósitos Payphone

**Input**: Design documents from `/specs/003-billetera-ledger/`  
**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/wallet.openapi.yaml`  
**TDD Rule**: Tests MUST be written first and observed failing (RED) before writing production code.

---

## Phase 1: Setup & Shared Contracts (`packages/shared` — TDD First)

- [x] T001 [P] Write failing tests for shared ledger and wallet contracts in `packages/shared/tests/ledger.test.ts`
- [x] T002 Implement shared types, enums, DTOs, and pure financial helpers (`AccountType`, `LedgerEntryType`, `TransactionType`, `PaymentStatus`, `WalletBalance`, `centsToDollars`, `dollarsToCents`, `validateBalancedTransaction`) in `packages/shared/src/index.ts` and verify tests pass

---

## Phase 2: Backend Tests in RED (`apps/api` — Strict TDD Before Implementation)

- [x] T003 Write failing concurrency tests for wallet debits and deposits in `apps/api/test/wallet-concurrency.spec.ts` (verify N concurrent debits leave exact balance without double spending or overdraw)
- [x] T004 [P] Write failing idempotency and double-confirmation tests in `apps/api/test/wallet-idempotency.spec.ts` (same Payphone tx id or idempotency key credited only once)
- [x] T005 [P] Write failing tampering and insufficient funds tests in `apps/api/test/payphone-tampering.spec.ts` (rejection when amount or currency is altered; rejection when debit exceeds balance)
- [x] T006 Run `pnpm --filter @apuestas/api test` and verify that all new tests fail with expected errors (RED verification checkpoint)

---

## Phase 3: Backend Implementation (GREEN — `apps/api`)

- [x] T007 Define PostgreSQL relational schema and indexes in `apps/api/src/database/schema.sql` (`wallets`, `ledger_accounts`, `ledger_transactions`, `ledger_entries`, `payment_intents`, `audit_logs`)
- [x] T008 [P] Implement repository contracts and thread-safe transactional repository with row-level locking mutex in `apps/api/src/wallet/repositories/`
- [x] T009 Implement `LedgerService` in `apps/api/src/wallet/services/ledger.service.ts` (double-entry invariance, append-only entries, balance derivation `SUM(credits) - SUM(debits)`, compensating transactions)
- [x] T010 Implement `PayphoneService` in `apps/api/src/wallet/services/payphone.service.ts` (Payphone sandbox button prepare, server-to-server confirmation `/api/button/V2/Confirm`, amount/currency/clientTransactionId validation, audit logging)
- [x] T011 Implement `WalletService` in `apps/api/src/wallet/services/wallet.service.ts` (transaction orchestration, row-level locking, idempotency check, debit with balance validation, deposit crediting)
- [x] T012 Implement DTOs with `class-validator`, `WalletController` in `apps/api/src/wallet/wallet.controller.ts`, and register `WalletModule` in `apps/api/src/app.module.ts`
- [x] T013 Run `pnpm --filter @apuestas/api test` and verify that 100% of unit, concurrency, and idempotency tests turn GREEN

---

## Phase 4: Frontend UI (`apps/web` — TDD First + `frontend-design`)

- [x] T014 Write failing React Testing Library tests in `apps/web/tests/wallet.test.tsx` (renders balance, list of movements, deposit form, mobile-first 360 px, WCAG 2.1 AA accessibility, ensures zero client-side balance math)
- [x] T015 Verify `apps/web/tests/wallet.test.tsx` fails (RED verification checkpoint)
- [x] T016 Implement wallet page and presentation components in `apps/web/src/app/wallet/page.tsx` (`BalanceCard`, `DepositForm`, `MovementsTable`) strictly as presentation layer
- [x] T017 Run `pnpm --filter @apuestas/web test` and verify all tests turn GREEN

---

## Phase 5: Verification, Docs & Commits

- [x] T018 Update `specs/README.md` changing status of `003-billetera-ledger` and `004-depositos-payphone` to `Terminada`
- [x] T019 Run full verification suite (`pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`)
- [ ] T020 Execute atomic Conventional Commits (`docs:`, `test:`, `feat:`, `chore:`)
- [ ] T021 Push branch `feature/spec-3` to remote repository
