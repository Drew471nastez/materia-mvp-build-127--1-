"use client"

/**
 * ===========================================================================
 *  SETTINGS › CHECKOUT › CHECKOUT TEXT
 * ===========================================================================
 * A store's own words on its checkout, one language at a time. Each text a
 * store may reword (lib/checkout-text/registry.ts) has a field with what
 * checkout says by default in that language, and the checkout itself is
 * beside it: the website's real checkout, thank you page and order page in
 * a frame (app/checkout/preview, lib/checkout-text/preview.ts), with the
 * store's name, logo, currency, settings and products, in the words as they
 * are typed. Nothing in the preview is a drawing of a checkout.
 *
 * TWO WAYS IN, ONE STATE. Choose a field and the preview goes to the page
 * the text is on, rings it and brings it into view; press words in the
 * preview and their field opens. A text the checkout does not show with the
 * store's settings (cash on delivery off, no pickup) says so under its
 * field instead of being pretended.
 *
 * THE SCREEN. From 1024px the fields are a column on the left and the
 * checkout fills the rest, as a phone or as a computer, scaled to fit. On a
 * phone the checkout is the screen, at the phone's own width: a word pressed
 * opens its field in a sheet over the bottom of it, the page left undimmed
 * so the change is seen as it is typed, and All texts lists every field.
 * Every movement is a transform or an opacity.
 *
 * Locked texts (consent, amounts, payment status, the payment provider's
 * words, refund policies) are listed at the foot with why, never offered.
 * Every field is checked as it is typed with the same rule the server keeps
 * (validateOverride), so Save never surprises. "Default changed since you
 * edited" appears when Storelib's own words for a text changed after the
 * store wrote theirs; theirs still shows until they choose.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, Loader2, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { BTN_PRIMARY, Notice, api } from "@/components/physical/ui"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { tt } from "@/lib/i18n/text"
import { editableById, validateOverride, type TextGroupId } from "@/lib/checkout-text/registry"
import { CHECKOUT_PREVIEW_CHANNEL, CHECKOUT_PREVIEW_PATH, viewFor, wordsWithDraft, type CheckoutPreviewData, type PreviewMode, type PreviewState, type PreviewView, type ToEditor, type ToFrame } from "@/lib/checkout-text/preview"

interface Item {
  id: string
  group: TextGroupId
  source: string
  note: string
  max: number
  placeholders: string[]
  default: string
  value: string
  defaultChanged: boolean
}
interface Loaded {
  ready: boolean
  lang: string
  languages: { code: string; name: string; own: string }[]
  groups: { id: TextGroupId; title: string }[]
  items: Item[]
  locked: { source: string; reason: string; text?: string }[]
}

const GROUP_TITLE: Record<TextGroupId, () => string> = {
  header: () => tt("Header"),
  contact: () => tt("Contact"),
  delivery: () => tt("Delivery"),
  payment: () => tt("Payment"),
  buttons: () => tt("Buttons"),
  summary: () => tt("Order summary"),
  messages: () => tt("Messages"),
}

/** The width a computer's checkout is drawn at before it is scaled into the pane: its two columns open from 1024. */
const COMPUTER_WIDTH = 1280
/** A phone's. */
const PHONE_WIDTH = 390
/** How long a frame has to say it is ready before it is loaded once more. */
const FRAME_READY_MS = 6000

