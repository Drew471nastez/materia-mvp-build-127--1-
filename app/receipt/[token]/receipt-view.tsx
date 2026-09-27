"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowDownToLine, ArrowRight, Check, FileText, Loader2, PlayCircle, Printer } from "lucide-react"
import { downloadEntitledFile } from "@/components/download-button"
import { ReviewForm } from "@/components/reviews/review-form"
import { getStoreUrl } from "@/lib/url-helpers"
import { isNativeApp } from "@/lib/platform-utils"
import { fileKindOf, formatFileSize, formatMoney, splitFileName, type AccessState } from "@/lib/receipts/rules"
import type { ReceiptItem, ReceiptView as Receipt, ReceiptViewer } from "@/lib/receipts/view"

/**
 * The receipt and the files, for the buyer. Everything it shows arrives from
 * the server already decided (lib/receipts/load.ts): which lines are paid,
 * which files each one includes, what the payment came to. This component
 * only presents it and calls the routes that act on it. It never decides who
 * may download; /api/download does that again on every click.
 */

/*
 * Storelib's own buttons, Polaris-like: a near-black primary and a light
 * grey secondary, each with a hairline edge, a soft layered shadow and a
 * pressed state that sinks one pixel. No violet on this page.
 */
const CARD =
  "rounded-2xl border border-[#e4e7ec]/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]"
const PRESS = "transition-[background-color,box-shadow,translate] duration-150 active:translate-y-px disabled:cursor-default disabled:opacity-60 disabled:active:translate-y-0"
const PRIMARY = `inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-[#0f0f1c] bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(16,24,40,0.24)] hover:bg-[#262640] active:bg-[#12121f] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 focus-visible:ring-offset-2 ${PRESS}`
const SECONDARY = `inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-[#d5d9e0] bg-[#f3f4f6] px-4 text-[14px] font-semibold text-[#1a1a2e] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(16,24,40,0.08)] hover:bg-[#eceef1] active:bg-[#e7e9ed] active:shadow-[inset_0_1px_2px_rgba(16,24,40,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 focus-visible:ring-offset-2 ${PRESS}`
/* The same two, a size down, for a row's own action. */
const SMALL = "h-9 px-3 text-[13px]"
const TEXT_LINK = "font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/25 underline-offset-2 transition-[text-decoration-color] hover:decoration-[#1a1a2e]"

/* How long the page keeps checking a payment that has not cleared. */
const PENDING_POLL_MS = 4000
const PENDING_POLL_LIMIT = 30

/**
 * A date in the buyer's own locale and time zone. The server renders it in
 * UTC with the Accept-Language locale; once the browser is running it swaps
 * in the local zone, so a purchase at 23:30 is not shown as tomorrow.
 */
function LocalDate({ iso, locale }: { iso: string; locale: string }) {
  const format = useCallback(
    (tz?: string) => {
      try {
        return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: tz }).format(new Date(iso))
      } catch {
        return ""
      }
    },
    [iso, locale],
  )
  const [text, setText] = useState(() => format("UTC"))
  useEffect(() => setText(format(undefined)), [format])
  return <time dateTime={iso}>{text}</time>
}

function headlineFor(state: AccessState, firstName: string | null) {
  switch (state) {
    case "open":
      return firstName ? `Thanks, ${firstName}` : "Thanks for your order"
    case "pending":
      return "Waiting for your payment"
    case "refunded":
      return "This order was refunded"
    case "failed":
      return "The payment did not go through"
    default:
      return "This order is on hold"
  }
}

const LINE_STATUS: Record<Exclude<AccessState, "open">, { text: string; tone: string }> = {
  pending: { text: "Waiting for payment", tone: "text-[#b45309]" },
  refunded: { text: "Refunded, files closed", tone: "text-[#b42318]" },
  failed: { text: "Payment failed", tone: "text-[#b42318]" },
  held: { text: "On hold while the payment is reviewed", tone: "text-[#b45309]" },
}

type Platform = "ios" | "android" | "web"

function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>("web")
  useEffect(() => {
    if (!isNativeApp()) return
    const cap = (window as any).Capacitor
    setPlatform(cap?.getPlatform?.() === "android" ? "android" : "ios")
  }, [])
  return platform
}

