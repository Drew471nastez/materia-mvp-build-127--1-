"use client"

/**
 * ===========================================================================
 *  AN APP BLOCK'S SETTINGS AND LAYOUT (round AL)
 * ===========================================================================
 * One editor for every provider in lib/onepage/app-blocks, drawn inside the
 * block's Settings | Layout tabs (components/onepage/block-settings
 * BlockEditorTabs): the Links tab draws it once per tab and this shows the
 * half that tab is for (useBlockPart).
 *
 *   Settings   what it is: the address (read as it is typed, with what was
 *              found), the provider's own fields (posts, a list, a poll, the
 *              contact, the stores), the words, and Interaction: open it in
 *              a sheet on the page, or go to the address.
 *   Layout     how it is drawn: the provider's layouts as small pictures in
 *              the page's own colours, and a picture where the layout uses
 *              one.
 */

import * as React from "react"
import { ArrowUpRight, Loader2, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { useOnePage } from "@/lib/onepage/context"
import { useBlockPart } from "@/components/onepage/block-part"
import { ModeChoice, SettingsGroup } from "@/components/onepage/block-settings-kit"
import { ChoiceMark, Switch, fieldInput } from "@/components/onepage/editor-kit"
import { OnePageImageField } from "@/components/onepage/image-field"
import { PictureFitControl } from "@/components/onepage/layout-pickers"
import { AppTileMark, appDefaultButton, appProviderName } from "@/components/onepage/app-block"
import { INSTAGRAM_FILL, SocialIcon } from "@/components/onepage/brand-icons"
import { instagramUsername } from "@/lib/onepage/instagram-username"
import {
  APP_ITEMS_MAX,
  APP_POSTS_MAX,
  appAddressFromInput,
  appAddressShown,
  appEmbeds,
  appTakesHandle,
  isRetiredAppProvider,
  appLayoutOf,
  appOpenModeOf,
  appTarget,
  appUrlProblem,
  appEmail,
  appStores,
  providerOf,
  type AppBlockData,
  type AppItem,
  type AppLayout,
  type AppProvider,
} from "@/lib/onepage/app-blocks"
import type { OnePageBlock, OnePageBlockData, OnePageTheme } from "@/lib/onepage/types"
import { DataBlockSettings, dataLayoutLabel } from "@/components/onepage/data-block-editor"
import { TIP_STYLES, tipModeOf, tipStyleOf, type TipStyle } from "@/lib/onepage/tips"
import { STAT_SOURCES, statSourceOf, type StatSource } from "@/lib/onepage/stat-count"
import { PhoneNumberField } from "@/components/forms/phone-number-field"
import { digitsFromKept, fullNumber } from "@/lib/account/phone"

type Update = (updates: Partial<OnePageBlockData>) => void

const fieldLabel = "block text-[13px] font-medium text-[#1a1a2e]"
const hint = "text-[12.5px] leading-[1.4] text-[#6b7280]"
const problem = "text-[12.5px] leading-[1.4] text-[#b42318]"
const area =
  "min-h-[96px] w-full resize-y rounded-xl border border-[#e3e4e8] bg-white px-4 py-3 text-[16px] leading-[1.45] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] sm:text-[15px]"

/** A label over its field, with room between them (never glued to the box). */
function Field({ label, children, note }: { label: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className={fieldLabel}>{label}</span>
      {children}
      {note}
    </label>
  )
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(fieldInput, props.className)} />
}

/**
 * THE ADDRESS OF A SERVICE WITH HANDLES (Instagram, TikTok, X, Threads):
 * "@ana", "ana", "instagram.com/ana" or a post's whole address all go in.
 * A handle is saved as its profile's address and shown back as @ana once
 * the field is left; a link stays as it was pasted. What is typed is kept
 * while typing, so the field never rewrites a word under the cursor.
 */
function HandleAddressInput({ providerId, value, placeholder, invalid, onChange }: { providerId: string; value: string; placeholder: string; invalid: boolean; onChange: (url: string) => void }) {
  const [text, setText] = React.useState(() => appAddressShown(providerId, value))
  const [focused, setFocused] = React.useState(false)
  /* A change from elsewhere (Undo, another tab) shows when the field is not being typed in. */
  React.useEffect(() => {
    if (!focused) setText(appAddressShown(providerId, value))
  }, [providerId, value, focused])
  return (
    <TextInput
      value={text}
      inputMode="url"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      data-app-handle-input=""
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        setText(appAddressShown(providerId, appAddressFromInput(providerId, text).url))
      }}
      onChange={(e) => {
        setText(e.target.value)
        onChange(appAddressFromInput(providerId, e.target.value).url)
      }}
    />
  )
}

