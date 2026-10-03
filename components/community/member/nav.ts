/**
 * WHICH SECTION OF THE MEMBER AREA AN ADDRESS IS, so the shell can mark it
 * without each page saying so (a route group's layout is not told the
 * path). Pure and browser safe.
 */
import type { ShellSection } from "./view-types"

const SECTIONS = ["classroom", "events", "members", "leaderboard", "saved", "notifications"] as const

export function sectionFromPath(pathname: string | null | undefined, slug: string): ShellSection {
  const base = `/community/${slug}`
  const path = (pathname || "").split(/[?#]/)[0].replace(/\/+$/, "")
  if (!path.startsWith(base)) return "home"
  const [first, second] = path.slice(base.length).split("/").filter(Boolean)
  if (!first) return "home"
  if (first === "space" && second) return `space:${decodeURIComponent(second)}`
  if ((SECTIONS as readonly string[]).includes(first)) return first as ShellSection
  return "home"
}

export interface NavEntry {
  key: ShellSection
  label: string
  href: string
}

/** The member area's places, each only when the community has it switched on. */
export function navEntries(c: { slug: string; classroomEnabled: boolean; eventsEnabled: boolean; directoryEnabled: boolean; gamificationEnabled: boolean }, staff: boolean): NavEntry[] {
  const base = `/community/${c.slug}`
  const out: NavEntry[] = [{ key: "home", label: "Home", href: base }]
  if (c.classroomEnabled) out.push({ key: "classroom", label: "Classroom", href: `${base}/classroom` })
  if (c.eventsEnabled) out.push({ key: "events", label: "Events", href: `${base}/events` })
  if (c.directoryEnabled || staff) out.push({ key: "members", label: "Members", href: `${base}/members` })
  if (c.gamificationEnabled) out.push({ key: "leaderboard", label: "Leaderboard", href: `${base}/leaderboard` })
  out.push({ key: "saved", label: "Saved", href: `${base}/saved` })
  return out
}
