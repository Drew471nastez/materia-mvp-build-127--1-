"use client"

/**
 * ===========================================================================
 *  SETTINGS › CHECKOUT
 * ===========================================================================
 * How the store's checkout behaves, for every product it sells: the digital
 * checkout (app/checkout) and the physical one (app/checkout/physical) both
 * read the same object (lib/store/checkout-config.ts), and the routes that
 * take the payment check it again, so nothing here is only a matter of what
 * the page shows.
 *
 *   abandoned checkouts   the reminder email to a buyer who reached Pay and
 *                         left, when they agreed to hear from the store
 *   customer accounts     an account before paying, and a confirmed one
 *   marketing             the unticked "Email me with news and offers" box
 *   customer information  the name as one field or two, and whether company,
 *                         phone and the second address line are asked for
 *
 * Saved as each one changes, the way Shopify's checkout settings are; a
 * line at the foot says when the last change was kept.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { Card, Notice, Toggle, api, peekGet } from "@/components/physical/ui"
import { DEFAULT_CHECKOUT, checkoutConfig, type CheckoutConfig, type FieldRule } from "@/lib/store/checkout-config"
import { tt } from "@/lib/i18n/text"

const RULES: { id: FieldRule; label: string }[] = [
  { id: "off", get label() { return tt("Don't include") } },
  { id: "optional", get label() { return tt("Optional") } },
  { id: "required", get label() { return tt("Required") } },
]

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-full max-w-full gap-1 rounded-xl bg-[#f1f2f4] p-1 sm:w-auto" data-segmented={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            /* Each as wide as its words on a phone, the row shared out by what is left: "Don't include" is longer than "Optional". */
            "h-8 flex-auto whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 sm:flex-none sm:px-3",
            value === o.id ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6b7280] hover:text-[#1a1a2e]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Row({ title, line, children }: { title: string; line?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-[#f0f1f3] py-3.5 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-[14px] font-medium leading-5 text-[#1a1a2e]">{title}</p>
        {line ? <p className="mt-0.5 text-[13px] leading-[18px] text-[#6b7280]">{line}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function CheckoutPanel() {
  const physical = usePhysicalCommerceEnabled()
  const [config, setConfig] = React.useState<CheckoutConfig | null>(() => {
    const kept = peekGet<{ settings: { checkout: CheckoutConfig } }>("/api/store/settings")
    return kept ? checkoutConfig(kept.settings.checkout) : null
  })
  const [ready, setReady] = React.useState(() => peekGet<{ settings: { ready: boolean } }>("/api/store/settings")?.settings.ready ?? true)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState<"idle" | "saving" | "saved">("idle")
  const pending = React.useRef<Partial<CheckoutConfig>>({})
  const timer = React.useRef<number | null>(null)

  React.useEffect(() => {
    void api<{ settings: { checkout: CheckoutConfig; ready: boolean } }>("/api/store/settings").then((r) => {
      if (!r.ok) {
        setError(r.error)
        setConfig(DEFAULT_CHECKOUT)
        return
      }
      setConfig(checkoutConfig(r.data.settings.checkout))
      setReady(r.data.settings.ready)
    })
  }, [])

  /* Changes are gathered for a moment and sent together, so three quick presses are one save. */
  const change = (patch: Partial<CheckoutConfig>) => {
    setConfig((c) => checkoutConfig({ ...(c ?? DEFAULT_CHECKOUT), ...patch }))
    pending.current = { ...pending.current, ...patch }
    setSaved("saving")
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      timer.current = null
      const body = pending.current
      pending.current = {}
      const r = await api<{ settings: { checkout: CheckoutConfig } }>("/api/store/settings", { method: "PUT", body: { checkout: body } })
      if (!r.ok) {
        setError(r.error)
        setSaved("idle")
        return
      }
      setError(null)
      setConfig(checkoutConfig(r.data.settings.checkout))
      setSaved("saved")
    }, 450)
  }
  /*
    A change still waiting when the section closes (another section pressed, the sheet closed, within the moment
    changes are gathered for) is sent now, not dropped: it used to be thrown away with the timer, so a toggle flipped
    on the way out read as saved and never reached checkout.
  */
  React.useEffect(() => () => {
    if (!timer.current) return
    window.clearTimeout(timer.current)
    timer.current = null
    const body = pending.current
    pending.current = {}
    if (Object.keys(body).length) void api("/api/store/settings", { method: "PUT", body: { checkout: body } })
  }, [])

  if (!config) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-[120px] animate-pulse rounded-2xl border border-[#e5e7eb]/60 bg-white" />
        <div className="h-[260px] animate-pulse rounded-2xl border border-[#e5e7eb]/60 bg-white" />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6" data-checkout-settings="">
      {!ready ? <Notice tone="amber">{tt("Checkout settings need their database update (SQL part 109). Until it runs, checkout works as it always has and changes here are not kept.")}</Notice> : null}

      <Card title={tt("Customer accounts")} description={tt("Whether buyers sign in before they pay.")} help="checkout">
        <div className="space-y-4">
          <Toggle
            label={tt("Require customers to sign in")}
            description={tt("Buyers create an account or log in before checkout. Signed out visitors can still browse.")}
            checked={config.requireAccount}
            onChange={(v) => change({ requireAccount: v, ...(v ? {} : { requireConfirmedEmail: false }) })}
          />
          <Toggle
            label={tt("Require a confirmed email address")}
            description={tt("They can't place an order until they click the link we email them when they sign up. Turns on sign in as well.")}
            checked={config.requireConfirmedEmail}
            onChange={(v) => change({ requireConfirmedEmail: v, ...(v ? { requireAccount: true } : {}) })}
          />
        </div>
      </Card>

      <Card title={tt("Marketing")} description={tt("Asking buyers if they want to hear from you, the way the law in most places expects.")}>
        <Toggle
          label={tt("Show the email news box")}
          description={tt("An unticked “Email me with news and offers” box under the email. Only buyers who tick it get your campaigns.")}
          checked={config.marketingOptIn}
          onChange={(v) => change({ marketingOptIn: v })}
        />
      </Card>

      <Card title={tt("Abandoned checkouts")} description={tt("A buyer who reached Pay and left without paying.")}>
        <Toggle
          label={tt("Send a checkout reminder")}
          description={
            config.marketingOptIn
              ? tt("One email an hour later with a link back to what they chose, only to buyers who ticked the news box. It stops the moment they buy.")
              : tt("One email an hour later, only to buyers who ticked the news box. With the news box hidden nobody can tick it, so no reminder goes out.")
          }
          checked={config.abandonedRecovery}
          onChange={(v) => change({ abandonedRecovery: v })}
        />
      </Card>

      {physical ? (
        <Card title={tt("Cancellations")} description={tt("Orders that ship, before you send them.")}>
          <Toggle
            label={tt("Let buyers ask to cancel")}
            description={tt("Cancel order on the buyer's order page while the order is still Unfulfilled. You get an email and answer from the order: cancel and refund it, or keep it. Nothing is cancelled until you do.")}
            checked={config.buyerCancel}
            onChange={(v) => change({ buyerCancel: v })}
          />
        </Card>
      ) : null}

      <Card title={tt("Customer information")} description={tt("What checkout asks for. Email is always asked.")}>
        <div>
          <Row title={tt("Full name")} line={tt("One field, or first and last name apart.")}>
            <Segmented
              label={tt("Full name")}
              value={config.nameFields}
              onChange={(v) => change({ nameFields: v })}
              options={[
                { id: "last_only", label: tt("One field") },
                { id: "first_and_last", label: tt("First and last") },
              ]}
            />
          </Row>
          {physical ? (
            <>
              <Row title={tt("Company name")} line={tt("Physical orders.")}>
                <Segmented label={tt("Company name")} value={config.company} onChange={(v) => change({ company: v })} options={RULES} />
              </Row>
              <Row title={tt("Phone number")} line={tt("Physical orders. Couriers use it to reach the buyer.")}>
                <Segmented label={tt("Phone number")} value={config.phone} onChange={(v) => change({ phone: v })} options={RULES} />
              </Row>
              <Row title={tt("Address line 2")} line={tt("Apartment, suite or unit.")}>
                <Segmented label={tt("Address line 2")} value={config.address2} onChange={(v) => change({ address2: v })} options={RULES} />
              </Row>
            </>
          ) : null}
        </div>
      </Card>

      {error ? <Notice>{error}</Notice> : null}
      <p className="px-1 text-[12.5px] text-[#6b7280]" aria-live="polite" data-checkout-saved={saved}>
        {saved === "saving" ? tt("Saving") : saved === "saved" ? tt("Saved. Your checkout shows it within a few seconds.") : tt("Changes are saved as you make them and reach your checkout within a few seconds.")}
      </p>
    </div>
  )
}
