"use client"

/**
 * ===========================================================================
 *  THE DATA AND MONEY BLOCKS' SETTINGS (round AR)
 * ===========================================================================
 * The parts of an app block's Settings (./app-block-editor) that belong to
 * the blocks ./data-blocks draws: Tips through Storelib checkout, a poll's
 * results, how stats arrive, one Event, Paid access, Reviews, an RSS
 * feed's posts and Bandsintown. What visitors did (a poll's totals, the tips,
 * the RSVPs) is read for the owner from /api/onepage/activity and shown
 * right here, under the block's own settings.
 */

import * as React from "react"
import { Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { useOnePage } from "@/lib/onepage/context"
import { ModeChoice, SettingsGroup } from "@/components/onepage/block-settings-kit"
import { Switch, fieldInput } from "@/components/onepage/editor-kit"
import { OnePageImageField } from "@/components/onepage/image-field"
import { DateTimeField } from "@/components/onepage/date-time-field"
import { ProductPicker } from "@/components/onepage/product-picker"
import { useCreatorProducts } from "@/components/onepage/tabs/product-block-editor"
import { useProductMoney, useSellerCurrency } from "@/components/platform/price-currency"
import { editorProductState, pickableProducts } from "@/lib/onepage/product-block"
import { TIP_PRESETS_MAX, tipAmounts, tipDefaultAmounts, tipLabel, tipModeOf, typedTipCents } from "@/lib/onepage/tips"
import { referrerName } from "@/lib/analytics/tip-sources"
import { STAT_ANIMATIONS, type StatAnimation, statAnimationOf } from "@/lib/onepage/stat-count"
import { readTrustBox, reviewSourceOf } from "@/lib/onepage/reviews-block"
import { bandsintownArtist } from "@/lib/onepage/feeds"
import type { AppBlockData } from "@/lib/onepage/app-blocks"
import type { PollTally } from "@/lib/onepage/poll"
import type { OnePageBlock } from "@/lib/onepage/types"

type Set = (p: Partial<AppBlockData>) => void

/* i18n-ignore-start: a company's own name. */
const TRUSTPILOT = "Trustpilot"
/* i18n-ignore-end */

const fieldLabel = "block text-[13px] font-medium text-[#1a1a2e]"
const hint = "text-[12.5px] leading-[1.4] text-[#6b7280]"
const area =
  "min-h-[96px] w-full resize-y rounded-xl border border-[#e3e4e8] bg-white px-4 py-3 text-[16px] leading-[1.45] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] sm:text-[15px]"

function Field({ label, children, note }: { label: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className={fieldLabel}>{label}</span>
      {children}
      {note}
    </label>
  )
}

function SwitchLine({ label, note, checked, onChange }: { label: string; note?: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-[#1a1a2e]">{label}</p>
        {note ? <p className={hint}>{note}</p> : null}
      </div>
      <Switch label={label} checked={checked} onChange={onChange} />
    </div>
  )
}

function useOnePageId(): string | null {
  try {
    return useOnePage().onepage?.id ?? null
  } catch {
    return null
  }
}

/** What visitors did with the block, for its owner. */
function useActivity<T>(blockId: string, on: boolean): T | null {
  const onepageId = useOnePageId()
  const [answer, setAnswer] = React.useState<T | null>(null)
  React.useEffect(() => {
    if (!on || !onepageId) return
    let live = true
    fetch(`/api/onepage/activity?onepage_id=${encodeURIComponent(onepageId)}&block_id=${encodeURIComponent(blockId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setAnswer(d))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [on, onepageId, blockId])
  return answer
}

const box = "space-y-2 rounded-2xl border border-[#e3e4e8] bg-white p-3.5"

/* ─── Tips ────────────────────────────────────────────────────────────── */

function TipsSettings({ block, data, set }: { block: OnePageBlock; data: AppBlockData; set: Set }) {
  const mode = tipModeOf(data)
  const currency = useSellerCurrency()
  const amounts = tipAmounts(data, currency)
  /*
    Round AS: three sets of amounts, one tap each, in the store's currency (the middle one is what a visitor sees
    picked), so a creator rarely has to type one. The chips below still take any amount.
  */
  const base = tipDefaultAmounts(currency)
  const sets = [1, 2, 5].map((k) => base.map((c) => c * k))
  const [adding, setAdding] = React.useState("")
  const activity = useActivity<{ ready: boolean; totals: Record<string, { count: number; cents: number }>; tips: Array<{ id: string; amount_cents: number; currency: string; tipper_name: string | null; message: string | null; created_at: string; source_detail?: { referrer_host?: string | null } | null }> }>(block.id, mode === "storelib")
  const add = () => {
    const cents = typedTipCents(adding, currency)
    if (cents === null || amounts.length >= TIP_PRESETS_MAX) return
    set({ tip_amounts: [...amounts, cents] })
    setAdding("")
  }
  return (
    <div className="space-y-4" data-tips-settings="">
      <ModeChoice
        label={tt("How people tip")}
        value={mode}
        onPick={(tip_mode) => set({ tip_mode })}
        options={[
          { id: "storelib", label: tt("With Storelib checkout"), hint: tt("Paid to your payout account") },
          { id: "link", label: tt("With a link"), hint: tt("Ko-fi, PayPal, Buy Me a Coffee") },
        ]}
      />
      {mode === "storelib" ? (
        <>
          <div className="space-y-2" data-tip-amounts="">
            <span className={fieldLabel}>{tt("Amounts")}</span>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={tt("Amounts")} data-tip-sets="">
              {sets.map((choice) => {
                const on = choice.join() === amounts.join()
                return (
                  <button
                    key={choice.join()}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set({ tip_amounts: choice })}
                    className={cn("h-11 rounded-xl border text-[13.5px] font-medium tabular-nums transition-colors", on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e3e4e8] bg-white text-[#1a1a2e] hover:bg-[#f7f7f8]")}
                  >
                    {choice.map((c) => tipLabel(c, currency)).join(" · ")}
                  </button>
                )
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              {amounts.map((c) => (
                <span key={c} className="inline-flex h-10 items-center gap-1 rounded-full bg-[#f4f4f6] pl-3.5 pr-1 text-[14px] font-medium tabular-nums text-[#1a1a2e]">
                  {tipLabel(c, currency)}
                  {amounts.length > 1 ? (
                    <button type="button" aria-label={tt("Remove")} onClick={() => set({ tip_amounts: amounts.filter((x) => x !== c) })} className="grid h-8 w-8 place-items-center rounded-full text-[#6b7280] hover:bg-[#e9e9ec] hover:text-[#b42318]">
                      <X aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  ) : <span className="w-2.5" />}
                </span>
              ))}
              {amounts.length < TIP_PRESETS_MAX ? (
                <span className="inline-flex h-10 items-center gap-1 rounded-full border border-dashed border-[#d5d7dd] pl-3 pr-1">
                  <input value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} inputMode="decimal" placeholder="15" aria-label={tt("Add an amount")} className="w-14 bg-transparent text-[16px] text-[#1a1a2e] outline-none sm:text-[14px]" />
                  <button type="button" aria-label={tt("Add an amount")} onClick={add} className="grid h-8 w-8 place-items-center rounded-full text-[#1a1a2e] hover:bg-[#f4f4f6]">
                    <Plus aria-hidden className="h-4 w-4" />
                  </button>
                </span>
              ) : null}
            </div>
            <p className={hint}>{tt("In your store's currency. Up to four.")}</p>
          </div>
          <SwitchLine label={tt("Let them choose the amount")} checked={data.tip_custom === true} onChange={(tip_custom) => set({ tip_custom })} />
          <SwitchLine label={tt("Let them leave a message")} checked={data.tip_message === true} onChange={(tip_message) => set({ tip_message })} />
          <p className={hint}>
            {tt("Tips are paid to your own payout account, as your sales are. Until payouts are set up, this block stays off your page.")}{" "}
            <a href="/app/settings/payments" className="font-medium text-[#1a1a2e] underline underline-offset-2">{tt("Set up payouts")}</a>
          </p>
          {activity?.ready === false ? <p className={hint}>{tt("Tips are paid but not listed here until the latest database update has run.")}</p> : null}
          {activity && activity.tips?.length ? (
            <div className={box} data-tips-received="">
              <p className="text-[13px] font-semibold text-[#1a1a2e]">
                {Object.entries(activity.totals).map(([cur, t]) => tt("{count, plural, one {# tip} other {# tips}}, {amount}", { count: t.count, amount: tipLabel(t.cents, cur) })).join(" · ")}
              </p>
              <ul className="divide-y divide-[#f0f1f3]">
                {activity.tips.slice(0, 8).map((t) => (
                  <li key={t.id} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                    <span className="min-w-0 truncate text-[#1a1a2e]">
                      {[t.tipper_name || tt("Someone"), t.message].filter(Boolean).join(": ")}
                      {/* Round AS: where the tipper came to the page from. */}
                      <span className="text-[#9ca3af]"> · {t.source_detail?.referrer_host ? referrerName(t.source_detail.referrer_host).label : tt("Direct")}</span>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-[#1a1a2e]">{tipLabel(t.amount_cents, t.currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

/* ─── Poll ────────────────────────────────────────────────────────────── */

function PollSettings({ block, data, set }: { block: OnePageBlock; data: AppBlockData; set: Set }) {
  const activity = useActivity<{ ready: boolean; tally: PollTally | null }>(block.id, true)
  return (
    <div className="space-y-3" data-poll-settings="">
      <SwitchLine label={tt("Show results after voting")} note={tt("Each person votes once.")} checked={data.poll_show_results !== false} onChange={(on) => set({ poll_show_results: on })} />
      {activity?.tally ? (
        <div className={box} data-poll-results="">
          <p className="text-[13px] font-semibold text-[#1a1a2e]">{tt("{count, plural, one {# vote} other {# votes}}", { count: activity.tally.total })}</p>
          {activity.tally.options.map((o) => (
            <div key={o.id} className="space-y-1">
              <div className="flex justify-between text-[13px] text-[#1a1a2e]">
                <span className="truncate">{o.label}</span>
                <span className="tabular-nums text-[#6b7280]">{o.count} · {o.percent}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#f0f1f3]">
                <div className="h-full rounded-full bg-[#1a1a2e]" style={{ width: `${o.percent}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : activity?.ready === false ? (
        <p className={hint}>{tt("Votes are taken once the latest database update has run.")}</p>
      ) : null}
    </div>
  )
}

/* ─── Stats ───────────────────────────────────────────────────────────── */

const ANIMATION_LABEL: Record<StatAnimation, () => string> = {
  count: () => tt("Count up"),
  roll: () => tt("Roll"),
  fade: () => tt("Fade in"),
  none: () => tt("None"),
}

function StatsSettings({ data, set }: { data: AppBlockData; set: Set }) {
  const current = statAnimationOf(data)
  return (
    <div className="space-y-2" data-stats-animation="">
      <span className={fieldLabel}>{tt("When it comes into view")}</span>
      <div role="radiogroup" aria-label={tt("When it comes into view")} className="grid grid-cols-4 gap-1.5 rounded-xl bg-[#f4f4f6] p-1">
        {STAT_ANIMATIONS.map((id) => (
          <button key={id} type="button" role="radio" aria-checked={current === id} onClick={() => set({ stats_animation: id })} className={cn("h-9 rounded-lg text-[13px] font-medium transition-[background-color,color,box-shadow] duration-150", current === id ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "text-[#6b7280] hover:text-[#1a1a2e]")}>
            {ANIMATION_LABEL[id]()}
          </button>
        ))}
      </div>
      <p className={hint}>{tt("Visitors who turn motion off see the numbers straight away.")}</p>
    </div>
  )
}

/* ─── One event ───────────────────────────────────────────────────────── */

function EventSettings({ block, data, set }: { block: OnePageBlock; data: AppBlockData; set: Set }) {
  const activity = useActivity<{ ready: boolean; count: number; people: Array<{ name: string | null; email: string; created_at: string }> }>(block.id, data.rsvp === true)
  return (
    <div className="space-y-4" data-event-settings="">
      <Field label={tt("Event name")}>
        <input className={fieldInput} value={data.title ?? ""} maxLength={80} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <div className="space-y-2">
        <span className={fieldLabel}>{tt("Starts")}</span>
        <DateTimeField label={tt("Starts")} value={data.event_start ?? null} onChange={(event_start) => set({ event_start })} emptyLabel={tt("Choose a date")} defaultTime={{ hour: 19, minute: 0 }} />
      </div>
      <Field label={tt("Venue or address")}>
        <input className={fieldInput} value={data.venue ?? ""} maxLength={120} placeholder={tt("City or venue")} onChange={(e) => set({ venue: e.target.value })} />
      </Field>
      <Field label={tt("About it (optional)")}>
        <textarea className={area} value={data.text ?? ""} maxLength={600} onChange={(e) => set({ text: e.target.value })} />
      </Field>
      <Field label={tt("Ticket link (optional)")}>
        <input className={fieldInput} value={data.url ?? ""} inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="https://" onChange={(e) => set({ url: e.target.value.trim() })} />
      </Field>
      <SwitchLine label={tt("Take RSVPs")} note={tt("Name and email, kept in Leads.")} checked={data.rsvp === true} onChange={(rsvp) => set({ rsvp })} />
      <div className="space-y-2">
        <span className={fieldLabel}>{tt("Picture (optional)")}</span>
        <OnePageImageField value={data.image_url} prefix={`app_${block.id}`} onChange={(url) => set({ image_url: url })} />
      </div>
      {activity && activity.count ? (
        <div className={box} data-event-rsvps="">
          <p className="text-[13px] font-semibold text-[#1a1a2e]">{tt("{count, plural, one {# RSVP} other {# RSVPs}}", { count: activity.count })}</p>
          <ul className="divide-y divide-[#f0f1f3]">
            {activity.people.slice(0, 8).map((p) => (
              <li key={`${p.email}${p.created_at}`} className="truncate py-1.5 text-[13px] text-[#1a1a2e]">
                {p.name ? `${p.name} · ` : ""}
                <span className="text-[#6b7280]">{p.email}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/* ─── Paid access ───────────────────────────────────────────────────── */

function PaidSettings({ data, set }: { data: AppBlockData; set: Set }) {
  const products = useCreatorProducts(true)
  const money = useProductMoney()
  const pickable = pickableProducts(products ?? []).filter((p) => p.type !== "physical")
  return (
    <div className="space-y-4" data-paid-settings="">
      <div className="space-y-2">
        <span className={fieldLabel}>{tt("The product that opens it")}</span>
        <ProductPicker
          products={pickable}
          stateOf={(id) => editorProductState(id, products)}
          selectedId={data.paid_product_id}
          state={editorProductState(data.paid_product_id, products)}
          money={(cents, product) => money(cents, product)}
          onPick={(p) => set({ paid_product_id: p.id, ...(data.title?.trim() ? {} : { title: p.title }) })}
        />
        <p className={hint}>{tt("Visitors buy it through Storelib checkout. Anyone who owns it sees what is below.")}</p>
      </div>
      <Field label={tt("Title")}>
        <input className={fieldInput} value={data.title ?? ""} maxLength={80} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label={tt("What everyone sees (optional)")}>
        <textarea className={area} value={data.text ?? ""} maxLength={300} onChange={(e) => set({ text: e.target.value })} />
      </Field>
      <SettingsGroup title={tt("What buyers see")}>
        <div className="space-y-4">
          <Field label={tt("Text")}>
            <textarea className={area} value={data.locked_text ?? ""} maxLength={4000} onChange={(e) => set({ locked_text: e.target.value })} />
          </Field>
          <Field label={tt("Link (optional)")}>
            <input className={fieldInput} value={data.locked_url ?? ""} inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="https://" onChange={(e) => set({ locked_url: e.target.value.trim() })} />
          </Field>
          {data.locked_url ? (
            <Field label={tt("Link button text")}>
              <input className={fieldInput} value={data.locked_label ?? ""} maxLength={40} placeholder={tt("Open")} onChange={(e) => set({ locked_label: e.target.value })} />
            </Field>
          ) : null}
          <p className={hint}>{tt("Never sent to the page until the visitor's purchase is checked.")}</p>
        </div>
      </SettingsGroup>
    </div>
  )
}

/* ─── Discord, members only ─────────────────────────────────────────── */

/** A Discord block for buyers only (lib/community-roles): owners of the product join through Storelib, everyone else sees Buy. */
function DiscordMembersSettings({ data, set }: { data: AppBlockData; set: Set }) {
  const products = useCreatorProducts(true)
  const money = useProductMoney()
  const on = typeof data.members_product_id === "string" || data.members_product_id === null
  const pickable = pickableProducts(products ?? []).filter((p) => p.type !== "physical")
  return (
    <div className="space-y-4" data-discord-members-settings="">
      <SwitchLine
        label={tt("Members only")}
        note={tt("Owners of a product join the server through Storelib and get its role. Everyone else sees Buy.")}
        checked={on}
        onChange={(v) => set({ members_product_id: v ? (data.members_product_id ?? null) : undefined })}
      />
      {on ? (
        <div className="space-y-2">
          <span className={fieldLabel}>{tt("The product that lets people in")}</span>
          <ProductPicker
            products={pickable}
            stateOf={(id) => editorProductState(id, products)}
            selectedId={data.members_product_id ?? undefined}
            state={editorProductState(data.members_product_id ?? undefined, products)}
            money={(cents, product) => money(cents, product)}
            onPick={(p) => set({ members_product_id: p.id })}
          />
          <p className={hint}>{tt("Choose its role in Settings › Integrations › Discord. Your invite link is not shown on the page.")}</p>
        </div>
      ) : null}
    </div>
  )
}

/* ─── Reviews ─────────────────────────────────────────────────────────── */

function ReviewSettings({ data, set }: { data: AppBlockData; set: Set }) {
  const source = reviewSourceOf(data)
  const box = source === "trustpilot" ? readTrustBox(data.trustbox) : null
  return (
    <div className="space-y-4" data-review-settings="">
      <ModeChoice
        label={tt("Which reviews")}
        value={source}
        onPick={(review_source) => set({ review_source })}
        options={[
          { id: "storelib", label: tt("Your Storelib reviews"), hint: tt("Published reviews of your products") },
          { id: "trustpilot", label: TRUSTPILOT, hint: tt("Your TrustBox") },
          { id: "google", label: "Google", hint: tt("Your rating and a link to it") },
        ]}
      />
      {source === "trustpilot" ? (
        <Field
          label={tt("TrustBox code")}
          note={
            data.trustbox?.trim() && !box ? (
              <p className="text-[12.5px] text-[#b42318]">{tt("Paste the whole TrustBox code from Trustpilot Business, Integrations, TrustBox library.")}</p>
            ) : (
              <p className={hint}>{tt("From Trustpilot Business, Integrations, TrustBox library. Only its ids are used.")}</p>
            )
          }
        >
          <textarea className={cn(area, "font-mono text-[13px] sm:text-[13px]")} value={data.trustbox ?? ""} maxLength={4000} spellCheck={false} placeholder='<div class="trustpilot-widget" data-template-id="..." data-businessunit-id="...">' onChange={(e) => set({ trustbox: e.target.value })} />
        </Field>
      ) : null}
      {source === "google" ? (
        <>
          <Field label={tt("Your Google Maps link")}>
            <input className={fieldInput} value={data.url ?? ""} inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="https://maps.app.goo.gl/..." onChange={(e) => set({ url: e.target.value.trim() })} />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label={tt("Rating")}>
              <input className={fieldInput} type="number" inputMode="decimal" min={1} max={5} step={0.1} value={data.rating ?? ""} placeholder="4.8" onChange={(e) => set({ rating: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
            <Field label={tt("Reviews")}>
              <input className={fieldInput} type="number" inputMode="numeric" min={0} value={data.reviews_count ?? ""} placeholder="120" onChange={(e) => set({ reviews_count: e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value))) })} />
            </Field>
          </div>
          <p className={hint}>{tt("As Google shows them. Visitors read the reviews on Google.")}</p>
        </>
      ) : null}
      <Field label={tt("Title (optional)")}>
        <input className={fieldInput} value={data.title ?? ""} maxLength={80} onChange={(e) => set({ title: e.target.value })} />
      </Field>
    </div>
  )
}

/* ─── RSS and Bandsintown ─────────────────────────────────────────────── */

function FeedSettings({ data, set }: { data: AppBlockData; set: Set }) {
  const n = typeof data.feed_count === "number" ? data.feed_count : 3
  return (
    <div className="space-y-2" data-feed-settings="">
      <span className={fieldLabel}>{tt("Latest posts under the card")}</span>
      <div role="radiogroup" aria-label={tt("Latest posts under the card")} className="grid grid-cols-4 gap-1.5 rounded-xl bg-[#f4f4f6] p-1">
        {[0, 3, 5].map((v) => (
          <button key={v} type="button" role="radio" aria-checked={n === v} onClick={() => set({ feed_count: v })} className={cn("h-9 rounded-lg text-[13px] font-medium transition-[background-color,color,box-shadow] duration-150", n === v ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "text-[#6b7280] hover:text-[#1a1a2e]")}>
            {v === 0 ? tt("None") : String(v)}
          </button>
        ))}
      </div>
      <p className={hint}>{tt("Read from your feed when the page loads.")}</p>
    </div>
  )
}

function BandsintownSettings({ data, set }: { data: AppBlockData; set: Set }) {
  const raw = data.bandsintown_artist ?? ""
  const ok = !raw.trim() || bandsintownArtist(raw) !== null
  return (
    <Field
      label={tt("Bandsintown artist (optional)")}
      note={!ok ? <p className="text-[12.5px] text-[#b42318]">{tt("Type the artist's name as it is on Bandsintown.")}</p> : <p className={hint}>{tt("Their upcoming shows are added to the dates below, kept up to date.")}</p>}
    >
      <input className={fieldInput} value={raw} maxLength={120} placeholder={tt("Artist name or Bandsintown link")} onChange={(e) => set({ bandsintown_artist: e.target.value })} />
    </Field>
  )
}

/** The data blocks' own settings for an app block, or null for any other provider. Drawn in Settings above the shared fields. */
export function DataBlockSettings({ block, data, set }: { block: OnePageBlock; data: AppBlockData; set: Set }) {
  switch (data.provider) {
    case "tips":
      return <TipsSettings block={block} data={data} set={set} />
    case "poll":
      return <PollSettings block={block} data={data} set={set} />
    case "stats":
      return <StatsSettings data={data} set={set} />
    case "event":
      return <EventSettings block={block} data={data} set={set} />
    case "paid":
      return <PaidSettings data={data} set={set} />
    case "discord":
      return <DiscordMembersSettings data={data} set={set} />
    case "reviews":
      return <ReviewSettings data={data} set={set} />
    case "rss":
      return <FeedSettings data={data} set={set} />
    case "events":
      return <BandsintownSettings data={data} set={set} />
    default:
      return null
  }
}

/** Layout names that say what the layout is for these blocks. */
export function dataLayoutLabel(provider: string, layout: string): string | null {
  if (provider === "reviews") return layout === "classic" ? tt("List") : layout === "grid" ? tt("Cards") : layout === "card" ? tt("In a sheet") : null
  if (provider === "stats") return layout === "card" ? tt("Band") : layout === "classic" ? tt("Plain") : null
  return null
}
