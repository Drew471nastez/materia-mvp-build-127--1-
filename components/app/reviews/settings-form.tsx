"use client"

/**
 * ===========================================================================
 *  REVIEWS › SETTINGS
 * ===========================================================================
 * The one place Storelib Reviews is set up (lib/reviews/app-settings.ts);
 * Settings › Integrations › Storelib Reviews links here. The request
 * email's timing and words are under Requests, beside the emails they make.
 *
 *   on or off       the switch, saved the moment it is pressed
 *   new reviews     publish right away, from a rating up, or approve each;
 *                   who can write one; photos and a video; how long a buyer
 *                   can change theirs
 *   spam            hold a review with a link, or with the store's own
 *                   words, for approval. Every form also carries a field
 *                   only a script fills and a limit per address; those are
 *                   always on and need no setting.
 *   on the website  product pages, star colour, order, how many, what a
 *                   card shows
 *
 * Everything but the switch waits for Save, in the bar that rises while
 * something is changed.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { Field, Notice, SelectInput, TextInput, Toggle } from "@/components/physical/ui"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { MAX_SPAM_WORDS, cleanHexColor, readSpamWords, type ReviewsAppSettings } from "@/lib/reviews/app-settings"
import { buttonPrimary, card } from "@/app/app/orders/order-parts"
import { REVIEWS_BODY } from "./reviews-nav"

export type Moderation = "now" | "rating" | "manual"

export function moderationOf(s: Pick<ReviewsAppSettings, "publish" | "minStars">): Moderation {
  return s.publish === "manual" ? "manual" : s.minStars > 1 ? "rating" : "now"
}

const H = "text-[15px] font-semibold text-[#1a1a2e]"
const SECTION = "px-4 py-5 sm:px-6"

async function save(patch: unknown): Promise<{ ok: true; settings: ReviewsAppSettings } | { ok: false; error: string }> {
  const res = await fetch("/api/store/reviews-app", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch), credentials: "same-origin" }).catch(() => null)
  const data = res ? await res.json().catch(() => ({})) : {}
  if (!res?.ok) return { ok: false, error: data.error || tt("It could not be saved.") }
  return { ok: true, settings: data.settings as ReviewsAppSettings }
}

export function ReviewsSettingsForm({ initial, ready }: { initial: ReviewsAppSettings; ready: boolean }) {
  const router = useRouter()
  const [saved, setSaved] = React.useState(initial)
  const [draft, setDraft] = React.useState(initial)
  const [words, setWords] = React.useState(initial.spam.words.join("\n"))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)

  const typed = { ...draft, spam: { ...draft.spam, words: readSpamWords(words) } }
  const dirty = JSON.stringify({ ...typed, enabled: saved.enabled, enabledAt: saved.enabledAt }) !== JSON.stringify(saved)
  const set = (patch: Partial<ReviewsAppSettings>) => {
    setDone(false)
    setDraft((d) => ({ ...d, ...patch }))
  }
  const setDisplay = (patch: Partial<ReviewsAppSettings["display"]>) => set({ display: { ...draft.display, ...patch } })
  const mode = moderationOf(draft)

  const commit = async (patch: unknown, after?: (s: ReviewsAppSettings) => void) => {
    setBusy(true)
    setError(null)
    const out = await save(patch)
    setBusy(false)
    if (!out.ok) {
      setError(out.error)
      return false
    }
    setSaved(out.settings)
    after?.(out.settings)
    router.refresh()
    return true
  }

  if (!ready) {
    return (
      <div className={REVIEWS_BODY}>
        <Notice tone="amber" className="mt-3">
          {tt("Storelib Reviews needs its database update (SQL part 134). Until it runs, nothing here is kept.")}
        </Notice>
      </div>
    )
  }

  const on = saved.enabled
  return (
    <div className={REVIEWS_BODY} data-reviews-settings="">
      <section className={cn(card, "mt-3 overflow-hidden")} aria-label={tt("Storelib Reviews")}>
        <div className={SECTION}>
          <Toggle
            label={on ? tt("Storelib Reviews is on") : tt("Turn on Storelib Reviews")}
            description={on ? tt("Reviews show on your website and buyers are asked by email.") : tt("Show reviews on your website, collect them by email and approve them in Reviews.")}
            checked={on}
            disabled={busy}
            onChange={(v) => void commit({ enabled: v }, (s) => setDraft((d) => ({ ...d, enabled: s.enabled, enabledAt: s.enabledAt })))}
          />
        </div>
      </section>

      <section className={cn(card, "mt-3 divide-y divide-[#f1f2f4] overflow-hidden", !on && "opacity-70")} aria-label={tt("Settings")}>
        <div className={cn(SECTION, "space-y-4")}>
          <h2 className={H}>{tt("New reviews")}</h2>
          <fieldset>
            <legend className="text-[14px] font-medium text-[#1a1a2e]">{tt("When a review comes in")}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3" role="radiogroup">
              {(
                [
                  ["now", tt("Publish right away"), tt("Every review goes up as soon as it is written.")],
                  ["rating", tt("Publish from a rating"), tt("Lower ratings wait for you under Pending.")],
                  ["manual", tt("Approve each one"), tt("Nothing goes up until you approve it.")],
                ] as const
              ).map(([value, label, line]) => (
                <label key={value} className={cn("flex cursor-pointer gap-3 rounded-xl border px-3.5 py-3 transition-colors", mode === value ? "border-[#1a1a2e] bg-[#fafafb]" : "border-[#e5e7eb] hover:bg-[#fafafb]")} data-moderation={value}>
                  <input
                    type="radio"
                    name="moderation"
                    value={value}
                    checked={mode === value}
                    onChange={() => set(value === "manual" ? { publish: "manual" } : value === "now" ? { publish: "auto", minStars: 1 } : { publish: "auto", minStars: draft.minStars > 1 ? draft.minStars : 4 })}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#1a1a2e]"
                  />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium text-[#1a1a2e]">{label}</span>
                    <span className="mt-0.5 block text-[13px] leading-[18px] text-[#6b7280]">{line}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {mode === "rating" ? (
            <Field label={tt("Publish right away from")} htmlFor="rs-min" hint={tt("Reviews with fewer stars wait for you in Reviews, under Pending.")}>
              <SelectInput id="rs-min" value={String(draft.minStars)} onChange={(v) => set({ minStars: Number(v) })} className="sm:max-w-[240px]">
                {[2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {tt("{n} stars and up", { n })}
                  </option>
                ))}
              </SelectInput>
            </Field>
          ) : null}
          <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{tt("A review from a verified buyer is always on Storelib and in your Storelib rating. What you choose here is what your website shows.")}</p>
          <Field
            label={tt("Who can write one")}
            htmlFor="rs-who"
            hint={draft.who === "anyone" ? tt("A visitor confirms their review from an email before it posts, and it is not marked Verified buyer or counted in your Storelib rating. A buyer who uses the form is sent their own link instead.") : tt("From the link in their review email or their receipt. Every review is a Verified buyer.")}
          >
            <SelectInput id="rs-who" value={draft.who} onChange={(v) => set({ who: v === "anyone" ? "anyone" : "verified" })} className="sm:max-w-[320px]">
              <option value="verified">{tt("Buyers only")}</option>
              <option value="anyone">{tt("Anyone, on your website")}</option>
            </SelectInput>
          </Field>
          <Toggle label={tt("Photos")} description={tt("Buyers can add up to 4 photos. Each one is checked before it is kept.")} checked={draft.photos} onChange={(v) => set({ photos: v })} />
          <Toggle label={tt("A video")} description={tt("Buyers can add one video up to 50 MB. It waits for you to show it before your website does.")} checked={draft.videos} onChange={(v) => set({ videos: v })} />
          <Field label={tt("Buyers can change their review for")} htmlFor="rs-edit">
            <SelectInput id="rs-edit" value={String(draft.editDays)} onChange={(v) => set({ editDays: Number(v) })} className="sm:max-w-[240px]">
              {[0, 7, 30, 90, 365].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? tt("No changes after posting") : tt("{n} days", { n })}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>

        <div className={cn(SECTION, "space-y-4")}>
          <h2 className={H}>{tt("Spam")}</h2>
          <Toggle label={tt("Hold reviews with a link")} description={tt("A review with a web address in it waits for you under Pending.")} checked={draft.spam.holdLinks} onChange={(v) => set({ spam: { ...draft.spam, holdLinks: v } })} />
          <Field label={tt("Hold reviews with these words")} htmlFor="rs-words" hint={tt("One a line, up to {n}. A review with any of them waits for you under Pending.", { n: MAX_SPAM_WORDS })}>
            <textarea
              id="rs-words"
              value={words}
              onChange={(e) => {
                setDone(false)
                setWords(e.target.value)
              }}
              rows={3}
              className="block w-full resize-y rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-[16px] leading-6 text-[#1a1a2e] outline-none focus:border-[#9ca3af] focus:ring-[3px] focus:ring-[rgba(17,24,39,0.06)] sm:max-w-[420px] sm:text-[14px]"
              data-spam-words=""
            />
          </Field>
          <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{tt("Every review form also has a field only a script fills in, and a limit on how many reviews one address can send. Those are always on.")}</p>
        </div>

        <div className={cn(SECTION, "space-y-4")}>
          <h2 className={H}>{tt("On your website")}</h2>
          <Toggle
            label={tt("Add to product pages")}
            description={tt("Stars under the product name and reviews under the product, on every product page. Move or remove them in the website editor.")}
            checked={draft.display.productPage}
            onChange={(v) => setDisplay({ productPage: v })}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={tt("Star color")} htmlFor="rs-star">
              <div className="flex items-center gap-2">
                <input aria-label={tt("Pick a star color")} type="color" value={cleanHexColor(draft.display.starColor)} onChange={(e) => setDisplay({ starColor: e.target.value })} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-[#e5e7eb] bg-white p-1" />
                <TextInput id="rs-star" value={draft.display.starColor} maxLength={7} onChange={(e) => setDisplay({ starColor: e.target.value })} onBlur={() => setDisplay({ starColor: cleanHexColor(draft.display.starColor) })} />
              </div>
            </Field>
            <Field label={tt("Order")} htmlFor="rs-sort">
              <SelectInput id="rs-sort" value={draft.display.sort} onChange={(v) => setDisplay({ sort: v as ReviewsAppSettings["display"]["sort"] })}>
                <option value="featured">{tt("Featured first, then newest")}</option>
                <option value="newest">{tt("Newest first")}</option>
                <option value="highest">{tt("Highest rating first")}</option>
                <option value="lowest">{tt("Lowest rating first")}</option>
                <option value="photos">{tt("With photos first")}</option>
              </SelectInput>
            </Field>
            <Field label={tt("Reviews shown before Show more")} htmlFor="rs-per">
              <SelectInput id="rs-per" value={String(draft.display.perPage)} onChange={(v) => setDisplay({ perPage: Number(v) })}>
                {[3, 4, 6, 8, 10, 12].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <Toggle label={tt("Verified buyer label")} checked={draft.display.showVerified} onChange={(v) => setDisplay({ showVerified: v })} />
          <Toggle label={tt("Dates")} checked={draft.display.showDate} onChange={(v) => setDisplay({ showDate: v })} />
          <Toggle label={tt("Photos in reviews")} checked={draft.display.showPhotos} onChange={(v) => setDisplay({ showPhotos: v })} />
          <Toggle label={tt("Stars on product cards")} description={tt("Imported themes show their own stars from the same ratings.")} checked={draft.display.showCardRating} onChange={(v) => setDisplay({ showCardRating: v })} />
        </div>
      </section>

      {error ? (
        <Notice className="mt-3">{error}</Notice>
      ) : done && !dirty ? (
        <p className="mt-3 text-[13px] text-[#067647]" role="status">
          {tt("Saved")}
        </p>
      ) : null}

      {dirty ? (
        <div className="pointer-events-none sticky bottom-[calc(var(--app-nav-room,0px)+12px)] z-20 mt-3 flex justify-center" data-reviews-save-bar="">
          <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-[#111113] p-1.5 pl-4 text-white shadow-[0_1px_2px_rgba(0,0,0,0.2),0_12px_32px_-8px_rgba(0,0,0,0.45)]">
            <span className="pr-1 text-[13px] font-medium">{tt("Unsaved changes")}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(saved)
                setWords(saved.spam.words.join("\n"))
              }}
              className="h-9 rounded-xl px-3 text-[13px] font-medium hover:bg-white/10"
            >
              {tt("Discard")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const { enabled: _e, enabledAt: _a, ...rest } = typed
                void _e
                void _a
                const ok = await commit(rest, (s) => {
                  setDraft(s)
                  setWords(s.spam.words.join("\n"))
                })
                if (ok) setDone(true)
              }}
              className={cn(buttonPrimary, "h-9 rounded-xl bg-white px-4 text-[13px] text-[#111113] hover:bg-[#f1f2f4]")}
              data-reviews-settings-save=""
            >
              {busy ? tt("Saving") : tt("Save")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
