/**
 * ===========================================================================
 *  WHAT A PROFILE KNOWS ABOUT SOMEBODY, AS FACTS
 * ===========================================================================
 * The rows under "About <name>" on a person's page (components/profile/
 * person-about.tsx), decided here so a test can read them without a
 * browser: the day they joined, where they are from, how many communities
 * they are in. One row per value that exists, in that order, and no row at
 * all for a value nothing knows. Nothing is guessed, counted twice or
 * rounded up.
 *
 * Their activity used to end on "Joined Storelib", which is not activity.
 * The day is a fact about the person, so it is said here instead, once.
 *
 * Pure: a date in, a string out.
 */

export interface PersonFact {
  /** The small label above the value ("Joined"), also its data attribute in lower case. */
  label: string
  value: string
}

/**
 * The day an account was made, written out: "4 January 2025". UTC, because
 * the row is a UTC timestamp and the page is read in every time zone; the
 * day somebody joined should not move because of where it is being read.
 */
export function joinedDay(iso: string | null | undefined): string | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
}

/** The facts a person's About shows, in order. Only the ones there is a value for. */
export function personFacts(person: {
  joinedAt?: string | null
  /** One line, already made (lib/profile/location.ts locationLine). */
  location?: string | null
  /** How many communities anybody may see them in; null when communities are off or private. */
  communities?: number | null
}): PersonFact[] {
  const joined = joinedDay(person.joinedAt)
  const place = (person.location || "").trim()
  const count = typeof person.communities === "number" && person.communities > 0 ? person.communities : null
  return [
    joined ? { label: "Joined", value: joined } : null,
    place ? { label: "From", value: place } : null,
    count ? { label: "Communities", value: String(count) } : null,
  ].filter((f): f is PersonFact => !!f)
}
