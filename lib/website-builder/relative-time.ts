/**
 * "just now", "4 minutes ago", "2 days ago". Shared by the publish panel, the
 * project settings and the website page so all three agree on what an hour is.
 */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 45) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`
  const mo = Math.round(d / 30)
  return `${mo} month${mo === 1 ? "" : "s"} ago`
}
