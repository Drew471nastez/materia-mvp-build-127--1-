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
 *   Connected         Printful, Printify, Gelato or CJ with a key it
 *                     accepted: orders for its location go there and
 *                     tracking comes back (Gelato and CJ with each variant
 *                     matched to theirs, ./partner-links.tsx); Shippo or
 *                     EasyPost: labels on the order page; ShipStation:
 *                     orders there, tracking back
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
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, CARD, Field, MUTED, Notice, Pill, SelectInput, TextInput, Toggle, api } from "./ui"
import { Mark } from "@/components/app/settings/integration-mark"
import { integrationById } from "@/lib/integrations/catalog"
import { PartnerLinks } from "./partner-links"
import { KEY_HINT, ShippingAppFacts } from "./shipping-app-facts"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"

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
  shipmentMethod?: string | null
  logistic?: string | null
  fromCountry?: string | null
  webhookAddress?: string | null
  labelsBought?: number
  ordersSent?: number
}

/** Gelato and CJ: each variant is matched to the partner's own product in Storelib, not by a shared SKU. */
const MATCHED_BY_LINK = new Set(["gelato", "cj_dropshipping"])

/** The key's name and where to find it, in each provider's own words. */
const KEY_FIELD: Record<string, { label: string; hint: string }> = {
  printful: { get label() { return tt("Printful private token") }, get hint() { return tt("Printful › Developer portal › Your tokens. Give it the orders, sync products and webhooks scopes. Checked with Printful, then stored encrypted on Storelib's server.") } },
  printify: { get label() { return tt("Printify personal access token") }, get hint() { return tt("Printify › My account › Connections › API tokens, with orders, products, shops and webhooks access. Checked with Printify, then stored encrypted on Storelib's server.") } },
  gelato: { get label() { return tt("Gelato API key") }, get hint() { return tt("Gelato › Developer › API keys. Checked with Gelato, then stored encrypted on Storelib's server.") } },
  cj_dropshipping: { get label() { return tt("CJ API key") }, get hint() { return tt("CJ › My CJ › Authorization › API, the API key (it looks like CJ1234567@api@…). Exchanged with CJ for a token, then stored encrypted on Storelib's server.") } },
}

/** The order a shop thinks in: getting it there first, then who makes and sends it. */
const ORDER: ProviderCategory[] = ["shipping", "print_on_demand", "dropshipping", "fulfillment", "supplier"]

