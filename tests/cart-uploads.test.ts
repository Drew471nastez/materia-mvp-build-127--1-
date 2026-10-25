/**
 * ===========================================================================
 *  ROUND AG3: A BUYER'S WORDS AND PICTURES ON A CART LINE, KEPT TO THE ORDER
 * ===========================================================================
 *   1. The value a line holds: its shape, its file name, its words.
 *   2. The signature: bound to the store and to the browser; changed by hand,
 *      copied to another store or another cart, it is refused.
 *   3. The picture: JPEG, PNG and WebP only, by its bytes; a renamed page, a
 *      program, an SVG, a HEIC, an empty file, one too big in bytes or in
 *      pixels, too many at once, all refused; what is kept is drawn again
 *      and carries no EXIF.
 *   4. Kept and opened: under the store and the browser; opened only by that
 *      browser on that store, with a short link; every other try "Not found".
 *   5. Tenant isolation at checkout and on the order page: a checkout takes
 *      only its own browser's pictures for its own store; a store sees only
 *      its own uploads, even given another store's ids.
 *   6. The order keeps them: copied to the order's own path when paid, so
 *      they outlive the cart; the sweep removes only what no paid order took.
 *   7. Where the words show: emails, packing slip, the buyer's properties,
 *      the export, the order page; the forwarders (Printful, Printify,
 *      Gelato) through a stub.
 *   8. The Storelib theme's Personalization block and the website cart.
 *
 * No network: storage and the database are in memory.
 *
 *   npx tsx --conditions=react-server tests/cart-uploads.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"

import { fakeDb } from "./_fake-db"

process.env.COMMERCE_SECRETS_KEY = process.env.COMMERCE_SECRETS_KEY || "test-cart-upload-key-0123456789"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const STORE_A = "11111111-1111-4111-8111-111111111111"
const STORE_B = "22222222-2222-4222-8222-222222222222"

/** A private bucket in memory: upload, copy, remove, signed links that name the path. */
function fakeStorage(opts: { missing?: boolean } = {}) {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>()
  const signed: { path: string; seconds: number; download?: string }[] = []
  const bucket = {
    async upload(path: string, bytes: Uint8Array, o: { contentType: string }) {
      if (opts.missing) return { error: { message: "Bucket not found", statusCode: "404" } }
      if (objects.has(path)) return { error: { message: "The resource already exists" } }
      objects.set(path, { bytes, contentType: o.contentType })
      return { error: null }
    },
    async copy(from: string, to: string) {
      const o = objects.get(from)
      if (!o) return { error: { message: "Object not found" } }
      if (objects.has(to)) return { error: { message: "The resource already exists" } }
      objects.set(to, o)
      return { error: null }
    },
    async remove(paths: string[]) {
      for (const p of paths) objects.delete(p)
      return { error: null }
    },
    async createSignedUrl(path: string, seconds: number, o?: { download?: string }) {
      if (!objects.has(path)) return { data: null, error: { message: "Object not found" } }
      signed.push({ path, seconds, download: o?.download })
      return { data: { signedUrl: `https://storage.test/sign/${path}?ttl=${seconds}` }, error: null }
    },
  }
  return { objects, signed, storage: { from: (name: string) => (name === "cart-uploads" ? bucket : null) } }
}

function world(tables: Record<string, Record<string, unknown>[]> = {}, opts: { missing?: boolean } = {}) {
  const db = fakeDb({ cart_uploads: [], commerce_checkouts: [], ...tables })
  const st = fakeStorage(opts)
  return Object.assign(db, { storage: st.storage, objects: st.objects, signed: st.signed }) as ReturnType<typeof fakeDb> & { storage: ReturnType<typeof fakeStorage>["storage"]; objects: Map<string, { bytes: Uint8Array; contentType: string }>; signed: { path: string; seconds: number; download?: string }[] }
}

const file = (name: string, type: string, bytes: Uint8Array, size = bytes.byteLength) => ({ name, type, size, bytes: async () => bytes })
const text = (s: string) => new TextEncoder().encode(s)

