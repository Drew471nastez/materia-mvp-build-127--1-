import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { REVALIDATED_CACHE, tagMatches } from "@/lib/website-builder/revalidated-json"

/**
 * ===========================================================================
 *  THE CANVAS'S FILES, ASKED WHETHER THEY CHANGED BEFORE THEY ARE READ (round 66)
 * ===========================================================================
 * Opening the editor on a Materia website asks for its section sources
 * (files?sources=1, 22.6 MB) and its Shopify files (files?compat=1, 6.8 MB).
 * Since round 27 an unchanged answer is a 304 (./revalidated-json.ts), but
 * the tag was a hash of the body, so every open still read all 30 MB from
 * the database to work it out.
 *
 * The tag now starts with a REVISION of the rows the answer is drawn from:
 * each row's path and updated_at, read without their text (a few kilobytes
 * for a whole theme). Every write to a row moves its updated_at: the
 * `stcf_updated_at` trigger (RUN_CREATOR_PAGE_AND_SITES.sql, BEFORE UPDATE,
 * every column, so a save, a publish's promotion, a rename and a reference
 * becoming the store's own copy all count), and a new row takes now(). A
 * row deleted or added changes the list itself. A reference's text is named
 * by its sha256, which never changes what it holds. What else goes into the
 * answer is in the revision too: the code that shapes it (the deployment)
 * and, for the Shopify files, the draft asset pass.
 *
 * So when the revision the browser sends is the one the rows say now, the
 * answer is a 304 before any file is read. When it is not, the files are
 * read as before and the body's own hash is the second half of the tag: a
 * body that came out the same (a publish moved a draft into place, the
 * text did not change) is still a 304, and nothing is sent again.
 *
 * Read as the caller (row level security), private, no-cache: nothing here
 * is kept anywhere but the person's own browser.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

/* The code that shapes the answer: one deployment, one value on every server; elsewhere, one per process. */
const BOOT = randomUUID()
export function codeVersion(env: Record<string, string | undefined> = process.env): string {
  return env.VERCEL_DEPLOYMENT_ID || env.VERCEL_GIT_COMMIT_SHA || `boot-${BOOT}`
}

const PAGE = 1000

/**
 * The revision of an install's rows whose path is like one of `patterns`,
 * with `extra` (what else the answer depends on). Null when it could not be
 * read: the answer is then worked out from the files, as before.
 */
export async function filesRevision(db: Db, installId: string, patterns: string[], extra: string): Promise<string | null> {
  try {
    const lists = await Promise.all(
      patterns.map(async (pattern) => {
        const out: string[] = []
        for (let from = 0; from < 20_000; from += PAGE) {
          const r = await db.from("store_theme_custom_files").select("path, updated_at").eq("install_id", installId).like("path", pattern).order("path").range(from, from + PAGE - 1)
          if (r.error) throw new Error(r.error.message ?? "the read failed")
          const rows = (r.data ?? []) as { path: string; updated_at: string | null }[]
          for (const row of rows) {
            /* A row without a time could change without saying so: no revision, the files decide. */
            if (!row.updated_at) throw new Error("a row has no updated_at")
            out.push(`${row.path}\t${row.updated_at}`)
          }
          if (rows.length < PAGE) break
        }
        return `${pattern}\n${out.join("\n")}`
      }),
    )
    const h = createHash("sha1")
    h.update(`files-revision:v1\n${codeVersion()}\n${installId}\n${extra}\n`)
    for (const l of lists) h.update(`${l}\n\n`)
    return h.digest("base64url")
  } catch {
    return null
  }
}

const bodyHash = (body: string) => createHash("sha1").update(body).digest("base64url")
/** The tag: the revision, then the body's hash. */
export const revisionTag = (revision: string, body: string) => `W/"r.${revision}.${body}"`

/** The revisions and body hashes an If-None-Match header names. */
export function namedTags(header: string | null): { revision: string; body: string; raw: string }[] {
  if (!header) return []
  const out: { revision: string; body: string; raw: string }[] = []
  for (const part of header.split(",")) {
    const m = /^\s*(?:W\/)?"r\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)"\s*$/.exec(part)
    if (m) out.push({ revision: m[1], body: m[2], raw: part.trim() })
  }
  return out
}

const headersFor = (tag: string) => ({ ETag: tag, "Cache-Control": REVALIDATED_CACHE, Vary: "Cookie" })

/** A 304 when the browser's copy was drawn from these very rows; null otherwise (read the files). */
export function unchangedSince(req: Request, revision: string | null): NextResponse | null {
  if (!revision) return null
  const seen = namedTags(req.headers.get("if-none-match")).find((t) => t.revision === revision)
  if (!seen) return null
  return new NextResponse(null, { status: 304, headers: headersFor(revisionTag(revision, seen.body)) })
}

/**
 * The answer, tagged with the revision it was read at and its body's hash;
 * a 304 when the browser holds exactly this body, whatever revision it was
 * tagged with. Without a revision, ./revalidated-json.ts's tag, as before.
 */
export function revisionJson(req: Request, revision: string | null, value: unknown): NextResponse {
  const body = JSON.stringify(value)
  const hash = bodyHash(body)
  const header = req.headers.get("if-none-match")
  if (!revision) {
    const tag = `W/"${hash}"`
    if (tagMatches(header, tag)) return new NextResponse(null, { status: 304, headers: headersFor(tag) })
    return new NextResponse(body, { status: 200, headers: { ...headersFor(tag), "Content-Type": "application/json" } })
  }
  const tag = revisionTag(revision, hash)
  if (namedTags(header).some((t) => t.body === hash) || tagMatches(header, `W/"${hash}"`)) return new NextResponse(null, { status: 304, headers: headersFor(tag) })
  return new NextResponse(body, { status: 200, headers: { ...headersFor(tag), "Content-Type": "application/json" } })
}