function useMedia(query: string): boolean {
  const [match, setMatch] = React.useState(() => typeof window !== "undefined" && window.matchMedia(query).matches)
  React.useEffect(() => {
    const mq = window.matchMedia(query)
    const sync = () => setMatch(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [query])
  return match
}

/** An element's size, measured once per change and shared by everything that needs it. */
function useSize<T extends HTMLElement>(): [React.RefCallback<T>, { width: number; height: number }] {
  const [size, setSize] = React.useState({ width: 0, height: 0 })
  const observer = React.useRef<ResizeObserver | null>(null)
  const ref = React.useCallback((el: T | null) => {
    observer.current?.disconnect()
    if (!el) return
    const read = () => setSize((s) => (s.width === el.clientWidth && s.height === el.clientHeight ? s : { width: el.clientWidth, height: el.clientHeight }))
    read()
    observer.current = new ResizeObserver(read)
    observer.current.observe(el)
  }, [])
  return [ref, size]
}

export function CheckoutTextEditor({ onClose }: { onClose: (changed: number) => void }) {
  const [data, setData] = React.useState<Loaded | null>(null)
  const [preview, setPreview] = React.useState<CheckoutPreviewData | null>(null)
  const [previewError, setPreviewError] = React.useState<string | null>(null)
  const [lang, setLang] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<Record<string, string>>({})
  const [focus, setFocus] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [savedNote, setSavedNote] = React.useState<string | null>(null)
  const [mounted, setMounted] = React.useState(false)
  const [mode, setMode] = React.useState<PreviewMode>("digital")
  const [view, setView] = React.useState<PreviewView>("checkout")
  const [device, setDevice] = React.useState<"phone" | "computer">("phone")
  /* What the frame said about each text: on the page it is on, or not shown with this store's settings. */
  const [shown, setShown] = React.useState<Record<string, boolean>>({})
  const [sheet, setSheet] = React.useState<"one" | "all" | null>(null)
  const wide = useMedia("(min-width: 1024px)")
  const listRef = React.useRef<HTMLDivElement>(null)

  const load = React.useCallback(async (which: string | null) => {
    setError(null)
    setPreviewError(null)
    const q = which ? `?lang=${encodeURIComponent(which)}` : ""
    const [r, p] = await Promise.all([api<Loaded>(`/api/store/checkout-text${q}`, { method: "GET" }), api<CheckoutPreviewData>(`/api/store/checkout-text/preview${q}`, { method: "GET" })])
    if (!r.ok) {
      setError(r.error)
      return
    }
    setData(r.data)
    setLang(r.data.lang)
    setDraft(Object.fromEntries(r.data.items.map((i) => [i.id, i.value])))
    if (p.ok) setPreview(p.data)
    else setPreviewError(p.error)
  }, [])

  React.useEffect(() => {
    setMounted(true)
    void load(null)
    const was = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = was
    }
  }, [load])

  /* A store that sells things that ship opens on that checkout: it has every text a download's has, and the address. */
  const opened = React.useRef(false)
  React.useEffect(() => {
    if (!preview || opened.current) return
    opened.current = true
    if (preview.shipped && !preview.shipped.standIn) setMode("shipped")
  }, [preview])

  const dirty = data ? data.items.filter((i) => (draft[i.id] ?? "") !== i.value) : []
  const problems = new Map<string, string>()
  for (const i of data?.items ?? []) {
    const entry = editableById(i.id)
    if (!entry) continue
    const v = validateOverride(entry, draft[i.id] ?? "")
    if (!v.ok) problems.set(i.id, v.error)
  }
  const changedCount = data ? data.items.filter((i) => i.value).length : 0

  const close = React.useCallback(() => {
    if (dirty.length && !window.confirm(tt("Leave without saving your changes?"))) return
    onClose(changedCount)
  }, [dirty.length, changedCount, onClose])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /* A sheet takes its own Escape. */
      if (e.key === "Escape" && !sheet) close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [close, sheet])

  const save = async () => {
    if (!data || !lang || dirty.length === 0 || problems.size) return
    setSaving(true)
    setError(null)
    const r = await api<{ ok: true }>("/api/store/checkout-text", { method: "PUT", body: { lang, changes: dirty.map((i) => ({ id: i.id, text: draft[i.id] ?? "" })) } })
    setSaving(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setSavedNote(tt("Saved. Your checkout shows it now."))
    await load(lang)
  }

  /* "Keep mine": saved again, so it is kept against the new default. "Use default": cleared. */
  const settle = async (item: Item, keep: boolean) => {
    if (!lang) return
    const r = await api<{ ok: true }>("/api/store/checkout-text", { method: "PUT", body: { lang, changes: [{ id: item.id, text: keep ? item.value : "" }] } })
    if (!r.ok) setError(r.error)
    else await load(lang)
  }

  const switchLanguage = (next: string) => {
    if (next === lang) return
    if (dirty.length && !window.confirm(tt("Switch language without saving your changes?"))) return
    setSavedNote(null)
    setLang(next)
    setShown({})
    void load(next)
  }

  /* A text chosen, in the list or in the preview: the preview goes to the page it is on. */
  const choose = React.useCallback(
    (id: string) => {
      setFocus(id)
      if (preview) {
        const next = viewFor(id, { mode, view }, !!preview.shipped)
        setMode(next.mode)
        setView(next.view)
      }
    },
    [preview, mode, view],
  )

  /* Words pressed in the preview: their field, focused (in the list on a computer, in a sheet on a phone). */
  const picked = React.useCallback(
    (id: string) => {
      choose(id)
      if (!wide) {
        setSheet("one")
        return
      }
      const input = document.getElementById(`ct-${id}`) as HTMLInputElement | null
      const list = listRef.current
      if (!input || !list) return
      input.focus({ preventScroll: true })
      const row = input.closest("li") ?? input
      const a = row.getBoundingClientRect()
      const b = list.getBoundingClientRect()
      if (a.top < b.top + 16 || a.bottom > b.bottom - 16) list.scrollTo({ top: list.scrollTop + a.top - b.top - b.height / 3, behavior: "smooth" })
    },
    [choose, wide],
  )

  const words = React.useMemo(() => (preview ? wordsWithDraft(preview.words, draft) : null), [preview, draft])
  const kase = preview ? (mode === "shipped" && preview.shipped ? preview.shipped : preview.digital) : null
  const shownView: PreviewView = view === "order" && mode !== "shipped" ? "thanks" : view
  /* How much of the frame's bottom a phone's sheet covers, so the text being edited is brought into view above it. */
  const cover = wide ? 0 : sheet === "all" ? 0.62 : sheet === "one" ? 0.5 : 0

  const state = React.useMemo<PreviewState | null>(() => (preview && words ? { data: preview, words, mode, view: shownView, focus, cover } : null), [preview, words, mode, shownView, focus, cover])
  const stateRef = React.useRef(state)
  stateRef.current = state
  const onShown = React.useCallback((id: string, v: boolean) => setShown((s) => (s[id] === v ? s : { ...s, [id]: v })), [])

  const rowProps = (i: Item) => ({
    item: i,
    value: draft[i.id] ?? "",
    problem: problems.get(i.id) ?? null,
    absent: focus === i.id && shown[i.id] === false,
    onChange: (v: string) => {
      setSavedNote(null)
      setDraft((d) => ({ ...d, [i.id]: v }))
    },
    onFocus: () => choose(i.id),
    onSettle: (keep: boolean) => void settle(i, keep),
  })

  const groups = data ? data.groups.map((g) => ({ g, items: data.items.filter((i) => i.group === g.id) })).filter((x) => x.items.length) : []

  const list = data ? (
    <div className="space-y-6">
      {!data.ready ? <Notice tone="amber">{tt("Checkout text needs its database update (SQL part 212). Until it runs, checkout shows Storelib's words and changes here are not kept.")}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      {savedNote && !dirty.length ? <Notice tone="green">{savedNote}</Notice> : null}
      {groups.map(({ g, items }) => (
        <section key={g.id} data-text-group={g.id}>
          <h2 className="px-1 text-[15px] font-semibold text-[#1a1a2e]">{GROUP_TITLE[g.id]()}</h2>
          <ul className="mt-1.5">
            {items.map((i) => (
              <TextRow key={i.id} {...rowProps(i)} focused={focus === i.id} />
            ))}
          </ul>
        </section>
      ))}
      <section className="px-1 pb-2" data-text-locked="">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-[#1a1a2e]">
          <Lock className="h-3.5 w-3.5 text-[#6b7280]" aria-hidden />
          {tt("Locked")}
        </h2>
        <p className="mt-1.5 text-[13px] leading-5 text-[#6b7280]">{tt("Legal and consent text, amounts, payment results and refund policies always read as Storelib writes them, so buyers are never misled.")}</p>
        <ul className="mt-3 space-y-2">
          {data.locked.map((l) => (
            <li key={l.source} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 text-[#4b5563]">{l.text ?? l.source}</span>
              <span className="shrink-0 text-[#9ca3af]">{tt(l.reason)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  ) : null

  const toolbar = preview ? (
    <PreviewBar
      hasShipped={!!preview.shipped}
      mode={mode}
      view={shownView}
      device={wide ? device : null}
      onMode={(m) => {
        setMode(m)
        if (m !== "shipped" && view === "order") setView("thanks")
      }}
      onView={setView}
      onDevice={setDevice}
    />
  ) : null
  const standIn = kase?.standIn ? (mode === "shipped" ? tt("Nothing that ships is on sale yet, so a sample line stands in for it.") : tt("No download is on sale yet, so a sample line stands in for it.")) : null

  if (!mounted) return null
  const focusedItem = focus && data ? (data.items.find((i) => i.id === focus) ?? null) : null

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={tt("Checkout text")} data-checkout-text-editor="" className="fixed inset-0 z-[70] flex flex-col bg-[#f8f9fa]">
      <header className="flex shrink-0 items-center gap-2 border-b border-[#e5e7eb] bg-white px-3 pb-2.5 pt-[calc(10px+env(safe-area-inset-top,0px))] sm:gap-3 sm:px-5">
        <button type="button" onClick={close} aria-label={tt("Back")} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#1a1a2e] hover:bg-[#f1f2f4]">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[16px] font-semibold text-[#1a1a2e] sm:text-[17px]">{tt("Checkout text")}</h1>
          <p className="hidden truncate text-[13px] text-[#6b7280] sm:block">{tt("Your own words on your checkout, in each language.")}</p>
        </div>
        {data && data.languages.length > 1 ? (
          <label className="flex shrink-0 items-center">
            <span className="sr-only">{tt("Language")}</span>
            <select
              value={lang ?? ""}
              onChange={(e) => switchLanguage(e.target.value)}
              data-checkout-text-language=""
              className="h-10 max-w-[34vw] rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-[14px] text-[#1a1a2e] outline-none focus:border-[#9ca3af]"
            >
              {data.languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.own}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="button" onClick={save} disabled={!dirty.length || problems.size > 0 || saving} className={cn(BTN_PRIMARY, "shrink-0")} data-checkout-text-save="">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {tt("Save")}
        </button>
      </header>

      {!data ? (
        error ? (
          <div className="mx-auto w-full max-w-[720px] p-4">
            <Notice>{error}</Notice>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 lg:grid-cols-[440px_minmax(0,1fr)]" aria-busy="true">
            <div className="hidden space-y-3 border-r border-[#e5e7eb] bg-white p-5 lg:block">
              <div className="h-4 w-24 animate-pulse rounded bg-[#eceef1]" />
              <div className="h-[72px] animate-pulse rounded-lg bg-[#f1f2f4]" />
              <div className="h-[72px] animate-pulse rounded-lg bg-[#f1f2f4]" />
            </div>
            <div className="bg-[#eef0f2]" />
          </div>
        )
      ) : wide ? (
        <div className="grid min-h-0 flex-1 grid-cols-[440px_minmax(0,1fr)] xl:grid-cols-[480px_minmax(0,1fr)]" data-checkout-text-layout="side">
          <div ref={listRef} className="min-h-0 overflow-y-auto overscroll-contain border-r border-[#e5e7eb] bg-white px-5 py-5" data-checkout-text-list="">
            {list}
          </div>
          <div className="flex min-h-0 min-w-0 flex-col bg-[#eef0f2]" aria-label={tt("Preview")} data-checkout-text-preview="">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 pb-2 pt-3">
              {toolbar}
              {standIn ? <p className="text-[12.5px] text-[#6b7280]">{standIn}</p> : null}
            </div>
            <PreviewCanvas state={state} device={device} error={previewError} onPick={picked} onShown={onShown} stateRef={stateRef} />
          </div>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col" data-checkout-text-layout="phone">
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-[#e5e7eb] bg-white px-3 py-2 [scrollbar-width:none]">{toolbar}</div>
          <PreviewCanvas state={state} device="fill" error={previewError} onPick={picked} onShown={onShown} stateRef={stateRef} />
          <div className="flex shrink-0 items-center gap-3 border-t border-[#e5e7eb] bg-white px-4 pt-2.5" style={{ paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))" }}>
            <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-[#6b7280]">{standIn ?? tt("Tap any words on your checkout to change them.")}</p>
            <button type="button" onClick={() => setSheet("all")} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-[14px] font-medium text-[#1a1a2e]" data-checkout-text-all="">
              {tt("All texts")}
              {dirty.length ? <span className="tabular-nums text-[#8b5cf6]">{dirty.length}</span> : null}
            </button>
          </div>
          <BottomSheet
            isOpen={sheet === "one" && !!focusedItem}
            onClose={() => setSheet(null)}
            scrim="clear"
            aboveKeyboard
            hideFrom={null}
            zIndex={90}
            label={tt("Checkout text")}
            header={
              <div className="flex items-center justify-between gap-3 px-4 pb-1">
                <p className="text-[15px] font-semibold text-[#1a1a2e]">{focusedItem ? GROUP_TITLE[focusedItem.group]() : ""}</p>
                <button type="button" onClick={() => setSheet(null)} className="h-9 rounded-lg px-2 text-[14px] font-medium text-[#1a1a2e]">
                  {tt("Done")}
                </button>
              </div>
            }
          >
            <div className="px-3 pb-4" data-checkout-text-sheet="one">
              {focusedItem ? (
                <ul>
                  <TextRow {...rowProps(focusedItem)} focused autoFocus />
                </ul>
              ) : null}
            </div>
          </BottomSheet>
          <BottomSheet isOpen={sheet === "all"} onClose={() => setSheet(null)} scrim="clear" aboveKeyboard hideFrom={null} zIndex={90} title={tt("All texts")} maxHeight="62dvh">
            <div className="px-3 pb-6" data-checkout-text-sheet="all">
              {list}
            </div>
          </BottomSheet>
        </div>
      )}
    </div>,
    document.body,
  )
}

function TextRow({
  item,
  value,
  problem,
  absent,
  focused,
  autoFocus,
  onChange,
  onFocus,
  onSettle,
}: {
  item: Item
  value: string
  problem: string | null
  absent: boolean
  focused: boolean
  autoFocus?: boolean
  onChange: (v: string) => void
  onFocus: () => void
  onSettle: (keep: boolean) => void
}) {
  const id = `ct-${item.id}`
  return (
    <li className="relative border-t border-[#f0f1f3] px-1 py-3.5 first:border-t-0" data-text-row={item.id} data-focused={focused ? "" : undefined}>
      {/* The chosen text's mark, faded in: the same violet as its ring in the preview. */}
      <span aria-hidden className={cn("absolute -left-2 bottom-3.5 top-3.5 w-[3px] rounded-full bg-[#8b5cf6] transition-opacity duration-150", focused ? "opacity-100" : "opacity-0")} />
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="min-w-0 text-[14px] font-medium leading-5 text-[#1a1a2e]">
          {item.default}
        </label>
        {value ? (
          <button type="button" onClick={() => onChange("")} className="shrink-0 text-[13px] font-medium text-[#6b7280] underline-offset-2 hover:text-[#1a1a2e] hover:underline">
            {tt("Use default")}
          </button>
        ) : null}
      </div>
      <p className="mt-0.5 text-[12.5px] leading-[18px] text-[#6b7280]">{tt(item.note)}</p>
      <input
        id={id}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        maxLength={item.max + 20}
        placeholder={item.default}
        aria-invalid={!!problem}
        aria-describedby={problem ? `${id}-problem` : undefined}
        enterKeyHint="done"
        className={cn(
          "mt-2 h-11 w-full min-w-0 rounded-lg border bg-white px-3 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] placeholder:text-[#b0b5bd] focus:ring-[3px] lg:h-10 lg:text-[14px]",
          problem ? "border-[#f04438] focus:ring-[rgba(240,68,56,0.12)]" : "border-[#e5e7eb] focus:border-[#9ca3af] focus:ring-[rgba(17,24,39,0.06)]",
        )}
      />
      <div className="mt-1 flex items-start justify-between gap-3">
        {problem ? (
          <p id={`${id}-problem`} className="text-[12.5px] text-[#b42318]">
            {problem}
          </p>
        ) : absent ? (
          <p className="text-[12.5px] text-[#9a6700]" data-text-absent="">
            {tt("Your checkout doesn't show this with its current settings.")}
          </p>
        ) : item.placeholders.length ? (
          <p className="text-[12.5px] text-[#9ca3af]">{tt("Keep {list} in it.", { list: item.placeholders.map((p) => `{${p}}`).join(" ") })}</p>
        ) : (
          <span />
        )}
        {value ? (
          <span className={cn("shrink-0 text-[12px] tabular-nums", value.length > item.max ? "text-[#b42318]" : "text-[#9ca3af]")}>
            {value.length}/{item.max}
          </span>
        ) : null}
      </div>
      {item.defaultChanged && item.value ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[#fffaeb] px-3 py-2 text-[13px] text-[#93370d]" data-default-changed="">
          <span>{tt("Default changed since you edited.")}</span>
          <button type="button" className="font-medium underline underline-offset-2" onClick={() => onSettle(false)}>
            {tt("Use the new default")}
          </button>
          <button type="button" className="font-medium underline underline-offset-2" onClick={() => onSettle(true)}>
            {tt("Keep mine")}
          </button>
        </div>
      ) : null}
    </li>
  )
}

/* ── The preview ────────────────────────────────────────────────────── */

/** A row of choices whose marker slides under the chosen one: one transform, equal widths, no measuring. */
function Segments<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  const at = options.findIndex((o) => o.id === value)
  return (
    <div role="radiogroup" aria-label={label} className="relative inline-grid shrink-0 rounded-lg bg-[#e4e6ea] p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} data-preview-segments={label}>
      <span
        aria-hidden
        className="absolute bottom-0.5 left-0.5 top-0.5 rounded-md bg-white shadow-[0_1px_2px_rgba(17,24,39,0.12)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${Math.max(0, at) * 100}%)`, opacity: at < 0 ? 0 : 1 }}
      />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn("relative h-8 whitespace-nowrap rounded-md px-3 text-[13px] font-medium", value === o.id ? "text-[#1a1a2e]" : "text-[#6b7280] hover:text-[#1a1a2e]")}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function PreviewBar({
  hasShipped,
  mode,
  view,
  device,
  onMode,
  onView,
  onDevice,
}: {
  hasShipped: boolean
  mode: PreviewMode
  view: PreviewView
  device: "phone" | "computer" | null
  onMode: (m: PreviewMode) => void
  onView: (v: PreviewView) => void
  onDevice: (d: "phone" | "computer") => void
}) {
  const views: { id: PreviewView; label: string }[] = [
    { id: "checkout", label: tt("Checkout") },
    { id: "thanks", label: tt("Thank you") },
    /* On a phone the bar keeps to two choices a side, so it fits; the order page still opens for its own texts. */
    ...(mode === "shipped" && device ? [{ id: "order" as const, label: tt("Order page") }] : []),
  ]
  return (
    <div className="flex items-center gap-2">
      {hasShipped ? (
        <Segments
          label={tt("Checkout")}
          value={mode}
          onChange={onMode}
          options={[
            { id: "digital", label: tt("Digital") },
            { id: "shipped", label: tt("Shipped") },
          ]}
        />
      ) : null}
      <Segments label={tt("Page")} value={view} onChange={onView} options={views} />
      {device ? (
        <Segments
          label={tt("Screen")}
          value={device}
          onChange={onDevice}
          options={[
            { id: "phone", label: tt("Phone") },
            { id: "computer", label: tt("Computer") },
          ]}
        />
      ) : null}
    </div>
  )
}

/**
 * The frame, sized for the screen it stands for: a phone 390 wide, a
 * computer 1280 wide scaled down to the pane (a transform, so the checkout
 * lays itself out as on a computer), or on a phone the whole space at the
 * phone's own width. It hands the frame the state once it says it is ready
 * and on every change after, at most once a frame.
 */
function PreviewCanvas({
  state,
  device,
  error,
  onPick,
  onShown,
  stateRef,
}: {
  state: PreviewState | null
  device: "phone" | "computer" | "fill"
  error: string | null
  onPick: (id: string) => void
  onShown: (id: string, shown: boolean) => void
  stateRef: React.MutableRefObject<PreviewState | null>
}) {
  const frame = React.useRef<HTMLIFrameElement>(null)
  const ready = React.useRef(false)
  const [drawn, setDrawn] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  const [paneRef, pane] = useSize<HTMLDivElement>()
  const handlers = React.useRef({ onPick, onShown })
  handlers.current = { onPick, onShown }

  const send = React.useCallback(() => {
    const win = frame.current?.contentWindow
    const s = stateRef.current
    if (!win || !ready.current || !s) return
    win.postMessage({ channel: CHECKOUT_PREVIEW_CHANNEL, kind: "state", state: s } satisfies ToFrame, window.location.origin)
  }, [stateRef])

  React.useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !frame.current || e.source !== frame.current.contentWindow) return
      const m = e.data as ToEditor | null
      if (!m || m.channel !== CHECKOUT_PREVIEW_CHANNEL) return
      if (m.kind === "ready") {
        ready.current = true
        send()
      } else if (m.kind === "drawn") setDrawn(true)
      else if (m.kind === "pick") handlers.current.onPick(m.id)
      else if (m.kind === "shown") handlers.current.onShown(m.id, m.shown)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [send])

  /* Every change, at most once a frame. */
  React.useEffect(() => {
    if (!ready.current) return
    const id = requestAnimationFrame(send)
    return () => cancelAnimationFrame(id)
  }, [state, send])

  /* A frame that never says it is ready is loaded once more. */
  React.useEffect(() => {
    if (attempt > 0 || !state) return
    const id = window.setTimeout(() => {
      if (!ready.current) setAttempt(1)
    }, FRAME_READY_MS)
    return () => window.clearTimeout(id)
  }, [attempt, state])

  /* One measurement of the pane decides the frame's size and scale. */
  const gutter = 20
  const availW = Math.max(0, pane.width - gutter * 2)
  const availH = Math.max(0, pane.height - gutter)
  const logicalW = device === "computer" ? COMPUTER_WIDTH : device === "phone" ? PHONE_WIDTH : pane.width
  const scale = device === "computer" ? Math.min(1, availW / COMPUTER_WIDTH || 1) : 1
  const logicalH = device === "fill" ? pane.height : Math.round(availH / scale)
  const boxW = device === "fill" ? pane.width : Math.round(logicalW * scale)
  const boxH = device === "fill" ? pane.height : Math.round(logicalH * scale)
  /* A change of screen fades the frame out and back, rather than showing it lay itself out again. */
  const [faded, setFaded] = React.useState(false)
  const lastDevice = React.useRef(device)
  React.useEffect(() => {
    if (lastDevice.current === device) return
    lastDevice.current = device
    setFaded(true)
    const id = window.setTimeout(() => setFaded(false), 180)
    return () => window.clearTimeout(id)
  }, [device])

  const src = attempt ? `${CHECKOUT_PREVIEW_PATH}&again=${attempt}` : CHECKOUT_PREVIEW_PATH
  return (
    <div ref={paneRef} className={cn("relative min-h-0 flex-1 overflow-hidden", device === "fill" ? "bg-white" : "")} data-preview-pane="">
      {error ? (
        <div className="absolute inset-x-0 top-0 p-4">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      {pane.width > 0 && pane.height > 0 && state ? (
        <div
          className={cn("absolute left-1/2 top-0 overflow-hidden bg-white", device === "fill" ? "" : "rounded-[14px] shadow-[0_0_0_1px_rgba(17,24,39,0.06),0_12px_32px_-18px_rgba(17,24,39,0.28)]")}
          style={{ width: boxW, height: boxH, transform: "translateX(-50%)" }}
          data-preview-device={device}
        >
          <iframe
            ref={frame}
            src={src}
            title={tt("Preview of your checkout")}
            data-checkout-preview-frame=""
            data-drawn={drawn ? "" : undefined}
            /* Scripts and this origin, nothing more: the preview can never move the editor's page, open a window or send a form. */
            sandbox="allow-scripts allow-same-origin"
            className="absolute left-0 top-0 block border-0 transition-opacity duration-200 ease-out"
            style={{
              width: `${logicalW}px`,
              height: `${logicalH}px`,
              transform: scale === 1 ? undefined : `scale(${scale})`,
              transformOrigin: "0 0",
              opacity: drawn && !faded ? 1 : 0,
              colorScheme: "light",
            }}
          />
          {!drawn ? (
            <div aria-hidden className="absolute inset-0 space-y-3 p-5">
              <div className="h-5 w-32 animate-pulse rounded bg-[#eceef1]" />
              <div className="h-9 w-40 animate-pulse rounded bg-[#eceef1]" />
              <div className="h-24 animate-pulse rounded-lg bg-[#f1f2f4]" />
              <div className="h-44 animate-pulse rounded-lg bg-[#f1f2f4]" />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
