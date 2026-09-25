/**
 * ===========================================================================
 *  HOW MUCH ONE EDITOR REQUEST MAY CARRY
 * ===========================================================================
 * The editor's routes read their bodies with `req.json()`, which takes all of
 * whatever arrives into memory and parses it before anything can look at its
 * size. This reads up to a cap and stops (lib/agent-access/body.ts), and a
 * body over it is answered 413 before it is parsed, validated or cleaned.
 *
 * The caps are set from what a real site sends, measured against the
 * default theme and the page limits in lib/storelib-theme/types.ts (60
 * sections a page, 50 blocks a section):
 *
 *   one of every section in the library, with its preset          68 KB
 *   60 sections, every block list grown to 50                     368 KB
 *   the same, plus 5 KB of rich text a section and 1 KB a block   2.6 MB
 *   a settings row carrying a whole imported theme pack           292 KB
 *
 * Each cap is above the worst of those with room to spare, because a save
 * refused here is work somebody thinks is saved. The largest stays under the
 * 4.5 MB a function will accept at all, so the refusal is ours and says so.
 */
import { NextResponse } from "next/server"
import { readJsonCapped } from "@/lib/agent-access/body"

export const BODY_LIMITS = {
  /** A page: `{ page_key, sections }`. */
  sections: 4 * 1024 * 1024,
  /** A header and a footer, each up to 50 blocks. */
  syncGlobal: 2 * 1024 * 1024,
  /** The theme's settings, including an imported theme pack. */
  settings: 1024 * 1024,
  /** An action, a backup label, a site address, a selection. */
  small: 64 * 1024,
} as const

function size(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${bytes / 1024 / 1024} MB` : `${bytes / 1024} KB`
}

export type EditorBody =
  /** Over the cap: the 413 to return. */
  | { ok: false; response: NextResponse }
  /** `invalid` is a body that is not JSON, empty included; each route decides what that means. */
  | { ok: true; json: unknown; invalid: boolean }

export async function readEditorBody(req: Request, maxBytes: number): Promise<EditorBody> {
  const read = await readJsonCapped(req, maxBytes)
  if (read.ok === false) {
    if (read.status === 413) {
      return { ok: false, response: NextResponse.json({ error: `This is too large to save. The limit is ${size(maxBytes)}.` }, { status: 413 }) }
    }
    return { ok: true, json: undefined, invalid: true }
  }
  return { ok: true, json: read.value, invalid: false }
}
