/**
 * Round AD3: every setting saved in /app/settings reaches what reads it.
 *
 *   1. a new name or photo reaches the live website and the creator page on
 *      the next view (lib/account/identity-caches.ts)
 *   2. Store details' form follows what is saved, so a contact email changed
 *      in Profile is not written back to the old one by Store details' Save
 *   3. a Store details save expires the shop's cache, never "max"
 *   4. Store details and Taxes clear the store's readiness answer, so the
 *      "Add a contact email" or "Add your tax rates" banner goes at once
 *   5. a Store details save that fails leaves the contact email as it was
 *   6. marketing and automation emails are signed with Store details' name
 *
 *   node scripts/run-push-tests.mjs (it imports server-only modules)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { identityChanged } from "@/lib/account/identity-caches"
import { creatorTag } from "@/lib/commerce/product-page-cache"
import { followSaved } from "@/lib/settings/follow-saved"
import { saveStoreSettings } from "@/lib/store/settings-server"
import { loadBrand } from "@/lib/email-campaigns/brand-server"
import { inboxAddress } from "@/lib/seller-inbox"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* A query chain that answers from a table of canned rows and writes down every write. */
type Row = Record<string, unknown>
function fakeDb(rows: Record<string, Row | null>, opts: { upsertError?: { code: string } | null } = {}) {
  const writes: { table: string; kind: string; value: unknown }[] = []
  const from = (table: string) => {
    const q: Record<string, unknown> = {}
    const self = () => q
    for (const n of ["select", "eq", "neq", "in", "not", "order", "limit", "is"]) q[n] = self
    q.maybeSingle = async () => ({ data: rows[table] ?? null, error: null })
    q.single = q.maybeSingle
    q.update = (value: unknown) => {
      writes.push({ table, kind: "update", value })
      return { eq: async () => ({ error: null }) }
    }
    q.upsert = async (value: unknown) => {
      writes.push({ table, kind: "upsert", value })
      return { error: opts.upsertError ?? null }
    }
    return q
  }
  return { db: { from }, writes }
}