/** The page's theme in the editor, for the layout pictures; none outside the editor. */
function useEditorTheme(): Partial<OnePageTheme> | null {
  try {
    return useOnePage().onepage?.theme ?? null
  } catch {
    return null
  }
}

const newId = () => `i_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/* ─── The layouts, drawn small ────────────────────────────────────────── */

const LAYOUT_LABEL: Record<AppLayout, () => string> = {
  classic: () => tt("Classic"),
  card: () => tt("Card"),
  featured: () => tt("Featured"),
  profile: () => tt("Profile"),
  single: () => tt("Single"),
  grid: () => tt("Grid"),
  carousel: () => tt("Carousel"),
}

/** One layout as the page would draw it, in the page's colours, with the service's mark. */
export function AppLayoutThumb({ id, provider, theme }: { id: AppLayout; provider: AppProvider; theme?: Partial<OnePageTheme> | null }) {
  const btn = theme?.button_color || "#1a1a2e"
  const ink = theme?.button_text_color || "#ffffff"
  const page = theme?.background_color || "#f4f4f6"
  const r = Math.max(3, Math.min(Number(theme?.button_border_radius ?? 10) * 0.45, 10))
  const line = (w: string, c = ink, o = 0.85, h = 3) => <span className="block shrink-0 rounded-full" style={{ width: w, height: h, background: c, opacity: o }} />
  const card: React.CSSProperties = { background: btn, borderRadius: r, color: ink }
  const tile = (size: number) => <AppTileMark provider={provider} size={size} />
  const pill = <span className="block h-[9px] w-[26%] shrink-0 rounded-full" style={{ background: ink }} />
  let body: React.ReactNode
  switch (id) {
    case "classic":
      body = (
        <span className="flex w-full flex-col gap-1.5">
          {[0, 1].map((i) => (
            <span key={i} className="relative flex h-[22px] w-full items-center justify-center" style={{ ...card, opacity: i ? 0.45 : 1 }}>
              <span className="absolute left-1">{tile(15)}</span>
              {line("46%")}
            </span>
          ))}
        </span>
      )
      break
    case "card":
      body = (
        <span className="flex w-full items-center gap-1.5 p-1.5" style={card}>
          {tile(20)}
          <span className="flex flex-1 flex-col gap-[3px]">{line("70%")}{line("45%", ink, 0.5)}</span>
          {pill}
        </span>
      )
      break
    case "profile":
      body = (
        <span className="flex w-[78%] flex-col items-center gap-1 py-2" style={card}>
          {tile(22)}
          {line("50%")}
          {line("32%", ink, 0.5)}
          <span className="mt-0.5 block h-[8px] w-[70%] rounded-full" style={{ background: ink }} />
        </span>
      )
      break
    case "featured":
      body = (
        <span className="relative block aspect-[16/10] w-full overflow-hidden" style={{ ...card, background: provider.color === "instagram" ? INSTAGRAM_FILL : provider.color }}>
          <span className="absolute inset-0 grid place-items-center">{tile(22)}</span>
          <span className="absolute inset-x-0 bottom-0 flex flex-col gap-[3px] bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.5))] p-1.5 pt-3">{line("60%", "#ffffff")}</span>
        </span>
      )
      break
    case "single":
      body = (
        <span className="flex w-[64%] flex-col overflow-hidden" style={{ borderRadius: r, background: "#ffffff", boxShadow: "0 0 0 1px rgba(0,0,0,0.08)" }}>
          <span className="flex items-center gap-1 p-1">{tile(10)}{line("40%", "#1a1a2e", 0.6, 2)}</span>
          <span className="block aspect-square w-full" style={{ background: `color-mix(in srgb, ${btn} 25%, #e5e7eb)` }} />
          <span className="flex flex-col gap-[3px] p-1">{line("70%", "#1a1a2e", 0.5, 2)}</span>
        </span>
      )
      break
    case "grid":
      body = (
        <span className="grid w-[80%] grid-cols-2 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="flex flex-col overflow-hidden" style={card}>
              <span className="block aspect-[4/3] w-full" style={{ background: `color-mix(in srgb, ${ink} 28%, ${btn})` }} />
              <span className="p-[3px]">{line("70%", ink, 0.8, 2)}</span>
            </span>
          ))}
        </span>
      )
      break
    case "carousel":
      body = (
        <span className="flex w-full gap-1 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex w-[42%] shrink-0 flex-col overflow-hidden" style={card}>
              <span className="block aspect-square w-full" style={{ background: `color-mix(in srgb, ${ink} 28%, ${btn})` }} />
              <span className="p-[3px]">{line("70%", ink, 0.8, 2)}</span>
            </span>
          ))}
        </span>
      )
      break
  }
  return (
    <span aria-hidden data-app-layout-thumb={id} className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl px-[10%]" style={{ background: page }}>
      {body}
    </span>
  )
}

