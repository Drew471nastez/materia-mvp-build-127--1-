/**
 * ===========================================================================
 *  THE EDITOR'S OPEN GOES BEFORE THE WORK AFTER A PUBLISH (round 68)
 * ===========================================================================
 * The owner: "Let's say I click publish. Then I click edit website ... It
 * truly takes so much to load."
 *
 * Round 67 started the heavy work after a Publish or an Add (the release's
 * read of every file, the backup, the warm) QUIET_AFTER_PUBLISH_MS after the
 * answer, for the editor's first read. But the editor goes on reading after
 * its first read: the theme's files and the page's section sources, which on
 * Materia are megabytes from the same tables. Pressing Edit website a moment
 * after Publish put those reads right in the middle of the release's
 * (tests/editor-open-r68.test.ts: 21 s to the canvas's data at 3 MB/s).
 *
 * So this server counts the editor's reads it is answering, by website, and
 * the work after a website's Publish, once its quiet window is over, also
 * waits while any of that website's are on their way and for a moment after
 * the last, for at most EDITOR_FIRST_CAP_MS. One server's count: a read answered by another server
 * of the same deployment is not seen here, and the work then runs as before.
 * Nobody waits on that work: the site is drawn from its rows until it is done.
 */

/** The longest the work after a Publish waits for the editor's reads on this server. */
export const EDITOR_FIRST_CAP_MS = 15_000
/** The quiet after the last of them that still counts as the editor opening (its next read is on its way). */
export const EDITOR_READS_SETTLE_MS = 1_500

/*
  By website: the work after one website's Publish waits for that website's editor only, never for every editor this
  server answers (a server answers many people's). A handful of entries, each let go once quiet.
*/
const byInstall = new Map<string, { reading: number; lastAt: number }>()
const MAX_TRACKED = 500

/** An editor read of this website has begun on this server; call what it returns when it has answered. */
export function editorReadBegins(installId: string, now: () => number = Date.now): () => void {
  let e = byInstall.get(installId)
  if (!e) {
    if (byInstall.size >= MAX_TRACKED) {
      for (const [k, v] of byInstall) if (v.reading === 0) byInstall.delete(k)
    }
    byInstall.set(installId, (e = { reading: 0, lastAt: -Infinity }))
  }
  const entry = e
  entry.reading++
  entry.lastAt = now()
  let done = false
  return () => {
    if (done) return
    done = true
    entry.reading--
    entry.lastAt = now()
  }
}

/** Whether this website's editor is opening on this server: a read on its way, or one answered a moment ago. */
export function editorReading(installId: string, now: number = Date.now()): boolean {
  const e = byInstall.get(installId)
  if (!e) return false
  if (e.reading > 0 || now - e.lastAt < EDITOR_READS_SETTLE_MS) return true
  byInstall.delete(installId)
  return false
}

/** Resolves once this server has no read of this website's editor on its way (and none for EDITOR_READS_SETTLE_MS), or after `cap`. */
export async function afterEditorReads(installId: string, cap = EDITOR_FIRST_CAP_MS, step = 100): Promise<void> {
  /* A test measuring the work as it ran before this round (tests/editor-open-r68.test.ts). */
  if ((globalThis as { __PUSH_TEST_EDITOR_FIRST_OFF__?: boolean }).__PUSH_TEST_EDITOR_FIRST_OFF__) return
  const until = Date.now() + cap
  while (Date.now() < until && editorReading(installId)) await new Promise((r) => setTimeout(r, step))
}

/** For the tests. */
export function forgetEditorReads(): void {
  byInstall.clear()
}

/** `run`, counted as a read of this website's editor. */
export async function asEditorRead<T>(installId: string, run: () => Promise<T>): Promise<T> {
  const end = editorReadBegins(installId)
  try {
    return await run()
  } finally {
    end()
  }
}
