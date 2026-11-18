# Reliability engineering

The reliability, performance, security and scalability programme for
Storelib. Written 2026-10-31 from the code at `10e69cf32`, five area audits
and seven days of production error data. Nothing in this programme is
deployed yet; production deploys need the owner's approval.

| Document | Read it for |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | system map, request flow, data stores, dependencies, cron table, failure domains |
| [AUDIT.md](AUDIT.md) | production baseline, what is already in place, the owner's leads answered, every finding ranked with its ten fields |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | fix batches, branches, rollback and verification per item, the ten cascading-failure requirements with status |
| [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md) | what each fix branch actually did (filled in as reports arrive) |
| [MANUAL_ACTIONS.md](MANUAL_ACTIONS.md) | everything the owner has to do by hand, and the access the lead needs |
| [PERFORMANCE.md](PERFORMANCE.md) | baselines, targets, planned performance changes |
| [SECURITY.md](SECURITY.md) | threat model, findings, what was verified fine, open items |
| [SCALABILITY.md](SCALABILITY.md) | limits, what breaks at 10x and 100x, when a queue is justified |
| [RECOVERY.md](RECOVERY.md) | runbooks per failure, RPO and RTO |
| [COSTS.md](COSTS.md) | cost of the fixes, optional paid items, wasted spend found |
| [EDGE_FAILOVER.md](EDGE_FAILOVER.md) | public pages without the database (stored copies, round 49), what still needs Vercel, the owner's steps for a second provider |

Related operations docs: [release-safety.md](../operations/release-safety.md),
[rollback.md](../operations/rollback.md), [backups.md](../operations/backups.md),
[load-testing.md](../operations/load-testing.md),
[translation-and-crons.md](../operations/translation-and-crons.md).

## Where the five deliverables of the platform audit brief live

The brief asks for five documents by name. They exist under other names, and are kept here instead of being written twice:

| Asked for | Here |
| --- | --- |
| PLATFORM_AUDIT.md | [ARCHITECTURE.md](ARCHITECTURE.md) (system map, data stores, crons, failure domains) and [AUDIT.md](AUDIT.md) (every finding with its evidence and root cause) |
| END_TO_END_MATRIX.md | [END_TO_END_MATRIX.md](END_TO_END_MATRIX.md) |
| INFRASTRUCTURE_COSTS.md | [../audits/vercel-costs-r54.md](../audits/vercel-costs-r54.md) (what cost money, fixes, before and after, growth table) and [COSTS.md](COSTS.md) |
| IMPLEMENTATION_PROGRESS.md | [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md), newest round last |
| PRODUCTION_READINESS.md | [SECURITY.md](SECURITY.md), [IDOR_SWEEP.md](IDOR_SWEEP.md), [RECOVERY.md](RECOVERY.md), [../operations/release-safety.md](../operations/release-safety.md), [../operations/rollback.md](../operations/rollback.md), and the open items in [MANUAL_ACTIONS.md](MANUAL_ACTIONS.md) |

The opening lines of this file are from Oct 31. Since then the five fix branches were merged and deployed, and rounds 48 to 54 and AL to AW followed; the log has each.

## The short version

- **Most production errors are the database being slow.** About 1,360
  published-site requests in a week got no page; a last-good copy saved about
  400 more. Fixes: persistent last-good copies, bounded reads on AI sites,
  Creator Pages and OnePages, and less database work per dashboard load.
- **Two critical security issues:** unauthenticated email verification that
  lets someone claim another person's guest orders (SEC-1), and the admin
  login's fallback credentials in source (SEC-2, fixed by setting three
  production variables).
- **Billing and Stripe resilience is largely done** (credited commits
  `2e88c64ea`, `918388a5d`, `f3e1f58bb`, `21c0882e5`, `299772b2e`). Remaining
  money issues: an ambiguous card confirm that can lead to a double charge
  (PAY-1) and payout ledger errors that are swallowed (PAY-2).
- **The 300s timeouts** were mostly fixed by request deadlines; ten raw
  database clients (including both Stripe webhooks) and several crons still
  need bounding.
- Fixes are in five branches: `claude/rel-security`, `claude/rel-commerce`,
  `claude/rel-sites`, `claude/rel-shared`, `claude/rel-db`.
