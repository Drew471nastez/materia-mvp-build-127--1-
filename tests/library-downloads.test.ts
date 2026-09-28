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
import { openTarget, appLink, phoneOf } from "../lib/platform/open-in-app"

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

async function main() {
  libraryCases()
  openInAppCases()
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
