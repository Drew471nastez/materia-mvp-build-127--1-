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
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { hapticTap } from "@/lib/native-bridge"
import { tt } from "@/lib/i18n/text"

type SlipState = { phase: "idle" } | { phase: "making" } | { phase: "made" } | { phase: "tap"; file: File } | { phase: "failed" }

let state: SlipState = { phase: "idle" }
const subs = new Set<() => void>()
const set = (next: SlipState) => {
  state = next
  subs.forEach((f) => f())
}
let hideTimer = 0
const hideSoon = (ms: number) => {
  window.clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => set({ phase: "idle" }), ms)
}

/** The PDF's address for a slip's page address. */
export const slipPdfHref = (href: string) => `${href}${href.includes("?") ? "&" : "?"}format=pdf`

const kept = new Map<string, Promise<File | null>>()

function readSlip(href: string): Promise<File | null> {
  const pdf = slipPdfHref(href)
  const had = kept.get(pdf)
  if (had) return had
  const made = fetch(pdf, { credentials: "same-origin", cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return null
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "packing-slip.pdf"
      return new File([await res.blob()], name, { type: "application/pdf" })
    })
    .catch(() => null)
  kept.set(pdf, made)
  /* A slip read ahead is kept for a minute: a fulfilment since changes what is on it. */
  void made.then((f) => window.setTimeout(() => kept.get(pdf) === made && kept.delete(pdf), f ? 60_000 : 0))
  return made
}

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
  if (!canShareSlip()) return false
  hapticTap("soft")
  window.clearTimeout(hideTimer)
  set({ phase: "making" })
  const started = performance.now()
  void readSlip(href).then(async (file) => {
    if (!file) {
      set({ phase: "failed" })
      hideSoon(3200)
      return
    }
    /* The ring is seen turning for a moment even when the file was already here, then becomes the check. */
    const madeIn = performance.now() - started
    window.setTimeout(() => {
      if (state.phase === "making") set({ phase: "made" })
    }, Math.max(0, 420 - madeIn))
    const how = await share(file)
    if (how === "late") {
      set({ phase: "tap", file })
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
  const text =
    s.phase === "making" ? tt("Generating packing slip") : s.phase === "failed" ? tt("The packing slip could not be made. Try again.") : s.phase === "tap" ? tt("Packing slip ready") : tt("Packing slip generated")
  return createPortal(
    <div className="slip-notice-wrap" aria-live="polite" data-slip-notice={s.phase}>
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
              set({ phase: "made" })
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
