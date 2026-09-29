/**
 * ===========================================================================
 *  THE LIBRARY AND ITS DOWNLOADS, DRIVEN
 * ===========================================================================
 * "Make sure that on iOS Capacitor and Android downloads actually download
 * and save, because sometimes they don't. Fix it completely."
 *
 * Two halves, both run rather than read:
 *
 *   THE LIBRARY    lib/library/library-view.ts assembles what a buyer sees
 *                  from what they own, their orders and their reviews: which
 *                  files they may press (their option's, none on a refund),
 *                  whether a review would be taken, who each seller is and
 *                  how to reach them, and one receipt per payment.
 *
 *   THE DOWNLOAD   lib/downloads/download-file.ts in the phone app, with the
 *                  Capacitor bridge stood in: Android's own downloader,
 *                  iOS's own downloader, an older iPhone holding a small file
 *                  for Save to Files, a big file never read into the page,
 *                  and the system browser as the last resort.
 *
 * Run with:  npm run test:push
 */
import { assembleLibrary, creatorKey, receiptsOf, visibleItems, type LibraryExtras } from "../lib/library/library-view"
import type { DownloadRow } from "../lib/library/get-library-downloads"
import { downloadJob, downloadJobs, removeJob } from "../lib/downloads/download-store"
import { IN_PAGE_LIMIT, TooLargeForPage, readIntoFile } from "../lib/downloads/native"
import { openTarget, appLink, phoneOf, bannerPhone } from "../lib/platform/open-in-app"
import { actionOf, entryOf, priceOf } from "../components/wishlist/wishlist-entry"
import { cleanPath, isLibraryProduct, showsLibraryTabs } from "../components/library/library-tab-list"
import { readFileSync } from "node:fs"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}

/* ─── Fixtures ─────────────────────────────────────────────────────────── */

const row = (over: Partial<DownloadRow>): DownloadRow => ({
  id: "e",
  productId: "p",
  title: "Product",
  thumbnailUrl: null,
  creatorName: "Dee",
  createdAt: "2026-03-01T10:00:00Z",
  purchasedAtLabel: "",
  files: [],
  creatorId: "c1",
  creatorSlug: "dee",
  creatorAvatarUrl: null,
  productSlug: "product",
  productStatus: "published",
  ...over,
})

