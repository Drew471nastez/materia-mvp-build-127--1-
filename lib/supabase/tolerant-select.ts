/**
 * A READ THAT SURVIVES A COLUMN THE DATABASE DOES NOT HAVE YET.
 *
 * A select names every column it lists, and Postgres refuses the whole read
 * (42703) when one of them is missing: one optional column, added by a SQL
 * part a store's database has not run yet, took the whole cart down with it
 * ("This shop is not ready to sell physical products yet"). Here an optional
 * column the error names is dropped and the read asked again, so the rest of
 * the row still comes back and the code reading it falls back to its default
 * for the one that is missing. A required column missing is still an error.
 *
 * Postgres names the column in the message ("column products.category does
 * not exist"), which is how the one to drop is found; nothing is guessed.
 */

type PgError = { code?: string; message?: string } | null | undefined

export function missingColumnIn(error: PgError, optional: readonly string[]): string | null {
  if (!error) return null
  const message = error.message ?? ""
  if (error.code !== "42703" && error.code !== "PGRST204" && !/does not exist|could not find the .* column/i.test(message)) return null
  for (const col of optional) {
    if (new RegExp(`(^|[^a-z0-9_])${col}([^a-z0-9_]|$)`).test(message)) return col
  }
  return null
}

/** The select list without these columns. */
export function dropColumns(columns: string, drop: readonly string[]): string {
  return columns
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c && !drop.includes(c))
    .join(", ")
}

/**
 * Runs `read` with `columns`, and again without any optional column the
 * database says it does not have. Returns the last answer and which columns
 * were left out (logged once per read, by name only).
 */
/*
  REMEMBERED PER SERVER (round 54). Every read used to ask with every column
  first, so on a database without the part each read was refused once (a
  Postgres ERROR line and a 400) before the one that answered, and logged a
  warning each time. The columns found missing are now left out from the
  start for DROPPED_FOR_MS, then asked for again once, so a part run in
  Supabase is picked up within minutes.
*/
export const DROPPED_FOR_MS = 10 * 60 * 1000
const droppedHeld = new Map<string, { cols: string[]; until: number }>()

export async function selectTolerant<R extends { data: unknown; error: PgError }>(
  label: string,
  columns: string,
  optional: readonly string[],
  read: (columns: string) => PromiseLike<R>,
  now: () => number = Date.now,
): Promise<R & { dropped: string[] }> {
  const key = `${label}|${columns}`
  const held = droppedHeld.get(key)
  const known = held && now() < held.until ? held.cols.filter((c) => optional.includes(c)) : []
  if (held && known.length === 0) droppedHeld.delete(key)
  const dropped: string[] = [...known]
  let answer = await read(dropped.length ? dropColumns(columns, dropped) : columns)
  while (answer.error) {
    const col = missingColumnIn(answer.error, optional.filter((c) => !dropped.includes(c)))
    if (!col) break
    dropped.push(col)
    answer = await read(dropColumns(columns, dropped))
  }
  if (dropped.length > known.length) {
    if (droppedHeld.size > 200) droppedHeld.clear()
    droppedHeld.set(key, { cols: dropped, until: now() + DROPPED_FOR_MS })
    console.warn(`[${label}] read without missing column(s): ${dropped.join(", ")}. A SQL part adding them has not run.`)
  }
  return Object.assign(answer, { dropped })
}
