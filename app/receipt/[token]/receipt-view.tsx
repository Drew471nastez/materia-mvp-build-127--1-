"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { downloadEntitledFile } from "@/components/download-button"
import { ReviewForm } from "@/components/reviews/review-form"
import { getStoreUrl } from "@/lib/url-helpers"
import { isNativeApp } from "@/lib/platform-utils"
import { formatFileSize, formatMoney, type AccessState } from "@/lib/receipts/rules"
import type { ReceiptItem, ReceiptView as Receipt, ReceiptViewer } from "@/lib/receipts/view"

/**
 * The receipt and the files, for the buyer. Everything it shows arrives from
 * the server already decided (lib/receipts/load.ts): which lines are paid,
 * which files each one includes, what the payment came to. This component
 * only presents it and calls the routes that act on it. It never decides who
 * may download; /api/download does that again on every click.
 */

const CARD = "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
const PRIMARY =
  "inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[#8b5cf6] px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[#7c3aed] disabled:cursor-default disabled:opacity-60"
const SECONDARY =
  "inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-[#e5e7eb] bg-white px-4 text-[14px] font-semibold text-[#1a1a2e] transition-colors hover:bg-[#f8f9fa] disabled:cursor-default disabled:opacity-60"
const TEXT_BUTTON = "text-[14px] font-semibold text-[#8b5cf6] hover:text-[#7c3aed] disabled:opacity-60"

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
  refunded: { text: "Refunded, files closed", tone: "text-[#b91c1c]" },
  failed: { text: "Payment failed", tone: "text-[#b91c1c]" },
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