function libraryCases() {
  console.log("\nThe library")

  const downloads: DownloadRow[] = [
    row({ productId: "pack", title: "Preset pack", createdAt: "2026-03-05T10:00:00Z", files: [{ id: "a1", fileName: "Lite.zip", sizeBytes: 10 }, { id: "a2", fileName: "Pro.zip", sizeBytes: 20 }] }),
    row({ productId: "guide", title: "Guide", createdAt: "2026-02-01T10:00:00Z", files: [{ id: "g1", fileName: "guide.pdf", sizeBytes: 5 }] }),
    row({ productId: "gone", title: "Refunded thing", createdAt: "2026-01-01T10:00:00Z", files: [{ id: "r1", fileName: "r.pdf", sizeBytes: 5 }] }),
    row({ productId: "mine", title: "My own product", creatorId: "me", creatorName: "Me", creatorSlug: "me", files: [{ id: "m1", fileName: "m.pdf", sizeBytes: 1 }] }),
    row({ productId: "gift", title: "A gift", creatorId: "c2", creatorName: "Ana", creatorSlug: "ana", productStatus: "archived", files: [{ id: "x1", fileName: "x.pdf", sizeBytes: 1 }] }),
  ]
  const extras: LibraryExtras = {
    ownCreatorId: "me",
    variantFiles: new Map([["lite", ["a1"]]]),
    creators: [
      { id: "c1", name: "Dee", slug: "dee", avatarUrl: null, supportEmail: "help@dee.shop" },
      { id: "c2", name: "Ana", slug: "ana", avatarUrl: null, supportEmail: null },
    ],
    orders: [
      { id: "o-pack", product_id: "pack", created_at: "2026-03-05T10:00:00Z", status: "completed", amount_cents: 1200, receipt_token: "tok_pack_000000000001", variant_id: "lite", stripe_session_id: "cs_1", stripe_payment_intent_id: "pi_1", currency: "usd", product: { title: "Preset pack", creator_id: "c1" } },
      { id: "o-guide", product_id: "guide", created_at: "2026-02-01T10:00:00Z", status: "completed", amount_cents: 800, receipt_token: "tok_guide_00000000001", stripe_session_id: "cs_1", stripe_payment_intent_id: "pi_1", currency: "usd", product: { title: "Guide", creator_id: "c1" } },
      { id: "o-gone", product_id: "gone", created_at: "2026-01-01T10:00:00Z", status: "refunded", amount_cents: 500, refund_amount_cents: 500, receipt_token: "tok_gone_000000000001", currency: "usd", product: { title: "Refunded thing", creator_id: "c1" } },
      { id: "o-free", product_id: "mine", created_at: "2026-01-02T10:00:00Z", status: "completed", amount_cents: 0, receipt_token: "tok_mine_000000000001", currency: "usd", product: { title: "My own product", creator_id: "me" } },
    ],
    /* The guide was reviewed from its receipt link, before an account: found by its order. */
    reviews: [{ id: "rv1", product_id: "guide", order_id: "o-guide", rating: 4, content: "Clear and short.", created_at: "2026-02-10T00:00:00Z", seller_reply: "Thanks!" }],
  }

  const { items, creators, receipts } = assembleLibrary(downloads, extras)
  const by = (id: string) => items.find((i) => i.productId === id)!

  check("every owned product is listed", items.length === 5, items.map((i) => i.productId))
  check("the option bought decides the files: Lite only", by("pack").files.map((f) => f.id).join() === "a1", by("pack").files)
  check("a refunded purchase keeps its row and has no file to press", by("gone").state === "refunded" && by("gone").files.length === 0)
  check("a gift with no order keeps all its files", by("gift").files.length === 1 && by("gift").state === "open")
  check("an archived product is still theirs, and says so", by("gift").archived === true)
  check("the receipt a row links to is its newest paid order's", by("pack").receiptToken === "tok_pack_000000000001")

  check("a review written on one of their orders is theirs", by("guide").review?.rating === 4 && by("guide").review?.sellerReply === "Thanks!")
  check("a reviewed product is not offered another review", by("guide").canReview === false)
  check("an unreviewed one is", by("pack").canReview === true)
  check("a refunded one is not", by("gone").canReview === false)
  check("nor the buyer's own product", by("mine").canReview === false)
  check("the seller of their own product still gets its files", by("mine").files.length === 1)

  check("sellers are grouped, most bought first", creators[0].name === "Dee" && creators[0].count === 3, creators.map((c) => [c.name, c.count]))
  check("a seller's chosen address is how they are written to", creators[0].supportEmail === "help@dee.shop")
  const ana = creators.find((c) => c.name === "Ana")!
  check("a seller with no address and no receipt has no contact", ana.supportEmail === null && ana.contactReceiptToken === null)

  check("one receipt per payment: two lines of one checkout are one receipt", receipts.length === 3 && receipts.some((r) => r.lines.length === 2), receipts.map((r) => r.lines.length))
  const basket = receipts.find((r) => r.lines.length === 2)!
  check("its total is the payment's", basket.totalCents === 2000 && basket.currency === "usd")
  check("a card payment has an invoice", basket.invoice === true)
  const refunded = receipts.find((r) => r.lines[0].productId === "gone")!
  check("a refunded one says so and has none", refunded.state === "refunded" && refunded.refundedCents === 500 && refunded.invoice === false)
  check("a free claim has no invoice", receipts.find((r) => r.lines[0].productId === "mine")!.invoice === false)
  check("newest receipt first", receipts[0].createdAt >= receipts[1].createdAt && receipts[1].createdAt >= receipts[2].createdAt)
  check("receipts can be read from orders alone (the Receipts tab)", receiptsOf(extras).length === 3)

  console.log("\nSearch, seller and order")
  check("search finds a product by name", visibleItems(items, { query: "preset", sort: "recent", creator: null }).map((i) => i.productId).join() === "pack")
  check("and by a file's name", visibleItems(items, { query: "guide.pdf", sort: "recent", creator: null }).map((i) => i.productId).join() === "guide")
  check("one seller at a time", visibleItems(items, { query: "", sort: "recent", creator: creatorKey({ id: "c2", name: "Ana" }) }).map((i) => i.productId).join() === "gift")
  const oldest = visibleItems(items, { query: "", sort: "oldest", creator: null })
  check("oldest first", oldest[0].purchasedAt <= oldest[oldest.length - 1].purchasedAt)
  check("by name", visibleItems(items, { query: "", sort: "title", creator: null })[0].title === "A gift")
  check("the list passed in is never reordered", items[0].productId === "pack")
}