function LayoutPicker({ data, provider, update }: { data: AppBlockData; provider: AppProvider; update: Update }) {
  const theme = useEditorTheme()
  const current = appLayoutOf(data)
  if (provider.layouts.length < 2) return null
  return (
    <div className="space-y-2.5" data-app-layouts="">
      <p className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Layout")}</p>
      <div role="radiogroup" aria-label={tt("Layout")} className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {provider.layouts.map((id) => {
          const on = current === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              data-app-layout-choice={id}
              onClick={() => update({ layout: id } as Partial<AppBlockData>)}
              className="relative flex cursor-pointer flex-col items-stretch rounded-2xl border border-[#e3e4e8] bg-white p-1.5 outline-none transition-[border-color] duration-150 hover:border-[#c9cbd1] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
            >
              <ChoiceMark on={on} />
              <span className="block aspect-[4/3] overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]">
                <AppLayoutThumb id={id} provider={provider} theme={theme} />
              </span>
              <span className={cn("block py-1.5 text-center text-[12.5px] font-medium", on ? "text-[#1a1a2e]" : "text-[#4b5563]")}>{dataLayoutLabel(provider.id, id) ?? LAYOUT_LABEL[id]()}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ─── A Storelib tips block's styles (round 3, lib/onepage/tips TIP_STYLES) ─── */

const TIP_STYLE_LABEL: Record<TipStyle, () => string> = {
  card: () => tt("Card"),
  pills: () => tt("Pills"),
  button: () => tt("Button"),
  amount: () => tt("Big amount"),
}

/** One tip style drawn small, in the page's colours. */
export function TipStyleThumb({ id, theme }: { id: TipStyle; theme?: Partial<OnePageTheme> | null }) {
  const btn = theme?.button_color || "#1a1a2e"
  const ink = theme?.button_text_color || "#ffffff"
  const page = theme?.background_color || "#f4f4f6"
  const words = theme?.text_color || "#1a1a2e"
  const r = Math.max(3, Math.min(Number(theme?.button_border_radius ?? 10) * 0.45, 10))
  const line = (w: string, c: string, o = 0.85, h = 3) => <span className="block shrink-0 rounded-full" style={{ width: w, height: h, background: c, opacity: o }} />
  let body: React.ReactNode
  switch (id) {
    case "card":
      body = (
        <span className="flex w-full flex-col gap-1.5 p-1.5" style={{ background: btn, borderRadius: r }}>
          <span className="flex items-center gap-1">
            <span className="block h-[10px] w-[10px] rounded-full" style={{ background: ink, opacity: 0.25 }} />
            {line("44%", ink)}
          </span>
          <span className="grid grid-cols-4 gap-[3px]">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="block h-[9px] rounded-[3px]" style={{ background: ink, opacity: i === 1 ? 0.9 : 0.18 }} />
            ))}
          </span>
          <span className="block h-[9px] w-full rounded-[3px]" style={{ background: ink, opacity: 0.9 }} />
        </span>
      )
      break
    case "pills":
      body = (
        <span className="flex w-full flex-col items-center gap-1.5">
          {line("40%", words)}
          <span className="flex w-full justify-center gap-[4px]">
            {[0, 1, 2].map((i) => (
              <span key={i} className="block h-[13px] w-[22%] rounded-full" style={{ background: btn }} />
            ))}
            <span className="block h-[13px] w-[22%] rounded-full" style={{ boxShadow: `inset 0 0 0 1px ${words}55` }} />
          </span>
        </span>
      )
      break
    case "button":
      body = (
        <span className="flex h-[22px] w-full items-center justify-center gap-1" style={{ background: btn, borderRadius: r }}>
          <span className="block h-[8px] w-[8px] rounded-full" style={{ background: ink, opacity: 0.7 }} />
          {line("40%", ink)}
        </span>
      )
      break
    case "amount":
      body = (
        <span className="flex w-full flex-col items-center gap-1 p-1.5" style={{ background: btn, borderRadius: r }}>
          {line("34%", ink, 0.6, 2)}
          <span className="flex w-full items-center justify-between">
            <span className="block h-[9px] w-[9px] rounded-full" style={{ background: ink, opacity: 0.2 }} />
            <span className="block h-[11px] w-[30%] rounded-[2px]" style={{ background: ink }} />
            <span className="block h-[9px] w-[9px] rounded-full" style={{ background: ink, opacity: 0.2 }} />
          </span>
          <span className="block h-[8px] w-full rounded-[3px]" style={{ background: ink, opacity: 0.9 }} />
        </span>
      )
      break
  }
  return (
    <span aria-hidden data-tip-style-thumb={id} className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl px-[10%]" style={{ background: page }}>
      {body}
    </span>
  )
}

function TipStylePicker({ data, update }: { data: AppBlockData; update: Update }) {
  const theme = useEditorTheme()
  const current = tipStyleOf(data)
  return (
    <div className="space-y-2.5" data-tip-styles="">
      <p className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Layout")}</p>
      <div role="radiogroup" aria-label={tt("Layout")} className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {TIP_STYLES.map((id) => {
          const on = current === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              data-tip-style-choice={id}
              onClick={() => update({ tip_style: id } as Partial<AppBlockData>)}
              className="relative flex cursor-pointer flex-col items-stretch rounded-2xl border border-[#e3e4e8] bg-white p-1.5 outline-none transition-[border-color] duration-150 hover:border-[#c9cbd1] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
            >
              <ChoiceMark on={on} />
              <span className="block aspect-[4/3] overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]">
                <TipStyleThumb id={id} theme={theme} />
              </span>
              <span className={cn("block py-1.5 text-center text-[12.5px] font-medium", on ? "text-[#1a1a2e]" : "text-[#4b5563]")}>{TIP_STYLE_LABEL[id]()}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Lists ───────────────────────────────────────────────────────────── */

function ItemsEditor({ data, provider, update, blockId }: { data: AppBlockData; provider: AppProvider; update: Update; blockId: string }) {
  const items = Array.isArray(data.items) ? data.items : []
  const set = (next: AppItem[]) => update({ items: next } as Partial<AppBlockData>)
  const patch = (id: string, p: Partial<AppItem>) => set(items.map((i) => (i.id === id ? { ...i, ...p } : i)))
  const shape = provider.shape
  const noun = shape === "events" ? tt("Event") : shape === "stats" ? tt("Stat") : provider.id === "books" ? tt("Book") : tt("Product")
  const addWord = shape === "events" ? tt("Add an event") : shape === "stats" ? tt("Add a stat") : provider.id === "books" ? tt("Add a book") : tt("Add a product")
  return (
    <div className="space-y-3" data-app-items="">
      {items.map((item, n) => (
        <div key={item.id} className="space-y-3 rounded-2xl border border-[#e3e4e8] bg-white p-3.5" data-app-item-editor={item.id}>
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#1a1a2e]">
              {noun} {n + 1}
            </span>
            <button type="button" aria-label={tt("Remove")} onClick={() => set(items.filter((i) => i.id !== item.id))} className="grid h-9 w-9 place-items-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#f4f4f6] hover:text-[#b42318]">
              <Trash2 aria-hidden className="h-4 w-4" />
            </button>
          </div>
          {shape === "stats" ? (
            <div className="space-y-2.5">
              {/* Round AR: a number typed, or one Storelib counts for you (lib/onepage/stat-count), filled in on the live page. */}
              <div role="radiogroup" aria-label={tt("Number")} className="flex flex-wrap gap-1.5" data-stat-source="">
                {STAT_SOURCES.map((src) => {
                  const on = statSourceOf(item) === src
                  return (
                    <button key={src} type="button" role="radio" aria-checked={on} onClick={() => patch(item.id, { source: src, ...(src === "typed" ? {} : { value: item.value?.trim() ? item.value : "0" }) })} className={cn("h-9 rounded-full px-3 text-[13px] font-medium transition-[background-color,color] duration-150", on ? "bg-[#1a1a2e] text-white" : "bg-[#f4f4f6] text-[#4b5563] hover:text-[#1a1a2e]")}>
                      {STAT_SOURCE_LABEL[src]()}
                    </button>
                  )
                })}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {statSourceOf(item) === "typed" ? (
                  <Field label={tt("Number")}>
                    <TextInput value={item.value ?? ""} maxLength={12} placeholder="12k" onChange={(e) => patch(item.id, { value: e.target.value })} />
                  </Field>
                ) : (
                  <div className="space-y-2">
                    <span className={fieldLabel}>{tt("Number")}</span>
                    <p className="flex h-12 items-center rounded-xl bg-[#f4f4f6] px-4 text-[13px] text-[#6b7280]">{tt("Counted live")}</p>
                  </div>
                )}
                <Field label={tt("Label")}>
                  <TextInput value={item.title ?? ""} maxLength={40} placeholder={tt("Students")} onChange={(e) => patch(item.id, { title: e.target.value })} />
                </Field>
              </div>
            </div>
          ) : (
            <>
              <Field label={shape === "events" ? tt("Event name") : tt("Name")}>
                <TextInput value={item.title ?? ""} maxLength={80} onChange={(e) => patch(item.id, { title: e.target.value })} />
              </Field>
              {shape === "events" ? (
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label={tt("Date")}>
                    <TextInput type="date" value={item.date ?? ""} onChange={(e) => patch(item.id, { date: e.target.value })} />
                  </Field>
                  <Field label={tt("Time (optional)")}>
                    <TextInput type="time" value={item.time ?? ""} onChange={(e) => patch(item.id, { time: e.target.value })} />
                  </Field>
                  <div className="col-span-2">
                    <Field label={tt("Venue")}>
                      <TextInput value={item.venue ?? ""} maxLength={80} placeholder={tt("City or venue")} onChange={(e) => patch(item.id, { venue: e.target.value })} />
                    </Field>
                  </div>
                </div>
              ) : (
                <Field label={provider.id === "books" ? tt("Author or price (optional)") : tt("Price or note (optional)")}>
                  <TextInput value={item.note ?? ""} maxLength={60} onChange={(e) => patch(item.id, { note: e.target.value })} />
                </Field>
              )}
              <Field label={shape === "events" ? tt("Ticket link") : tt("Link")}>
                <TextInput value={item.url ?? ""} inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="https://" onChange={(e) => patch(item.id, { url: e.target.value.trim() })} />
              </Field>
              {shape === "events" ? (
                <div className="flex min-h-11 items-center justify-between gap-3">
                  <span className="text-[14px] font-medium text-[#1a1a2e]">{tt("Sold out")}</span>
                  <Switch label={tt("Sold out")} checked={!!item.sold_out} onChange={(sold_out) => patch(item.id, { sold_out })} />
                </div>
              ) : (
                <div className="space-y-2">
                  <span className={fieldLabel}>{tt("Picture")}</span>
                  <OnePageImageField value={item.image_url} prefix={`app_${blockId}_${item.id}`} onChange={(url) => patch(item.id, { image_url: url })} />
                </div>
              )}
            </>
          )}
        </div>
      ))}
      {items.length < APP_ITEMS_MAX ? (
        <button type="button" onClick={() => set([...items, { id: newId() }])} data-app-item-add="" className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#d5d7dd] text-[13.5px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8]">
          <Plus aria-hidden className="h-4 w-4" />
          {addWord}
        </button>
      ) : null}
    </div>
  )
}

const STAT_SOURCE_LABEL: Record<StatSource, () => string> = {
  typed: () => tt("Typed"),
  subscribers: () => tt("Subscribers"),
  sales: () => tt("Sales"),
  reviews: () => tt("Reviews"),
  rating: () => tt("Rating"),
}

/* ─── The two halves ──────────────────────────────────────────────────── */

export function AppBlockEditor({ block, updateData }: { block: OnePageBlock; updateData: Update }) {
  const part = useBlockPart()
  const data = (block.data ?? {}) as AppBlockData
  const provider = providerOf(data)
  const update = updateData
  const showSettings = part !== "layout"
  const showLayout = part !== "settings"
  const layout = appLayoutOf(data)
  const usesPicture = ["card", "profile", "featured"].includes(layout) && ["social", "link", "reviews", "app", "contact"].includes(provider.shape)

  return (
    <div className="space-y-5" data-app-editor={provider.id}>
      {showSettings ? <SettingsHalf block={block} data={data} provider={provider} update={update} /> : null}
      {showLayout ? (
        <>
          {isRetiredAppProvider(data.provider) ? (
            <p className="text-[12.5px] text-[#6b7280]" data-app-retired="">{tt("Shown as a plain link on your page.")}</p>
          ) : provider.id === "tips" && tipModeOf(data) === "storelib" ? (
            /* Round 3: Classic, Card and Featured are a tip link's layouts and drew nothing different here; a Storelib tips block has its own. */
            <TipStylePicker data={data} update={update} />
          ) : (
            <LayoutPicker data={data} provider={provider} update={update} />
          )}
          {provider.shape === "items" ? <PictureFitControl value={data.image_fit} onChange={(image_fit) => update({ image_fit } as Partial<AppBlockData>)} /> : null}
          {/* Round AR3: Single and Carousel play the posts given in Settings; without one they draw the profile as a large card. */}
          {provider.shape === "social" && (layout === "single" || layout === "carousel") && appEmbeds(data).length < (layout === "carousel" ? 2 : 1) ? (
            <p className="text-[12.5px] text-[#6b7280]" data-app-needs-posts="">{layout === "carousel" ? tt("Add two or more posts in Settings to slide through them.") : tt("Add a post in Settings to show it here.")}</p>
          ) : null}
          {usesPicture ? (
            <div className="space-y-2" data-app-picture="">
              <span className={fieldLabel}>{provider.shape === "app" ? tt("App icon") : tt("Picture (optional)")}</span>
              <OnePageImageField value={data.image_url} prefix={`app_${block.id}`} onChange={(url) => update({ image_url: url } as Partial<AppBlockData>)} />
              {provider.id === "instagram" ? <InstagramPhoto data={data} update={update} /> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

/**
 * ROUND 3: THE PROFILE'S OWN PICTURE FROM INSTAGRAM, copied into Storelib
 * (app/api/onepage/instagram-profile; what Instagram allows is set out in
 * lib/onepage/instagram-profile). When Instagram does not give it, the line
 * says so and the upload above stays the way in. With Meta's token the latest
 * posts come too, offered as one tap into Posts.
 */
function InstagramPhoto({ data, update }: { data: AppBlockData; update: Update }) {
  const [state, setState] = React.useState<{ busy: boolean; error: string | null; posts: string[] }>({ busy: false, error: null, posts: [] })
  const username = instagramUsername(data.url)
  if (!username) return null
  const fetchPhoto = async () => {
    setState({ busy: true, error: null, posts: [] })
    try {
      const r = await fetch("/api/onepage/instagram-profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: data.url }) })
      const body = (await r.json().catch(() => ({}))) as { avatar_url?: string; posts?: string[]; error?: string }
      const posts = (body.posts || []).filter((p) => !(data.posts || []).includes(p))
      if (r.ok && body.avatar_url) {
        update({ image_url: body.avatar_url } as Partial<AppBlockData>)
        setState({ busy: false, error: null, posts })
      } else setState({ busy: false, error: tt("Instagram didn't share this profile's picture. Upload one instead."), posts })
    } catch {
      setState({ busy: false, error: tt("Instagram didn't answer. Try again or upload a picture."), posts: [] })
    }
  }
  return (
    <div className="space-y-2" data-instagram-photo="">
      <button
        type="button"
        onClick={fetchPhoto}
        disabled={state.busy}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#e3e4e8] bg-white text-[13.5px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8] disabled:opacity-60"
      >
        {state.busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <SocialIcon platform="instagram" tone="brand" size={16} />}
        {state.busy ? tt("Getting your photo") : tt("Use my Instagram photo")}
      </button>
      {state.error ? <p className="text-[12.5px] text-[#6b7280]" aria-live="polite">{state.error}</p> : null}
      {state.posts.length ? (
        <button type="button" onClick={() => { update({ posts: [...(data.posts || []).filter((p) => p.trim()), ...state.posts] } as Partial<AppBlockData>); setState((s) => ({ ...s, posts: [] })) }} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#d5d7dd] text-[13.5px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8]">
          <Plus className="h-4 w-4" />
          {tt("Add your latest posts ({value})", { value: state.posts.length })}
        </button>
      ) : null}
    </div>
  )
}

function SettingsHalf({ block, data, provider, update }: { block: OnePageBlock; data: AppBlockData; provider: AppProvider; update: Update }) {
  const set = (p: Partial<AppBlockData>) => update(p as Partial<OnePageBlockData>)
  const name = appProviderName(provider.id)
  const target = appTarget(data)
  const bad = appUrlProblem(data)
  const shape = provider.shape
  /* Round AR: tips through Storelib checkout have no address; the event, paid access and reviews blocks keep their own fields (./data-block-editor). */
  const storelibTips = provider.id === "tips" && tipModeOf(data) === "storelib"
  const takesUrl = (["social", "player", "link", "items", "reviews"].includes(shape) || provider.id === "tips") && !storelibTips
  const takesWords = ["social", "player", "link", "items", "reviews", "events", "stats"].includes(shape)
  const takesButton = ["social", "player", "link", "items", "reviews", "events", "contact", "email", "event", "paid"].includes(shape) && !storelibTips
  const takesMode = ["social", "player", "link", "items", "reviews", "contact"].includes(shape) && !storelibTips
  const posts = Array.isArray(data.posts) ? data.posts : []

  return (
    <div className="space-y-5" data-app-settings="">
      <DataBlockSettings block={block} data={data} set={set} />
      {takesUrl ? (
        <Field
          label={shape === "items" ? tt("Shop address (optional)") : appTakesHandle(provider.id) ? tt("{name} username or link", { name }) : tt("{name} address", { name })}
          note={
            bad ? (
              <p className={problem} data-app-url-problem="">{appTakesHandle(provider.id) ? tt("This is not a {name} username or link.", { name }) : tt("This is not a {name} address.", { name })}</p>
            ) : target?.embed ? (
              <p className={hint} data-app-url-found="embed">{tt("It plays right on your page.")}</p>
            ) : target?.handle && !appTakesHandle(provider.id) ? (
              <p className={hint} data-app-url-found="handle">{target.handle}</p>
            ) : null
          }
        >
          {appTakesHandle(provider.id) ? (
            <HandleAddressInput providerId={provider.id} value={data.url ?? ""} placeholder={tt("@yourname or a link")} invalid={bad} onChange={(url) => set({ url })} />
          ) : (
            <TextInput value={data.url ?? ""} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder={provider.placeholder} aria-invalid={bad || undefined} onChange={(e) => set({ url: e.target.value.trim() })} />
          )}
        </Field>
      ) : null}

      {shape === "social" ? (
        <div className="space-y-2" data-app-posts="">
          <span className={fieldLabel}>{tt("Posts to show (optional)")}</span>
          {posts.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <TextInput value={p} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder={tt("Paste a post address")} onChange={(e) => set({ posts: posts.map((x, j) => (j === i ? e.target.value.trim() : x)) })} />
              <button type="button" aria-label={tt("Remove")} onClick={() => set({ posts: posts.filter((_, j) => j !== i) })} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[#6b7280] transition-colors hover:bg-[#f4f4f6] hover:text-[#b42318]">
                <Trash2 aria-hidden className="h-4 w-4" />
              </button>
            </div>
          ))}
          {posts.length < APP_POSTS_MAX ? (
            <button type="button" onClick={() => set({ posts: [...posts, ""] })} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#d5d7dd] text-[13.5px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8]">
              <Plus aria-hidden className="h-4 w-4" />
              {tt("Add a post")}
            </button>
          ) : null}
        </div>
      ) : null}

      {shape === "reviews" ? (
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={tt("Rating")}>
            <TextInput type="number" inputMode="decimal" min={1} max={5} step={0.1} value={data.rating ?? ""} placeholder="4.8" onChange={(e) => set({ rating: e.target.value === "" ? null : Number(e.target.value) })} />
          </Field>
          <Field label={tt("Reviews")}>
            <TextInput type="number" inputMode="numeric" min={0} value={data.reviews_count ?? ""} placeholder="120" onChange={(e) => set({ reviews_count: e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value))) })} />
          </Field>
        </div>
      ) : null}

      {shape === "items" || shape === "events" || shape === "stats" ? <ItemsEditor data={data} provider={provider} update={update} blockId={block.id} /> : null}

      {shape === "poll" ? <PollEditor data={data} set={set} /> : null}

      {shape === "contact" ? (
        <div className="space-y-4" data-app-contact="">
          {([
            ["name", tt("Name"), "text"],
            ["org", tt("Company or role (optional)"), "text"],
            ["phone", tt("Phone"), "tel"],
            ["email", tt("Email"), "email"],
            ["website", tt("Website"), "url"],
            ["address", tt("Address"), "text"],
          ] as const).map(([key, label, type]) =>
            key === "phone" ? (
              /* The country with its flag and code, the number as it is written there (components/forms/phone-number-field); kept as the page shows it. */
              <PhoneNumberField
                key={key}
                label={label}
                phone={data.contact?.phone ?? ""}
                country={data.contact?.phone_country}
                onChange={(next) => set({ contact: { ...data.contact, phone: fullNumber(digitsFromKept(next.phone, next.country), next.country), phone_country: next.country } })}
              />
            ) : (
            <Field key={key} label={label}>
              <TextInput type={type} value={data.contact?.[key] ?? ""} maxLength={key === "address" ? 240 : 120} onChange={(e) => set({ contact: { ...data.contact, [key]: e.target.value } })} />
            </Field>
            ),
          )}
        </div>
      ) : null}

      {shape === "app" ? (
        <div className="space-y-4" data-app-stores="">
          <Field label={tt("App name")}>
            <TextInput value={data.title ?? ""} maxLength={60} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label={tt("Line under it (optional)")}>
            <TextInput value={data.subtitle ?? ""} maxLength={90} onChange={(e) => set({ subtitle: e.target.value })} />
          </Field>
          <Field label={tt("App Store address")} note={data.ios_url?.trim() && !appStores(data).ios ? <p className={problem}>{tt("Paste the app's page on apps.apple.com.")}</p> : null}>
            <TextInput value={data.ios_url ?? ""} inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="https://apps.apple.com/app/..." onChange={(e) => set({ ios_url: e.target.value.trim() })} />
          </Field>
          <Field label={tt("Google Play address")} note={data.android_url?.trim() && !appStores(data).android ? <p className={problem}>{tt("Paste the app's page on play.google.com.")}</p> : null}>
            <TextInput value={data.android_url ?? ""} inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="https://play.google.com/store/apps/details?id=..." onChange={(e) => set({ android_url: e.target.value.trim() })} />
          </Field>
        </div>
      ) : null}

      {shape === "email" ? (
        <Field label={tt("Email address")} note={data.email?.trim() && !appEmail(data.email) ? <p className={problem}>{tt("This is not an email address.")}</p> : null}>
          <TextInput type="email" inputMode="email" autoCapitalize="off" value={data.email ?? ""} placeholder="you@example.com" onChange={(e) => set({ email: e.target.value.trim() })} />
        </Field>
      ) : null}

      {shape === "note" ? (
        <div className="space-y-4" data-app-note="">
          <Field label={tt("Title")}>
            <TextInput value={data.title ?? ""} maxLength={80} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label={tt("Text")}>
            <textarea className={area} value={data.text ?? ""} maxLength={1200} onChange={(e) => set({ text: e.target.value })} />
          </Field>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label={tt("Button text (optional)")}>
              <TextInput value={data.button_text ?? ""} maxLength={40} onChange={(e) => set({ button_text: e.target.value })} />
            </Field>
            <Field label={tt("Button link")}>
              <TextInput value={data.url ?? ""} inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="https://" onChange={(e) => set({ url: e.target.value.trim() })} />
            </Field>
          </div>
        </div>
      ) : null}

      {takesWords || takesButton ? (
        <div className="space-y-4">
          {takesWords ? (
            <Field label={tt("Title (optional)")}>
              <TextInput value={data.title ?? ""} maxLength={80} placeholder={target?.handle || name} onChange={(e) => set({ title: e.target.value })} />
            </Field>
          ) : null}
          {takesWords && shape !== "events" && shape !== "stats" && shape !== "items" ? (
            <Field label={tt("Line under it (optional)")}>
              <TextInput value={data.subtitle ?? ""} maxLength={90} onChange={(e) => set({ subtitle: e.target.value })} />
            </Field>
          ) : null}
          {takesButton ? (
            <Field label={tt("Button text (optional)")}>
              <TextInput value={data.button_text ?? ""} maxLength={40} placeholder={appDefaultButton(provider)} onChange={(e) => set({ button_text: e.target.value })} />
            </Field>
          ) : null}
        </div>
      ) : null}

      {takesMode ? (
        <SettingsGroup title={tt("When someone taps it")}>
          <ModeChoice
            label={tt("When someone taps it")}
            value={appOpenModeOf(data)}
            onPick={(open_mode) => set({ open_mode })}
            options={[
              { id: "sheet", label: tt("Open on your page"), hint: shape === "contact" ? tt("Shows the details in a sheet") : tt("Shows it in a sheet over your page") },
              { id: "direct", label: shape === "contact" ? tt("Save the contact") : tt("Go to {name}", { name }), hint: shape === "contact" ? tt("Downloads the contact card") : tt("Opens the address"), icon: <ArrowUpRight aria-hidden className="h-4 w-4" /> },
            ]}
          />
        </SettingsGroup>
      ) : null}
    </div>
  )
}

function PollEditor({ data, set }: { data: AppBlockData; set: (p: Partial<AppBlockData>) => void }) {
  const options = Array.isArray(data.poll_options) ? data.poll_options : []
  return (
    <div className="space-y-4" data-app-poll="">
      <Field label={tt("Question")}>
        <TextInput value={data.poll_question ?? ""} maxLength={120} placeholder={tt("What should I make next?")} onChange={(e) => set({ poll_question: e.target.value })} />
      </Field>
      <div className="space-y-2">
        <span className={fieldLabel}>{tt("Answers")}</span>
        {options.map((o, i) => (
          <div key={o.id} className="flex items-center gap-2">
            <TextInput value={o.label} maxLength={60} placeholder={tt("Answer {n}", { n: i + 1 })} onChange={(e) => set({ poll_options: options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)) })} />
            {options.length > 2 ? (
              <button type="button" aria-label={tt("Remove")} onClick={() => set({ poll_options: options.filter((x) => x.id !== o.id) })} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[#6b7280] transition-colors hover:bg-[#f4f4f6] hover:text-[#b42318]">
                <Trash2 aria-hidden className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ))}
        {options.length < 6 ? (
          <button type="button" onClick={() => set({ poll_options: [...options, { id: newId(), label: "" }] })} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#d5d7dd] text-[13.5px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8]">
            <Plus aria-hidden className="h-4 w-4" />
            {tt("Add an answer")}
          </button>
        ) : null}
        <p className={hint}>{tt("Votes are kept on Storelib, one per person.")}</p>
      </div>
    </div>
  )
}