/* ─── One file ─────────────────────────────────────────────────────────── */

/**
 * A file row: its type, its name (cut in the middle when it is long, so the
 * end and the extension stay readable, and whole in `title`), its size, and
 * Download. Download asks /api/download for a short signed link each time,
 * says so while it waits, and shows a refusal in the server's words.
 */
function FileRow({ file, token }: { file: ReceiptItem["files"][number]; token: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const onDownload = async () => {
    setBusy(true)
    setError(null)
    setDone(false)
    const result = await downloadEntitledFile(file.id, { receiptToken: token })
    setBusy(false)
    if (result.success) {
      setDone(true)
      setTimeout(() => setDone(false), 3000)
    } else {
      setError(result.error ?? "The file could not be fetched. Try again.")
    }
  }

  const size = formatFileSize(file.sizeBytes)
  const kind = fileKindOf(file.name)
  const { head, tail } = splitFileName(file.name)
  return (
    <li data-receipt-file="" className="border-b border-[#eef0f3] py-3 last:border-b-0 last:pb-0">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e9ecf0] bg-[#f7f8fa] text-[9.5px] font-bold tracking-[0.04em] text-[#6b7280]"
        >
          {kind && kind.length <= 4 ? kind : <FileText className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p data-file-name="" title={file.name} className="flex min-w-0 text-[14px] font-medium leading-5 text-[#1a1a2e]">
            <span data-name-head="" className="truncate">
              {head}
            </span>
            {tail ? <span className="shrink-0 whitespace-pre">{tail}</span> : null}
          </p>
          {size ? <p className="text-[12px] leading-4 text-[#8a919c] tabular-nums">{size}</p> : null}
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={busy}
          aria-busy={busy || undefined}
          aria-label={`Download ${file.name}`}
          className={`${PRIMARY} ${SMALL} min-w-[104px] sm:min-w-[112px] print:hidden`}
        >
          {busy ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Preparing
            </>
          ) : done ? (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden />
              Downloaded
            </>
          ) : (
            <>
              <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
              Download
            </>
          )}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 pl-12 text-[13px] leading-snug text-[#b42318]">
          {error}
        </p>
      ) : null}
    </li>
  )
}

/* ─── One line of the order ────────────────────────────────────────────── */

