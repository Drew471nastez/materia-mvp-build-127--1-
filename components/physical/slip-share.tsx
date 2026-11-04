"use client"

/**
 * ===========================================================================
 *  A PACKING SLIP TO THE PHONE'S SHARE SHEET
 * ===========================================================================
 * The owner, round 23, with Shopify's app beside it: the print icon beside
 * the order's menu, a small notice that says "Generating packing slip" with a
 * ring turning, the ring becoming a check when it is made, and the phone's
 * own share sheet with the PDF in it (Print, AirDrop, Save to Files). It used
 * to open the slip as a page, which in the app left the order for a page
 * outside it.
 *
 * The file is the server's own PDF (format=pdf on the slip's address,
 * lib/physical/packing-slip-pdf.ts), handed to the Web Share API with the
 * file in it. WKWebView has it, so in the iOS app this is the system sheet;
 * Safari and Chrome on a phone have it too. The app has no native share
 * plugin (lib/platform/save-file.ts), and none is needed for this.
 *
 * A share has to start inside the tap. So the slip of the order on screen is
 * read ahead once the order is open (prefetchSlip), and the tap shares the
 * file it already has, while the notice runs its ring and check over the
 * sheet rising. A slip not read yet is made with the notice up, and if the
 * phone then says the tap is too long ago, the notice itself becomes the
 * button: "Packing slip ready", Share.
 *
 * Where there is no sharing a file (a computer, Android's web view), the
 * caller does what it did before: print from a frame, or the slip's page.
 * ON A COMPUTER THE SAME NOTICE RUNS (round 51, the owner: "on desktop,
 * clicking the packing slip icon should show a smooth loading state like the
 * phone version does"). It used to show nothing for the second or two the
 * slip took to be read and its pictures to load, so the icon looked broken:
 * printProgress below is the ring while the slip is made, the check once the
 * frame has it, and the notice leaves when the print dialog closes.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { hapticTap } from "@/lib/native-bridge"
import { tt } from "@/lib/i18n/text"

/** What the notice says for a document: the packing slip's, or the invoice's (round 24). */
export interface DocWords {
  making: string
  made: string
  ready: string
  failed: string
}
const slipWords = (): DocWords => ({ making: tt("Generating packing slip"), made: tt("Packing slip generated"), ready: tt("Packing slip ready"), failed: tt("The packing slip could not be made. Try again.") })
export const invoiceWords = (): DocWords => ({ making: tt("Generating invoice"), made: tt("Invoice generated"), ready: tt("Invoice ready"), failed: tt("The invoice could not be made. Try again.") })

type SlipState = ({ phase: "idle" } | { phase: "making" } | { phase: "made" } | { phase: "tap"; file: File } | { phase: "failed" }) & { words?: DocWords; leaving?: boolean }

let state: SlipState = { phase: "idle" }
const subs = new Set<() => void>()
const set = (next: SlipState) => {
  state = next
  subs.forEach((f) => f())
}
let hideTimer = 0
/* LEAVES AS IT CAME (round 24, "when it appears and disappears, it needs to be more smooth in and out"): it slides down and fades over LEAVE_MS, then is gone. */
const LEAVE_MS = 240
const hideSoon = (ms: number) => {
  window.clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => {
    set({ ...state, leaving: true })
    hideTimer = window.setTimeout(() => set({ phase: "idle" }), LEAVE_MS)
  }, ms)
}

/** The PDF's address for a slip's page address. */
export const slipPdfHref = (href: string) => `${href}${href.includes("?") ? "&" : "?"}format=pdf`

const kept = new Map<string, Promise<File | null>>()

const readSlip = (href: string) => readPdf(slipPdfHref(href), "packing-slip.pdf")

/** A PDF from one of Storelib's own addresses, as a file named the way the server names it; kept for a minute. */
function readPdf(pdf: string, fallbackName: string): Promise<File | null> {
  const had = kept.get(pdf)
  if (had) return had
  const made = fetch(pdf, { credentials: "same-origin", cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return null
      const name = /filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName
      return new File([await res.blob()], name, { type: "application/pdf" })
    })
    .catch(() => null)
  kept.set(pdf, made)
  /* A slip read ahead is kept for a minute: a fulfilment since changes what is on it. */
  void made.then((f) => window.setTimeout(() => kept.get(pdf) === made && kept.delete(pdf), f ? 60_000 : 0))
  return made
}

/**
 * The notice for a print from a frame on a computer (components/physical/order-panel printSlip, the Orders list's
 * Packing slips): `made` once the frame has the page, `failed` when it could not be read, `done` when the print dialog
 * is closed.
 */
export function printProgress(words: DocWords = slipWords()): { made: () => void; failed: () => void; done: () => void; cancel: () => void } {
  window.clearTimeout(hideTimer)
  set({ phase: "making", words })
  const started = performance.now()
  return {
    made: () => {
      if (state.phase === "making") set({ phase: "made", words })
    },
    failed: () => {
      set({ phase: "failed", words })
      hideSoon(3200)
    },
    /* Seen for a moment even when the dialog was closed at once. */
    done: () => hideSoon(Math.max(300, 700 - (performance.now() - started))),
    /* The caller says why itself (nothing left to pack): the notice leaves at once. */
    cancel: () => hideSoon(0),
  }
}