function openInAppCases() {
  console.log("\nOpen in app")
  check("an iPhone and an Android phone are phones; an iPad and a computer are not",
    phoneOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)") === "ios" && phoneOf("Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile") === "android" && phoneOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)") === null)
  const ios = appLink("ios", "/library/products/abc")
  check("the iPhone link is the app's own scheme, carrying the page", ios === "com.storelib.app://open?path=%2Flibrary%2Fproducts%2Fabc", ios)
  check("and the app goes to exactly that page", openTarget(ios) === "/library/products/abc")
  check("Android opens the installed app, with the Play Store as fallback", /^intent:#Intent;action=android\.intent\.action\.MAIN;/.test(appLink("android", "/library")) && /package=com\.storelib\.app/.test(appLink("android", "/library")) && /S\.browser_fallback_url=https%3A%2F%2Fplay\.google\.com/.test(appLink("android", "/library")))
  check("another site's address is never followed", openTarget("com.storelib.app://open?path=%2F%2Fevil.com") === null && openTarget("storelib://open?path=https://evil.com") === null)
  check("and an OAuth callback is left to its own handler", openTarget("com.storelib.app://auth/callback?code=1") === null)
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"
  check("the banner is decided on the server: a phone's browser gets it", bannerPhone(IPHONE, undefined) === "ios" && bannerPhone("Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile Safari", null) === "android")
  check("never inside the app, never on a computer, never once closed",
    bannerPhone(IPHONE + " Capacitor", undefined) === null && bannerPhone("Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) Mobile", undefined) === null &&
      bannerPhone("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", undefined) === null && bannerPhone(IPHONE, "closed") === null)
}

/* ─── The wishlist's cards (read, not drawn) ──────────────────────────── */

