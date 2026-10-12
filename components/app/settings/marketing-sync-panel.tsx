"use client"

/**
 * ===========================================================================
 *  KLAVIYO AND OMNISEND: THE SYNC CARD
 * ===========================================================================
 * On the integration's own page in Settings › Integrations, under the
 * onsite script's ID. Not connected: the key, Check key (Klaviyo then shows
 * its lists to choose from), Send what you already have, Connect. Connected:
 * what flows (out and in), when it last synced, how many went, the last
 * error in words, the list, Disconnect. The key never comes back from the
 * server: its last four characters only (lib/integrations/marketing).
 */
import * as React from "react"
import { ArrowDownLeft, ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Field, Notice, SelectInput, TextInput, Toggle, api, dateTime, peekGet } from "@/components/physical/ui"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"

export type MarketingProviderId = "klaviyo" | "omnisend"

export interface MarketingState {
  provider: MarketingProviderId
  connected: boolean
  keyHint: string | null
  account: string | null
  listId: string | null
  listName: string | null
  backfill: boolean
  backfillState: "running" | "done" | null
  lastSyncAt: string | null
  lastError: string | null
  counts: { subscribed: number; unsubscribed: number; customers: number; events: number; pulled: number }
  scopes: string[]
  ready: boolean
}

export const MARKETING_PATH = "/api/store/integrations/marketing"

const NAME: Record<MarketingProviderId, string> = { klaviyo: "Klaviyo", omnisend: "Omnisend" }
const WHERE: Record<MarketingProviderId, string> = {
  get klaviyo() { return tt("Klaviyo › Settings › Account › API keys › Create Private API Key. Give it the permissions listed below.") },
  get omnisend() { return tt("Omnisend › Store settings › API keys › Create API key, with the permissions listed below.") },
}
const FLOWS: Record<MarketingProviderId, { out: string[]; in: string[] }> = {
  klaviyo: {
    get out() { return [tt("Subscribers who said yes, onto your list"), tt("Buyers who did not ask, as profiles only"), tt("Placed Order, Ordered Product, Fulfilled, Canceled and Refunded Order"), tt("Started Checkout, when the news box was ticked"), tt("Unsubscribes on Storelib")] },
    get in() { return [tt("Unsubscribes, bounces and spam complaints")] },
  },
  omnisend: {
    get out() { return [tt("Subscribers who said yes, as email subscribers"), tt("Buyers who did not ask, as contacts only"), tt("placed order, paid for order, order fulfilled, order canceled, order refunded"), tt("Unsubscribes on Storelib")] },
    get in() { return [tt("Unsubscribes")] },
  },
}

function number(n: number): string {
  return new Intl.NumberFormat(appLocale()).format(n)
}

