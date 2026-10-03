/**
 * ===========================================================================
 *  A RUN'S CODE CHANGES ARE KEPT TOGETHER, OR NOT AT ALL
 * ===========================================================================
 * The page assistant can rewrite a section's file several times in one run,
 * and can touch more than one file. Each write used to go to the database
 * the moment it compiled. So a run that rewrote the pricing section, then
 * failed on the FAQ, then lost its provider, left the creator with half a
 * change: one file new, one old, and a chat saying the edit failed.
 *
 * Now a write is STAGED here: checked (compiled, validated, drawn) and held,
 * so the rest of the run reads what it wrote. Nothing reaches the database
 * until the run is over, and then:
 *
 *   the run succeeded   every staged file is saved, in the order written.
 *                       The version each one had before is kept in its
 *                       history first, so it can be restored from the code
 *                       editor. If any save fails, every file this commit
 *                       already saved is put back to what it was, and the
 *                       commit reports which file failed.
 *   the run failed      nothing is saved. The files are exactly as they were.
 *
 * A file that had no source before (a coded copy the run created) has
 * nothing to restore to; a failed commit leaves it out rather than deleting
 * anything, because a file nobody points at costs nothing and deleting a
 * creator's file is never undone.
 *
 * Pure: the saving is injected, so tests/ask-section-edit.test.ts drives a
 * commit that fails halfway without a database.
 */

export interface StagedFile {
  path: string
  /** What the run wants the file to say. */
  source: string
  /** What it said before this run touched it; null for a file the run created. */
  previous: string | null
}

export interface JournalSaver {
  /** Saves `source` as the file's working copy. Never throws: a failure is a result. */
  save(path: string, source: string): Promise<{ ok: true } | { ok: false; error: string }>
  /** Keeps `source` in the file's history before it is replaced. Best effort. */
  keep?(path: string, source: string): Promise<void>
  /** Puts a file back to `source` after a failed commit. */
  restore(path: string, source: string): Promise<{ ok: true } | { ok: false; error: string }>
}

export type CommitResult =
  | { ok: true; saved: string[] }
  | {
      ok: false
      /** The file whose save failed. */
      failed: string
      error: string
      /** Files that had been saved by this commit and were put back. */
      restored: string[]
      /** Files that could not be put back, which should never happen and is said if it does. */
      stuck: string[]
    }

export class CodeJournal {
  private readonly staged = new Map<string, StagedFile>()

  /** `before` is how to read a file as it stood when the run started. */
  constructor(private readonly before: (path: string) => string | null) {}

  /**
   * Holds a checked write. The FIRST write to a path in a run remembers what
   * the file said before; a second write replaces the staged source and
   * keeps that original, so a rollback goes back to before the run, not to
   * the run's own first attempt.
   */
  stage(path: string, source: string): void {
    const existing = this.staged.get(path)
    this.staged.set(path, { path, source, previous: existing ? existing.previous : this.before(path) })
  }

  /** What the run has written to a path, or undefined when it has not. */
  read(path: string): string | undefined {
    return this.staged.get(path)?.source
  }

  get size(): number {
    return this.staged.size
  }

  files(): StagedFile[] {
    return [...this.staged.values()]
  }

  /** The run failed: drop every staged write. The database was never touched. */
  discard(): void {
    this.staged.clear()
  }

  /**
   * Saves every staged file, or none. Files whose staged source is what they
   * already said are skipped, so a run that wrote a file back unchanged does
   * not add a version nobody can tell apart from the last one.
   */
  async commit(saver: JournalSaver): Promise<CommitResult> {
    const done: StagedFile[] = []
    for (const file of this.staged.values()) {
      if (file.previous !== null && file.previous === file.source) continue
      if (file.previous !== null && saver.keep) {
        try {
          await saver.keep(file.path, file.previous)
        } catch {
          /* the history row is worth less than the save */
        }
      }
      const saved = await saver.save(file.path, file.source)
      if (saved.ok === true) {
        done.push(file)
        continue
      }
      const restored: string[] = []
      const stuck: string[] = []
      for (const back of done.reverse()) {
        if (back.previous === null) continue
        const put = await saver.restore(back.path, back.previous)
        if (put.ok === true) restored.push(back.path)
        else stuck.push(back.path)
      }
      this.staged.clear()
      return { ok: false, failed: file.path, error: saved.error, restored, stuck }
    }
    this.staged.clear()
    return { ok: true, saved: done.map((f) => f.path) }
  }
}
