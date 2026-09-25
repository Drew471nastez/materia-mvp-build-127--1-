/**
 * ===========================================================================
 *  FROM WHAT IS TRUE TO WHAT IS SAID
 * ===========================================================================
 * Pure: one creator's findings and the rows already written for them in,
 * the rows to write and the rows to resolve out. The engine applies it; the
 * database's unique index on (creator_id, dedupe_key) makes applying it
 * twice, or from two runs at once, write each row once.
 *
 * RESOLVE FIRST. An open row resolves when its rule could tell and no longer
 * reports its subject (for rules that describe a condition), or when it has
 * been open longer than the rule's ttlDays. A digest resolves when every
 * line of it has. A rule that could not tell (undefined) resolves nothing.
 *
 * THEN EACH FINDING, which becomes a row unless:
 *   - a row with its dedupe key exists, in any state
 *   - an open row about the same subject exists
 *   - a row about the same subject was made within the rule's cooldownDays,
 *     or one of the same kind within its kindCooldownDays
 *
 * THEN THE LIMITS (lib/notifications/policy.ts). Critical rows are all
 * written. The rest share DAILY_LIMIT per 24 hours, in LIMIT_ORDER, with one
 * open next step, an opportunity every few days (several at once become one
 * digest) and an update a day. What does not fit is deferred: nothing is
 * written, and the next run asks again.
 */
import { DIGEST_KIND } from "./rules"
import {
  CATEGORY_RANK,
  DAILY_LIMIT,
  DAY_MS,
  DIGEST_ITEMS,
  DIGEST_MIN,
  LIMIT_ORDER,
  NEXT_STEP_GAP_DAYS,
  OPPORTUNITY_GAP_DAYS,
  UPDATE_GAP_DAYS,
} from "./policy"
import { dayKey, plural } from "./format"
import type { CreatorSnapshot, ExistingRow, Finding, Plan, PlannedRow, Rule } from "./types"

/** How long a digest stays open when its lines do not resolve first. */
export const DIGEST_TTL_DAYS = 7

export function dedupeKeyOf(kind: string, f: Pick<Finding, "subject" | "period">, now: number): string {
  const period = f.period === undefined ? dayKey(now) : f.period
  return `${kind}:${f.subject}:${period}`
}

const meta = (r: ExistingRow) => (r.metadata ?? {}) as Record<string, unknown>
const isBaseline = (r: ExistingRow) => meta(r).baseline === true
const foldedInto = (r: ExistingRow) => (typeof meta(r).folded_into === "string" ? (meta(r).folded_into as string) : null)
const ageOf = (r: ExistingRow, now: number) => (now - Date.parse(r.created_at)) / DAY_MS

function toRow(rule: Rule, f: Finding, key: string): PlannedRow {
  return {
    kind: rule.kind,
    category: rule.category,
    priority: f.priority ?? rule.priority,
    version: rule.version,
    dedupeKey: key,
    subject: f.subject,
    title: f.title,
    message: f.message,
    href: f.href,
    area: f.area,
    pushTitle: f.pushTitle ?? null,
    push: rule.push && (rule.category === "critical" || rule.category === "milestone") && !f.baseline,
    productId: f.productId ?? null,
    reviewId: f.reviewId ?? null,
    data: f.data ?? {},
    baseline: f.baseline === true,
    foldedInto: null,
    items: null,
  }
}

export interface PlanInput {
  rules: readonly Rule[]
  snapshot: CreatorSnapshot
  existing: readonly ExistingRow[]
  now: number
  /**
   * Every rule was asked (the hourly run). An event asks a few, and rows of
   * kinds it did not ask about are left exactly as they are.
   */
  complete: boolean
  /** Every kind the code knows, so a full run can retire rows of a rule that was removed. */
  knownKinds?: ReadonlySet<string>
}

