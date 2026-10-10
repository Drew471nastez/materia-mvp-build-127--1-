"use client"

/**
 * ===========================================================================
 *  INTEGRATIONS: EVERY SERVICE A SHOP CAN CONNECT, ON ONE PAGE
 * ===========================================================================
 * Shipping and labels, print on demand, dropshipping, fulfillment and
 * suppliers, each a card: the provider's mark, what it does, where it stands
 * and one button. It replaced a list of rows inside Shipping › Advanced,
 * which is where nobody looked for Printful.
 *
 * WHERE A CARD STANDS, in the words it uses:
 *
 *   Ready             works today with nothing to connect (ship it
 *                     yourself, CSV, a supplier's email on the location)
 *   Connected         a live integration with its address and secret saved
 *   Key verified      the provider accepted the key (provider-verify.ts),
 *                     with its account and Test when it is a test key;
 *                     Storelib does not send orders there yet, and the card
 *                     says so rather than pretend
 *   Key saved         kept, but the provider could not be asked
 *   Problem           the last attempt failed, with what was wrong
 *
 * Opening a card shows its fields under it, in place: no modal for two
 * inputs. A key goes in once and is never shown again, only its last four.
 *
 * The data is the commerce API's (app/api/physical/integrations), gated by
 * physical commerce like everything under it.
 */

import * as React from "react"
import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { CATEGORY_LABEL, PROVIDERS, type ProviderCategory, type ProviderInfo } from "@/lib/physical/providers"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, CARD, Field, MUTED, Notice, Pill, TextInput, api } from "./ui"

export interface IntegrationState {
  provider: string
  status: "connected" | "disconnected" | "error" | "needs_setup"
  url: string | null
  keyHint: string | null
  secretHint: string | null
  lastSyncAt: string | null
  lastError: string | null
  account?: string | null
  verifiedAt?: string | null
  mode?: "test" | "live" | null
}

/** The order a shop thinks in: getting it there first, then who makes and sends it. */
const ORDER: ProviderCategory[] = ["shipping", "print_on_demand", "dropshipping", "fulfillment", "supplier"]

const CATEGORY_LINE: Record<ProviderCategory, string> = {
  shipping: "Live carrier rates at checkout and printed labels.",
  print_on_demand: "Products made to order and sent from the printer.",
  dropshipping: "A supplier's catalogue, shipped by the supplier.",
  fulfillment: "Your own warehouse or system, or you, packing orders.",
  supplier: "Orders emailed to whoever makes or keeps your stock.",
}

const READY_WITHOUT_SETUP = new Set(["manual", "csv", "supplier_email"])

/** The provider's mark: its own logo file when one is named, else its initial on a quiet tile. */
function ProviderMark({ provider }: { provider: ProviderInfo }) {
  if (provider.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={provider.logo} alt="" className="h-11 w-11 shrink-0 rounded-xl border border-[#eceef1] bg-white object-contain p-1.5" />
  }
  return (
    <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#eceef1] bg-[#f6f7f9] text-[17px] font-semibold text-[#1a1a2e]">
      {provider.name.replace(/^(Your own |Ship it )/, "").charAt(0).toUpperCase()}
    </span>
  )
}

export function statusOf(provider: ProviderInfo, state: IntegrationState | null): { tone: "green" | "blue" | "amber" | "red" | "gray"; label: string } {
  if (READY_WITHOUT_SETUP.has(provider.id)) return { tone: "green", label: "Ready" }
  if (!state || state.status === "disconnected") return { tone: "gray", label: "Not connected" }
  if (state.status === "connected") return { tone: "green", label: "Connected" }
  if (state.status === "error") return { tone: "red", label: "Problem" }
  if (state.verifiedAt) return { tone: "blue", label: state.mode === "test" ? "Key verified · Test" : "Key verified" }
  return { tone: "amber", label: "Key saved" }
}