function wishlistCases() {
  console.log("\nthe wishlist")
  const row = (p: Record<string, unknown>) => ({ id: "w1", product_id: String(p.id), created_at: "2026-09-20T10:00:00Z", products: { title: "LUTs", slug: "luts", type: "digital", price_cents: 2900, compare_at_cents: null, thumbnail_url: null, creators: { slug: "maya" }, creator_profile: { display_name: "Maya Chen", username: "mayachen", avatar_url: "https://x/a.png" }, ...p } })
  const sale = entryOf(row({ id: "q1", compare_at_cents: 3900 }))!
  const price = priceOf(sale)
  check("on sale: the price, the old one struck, the saving", price.main === "$29.00" && price.was === "$39.00" && price.sale === "26% off" && price.per === null, JSON.stringify(price))
  check("with the seller's name and face", sale.creator.name === "Maya Chen" && sale.creator.avatarUrl === "https://x/a.png" && sale.creator.username === "mayachen")
  check("Buy goes straight to checkout", actionOf(sale).label === "Buy" && actionOf(sale).href === "/checkout?productId=q1")
  const member = entryOf(row({ id: "q2", type: "membership", price_cents: 900 }), { plan: { monthly_price_cents: 900, yearly_price_cents: 9000 } })!
  const yearly = entryOf(row({ id: "q3", type: "membership", price_cents: 9000 }), { plan: { monthly_price_cents: null, yearly_price_cents: 9000 } })!
  const guess = entryOf(row({ id: "q4", type: "membership", price_cents: 500 }))!
  check("a membership says what its price is per, through listPrice", priceOf(member).main === "$9.00" && priceOf(member).per === "/month" && priceOf(yearly).per === "/year" && priceOf(yearly).main === "$90.00" && priceOf(guess).per === "/month")
  check("and Join goes to its checkout at that period", actionOf(member).label === "Join" && actionOf(member).href === "/checkout?productId=q2&interval=month" && actionOf(yearly).href === "/checkout?productId=q3&interval=year")
  const pwyw = entryOf(row({ id: "q5", pay_what_you_want: true, pwyw_min_price_cents: 500, price_cents: 500 }))!
  check("pay what you want: from its minimum, and View to choose on the page", priceOf(pwyw).main === "$5.00+" && actionOf(pwyw).label === "View" && actionOf(pwyw).kind === "page")
  check("options are chosen on the page too", actionOf(entryOf(row({ id: "q6" }), { hasOptions: true })!).kind === "page")
  const free = entryOf(row({ id: "q7", price_cents: 0 }))!
  check("free: Get it free", priceOf(free).main === "Free" && actionOf(free).label === "Get it free")
  const owned = entryOf(row({ id: "q8" }), { owned: true })!
  check("already theirs: In your library, to that purchase", actionOf(owned).label === "In your library" && actionOf(owned).href === "/library/products/q8")
  check("a row with no product left is dropped", entryOf({ id: "w9", product_id: "gone", created_at: "", products: null }) === null)
  const content = read("components/wishlist/wishlist-content.tsx")
  check("the heart is 44px to press, filled, and takes it off with Undo",
    /h-11 w-11/.test(content) && /fill-\[#f43f5e\]/.test(content) && /data-wishlist-undo-button/.test(content) && /method: "DELETE"/.test(content) && /method: "POST"/.test(content))
  check("the small buttons go through cn(), so they really are 36px", /cn\(PRIMARY, SMALL/.test(content) && !/\$\{PRIMARY\} \$\{SMALL\}/.test(content))
  /*
    STILL READ ON THE SERVER, BUT NOT IN FRONT OF THE PAGE. The read was
    awaited before the page returned anything, so the route could not commit
    until the saved rows, the sellers' faces, the plans, the options and
    what is already owned had all come back, and the library's stage held
    its shape over the screen for the whole of it ("it shows after like 10
    seconds"). It is inside a Suspense boundary now, as the account
    overview is: the tab commits as soon as it knows who is asking.
  */
  const wishPage = read("app/library/wishlist/page.tsx")
  check("the library's tab reads the list on the server", /loadWishlist\(userId\)/.test(wishPage) && /initialItems=\{await loadWishlist\(userId\)\}/.test(wishPage))
  check("  and streams it, so the tab is on screen before the cards are", /<Suspense$/m.test(wishPage) && /\{savedBody\(user\.id\)\}/.test(wishPage) && /LibraryRouteSkeleton path="\/library\/wishlist"/.test(wishPage))
  /* A second full read of the list only for the one failure another query can fix. */
  const wishLoad = read("app/library/wishlist/load-wishlist.ts")
  check("  and a slow first read is not paid for twice", /if \(error && missingPwywColumn\(error\)\)/.test(wishLoad) && /error\.code === "42703"/.test(wishLoad))
  check("and never imports server code into the browser", !/load-wishlist|next\/headers|server-only/.test(content) && !/next\/headers|server-only/.test(read("components/wishlist/wishlist-entry.ts")))
}

function read(f: string) {
  return readFileSync(f, "utf8")
}

/* ─── The phone app, stood in ─────────────────────────────────────────── */

type Win = EventTarget & Record<string, any>
const opened: string[] = []

function installWindow(platform: "ios" | "android", extra: Record<string, unknown> = {}) {
  const win = new EventTarget() as Win
  win.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform }
  win.location = { href: "https://storelib.com/library", origin: "https://storelib.com", assign: (u: string) => opened.push(u) }
  win.open = (u: string) => {
    opened.push(u)
    return null
  }
  win.setInterval = setInterval
  win.clearInterval = clearInterval
  win.setTimeout = setTimeout
  win.clearTimeout = clearTimeout
  Object.assign(win, extra)
  ;(globalThis as any).window = win
  return win
}

const SIGNED = "https://project.supabase.co/storage/v1/object/sign/digital-products/f.pdf?token=t"
let storageReads = 0

function installFetch(apiBody: Record<string, unknown>, apiStatus = 200, fileBytes = 3 * 64 * 1024, withLength = true) {
  storageReads = 0
  ;(globalThis as any).fetch = async (input: string) => {
    if (String(input).startsWith("/api/download/")) {
      return new Response(JSON.stringify(apiBody), { status: apiStatus, headers: { "content-type": "application/json" } })
    }
    storageReads++
    const chunk = new Uint8Array(64 * 1024)
    let sent = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= fileBytes) return controller.close()
        const n = Math.min(chunk.byteLength, fileBytes - sent)
        sent += n
        controller.enqueue(chunk.subarray(0, n))
      },
    })
    return new Response(body, { status: 200, headers: withLength ? { "content-length": String(fileBytes), "content-type": "application/pdf" } : {} })
  }
}

