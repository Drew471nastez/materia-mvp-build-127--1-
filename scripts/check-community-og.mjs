/**
 * ===========================================================================
 *  THE PICTURE A SHARED COMMUNITY LINK SHOWS, DRAWN AND LOOKED AT
 * ===========================================================================
 * The real route (app/(marketing)/community/[slug]/share.png/route.tsx), the
 * real picture fetching and cutting (lib/communities/server/share-image.ts,
 * sharp) and the real art (components/community/public/share-card.tsx),
 * drawn by next/og exactly as the server draws them. Only the database and
 * the network are answered here: the community row, its card (creator,
 * price) and the three pictures (a WebP cover, as uploads become, a PNG logo,
 * a JPEG face).
 *
 *   FULL        cover, logo, face, a paid community: 1200 by 630 PNG, the
 *               brief cache header, no invite words
 *   INVITE      ?invite=1: the same card, "You're invited to join"
 *   PLAIN       no pictures, free, a long name and line: still drawn, the
 *               words clipped on a word
 *   INVITE ONLY says so on the button, no price
 *   HIDDEN      a draft, a suspended community and the switch off: 404
 *   OLD ADDRESS a slug only in the history draws the community it moved to
 *
 * Every picture is written to SHOTS_DIR to be looked at.
 *
 *   node scripts/check-community-og.mjs
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import sharp from "sharp"

const root = process.cwd()
const shots = process.env.SHOTS_DIR || mkdtempSync(join(tmpdir(), "storelib-community-og-"))
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* The pictures the stub network answers: a WebP cover (an upload), a PNG logo with a transparent corner, a JPEG face. */
const cover = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="600"><rect width="1600" height="600" fill="#d9cbb6"/><circle cx="1180" cy="260" r="220" fill="#c0a17e"/><rect x="0" y="420" width="1600" height="180" fill="#8f7a5f"/><circle cx="420" cy="360" r="110" fill="#efe6d8"/><rect x="380" y="250" width="80" height="120" rx="16" fill="#a9845c"/></svg>`)).webp().toBuffer()
const logo = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" rx="88" fill="#1a1a2e"/><path d="M118 270 L200 126 L282 270 Z" fill="#f4efe6"/></svg>`)).png().toBuffer()
const face = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#e8d5c4"/><circle cx="150" cy="118" r="56" fill="#8a5a3c"/><rect x="58" y="196" width="184" height="140" rx="80" fill="#8a5a3c"/></svg>`)).jpeg().toBuffer()
const PICTURES = { "https://x.supabase.co/cover.webp": cover, "https://x.supabase.co/logo.png": logo, "https://x.supabase.co/mara.jpg": face }

