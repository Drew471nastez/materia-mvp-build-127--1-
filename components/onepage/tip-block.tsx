"use client"

/**
 * ===========================================================================
 *  TIPS: THE CARD ON THE PAGE AND THE AMOUNT SHEET (round AS)
 * ===========================================================================
 * The owner's references: a card with an icon, the block's title and a line
 * under it, the amounts as a row of choices (the middle one picked) with
 * Other, and one full width "Tip $5"; and a sheet with its grip, "Enter tip
 * amount", a big "$5" between a round minus and plus, "Show keypad" and one
 * full width Continue.
 *
 *   THE CARD     the block in the page's own colours (./app-block useParts:
 *                the page's button made a card), the amounts tinted from its
 *                own words, the picked one filled with them; "Tip $5" is the
 *                page's button. A tap on it pays at once (Stripe Checkout,
 *                lib/onepage/tips-server), or, when the block asks for a
 *                note, opens the sheet with the amount already in it.
 *   THE SHEET    Other opens the block sheet (./block-sheet) in the page's
 *                theme (its --opk tokens): the amount, stepped by + and -
 *                on a grid that suits it (lib/onepage/tips tipStepped), or
 *                typed on the sheet's own keypad, or on a computer's keys;
 *                an optional note; Continue. Never under the floor nor over
 *                the cap; the server checks again (checkTipAmount).
 *   THE MONEY    in the store's currency and its own minor unit (tipLabel,
 *                formatMinor). Paid through the same Stripe Checkout as
 *                before, which offers Apple Pay and Google Pay wherever the
 *                account and the device allow them.
 *   THE SOURCE   each tip says which way it came in (the card or the
 *                sheet), the page's host and the site the visitor came from
 *                (lib/onepage/tips tipSource), for analytics.
 *
 * In the editor's preview nothing is paid: the last step says so
 * (lib/onepage/preview-notice), and the sheet opens as it would.
 */

import * as React from "react"
import { Check, Delete, HandCoins, Lock, Minus, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { useBlockSheet } from "@/components/onepage/block-sheet-context"
import { CardButton, px, useParts, useTrack, type AppBlockLook } from "@/components/onepage/app-block"
import { useFilled } from "@/components/onepage/data-blocks"
import { inkOn } from "@/lib/onepage/contrast"
import { boxRadius } from "@/lib/onepage/block-look"
import { showPreviewNotice } from "@/lib/onepage/preview-notice"
import { TIP_MAX_CENTS, checkTipAmount, keypadInput, keypadText, tipAmounts, tipFloor, tipLabel, tipStepped, typedTipCents } from "@/lib/onepage/tips"
import type { AppBlockData } from "@/lib/onepage/app-blocks"
import type { OnePageBlock } from "@/lib/onepage/types"

type Props = { block: OnePageBlock; data: AppBlockData; look: AppBlockLook }

/* One confirm per return from Stripe, however many tips blocks the page has. */
const confirming = new Map<string, Promise<{ amount_cents: number; currency: string } | null>>()

/** The visitor's language, read after mounting so the server's markup and the first render agree. */
function useLocale(): string {
  const [locale, setLocale] = React.useState("en-US")
  React.useEffect(() => setLocale(navigator.language || "en-US"), [])
  return locale
}

/** Off to Stripe Checkout for this amount, or why not. */
async function startTip(look: AppBlockLook, blockId: string, cents: number, message: string | null, placement: "card" | "sheet"): Promise<string | null> {
  if (look.preview || !look.onepageId) {
    showPreviewNotice("payment")
    return null
  }
  try {
    const r = await fetch("/api/onepage/tip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        onepage_id: look.onepageId,
        block_id: blockId,
        amount_cents: cents,
        message: message || undefined,
        source: { placement, host: window.location.hostname, referrer: document.referrer || null },
        return_path: window.location.pathname,
      }),
    })
    const d = await r.json().catch(() => null)
    if (r.ok && typeof d?.url === "string") {
      window.location.assign(d.url)
      return null
    }
    return typeof d?.error === "string" ? d.error : tt("That did not go through. Try again.")
  } catch {
    return tt("That did not go through. Try again.")
  }
}

