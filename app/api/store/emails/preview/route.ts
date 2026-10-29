import { NextResponse } from "next/server"
import { shopCaller } from "@/lib/physical/auth"
import { loadCustomerEmailCopy } from "@/lib/emails/customer-copy-server"
import { storePreview } from "@/lib/emails/customer-preview-server"
import { previewVersion } from "@/lib/emails/preview-version"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Settings › Customer emails: one email as it is sent, drawn by its own
 * template with the store's name, logo, contact, website and saved words,
 * in the language and under the name the place it was bought decides
 * (?channel=website|storelib, ?lang=fr), with sample items and buyer
 * (lib/emails/customer-preview-server.ts). The owner's alone; the page shows
 * it in a sandboxed frame.
 *
 * DRAWN ONCE PER VERSION (the owner: "the preview must open smoothly and
 * fast"). The editor asks for it as a row is hovered or touched, before the
 * click, and shows it the moment the sheet opens while its own templates
 * load for live edits. The answer is kept here per store, email, place,
 * language and version of the saved words (lib/emails/preview-version.ts),
 * so the second open and every other tab draw it without the template
 * running again; a save makes a new version. Kept two minutes, so a new
 * logo or name shows soon after either way. `?v=` (the version the editor
 * holds) lets the browser keep its own copy for that long too.
 */
const KEEP_MS = 120_000
const KEEP_MAX = 300
const kept = new Map<string, { at: number; body: { subject: string; html: string; version: string } }>()

export async function GET(request: Request) {
  const c = await shopCaller("marketing")
  if (c instanceof NextResponse) return c
  const q = new URL(request.url).searchParams
  const id = q.get("id") ?? ""
  const channel = q.get("channel") === "storelib" ? "storelib" : "website"
  const lang = q.get("lang")
  const saved = await loadCustomerEmailCopy(c.db, c.creatorId)
  const version = previewVersion(saved[id])
  const key = `${c.creatorId}|${id}|${channel}|${lang ?? ""}|${version}`
  const hit = kept.get(key)
  /* Fixed to the version asked: a browser copy for the words the editor holds, never one for words saved since. */
  const headers = { "Cache-Control": q.get("v") === version ? `private, max-age=${KEEP_MS / 1000}` : "no-store", "X-Preview-Cache": hit && Date.now() - hit.at < KEEP_MS ? "hit" : "miss" }
  if (hit && Date.now() - hit.at < KEEP_MS) return NextResponse.json(hit.body, { headers })
  const { mail } = await storePreview(c.db, c.creatorId, id, saved[id], { channel, lang })
  if (!mail) return NextResponse.json({ error: "That email was not found." }, { status: 404 })
  const body = { subject: mail.subject, html: mail.html, version }
  if (kept.size >= KEEP_MAX) kept.delete(kept.keys().next().value as string)
  kept.set(key, { at: Date.now(), body })
  return NextResponse.json(body, { headers })
}