const dir = join(root, ".community-og-probe")
mkdirSync(dir, { recursive: true })
try {
  writeFileSync(join(dir, "stubs.js"), `
const state = globalThis.__og ||= { on: true, rows: {}, history: {}, cards: {} }
export const communitiesEnabled = async () => state.on
export const admin = () => ({})
export async function loadCommunity(_db, key) {
  if ("id" in key) return Object.values(state.rows).find((r) => r.id === key.id) ?? null
  const row = state.rows[key.slug]
  if (row) return row
  const moved = state.history[key.slug]
  return moved ? Object.values(state.rows).find((r) => r.id === moved) ?? null : null
}
export function sharePreviewable(c) { return c.status !== "draft" && c.status !== "suspended" && !c.suspended_at && !c.deleted_at }
export async function cardsFor(_db, list) { return list.map((c) => state.cards[c.id]) }
export async function fetchImageBytes(url) { const b = (globalThis.__pictures || {})[url]; return b ? new Uint8Array(b) : null }
`)
  const entry = join(dir, "entry.ts")
  writeFileSync(entry, `export { GET } from "../app/(marketing)/community/[slug]/share.png/route"\n`)
  const stubs = join(dir, "stubs.js")
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    outfile: join(dir, "route.mjs"),
    absWorkingDir: root,
    logLevel: "error",
    external: ["next/og", "react", "react/jsx-runtime", "sharp"],
    plugins: [
      {
        name: "stubs",
        setup(b) {
          b.onResolve({ filter: /^server-only$/ }, () => ({ path: stubs }))
          b.onResolve({ filter: /^@\/lib\/communities\/(flag|server\/context|server\/db|server\/public)$/ }, () => ({ path: stubs }))
          b.onResolve({ filter: /^\.\/public$|^\.\/db$/ }, (a) => (a.importer.includes("lib/communities/server") ? { path: stubs } : undefined))
          b.onResolve({ filter: /^@\/lib\/onepage\/share-image$/ }, () => ({ path: stubs }))
          b.onResolve({ filter: /^next\/og$/ }, () => ({ path: "next/og.js", external: true }))
        },
      },
    ],
    alias: { "@": "." },
  })
  globalThis.__pictures = PICTURES
  const { GET } = await import(pathToFileURL(join(dir, "route.mjs")).href)
  const state = (globalThis.__og ||= { on: true, rows: {}, history: {}, cards: {} })

  const base = { status: "published", suspended_at: null, deleted_at: null, access: "paid", member_count: 8012, updated_at: "2026-10-01T00:00:00Z" }
  const rows = [
    { ...base, id: "c1", slug: "clay-studio", name: "Clay Studio", tagline: "A working studio for people learning wheel throwing, glazing and firing at home.", logo_url: "https://x.supabase.co/logo.png", cover_url: "https://x.supabase.co/cover.webp" },
    { ...base, id: "c2", slug: "woodworkers", access: "free", member_count: 1, name: "The Weekend Woodworkers Collective of Northern Europe and Friends", tagline: "Hand tools, slow projects and the occasional disaster, shared every Sunday by people who build furniture at home in small flats and garden sheds across the north.", logo_url: null, cover_url: null },
    { ...base, id: "c3", slug: "night-runners", access: "invite_only", member_count: 312, name: "Night Runners", tagline: "Runs after dark.", logo_url: "https://x.supabase.co/logo.png", cover_url: "https://x.supabase.co/cover.webp" },
    { ...base, id: "c4", slug: "secret-draft", status: "draft", name: "Secret draft", tagline: null, logo_url: null, cover_url: null },
    { ...base, id: "c5", slug: "gone-quiet", status: "suspended", suspended_at: "2026-09-01T00:00:00Z", name: "Gone quiet", tagline: null, logo_url: null, cover_url: null },
  ]
  for (const r of rows) state.rows[r.slug] = r
  state.history["clay-club"] = "c1"
  state.cards = {
    c1: { creator: { name: "Mara Lindqvist", avatarUrl: "https://x.supabase.co/mara.jpg" }, priceLine: "$9/month", excerpt: null },
    c2: { creator: { name: "Jonas Berg", avatarUrl: null }, priceLine: "Free", excerpt: null },
    c3: { creator: { name: "Priya Raman", avatarUrl: "https://x.supabase.co/mara.jpg" }, priceLine: "Free", excerpt: null },
  }

  const ask = async (slug, query = "") => GET(new Request(`https://storelib.com/community/${slug}/share.png${query}`), { params: Promise.resolve({ slug }) })
  const save = async (res, name) => {
    const buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(join(shots, `${name}.png`), buf)
    const meta = await sharp(buf).metadata()
    return { bytes: buf.length, width: meta.width, height: meta.height, format: meta.format }
  }

  console.log("\nDrawn")
  for (const [slug, query, name] of [["clay-studio", "?v=abc", "og-full"], ["clay-studio", "?invite=1", "og-invite"], ["woodworkers", "", "og-plain-long"], ["night-runners", "", "og-invite-only"], ["clay-club", "", "og-old-address"]]) {
    const res = await ask(slug, query)
    const info = res.status === 200 ? await save(res, name) : null
    expect(res.status === 200 && info?.format === "png" && info.width === 1200 && info.height === 630 && info.bytes > 10_000, `${name}: a 1200 by 630 PNG`, { status: res.status, ...info })
    expect(res.headers.get("cache-control") === "public, max-age=300, s-maxage=600, stale-while-revalidate=86400", `${name}: kept briefly`, res.headers.get("cache-control"))
  }

  console.log("\nNot drawn")
  for (const slug of ["secret-draft", "gone-quiet", "nobody-here", "..%2F..%2Fetc"]) {
    const res = await ask(slug)
    expect(res.status === 404, `${slug}: 404`, res.status)
  }
  state.on = false
  expect((await ask("clay-studio")).status === 404, "communities switched off: 404")
  state.on = true
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(`\nPictures: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
