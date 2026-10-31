# Implementation log

Record of what each fix branch did. **This is a template.** The lead fills
each row from the fix agent's final report. Nothing here is deployed;
production deploy needs the owner's approval
([MANUAL_ACTIONS.md](MANUAL_ACTIONS.md), action 1).

Status values:
- **NOT STARTED**: not picked up in this round.
- **IN PROGRESS**: in the branch's assigned list (the area audit's "safe to fix now"), report not yet received.
- **COMPLETE**: fixed, regression test written and run green.
- **IMPLEMENTED, NOT VERIFIED**: code in, test not run or not shown failing before.
- **BLOCKED**: needs access, data or a decision; reason given.
- **NEEDS APPROVAL**: needs the owner (SQL part, env var, behaviour change).

Columns: ID, status, commit sha, files, test name, rollback, owner follow-up.

## Already landed before this round (parallel session)

| Commit | Date | What |
| --- | --- | --- |
| `2e88c64ea` | 2026-10-28 | billing reads fail closed; one plan writer from Stripe's current state |
| `918388a5d` | 2026-10-29 | auth that does not answer is never a sign-out; one auth answer per /app render |
| `f3e1f58bb` | 2026-10-29 | Stripe bounded and breaker-guarded; staleness window; one object per press |
| `21c0882e5` | 2026-10-29 | billing fails closed; deadlines on every Supabase request; credit notes |
| `299772b2e` | 2026-10-30 | payout and schedule idempotency keys by identity; trusted return URLs; per-request billing reads |

## `claude/rel-security`

Gate results (fill in): `npm run test:push` …; typecheck ratchet …; `pnpm lint` …

| ID | Status | Commit | Files | Test | Rollback | Owner follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| SEC-1 | IN PROGRESS | | | | | run SQL part (number TBD) |
| SEC-2 | IN PROGRESS | | | | | set `BLOG_ADMIN_USER`, `BLOG_ADMIN_PASSWORD`, `BLOG_ADMIN_SECRET` |
| SEC-3 | IN PROGRESS | | | | | |
| SEC-4 | IN PROGRESS | | | | | check logs for GET sync-session before retiring |
| SEC-5 | IN PROGRESS | | | | | |
| SEC-6 | IN PROGRESS | | | | | |
| SEC-7 | IN PROGRESS | | | | | |
| SEC-8 | IN PROGRESS | | | | | |
| SEC-9 | NOT STARTED | | | | | |
| SEC-10 | NOT STARTED | | | | | |
| SEC-11 | NOT STARTED | | | | | |
| SEC-12 | NOT STARTED | | | | | Batch 6 |
| EVD-3 | NOT STARTED | | | | | not assigned yet |

## `claude/rel-commerce`

Gate results (fill in): `npm run test:push` …; typecheck ratchet …; `pnpm lint` …

| ID | Status | Commit | Files | Test | Rollback | Owner follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| PAY-1 | IN PROGRESS | | | | | |
| PAY-2 | IN PROGRESS | | | | | |
| PAY-3 | IN PROGRESS | | | | | |
| PAY-4 | IN PROGRESS | | | | | |
| PAY-5 | IN PROGRESS | | | | | |
| PAY-6 | IN PROGRESS | | | | | |
| PAY-7 | IN PROGRESS | | | | | decide on `STRIPE_AUTO_RELEASE` default |
| PAY-8 | NOT STARTED | | | | | |
| PAY-9 | NOT STARTED | | | | | |
| PAY-10 | NOT STARTED | | | | | |
| PAY-11 | NOT STARTED | | | | | |
| PAY-12 | NOT STARTED | | | | | |

## `claude/rel-sites`

Gate results (fill in): `npm run test:push` …; typecheck ratchet …; `pnpm lint` …

| ID | Status | Commit | Files | Test | Rollback | Owner follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| SITE-1 | IN PROGRESS | | | | | RPC version would need an SQL part |
| SITE-2 | IN PROGRESS | | | | | |
| SITE-3 | IN PROGRESS | | | | | |
| SITE-4 | IN PROGRESS | | | | | |
| SITE-5 | IN PROGRESS | | | | | part (a) would need an SQL part |
| SITE-6 | IN PROGRESS | | | | | |
| SITE-7 | IN PROGRESS | | | | | |
| SITE-8 | NOT STARTED | | | | | |
| SITE-9 | NOT STARTED | | | | | |
| SITE-10 | IN PROGRESS | | | | | |
| SITE-11 | NOT STARTED | | | | | |
| SITE-12 / EVD-1 | NOT STARTED | | | | | not assigned yet |
| EVD-2 | NOT STARTED | | | | | not assigned yet |
| EVD-5 | NOT STARTED | | | | | not assigned yet |

## `claude/rel-shared`

Gate results (fill in): `npm run test:push` …; typecheck ratchet …; `pnpm lint` …

| ID | Status | Commit | Files | Test | Rollback | Owner follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| SHR-1 | IN PROGRESS | | | | | set bucket size limit on `digital-products` |
| SHR-2 | IN PROGRESS | | | | | |
| SHR-3 | IN PROGRESS | | | | | |
| SHR-4 | IN PROGRESS | | | | | |
| SHR-5 | IN PROGRESS | | | | | coordinate with DB-1 (same files) |
| SHR-6 | IN PROGRESS | | | | | |
| SHR-7 | IN PROGRESS | | | | | |
| SHR-8 | NOT STARTED | | | | | |
| SHR-9 | NOT STARTED | | | | | |
| SHR-10 | NOT STARTED | | | | | |
| EVD-4 | NOT STARTED | | | | | not assigned yet |

## `claude/rel-db`

Gate results (fill in): `npm run test:push` …; typecheck ratchet …; `pnpm lint` …

| ID | Status | Commit | Files | Test | Rollback | Owner follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| DB-1 | IN PROGRESS | | | | | |
| DB-2 | IN PROGRESS | | | | | |
| DB-3 | IN PROGRESS | | | | | |
| DB-4 | NOT STARTED | | | | | |
| DB-5 | NOT STARTED | | | | | |
| DB-6 | IN PROGRESS | | | | | |
| DB-7 | IN PROGRESS | | | | | |
| DB-8 | IN PROGRESS | | | | | |
| DB-9 | IN PROGRESS | | | | | run trigram index statements alone (numbers TBD) |
| DB-10 | NOT STARTED | | | | | |
| DB-11 | IN PROGRESS | | | | | |
| DB-12 | NOT STARTED | | | | | read-only index check, then owner decision |
| DB-13 | NOT STARTED | | | | | |
| DB-14 | NOT STARTED | | | | | |

## Merge record (fill in when the owner approves)

| Branch | PR | Merged | Production deployment | Smoke | Notes |
| --- | --- | --- | --- | --- | --- |
| `claude/rel-security` | | | | | |
| `claude/rel-commerce` | | | | | |
| `claude/rel-sites` | | | | | |
| `claude/rel-shared` | | | | | |
| `claude/rel-db` | | | | | |