function setShare(can: boolean) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      userAgent: "Mozilla/5.0 (iPhone) Capacitor",
      share: can ? async () => {} : undefined,
      canShare: can ? (d: { files?: File[] }) => Array.isArray(d.files) : undefined,
    },
  })
}

const ok = (fileSize: number | null = 3 * 64 * 1024) => ({ success: true, downloadUrl: SIGNED, fileName: "Guide.pdf", fileSize, mimeType: "application/pdf" })

async function appCases() {
  const { downloadFile } = await import("../lib/downloads/download-file")

  console.log("\nAndroid, with the app's own downloader (MainActivity StorelibNative.download)")
  {
    const calls: unknown[][] = []
    const states = ['{"state":"pending","loaded":0,"total":0}', '{"state":"running","loaded":1000,"total":4000}', '{"state":"running","loaded":3000,"total":4000}', '{"state":"done","loaded":4000,"total":4000}']
    let i = 0
    const seen: number[] = []
    installWindow("android", {
      StorelibNative: {
        download: (...a: unknown[]) => {
          calls.push(a)
          return "42"
        },
        downloadStatus: () => {
          const s = states[Math.min(i++, states.length - 1)]
          return s
        },
        openDownload: () => true,
      },
    })
    setShare(false)
    installFetch(ok())
    const watch = setInterval(() => {
      const j = downloadJob("asset:a-android")
      if (j) seen.push(j.loaded)
    }, 50)
    const result = await downloadFile({ assetId: "a-android" })
    clearInterval(watch)
    const job = downloadJob("asset:a-android")
    check("the signed address, the name and the type go to DownloadManager", calls.length === 1 && calls[0][0] === SIGNED && calls[0][1] === "Guide.pdf" && calls[0][2] === "application/pdf", calls)
    check("the page never reads the file itself", storageReads === 0)
    check("it resolves once the file is in Downloads", result.success && result.openedIn === "app", result)
    check("the tray says where it is and offers Open", job?.phase === "saved" && job?.message === "Saved to Downloads" && job?.nativeId === "42")
    check("the bar moved on the way", seen.some((v) => v > 0 && v < 4000), seen)
    removeJob("asset:a-android")
  }

  console.log("\niOS, with the app's own downloader (AppDelegate storelibDownload)")
  {
    const posted: any[] = []
    const win = installWindow("ios")
    win.webkit = {
      messageHandlers: {
        storelibDownload: {
          postMessage: (m: any) => {
            posted.push(m)
            /* What StorelibDownloads.report() sends back, as URLSession writes to disk. */
            const send = (detail: Record<string, unknown>, ms: number) => setTimeout(() => win.dispatchEvent(new CustomEvent("storelib-download", { detail })), ms)
            send({ id: m.id, state: "running", loaded: 100, total: 400 }, 10)
            send({ id: m.id, state: "running", loaded: 300, total: 400 }, 20)
            send({ id: m.id, state: "done", loaded: 400, total: 400 }, 30)
          },
        },
      },
    }
    setShare(true)
    installFetch(ok())
    const result = await downloadFile({ assetId: "a-ios" })
    const job = downloadJob("asset:a-ios")
    check("the app is asked to start it with the signed address and the name", posted.length === 1 && posted[0].action === "start" && posted[0].url === SIGNED && posted[0].fileName === "Guide.pdf", posted)
    check("the page never reads the file itself", storageReads === 0)
    check("it resolves once the share sheet has the file", result.success && result.openedIn === "app")
    check("the tray offers it again, for a sheet that was closed", job?.phase === "saved" && typeof job?.nativeId === "string")
    removeJob("asset:a-ios")
  }

  console.log("\nAn iPhone on an older install: the page holds a small file for Save to Files")
  {
    installWindow("ios")
    setShare(true)
    installFetch(ok())
    const result = await downloadFile({ assetId: "a-held" })
    const job = downloadJob("asset:a-held")
    check("it is read here, once", storageReads === 1)
    check("and waits for a tap on Save to Files, with the whole file", result.openedIn === "share" && job?.phase === "ready" && job?.file instanceof File && job.file.size === 3 * 64 * 1024 && job.file.name === "Guide.pdf", { phase: job?.phase, size: job?.file?.size })
    check("its type is the file's", job?.file?.type === "application/pdf")
    removeJob("asset:a-held")
  }

  console.log("\nA big file on an older iPhone is never read into the page")
  {
    installWindow("ios")
    setShare(true)
    opened.length = 0
    installFetch(ok(300 * 1024 * 1024))
    const result = await downloadFile({ assetId: "a-big" })
    check("storage is not read by the page at all", storageReads === 0)
    check("it goes to Safari, which streams it to Files", result.openedIn === "viewer" && opened.includes(SIGNED), opened)
    check("and the tray says where to find it", /Safari/.test(downloadJob("asset:a-big")?.message ?? ""))
    removeJob("asset:a-big")
  }

  console.log("\nAndroid on an older install: Chrome saves it")
  {
    installWindow("android")
    setShare(false)
    opened.length = 0
    installFetch(ok())
    const result = await downloadFile({ assetId: "a-old-android" })
    check("the system browser gets the signed address", result.openedIn === "viewer" && opened.includes(SIGNED) && storageReads === 0, opened)
    check("and the tray says Downloads", /Downloads/.test(downloadJob("asset:a-old-android")?.message ?? ""))
    removeJob("asset:a-old-android")
  }

  console.log("\nA refusal in the app")
  {
    installWindow("android", { StorelibNative: { download: () => "1", downloadStatus: () => '{"state":"done"}' } })
    installFetch({ error: "This order was refunded, so its files are closed.", reason: "refunded" }, 403)
    const result = await downloadFile({ assetId: "a-refunded" })
    check("comes back in the server's words, with its reason", !result.success && result.reason === "refunded" && /refunded/.test(result.error ?? ""))
    check("and the tray shows it, red", downloadJob("asset:a-refunded")?.phase === "failed")
    removeJob("asset:a-refunded")
  }

  console.log("\nReading into the page stops at the limit")
  {
    installFetch(ok(), 200, 5 * 64 * 1024, false)
    let refused = false
    try {
      await readIntoFile(SIGNED, "x.bin", "", { limit: 2 * 64 * 1024 })
    } catch (e) {
      refused = e instanceof TooLargeForPage
    }
    check("a file with no stated size is cut off as soon as it passes the limit", refused)
    installFetch(ok(), 200, 5 * 64 * 1024, true)
    let early = false
    try {
      await readIntoFile(SIGNED, "x.bin", "", { limit: 2 * 64 * 1024 })
    } catch (e) {
      early = e instanceof TooLargeForPage
    }
    check("one whose size is stated is refused before a byte is read", early)
    check("the limit is well under what WKWebView tolerates", IN_PAGE_LIMIT === 100 * 1024 * 1024)
  }

  check("no job is left behind", downloadJobs().length === 0, downloadJobs().map((j) => j.key))
}

