"use client"

/**
 * ===========================================================================
 *  PAYMENTS, FOR A CREATOR ON STORELIB PAYMENTS (AIRWALLEX)
 * ===========================================================================
 * The Payments tab in Settings, when this creator is paid through Airwallex
 * (lib/payments). A creator on Stripe never sees this: the tab draws the
 * Stripe card it always did.
 *
 * One card says where they are and the one thing to do next, in Storelib's
 * words (lib/payments/model STAGE_COPY): Set up payments, Verify your
 * details, Payments under review, Action required, Add payout account,
 * Payments active. Under it, once they are verified: the balance Airwallex
 * reports, the payout account, and the payouts.
 *
 * Nothing here is worked out in the browser. Every figure and state is the
 * server's answer (/api/payments/overview), which is Airwallex's; the page
 * asks again after anything it did, and when the tab comes back into view.
 *
 * Airwallex's own forms (identity check, payout account, requests for
 * information) are its iframes, mounted in place with a one-time code the
 * server made for THIS creator's account (/api/payments/component). Where
 * Airwallex has not switched a form on for Storelib, the hosted page is used
 * instead, or the hub says plainly that it is not available yet.
 */

import * as React from "react"
import { AlertCircle, ArrowUpRight } from "lucide-react"
import { WaitingArea } from "@/components/ui/activity-spinner"
import { CountryPicker } from "@/components/app/settings/country-picker"
import { countryOf } from "@/lib/account/country"
import { decimalsOf } from "@/lib/payments/money"
import type { HubOverview } from "@/lib/payments/service"
import { cn } from "@/lib/utils"

const CARD = "bg-white rounded-2xl app-card-x py-4 sm:py-5 shadow-sm border border-[#e5e7eb]"
const PRIMARY =
  "inline-flex h-9 sm:h-10 items-center justify-center gap-1.5 rounded-xl bg-[#8b5cf6] px-4 sm:px-5 text-[13px] sm:text-[14px] font-semibold text-white transition-colors hover:bg-[#7c3aed] disabled:opacity-60 cursor-pointer disabled:cursor-default"
const SECONDARY =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb] disabled:opacity-60 cursor-pointer disabled:cursor-default"

type Overview = HubOverview

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/payments/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again in a moment.")
  return data
}

/** An amount in the smallest unit, in the currency's own form. */
export function money(minor: number, currency: string): string {
  const d = decimalsOf(currency)
  const value = minor / 10 ** d
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(value)
  } catch {
    return `${currency} ${value.toFixed(d)}`
  }
}