async function main() {
  console.log("\n1. A new name or photo, on the next view")
  const calls: string[] = []
  await identityChanged({ userId: "u1", creatorId: "c1" }, { expireTag: (t) => void calls.push(`tag:${t}`), expireSite: async (id) => void calls.push(`site:${id}`) })
  check("the creator page's cache, by the person and by the store", calls.includes(`tag:${creatorTag("u1")}`) && calls.includes(`tag:${creatorTag("c1")}`), calls)
  check("and the live website, which holds the profile for an hour", calls.includes("site:c1"), calls)
  const none: string[] = []
  await identityChanged({ userId: "u1", creatorId: null }, { expireTag: (t) => void none.push(t), expireSite: async () => void none.push("site") })
  check("no store: only the person's own tag", none.length === 1 && none[0] === creatorTag("u1"), none)
  let threw = false
  try {
    await identityChanged({ userId: "u1", creatorId: "c1" }, { expireTag: () => { throw new Error("outside a request") }, expireSite: async () => undefined })
  } catch {
    threw = true
  }
  check("a cache that cannot be told never fails the save", !threw)
  const changed = read("app/api/account/profile-changed/route.ts")
  const avatar = read("app/api/account/avatar/route.ts")
  check("Settings' rename tells both caches", /identityChanged\(\{ userId: user\.id, creatorId: followed\.creatorId \}\)/.test(changed))
  check("  and a new photo does too", /identityChanged\(\{ userId: user\.id, creatorId: saved\.creatorId \?\? followed\.creatorId \}\)/.test(avatar))
  check("  neither marks the creator page stale with max any more", !/creatorTag\([^)]*\), "max"/.test(changed + avatar))

  console.log("\n2. Store details follows what is saved")
  const before = { name: "Ana", email: "old@shop.ro", phone: "", phoneCountry: "RO" }
  const after = { name: "Ana", email: "new@shop.ro", phone: "", phoneCountry: "RO" }
  check("an untouched field takes the saved value", followSaved(before, after, before).email === "new@shop.ro")
  check("a field being typed in is left as typed", followSaved(before, after, { ...before, email: "typing@shop.ro" }).email === "typing@shop.ro")
  check("the rest follow on their own", followSaved(before, { ...after, name: "Ana's shop" }, { ...before, email: "typing@shop.ro" }).name === "Ana's shop")
  const panel = read("components/app/settings/store-details-panel.tsx")
  check("the Store details form follows a newer read", /followSaved\(base\.current, next, current\)/.test(panel))
  const form = read("components/app/settings-form-new.tsx")
  check("a Profile save reads Store details again, so its kept copy is not the old address", /readFresh\("\/api\/store\/settings"\)/.test(form))
  check("Profile refuses a support email that is not an address, as Store details does", inboxAddress("foo") === null && inboxAddress("foo@bar") === null && /if \(cleanSupportEmail && !inboxAddress\(cleanSupportEmail\)\)/.test(form))
  check("  and writes it trimmed and lower case", /support_email: cleanSupportEmail \|\| null/.test(form) && form.indexOf("!inboxAddress(cleanSupportEmail)") < form.indexOf("support_email: cleanSupportEmail"))

  console.log("\n3. A Store details save expires the shop's cache")
  const route = read("app/api/store/settings/route.ts")
  check("the shop's name and email: expired, not stale", /revalidateTag\(creatorShopTag\(c\.creatorId\), \{ expire: 0 \}\)/.test(route) && !/creatorShopTag\(c\.creatorId\), "max"/.test(route))

  console.log("\n4. Readiness is asked again after a fix")
  check("Store details (contact email, business details)", /readinessChanged\(c\)/.test(route))
  for (const f of ["app/api/store/taxes/route.ts", "app/api/store/taxes/regions/route.ts", "app/api/store/taxes/regions/[id]/route.ts"]) {
    check(`  ${f}`, /readinessChanged\(c\)/.test(read(f)))
  }

  console.log("\n5. A failed save leaves the contact email as it was")
  const failing = fakeDb({ store_settings: { store_name: "Ana" } }, { upsertError: { code: "XX000" } })
  const r1 = await saveStoreSettings(failing.db, "c1", { storeName: "Ana", supportEmail: "new@shop.ro" })
  check("the save says it failed", r1.ok === false)
  check("  and the creator row was not written", !failing.writes.some((w) => w.table === "creators"), failing.writes)
  const bad = fakeDb({ store_settings: { store_name: "Ana" } })
  const r2 = await saveStoreSettings(bad.db, "c1", { supportEmail: "new@shop.ro", legal: { company: "", country: "RO", line1: "Str. 1", city: "Cluj" } })
  check("a refused field refuses the whole save, the email too", r2.ok === false && !bad.writes.some((w) => w.table === "creators"), bad.writes)
  const ok = fakeDb({ store_settings: { store_name: "Ana" } })
  const r3 = await saveStoreSettings(ok.db, "c1", { supportEmail: " New@Shop.ro " })
  const wrote = ok.writes.find((w) => w.table === "creators")
  check("a good save still writes it, lower case", r3.ok === true && (wrote?.value as Row | undefined)?.support_email === "new@shop.ro", ok.writes)

  console.log("\n6. Emails are signed with the store's name")
  const brandDb = fakeDb({
    creators: { id: "c1", user_id: "u1", slug: "ana", headline: null, brand_color: null },
    profiles: { display_name: "Ana Pop", username: "ana", avatar_url: null },
    store_theme_installs: null,
    store_settings: { store_name: "Ana's Bakery" },
  })
  const brand = await loadBrand(brandDb.db, "c1")
  check("Store details' name before the person's", brand.name === "Ana's Bakery", brand.name)
  check("  the person still signs as themselves", brand.creatorName === "Ana Pop", brand.creatorName)
  const plain = fakeDb({ creators: { id: "c1", user_id: "u1", slug: "ana" }, profiles: { display_name: "Ana Pop", username: "ana" }, store_settings: null })
  check("  no store name: the person's, as before", (await loadBrand(plain.db, "c1")).name === "Ana Pop")

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
