/**
 * Round 53: the OnePage editor's profile photo.
 *
 * "The photo went up, but your profile did not take it: The photo did not
 * save. Try again in a moment." The OnePage upload hands back the storage
 * address (lib/onepage/media-upload publicMediaUrl). The route writes it and
 * reads the row back through the server client, whose fetch turns every
 * storage address in an answer into Storelib's own (lib/storage/media-url
 * mediaFetch, PATCH answers included). The read back never equalled the
 * address sent, so lib/account/avatar-save answered 409 after the row had
 * been written. This runs the real mediaFetch under a stand in PostgREST.
 *
 * Run with:  npm run test:push
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"

import { mediaFetch } from "../lib/storage/media-url"
import { saveProfilePhoto, sameMediaAddress, type PhotoClient } from "../lib/account/avatar-save"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n          ${JSON.stringify(detail)}` : ""}`)
  }
}

const STORAGE = "https://proj.supabase.co/storage/v1/object/public/avatars/user-1/avatar-1.jpg"
const MEDIA = "https://storelib.com/media/avatars/user-1/avatar-1.jpg"

/* A PostgREST that keeps one profile row and answers a PATCH with the row, as Prefer: return=representation does. */
const row: Record<string, unknown> = { id: "user-1", avatar_url: null }
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const method = (init?.method ?? "GET").toUpperCase()
  if (method === "PATCH") Object.assign(row, JSON.parse(String(init?.body)))
  return new Response(JSON.stringify([{ avatar_url: row.avatar_url }]), { status: 200, headers: { "content-type": "application/json" } })
}) as typeof fetch

async function viaMediaFetch(method: string, body?: unknown) {
  const res = await mediaFetch("https://proj.supabase.co/rest/v1/profiles?id=eq.user-1&select=avatar_url", { method, body: body ? JSON.stringify(body) : undefined })
  return { data: (await res.json()) as Array<Record<string, unknown>>, error: null }
}

const client = {
  auth: { updateUser: async () => ({ data: null, error: null }) },
  from: (table: string) => ({
    update: (values: Record<string, unknown>) => ({
      eq: () => ({ select: () => (table === "profiles" ? viaMediaFetch("PATCH", values) : Promise.resolve({ data: [], error: null })) }),
    }),
    select: () => ({
      eq: () => ({
        maybeSingle: async () => (table === "profiles" ? { data: (await viaMediaFetch("GET")).data[0] ?? null, error: null } : { data: null, error: null }),
        eq: async () => ({ data: [], error: null }),
      }),
    }),
  }),
} as unknown as PhotoClient

async function main() {
  console.log("\n▸ The read back of a write has Storelib's own address")
  const back = await viaMediaFetch("PATCH", { avatar_url: STORAGE })
  check("mediaFetch rewrites a PATCH answer (the cause)", back.data[0]?.avatar_url === MEDIA, back.data)
  check("the old strict comparison would refuse it (the 409 the owner saw)", back.data[0]?.avatar_url !== STORAGE)

  console.log("\n▸ The OnePage editor's photo saves")
  const fromOnePage = await saveProfilePhoto(client, { id: "user-1", user_metadata: { storelib_avatar_chosen: true } }, STORAGE)
  check("a storage address saves", fromOnePage.ok === true, fromOnePage)
  check("the row holds the photo", row.avatar_url === STORAGE)
  const fromSettings = await saveProfilePhoto(client, { id: "user-1", user_metadata: { storelib_avatar_chosen: true } }, MEDIA)
  check("Settings' media address still saves", fromSettings.ok === true, fromSettings)
  const removed = await saveProfilePhoto(client, { id: "user-1", user_metadata: { storelib_avatar_chosen: true } }, null)
  check("removing still saves", removed.ok === true, removed)

  console.log("\n▸ The comparison is one file, never two")
  check("both forms of one file are the same", sameMediaAddress(STORAGE, MEDIA))
  check("another file is not", !sameMediaAddress(STORAGE, MEDIA.replace("avatar-1", "avatar-2")))
  check("another person's folder is not", !sameMediaAddress(STORAGE, MEDIA.replace("user-1", "user-2")))
  check("a photo is not a removal", !sameMediaAddress(STORAGE, null) && sameMediaAddress(null, ""))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
