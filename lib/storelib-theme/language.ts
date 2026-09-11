/**
 * ===========================================================================
 *  WHAT VERSION OF THE LANGUAGE A FILE IS WRITTEN IN
 * ===========================================================================
 * A `.storelib` file that works today has to work in a year, on an engine
 * that has learned things since. Those two facts are in tension the first
 * time the language changes the meaning of something rather than adding to
 * it, and the way to keep both is for every file to say which language it is
 * written in, and for the engine to keep reading each one the way it was
 * written.
 *
 * SO: a section may declare `"language_version": N` in its schema. A file
 * that declares nothing is version 1, permanently — not "whatever is current"
 * — because those files were written against version 1 and nobody can go back
 * and ask their authors what they meant. That default is the whole promise:
 * an existing valid file never changes behaviour under a newer engine.
 *
 * A file that declares a version this engine does not have is refused rather
 * than guessed at. Better a clear "this theme is newer than this Storelib"
 * than a section that renders almost right.
 *
 * MIGRATIONS. When version 2 arrives, the change goes in `MIGRATIONS` as a
 * step from 1 to 2 that rewrites a file's source, and the engine can then
 * offer to bring an old file forward instead of only tolerating it. The list
 * is empty because there is nothing to migrate yet; the machinery around it
 * is not, and it is exercised by tests against a synthetic step, so it is
 * known to work before it is first needed rather than after.
 */
import type { Result, ThemeError } from "./types"

/** The version of the template language, CSS scoping and script sandbox. */
export const LANGUAGE_VERSION = 1

/** What a file that says nothing is, and always will be. */
export const DEFAULT_LANGUAGE_VERSION = 1

export interface LanguageMigration {
  from: number
  to: number
  /** One line, shown to whoever is being asked to accept the change. */
  describe: string
  /** The file's whole source in, the migrated source out. */
  section(source: string): string
}

/** Empty on purpose. See the note above. */
export const MIGRATIONS: LanguageMigration[] = []

/**
 * The steps from one version to another, in order, or null when there is no
 * path. Steps are looked up rather than assumed contiguous, so a gap is a
 * missing path and not a crash at migration time.
 */
export function migrationPath(
  from: number,
  to: number,
  migrations: LanguageMigration[] = MIGRATIONS,
): LanguageMigration[] | null {
  if (from === to) return []
  if (from > to) return null
  const path: LanguageMigration[] = []
  let at = from
  while (at < to) {
    const step = migrations.find((m) => m.from === at && m.to === at + 1)
    if (!step) return null
    path.push(step)
    at += 1
  }
  return path
}

/**
 * Brings a file forward, one version at a time. Every step runs or none is
 * kept: a half-migrated file is a file nobody can read, and the source that
 * went in is still on disk and still readable by the engine it was written
 * for, so refusing is always the safer answer.
 */
export function migrateSource(
  source: string,
  from: number,
  to: number,
  opts: { file?: string; migrations?: LanguageMigration[] } = {},
): Result<{ source: string; applied: string[] }> {
  const file = opts.file
  const err = (message: string): { ok: false; errors: ThemeError[] } => ({
    ok: false,
    errors: [{ stage: "schema", file, message }],
  })
  const path = migrationPath(from, to, opts.migrations ?? MIGRATIONS)
  if (path === null) {
    return err(
      from > to
        ? `${file ?? "This file"} is written in language version ${from}; there is no way back to ${to}.`
        : `No migration from language version ${from} to ${to}.`,
    )
  }
  let out = source
  const applied: string[] = []
  for (const step of path) {
    try {
      out = step.section(out)
    } catch (e) {
      return err(`Migrating ${step.from} to ${step.to} failed: ${e instanceof Error ? e.message : String(e)}`)
    }
    applied.push(step.describe)
  }
  return { ok: true, value: { source: out, applied } }
}

/**
 * What language version a file is written in, having said so or not, and
 * whether this engine can read it.
 */
export function readLanguageVersion(
  declared: number | undefined,
  engine: number = LANGUAGE_VERSION,
): { ok: true; version: number } | { ok: false; message: string } {
  if (declared === undefined) return { ok: true, version: DEFAULT_LANGUAGE_VERSION }
  if (!Number.isInteger(declared) || declared < 1) {
    return { ok: false, message: `language_version must be a whole number of 1 or more; found ${JSON.stringify(declared)}.` }
  }
  if (declared > engine) {
    return {
      ok: false,
      message: `This section is written in Storelib language version ${declared}, and this Storelib reads up to ${engine}. Update Storelib, or set "language_version": ${engine} and check the section still does what it should.`,
    }
  }
  return { ok: true, version: declared }
}