export function IntegrationsMarketplace({ initial }: { initial?: IntegrationState[] | null }) {
  const [states, setStates] = React.useState<IntegrationState[] | null>(initial ?? null)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => {
    if (initial) return
    let live = true
    void api<{ integrations: IntegrationState[] }>("/api/physical/integrations").then((r) => {
      if (!live) return
      if (r.ok) setStates(r.data.integrations)
      else setFailed(true)
    })
    return () => {
      live = false
    }
  }, [initial])

  const groups = ORDER.map((category) => ({ category, list: PROVIDERS.filter((p) => p.category === category) })).filter((g) => g.list.length)

  return (
    <div className="space-y-8" data-integrations-marketplace="">
      {failed ? <Notice>Your integrations could not be read. Reload the page to try again.</Notice> : null}
      {groups.map((g) => (
        <section key={g.category} aria-labelledby={`integrations-${g.category}`}>
          <h2 id={`integrations-${g.category}`} className="text-[15px] font-semibold text-[#1a1a2e]">
            {CATEGORY_LABEL[g.category]}
          </h2>
          <p className={cn(MUTED, "mt-0.5")}>{CATEGORY_LINE[g.category]}</p>
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {g.list.map((p) => (
              <IntegrationCard
                key={p.id}
                provider={p}
                state={states?.find((s) => s.provider === p.id) ?? null}
                loading={states === null && !failed}
                onSaved={setStates}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** One provider: its status, its button, and its fields in place. Also the Install part of its page in Settings › Integrations (components/app/settings/integrations-directory.tsx), open from the start. */
export function IntegrationCard({ provider, state, loading, onSaved, startOpen = false }: { provider: ProviderInfo; state: IntegrationState | null; loading: boolean; onSaved: (s: IntegrationState[]) => void; startOpen?: boolean }) {
  const [open, setOpen] = React.useState(startOpen)
  const [url, setUrl] = React.useState(state?.url ?? "")
  const [secret, setSecret] = React.useState("")
  const [key, setKey] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => setUrl(state?.url ?? ""), [state?.url])
  const connectable = provider.fields.some((f) => f === "api_key" || f === "url")
  const status = statusOf(provider, state)
  const saved = !!state && state.status !== "disconnected"

  const save = async (disconnect = false) => {
    setBusy(true)
    setError(null)
    const r = await api<{ integrations: IntegrationState[] }>(`/api/physical/integrations/${provider.id}`, {
      method: "PUT",
      body: disconnect ? { disconnect: true } : { url, webhookSecret: secret, apiKey: key },
    })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onSaved(r.data.integrations)
    setSecret("")
    setKey("")
    setOpen(false)
  }

  return (
    <li className={cn(CARD, "flex flex-col px-4 py-4 sm:px-5")} data-integration={provider.id} data-integration-status={status.label}>
      <div className="flex items-start gap-3.5">
        <ProviderMark provider={provider} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[15px] font-semibold text-[#1a1a2e]">{provider.name}</h3>
            {loading && !READY_WITHOUT_SETUP.has(provider.id) ? <span aria-hidden className="h-5 w-20 rounded-full bg-[#f1f2f4]" /> : <Pill tone={status.tone}>{status.label}</Pill>}
          </div>
          <p className="mt-1 text-[13.5px] leading-5 text-[#6b7280]">{provider.description}</p>
          {state?.account ? <p className="mt-1 text-[13px] text-[#374151]">Account: {state.account}</p> : null}
          {state?.lastError ? <p className="mt-1 text-[12.5px] text-[#b42318]">{state.lastError}</p> : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 sm:pl-[58px]">
        {provider.id === "csv" ? (
          <a href="/api/physical/orders/export" className={BTN_SECONDARY}>
            Download orders
          </a>
        ) : connectable ? (
          <button type="button" className={saved ? BTN_SECONDARY : BTN_PRIMARY} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "Close" : saved ? "Manage" : "Connect"}
          </button>
        ) : provider.id === "supplier_email" ? (
          <span className="text-[13px] text-[#6b7280]">Set a supplier&rsquo;s email on a location in Shipping.</span>
        ) : null}
        {provider.docsUrl ? (
          <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-[13.5px] font-medium text-[#4b5563] hover:text-[#1a1a2e]">
            Docs
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}
      </div>

      {open ? (
        <div className="mt-4 space-y-3 border-t border-[#eceef1] pt-4 sm:ml-[58px]">
          {provider.fields.includes("url") ? (
            <Field label="Webhook address" hint="A public https address">
              <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/storelib/orders" inputMode="url" />
            </Field>
          ) : null}
          {provider.fields.includes("webhook_secret") ? (
            <Field label="Signing secret" hint={state?.secretHint ? `Saved, ends in ${state.secretHint}. Leave empty to keep it.` : "16 characters or more. Check X-Storelib-Signature against it."}>
              <TextInput type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} />
            </Field>
          ) : null}
          {provider.fields.includes("api_key") ? (
            <Field
              label={`${provider.name} API key`}
              hint={
                state?.keyHint
                  ? `Saved, ends in ${state.keyHint}. Leave empty to keep it.`
                  : provider.verifies
                    ? `Checked with ${provider.name} when you save, then stored encrypted and never shown again.`
                    : "Stored encrypted and never shown again."
              }
            >
              <TextInput type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
            </Field>
          ) : null}
          {provider.availability === "needs_setup" ? (
            <Notice tone="gray">Storelib does not send orders to {provider.name} yet. Your verified key is ready for when it does, and orders for it are marked to send by hand until then.</Notice>
          ) : null}
          {error ? <Notice>{error}</Notice> : null}
          <div className="flex flex-wrap justify-end gap-2">
            {saved ? (
              <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => save(true)}>
                Disconnect
              </button>
            ) : null}
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => save(false)}>
              {busy ? (provider.verifies && key ? `Checking with ${provider.name}` : "Saving") : "Save"}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}