export function MarketingSyncPanel({ provider, onChanged }: { provider: MarketingProviderId; onChanged?: (all: MarketingState[]) => void }) {
  const name = NAME[provider]
  const [all, setAll] = React.useState<MarketingState[] | null>(() => peekGet<{ marketing: MarketingState[] }>(MARKETING_PATH)?.marketing ?? null)
  const state = all?.find((s) => s.provider === provider) ?? null
  const [key, setKey] = React.useState("")
  const [lists, setLists] = React.useState<{ id: string; name: string }[] | null>(null)
  const [account, setAccount] = React.useState<string | null>(null)
  const [listId, setListId] = React.useState("")
  const [backfill, setBackfill] = React.useState(true)
  const [busy, setBusy] = React.useState<null | "check" | "connect" | "list" | "disconnect">(null)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<string | null>(null)
  const [confirmOff, setConfirmOff] = React.useState(false)

  const take = React.useCallback(
    (next: MarketingState[]) => {
      setAll(next)
      onChanged?.(next)
    },
    [onChanged],
  )
  React.useEffect(() => {
    void api<{ marketing: MarketingState[] }>(MARKETING_PATH).then((r) => {
      if (r.ok) take(r.data.marketing)
    })
  }, [take])

  const send = async (body: Record<string, unknown>, step: NonNullable<typeof busy>) => {
    setBusy(step)
    setError(null)
    setDone(null)
    const r = await api<{ marketing: MarketingState[]; lists: { id: string; name: string }[] | null; account: string | null }>(MARKETING_PATH, { method: "POST", body: { provider, ...body } })
    setBusy(null)
    if (!r.ok) {
      setError(r.error)
      return null
    }
    take(r.data.marketing)
    return r.data
  }

  const checkKey = async () => {
    const r = await send({ step: "check", apiKey: key.trim() }, "check")
    if (!r) return
    setAccount(r.account ?? null)
    if (provider === "klaviyo") {
      const got = r.lists ?? []
      setLists(got)
      setListId((cur) => (got.some((l) => l.id === cur) ? cur : (got[0]?.id ?? "")))
      if (!got.length) setError(tt("Make a list in Klaviyo first (Audience › Lists & segments), then check again."))
    }
  }
  const connect = async () => {
    const r = await send({ step: "connect", apiKey: key.trim(), listId, backfill }, "connect")
    if (!r) return
    setKey("")
    setLists(null)
    setDone(backfill ? tt("Connected. Your subscribers and the last 90 days of orders are on their way to {name}.", { name }) : tt("Connected. New subscribers and orders go to {name} from now on.", { name }))
  }
  const loadLists = async () => {
    const r = await send({ step: "lists" }, "list")
    if (r?.lists) {
      setLists(r.lists)
      setListId(state?.listId ?? r.lists[0]?.id ?? "")
    }
  }
  const saveList = async () => {
    const r = await send({ listId }, "list")
    if (!r) return
    setLists(null)
    setDone(tt("Saved. New subscribers join that list from now on."))
  }
  const disconnect = async () => {
    const r = await send({ disconnect: true }, "disconnect")
    setConfirmOff(false)
    if (r) setDone(tt("Disconnected. Nothing more is sent to {name}. Your onsite ID above stays until you remove it.", { name }))
  }

  if (all && state && !state.ready) {
    return <Notice tone="amber">{tt("Sending to {name} needs its database update (SQL part 166). Until it runs, only the onsite script above works.", { name })}</Notice>
  }

  const flows = FLOWS[provider]
  const flowList = (
    <div className="grid gap-3 sm:grid-cols-2" data-marketing-flows="">
      <div>
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-[#6b7280]">
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          {tt("To {name}", { name })}
        </p>
        <ul className="mt-1.5 space-y-1 text-[13.5px] leading-[19px] text-[#374151]">
          {flows.out.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold uppercase tracking-[0.04em] text-[#6b7280]">
          <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden />
          {tt("From {name}", { name })}
        </p>
        <ul className="mt-1.5 space-y-1 text-[13.5px] leading-[19px] text-[#374151]">
          {flows.in.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>
    </div>
  )

  if (state?.connected) {
    const c = state.counts
    const stats: [string, number][] = [
      [tt("Subscribed"), c.subscribed],
      [tt("Customers"), c.customers],
      [tt("Order events"), c.events],
      [tt("Unsubscribed"), c.unsubscribed],
      [tt("Left in {name}", { name }), c.pulled],
    ]
    return (
      <div className="space-y-4" data-marketing-sync={provider} data-marketing-connected="">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-[14px] text-[#1a1a2e]">
            <span className="font-semibold">{state.account ?? name}</span>
            <span className="text-[#6b7280]"> · {tt("key ending")} {state.keyHint ?? "····"}</span>
          </p>
          <p className="text-[13px] text-[#6b7280]" data-marketing-last-sync="">
            {state.lastSyncAt ? tt("Last sync {date}", { date: dateTime(state.lastSyncAt) }) : tt("Not synced yet")}
            {state.backfillState === "running" ? tt(" · sending what you already had") : ""}
          </p>
        </div>
        {state.lastError ? <Notice tone="amber">{state.lastError}</Notice> : null}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-[#f1f2f4] py-3 sm:grid-cols-3" data-marketing-counts="">
          {stats.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="truncate text-[12.5px] text-[#6b7280]">{label}</dt>
              <dd className="text-[17px] font-semibold tabular-nums text-[#1a1a2e]">{number(value)}</dd>
            </div>
          ))}
        </dl>
        {flowList}
        {provider === "klaviyo" ? (
          <div className="border-t border-[#f1f2f4] pt-4">
            {lists ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <Field label={tt("List for subscribers")} htmlFor="marketing-list" className="min-w-0 flex-1">
                  <SelectInput id="marketing-list" value={listId} onChange={setListId}>
                    {lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <button type="button" className={BTN_PRIMARY} disabled={!!busy || !listId || listId === state.listId} onClick={() => void saveList()}>
                  {busy === "list" ? tt("Saving") : tt("Save")}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13.5px] text-[#374151]">
                  {tt("Subscribers join")} <span className="font-semibold text-[#1a1a2e]">{state.listName ?? state.listId ?? tt("your list")}</span>
                </p>
                <button type="button" className={cn(BTN_SECONDARY, "shrink-0 whitespace-nowrap")} disabled={!!busy} onClick={() => void loadLists()}>
                  {busy === "list" ? tt("Loading") : tt("Change list")}
                </button>
              </div>
            )}
          </div>
        ) : null}
        {error ? <Notice>{error}</Notice> : null}
        {done && !error ? <p className="text-[13px] text-[#067647]" data-marketing-done="">{done}</p> : null}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#f1f2f4] pt-4">
          {confirmOff ? (
            <>
              <span className="mr-auto text-[13px] text-[#6b7280]">{tt("Stop sending to {name}? Nothing already there is deleted.", { name })}</span>
              <button type="button" className={BTN_SECONDARY} disabled={!!busy} onClick={() => setConfirmOff(false)}>
                {tt("Keep")}
              </button>
              <button type="button" className={BTN_DANGER} disabled={!!busy} onClick={() => void disconnect()} data-marketing-disconnect-confirm="">
                {busy === "disconnect" ? tt("Disconnecting") : tt("Disconnect")}
              </button>
            </>
          ) : (
            <button type="button" className={BTN_DANGER} disabled={!!busy} onClick={() => setConfirmOff(true)} data-marketing-disconnect="">
              {tt("Disconnect")}
            </button>
          )}
        </div>
      </div>
    )
  }

  const checked = provider === "klaviyo" ? lists !== null && lists.length > 0 : account !== null
  return (
    <div className="space-y-4" data-marketing-sync={provider}>
      {flowList}
      <div className="space-y-3 border-t border-[#f1f2f4] pt-4">
        <Field label={provider === "klaviyo" ? tt("Private API key") : tt("API key")} htmlFor={`marketing-key-${provider}`} hint={tt("Where to find it: {where}", { where: WHERE[provider] })}>
          <TextInput
            id={`marketing-key-${provider}`}
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              setLists(null)
              setAccount(null)
            }}
            placeholder={provider === "klaviyo" ? "pk_..." : tt("Your Omnisend API key")}
            autoComplete="off"
            spellCheck={false}
            type="password"
          />
        </Field>
        <p className="text-[12.5px] leading-[18px] text-[#6b7280]" data-marketing-scopes="">
          {tt("Permissions:")} {state?.scopes.join(", ") ?? (provider === "klaviyo" ? tt("accounts:read, lists:read, lists:write, profiles:read, profiles:write, subscriptions:write, events:write") : tt("brands.read, contacts.read, contacts.write, events.write"))}
        </p>
        {checked ? (
          <div className="space-y-3 rounded-xl bg-[#f8f9fa] p-3 sm:p-4" data-marketing-checked="">
            <p className="text-[13.5px] text-[#067647]">{tt("Key works")}{account ? tt(" for {account}", { account }) : ""}.</p>
            {provider === "klaviyo" && lists ? (
              <Field label={tt("List for subscribers")} htmlFor="marketing-list-new">
                <SelectInput id="marketing-list-new" value={listId} onChange={setListId}>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            ) : null}
            <Toggle
              id={`marketing-backfill-${provider}`}
              label={tt("Send what you already have")}
              description={tt("Your subscribers who said yes, and the orders of the last 90 days, in batches. Past orders are sent as history, so no automation emails them again.")}
              checked={backfill}
              onChange={setBackfill}
            />
          </div>
        ) : null}
        {error ? <Notice>{error}</Notice> : null}
        {done && !error ? <p className="text-[13px] text-[#067647]" data-marketing-done="">{done}</p> : null}
        <div className="flex justify-end gap-2">
          {checked ? (
            <button type="button" className={cn(BTN_PRIMARY)} disabled={!!busy || (provider === "klaviyo" && !listId)} onClick={() => void connect()} data-marketing-connect="">
              {busy === "connect" ? tt("Connecting") : tt("Connect")}
            </button>
          ) : (
            <button type="button" className={BTN_PRIMARY} disabled={!!busy || key.trim().length < 10} onClick={() => void checkKey()} data-marketing-check="">
              {busy === "check" ? tt("Checking") : tt("Check key")}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