function FileRow({ file, token }: { file: ReceiptItem["files"][number]; token: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const onDownload = async () => {
    setBusy(true)
    setError(null)
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
  return (
    <li className="border-t border-[#f1f3f5] py-2.5 first:border-t-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-[#1a1a2e]" title={file.name}>
            {file.name}
          </p>
          {size ? <p className="text-[12px] text-[#9ca3af] tabular-nums">{size}</p> : null}
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={busy}
          className="inline-flex h-9 min-w-[96px] shrink-0 items-center justify-center rounded-lg bg-[#f5f3ff] px-3.5 text-[13px] font-semibold text-[#6d28d9] transition-colors hover:bg-[#ede9fe] disabled:cursor-default disabled:opacity-60 print:hidden"
        >
          {busy ? "Preparing" : done ? "Downloaded" : "Download"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-[13px] text-[#b91c1c]">
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
  return (
    <section className="px-4 py-4 sm:px-5">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#f1f3f5]">
          {item.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug text-[#1a1a2e] [overflow-wrap:anywhere]">{item.title}</p>
          {item.variantName ? <p className="mt-0.5 text-[13px] text-[#6b7280]">{item.variantName}</p> : null}
          {status ? <p className={`mt-0.5 text-[13px] font-medium ${status.tone}`}>{status.text}</p> : null}
        </div>
        <p className="shrink-0 text-[15px] font-semibold tabular-nums text-[#1a1a2e]">
          {item.totalCents === 0 ? "Free" : formatMoney(item.subtotalCents, currency, locale)}
        </p>
      </div>

      {item.state === "open" ? (
        <div className="mt-3 pl-[60px] max-[359px]:pl-0">
          {item.files.length > 0 ? (
            <ul>
              {item.files.map((f) => (
                <FileRow key={f.id} file={f} token={item.token} />
              ))}
            </ul>
          ) : null}

          {item.courseHref ? (
            viewer.isBuyer ? (
              <Link href={item.courseHref} className={`${PRIMARY} mt-1 print:hidden`}>
                Open course
              </Link>
            ) : (
              <p className="text-[13px] text-[#6b7280]">
                The course is in your library.{" "}
                <Link href={signInHref} className="font-semibold text-[#8b5cf6]">
                  Sign in with the email you paid with
                </Link>{" "}
                to open it.
              </p>
            )
          ) : null}

          {item.files.length === 0 && !item.courseHref ? (
            <p className="text-[13px] text-[#6b7280]">No files come with this item.</p>
          ) : null}
        </div>
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

  const cardLine =
    receipt.payment.brand && receipt.payment.last4
      ? `${receipt.payment.brand.charAt(0).toUpperCase()}${receipt.payment.brand.slice(1)} ending ${receipt.payment.last4}`
      : receipt.payment.method === "paypal"
        ? "PayPal"
        : null

  return (
    <main data-receipt="" className="min-h-[100dvh] bg-[#f8f9fa] print:bg-white">
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
          <button type="button" onClick={() => window.print()} className={`${TEXT_BUTTON} min-h-[44px] text-[#6b7280] hover:text-[#1a1a2e] print:hidden`}>
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
        <div className={`${CARD} mt-6 overflow-hidden print:shadow-none`}>
          <div className="divide-y divide-[#e5e7eb]/60">
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

          <dl className="space-y-1.5 border-t border-[#e5e7eb]/60 px-4 py-4 text-[14px] sm:px-5">
            {receipt.tipCents > 0 || receipt.items.length > 1 ? (
              <Row label="Subtotal" value={money(receipt.subtotalCents)} />
            ) : null}
            {receipt.tipCents > 0 ? <Row label="Tip" value={money(receipt.tipCents)} /> : null}
            <Row label="Total" value={receipt.totalCents === 0 ? "Free" : money(receipt.totalCents)} strong />
            {receipt.refundedCents > 0 ? <Row label="Refunded" value={`−${money(receipt.refundedCents)}`} tone="text-[#b91c1c]" /> : null}
            {cardLine && receipt.totalCents > 0 && receipt.state !== "pending" && receipt.state !== "failed" ? (
              <p className="pt-1 text-[13px] text-[#9ca3af]">Paid with {cardLine}</p>
            ) : null}
            {receipt.invoice && receipt.state !== "pending" && receipt.state !== "failed" ? (
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
                className={`${TEXT_BUTTON} min-h-[44px] pt-1 text-[13px] font-medium text-[#6d28d9] hover:text-[#5b21b6] print:hidden`}
              >
                Download invoice (PDF)
              </a>
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
          <div className={`${CARD} mt-4 px-4 py-4 sm:px-5 print:hidden`}>
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-[14px] text-[#4b5563]">
                {receipt.buyer.email === "failed" ? "We could not email " : "Receipt emailed to "}
                <span className="font-medium text-[#1a1a2e] [overflow-wrap:anywhere]">{receipt.buyer.maskedEmail}</span>
              </p>
              <button type="button" onClick={resend} disabled={emailState === "sending"} className={`${TEXT_BUTTON} min-h-[44px] shrink-0`}>
                {emailState === "sending" && !changing ? "Sending" : "Resend"}
              </button>
            </div>

            {changing ? (
              <form onSubmit={changeEmail} className="mt-2 flex flex-col gap-2 sm:flex-row">
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
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-10 min-w-0 flex-1 rounded-xl border border-[#e5e7eb] bg-white px-3 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20"
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
              <button type="button" onClick={() => setChanging(true)} className="mt-1 text-[13px] text-[#6b7280] underline-offset-2 hover:text-[#1a1a2e] hover:underline">
                Wrong address?
              </button>
            )}

            {emailNote ? (
              <p role="status" className={`mt-2 text-[13px] ${emailState === "error" ? "text-[#b91c1c]" : "text-[#047857]"}`}>
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
              <Link href="/library" className={`${CARD} mt-4 flex min-h-[56px] items-center justify-between px-4 sm:px-5 print:hidden`}>
                <span className="text-[14px] font-semibold text-[#1a1a2e]">Open your library</span>
                <span className="text-[14px] text-[#9ca3af]" aria-hidden>
                  →
                </span>
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
            <ReviewSlot item={single} viewer={viewer} receiptPath={receiptPath} seller={receipt.seller} />
          </div>
        ) : null}
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
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#ede9fe] text-[13px] font-semibold text-[#6d28d9]">
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
 * buyer already reviewed, and shows nothing until it knows.
 */
function ReviewSlot({
  item,
  viewer,
  receiptPath,
  seller,
}: {
  item: ReceiptItem
  viewer: ReceiptViewer
  receiptPath: string
  seller: Receipt["seller"]
}) {
  const [status, setStatus] = useState<{ isLoggedIn?: boolean; hasReviewed?: boolean; existingReview?: any } | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    fetch(`/api/reviews/check?productId=${encodeURIComponent(item.productId)}`)
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
  }, [item.productId])

  if (!ready) return null
  return (
    <ReviewForm
      productId={item.productId}
      productTitle={item.title}
      orderId={item.orderId}
      isLoggedIn={status?.isLoggedIn ?? viewer.signedIn}
      hasPurchased
      hasReviewed={!!status?.hasReviewed}
      existingReview={status?.existingReview}
      redirectUrl={receiptPath}
      creatorAvatarUrl={seller.avatarUrl}
      creatorName={seller.name}
      onSuccess={() => setStatus((s) => ({ ...(s ?? {}), hasReviewed: true }))}
    />
  )
}