const CATEGORY_LINE: Record<ProviderCategory, string> = {
  get shipping() { return tt("Live carrier rates at checkout and printed labels.") },
  get print_on_demand() { return tt("Products made to order and sent from the printer.") },
  get dropshipping() { return tt("A supplier's catalogue, shipped by the supplier.") },
  get fulfillment() { return tt("Your own warehouse or system, or you, packing orders.") },
  get supplier() { return tt("Orders emailed to whoever makes or keeps your stock.") },
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
  if (READY_WITHOUT_SETUP.has(provider.id)) return { tone: "green", label: tt("Ready") }
  /* Not built yet: Coming soon, whatever was saved before (a key kept from then is not used). */
  if (provider.availability === "needs_setup") return state && state.status !== "disconnected" ? { tone: "amber", label: tt("Coming soon · key saved") } : { tone: "gray", label: tt("Coming soon") }
  if (!state || state.status === "disconnected") return { tone: "gray", label: tt("Not connected") }
  /* A Printful or Printify key saved before they took orders (kept as needs_setup): it has no shop or location yet. */
  if (provider.availability === "connect" && state.status === "needs_setup") return { tone: "amber", label: tt("Connect again") }
  if (state.status === "connected") return { tone: "green", label: state.mode === "test" ? tt("Connected · Test") : tt("Connected") }
  if (state.status === "error") return { tone: "red", label: tt("Problem") }
  if (state.verifiedAt) return { tone: "blue", label: state.mode === "test" ? tt("Key verified · Test") : tt("Key verified") }
  return { tone: "amber", label: tt("Key saved") }
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
      {failed ? <Notice>{tt("Your integrations could not be read. Reload the page to try again.")}</Notice> : null}
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
  const [apiSecret, setApiSecret] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<string | null>(null)
  React.useEffect(() => setUrl(state?.url ?? ""), [state?.url])
  const connectable = !comingSoon && provider.fields.some((f) => f === "api_key" || f === "url")
  const status = statusOf(provider, state)
  const saved = !!state && state.status !== "disconnected"
  /* Printful and Printify: orders go there and tracking comes back (lib/integrations/fulfilment). */
  const sendsOrders = provider.availability === "connect" && provider.category !== "shipping"
  /* Shippo, EasyPost, ShipStation: labels on the order page, or orders out and tracking back (lib/integrations/shipping). */
  const shippingApp = provider.availability === "connect" && provider.category === "shipping"
  const keyed = shippingApp || sendsOrders

  const sendTest = async () => {
    setBusy(true)
    setError(null)
    setDone(null)
    const r = await api<{ status: number }>(`/api/physical/integrations/${provider.id}/test`, { method: "POST", body: {} })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setDone(tt("Sent. Your address answered {status}.", { status: r.data.status }))
  }

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
    setApiSecret("")
    setDone(said)
    /* Only the seller's choice keeps the fields open; a key saved or a disconnect closes them. */
    if (body.autoConfirm === undefined && body.shipmentMethod === undefined && body.logistic === undefined && body.fromCountry === undefined) setOpen(false)
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
          {state?.account && saved ? <p className="mt-1 text-[13px] text-[#374151]">{provider.id === "printify" ? tt("Shop") : provider.id === "printful" ? tt("Store") : tt("Account")}: {state.account}</p> : null}
          {state?.lastError ? <p className="mt-1 text-[12.5px] text-[#b42318]" data-integration-error="">{state.lastError}</p> : null}
        </div>
      </div>

      {sendsOrders && state?.status === "needs_setup" ? (
        <p className="mt-2 text-[13px] text-[#b54708] sm:pl-[58px]" data-integration-reconnect="">{tt("Your key was saved before {name} took orders. Connect again with it to", { name: provider.name })} {MATCHED_BY_LINK.has(provider.id) ? "start" : tt("choose your {value} and start", { value: provider.id === "printful" ? "store" : "shop" })} {tt("sending orders.")}</p>
      ) : null}
      {sendsOrders && state?.status === "connected" ? <ConnectedFacts provider={provider} state={state} /> : null}
      {shippingApp && state?.status === "connected" ? <ShippingAppFacts provider={provider} state={state} /> : null}
      {sendsOrders && state?.status === "connected" ? (
        <div className="mt-3 sm:pl-[58px]">
          <Toggle
            id={`auto-confirm-${provider.id}`}
            label={tt("Send orders straight to production")}
            description={
              provider.id === "cj_dropshipping"
                ? tt("Off, each order is made in CJ unpaid, and waits until you pay it there. On, it is confirmed and paid from your CJ balance as soon as your buyer pays.")
                : tt("Off, each order waits in {name} as a draft until you approve it there, and {name2} charges you only then. On, it is made and charged as soon as it is paid.", { name: provider.name, name2: provider.name })
            }
            checked={state?.autoConfirm === true}
            onChange={(on) => void save({ autoConfirm: on }, on ? tt("Orders now go straight to production.") : tt("Orders now wait for your approval."))}
            disabled={busy}
          />
        </div>
      ) : null}
      {sendsOrders && state?.status === "connected" && provider.id === "gelato" ? <GelatoChoices state={state} busy={busy} save={save} /> : null}
      {sendsOrders && state?.status === "connected" && provider.id === "cj_dropshipping" ? <CjChoices state={state} busy={busy} save={save} /> : null}
      {sendsOrders && state?.status === "connected" && MATCHED_BY_LINK.has(provider.id) ? <MatchProducts provider={provider} state={state} /> : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 sm:pl-[58px]">
        {provider.id === "csv" ? (
          <a href="/api/physical/orders/export" className={BTN_SECONDARY}>
            {tt("Download orders")}
          </a>
        ) : connectable ? (
          <button type="button" className={saved ? BTN_SECONDARY : BTN_PRIMARY} onClick={() => setOpen((v) => !v)} aria-expanded={open} data-integration-connect="">
            {open ? tt("Close") : saved ? tt("Manage") : tt("Connect")}
          </button>
        ) : null}
        {provider.id === "custom_webhook" && saved && !open ? (
          /* A signed ping, as an order is signed, so the seller's system can be checked before a real order. */
          <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => void sendTest()} data-integration-test="">
            {busy ? tt("Sending") : tt("Send a test")}
          </button>
        ) : null}
        {connectable ? null : comingSoon && saved ? (
          /* A key kept from before this was marked Coming soon: it does nothing, and it can go. */
          <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => void save({ disconnect: true }, tt("Removed."))} data-integration-remove-key="">
            {busy ? tt("Removing") : tt("Remove saved key")}
          </button>
        ) : provider.id === "supplier_email" ? (
          <span className="text-[13px] text-[#6b7280]">{tt("Set a supplier’s email on a location in Shipping.")}</span>
        ) : null}
        {provider.docsUrl ? (
          <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-[13.5px] font-medium text-[#4b5563] hover:text-[#1a1a2e]">
            {tt("Docs")}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}
      </div>
      {!open && done ? <p className="mt-2 text-[13px] text-[#067647] sm:pl-[58px]" data-integration-done="">{done}</p> : null}
      {!open && error ? <Notice className="mt-3 sm:ml-[58px]">{error}</Notice> : null}

      {open ? (
        <div className="mt-4 space-y-3 border-t border-[#eceef1] pt-4 sm:ml-[58px]">
          {provider.fields.includes("url") ? (
            <Field label={tt("Webhook address")} hint={tt("A public https address")}>
              <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/storelib/orders" inputMode="url" />
            </Field>
          ) : null}
          {provider.fields.includes("webhook_secret") ? (
            <Field label={tt("Signing secret")} hint={state?.secretHint ? tt("Saved, ends in {secretHint}. Leave empty to keep it.", { secretHint: state.secretHint }) : tt("16 characters or more. Check X-Storelib-Signature against it.")}>
              <TextInput type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} />
            </Field>
          ) : null}
          {provider.fields.includes("api_key") ? (
            <Field
              label={KEY_FIELD[provider.id]?.label ?? tt("{name} API key", { name: provider.name })}
              hint={
                state?.keyHint
                  ? tt("Saved, ends in {keyHint}. Leave empty to keep it.", { keyHint: state.keyHint })
                  : KEY_HINT[provider.id]
                    ? KEY_HINT[provider.id]
                  : KEY_FIELD[provider.id]
                    ? KEY_FIELD[provider.id].hint
                    : provider.verifies
                        ? tt("Checked with {name} when you save, then stored encrypted and never shown again.", { name: provider.name })
                        : tt("Stored encrypted and never shown again.")
              }
            >
              <TextInput type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} data-integration-key="" />
            </Field>
          ) : null}
          {provider.fields.includes("api_secret") ? (
            <Field label={tt("{name} API secret", { name: provider.name })} hint={state?.keyHint ? tt("Type both again to replace them.") : tt("Shown next to the key in ShipStation. Stored encrypted with it.")}>
              <TextInput type="password" autoComplete="off" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} data-integration-secret="" />
            </Field>
          ) : null}
          {error ? <Notice>{error}</Notice> : null}
          {open && done ? <p className="text-[13px] text-[#067647]" data-integration-done="">{done}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            {saved ? (
              <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => void save({ disconnect: true }, tt("Disconnected."))} data-integration-disconnect="">
                {tt("Disconnect")}
              </button>
            ) : null}
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={busy || (sendsOrders && !key.trim() && state?.status !== "needs_setup") || (shippingApp && (!key.trim() || (provider.fields.includes("api_secret") && !apiSecret.trim())))}
              onClick={() => void save({ url, webhookSecret: secret, apiKey: key, ...(provider.fields.includes("api_secret") ? { apiSecret } : {}) }, keyed ? tt("Connected to {name}.", { name: provider.name }) : tt("Saved."))}
              data-integration-save=""
            >
              {busy ? (provider.verifies && (key || state?.status === "needs_setup") ? tt("Checking with {name}", { name: provider.name }) : tt("Saving")) : keyed ? (state?.status === "connected" ? tt("Replace key") : tt("Connect")) : tt("Save")}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

/** Printful, Printify, Gelato and CJ, connected: where orders come from, how tracking gets back, when it last talked to Storelib. */
function ConnectedFacts({ provider, state }: { provider: ProviderInfo; state: IntegrationState }) {
  const cj = provider.id === "cj_dropshipping"
  const rows: { label: string; value: string }[] = [
    { label: tt("Orders from"), value: state.location ? `Products at the ${state.location.name} location` : "No location yet. Reconnect to make one." },
    { label: tt("Orders arrive as"), value: cj ? (state.autoConfirm ? "Paid from your CJ balance" : "Unpaid, to pay in CJ") : state.autoConfirm ? "Sent to production" : `Drafts to approve in ${provider.name}` },
    { label: tt("Tracking"), value: state.webhooks === "on" ? `${provider.name} tells Storelib as each parcel ships` : `Checked with ${provider.name} every few hours` },
    { label: tt("Last talked to"), value: state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString(appLocale(), zoned({ dateStyle: "medium", timeStyle: "short" })) : "Not yet" },
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
      {provider.id === "gelato" && state.webhookAddress && state.webhooks !== "on" ? <CopyAddress address={state.webhookAddress} /> : null}
      <p className="mt-2 text-[12.5px] leading-[18px] text-[#6b7280]">
        {MATCHED_BY_LINK.has(provider.id)
          ? tt("To send a product here: in the product, choose {value} and the {value2} location, then match each variant to {name}'s below.", { value: cj ? tt("Dropshipping") : tt("Print on demand"), value2: state.location?.name ?? provider.name, name: provider.name })
          : tt("To send a product here: in the product, choose Print on demand and the {value} location, and give each variant the same SKU it has in {name}.", { value: state.location?.name ?? provider.name, name: provider.name })}
      </p>
    </div>
  )
}

/** Gelato's webhook address, to paste in Gelato › Developer › Webhooks. Shown to the owner only, until the first delivery arrives. */
function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="mt-2 rounded-xl border border-[#eceef1] px-3 py-2.5" data-gelato-webhook-address="">
      <p className="text-[12.5px] text-[#6b7280]">{tt("In Gelato, Developer › Webhooks, add this address for order status and tracking code updates:")}</p>
      <div className="mt-1.5 flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md bg-[#f8f9fa] px-2 py-1.5 text-[12px] leading-[17px] text-[#1a1a2e]">{address}</code>
        <button
          type="button"
          className={cn(BTN_SECONDARY, "h-8 shrink-0 px-3 text-[13px]")}
          onClick={() => {
            void navigator.clipboard?.writeText(address).then(() => setCopied(true), () => setCopied(false))
          }}
        >
          {copied ? tt("Copied") : tt("Copy")}
        </button>
      </div>
    </div>
  )
}

