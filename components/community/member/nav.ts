/**
 * WHICH SECTION OF THE MEMBER AREA AN ADDRESS IS, so the shell can mark it
 * without each page saying so (a route group's layout is not told the
 * path), and THE PLACES IN A COMMUNITY: the list in the left column from
 * 1024px (wall.tsx WallPlaces) and the row of tabs under the bar below it.
 * Pure and browser safe.
 */
import type { ShellSection } from "./view-types"

const SECTIONS = ["classroom", "events", "members", "leaderboard", "saved", "notifications", "about"] as const

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

/** The places: Community, Classroom, Calendar, Members, Leaderboards, About. */
export type TabKey = "home" | "classroom" | "events" | "members" | "leaderboard" | "about"

export interface NavEntry {
  key: TabKey
  label: string
  href: string
}

/**
 * The places in a community, in the left column and the row of tabs, each only when the
 * community has it switched on. Members shows for staff even with the
 * directory off (they run it); the community and About are always there.
 */
export function navEntries(c: { slug: string; classroomEnabled: boolean; eventsEnabled: boolean; directoryEnabled: boolean; gamificationEnabled: boolean }, staff: boolean): NavEntry[] {
  const base = `/community/${c.slug}`
  const out: NavEntry[] = [{ key: "home", label: "Community", href: base }]
  if (c.classroomEnabled) out.push({ key: "classroom", label: "Classroom", href: `${base}/classroom` })
  if (c.eventsEnabled) out.push({ key: "events", label: "Calendar", href: `${base}/events` })
  if (c.directoryEnabled || staff) out.push({ key: "members", label: "Members", href: `${base}/members` })
  if (c.gamificationEnabled) out.push({ key: "leaderboard", label: "Leaderboards", href: `${base}/leaderboard` })
  out.push({ key: "about", label: "About", href: `${base}/about` })
  return out
}

/** The tab a section marks: a space, a post, Saved and the inbox all live under Community. */
export function tabFor(section: ShellSection): TabKey {
  if (section === "classroom" || section === "events" || section === "members" || section === "leaderboard" || section === "about") return section
  return "home"
}

/**
 * Whether a section draws the wall's right column (the next event, the top
 * contributors): the community's feed, a space, a post and Saved. Members,
 * the classroom, events, the leaderboard and the inbox use the room for
 * themselves.
 */
export function rightColumnFor(section: ShellSection): boolean {
  return section === "home" || section === "saved" || section.startsWith("space:")
}

/**
 * A place's link, asked for IN FULL the moment a pointer rests on it or a
 * finger lands on it (Next's app router Link, unstable_dynamicOnHover), so
 * the place is usually here by the click; in view it is only asked for up to
 * its loading screen, as every link is. Spread onto a Link: the prop is the
 * app router's and not in next/link's own types.
 */
export const FULL_ON_HOVER = { unstable_dynamicOnHover: true } as Record<never, never>