async function main() {
  const rules = await import("@/lib/cart-uploads/rules")
  const sign = await import("@/lib/cart-uploads/sign")
  const image = await import("@/lib/cart-uploads/image")
  const store = await import("@/lib/cart-uploads/store")
  const http = await import("@/lib/cart-uploads/http")
  const { hasImageMetadata } = await import("@/lib/images/metadata")

  /* Real pictures, made here. The JPEG carries EXIF a phone would write. */
  const JPEG = new Uint8Array(await sharp({ create: { width: 64, height: 48, channels: 3, background: "#cc3333" } }).withExif({ IFD0: { Artist: "SECRET-GPS-48.8584", Copyright: "12 Home Street" } }).jpeg().toBuffer())
  const PNG = new Uint8Array(await sharp({ create: { width: 40, height: 40, channels: 4, background: "#3366cc" } }).png().toBuffer())
  const WEBP = new Uint8Array(await sharp({ create: { width: 32, height: 32, channels: 3, background: "#33cc66" } }).webp().toBuffer())
  const TINY = new Uint8Array(await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000" } }).png().toBuffer())
  const GIF = text("GIF89a\x10\x00\x10\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x10\x00\x10\x00\x00\x02\x02D\x01\x00;")
  /* A PNG header that says 20000 by 20000. */
  const HUGE = PNG.slice()
  new DataView(HUGE.buffer).setUint32(16, 20000)
  new DataView(HUGE.buffer).setUint32(20, 20000)
  const HEIC = new Uint8Array([0, 0, 0, 24, ...text("ftypheic"), 0, 0, 0, 0, ...text("mif1heic"), ...new Uint8Array(64)])
  const SVG = text('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10"/></svg>')
  const HTML = text("<!doctype html><html><script>alert(document.cookie)</script></html>")
  const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff, ...new Uint8Array(200)])
  const PDF = text("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF")

  section("1. The value a line holds")
  {
    const v = rules.uploadValue("0123456789abcdef0123456789abcdef.abcdefghijklmnopqrstuv", "mug-photo.jpg")
    check("a value is a path on the store's host with /uploads/ in it (Dawn shows it as a link)", v === "/api/cart/uploads/0123456789abcdef0123456789abcdef.abcdefghijklmnopqrstuv/mug-photo.jpg" && v.includes("/uploads/"))
    const r = rules.readUploadValue(v)
    check("it reads back: id, signature, name", r?.id === "0123456789abcdef0123456789abcdef" && r?.sig === "abcdefghijklmnopqrstuv" && r?.name === "mug-photo.jpg")
    check("anything else is the buyer's words", rules.readUploadValue("Ana") === null && rules.readUploadValue("https://evil.test/uploads/x.jpg") === null && rules.readUploadValue(`${v}?x=1`) === null && rules.readUploadValue(v.replace("/mug", "/../mug")) === null)
    check("the file name takes the bytes' extension and plain characters", rules.uploadFileName("Zoë's photo.PNG", "image/jpeg") === "Zoe-s-photo.jpg" && rules.uploadFileName("", "image/webp") === "photo.webp" && rules.uploadFileName("../../etc/passwd", "image/png") === "passwd.png")
    check("a value is said by its file name, words as they are", rules.propertyText(v) === "mug-photo.jpg" && rules.propertyText("Ana") === "Ana")
    const { buyerProperties } = await import("@/lib/physical/cart-link")
    const shown = buyerProperties({ Name: "Ana", Photo: v, _sl_offer_id: "x" })
    check("the buyer is shown the name and the file name, never a theme's own note or the address", JSON.stringify(shown) === JSON.stringify([["Name", "Ana"], ["Photo", "mug-photo.jpg"]]))
  }

  section("2. The signature: this store, this browser")
  {
    const visitor = sign.newCartVisitor()
    const other = sign.newCartVisitor()
    const h = sign.visitorHash(visitor)
    const id = "5f0b7c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f"
    const ref = sign.signRef(STORE_A, id, h)
    check("a cart id is 32 url-safe characters, kept only as its SHA-256", /^[A-Za-z0-9_-]{32}$/.test(visitor) && /^[0-9a-f]{64}$/.test(h))
    check("the ref checks for its store and browser", sign.verifyRef(ref, STORE_A, h) === id)
    check("store A's ref is refused on store B", sign.verifyRef(ref, STORE_B, h) === null)
    check("another browser's cart is refused", sign.verifyRef(ref, STORE_A, sign.visitorHash(other)) === null)
    const [rid, sig] = ref.split(".")
    const flip = (c: string) => (c === "a" ? "b" : "a")
    check("a changed signature is refused", sign.verifyRef(`${rid}.${flip(sig[0])}${sig.slice(1)}`, STORE_A, h) === null)
    check("a changed id is refused", sign.verifyRef(`${flip(rid[0])}${rid.slice(1)}.${sig}`, STORE_A, h) === null)
    check("no browser, no store: refused", sign.verifyRef(ref, STORE_A, null) === null && sign.verifyRef(ref, null, h) === null)
    check("the cookie is httpOnly, Secure, SameSite=Lax, this host only", /HttpOnly/.test(sign.cartVisitorCookie(visitor)) && /Secure/.test(sign.cartVisitorCookie(visitor)) && /SameSite=Lax/.test(sign.cartVisitorCookie(visitor)) && !/Domain=/i.test(sign.cartVisitorCookie(visitor)))
    check("the cart id is read from a Cookie header, a malformed one is not", sign.cartVisitorOf(`a=1; sl_cart_uid=${visitor}; b=2`) === visitor && sign.cartVisitorOf("sl_cart_uid=short") === null)
  }

  section("3. Only a picture, and drawn again")
  {
    const ok = await image.checkCartImage(file("mug.jpg", "image/jpeg", JPEG))
    check("a JPEG is taken and drawn again", ok.ok === true && (ok as { redrawn: boolean }).redrawn === true && (ok as { type: string }).type === "image/jpeg")
    const bytes = ok.ok === true ? (ok as { bytes: Uint8Array }).bytes : new Uint8Array()
    const asText = Buffer.from(bytes).toString("latin1")
    check("the EXIF went: no camera owner, no address, no metadata block", !asText.includes("SECRET-GPS") && !asText.includes("Home Street") && !hasImageMetadata(bytes), { had: Buffer.from(JPEG).toString("latin1").includes("SECRET-GPS") })
    const meta = await sharp(Buffer.from(bytes)).metadata()
    check("sharp reads no EXIF in what is kept", !meta.exif, { exif: !!meta.exif })
    check("its pixels are said", ok.ok === true && (ok as { width: number }).width === 64 && (ok as { height: number }).height === 48)
    const png = await image.checkCartImage(file("logo.png", "image/png", PNG))
    const webp = await image.checkCartImage(file("w.webp", "image/webp", WEBP))
    check("a PNG and a WebP are taken", png.ok === true && webp.ok === true)
    const renamed = await image.checkCartImage(file("photo.png", "image/png", JPEG))
    check("a JPEG named .png is kept as the JPEG it is", renamed.ok === true && (renamed as { type: string }).type === "image/jpeg")
    const code = async (name: string, type: string, b: Uint8Array, size?: number) => {
      const r = await image.checkCartImage(file(name, type, b, size))
      return r.ok === false ? (r as { code: string }).code : "accepted"
    }
    check("an HTML page renamed photo.jpg is refused", (await code("photo.jpg", "image/jpeg", HTML)) === "not_image")
    check("a program renamed photo.jpg is refused", (await code("photo.jpg", "image/jpeg", EXE)) === "not_image")
    check("an SVG is refused, as SVG and renamed", (await code("logo.svg", "image/svg+xml", SVG)) === "not_image" && (await code("logo.png", "image/png", SVG)) === "not_image")
    check("a PDF is refused", (await code("scan.jpg", "image/jpeg", PDF)) === "not_image")
    check("a GIF is refused (not printable as asked)", (await code("a.gif", "image/gif", GIF)) === "not_image")
    check("a HEIC is refused with its own words", (await code("IMG_0001.heic", "image/heic", HEIC)) === "heic" && rules.UPLOAD_ERRORS.heic.includes("JPEG"))
    check("an empty file is refused", (await code("empty.jpg", "image/jpeg", new Uint8Array(0))) === "empty")
    check("over 10 MB is refused before it is read", (await code("big.jpg", "image/jpeg", JPEG, 10 * 1024 * 1024 + 1)) === "too_large")
    check("over 12000 pixels a side is refused", (await code("huge.png", "image/png", HUGE)) === "too_big_dimensions")
    check("under 16 pixels a side is refused", (await code("tiny.png", "image/png", TINY)) === "too_small")
    const broken = JPEG.slice(0, 400)
    check("a JPEG cut short is refused (it cannot be drawn again)", (await code("cut.jpg", "image/jpeg", broken)) !== "accepted")
    /* No encoder here: the metadata is cut from the bytes instead. */
    const fallback = await image.checkCartImage(file("mug.jpg", "image/jpeg", JPEG), async () => null)
    check("without sharp the EXIF is still cut from the bytes", fallback.ok === true && !Buffer.from((fallback as { bytes: Uint8Array }).bytes).toString("latin1").includes("SECRET-GPS") && (fallback as { redrawn: boolean }).redrawn === false)
    const thrown = await image.checkCartImage(file("mug.jpg", "image/jpeg", JPEG), async () => {
      throw new Error("bad huffman")
    })
    check("a picture the encoder cannot decode is refused", thrown.ok === false)
  }

  section("4. Kept, and opened only by its own browser on its own store")
  const visitor = sign.newCartVisitor()
  const hash = sign.visitorHash(visitor)
  const w = world()
  const kept = await store.keepCartUpload(w as never, { creatorId: STORE_A, visitorHash: hash, file: file("Mug photo.jpg", "image/jpeg", JPEG) })
  const up = kept.ok === true ? (kept as { upload: { id: string; ref: string; value: string; name: string } }).upload : null
  {
    check("kept: a value, a row and a file", !!up && rules.isUploadValue(up.value) && (w.objects.size === 1) && (w as unknown as { log: { table: string; op: string }[] }).log.some((l) => l.table === "cart_uploads" && l.op === "insert"))
    const path = [...w.objects.keys()][0] ?? ""
    check("under cart/<store>/<browser>/<random id>, never the buyer's name", path.startsWith(`cart/${STORE_A}/${hash.slice(0, 32)}/`) && path.endsWith(".jpg") && !/mug/i.test(path))
    check("the stored bytes carry no EXIF", !Buffer.from(w.objects.get(path)!.bytes).toString("latin1").includes("SECRET-GPS"))
    check("the value names the file as the buyer called it", up?.name === "Mug-photo.jpg")
    const mine = await store.uploadForVisitor(w as never, { creatorId: STORE_A, visitorHash: hash, ref: up!.ref })
    const theirs = await store.uploadForVisitor(w as never, { creatorId: STORE_A, visitorHash: sign.visitorHash(sign.newCartVisitor()), ref: up!.ref })
    const elsewhere = await store.uploadForVisitor(w as never, { creatorId: STORE_B, visitorHash: hash, ref: up!.ref })
    check("this browser on this store finds it; another browser or store does not", !!mine && theirs === null && elsewhere === null)

    const get = (cookie: string | null, creatorId: string | null, ref = up!.ref) => http.openResponse(new Request(`https://shop-a.test/api/cart/uploads/${ref}/x.jpg`, { headers: cookie ? { cookie } : {} }), { db: w as never }, { creatorId, ref })
    const opened = await get(`sl_cart_uid=${visitor}`, STORE_A)
    check("the buyer is sent to a ten minute link", opened.status === 302 && /ttl=600$/.test(opened.headers.get("location") ?? "") && opened.headers.get("cache-control") === "private, no-store" && opened.headers.get("referrer-policy") === "no-referrer")
    check("another browser is told Not found", (await get(`sl_cart_uid=${sign.newCartVisitor()}`, STORE_A)).status === 404)
    check("no cookie is told Not found", (await get(null, STORE_A)).status === 404)
    check("store B's host is told Not found for store A's picture", (await get(`sl_cart_uid=${visitor}`, STORE_B)).status === 404)
    const [rid, sig] = up!.ref.split(".")
    check("a changed reference is told Not found", (await get(`sl_cart_uid=${visitor}`, STORE_A, `${rid}.${sig.slice(0, -1)}${sig.endsWith("a") ? "b" : "a"}`)).status === 404)

    const missing = world({}, { missing: true })
    const notYet = await store.keepCartUpload(missing as never, { creatorId: STORE_A, visitorHash: hash, file: file("a.jpg", "image/jpeg", JPEG) })
    check("before SQL part 308 the buyer is told plainly, nothing crashes", notYet.ok === false && (notYet as { status: number }).status === 503 && (notYet as { error: string }).error === rules.UPLOAD_ERRORS.not_ready)
  }

  section("4b. The upload request")
  {
    const w2 = world()
    const allow: typeof http.rateLimitUploads = async () => true
    const form = new FormData()
    form.append("file", new File([Buffer.from(PNG)], "logo.png", { type: "image/png" }))
    const res = await http.uploadResponse(new Request("https://shop-a.test/api/cart/uploads", { method: "POST", body: form }), { db: w2 as never, limit: allow }, { creatorId: STORE_A })
    const body = (await res.json()) as { upload?: { value: string; name: string; width: number } }
    const cookie = res.headers.get("set-cookie") ?? ""
    check("answered with the line's value, the name and the pixels", res.status === 200 && rules.isUploadValue(body.upload?.value) && body.upload?.name === "logo.png" && body.upload?.width === 40)
    check("a first upload gives the browser its cart id", /^sl_cart_uid=[A-Za-z0-9_-]{32};/.test(cookie) && /HttpOnly/.test(cookie))
    const minted = cookie.match(/sl_cart_uid=([^;]+)/)?.[1] ?? ""
    const ref = rules.readUploadValue(body.upload?.value)!.ref
    const opened = await http.openResponse(new Request("https://shop-a.test/x", { headers: { cookie: `sl_cart_uid=${minted}` } }), { db: w2 as never }, { creatorId: STORE_A, ref })
    check("that browser opens it", opened.status === 302)

    const six = new FormData()
    for (let i = 0; i < 6; i++) six.append(`properties[P${i}]`, new File([Buffer.from(PNG)], `p${i}.png`, { type: "image/png" }))
    const many = await http.uploadResponse(new Request("https://shop-a.test/api/cart/uploads", { method: "POST", body: six }), { db: w2 as never, limit: allow }, { creatorId: STORE_A })
    check("too many at once is refused", many.status === 400 && ((await many.json()) as { message: string }).message === rules.UPLOAD_ERRORS.too_many)

    const svgForm = new FormData()
    svgForm.append("file", new File([Buffer.from(SVG)], "cute.jpg", { type: "image/jpeg" }))
    const svg = await http.uploadResponse(new Request("https://shop-a.test/api/cart/uploads", { method: "POST", body: svgForm }), { db: w2 as never, limit: allow }, { creatorId: STORE_A })
    check("an SVG named .jpg is refused with the reason, nothing kept", svg.status === 400 && w2.objects.size === 1)

    let counted = 0
    const limited = await http.uploadResponse(new Request("https://shop-a.test/api/cart/uploads", { method: "POST", body: (() => { const f = new FormData(); f.append("file", new File([Buffer.from(PNG)], "a.png", { type: "image/png" })); return f })() }), { db: w2 as never, limit: async (_r, input) => { counted++; return !(input.creatorId === STORE_A && counted > 0) } }, { creatorId: STORE_A })
    check("over the browser's or the store's limit: 429, nothing kept", limited.status === 429 && w2.objects.size === 1)
    const noStore = await http.uploadResponse(new Request("https://storelib.test/api/cart/uploads", { method: "POST", body: form }), { db: w2 as never, limit: allow }, { creatorId: null })
    check("off a store's host: refused", noStore.status === 403)
    const json = await http.uploadResponse(new Request("https://shop-a.test/api/cart/uploads", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }), { db: w2 as never, limit: allow }, { creatorId: STORE_A })
    check("not a form: refused", json.status === 415)

    /* A theme's product form: properties[Name] text and properties[Photo] file in one multipart /cart/add. */
    const kept2 = await http.keepFormFiles(new Request("https://shop-a.test/cart/add", { headers: { cookie: `sl_cart_uid=${minted}` } }), { db: w2 as never, limit: allow }, { creatorId: STORE_A, entries: [["properties[Photo]", new File([Buffer.from(JPEG)], "me.jpg", { type: "image/jpeg" })], ["properties[Empty]", new File([], "", { type: "application/octet-stream" })]] })
    check("a product form's file becomes its property's value; an empty file input is nothing", kept2.ok === true && rules.isUploadValue((kept2 as { fields: Record<string, string> }).fields["properties[Photo]"]) && !("properties[Empty]" in (kept2 as { fields: Record<string, string> }).fields) && (kept2 as { cookie: string | null }).cookie === null)
  }

  section("5. Tenant isolation at checkout and on the order")
  {
    const items = [{ productId: "p1", variantId: null, quantity: 1, properties: { Name: "Ana", Photo: up!.value } }]
    const own = store.checkLineFiles(items, { creatorId: STORE_A, visitorHash: hash })
    check("a checkout takes its own browser's picture for its own store", own.ok === true && (own as { ids: string[] }).ids.length === 1)
    const otherStore = store.checkLineFiles(items, { creatorId: STORE_B, visitorHash: hash })
    check("store A's picture is refused at store B's checkout", otherStore.ok === false && (otherStore as { error: string }).error === rules.UPLOAD_ERRORS.stale)
    const otherCart = store.checkLineFiles(items, { creatorId: STORE_A, visitorHash: sign.visitorHash(sign.newCartVisitor()) })
    check("a value copied into another browser's cart is refused", otherCart.ok === false)
    check("a checkout off the website's host (no cart id) refuses a picture", store.checkLineFiles(items, { creatorId: STORE_A, visitorHash: null }).ok === false)
    check("words alone need nothing", store.checkLineFiles([{ properties: { Name: "Ana" } }], { creatorId: STORE_A, visitorHash: null }).ok === true)
    const src = read("lib/physical/checkout-server.ts")
    check("startCheckout asks it before pricing, and the website's checkout passes the browser's cart id", src.indexOf("checkLineFiles(input.items") > 0 && src.indexOf("checkLineFiles(input.items") < src.indexOf("const items = readItems(input.items)") && (read("app/api/checkout/site/route.ts").match(/cartVisitor: cartVisitorHashOf\(request\)/g) ?? []).length === 3)
  }

  section("6. The order keeps them")
  {
    const CHECKOUT = "33333333-3333-4333-8333-333333333333"
    const lines = [{ title: "Mug", properties: { Name: "Ana", Photo: up!.value } }]
    const ids = store.idsOfLines(lines)
    const a1 = await store.attachOrderFiles(w as never, { creatorId: STORE_A, checkoutId: CHECKOUT, ids })
    const orderPath = [...w.objects.keys()].find((k) => k.startsWith("orders/")) ?? ""
    check("paid: copied to orders/<store>/<checkout>/", a1.attached === 1 && orderPath.startsWith(`orders/${STORE_A}/${CHECKOUT}/`))
    const a2 = await store.attachOrderFiles(w as never, { creatorId: STORE_A, checkoutId: CHECKOUT, ids })
    check("asked again (webhook and page both), left as it is", a2.attached === 0 && a2.failed === 0)
    /* The cart is long gone: its copy removed. The order's stays. */
    for (const k of [...w.objects.keys()]) if (k.startsWith("cart/")) w.objects.delete(k)
    const mineA = await store.orderFiles(w as never, { creatorId: STORE_A, ids, seconds: rules.CREATOR_LINK_SECONDS })
    const f = mineA.get(rules.readUploadValue(up!.value)!.id)
    check("after the cart expired, the store opens it from the order's copy, an hour's link and a download", !!f?.url && f.url.includes("/orders/") && /ttl=3600/.test(f.url) && w.signed.some((s) => s.download === "Mug-photo.jpg"))
    const mineB = await store.orderFiles(w as never, { creatorId: STORE_B, ids, seconds: 3600 })
    check("store B, given store A's ids, sees nothing", mineB.size === 0)
    const byLine = store.filesOfLine(lines[0].properties, mineA)
    check("each line's pictures by the property they came under", byLine.length === 1 && byLine[0].property === "Photo")
    const src = read("lib/physical/checkout-server.ts")
    check("completeCheckout copies them when paid; loadOrder signs only this store's", /attachOrderFiles\(db as never, \{ creatorId: co\.creator_id, checkoutId: c\.checkoutId/.test(src) && /orderFiles\(db as never, \{ creatorId: co\.creator_id/.test(read("lib/physical/orders-server.ts")))
  }

  section("6b. The sweep removes only what no paid order took")
  {
    const old = new Date(Date.now() - 20 * 86_400_000).toISOString()
    const fresh = new Date(Date.now() - 2 * 86_400_000).toISOString()
    const row = (id: string, extra: Record<string, unknown>) => ({ id, creator_id: STORE_A, visitor_hash: hash, file_name: `${id.slice(0, 4)}.jpg`, content_type: "image/jpeg", bytes: 10, width: 20, height: 20, cart_path: `cart/${STORE_A}/x/${id.replace(/-/g, "")}.jpg`, order_path: null, checkout_id: null, created_at: old, attached_at: null, ...extra })
    const ids = ["a0000000-0000-4000-8000-000000000001", "a0000000-0000-4000-8000-000000000002", "a0000000-0000-4000-8000-000000000003", "a0000000-0000-4000-8000-000000000004", "a0000000-0000-4000-8000-000000000005"]
    const PAID = "c0000000-0000-4000-8000-000000000001"
    const PENDING = "c0000000-0000-4000-8000-000000000002"
    const sw = world({
      cart_uploads: [
        row(ids[0], {}),
        row(ids[1], { checkout_id: PENDING }),
        row(ids[2], { checkout_id: PAID }),
        row(ids[3], { created_at: fresh }),
        row(ids[4], { attached_at: old, order_path: `orders/${STORE_A}/${PAID}/x.jpg` }),
      ],
      commerce_checkouts: [{ id: PAID, status: "paid", creator_id: STORE_A }, { id: PENDING, status: "expired", creator_id: STORE_A }],
    })
    for (const id of ids) sw.objects.set(`cart/${STORE_A}/x/${id.replace(/-/g, "")}.jpg`, { bytes: new Uint8Array([1]), contentType: "image/jpeg" })
    sw.objects.set(`orders/${STORE_A}/${PAID}/x.jpg`, { bytes: new Uint8Array([1]), contentType: "image/jpeg" })
    const dry = await store.sweepCartUploads(sw as never, { dryRun: true })
    check("a dry run removes nothing", dry.removed === 2 && sw.objects.size === 6)
    const out = await store.sweepCartUploads(sw as never)
    const left = (await sw.from("cart_uploads").select("id")).data as { id: string }[]
    const leftIds = new Set(left.map((r) => r.id))
    check("an old upload no checkout took, and one at an unpaid checkout, are removed with their files", out.removed === 2 && !leftIds.has(ids[0]) && !leftIds.has(ids[1]) && !sw.objects.has(`cart/${STORE_A}/x/${ids[0].replace(/-/g, "")}.jpg`))
    check("a paid order's picture never copied is copied now, not removed", leftIds.has(ids[2]) && out.attached === 1 && [...sw.objects.keys()].some((k) => k.startsWith(`orders/${STORE_A}/${PAID}/${ids[2].replace(/-/g, "")}`)))
    check("a recent upload and an order's own picture are left alone", leftIds.has(ids[3]) && leftIds.has(ids[4]) && sw.objects.has(`orders/${STORE_A}/${PAID}/x.jpg`))
    check("the daily storage cleanup runs it", /sweepCartUploads\(createAdminClient\(\)/.test(read("app/api/cron/storage-cleanup/route.ts")))
  }

  section("7. Where the words and pictures show")
  {
    const value = up!.value
    const { orderConfirmationEmail } = await import("@/lib/physical/email-templates")
    const { buyerProperties } = await import("@/lib/physical/cart-link")
    const mail = orderConfirmationEmail({
      shopName: "Shop A",
      orderNumber: "#1001",
      buyerFirstName: "Ana",
      lines: [{ title: "Mug", variantName: null, quantity: 1, cents: 1500, imageUrl: null, properties: buyerProperties({ Name: "Ana", Photo: value, _sl_group: "g" }) }],
      totals: { subtotal: 1500, discount: 0, shipping: 0, shippingDiscount: 0, tax: 0, total: 1500, currency: "USD" } as never,
      address: null,
      deliveryName: null,
      deliveryEstimate: null,
      statusUrl: "https://shop-a.test/order",
      hasDownloads: false,
    })
    check("the confirmation email says the words and the file name, in HTML and text", mail.html.includes("Name: Ana") && mail.html.includes("Photo: Mug-photo.jpg") && mail.text.includes("Photo: Mug-photo.jpg"))
    check("never the address or a theme's own note", !mail.html.includes("/api/cart/uploads") && !mail.html.includes("_sl_group") && !mail.text.includes("/api/cart/uploads"))
    const { slipLines } = await import("@/lib/physical/packing-slip")
    const slip = slipLines({ lines: [{ orderId: "o1", title: "Mug", variantName: null, sku: null, imageUrl: null, quantity: 1, fulfilled: 0, requiresShipping: true, locationId: null, properties: { Name: "Ana", Photo: value } }], shipments: [] } as never)
    check("the packing slip says the file name", JSON.stringify(slip[0]?.properties) === JSON.stringify([["Name", "Ana"], ["Photo", "Mug-photo.jpg"]]))
    check("the orders export and the seller's email say the file name", /propertyText\(v\)/.test(read("app/api/physical/orders/export/route.ts")) && /propertyText\(str\(v, 250\)\)/.test(read("lib/notify/seller-commerce.ts")))
    check("the order page shows each picture with Download; the receipt and the checkout show it small", /data-order-line-files/.test(read("components/physical/order-panel.tsx")) && /data-line-files/.test(read("app/checkout/physical/order/[token]/order-status-view.tsx")) && /readUploadValue\(v\)/.test(read("app/checkout/site/site-checkout.tsx")))
  }

  section("7b. Print partners (a stub of each)")
  {
    const fw = await import("@/lib/integrations/fulfilment/forward-server")
    const { gelatoOrderBody, gelatoMetadata } = await import("@/lib/integrations/fulfilment/gelato")
    const { printfulItemName } = await import("@/lib/integrations/fulfilment/printful")
    const fileId = rules.readUploadValue(up!.value)!.id
    const order = {
      id: "33333333-3333-4333-8333-333333333333",
      status: "paid",
      cancelledAt: null,
      buyerEmail: "ana@example.test",
      buyerName: "Ana",
      buyerPhone: null,
      address: { name: "Ana", line1: "1 Road", line2: null, city: "Town", region: null, postalCode: "1000", country: "US" },
      lines: [{ orderId: "44444444-4444-4444-8444-444444444444", variantId: "v1", title: "Mug", variantName: null, sku: "MUG-1", quantity: 1, fulfilled: 0, requiresShipping: true, locationId: "loc", properties: { Name: "Ana", Photo: up!.value, _sl_offer_id: "o" } }],
    }
    const files = new Map([[fileId, { name: "Mug-photo.jpg", url: "https://storage.test/sign/orders/x.jpg?ttl=604800" }]])
    const input = fw.providerOrderFor(order as never, "loc", true, null, files) as { lines: { personalization?: { name: string; value: string }[]; printFiles?: { name: string; url: string }[] }[]; autoConfirm: boolean }
    check("the partner is given the words (never a theme's own) and the picture by a seven day link", JSON.stringify(input.lines[0].personalization) === JSON.stringify([{ name: "Name", value: "Ana" }]) && input.lines[0].printFiles?.[0]?.url.includes("ttl=604800") === true)
    check("a personalised order goes as a draft for the seller to check", input.autoConfirm === false)
    const plain = fw.providerOrderFor({ ...order, lines: [{ ...order.lines[0], properties: { _sl_offer_id: "o" } }] } as never, "loc", true, null, null) as { autoConfirm: boolean; lines: { personalization?: unknown }[] }
    check("an order with nothing personal is confirmed as the seller set", plain.autoConfirm === true && plain.lines[0].personalization === undefined)
    const noLink = fw.personalizationOf({ Photo: up!.value }, new Map())
    check("a picture with no link (another store's, unsigned) is left out, never guessed", noLink.files.length === 0)
    check("Printful: the words in the item's name, at most 120", printfulItemName("Mug", [{ name: "Name", value: "Ana" }]) === "Mug · Name: Ana" && printfulItemName("M", [{ name: "N", value: "x".repeat(300) }]).length === 120)
    const gl = { ...input, externalId: "sl_1", label: "#1001", address: { name: "Ana", line1: "1 Road", line2: null, city: "Town", region: null, postalCode: "1000", country: "US", phone: null, email: null } }
    const body = gelatoOrderBody({ key: "k", config: {} }, { ...gl, lines: [{ ...gl.lines[0], sku: "MUG-1", quantity: 1, title: "Mug", lineId: "l1", link: { providerVariantId: "canvas_300x450-mm-12x18-inch_canvas_wood-fsc-slim_4-0_ver", fileUrl: null } }] } as never) as { items: { files: { url: string }[] }[] }
    check("Gelato: matched without a file of its own, the buyer's picture is the print file", body.items[0].files[0].url === "https://storage.test/sign/orders/x.jpg?ttl=604800")
    const meta = gelatoMetadata({ ...gl, lines: [{ ...gl.lines[0], sku: "MUG-1", quantity: 1, title: "Mug", lineId: "l1" }] } as never)
    check("Gelato: the words in the order's metadata", meta.some((m) => m.key === "1 Name" && m.value === "Ana") && meta.length <= 20)

    /* The forwarding job end to end, against a stub partner: what it was sent. */
    const sent: unknown[] = []
    fw.CONNECTORS.stub_partner = { id: "printful", name: "Stub", connect: async () => ({ config: {}, account: null }), submit: async (_c: unknown, o: unknown) => { sent.push(o); return { providerOrderId: "9", stage: "draft" as const } }, fetchOrder: async () => ({ providerOrderId: "9", externalId: null, stage: "draft" as const, problem: null, shipments: [] }), registerWebhooks: async () => ({ ok: true, note: null }), removeWebhooks: async () => undefined, cancel: async () => ({ cancelled: true, note: null }) } as never
    const { sealSecret } = await import("@/lib/physical/secrets")
    const INTEGRATION = "55555555-5555-4555-8555-555555555555"
    let sealed: string
    try {
      sealed = sealSecret("key")
    } catch {
      sealed = ""
    }
    const fdb = fakeDb({ commerce_integrations: [{ id: INTEGRATION, creator_id: STORE_A, provider: "stub_partner", status: "connected", config: {}, secret: sealed, secret_ciphertext: sealed }], commerce_order_events: [] })
    const events: string[] = []
    let askedFiles: string[] = []
    await fw.forwardToProvider(fdb, { checkoutId: order.id, locationId: "loc", integrationId: INTEGRATION, creatorId: STORE_A }, {
      loadOrder: async () => order as never,
      partnerShipped: async () => ({ ok: true }),
      addOrderEvent: async (_db, e) => { events.push(e.message) },
      now: () => Date.now(),
      printFiles: async (_db, input) => { askedFiles = input.ids; return files },
    })
    const got = sent[0] as { lines: { personalization?: unknown; printFiles?: unknown }[]; autoConfirm: boolean } | undefined
    check("the job asks for this store's pictures by id and sends them on", sealed !== "" && (askedFiles.length === 1 && askedFiles[0] === fileId && !!got?.lines[0].printFiles && got.autoConfirm === false), { askedFiles, events, sent: sent.length })
  }

  section("8. The Storelib theme's Personalization block, and the website's cart")
  {
    const theme = JSON.parse(read("themes/default/sections/product.json")) as { blocks: { type: string; name: string; fields: { id: string }[] }[] }
    const block = theme.blocks.find((b) => b.type === "personalization")
    check("the product section has a Personalization block: kind, labels, required, longest text", !!block && ["kind", "label", "upload_label", "required", "max_length", "placeholder"].every((id) => block!.fields.some((f) => f.id === id)))
    /* Changed on purpose (round 13): one Personalization block, which draws its own asks (PersonalizationBlock) or, set to The product's fields, the product's own. */
    check("it is drawn by the product section", /personalization: Personalization,/.test(read("components/website-builder/sections/renderers/product/product-blocks.tsx")) && /if \(s\.kind !== "product"\) return <PersonalizationBlock s=\{s\} ctx=\{ctx\} \/>/.test(read("components/website-builder/sections/renderers/product/product-blocks.tsx")))
    const pz = await import("@/lib/website-builder/personalization")
    const fields = pz.personalizationFields([
      { id: "b1", type: "personalization", settings: { kind: "text_and_image", label: "Name", upload_label: "Photo", required: true, max_length: 5 } },
      { id: "b2", type: "personalization", hidden: true, settings: { label: "Hidden" } },
      { id: "b3", type: "personalization", settings: { kind: "text", label: "_secret" } },
    ])
    check("hidden blocks ask nothing; a label is never a hidden name", fields.length === 2 && fields[1].label === "secret")
    check("a required field says what is missing", pz.personalizationProperties(fields, {}).missing === "Enter Name" && pz.personalizationProperties(fields, { "b1:text": "Ana" }).missing === "Add photo")
    const done = pz.personalizationProperties(fields, { "b1:text": "  Anastasia  ", "b1:image": up!.value })
    check("the words are trimmed and held to the block's length; the picture is its value", done.missing === null && done.properties?.Name === "Anast" && done.properties?.Photo === up!.value)
    check("a picture that is not an upload's value is not taken", pz.personalizationProperties(fields, { "b1:text": "A", "b1:image": "https://evil.test/x.jpg" }).missing === "Add photo")
    const cart = await import("@/lib/website-builder/cart")
    const base = { productId: "p1", variantId: null, title: "Mug", variantName: null, priceCents: 1500, thumbnailUrl: null, slug: "mug", digital: false, physical: true, quantity: 1 }
    let lines = cart.addLine([], { ...base, properties: { Name: "Ana" } })
    lines = cart.addLine(lines, { ...base, properties: { Name: "Bo" } })
    lines = cart.addLine(lines, { ...base, properties: { Name: "Ana" } })
    check("the same product with other words is another line; the same words add up", lines.length === 2 && lines[0].quantity === 2)
    check("a line without words keeps its old key", cart.lineKey(base) === "p1::")
    const parsed = cart.parseCart(JSON.stringify([...lines, { ...base, properties: { ["x".repeat(100)]: "y", Bad: { nested: 1 } } }]))
    check("the browser's stored cart keeps the words, held to the order's rule", parsed.length === 3 && parsed[0].properties?.Name === "Ana" && Object.keys(parsed[2].properties ?? {}).every((k) => k.length <= 64))
    check("checkout is sent the words with the line", JSON.stringify(cart.checkoutItems(lines)[1].properties) === JSON.stringify({ Name: "Bo" }))
  }

  section("9. An imported theme's form fields")
  {
    const { formFields } = await import("@/lib/storelib-theme/compat/form-fields")
    const fd = new FormData()
    fd.append("id", "123")
    fd.append("properties[Engraving]", "For Ana")
    fd.append("properties[Photo]", new File([Buffer.from(PNG)], "a.png", { type: "image/png" }))
    const fields = formFields(fd.entries())
    check("a multipart form's words are kept by name; its files are left for the upload step", fields["properties[Engraving]"] === "For Ana" && !("properties[Photo]" in fields))
    const route = read("app/api/site-theme/site/[username]/[[...path]]/route.ts")
    check("/cart/add keeps each file as an upload and puts its value in its place; /cart/upload answers a theme's script", /keepFormFiles\(req/.test(route) && /fields = \{ \.\.\.\(fields \?\? \{\}\), \.\.\.kept\.fields \}/.test(route) && /\\\/cart\\\/upload\(\?:\\\.js\|\\\.json\)\?\$/.test(route))
    check("neither on a preview or a stranger's page, and only from the website's own page", /if \(token \|\| stranger \|\| !sameOriginForm\(req, hostOf\(req\)\)\)/.test(route) && /!token && !stranger\) \{/.test(route))
  }

  section("10. SQL part 308")
  {
    const sql = read("supabase/sql/run-now/308_cart_uploads.sql")
    check("a private bucket, row level security on, nothing for anon or signed in users", /'cart-uploads', 'cart-uploads', false/.test(sql) && /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON public\.cart_uploads FROM PUBLIC, anon, authenticated/.test(sql) && !/CREATE POLICY/i.test(sql))
    check("new things only: nothing dropped, safe to run again", !/\bDROP\b|\bTRUNCATE\b|\bDELETE FROM\b|\bALTER TABLE public\.(?!cart_uploads)/i.test(sql) && /CREATE TABLE IF NOT EXISTS/.test(sql) && /ON CONFLICT \(id\) DO UPDATE/.test(sql))
    check("the same as the migration, listed in the README, checked last in 99", read("supabase/migrations/20270201_ag3_cart_uploads.sql") === sql && read("supabase/sql/run-now/README.md").includes("`308_cart_uploads.sql`") && read("supabase/sql/run-now/99_check_after.sql").trim().endsWith("as p308_cart_uploads;"))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