export function planCreator(input: PlanInput): Plan {
  const { rules, snapshot, existing, now } = input
  const plan: Plan = { inserts: [], resolve: [], deferred: 0 }

  /* ─── What each rule says now ───────────────────────────────────── */
  const said = new Map<string, Finding[] | undefined>()
  for (const rule of rules) {
    let found: Finding[] | undefined
    try {
      found = rule.evaluate(snapshot)
    } catch {
      /* A rule that throws could not tell. */
      found = undefined
    }
    said.set(rule.kind, found)
  }

  /* ─── Resolve ────────────────────────────────────────────────────── */
  const resolving = new Set<string>()
  const isOpen = (r: ExistingRow) => !r.resolved_at && !resolving.has(r.id)
  for (const r of existing) {
    if (!r.kind || r.resolved_at || isBaseline(r) || r.kind === DIGEST_KIND) continue
    const rule = rules.find((x) => x.kind === r.kind)
    if (!rule) {
      /* A kind no rule makes any more: only a full run may retire it. */
      if (input.complete && input.knownKinds && !input.knownKinds.has(r.kind)) resolving.add(r.id)
      continue
    }
    if (ageOf(r, now) > rule.ttlDays) {
      resolving.add(r.id)
      continue
    }
    const found = said.get(rule.kind)
    if (found !== undefined && rule.resolveWhenGone && !found.some((f) => !f.baseline && f.subject === r.subject_id)) resolving.add(r.id)
  }
  if (input.complete) {
    for (const d of existing) {
      if (d.kind !== DIGEST_KIND || d.resolved_at) continue
      const lines = existing.filter((r) => foldedInto(r) === d.dedupe_key)
      const allDone = lines.length > 0 && lines.every((r) => !isOpen(r))
      if (allDone || ageOf(d, now) > DIGEST_TTL_DAYS) resolving.add(d.id)
    }
  }
  plan.resolve = [...resolving]

  /* ─── Which findings may become rows ─────────────────────────────── */
  const candidates: Array<{ rule: Rule; f: Finding; key: string }> = []
  const keys = new Set<string>()
  for (const rule of rules) {
    const found = said.get(rule.kind)
    if (!found) continue
    for (const f of found) {
      const key = dedupeKeyOf(rule.kind, f, now)
      if (keys.has(key)) continue
      keys.add(key)
      if (existing.some((r) => r.dedupe_key === key)) continue
      const same = existing.filter((r) => r.kind === rule.kind && r.subject_id === f.subject)
      if (same.some((r) => isOpen(r) && !r.dismissed_at && !isBaseline(r))) continue
      if (rule.cooldownDays > 0 && same.some((r) => ageOf(r, now) < rule.cooldownDays)) continue
      if (rule.kindCooldownDays && existing.some((r) => r.kind === rule.kind && !isBaseline(r) && ageOf(r, now) < rule.kindCooldownDays!)) continue
      if (f.baseline) {
        plan.inserts.push(toRow(rule, f, key))
        continue
      }
      candidates.push({ rule, f, key })
    }
  }
  const byPriority = (a: { rule: Rule; f: Finding }, b: { rule: Rule; f: Finding }) =>
    CATEGORY_RANK[a.rule.category] - CATEGORY_RANK[b.rule.category] || (b.f.priority ?? b.rule.priority) - (a.f.priority ?? a.rule.priority)
  candidates.sort(byPriority)

  /* ─── Critical: always ───────────────────────────────────────────── */
  for (const c of candidates.filter((c) => c.rule.category === "critical")) plan.inserts.push(toRow(c.rule, c.f, c.key))

  /* ─── Everything else: the daily limit and the gaps ──────────────── */
  const visible = (r: ExistingRow) => !!r.kind && !isBaseline(r) && !foldedInto(r)
  const used = existing.filter((r) => visible(r) && r.category !== "critical" && ageOf(r, now) < 1).length
  let left = Math.max(0, DAILY_LIMIT - used)
  const recent = (category: string, days: number) => existing.some((r) => visible(r) && r.category === category && ageOf(r, now) < days)

  for (const category of LIMIT_ORDER) {
    const group = candidates.filter((c) => c.rule.category === category)
    if (group.length === 0) continue
    if (category === "next_step") {
      const openStep = existing.some((r) => r.category === "next_step" && visible(r) && isOpen(r) && !r.dismissed_at)
      if (openStep || recent("next_step", NEXT_STEP_GAP_DAYS) || left === 0) {
        plan.deferred += group.length
        continue
      }
      plan.inserts.push(toRow(group[0].rule, group[0].f, group[0].key))
      left--
      plan.deferred += group.length - 1
      continue
    }
    if (category === "opportunity") {
      if (recent("opportunity", OPPORTUNITY_GAP_DAYS) || left === 0) {
        plan.deferred += group.length
        continue
      }
      if (group.length >= DIGEST_MIN) {
        const lines = group.slice(0, DIGEST_ITEMS)
        const digestKey = dedupeKeyOf(DIGEST_KIND, { subject: dayKey(now), period: "" }, now)
        plan.inserts.push({
          kind: DIGEST_KIND,
          category: "opportunity",
          priority: Math.max(...lines.map((l) => l.f.priority ?? l.rule.priority)),
          version: 1,
          dedupeKey: digestKey,
          subject: dayKey(now),
          title: `${plural(lines.length, "opportunity", "opportunities")} this week`,
          message: lines.map((l) => l.f.line ?? l.f.title).join("; "),
          href: lines[0].f.href,
          area: "Opportunities",
          pushTitle: null,
          push: false,
          productId: null,
          reviewId: null,
          data: { lines: lines.length },
          baseline: false,
          foldedInto: null,
          items: lines.map((l) => ({ title: l.f.line ?? l.f.title, href: l.f.href })),
        })
        for (const l of lines) plan.inserts.push({ ...toRow(l.rule, l.f, l.key), foldedInto: digestKey })
        plan.deferred += group.length - lines.length
      } else {
        plan.inserts.push(toRow(group[0].rule, group[0].f, group[0].key))
      }
      left--
      continue
    }
    if (category === "update" && recent("update", UPDATE_GAP_DAYS)) {
      plan.deferred += group.length
      continue
    }
    for (const c of group) {
      if (left > 0 && (category !== "update" || !plan.inserts.some((r) => r.category === "update"))) {
        plan.inserts.push(toRow(c.rule, c.f, c.key))
        left--
      } else plan.deferred++
    }
  }
  return plan
}
