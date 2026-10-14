"use client"

/**
 * ===========================================================================
 *  SETTINGS › INTEGRATIONS › STORELIB REVIEWS: THE SETUP CARD
 * ===========================================================================
 * The app's settings (lib/reviews/app-settings.ts), in the integration
 * page's Set up card. Turning it on is the one switch at the top; the rest
 * is grouped the way a store thinks about it: what happens to a new review,
 * who can write one, the email that asks, how reviews look on the website.
 * Product pages get the stars and the reviews on their own while "Add to
 * product pages" is on (lib/website-builder/product-page.ts), so turning the
 * app on is the whole setup.
 * Save keeps everything at once; nothing is saved while it is being typed.
 */
import * as React from "react"
import Link from "next/link"
import { BTN_PRIMARY, BTN_SECONDARY, Field, Notice, SelectInput, TextInput, Toggle, api } from "@/components/physical/ui"
import { cn } from "@/lib/utils"
import { REVIEWS_APP_DEFAULTS, cleanHexColor, type ReviewsAppSettings } from "@/lib/reviews/app-settings"
import { tt } from "@/lib/i18n/text"

type Loaded = { settings: ReviewsAppSettings; ready: boolean; counts?: { pending: number; published: number; asked: number } }

const SECTION = "border-t border-[#f1f2f4] pt-5"
const H = "text-[14px] font-semibold text-[#1a1a2e]"

