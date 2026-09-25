/**
 * feature_launch: an entry of lib/notifications/launches.ts, once per
 * account. Nothing else ever makes an "update".
 */
import { LAUNCHES, LAUNCH_FRESH_DAYS, type Launch } from "../launches"
import { ageDays } from "../format"
import type { Finding, Rule } from "../types"

export function featureLaunchRule(launches: readonly Launch[] = LAUNCHES): Rule {
  return {
    kind: "feature_launch",
    category: "update",
    priority: 20,
    version: 1,
    needs: ["creator"],
    cooldownDays: 0,
    ttlDays: 30,
    resolveWhenGone: false,
    push: false,
    evaluate(s) {
      const c = s.creator
      if (!c) return undefined
      const out: Finding[] = []
      for (const l of launches) {
        const live = `${l.live}T00:00:00Z`
        const since = ageDays(live, s.now)
        if (!(since >= 0 && since <= LAUNCH_FRESH_DAYS)) continue
        /* An account made after it went live signed up into it: not news. */
        if (c.createdAt && Date.parse(c.createdAt) >= Date.parse(live)) continue
        let wanted = true
        try {
          wanted = l.audience ? l.audience(s) : true
        } catch {
          wanted = false
        }
        if (!wanted) continue
        out.push({ subject: l.id, period: "", title: l.title, message: l.message, href: l.href, area: "New in Storelib" })
      }
      return out
    },
  }
}

export const featureLaunch = featureLaunchRule()