function ItemBlock({
  item,
  currency,
  locale,
  viewer,
  signInHref,
}: {
  item: ReceiptItem
  currency: string
  locale: string
  viewer: ReceiptViewer
  signInHref: string
}) {
  const status = item.state === "open" ? null : LINE_STATUS[item.state]
  const open = item.state === "open"
  const count = item.files.length
  const nothing = open && count === 0 && !item.courseHref
  const meta = [
    item.variantName,
    open && count > 1 ? `${count} files` : null,
    open && item.courseHref ? "Course" : null,
  ]
    .filter(Boolean)
    .join(" · ")
  /* The price before a code, when the payment recorded one that adds up (lib/receipts/discount). */
  const shown = typeof item.listCents === "number" && item.listCents > item.subtotalCents ? item.listCents : item.subtotalCents
  return (
    <section data-receipt-item="" className="px-4 py-4 sm:px-5">
      <div data-item-head="" className="flex items-center gap-3.5">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#f1f3f5] ring-1 ring-inset ring-black/[0.04]">
          {item.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug text-[#1a1a2e] [overflow-wrap:anywhere]">{item.title}</p>
          {meta ? <p className="mt-0.5 text-[13px] text-[#6b7280]">{meta}</p> : null}
          {nothing ? <p className="mt-0.5 text-[13px] text-[#6b7280]">No files come with this item.</p> : null}
          {status ? <p className={`mt-0.5 text-[13px] font-medium ${status.tone}`}>{status.text}</p> : null}
        </div>
        <p className="shrink-0 text-[15px] font-semibold tabular-nums text-[#1a1a2e]">
          {item.totalCents === 0 ? "Free" : formatMoney(shown, currency, locale)}
        </p>
      </div>

      {open && (count > 0 || item.courseHref) ? (
        <ul className="mt-3 border-t border-[#eef0f3]">
          {item.files.map((f) => (
            <FileRow key={f.id} file={f} token={item.token} />
          ))}
          {item.courseHref ? (
            <li className="flex items-center gap-3 border-b border-[#eef0f3] py-3 last:border-b-0 last:pb-0">
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e9ecf0] bg-[#f7f8fa] text-[#6b7280]">
                <PlayCircle className="h-4 w-4" />
              </span>
              {viewer.isBuyer ? (
                <>
                  <p className="min-w-0 flex-1 text-[14px] font-medium text-[#1a1a2e]">Course lessons</p>
                  <Link href={item.courseHref} className={`${PRIMARY} ${SMALL} min-w-[112px] print:hidden`}>
                    Open course
                  </Link>
                </>
              ) : (
                <p className="min-w-0 flex-1 text-[13px] leading-snug text-[#6b7280]">
                  The course is in your library.{" "}
                  <Link href={signInHref} className={TEXT_LINK}>
                    Sign in with the email you paid with
                  </Link>{" "}
                  to open it.
                </p>
              )}
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  )
}

/* ─── The page ─────────────────────────────────────────────────────────── */

export function ReceiptView({ receipt, viewer, locale }: { receipt: Receipt; viewer: ReceiptViewer; locale: string }) {
  const router = useRouter()
  const platform = usePlatform()
  const { primary, currency } = receipt
  const money = (cents: number) => formatMoney(cents, currency, locale)
  const receiptPath = `/receipt/${primary.token}`

  /* A payment that has not cleared: check again every few seconds, then
     stop and say so rather than polling forever. */
  const [polls, setPolls] = useState(0)
  useEffect(() => {
    if (receipt.state !== "pending" || polls >= PENDING_POLL_LIMIT) return
    const t = setTimeout(() => {
      router.refresh()
      setPolls((n) => n + 1)
    }, PENDING_POLL_MS)
    return () => clearTimeout(t)
  }, [receipt.state, polls, router])

  /* The receipt email. */
  const [emailState, setEmailState] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [emailNote, setEmailNote] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)
  const [newEmail, setNewEmail] = useState("")

  const resend = async () => {
    setEmailState("sending")
    setEmailNote(null)
    try {
      const res = await fetch("/api/receipt/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: primary.orderId, receiptToken: primary.token, resendType: "buyer" }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setEmailState("sent")
        setEmailNote("Sent. It can take a minute to arrive, and it may land in spam.")
      } else {
        setEmailState("error")
        setEmailNote(data.error || "The email did not go out. Try again in a minute.")
      }
    } catch {
      setEmailState("error")
      setEmailNote("No connection. Try again.")
    }
  }

  const changeEmail = async (e: FormEvent) => {
    e.preventDefault()
    const value = newEmail.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailState("error")
      setEmailNote("That does not look like an email address.")
      return
    }
    setEmailState("sending")
    setEmailNote(null)
    try {
      const res = await fetch("/api/receipt/update-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: primary.orderId, receiptToken: primary.token, newEmail: value }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setEmailState("error")
        setEmailNote(data.error || "The address was not changed.")
        return
      }
      setEmailState("sent")
      setEmailNote(`Sent to ${value}.`)
      setChanging(false)
      setNewEmail("")
      router.refresh()
    } catch {
      setEmailState("error")
      setEmailNote("No connection. Try again.")
    }
  }

  /* Moving a guest order into the signed-in person's library. */
  const [claiming, setClaiming] = useState(false)
  const [claimNote, setClaimNote] = useState<string | null>(null)
  const claim = async () => {
    setClaiming(true)
    setClaimNote(null)
    let failed = 0
    for (const item of receipt.items) {
      try {
        const res = await fetch("/api/purchases/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receiptToken: item.token }),
        })
        if (!res.ok) failed++
      } catch {
        failed++
      }
    }
    setClaiming(false)
    if (failed > 0) setClaimNote("Part of this order is already in another account.")
    router.refresh()
  }

  const signupHref = `/signup?redirect=${encodeURIComponent(receiptPath)}&autoBuyer=1&claim=1&receiptToken=${encodeURIComponent(primary.token)}`
  const loginHref = `/login?redirect=${encodeURIComponent(receiptPath)}`

  const hasFiles = receipt.items.some((i) => i.files.length > 0)
  const single = receipt.items.length === 1 ? receipt.items[0] : null
  const storeHref = useMemo(() => (receipt.seller.username ? getStoreUrl(receipt.seller.username) : null), [receipt.seller.username])

  const subline = (() => {
    switch (receipt.state) {
      case "pending":
        return polls >= PENDING_POLL_LIMIT
          ? "Still waiting. You will get an email the moment it clears, so it is safe to close this page."
          : "This page updates by itself once the payment clears. It usually takes a few seconds."
      case "refunded":
        return "The money went back to your original payment method. The files are no longer available."
      case "failed":
        return "You were not charged. You can try again from the product page."
      case "held":
        return `The payment is being reviewed. Reply to your receipt email to reach ${receipt.seller.name}.`
      default:
        return null
    }
  })()

  const BRANDS: Record<string, string> = { amex: "American Express", mastercard: "Mastercard", diners: "Diners Club", jcb: "JCB", unionpay: "UnionPay" }
  const brand = receipt.payment.brand ? BRANDS[receipt.payment.brand] ?? `${receipt.payment.brand.charAt(0).toUpperCase()}${receipt.payment.brand.slice(1)}` : null
  const cardLine =
    brand && receipt.payment.last4
      ? `${brand} ending ${receipt.payment.last4}`
      : receipt.payment.method === "paypal"
        ? "PayPal"
        : receipt.payment.method === "link"
          ? "Link"
          : null
  const paid = receipt.state !== "pending" && receipt.state !== "failed"
  const discount = receipt.discountCents ?? 0
  /* Before the code, when there was one: the lines at their list price. */
  const beforeDiscount = discount > 0 ? receipt.subtotalCents + discount : receipt.subtotalCents
  const policies = receipt.items.filter((i) => i.refundPolicy)

  return (
    <main data-receipt="" className="min-h-[100dvh] bg-[#f5f6f8] print:bg-white">
      <div className="mx-auto w-full max-w-[640px] px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:pt-10">
        {/* Who it is from, and a way to keep a copy. */}
        <div className="flex items-center justify-between gap-3">
          {storeHref ? (
            <a href={storeHref} className="flex min-h-[44px] min-w-0 items-center gap-2.5" rel="noreferrer">
              <SellerMark name={receipt.seller.name} avatarUrl={receipt.seller.avatarUrl} />
              <span className="truncate text-[14px] font-semibold text-[#1a1a2e]">{receipt.seller.name}</span>
            </a>
          ) : (
            <span className="flex min-h-[44px] items-center gap-2.5">
              <SellerMark name={receipt.seller.name} avatarUrl={receipt.seller.avatarUrl} />
              <span className="truncate text-[14px] font-semibold text-[#1a1a2e]">{receipt.seller.name}</span>
            </span>
          )}
          <button type="button" onClick={() => window.print()} className={`${SECONDARY} ${SMALL} print:hidden`}>
            <Printer className="h-3.5 w-3.5 text-[#4b5563]" aria-hidden />
            Print
          </button>
        </div>

        <header className="mt-5">
          <h1 className="text-[24px] font-bold leading-tight text-[#1a1a2e] sm:text-[28px]">
            {headlineFor(receipt.state, receipt.buyer.firstName)}
          </h1>
          <p className="mt-1.5 text-[14px] text-[#6b7280]">
            Order {receipt.number} · <LocalDate iso={receipt.createdAt} locale={locale} />
          </p>
          {subline ? <p className="mt-3 text-[14px] leading-relaxed text-[#4b5563]">{subline}</p> : null}
          {receipt.state === "pending" && polls < PENDING_POLL_LIMIT ? (
            <p className="mt-3 flex items-center gap-2 text-[13px] text-[#6b7280]" aria-live="polite">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#f59e0b]" aria-hidden />
              Checking with the bank
            </p>
          ) : null}
        </header>

        {/* What was bought, what each part gives access to, and the total. */}
        <div data-receipt-items="" className={`${CARD} mt-6 overflow-hidden print:shadow-none`}>
          <div className="divide-y divide-[#eef0f3]">
            {receipt.items.map((item) => (
              <ItemBlock
                key={item.orderId}
                item={item}
                currency={currency}
                locale={locale}
                viewer={viewer}
                signInHref={loginHref}
              />
            ))}
          </div>

          <dl data-receipt-totals="" className="space-y-1.5 border-t border-[#eef0f3] bg-[#fbfbfc] px-4 py-4 text-[14px] sm:px-5">
            {receipt.tipCents > 0 || discount > 0 || receipt.items.length > 1 ? (
              <Row label="Subtotal" value={money(beforeDiscount)} />
            ) : null}
            {discount > 0 ? (
              <Row
                label={receipt.discountCode ? `Discount (${receipt.discountCode})` : "Discount"}
                value={`−${money(discount)}`}
              />
            ) : null}
            {receipt.tipCents > 0 ? <Row label="Tip" value={money(receipt.tipCents)} /> : null}
            <Row label="Total" value={receipt.totalCents === 0 ? "Free" : money(receipt.totalCents)} strong />
            {receipt.refundedCents > 0 ? <Row label="Refunded" value={`−${money(receipt.refundedCents)}`} tone="text-[#b42318]" /> : null}
            {(cardLine && receipt.totalCents > 0 && paid) || (receipt.invoice && paid) ? (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-1.5 text-[13px]">
                {cardLine && receipt.totalCents > 0 && paid ? <p className="text-[#6b7280]">Paid with {cardLine}</p> : <span />}
                {receipt.invoice && paid ? (
                  <a
                    href={`/api/checkout/invoice?token=${encodeURIComponent(receipt.primary.token)}`}
                    download
                    onClick={(e) => {
                      /* The app's web view cannot save a download; the system viewer can. */
                      if (platform === "web") return
                      e.preventDefault()
                      const url = new URL(e.currentTarget.getAttribute("href") || "", window.location.origin).toString()
                      void import("@capacitor/browser").then(({ Browser }) => Browser.open({ url })).catch(() => window.open(url, "_blank"))
                    }}
                    className={`${TEXT_LINK} inline-flex min-h-[32px] items-center gap-1.5 print:hidden`}
                  >
                    <FileText className="h-3.5 w-3.5 text-[#6b7280]" aria-hidden />
                    Download invoice (PDF)
                  </a>
                ) : null}
              </div>
            ) : null}
          </dl>
        </div>

        {hasFiles && platform !== "web" ? (
          <p className="mt-3 px-1 text-[13px] leading-relaxed text-[#6b7280] print:hidden">
            {platform === "ios"
              ? "Files open in a viewer. Tap Share, then Save to Files to keep a copy on this iPhone."
              : "Files open in the browser and save to your Downloads folder."}
          </p>
        ) : null}

        {/* The email with the link, and fixing a typo in the address. */}
        {receipt.buyer.maskedEmail ? (
          <div data-receipt-email="" className={`${CARD} mt-4 px-4 py-4 sm:px-5 print:hidden`}>
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-[14px] text-[#4b5563]">
                {receipt.buyer.email === "failed" ? "We could not email " : "Receipt emailed to "}
                <span className="font-medium text-[#1a1a2e] [overflow-wrap:anywhere]">{receipt.buyer.maskedEmail}</span>
              </p>
              <button type="button" onClick={resend} disabled={emailState === "sending"} className={`${SECONDARY} ${SMALL} min-w-[84px]`}>
                {emailState === "sending" && !changing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Sending
                  </>
                ) : (
                  "Resend"
                )}
              </button>
            </div>

            {changing ? (
              receipt.buyer.unclaimed ? (
                <form onSubmit={changeEmail} className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <label htmlFor="receipt-new-email" className="sr-only">
                    New email address
                  </label>
                  <input
                    id="receipt-new-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-10 min-w-0 flex-1 rounded-[10px] border border-[#d5d9e0] bg-white px-3 text-[16px] text-[#1a1a2e] shadow-[inset_0_1px_1px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] placeholder:text-[#9ca3af] focus:border-[#9aa1ac] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] sm:text-[14px]"
                  />
                  <div className="flex gap-2">
                    <button type="submit" disabled={emailState === "sending"} className={`${PRIMARY} flex-1 sm:flex-none`}>
                      {emailState === "sending" ? "Sending" : "Send here"}
                    </button>
                    <button type="button" onClick={() => setChanging(false)} className={SECONDARY}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                /* The route refuses a token change for an order on an account
                   (app/api/receipt/update-email): say where it is changed. */
                <p className="mt-2 text-[13px] leading-relaxed text-[#6b7280]">
                  This order is saved to an account, so its receipt goes to that account&apos;s email. Change it in{" "}
                  <Link href="/library/settings" className={TEXT_LINK}>
                    account settings
                  </Link>
                  , then use Resend.
                </p>
              )
            ) : (
              <button
                type="button"
                onClick={() => {
                  setChanging(true)
                  setEmailNote(null)
                }}
                className="mt-1 min-h-[32px] text-[13px] text-[#6b7280] underline-offset-2 transition-colors hover:text-[#1a1a2e] hover:underline"
              >
                Wrong address?
              </button>
            )}

            {emailNote ? (
              <p role="status" className={`mt-2 text-[13px] ${emailState === "error" ? "text-[#b42318]" : "text-[#067647]"}`}>
                {emailNote}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Where the purchase lives from now on. */}
        {receipt.state === "open" ? (
          viewer.signedIn ? (
            receipt.buyer.unclaimed ? (
              <div className={`${CARD} mt-4 flex items-center justify-between gap-3 px-4 py-4 sm:px-5 print:hidden`}>
                <p className="min-w-0 text-[14px] text-[#4b5563]">
                  {claimNote ?? "Keep this order with the rest of your purchases."}
                </p>
                <button type="button" onClick={claim} disabled={claiming} className={PRIMARY}>
                  {claiming ? "Adding" : "Add to library"}
                </button>
              </div>
            ) : viewer.isBuyer ? (
              <Link
                href="/library"
                className="group mt-4 flex min-h-[56px] items-center justify-between rounded-2xl border border-[#e4e7ec]/80 bg-white px-4 shadow-[inset_0_-1px_0_rgba(16,24,40,0.04),0_1px_2px_rgba(16,24,40,0.05),0_3px_8px_-2px_rgba(16,24,40,0.06)] transition-[box-shadow,border-color,translate] duration-150 hover:border-[#d9dde3] hover:shadow-[inset_0_-1px_0_rgba(16,24,40,0.04),0_2px_4px_rgba(16,24,40,0.06),0_8px_16px_-4px_rgba(16,24,40,0.08)] active:translate-y-px active:shadow-[inset_0_1px_2px_rgba(16,24,40,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 focus-visible:ring-offset-2 sm:px-5 print:hidden"
              >
                <span className="text-[14px] font-semibold text-[#1a1a2e]">Open your library</span>
                <ArrowRight
                  data-arrow=""
                  aria-hidden
                  className="h-4 w-4 text-[#9ca3af] transition-[translate,color] duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-[#1a1a2e]"
                />
              </Link>
            ) : null
          ) : (
            <div className={`${CARD} mt-4 px-4 py-4 sm:px-5 print:hidden`}>
              <p className="text-[15px] font-semibold text-[#1a1a2e]">Keep it in a library</p>
              <p className="mt-1 text-[14px] text-[#6b7280]">
                Make an account with the same email and this order stays with you on any device, even if the email gets lost.
              </p>
              <div className="mt-3 flex gap-2">
                <Link href={signupHref} className={`${PRIMARY} flex-1 sm:flex-none`}>
                  Create account
                </Link>
                <Link href={loginHref} className={`${SECONDARY} flex-1 sm:flex-none`}>
                  Sign in
                </Link>
              </div>
            </div>
          )
        ) : null}

        {single && single.state === "open" ? (
          /* `#review` is where an automated review request lands (lib/automations/merge-fields review_url). */
          <div id="review" className="mt-4 scroll-mt-6 print:hidden">
            <ReviewSlot
              item={single}
              viewer={viewer}
              receiptPath={receiptPath}
              buyerFirstName={receipt.buyer.firstName}
              unclaimed={receipt.buyer.unclaimed}
              loginHref={loginHref}
              signupHref={signupHref}
            />
          </div>
        ) : null}

        {/* Who to ask, and what the seller promised about refunds. */}
        <div data-receipt-help="" className="mt-6 space-y-1.5 border-t border-[#e4e7ec] px-1 pt-4 text-[13px] leading-relaxed text-[#6b7280]">
          <p>
            Questions about this order?{" "}
            {receipt.seller.supportEmail ? (
              <>
                Write to {receipt.seller.name} at{" "}
                <a href={`mailto:${receipt.seller.supportEmail}?subject=${encodeURIComponent(`Order ${receipt.number}`)}`} className={TEXT_LINK}>
                  {receipt.seller.supportEmail}
                </a>
                .
              </>
            ) : (
              <>Reply to your receipt email and it reaches {receipt.seller.name}.</>
            )}
          </p>
          {policies.map((item) => (
            <div key={item.orderId}>
              {item.refundPolicy?.finePrint ? (
                <details className="group/policy">
                  <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    Refunds{receipt.items.length > 1 ? ` for ${item.title}` : ""}: {item.refundPolicy.label}.{" "}
                    <span className="text-[#1a1a2e] underline decoration-[#1a1a2e]/25 underline-offset-2 group-open/policy:hidden print:hidden">Terms</span>
                  </summary>
                  <p className="mt-1 whitespace-pre-line text-[#4b5563] [overflow-wrap:anywhere]">{item.refundPolicy.finePrint}</p>
                </details>
              ) : (
                <p>
                  Refunds{receipt.items.length > 1 ? ` for ${item.title}` : ""}: {item.refundPolicy?.label}.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? "font-semibold text-[#1a1a2e]" : "text-[#6b7280]"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "text-[16px] font-bold text-[#1a1a2e]" : tone ?? "text-[#1a1a2e]"}`}>{value}</dd>
    </div>
  )
}

function SellerMark({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#eef0f3] text-[13px] font-semibold text-[#4b5563] ring-1 ring-black/[0.04]">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        (name.trim().charAt(0) || "S").toUpperCase()
      )}
    </span>
  )
}

/**
 * The review box for a one-product order. It asks the server whether this
 * person may review and already has, and shows nothing until it knows. It
 * asks again when the order moves onto their account (Add to library), which
 * is what makes them a buyer in the review route's eyes.
 */
function ReviewSlot({
  item,
  viewer,
  receiptPath,
  buyerFirstName,
  unclaimed,
  loginHref,
  signupHref,
}: {
  item: ReceiptItem
  viewer: ReceiptViewer
  receiptPath: string
  buyerFirstName: string | null
  unclaimed: boolean
  loginHref: string
  signupHref: string
}) {
  const [status, setStatus] = useState<{
    isLoggedIn?: boolean
    hasPurchased?: boolean
    hasReviewed?: boolean
    existingReview?: any
    blockedReason?: string
  } | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    fetch(`/api/reviews/check?productId=${encodeURIComponent(item.productId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (live) setStatus(data)
      })
      .catch(() => {})
      .finally(() => {
        if (live) setReady(true)
      })
    return () => {
      live = false
    }
  }, [item.productId, unclaimed])

  if (!ready) return null
  const signedIn = status?.isLoggedIn ?? viewer.signedIn
  /* Signed in, and the review route would say no: the seller themself, or an
     order not on this account yet. Offer nothing the server refuses. */
  if (signedIn && status && !status.hasPurchased && !status.hasReviewed) {
    if (status.blockedReason || !unclaimed) return null
    return (
      <p className="px-1 text-[13px] text-[#6b7280]">Add this order to your library above, then you can review it.</p>
    )
  }
  return (
    <ReviewForm
      productId={item.productId}
      productTitle={item.title}
      orderId={item.orderId}
      isLoggedIn={signedIn}
      hasPurchased
      hasReviewed={!!status?.hasReviewed}
      existingReview={status?.existingReview}
      redirectUrl={receiptPath}
      reviewerName={viewer.name || buyerFirstName}
      reviewerAvatarUrl={viewer.avatarUrl ?? null}
      loginHref={loginHref}
      signupHref={signupHref}
      onSuccess={() => setStatus((s) => ({ ...(s ?? {}), hasReviewed: true }))}
    />
  )
}
