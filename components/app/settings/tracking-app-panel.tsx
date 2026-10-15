"use client"

/**
 * ===========================================================================
 *  SETTINGS › INTEGRATIONS › COURIER TRACKING (AND AFTERSHIP): THE SETUP CARD
 * ===========================================================================
 * What Storelib's courier tracking does for this store right now (on, with
 * how many parcels followed, or not set up yet), and the store's own
 * AfterShip or 17TRACK account if it wants its parcels followed there
 * (lib/physical/tracking/accounts-server.ts). The key is checked with the
 * service before it is kept, and only its last four characters come back.
 */
import * as React from "react"
import { Copy } from "lucide-react"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Field, Notice, SelectInput, TextInput, api, dateTime, peekGet } from "@/components/physical/ui"
import { copyText } from "@/lib/platform/copy-text"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

interface View {
  platform: { on: boolean; providerName: string | null; webhooks: boolean }
  ready: boolean
  own: { provider: "aftership" | "17track"; providerName: string; status: string; keyHint: string | null; secretHint: string | null; lastError: string | null; verifiedAt: string | null; lastWebhookAt: string | null; webhookUrl: string | null } | null
  following: number | null
  lastCheckedAt: string | null
}

const SECTION = "border-t border-[#f1f2f4] pt-5"

