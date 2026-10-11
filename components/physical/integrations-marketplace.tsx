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
 *   Connected         Printful or Printify with a key it accepted: orders
 *                     for its location go there and tracking comes back
 *   Coming soon       a service Storelib does not connect to yet: no
 *                     Connect button, and a key saved before can be removed
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
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, CARD, Field, MUTED, Notice, Pill, TextInput, Toggle, api } from "./ui"
import { Mark } from "@/components/app/settings/integration-mark"
import { integrationById } from "@/lib/integrations/catalog"

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
  autoConfirm?: boolean
  webhooks?: "on" | "off" | null
  webhookNote?: string | null
  location?: { id: string; name: string } | null
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

/**
 * The provider's mark: the directory's own (components/app/settings/integration-mark), so Printful, Shippo and the rest
 * carry their logo here too and Storelib's built in ones their drawing. It drew the provider's own logo field, which no
 * provider sets, so every card here was an initial while the same service's card in the directory had its logo.
 */
function ProviderMark({ provider }: { provider: ProviderInfo }) {
  const id = provider.id.replace(/_/g, "-")
  return <Mark item={{ id, name: provider.name, logo: provider.logo ?? integrationById(id)?.logo ?? null }} size={44} />
}

export function statusOf(provider: ProviderInfo, state: IntegrationState | null): { tone: "green" | "blue" | "amber" | "red" | "gray"; label: string } {
  if (READY_WITHOUT_SETUP.has(provider.id)) return { tone: "green", label: "Ready" }
  /* Not built yet: Coming soon, whatever was saved before (a key kept from then is not used). */
  if (provider.availability === "needs_setup") return state && state.status !== "disconnected" ? { tone: "amber", label: "Coming soon · key saved" } : { tone: "gray", label: "Coming soon" }
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
  const comingSoon = provider.availability === "needs_setup"
  const [open, setOpen] = React.useState(startOpen && !comingSoon)
  const [url, setUrl] = React.useState(state?.url ?? "")
  const [secret, setSecret] = React.useState("")
  const [key, setKey] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<string | null>(null)
  React.useEffect(() => setUrl(state?.url ?? ""), [state?.url])
  const connectable = !comingSoon && provider.fields.some((f) => f === "api_key" || f === "url")
  const status = statusOf(provider, state)
  const saved = !!state && state.status !== "disconnected"
  /* Printful and Printify: orders go there and tracking comes back (lib/integrations/fulfilment). */
  const sendsOrders = provider.availability === "connect"

  const save = async (body: Record<string, unknown>, said: string) => {
    setBusy(true)
    setError(null)
    setDone(null)
    const r = await api<{ integrations: IntegrationState[] }>(`/api/physical/integrations/${provider.id}`, { method: "PUT", body })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    onSaved(r.data.integrations)
    setSecret("")
    setKey("")
    setDone(said)
    /* Only the seller's choice keeps the fields open; a key saved or a disconnect closes them. */
    if (body.autoConfirm === undefined) setOpen(false)
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
          {state?.account && saved ? <p className="mt-1 text-[13px] text-[#374151]">{provider.id === "printify" ? "Shop" : provider.id === "printful" ? "Store" : "Account"}: {state.account}</p> : null}
          {state?.lastError ? <p className="mt-1 text-[12.5px] text-[#b42318]" data-integration-error="">{state.lastError}</p> : null}
        </div>
      </div>

      {sendsOrders && saved && state ? <ConnectedFacts provider={provider} state={state} /> : null}
      {sendsOrders && saved ? (
        <div className="mt-3 sm:pl-[58px]">
          <Toggle
            id={`auto-confirm-${provider.id}`}
            label="Send orders straight to production"
            description={`Off, each order waits in ${provider.name} as a draft until you approve it there, and ${provider.name} charges you only then. On, it is made and charged as soon as it is paid.`}
            checked={state?.autoConfirm === true}
            onChange={(on) => void save({ autoConfirm: on }, on ? "Orders now go straight to production." : "Orders now wait for your approval.")}
            disabled={busy}
          />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 sm:pl-[58px]">
        {provider.id === "csv" ? (
          <a href="/api/physical/orders/export" className={BTN_SECONDARY}>
            Download orders
          </a>
        ) : connectable ? (
          <button type="button" className={saved ? BTN_SECONDARY : BTN_PRIMARY} onClick={() => setOpen((v) => !v)} aria-expanded={open} data-integration-connect="">
            {open ? "Close" : saved ? "Manage" : "Connect"}
          </button>
        ) : comingSoon && saved ? (
          /* A key kept from before this was marked Coming soon: it does nothing, and it can go. */
          <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => void save({ disconnect: true }, "Removed.")} data-integration-remove-key="">
            {busy ? "Removing" : "Remove saved key"}
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
      {!open && done ? <p className="mt-2 text-[13px] text-[#067647] sm:pl-[58px]" data-integration-done="">{done}</p> : null}
      {!open && error ? <Notice className="mt-3 sm:ml-[58px]">{error}</Notice> : null}

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
              label={provider.id === "printful" ? "Printful private token" : provider.id === "printify" ? "Printify personal access token" : `${provider.name} API key`}
              hint={
                state?.keyHint
                  ? `Saved, ends in ${state.keyHint}. Leave empty to keep it.`
                  : provider.id === "printful"
                    ? "Printful › Developer portal › Your tokens. Give it the orders, sync products and webhooks scopes. Checked with Printful, then stored encrypted on Storelib's server."
                    : provider.id === "printify"
                      ? "Printify › My account › Connections › API tokens, with orders, products, shops and webhooks access. Checked with Printify, then stored encrypted on Storelib's server."
                      : provider.verifies
                        ? `Checked with ${provider.name} when you save, then stored encrypted and never shown again.`
                        : "Stored encrypted and never shown again."
              }
            >
              <TextInput type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} data-integration-key="" />
            </Field>
          ) : null}
          {error ? <Notice>{error}</Notice> : null}
          {open && done ? <p className="text-[13px] text-[#067647]" data-integration-done="">{done}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            {saved ? (
              <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => void save({ disconnect: true }, "Disconnected.")} data-integration-disconnect="">
                Disconnect
              </button>
            ) : null}
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={busy || (sendsOrders && !key.trim())}
              onClick={() => void save({ url, webhookSecret: secret, apiKey: key }, sendsOrders ? `Connected to ${provider.name}.` : "Saved.")}
              data-integration-save=""
            >
              {busy ? (provider.verifies && key ? `Checking with ${provider.name}` : "Saving") : sendsOrders ? (saved ? "Replace key" : "Connect") : "Save"}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

/** Printful and Printify, connected: where orders come from, how tracking gets back, when it last talked to Storelib. */
function ConnectedFacts({ provider, state }: { provider: ProviderInfo; state: IntegrationState }) {
  const rows: { label: string; value: string }[] = [
    { label: "Orders from", value: state.location ? `Products at the ${state.location.name} location` : "No location yet. Reconnect to make one." },
    { label: "Orders arrive as", value: state.autoConfirm ? "Sent to production" : `Drafts to approve in ${provider.name}` },
    { label: "Tracking", value: state.webhooks === "on" ? `${provider.name} tells Storelib as each parcel ships` : `Checked with ${provider.name} every few hours` },
    { label: "Last talked to", value: state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Not yet" },
  ]
  return (
    <div className="mt-3 sm:pl-[58px]" data-integration-facts="">
      <dl className="divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <dt className="shrink-0 text-[12.5px] text-[#6b7280]">{r.label}</dt>
            <dd className="text-[13px] font-medium text-[#1a1a2e] sm:text-right">{r.value}</dd>
          </div>
        ))}
      </dl>
      {state.webhooks === "off" && state.webhookNote ? <p className="mt-2 text-[12.5px] leading-[18px] text-[#6b7280]">{state.webhookNote}</p> : null}
      <p className="mt-2 text-[12.5px] leading-[18px] text-[#6b7280]">
        To send a product here: in the product, choose Print on demand and the {state.location?.name ?? provider.name} location, and give each variant the same SKU it has in {provider.name}.
      </p>
    </div>
  )
}