/** How long the check is seen before the print dialog covers the page. */
export const PRINT_AFTER_MADE_MS = 280

export const slipsWords = (): DocWords => ({ making: tt("Generating packing slips"), made: tt("Packing slips generated"), ready: tt("Packing slips ready"), failed: tt("The packing slips could not be made. Try again.") })

/** Whether this is a phone or tablet that can hand a PDF to a share sheet. A computer prints instead, as before. */
export function canShareSlip(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false
  if (!window.matchMedia?.("(pointer: coarse)").matches) return false
  try {
    return navigator.canShare({ files: [new File([""], "x.pdf", { type: "application/pdf" })] })
  } catch {
    return false
  }
}

/** Read the slip ahead, so a tap can share it at once. Quietly, when the phone is idle. */
export function prefetchSlip(href: string): void {
  if (!canShareSlip()) return
  const idle = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback
  if (idle) idle(() => void readSlip(href), { timeout: 2000 })
  else window.setTimeout(() => void readSlip(href), 400)
}

async function share(file: File): Promise<"shared" | "cancelled" | "late"> {
  try {
    await navigator.share({ files: [file], title: file.name })
    return "shared"
  } catch (e) {
    const name = (e as { name?: string })?.name
    if (name === "NotAllowedError") return "late"
    return "cancelled"
  }
}

/** The tap on the print icon. False when this browser cannot share a file: the caller prints or opens the page. */
export function shareSlip(href: string): boolean {
  return shareDoc(() => readSlip(href), slipWords())
}

/** An order's invoice (GET /api/invoice), to read ahead and to share, as the packing slip is (round 24). */
const invoicePdf = (orderId: string, timeZone: string) => `/api/invoice?orderId=${encodeURIComponent(orderId)}&tz=${encodeURIComponent(timeZone)}`
export function prefetchInvoice(orderId: string, timeZone: string): void {
  if (!canShareSlip()) return
  const idle = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback
  const go = () => void readPdf(invoicePdf(orderId, timeZone), "invoice.pdf")
  if (idle) idle(go, { timeout: 2500 })
  else window.setTimeout(go, 600)
}
export function shareInvoice(orderId: string, timeZone: string): boolean {
  return shareDoc(() => readPdf(invoicePdf(orderId, timeZone), "invoice.pdf"), invoiceWords())
}

function shareDoc(read: () => Promise<File | null>, words: DocWords): boolean {
  if (!canShareSlip()) return false
  hapticTap("soft")
  window.clearTimeout(hideTimer)
  set({ phase: "making", words })
  const started = performance.now()
  void read().then(async (file) => {
    if (!file) {
      set({ phase: "failed", words })
      hideSoon(3200)
      return
    }
    /* The ring is seen turning for a moment even when the file was already here, then becomes the check. */
    const madeIn = performance.now() - started
    window.setTimeout(() => {
      if (state.phase === "making") set({ phase: "made", words })
    }, Math.max(0, 420 - madeIn))
    const how = await share(file)
    if (how === "late") {
      set({ phase: "tap", file, words })
      hideSoon(8000)
      return
    }
    hideSoon(how === "shared" ? 300 : 900)
  })
  return true
}

/**
 * The notice: a dark pill over the bottom of the screen, above the app's
 * bar. A ring that turns while the slip is made, then a check that draws
 * itself in a green disc. Mounted once by the Orders page.
 */
export function SlipNotice() {
  const s = React.useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => state,
    () => state,
  )
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  if (!mounted || s.phase === "idle") return null
  const done = s.phase === "made" || s.phase === "tap"
  const w = s.words ?? slipWords()
  const text = s.phase === "making" ? w.making : s.phase === "failed" ? w.failed : s.phase === "tap" ? w.ready : w.made
  return createPortal(
    <div className="slip-notice-wrap" aria-live="polite" data-slip-notice={s.phase} data-leaving={s.leaving ? "" : undefined}>
      <div className="slip-notice">
        {s.phase === "failed" ? null : (
          <span className="slip-notice-mark" data-done={done ? "" : undefined} aria-hidden>
            <svg viewBox="0 0 20 20" width="20" height="20">
              <circle className="slip-ring" cx="10" cy="10" r="8" fill="none" strokeWidth="2" />
              <circle className="slip-disc" cx="10" cy="10" r="9" />
              <path className="slip-check" d="M6.2 10.3l2.5 2.5 5.1-5.3" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
        <span className="truncate">{text}</span>
        {s.phase === "tap" ? (
          <button
            type="button"
            className="slip-notice-share"
            onClick={() => {
              const file = s.file
              set({ phase: "made", words: s.words })
              void share(file).then(() => hideSoon(300))
            }}
          >
            {tt("Share")}
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