/* ─── What the owner asked the library screens to be (read, not run) ─── */

function screenCases() {
  console.log("\nthe library's screens")
  const read = (f: string) => readFileSync(f, "utf8")
  const tabs = read("components/library/library-tabs.tsx")
  check("the tab list and its addresses", showsLibraryTabs("/library/") && showsLibraryTabs("/library/wishlist") && !showsLibraryTabs("/library/products/p1") && isLibraryProduct("/library/products/p1?x=1") && cleanPath("/library/reviews/?product=1") === "/library/reviews")
  check("the tabs are separate pills, not an underlined row", /rounded-full border/.test(tabs) && !/border-b-2/.test(tabs))
  const home = read("components/library/library-home.tsx")
  check("creators sit under the products on a computer with profile links, not a toggle filter", /data-creator-list=""/.test(home) && /function CreatorsList/.test(home) && /hidden overflow-hidden lg:block/.test(home) && /data-creator-profile=""/.test(home) && !/onChoose=|aria-pressed|data-creator-chips|function CreatorChips/.test(home))
  check("the pressed pill is chosen on the press, ahead of the address", /setPressed\(href\)/.test(tabs) && /const current = pressed \?\? path/.test(tabs))
  check("its fill fades in place on settings' 150ms curve", /TAB_FADE_MS = 150/.test(tabs) && /cubic-bezier\(0\.33, 1, 0\.68, 1\)/.test(tabs) && /transition-\[opacity,scale\]/.test(tabs))
  check("every tab route is prefetched whole", /router\.prefetch\(tab\.href, \{ kind: FULL \}\)/.test(tabs) && /onPointerEnter=\{\(\) => warm/.test(tabs))
  const layout = read("app/library/layout.tsx")
  check("the pills and the screen under them are one stage", /<LibraryPanel head=\{<LibraryTabs \/>\}>\{children\}<\/LibraryPanel>/.test(layout))
  const panel = read("components/library/library-panel.tsx")
  check("a press cross fades in place: the old screen fades over the next one's shape, which is drawn at once",
    /skeletonFor\(pending\.href, true\)/.test(panel) && /\[\{ opacity: 1 \}, \{ opacity: 0 \}\]/.test(panel) && /data-library-leaving/.test(panel) && !/opacity: 0\.2/.test(panel))
  check("a tab pressed from its row copies nothing at the press, only at the commit if the fade is not over",
    /getSnapshotBeforeUpdate/.test(panel) && /liveFade\.current = startNow\(live\.animate/.test(panel))
  check("the live screen stays laid out while hidden, so Next never scrolls the page up", /el\.style\.visibility = "hidden"/.test(panel) && !/style\.display = "none"\s*\n\s*}\s*\n\s*function show/.test(panel))
  check("the way back puts the list's scroll back, and the browser's own back is not faded", /history\.scrollRestoration = "manual"/.test(panel) && /jump\(scrolls\.get\(p\.href\) \?\? 0\)/.test(panel) && /traversal\.current/.test(panel))
  check("library tab loading draws the tab's shape, still, for the stage and the route", ["app/library/loading.tsx", "app/library/courses/loading.tsx", "app/library/memberships/loading.tsx", "app/library/wishlist/loading.tsx"].every((f) => /LibraryRouteSkeleton/.test(read(f)) && /data-library-skeleton/.test(read("components/library/library-route-skeleton.tsx"))))
  check("library route skeleton is not deferred; the panel already cross-fades", !/skeleton-deferred/.test(read("components/library/library-route-skeleton.tsx")))
  check("tab content uses settings' panel entrance, not a second deferred fade", /\.library-panel/.test(read("app/globals.css")) && /enter=\{panelEnter\}/.test(panel) && /library-panel/.test(read("components/library/library-content-shell.tsx")))
  check("pill links do not scroll the page to the top on a tab change", /scroll=\{false\}/.test(read("components/library/library-tabs.tsx")))
  check("tab cross-fade timing unchanged for the buyer probe", /OUT_MS = 150/.test(panel))
  check("explore back from a product hides until scroll is restored", /explore-scroll-restoring/.test(read("app/globals.css")) && /primeExploreScrollRestore/.test(read("lib/explore/use-explore-scroll.ts")) && /EXPLORE_SCROLL_BOOT_SCRIPT/.test(read("lib/explore/explore-scroll-boot.ts")) && /EXPLORE_SCROLL_BOOT_SCRIPT/.test(read("app/layout.tsx")))
  const banner = read("components/library/open-in-app.tsx")
  /*
    THE BANNER IS UNDER THE LIBRARY, NOT OVER IT. It used to be the first
    thing in the layout, and this check held it there; the owner asked for
    the opposite ("do not use the banner above the library, use it under,
    at the page"), so the order is the other way round and the card's room
    and entrance follow it: a top margin that folds away, rising from below.
  */
  check("Open in app is a banner under the library with the Storelib icon, known on the server so nothing moves",
    /<OpenInApp phone=\{bannerFor\} \/>/.test(layout) && layout.indexOf("<OpenInApp") > layout.indexOf("<LibraryPanel") && /<StorelibLogo size=\{40\}/.test(banner) && /h-\[60px\]/.test(banner) && /APP_BANNER_COOKIE/.test(banner) && /\[html\.capacitor_&\]:hidden/.test(banner))
  check("  and it folds upward from the foot, not downward from the top", /mt-0 grid-rows-\[0fr\]/.test(banner) && /mt-6 grid-rows-\[1fr\]/.test(banner) && /slide-in-from-bottom-1/.test(banner) && !/slide-in-from-top-1/.test(banner))
  const row = read("components/library/product-row.tsx")
  check("no stars and no Rate it on a product row", !/RateStars|rate-stars|\?rate=|<Stars/.test(row))
  check("More's review rows go to the Reviews tab focused on that product", /\/library\/reviews\?product=\$\{encodeURIComponent\(item\.productId\)\}/.test(row))
  const reviews = read("components/library/library-reviews.tsx")
  check("Leave a review opens the composer on the Reviews tab, never another page",
    /<ReviewComposer/.test(reviews) && /<SheetDialog/.test(reviews) && !/\/library\/products\/|\/receipt\//.test(reviews))
  check("post, edit and delete go to the review routes, shown before they answer",
    /fetch\("\/api\/reviews", \{\s*method: "POST"/.test(reviews) && /method: "PATCH"/.test(reviews) && /method: "DELETE"/.test(reviews) &&
      reviews.indexOf("setOpen(false)") < reviews.indexOf('await fetch("/api/reviews"'))
  check("a refusal puts the review back", /before === item\.review \? undefined : before/.test(reviews))
  const product = read("components/library/library-product.tsx")
  check("the creator block's buttons never wrap and say only what they do", /whitespace-nowrap/.test(product) && /\{contact\.short\}/.test(product) && !/\n\s*\{contact\.label\}\n/.test(product))
  check("the back control is a chevron and Library in a 36px pill, 44px to press, pressed on the finger",
    /<ChevronLeft/.test(product) && /data-library-back/.test(product) && /h-11/.test(product) && /group-active\/back:scale-\[0\.96\]/.test(product) && /<ReturnLink/.test(product))
  check("the creator's store opens in a new tab in a browser, in the same view in the app",
    /\{\.\.\.storeLink\}/.test(product) && /target: "_blank", rel: "noopener"/.test(read("components/library/use-store-link.ts")) && /appPlatform\(\) === null/.test(read("components/library/use-store-link.ts")))
}

async function main() {
  libraryCases()
  screenCases()
  openInAppCases()
  wishlistCases()
  await appCases()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