type Save = (body: Record<string, unknown>, said: string) => Promise<void>

/** Gelato: the shipment method orders go by, from Gelato's own list for the store's main country. */
function GelatoChoices({ state, busy, save }: { state: IntegrationState; busy: boolean; save: Save }) {
  const [methods, setMethods] = React.useState<{ uid: string; name: string; hasTracking: boolean }[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const current = state.shipmentMethod ?? "normal"
  React.useEffect(() => {
    let live = true
    void api<{ methods: { uid: string; name: string; hasTracking: boolean }[] }>("/api/physical/integrations/gelato/shipment-methods").then((r) => {
      if (!live) return
      if (r.ok) setMethods(r.data.methods)
      else setError(r.error)
    })
    return () => {
      live = false
    }
  }, [])
  const options = [{ uid: "normal", name: "Standard (Gelato chooses)", hasTracking: true }, { uid: "express", name: "Express (Gelato chooses)", hasTracking: true }, ...(methods ?? []).filter((m) => m.uid !== "normal" && m.uid !== "express")]
  if (!options.some((o) => o.uid === current)) options.push({ uid: current, name: current, hasTracking: true })
  return (
    <div className="mt-3 sm:pl-[58px]" data-gelato-choices="">
      <Field label={tt("Shipment method")} hint={error ? error : tt("Every Gelato order goes by this. A method without tracking can't send tracking back to your buyer.")}>
        <SelectInput value={current} disabled={busy} onChange={(v) => void save({ shipmentMethod: v }, tt("Shipment method saved."))} data-gelato-method="">
          {options.map((o) => (
            <option key={o.uid} value={o.uid}>
              {o.name}
              {o.hasTracking ? "" : tt(" (no tracking)")}
            </option>
          ))}
        </SelectInput>
      </Field>
    </div>
  )
}

const CJ_FROM = [
  ["CN", "China"],
  ["US", "United States"],
  ["DE", "Germany"],
  ["GB", "United Kingdom"],
  ["FR", "France"],
  ["TH", "Thailand"],
  ["ID", "Indonesia"],
  ["BR", "Brazil"],
] as const

/** CJ: the warehouse country orders ship from, and the shipping method (the cheapest CJ quotes, or one by name). */
function CjChoices({ state, busy, save }: { state: IntegrationState; busy: boolean; save: Save }) {
  const named = state.logistic && state.logistic !== "cheapest" ? state.logistic : ""
  const [logistic, setLogistic] = React.useState(named)
  React.useEffect(() => setLogistic(named), [named])
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:pl-[58px]" data-cj-choices="">
      <Field label={tt("Ships from")} hint={tt("The CJ warehouse country orders leave from. Stock in step with CJ counts this country's warehouses.")}>
        <SelectInput value={state.fromCountry ?? "CN"} disabled={busy} onChange={(v) => void save({ fromCountry: v }, tt("Saved."))} data-cj-from="">
          {CJ_FROM.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label={tt("Shipping method")} hint={tt("Empty: the cheapest CJ quotes for each order. Or a CJ method by name, like CJPacket Ordinary.")}>
        <TextInput
          value={logistic}
          placeholder={tt("Cheapest")}
          disabled={busy}
          onChange={(e) => setLogistic(e.target.value)}
          onBlur={() => {
            const next = logistic.trim() || "cheapest"
            if (next !== (state.logistic ?? "cheapest")) void save({ logistic: next }, tt("Saved."))
          }}
          data-cj-logistic=""
        />
      </Field>
    </div>
  )
}

/** Gelato and CJ: the seller's products, each matched to the partner's, opened in place. */
function MatchProducts({ provider, state }: { provider: ProviderInfo; state: IntegrationState }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="mt-3 sm:pl-[58px]" data-match-products={provider.id}>
      <button type="button" className={BTN_SECONDARY} onClick={() => setOpen((v) => !v)} aria-expanded={open} data-match-products-open="">
        {open ? tt("Close products") : tt("Match products to {value}", { value: provider.id === "cj_dropshipping" ? "CJ" : provider.name })}
      </button>
      {open ? <PartnerLinks provider={provider.id as "gelato" | "cj_dropshipping"} name={provider.name} locationName={state.location?.name ?? null} /> : null}
    </div>
  )
}