export function TrackingAppPanel({ preferred = "aftership", onChanged }: { preferred?: "aftership" | "17track"; onChanged?: (ownAccount: boolean) => void }) {
  /* Drawn at once from what the Integrations page already read (peekGet), never a grey box first when it is there (round 30). */
  const [view, setView] = React.useState<View | null>(() => peekGet<{ tracking: View }>("/api/store/tracking-app")?.tracking ?? null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [provider, setProvider] = React.useState<"aftership" | "17track">(preferred)
  const [key, setKey] = React.useState("")
  const [secret, setSecret] = React.useState("")
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    void api<{ tracking: View }>("/api/store/tracking-app").then((r) => {
      if (!r.ok) return setError(r.error)
      setView(r.data.tracking)
      onChanged?.(!!r.data.tracking.own)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    const r = await api<{ tracking: View }>("/api/store/tracking-app", { method: "PUT", body })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setView(r.data.tracking)
    setKey("")
    setSecret("")
    setOpen(false)
    onChanged?.(!!r.data.tracking.own)
  }

  if (!view) return error ? <Notice>{error}</Notice> : <div className="h-24 animate-pulse rounded-xl bg-[#f3f4f6]" aria-label={tt("Loading")} />

  const on = view.platform.on || !!view.own
  return (
    <div className="space-y-5" data-tracking-app-panel="">
      <div className="flex items-start gap-3">
        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", on ? "bg-[#16a34a]" : "bg-[#d1d5db]")} />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-[#1a1a2e]">{on ? tt("Your parcels are followed automatically") : tt("Automatic updates are not on yet")}</p>
          <p className="mt-0.5 text-[13px] leading-[19px] text-[#6b7280]" data-tracking-state={on ? "on" : "off"}>
            {on
              ? `${view.own ? tt("With your {providerName} account.", { providerName: view.own.providerName }) : tt("With Storelib's own tracking, nothing to set up.")}${view.following !== null ? tt(" {following, plural, one {# parcel} other {# parcels}} on the way right now.", { following: view.following }) : ""}${view.lastCheckedAt ? tt(" Last checked {date}.", { date: dateTime(view.lastCheckedAt) }) : ""}`
              : tt("Automatic updates turn on when Storelib's tracking is set up. Until then, orders keep the statuses you set and the carrier's tracking link, and buyers get the same emails when you change a status.")}
          </p>
        </div>
      </div>

      <div className={cn(SECTION, "space-y-3")}>
        <p className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Your own tracking account")}</p>
        {!view.ready ? <Notice tone="amber">{tt("Your own account can be added after the next Storelib update (SQL part 160).")}</Notice> : null}
        {view.own ? (
          <div className="space-y-3 rounded-xl border border-[#eceef1] px-3.5 py-3" data-tracking-own="">
            <p className="text-[13.5px] text-[#1a1a2e]">
              {view.own.providerName} <span className="font-mono text-[12.5px] text-[#6b7280]">••••{view.own.keyHint ?? ""}</span>
              {view.own.verifiedAt ? <span className="text-[12.5px] text-[#6b7280]"> · {tt("checked {date}", { date: dateTime(view.own.verifiedAt) })}</span> : null}
            </p>
            {view.own.lastError ? <p className="text-[12.5px] text-[#92400e]">{view.own.lastError}</p> : null}
            {view.own.webhookUrl ? (
              <Field label={tt("Webhook address for {providerName}", { providerName: view.own.providerName })} hint={view.own.provider === "aftership" ? tt("In AfterShip, Settings > Webhooks: add this address, then paste its webhook secret under Change key, so updates arrive the moment they happen. Without it Storelib checks every few hours.") : tt("In 17TRACK, Settings > Webhook: add this address. 17TRACK signs updates with your API key. Without it Storelib checks every few hours.")}>
                <div className="flex gap-2">
                  <input readOnly value={view.own.webhookUrl} className="h-10 min-w-0 flex-1 rounded-lg border border-[#e5e7eb] bg-[#f8f9fa] px-3 font-mono text-[12px] text-[#4b5563]" onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" className={cn(BTN_SECONDARY, "shrink-0 px-3")} onClick={async () => setCopied(await copyText(view.own!.webhookUrl!))}>
                    <Copy className="h-3.5 w-3.5" />
                    {copied ? tt("Copied") : tt("Copy")}
                  </button>
                </div>
              </Field>
            ) : null}
            {view.own.lastWebhookAt ? <p className="text-[12.5px] text-[#6b7280]">{tt("Last update from {providerName}: {date}", { providerName: view.own.providerName, date: dateTime(view.own.lastWebhookAt) })}</p> : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => (setProvider(view.own!.provider), setOpen(true))}>
                {tt("Change key")}
              </button>
              <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => void save({ remove: true })}>
                {tt("Remove")}{view.platform.on ? tt(", use Storelib's") : ""}
              </button>
            </div>
          </div>
        ) : !open ? (
          <div className="space-y-2">
            <p className="text-[13px] leading-[19px] text-[#6b7280]">{tt("Have an AfterShip or 17TRACK account? Add its API key and your parcels are followed there instead, with your own carriers and settings.")}</p>
            <button type="button" className={BTN_SECONDARY} disabled={!view.ready} onClick={() => setOpen(true)}>
              {tt("Use my own account")}
            </button>
          </div>
        ) : null}
        {open ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void save({ provider, apiKey: key, ...(provider === "aftership" && secret ? { webhookSecret: secret } : {}) })
            }}
          >
            <Field label={tt("Service")} htmlFor="trk-provider">
              <SelectInput id="trk-provider" value={provider} onChange={(v) => setProvider(v === "17track" ? "17track" : "aftership")}>
                <option value="aftership">{tt("AfterShip")}</option>
                <option value="17track">{"17TRACK"}</option>
              </SelectInput>
            </Field>
            <Field label={tt("API key")} htmlFor="trk-key" hint={provider === "aftership" ? tt("AfterShip: Settings > API keys.") : tt("17TRACK: Settings > Security > Access key.")}>
              <TextInput id="trk-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={view.own?.keyHint ? `••••${view.own.keyHint}` : ""} />
            </Field>
            {provider === "aftership" ? (
              <Field label={tt("Webhook secret (optional)")} htmlFor="trk-secret" hint={tt("AfterShip: Settings > Webhooks. With it, updates arrive the moment they happen.")}>
                <TextInput id="trk-secret" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={view.own?.secretHint ? `••••${view.own.secretHint}` : ""} />
              </Field>
            ) : null}
            <div className="flex gap-2">
              <button type="submit" className={BTN_PRIMARY} disabled={busy || (!key.trim() && view.own?.provider !== provider)}>
                {busy ? tt("Checking the key…") : tt("Save")}
              </button>
              <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => setOpen(false)}>
                {tt("Cancel")}
              </button>
            </div>
          </form>
        ) : null}
        {error ? <Notice>{error}</Notice> : null}
      </div>
    </div>
  )
}