function shortDate(iso: string | null): string {
  if (!iso) return ""
  const t = Date.parse(iso.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"))
  if (!Number.isFinite(t)) return ""
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}

export function PaymentsHub() {
  const [data, setData] = React.useState<Overview | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  /* Which Airwallex form is open in place, if any. */
  const [form, setForm] = React.useState<null | "onboarding" | "payout_form" | "rfi">(null)

  const load = React.useCallback(async (how: "overview" | "refresh" = "overview") => {
    try {
      const next = how === "refresh" ? await call<Overview>("refresh", {}) : await call<Overview>("overview")
      setData(next)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load payments.")
    }
  }, [])

  React.useEffect(() => {
    void load()
    /* Back from Airwallex's page, or another tab: ask again. */
    const onVisible = () => {
      if (document.visibilityState === "visible") void load()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [load])

  /* Arriving back from the hosted verification page: Airwallex has news. */
  React.useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get("from") !== "verification") return
    url.searchParams.delete("from")
    url.searchParams.delete("error")
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
    void load("refresh")
  }, [load])

  const act = async (name: string, fn: () => Promise<void>) => {
    if (busy) return
    setBusy(name)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again in a moment.")
    } finally {
      setBusy(null)
    }
  }

  /** Verification: the embedded form for a business when Airwallex offers it, the hosted page otherwise. */
  const verify = () =>
    act("verify", async () => {
      if (!data) return
      if (data.can.embeddedOnboarding) {
        setForm("onboarding")
        return
      }
      if (!data.can.hostedOnboarding) throw new Error("Verification is not switched on for Storelib yet.")
      const { url } = await call<{ url: string }>("verify", {})
      window.location.assign(url)
    })

  /** What Airwallex asks for: its hosted page answers requests for information too. */
  const resolve = () =>
    act("resolve", async () => {
      if (!data) return
      if (data.can.hostedOnboarding) {
        const { url } = await call<{ url: string }>("verify", {})
        window.location.assign(url)
        return
      }
      if (data.can.embeddedPayoutForm) {
        setForm("rfi")
        return
      }
      throw new Error("This is not switched on for Storelib yet. Contact support.")
    })

  if (!data) {
    return error ? (
      <div className={CARD}>
        <p className="text-[14px] text-[#1a1a2e]">{error}</p>
        <button type="button" className={cn(SECONDARY, "mt-3")} onClick={() => void load()}>
          Try again
        </button>
      </div>
    ) : (
      <WaitingArea className="h-32" size={18} label="Loading payments" />
    )
  }

  if (!data.configured || data.tableMissing) {
    return (
      <div className={CARD}>
        <h3 className="text-[15px] sm:text-[16px] font-semibold text-[#1a1a2e]">Payments are not switched on yet</h3>
        <p className="mt-1 text-[13px] sm:text-[14px] text-[#6b7280]">Storelib is still setting this up. Your products can be published; checkout opens once payments are on.</p>
      </div>
    )
  }

  const copy = data.copy
  const verified = data.stage === "payout" || data.stage === "active"

  return (
    <div data-payments-hub="" data-stage={data.stage} className="space-y-[10px] sm:space-y-[14px]">
      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800">
          <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      ) : null}

      {/* ── Where they are, and the one thing to do ─────────────────── */}
      <section className={CARD} aria-labelledby="payments-status">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h3 id="payments-status" className="text-[15px] sm:text-[16px] font-semibold text-[#1a1a2e]">
                {copy.title}
              </h3>
              {data.environment === "sandbox" ? <span className="text-[12px] text-[#9ca3af]">Test account</span> : null}
            </div>
            {copy.line ? <p className="mt-0.5 text-[13px] sm:text-[14px] text-[#6b7280]">{copy.line}</p> : null}
            <p className="mt-1.5 text-[13px] text-[#6b7280]">{data.checkoutOpen ? "Checkout is on." : "Checkout is off until setup is finished."}</p>
          </div>
          {data.stage === "verify" ? (
            <button type="button" className={PRIMARY} disabled={!!busy} onClick={() => void verify()}>
              {busy === "verify" ? "Opening" : copy.action}
            </button>
          ) : data.stage === "action" ? (
            <button type="button" className={PRIMARY} disabled={!!busy} onClick={() => void resolve()}>
              {busy === "resolve" ? "Opening" : copy.action}
            </button>
          ) : data.stage === "payout" && data.can.embeddedPayoutForm && form !== "payout_form" ? (
            <button type="button" className={PRIMARY} onClick={() => setForm("payout_form")}>
              {copy.action}
            </button>
          ) : data.stage === "review" || data.stage === "checking" ? (
            <button type="button" className={SECONDARY} disabled={!!busy} onClick={() => void act("refresh", () => load("refresh"))}>
              {busy === "refresh" ? "Checking" : "Check again"}
            </button>
          ) : null}
        </div>

        {data.stage === "action" && data.requirements.length > 0 ? (
          <ul className="mt-3 space-y-1.5 border-t border-[#f0f1f3] pt-3">
            {data.requirements.map((r) => (
              <li key={r.key} className="text-[13px] sm:text-[14px] text-[#374151]">
                {r.text}
              </li>
            ))}
          </ul>
        ) : null}

        {data.stage === "payout" && !data.can.embeddedPayoutForm ? (
          <p className="mt-3 border-t border-[#f0f1f3] pt-3 text-[13px] text-[#6b7280]">Adding a payout account is not switched on for Storelib yet. We will email you when it is.</p>
        ) : null}

        {data.stage === "set_up" ? <SetUp onDone={(next) => setData(next)} busy={busy} setBusy={setBusy} setError={setError} /> : null}

        {form ? (
          <AirwallexForm
            purpose={form}
            onClose={() => setForm(null)}
            onDone={async () => {
              setForm(null)
              await load("refresh")
            }}
            onError={setError}
          />
        ) : null}
      </section>

      {/* ── Once verified: the money ────────────────────────────────── */}
      {verified ? <Balance data={data} onPaidOut={() => load("refresh")} setError={setError} /> : null}

      {verified && data.payoutDestination ? (
        <section className={CARD} aria-labelledby="payments-payout-account">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 id="payments-payout-account" className="text-[14px] font-semibold text-[#1a1a2e]">
                Payout account
              </h3>
              <p className="mt-0.5 text-[13px] sm:text-[14px] text-[#374151]">
                {data.payoutDestination.bankName || "Bank account"}
                {data.payoutDestination.last4 ? ` •••• ${data.payoutDestination.last4}` : ""}
                {data.payoutDestination.currency ? <span className="text-[#9ca3af]"> · {data.payoutDestination.currency}</span> : null}
              </p>
            </div>
            {data.can.embeddedPayoutForm && form !== "payout_form" ? (
              <button type="button" className={SECONDARY} onClick={() => setForm("payout_form")}>
                Replace
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {verified && data.payouts.length > 0 ? (
        <section className={cn(CARD, "px-0")} aria-labelledby="payments-payouts">
          <h3 id="payments-payouts" className="app-card-x text-[14px] font-semibold text-[#1a1a2e]">
            Payouts
          </h3>
          <ul className="mt-2">
            {data.payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 border-t border-[#f0f1f3] px-[var(--app-card-x,16px)] py-2.5 first:border-t-0">
                <span className="text-[13px] sm:text-[14px] text-[#374151]">{shortDate(p.createdAt)}</span>
                <span className="flex items-center gap-3">
                  <span className={cn("text-[13px]", p.status === "failed" ? "text-[#b91c1c]" : p.status === "paid" ? "text-[#6b7280]" : "text-[#92400e]")}>{p.statusText}</span>
                  <span className="text-[13px] sm:text-[14px] font-medium tabular-nums text-[#1a1a2e]">{money(p.amountMinor, p.currency)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

/* ── Set up: who is selling, where, and the consent ─────────────────── */

function SetUp({
  onDone,
  busy,
  setBusy,
  setError,
}: {
  onDone: (o: Overview) => void
  busy: string | null
  setBusy: (b: string | null) => void
  setError: (e: string | null) => void
}) {
  const [kind, setKind] = React.useState<"individual" | "business">("individual")
  const [countryName, setCountryName] = React.useState("")
  const [businessName, setBusinessName] = React.useState("")
  const [agree, setAgree] = React.useState(false)

  const start = async () => {
    if (busy) return
    const country = countryOf(countryName)
    if (!country) return setError("Choose your country.")
    if (kind === "business" && !businessName.trim()) return setError("Enter your business name.")
    if (!agree) return setError("Agree to continue.")
    setBusy("start")
    setError(null)
    try {
      onDone(await call<Overview>("start", { kind, country, businessName: kind === "business" ? businessName.trim() : undefined, agree: true }))
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not start setup. Try again.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-4 space-y-3.5 border-t border-[#f0f1f3] pt-4">
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-[#374151]">You are selling as</legend>
        <div role="radiogroup" className="inline-flex rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-0.5">
          {(["individual", "business"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "h-8 rounded-[10px] px-3.5 text-[13px] font-medium transition-colors cursor-pointer",
                kind === k ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6b7280] hover:text-[#374151]",
              )}
            >
              {k === "individual" ? "An individual" : "A business"}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="payments-country" className="mb-1.5 block text-[13px] font-medium text-[#374151]">
          {kind === "business" ? "Where the business is registered" : "Where you live"}
        </label>
        <CountryPicker id="payments-country" value={countryName} onChange={setCountryName} />
      </div>

      {kind === "business" ? (
        <div>
          <label htmlFor="payments-business" className="mb-1.5 block text-[13px] font-medium text-[#374151]">
            Business name
          </label>
          <input
            id="payments-business"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            maxLength={120}
            autoComplete="organization"
            className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 text-[15px] sm:text-[14px] text-[#1a1a2e] outline-none focus:border-[#c4b5fd] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.12)]"
          />
        </div>
      ) : null}

      <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-5 text-[#4b5563]">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#8b5cf6]" />
        <span>
          Storelib Payments is provided by Airwallex. I agree to the{" "}
          <a href="https://www.airwallex.com/terms/scale-user-terms-global" target="_blank" rel="noopener noreferrer" className="font-medium text-[#6d28d9] underline-offset-2 hover:underline">
            Airwallex terms
          </a>{" "}
          and to Storelib sharing my details with Airwallex so it can verify who I am.
        </span>
      </label>

      <button type="button" className={PRIMARY} disabled={busy !== null} onClick={() => void start()}>
        {busy === "start" ? "Setting up" : "Set up payments"}
      </button>
    </div>
  )
}

/* ── The money: balances and a payout ───────────────────────────────── */

function Balance({ data, onPaidOut, setError }: { data: Overview; onPaidOut: () => Promise<void>; setError: (e: string | null) => void }) {
  const [paying, setPaying] = React.useState<string | null>(null)
  const [amount, setAmount] = React.useState("")
  const [sending, setSending] = React.useState(false)

  if (data.balances.length === 0) {
    return (
      <section className={CARD} aria-labelledby="payments-balance">
        <h3 id="payments-balance" className="text-[14px] font-semibold text-[#1a1a2e]">
          Balance
        </h3>
        <p className="mt-0.5 text-[13px] sm:text-[14px] text-[#6b7280]">Nothing yet. Your share of each sale lands here.</p>
      </section>
    )
  }

  const send = async (currency: string) => {
    const d = decimalsOf(currency)
    const typed = amount.trim().replace(/,/g, "")
    if (!/^\d+(\.\d+)?$/.test(typed)) return setError("Enter an amount.")
    const [whole, frac = ""] = typed.split(".")
    if (frac.length > d) return setError(d === 0 ? "Enter a whole amount." : `Use at most ${d} decimals.`)
    const minor = Number(whole) * 10 ** d + (d ? Number(frac.padEnd(d, "0")) : 0)
    setSending(true)
    setError(null)
    try {
      await call("payout", { amountMinor: minor, currency })
      setPaying(null)
      setAmount("")
      await onPaidOut()
    } catch (e) {
      setError(e instanceof Error ? e.message : "The payout could not be started.")
    } finally {
      setSending(false)
    }
  }

  return (
    <section className={CARD} aria-labelledby="payments-balance">
      <h3 id="payments-balance" className="text-[14px] font-semibold text-[#1a1a2e]">
        Balance
      </h3>
      <ul className="mt-1">
        {data.balances.map((b) => (
          <li key={b.currency} className="border-t border-[#f0f1f3] py-3 first:border-t-0">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[20px] sm:text-[22px] font-semibold tabular-nums text-[#1a1a2e]">{money(b.availableMinor, b.currency)}</p>
                <p className="text-[12px] sm:text-[13px] text-[#6b7280]">
                  Available{b.pendingMinor > 0 ? ` · ${money(b.pendingMinor, b.currency)} on the way` : ""}
                </p>
              </div>
              {data.can.requestPayout && b.availableMinor > 0 && paying !== b.currency ? (
                <button
                  type="button"
                  className={SECONDARY}
                  onClick={() => {
                    setPaying(b.currency)
                    setAmount((b.availableMinor / 10 ** decimalsOf(b.currency)).toFixed(decimalsOf(b.currency)))
                  }}
                >
                  Pay out
                  <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            {paying === b.currency ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label htmlFor={`payout-${b.currency}`} className="sr-only">
                  Amount to pay out in {b.currency}
                </label>
                <input
                  id={`payout-${b.currency}`}
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-10 w-40 rounded-xl border border-[#e5e7eb] bg-white px-3 text-[15px] sm:text-[14px] tabular-nums text-[#1a1a2e] outline-none focus:border-[#c4b5fd] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.12)]"
                />
                <span className="text-[13px] text-[#6b7280]">{b.currency}</span>
                <button type="button" className={PRIMARY} disabled={sending} onClick={() => void send(b.currency)}>
                  {sending ? "Sending" : "Send to bank"}
                </button>
                <button type="button" className={SECONDARY} disabled={sending} onClick={() => setPaying(null)}>
                  Cancel
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {data.balancesAt ? <p className="mt-1 text-[12px] text-[#9ca3af]">As Airwallex reported at {new Date(data.balancesAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.</p> : null}
    </section>
  )
}

/* ── Airwallex's own forms, in place ────────────────────────────────── */

type Mounted = { destroy?: () => void; unmount?: () => void; on?: (e: string, h: (d: unknown) => void) => void; mount?: (el: HTMLElement | string) => void; submit?: () => Promise<unknown> }

function AirwallexForm({
  purpose,
  onClose,
  onDone,
  onError,
}: {
  purpose: "onboarding" | "payout_form" | "rfi"
  onClose: () => void
  onDone: () => Promise<void>
  onError: (e: string | null) => void
}) {
  const host = React.useRef<HTMLDivElement>(null)
  const element = React.useRef<Mounted | null>(null)
  const [ready, setReady] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    let gone = false
    ;(async () => {
      try {
        const auth = await call<{ authCode: string; codeVerifier: string; clientId: string; env: "sandbox" | "prod" }>("component", { purpose })
        const sdk = await import("@airwallex/components-sdk")
        await sdk.init({
          env: auth.env,
          locale: "en",
          enabledElements: purpose === "payout_form" ? ["payouts"] : ["onboarding"],
          authCode: auth.authCode,
          clientId: auth.clientId,
          codeVerifier: auth.codeVerifier,
        })
        if (gone) return
        const type = purpose === "onboarding" ? "kyc" : purpose === "payout_form" ? "beneficiaryForm" : "kycRfi"
        /* The SDK's own option types differ per element; the defaults are what Storelib wants. */
        const el = (await (sdk.createElement as (t: string, o?: unknown) => Promise<unknown>)(type, purpose === "onboarding" ? { hideHeader: true, hideNav: true } : {})) as Mounted | null
        if (gone || !el || !host.current) return
        element.current = el
        el.on?.("ready", (d) => {
          setReady(true)
          const status = (d as { kycStatus?: string } | null)?.kycStatus
          if (purpose === "onboarding" && status) void call("form-status", { status }).catch(() => {})
        })
        el.on?.("success", () => {
          if (purpose === "onboarding") void call("form-status", { status: "SUBMITTED" }).catch(() => {})
          if (purpose !== "payout_form") void onDone()
        })
        el.on?.("error", () => onError("Airwallex could not load this form. Try again in a moment."))
        el.mount?.(host.current)
      } catch (e) {
        if (!gone) onError(e instanceof Error ? e.message : "This form could not be opened.")
      }
    })()
    return () => {
      gone = true
      try {
        element.current?.destroy?.()
      } catch {
        /* already gone */
      }
      element.current = null
    }
    // One element per purpose; the callbacks are read when the events arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purpose])

  const save = async () => {
    if (!element.current?.submit || saving) return
    setSaving(true)
    onError(null)
    try {
      const result = (await element.current.submit()) as { values?: unknown; errors?: unknown } | null
      if (!result || result.errors || !result.values) throw new Error("Check the bank details and try again.")
      await call("payout-account", { payload: result.values })
      await onDone()
    } catch (e) {
      onError(e instanceof Error ? e.message : "The payout account could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 border-t border-[#f0f1f3] pt-4">
      {!ready ? <WaitingArea className="h-24" size={18} label="Loading the form" /> : null}
      <div ref={host} className={cn(!ready && "h-0 overflow-hidden")} />
      <div className="mt-3 flex flex-wrap gap-2">
        {purpose === "payout_form" ? (
          <button type="button" className={PRIMARY} disabled={!ready || saving} onClick={() => void save()}>
            {saving ? "Saving" : "Save payout account"}
          </button>
        ) : null}
        <button type="button" className={SECONDARY} disabled={saving} onClick={onClose}>
          {purpose === "payout_form" ? "Cancel" : "Close"}
        </button>
      </div>
    </div>
  )
}