/* ─── The card ────────────────────────────────────────────────────────── */

export function DataTipsView({ block, data: given, look }: Props) {
  const data = useFilled(block, given, look, given.tip_ready !== undefined)
  const parts = useParts(look)
  const track = useTrack(look)
  const sheet = useBlockSheet()
  const currency = data.tip_currency || "usd"
  const presets = tipAmounts(data, currency)
  const locale = useLocale()
  const [picked, setPicked] = React.useState<number>(presets[Math.min(1, presets.length - 1)])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [thanks, setThanks] = React.useState<string | null>(null)
  /* A preset the creator has since taken away is not left picked. */
  const shownPick = presets.includes(picked) ? picked : presets[Math.min(1, presets.length - 1)]

  React.useEffect(() => {
    if (look.preview || !look.onepageId) return
    /* Back from Stripe: the tip read back from Stripe, the address tidied so a reload does not say it twice. */
    const url = new URL(window.location.href)
    const state = url.searchParams.get("tip")
    if (!state) return
    const session = url.searchParams.get("tip_session")
    const tidy = () => {
      url.searchParams.delete("tip")
      url.searchParams.delete("tip_session")
      window.history.replaceState(window.history.state, "", url.toString())
    }
    if (state !== "thanks" || !session) {
      tidy()
      return
    }
    let p = confirming.get(session)
    if (!p) {
      p = fetch("/api/onepage/tip", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: true, onepage_id: look.onepageId, session_id: session }) })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
      confirming.set(session, p)
    }
    let live = true
    p.then((d) => {
      if (!live) return
      if (d && typeof d.amount_cents === "number") setThanks(tipLabel(d.amount_cents, d.currency, navigator.language || "en-US"))
      tidy()
    })
    return () => {
      live = false
    }
  }, [look.preview, look.onepageId])

  const title = data.title?.trim() || tt("Leave a tip")
  const openSheet = (cents: number) => {
    track(block.id, "#tip")
    if (!sheet.available) return
    sheet.open({
      blockId: block.id,
      title: tt("Enter tip amount"),
      footless: true,
      body: <TipSheet blockId={block.id} look={look} data={data} currency={currency} start={cents} />,
    })
  }
  const send = async () => {
    if (busy) return
    /* A note asked for: the sheet, with this amount in it. */
    if (data.tip_message && sheet.available) return openSheet(shownPick)
    setBusy(true)
    setError(null)
    track(block.id, "#tip")
    const failed = await startTip(look, block.id, shownPick, null, "card")
    if (failed) setError(failed)
    setBusy(false)
  }

  /*
    The amounts: tinted from the card's own words (currentColor), so they read on any page; the picked one filled with
    those words' colour and words that read on it (lib/onepage/contrast inkOn), as round AR measured. Their corners
    follow the page's buttons, a pill at most.
  */
  /* The picked amount is the card turned round: filled with the card's own words' colour, its words in the card's colour where that reads. */
  const cardInk = String(parts.surface.color || look.theme.button_text_color || "#111113")
  const cardGround = String(parts.surface.backgroundColor || "#ffffff")
  const pickedFill = /^(#|rgb|hsl)/.test(cardInk) ? cardInk : "#111113"
  const pickedInk = inkOn(pickedFill, /^(#|rgb|hsl)/.test(cardGround) && !/^(transparent|rgba\([^)]*,\s*0\))$/.test(cardGround) ? cardGround : "#ffffff")
  const chipRadius = Math.min(boxRadius(look.theme), 999)
  const columns = presets.length + (data.tip_custom ? 1 : 0)
  const chip = (on: boolean): React.CSSProperties => ({
    borderRadius: chipRadius,
    minHeight: px(44, look.scale),
    fontSize: px(15, look.scale),
    backgroundColor: on ? pickedFill : "color-mix(in srgb, currentColor 7%, transparent)",
    color: on ? pickedInk : undefined,
    boxShadow: on ? "none" : "inset 0 0 0 1px color-mix(in srgb, currentColor 16%, transparent)",
  })
  const chipClass = "relative grid place-items-center px-1 font-semibold tabular-nums outline-none transition-[background-color,color,box-shadow,scale] duration-200 ease-out [-webkit-tap-highlight-color:transparent] active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-1 motion-reduce:transition-none"

  return (
    <div data-onepage-app="tips" data-tip-mode="storelib" className="w-full text-left" style={{ ...parts.surface, borderRadius: parts.radius, padding: px(16, look.scale) }}>
      <div className="flex items-center" style={{ gap: px(12, look.scale) }}>
        <span aria-hidden className="grid shrink-0 place-items-center rounded-full" style={{ width: px(40, look.scale), height: px(40, look.scale), background: "color-mix(in srgb, currentColor 12%, transparent)" }}>
          {thanks ? <Check style={{ width: px(19, look.scale), height: px(19, look.scale) }} /> : <HandCoins style={{ width: px(19, look.scale), height: px(19, look.scale) }} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold leading-tight" style={{ fontSize: px(16, look.scale) }} data-block-title="">
            {title}
          </span>
          {thanks ? (
            <span className="mt-0.5 block font-medium leading-snug [animation:op-late-in_240ms_ease-out_both] motion-reduce:[animation:none]" style={{ fontSize: px(13.5, look.scale) }} data-tip-thanks="" role="status">
              {tt("Thank you for the {amount} tip.", { amount: thanks })}
            </span>
          ) : data.subtitle?.trim() ? (
            <span className="mt-0.5 block leading-snug opacity-75" style={{ fontSize: px(13, look.scale) }}>
              {data.subtitle}
            </span>
          ) : null}
        </span>
      </div>
      {thanks ? null : (
        <>
          <div role="radiogroup" aria-label={tt("Amount")} className="grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: px(8, look.scale), marginTop: px(14, look.scale) }}>
            {presets.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={shownPick === c}
                onClick={() => {
                  setPicked(c)
                  setError(null)
                }}
                data-tip-amount={c}
                className={chipClass}
                style={chip(shownPick === c)}
              >
                {tipLabel(c, currency, locale)}
              </button>
            ))}
            {data.tip_custom ? (
              <button type="button" aria-haspopup="dialog" onClick={() => openSheet(shownPick)} data-tip-amount="other" className={chipClass} style={chip(false)}>
                {tt("Other")}
              </button>
            ) : null}
          </div>
          <div className="flex" style={{ marginTop: px(12, look.scale) }}>
            <CardButton look={look} onClick={send} disabled={busy} wide big data={{ "data-tip-send": "" }} label={busy ? tt("Opening checkout...") : tt("Tip {amount}", { amount: tipLabel(shownPick, currency, locale) })} />
          </div>
          {error ? (
            <p className="mt-2 font-medium" style={{ fontSize: px(13, look.scale) }} role="alert" data-tip-error="">
              {error}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

/* ─── The sheet ───────────────────────────────────────────────────────── */

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const

function TipSheet({ blockId, look, data, currency, start }: { blockId: string; look: AppBlockLook; data: AppBlockData; currency: string; start: number }) {
  const locale = useLocale()
  const floor = tipFloor(currency)
  /* What the visitor has typed; the amount is read from it, so "5." and "5.5" are kept as typed. */
  const [text, setText] = React.useState(() => keypadText(Math.max(floor, start), currency))
  const [keypad, setKeypad] = React.useState(false)
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const amountRef = React.useRef<HTMLDivElement>(null)
  const cents = typedTipCents(text, currency) ?? 0
  /* The server's own rule (checkTipAmount): a preset, or, when the block lets visitors choose, any amount from the floor to the cap. */
  const check = checkTipAmount(data, cents, floor, currency)
  const ok = check.ok
  /* Read off the refusal without narrowing, which the tests' non-strict build does not do. */
  const refused = check.ok ? null : (check as { error: string }).error
  const hint =
    !refused || !cents
      ? null
      : refused === "too_small"
        ? tt("At least {amount}", { amount: tipLabel(floor, currency, locale) })
        : refused === "too_large"
          ? tt("At most {amount}", { amount: tipLabel(TIP_MAX_CENTS, currency, locale) })
          : refused === "not_offered"
            ? tt("Choose one of the amounts")
            : null
  const presets = tipAmounts(data, currency)
  const custom = data.tip_custom === true

  /* + and -: on the grid that suits the amount when visitors may choose their own, else from one preset to the next. */
  const step = (dir: 1 | -1) => {
    setError(null)
    if (custom) return setText(keypadText(tipStepped(cents || floor, dir, currency), currency))
    const next = dir > 0 ? presets.find((p) => p > cents) : [...presets].reverse().find((p) => p < cents)
    setText(keypadText(next ?? (dir > 0 ? presets[presets.length - 1] : presets[0]), currency))
  }
  const press = (key: string) => {
    if (!custom) return
    setError(null)
    setText((t) => keypadInput(t, key, currency))
  }

  /* On a computer the amount takes the keys at once: digits, the point, Backspace, and the arrows to step. */
  React.useEffect(() => {
    if (window.matchMedia?.("(pointer: fine)").matches) amountRef.current?.focus({ preventScroll: true })
  }, [])
  const onKey = (e: React.KeyboardEvent) => {
    if (/^\d$/.test(e.key)) press(e.key)
    else if (e.key === "." || e.key === ",") press(".")
    else if (e.key === "Backspace") press("back")
    else if (e.key === "ArrowUp" || e.key === "ArrowRight") step(1)
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") step(-1)
    else if (e.key === "Enter") void go()
    else return
    e.preventDefault()
  }

  const go = async () => {
    if (busy) return
    if (!ok) {
      setError(hint || tt("Enter an amount."))
      return
    }
    setBusy(true)
    setError(null)
    const failed = await startTip(look, blockId, cents, data.tip_message ? note.trim() : null, "sheet")
    if (failed) setError(failed)
    setBusy(false)
  }

  const label = cents ? tipLabel(cents, currency, locale) : tipLabel(0, currency, locale)
  /* Long amounts step down a size rather than wrap. */
  const size = label.length > 9 ? 40 : label.length > 6 ? 48 : 56
  /* Round 3: a step that cannot go further shows it in the sheet's small print (5:1 on the sheet), not faded to a third. */
  const round =
    "grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--sheet-field)] text-[var(--sheet-ink)] outline-none transition-[scale,opacity] duration-150 [-webkit-tap-highlight-color:transparent] active:scale-95 disabled:text-[var(--sheet-muted)] disabled:active:scale-100 focus-visible:ring-2 focus-visible:ring-[var(--sheet-ink)]"

  return (
    <div data-tip-sheet="" className="mx-auto flex w-full max-w-[400px] flex-col items-stretch px-1 pb-1 pt-2">
      <div className="flex items-center justify-between gap-3">
        <button type="button" aria-label={tt("Less")} onClick={() => step(-1)} disabled={!!cents && cents <= (custom ? floor : presets[0])} className={round} data-tip-minus="">
          <Minus aria-hidden className="h-5 w-5" />
        </button>
        <div
          ref={amountRef}
          role="spinbutton"
          tabIndex={0}
          aria-label={tt("Tip amount")}
          aria-valuenow={cents}
          aria-valuetext={label}
          aria-valuemin={custom ? floor : presets[0]}
          aria-valuemax={custom ? TIP_MAX_CENTS : presets[presets.length - 1]}
          onKeyDown={onKey}
          data-tip-value={cents}
          className="min-w-0 flex-1 truncate rounded-xl text-center font-bold tabular-nums leading-none tracking-tight text-[var(--sheet-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--sheet-ink)]/30"
          style={{ fontSize: size, paddingBlock: 10, fontFamily: "var(--opk-title-font, inherit)" }}
        >
          {text.endsWith(".") ? `${label}.` : label}
        </div>
        <button type="button" aria-label={tt("More")} onClick={() => step(1)} disabled={cents >= (custom ? TIP_MAX_CENTS : presets[presets.length - 1])} className={round} data-tip-plus="">
          <Plus aria-hidden className="h-5 w-5" />
        </button>
      </div>
      <p aria-live="polite" className="mt-1 min-h-[20px] text-center text-[13px] text-[var(--sheet-muted)]" data-tip-hint="">
        {error || hint || ""}
      </p>
      {custom ? (
      <button
        type="button"
        aria-expanded={keypad}
        onClick={() => setKeypad((k) => !k)}
        className="mx-auto mt-1 rounded-full px-3 py-1.5 text-[14px] font-medium text-[var(--sheet-ink)] underline decoration-[color-mix(in_srgb,var(--sheet-ink)_30%,transparent)] underline-offset-4 outline-none transition-[text-decoration-color] [@media(hover:hover)]:hover:decoration-[var(--sheet-ink)] focus-visible:ring-2 focus-visible:ring-[var(--sheet-ink)]"
        data-tip-keypad-toggle=""
      >
        {keypad ? tt("Hide keypad") : tt("Show keypad")}
      </button>
      ) : null}
      {/* The keypad opens and closes by its own height (a grid row from 0fr to 1fr), never a jump. */}
      <div className={cn("grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none", keypad ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")} aria-hidden={!keypad} inert={!keypad ? true : undefined}>
        <div className="min-h-0 overflow-hidden">
          <div className="grid grid-cols-3 gap-2 pt-2" data-tip-keypad="">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => press(k)}
                aria-label={k === "back" ? tt("Delete") : k === "." ? tt("Decimal point") : k}
                className="grid h-12 place-items-center rounded-xl bg-[var(--sheet-field)] text-[20px] font-semibold tabular-nums text-[var(--sheet-ink)] outline-none transition-[scale,background-color] duration-100 [-webkit-tap-highlight-color:transparent] active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-[var(--sheet-ink)]"
                data-tip-key={k}
              >
                {k === "back" ? <Delete aria-hidden className="h-5 w-5" /> : k}
              </button>
            ))}
          </div>
        </div>
      </div>
      {data.tip_message ? (
        <input
          type="text"
          value={note}
          maxLength={280}
          onChange={(e) => setNote(e.target.value)}
          placeholder={tt("Add a note (optional)")}
          aria-label={tt("Note")}
          data-tip-message=""
          className="mt-4 h-12 w-full rounded-xl border border-[var(--sheet-rule)] bg-[var(--sheet-field)] px-4 text-[16px] text-[var(--sheet-ink)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--sheet-muted)] focus:border-[var(--sheet-ink)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--sheet-ink)_12%,transparent)]"
        />
      ) : null}
      <button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        aria-disabled={!ok || undefined}
        data-tip-continue=""
        className={cn(
          "mt-4 flex h-[52px] w-full items-center justify-center gap-2 text-[16px] font-semibold outline-none transition-[opacity,scale] duration-150 [-webkit-tap-highlight-color:transparent] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--sheet-ink)] focus-visible:ring-offset-2",
          !ok && "opacity-45",
        )}
        style={{ borderRadius: "var(--opk-radius, 14px)", background: "var(--opk-accent, var(--sheet-ink))", color: "var(--opk-accent-ink, var(--sheet-on-ink))" }}
      >
        {busy ? tt("Opening checkout...") : tt("Continue")}
      </button>
      <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[12.5px] text-[var(--sheet-muted)]">
        <Lock aria-hidden className="h-3.5 w-3.5" />
        {tt("Paid securely through Stripe")}
      </p>
    </div>
  )
}