export function ReviewsAppPanel({ onChanged }: { onChanged?: (s: ReviewsAppSettings) => void }) {
  const [loaded, setLoaded] = React.useState<Loaded | null>(null)
  const [draft, setDraft] = React.useState<ReviewsAppSettings>(REVIEWS_APP_DEFAULTS)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  React.useEffect(() => {
    void api<Loaded>("/api/store/reviews-app").then((r) => {
      if (!r.ok) return setError(r.error)
      setLoaded(r.data)
      setDraft(r.data.settings)
    })
  }, [])

  const dirty = loaded ? JSON.stringify(loaded.settings) !== JSON.stringify(draft) : false
  const set = (patch: Partial<ReviewsAppSettings>) => {
    setSaved(false)
    setDraft((d) => ({ ...d, ...patch }))
  }
  const setRequest = (patch: Partial<ReviewsAppSettings["request"]>) => set({ request: { ...draft.request, ...patch } })
  const setDisplay = (patch: Partial<ReviewsAppSettings["display"]>) => set({ display: { ...draft.display, ...patch } })

  const save = async (next: ReviewsAppSettings = draft) => {
    setBusy(true)
    setError(null)
    const r = await api<{ settings: ReviewsAppSettings }>("/api/store/reviews-app", { method: "PUT", body: next })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setLoaded((l) => (l ? { ...l, settings: r.data.settings } : l))
    setDraft(r.data.settings)
    setSaved(true)
    onChanged?.(r.data.settings)
  }

  if (!loaded) {
    return error ? <Notice>{error}</Notice> : <div className="h-24 animate-pulse rounded-xl bg-[#f3f4f6]" aria-label={tt("Loading")} />
  }
  if (!loaded.ready) return <Notice tone="amber">{tt("Storelib Reviews needs its database update (SQL part 134). Until it runs, nothing here is kept.")}</Notice>

  const on = draft.enabled
  return (
    <div className="space-y-5" data-reviews-app-panel="">
      <Toggle
        label={on ? tt("Storelib Reviews is on") : tt("Turn on Storelib Reviews")}
        description={on ? tt("Reviews show on your website and buyers are asked by email.") : tt("Show reviews on your website, collect them by email and approve them in Reviews.")}
        checked={on}
        onChange={(v) => {
          const next = { ...draft, enabled: v }
          setDraft(next)
          void save(next)
        }}
      />
      {loaded.counts && on ? (
        <p className="text-[13px] text-[#6b7280]" data-reviews-app-counts="">
          {tt("{published} published · {pending} waiting for approval · {asked} asked by email", { published: loaded.counts.published, pending: loaded.counts.pending, asked: loaded.counts.asked })} ·{" "}
          <Link href="/app/reviews" className="font-medium text-[#1a1a2e] underline underline-offset-4">
            {tt("Open Reviews")}
          </Link>
        </p>
      ) : null}

      <div className={cn(SECTION, "space-y-3", !on && "opacity-60")}>
        <p className={H}>{tt("New reviews")}</p>
        <Field label={tt("When a review comes in")} htmlFor="ra-publish">
          <SelectInput id="ra-publish" value={draft.publish} onChange={(v) => set({ publish: v === "manual" ? "manual" : "auto" })}>
            <option value="auto">{tt("Publish it right away")}</option>
            <option value="manual">{tt("Wait for me to approve it")}</option>
          </SelectInput>
        </Field>
        {draft.publish === "auto" ? (
          <Field label={tt("Publish right away from")} htmlFor="ra-min" hint={tt("Reviews with fewer stars wait for you in Reviews, under Pending.")}>
            <SelectInput id="ra-min" value={String(draft.minStars)} onChange={(v) => set({ minStars: Number(v) })}>
              <option value="1">{tt("Any rating")}</option>
              {[2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {tt("{n} stars and up", { n })}
                </option>
              ))}
            </SelectInput>
          </Field>
        ) : null}
        <Field label={tt("Who can write one")} htmlFor="ra-who" hint={draft.who === "anyone" ? tt("A visitor confirms their review from an email before it posts, and it is not marked Verified buyer or counted in your Storelib rating. A buyer who uses the form is sent their own link instead.") : tt("From the link in their review email or their receipt. Every review is a Verified buyer.")}>
          <SelectInput id="ra-who" value={draft.who} onChange={(v) => set({ who: v === "anyone" ? "anyone" : "verified" })}>
            <option value="verified">{tt("Buyers only")}</option>
            <option value="anyone">{tt("Anyone, on your website")}</option>
          </SelectInput>
        </Field>
        <Toggle label={tt("Photos")} description={tt("Buyers can add up to 4 photos. Each one is checked before it is kept.")} checked={draft.photos} onChange={(v) => set({ photos: v })} />
        <Field label={tt("Buyers can change their review for")} htmlFor="ra-edit">
          <SelectInput id="ra-edit" value={String(draft.editDays)} onChange={(v) => set({ editDays: Number(v) })}>
            {[0, 7, 30, 90, 365].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? tt("No changes after posting") : tt("{n} days", { n })}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>

      <div className={cn(SECTION, "space-y-3", !on && "opacity-60")}>
        <Toggle label={tt("Review request email")} description={tt("Sent as your store, with five stars to tap. One per item bought.")} checked={draft.request.enabled} onChange={(v) => setRequest({ enabled: v })} />
        {draft.request.enabled ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={tt("Downloads and courses: days after purchase")} htmlFor="ra-digital">
                <TextInput id="ra-digital" type="number" min={0} max={60} inputMode="numeric" value={String(draft.request.digitalDays)} onChange={(e) => setRequest({ digitalDays: clampDays(e.target.value, 60) })} />
              </Field>
              <Field label={tt("Shipped items: days after")} htmlFor="ra-physical">
                <div className="flex gap-2">
                  <TextInput id="ra-physical" type="number" min={0} max={60} inputMode="numeric" className="w-20" value={String(draft.request.physicalDays)} onChange={(e) => setRequest({ physicalDays: clampDays(e.target.value, 60) })} />
                  <SelectInput aria-label={tt("Counted from")} className="flex-1" value={draft.request.physicalFrom} onChange={(v) => setRequest({ physicalFrom: v === "shipped" ? "shipped" : "delivered" })}>
                    <option value="delivered">{tt("delivery")}</option>
                    <option value="shipped">{tt("shipping")}</option>
                  </SelectInput>
                </div>
              </Field>
            </div>
            <Toggle label={tt("One reminder")} description={tt("Only to buyers who have not reviewed yet.")} checked={draft.request.reminder} onChange={(v) => setRequest({ reminder: v })} />
            {draft.request.reminder ? (
              <Field label={tt("Days after the first email")} htmlFor="ra-reminder">
                <TextInput id="ra-reminder" type="number" min={1} max={30} inputMode="numeric" className="w-24" value={String(draft.request.reminderDays)} onChange={(e) => setRequest({ reminderDays: Math.max(1, clampDays(e.target.value, 30)) })} />
              </Field>
            ) : null}
            <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{tt("Only orders placed after you turn the app on are asked. Buyers who turned review emails off, or already reviewed, are never asked.")}</p>
          </>
        ) : null}
      </div>

      <div className={cn(SECTION, "space-y-3", !on && "opacity-60")}>
        <p className={H}>{tt("On your website")}</p>
        <Toggle
          label={tt("Add to product pages")}
          description={tt("Stars under the product name and reviews under the product, on every product page. Move or remove them in the website editor.")}
          checked={draft.display.productPage}
          onChange={(v) => setDisplay({ productPage: v })}
        />
        <Field label={tt("Star color")} htmlFor="ra-star">
          <div className="flex items-center gap-2">
            <input aria-label={tt("Pick a star color")} type="color" value={cleanHexColor(draft.display.starColor)} onChange={(e) => setDisplay({ starColor: e.target.value })} className="h-10 w-12 cursor-pointer rounded-lg border border-[#e5e7eb] bg-white p-1" />
            <TextInput id="ra-star" value={draft.display.starColor} maxLength={7} className="w-28" onChange={(e) => setDisplay({ starColor: e.target.value })} onBlur={() => setDisplay({ starColor: cleanHexColor(draft.display.starColor) })} />
          </div>
        </Field>
        <Field label={tt("Order")} htmlFor="ra-sort">
          <SelectInput id="ra-sort" value={draft.display.sort} onChange={(v) => setDisplay({ sort: v as ReviewsAppSettings["display"]["sort"] })}>
            <option value="featured">{tt("Featured first, then newest")}</option>
            <option value="newest">{tt("Newest first")}</option>
            <option value="highest">{tt("Highest rating first")}</option>
            <option value="lowest">{tt("Lowest rating first")}</option>
            <option value="photos">{tt("With photos first")}</option>
          </SelectInput>
        </Field>
        <Field label={tt("Reviews shown before Show more")} htmlFor="ra-per">
          <SelectInput id="ra-per" value={String(draft.display.perPage)} onChange={(v) => setDisplay({ perPage: Number(v) })}>
            {[3, 4, 6, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Toggle label={tt("Verified buyer label")} checked={draft.display.showVerified} onChange={(v) => setDisplay({ showVerified: v })} />
        <Toggle label={tt("Dates")} checked={draft.display.showDate} onChange={(v) => setDisplay({ showDate: v })} />
        <Toggle label={tt("Photos in reviews")} checked={draft.display.showPhotos} onChange={(v) => setDisplay({ showPhotos: v })} />
        <Toggle label={tt("Stars on product cards")} description={tt("Imported themes show their own stars from the same ratings.")} checked={draft.display.showCardRating} onChange={(v) => setDisplay({ showCardRating: v })} />
        <p className="text-[12.5px] leading-[18px] text-[#6b7280]">
          {tt("For other pages, Product reviews, Star rating, Reviews carousel and All reviews are under Add section in the website editor. Your website also has a reviews page at /reviews.")}
        </p>
      </div>

      {error ? <Notice>{error}</Notice> : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {saved && !dirty ? <span className="mr-auto text-[13px] text-[#067647]">{tt("Saved")}</span> : null}
        {dirty ? (
          <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => setDraft(loaded.settings)}>
            {tt("Discard")}
          </button>
        ) : null}
        <button type="button" className={BTN_PRIMARY} disabled={busy || !dirty} onClick={() => void save()} data-reviews-app-save="">
          {busy ? tt("Saving") : tt("Save")}
        </button>
      </div>
    </div>
  )
}

function clampDays(raw: string, max: number): number {
  const n = Math.round(Number(raw))
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0
}
