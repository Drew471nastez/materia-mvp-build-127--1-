"use client"

import * as React from "react"
import { Reveal } from "@/components/ui/reveal"
import { RichTextField } from "@/components/website-builder/rich-text-field"
import { POLICY_PAGES, SHIPPING_POLICY, policyPageSections, type PolicyPage } from "@/lib/website-builder/policy-pages"
import {
  editedLabel,
  isBlankHtml,
  loadPolicy,
  policyBodyOf,
  policyBodySection,
  savePolicy,
  withPolicyBody,
} from "@/lib/website-builder/policy-editing"
import type { SectionInstance } from "@/lib/website-builder/types"
import { cn } from "@/lib/utils"
import { Card, Lead, PageTitle, Row, buttonClass, textLinkClass, DarkScope } from "./parts"
import type { SettingsContext } from "./types"
import { tt } from "@/lib/i18n/text"

/** How long typing rests before the policy is saved. */
const SAVE_AFTER_MS = 700

export function PolicySettings({ ctx }: { ctx: SettingsContext }) {
  /* Shown unless switched off; a site saved before the switch existed shows it. */
  const showBanner = ctx.settings.cookie_banner_show !== false

  return (
    <>
      <PageTitle>{tt("Policies")}</PageTitle>
      <Lead>
        {tt("Each policy is a page of your site, linked from its footer. They start as templates: replace anything in square brackets with your own terms before you publish.")}
      </Lead>

      {/* ONE CARD A POLICY, WRITTEN HERE. The words are the policy page's
          own rich text section, read and saved by the route the builder
          uses (lib/website-builder/policy-editing.ts), so nothing here is a
          second copy, and the rest of the page is still the builder's. */}
      {POLICY_PAGES.map((page) => (
        <PolicyCard key={page.key} ctx={ctx} page={page} />
      ))}
      <PolicyCard ctx={ctx} page={SHIPPING_POLICY} optional />

      {/*
        THE COOKIE BANNER LIVES IN THEME SETTINGS now, beside the colours and
        fonts, with the page drawn next to it while it is set. Asked for as
        "simpler, as a theme settings thing". Here it is one line that says
        whether it shows and opens it there.
      */}
      <Card title={tt("Cookie banner")}>
        <Row label={showBanner ? tt("Shown to visitors") : tt("Turned off")} hint={tt("Its words and colours are set in Theme settings.")} inline>
          <button type="button" className={buttonClass} onClick={() => ctx.onOpenThemeGroup("cookies")}>
            {tt("Edit banner")}
          </button>
        </Row>
      </Card>
    </>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   One policy
   ───────────────────────────────────────────────────────────────────────── */

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; sections: SectionInstance[]; exists: boolean; updatedAt: string | null }
type Save = "idle" | "saving" | "saved" | { error: string }

/** "[30] days", "[your@email.com]": the parts of a template still to be filled in. */
const placeholdersIn = (html: string) => (html.replace(/<[^>]*>/g, " ").match(/\[[^\]\n]{1,80}\]/g) ?? []).length

function PolicyCard({ ctx, page, optional = false }: { ctx: SettingsContext; page: PolicyPage; optional?: boolean }) {
  const brand = (typeof ctx.settings.brand_name === "string" && ctx.settings.brand_name.trim()) || ctx.name || tt("this shop")
  const fetcher = React.useCallback((input: string, init?: RequestInit) => fetch(input, init), [])
  const [load, setLoad] = React.useState<Load>({ state: "loading" })
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<string | null>(null)
  const [save, setSave] = React.useState<Save>("idle")
  const panelId = `wb-policy-${page.key}`

  /**
   * THE PAGE OPEN IN THE BUILDER IS THE BUILDER'S. It holds those sections
   * and saves them itself, so that page's words are read from it and written
   * with its own section writer: saved with the draft, taken back by Undo.
   */
  const live = ctx.currentPageKey === page.key && ctx.currentSections ? ctx.currentSections : null
  const liveBody = live ? policyBodySection(live) : null

  const read = React.useCallback(() => {
    setLoad({ state: "loading" })
    loadPolicy(fetcher, ctx.installId, page.key)
      .then((r) => setLoad({ state: "ready", ...r }))
      .catch((e: Error) => setLoad({ state: "error", message: e.message }))
  }, [fetcher, ctx.installId, page.key])
  React.useEffect(() => {
    read()
  }, [read])

  const ready = load.state === "ready" ? load : null
  /* A shipping policy is only there once written; the editor's page list knows too. */
  const exists = !!live || (ready?.exists ?? false) || (optional && ctx.pages.some((p) => p.key === page.key))
  const stored = live ? policyBodyOf(live) : ready ? policyBodyOf(ready.sections) : ""
  const body = draft ?? stored
  const blank = isBlankHtml(body)
  const left = blank ? 0 : placeholdersIn(body)

  /* ── saving, for any page but the one open in the builder ── */
  const pending = React.useRef<string | null>(null)
  const timer = React.useRef(0)
  const base = React.useRef<SectionInstance[] | null>(null)
  base.current = ready ? ready.sections : null

  const flush = React.useCallback(async () => {
    window.clearTimeout(timer.current)
    const html = pending.current
    if (html === null) return
    pending.current = null
    const sections = base.current && base.current.length > 0 ? base.current : policyPageSections(page, { brand, header: ctx.header, footer: ctx.footer })
    const next = withPolicyBody(sections, page, html, brand)
    setSave("saving")
    try {
      const { updatedAt } = await savePolicy(fetcher, ctx.installId, page.key, next)
      setLoad({ state: "ready", sections: next, exists: true, updatedAt: updatedAt ?? new Date().toISOString() })
      setSave(pending.current === null ? "saved" : "saving")
      ctx.onPageDraftSaved?.(page.key)
    } catch (e) {
      setSave({ error: (e as Error).message })
    }
  }, [brand, ctx, fetcher, page])

  /* Whatever is still waiting goes when the card goes, or the page is left. */
  const flushRef = React.useRef(flush)
  flushRef.current = flush
  React.useEffect(() => () => void flushRef.current(), [])

  const write = (html: string) => {
    if (live) {
      if (liveBody) ctx.onSectionSetting?.(liveBody.id, "body", html)
      return
    }
    setDraft(html)
    pending.current = html
    setSave("saving")
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), SAVE_AFTER_MS)
  }

  const useTemplate = () => {
    write(page.body(brand))
    if (!live) void flush()
    setOpen(true)
  }

  const edited = editedLabel(ready?.updatedAt ?? null)
  const status = live
    ? tt("This page is open in the builder")
    : !exists
      ? tt("Not on your site yet")
      : [edited, left > 0 ? tt("{left, plural, one {# placeholder} other {# placeholders}} to fill in", { left }) : null].filter(Boolean).join(" · ") || tt("Saved")

  return (
    /* Clipped without being a scroller, so the field's toolbar can stick to the page while a long policy scrolls. */
    <Card className="overflow-clip">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 md:px-6" data-policy={page.key}>
        <div className="min-w-[180px] flex-1">
          <h2 className="text-[15px] font-semibold text-white md:text-[14.5px]">{page.title}</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-white/50" data-policy-status="">
            {load.state === "loading" && !live ? tt("Loading…") : load.state === "error" && !live ? load.message : status}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {load.state === "error" && !live ? (
            <button type="button" onClick={read} className={buttonClass}>
              {tt("Try again")}
            </button>
          ) : (
            <>
              {(blank || !exists) && load.state !== "loading" && (
                <button type="button" onClick={useTemplate} className={buttonClass} data-policy-template="">
                  {tt("Use template")}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (open) void flush()
                  setOpen((o) => !o)
                }}
                aria-expanded={open}
                aria-controls={panelId}
                disabled={load.state === "loading" && !live}
                className={buttonClass}
                data-policy-edit=""
              >
                {open ? tt("Done") : tt("Edit")}
              </button>
            </>
          )}
        </div>
      </div>

      <Reveal open={open} id={panelId} className="border-t border-white/[0.07]">
        <DarkScope className="px-4 pb-4 pt-4 md:px-6" data-policy-editor={page.key}>
          {live && !liveBody ? (
            <p className="text-[14px] text-white/55">{tt("This page has no text section to write in. Add one in the builder.")}</p>
          ) : (
            <RichTextField
              variant="page"
              label={page.title}
              placeholder={tt("Write your {value}", { value: page.title.toLowerCase() })}
              value={body}
              minHeight={240}
              onChange={write}
            />
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13px]">
            <span
              className={cn("min-h-5", typeof save === "object" ? "text-red-300" : "text-white/50")}
              aria-live="polite"
              data-policy-save={typeof save === "object" ? "error" : save}
            >
              {live
                ? tt("Saved with your draft.")
                : typeof save === "object"
                  ? save.error
                  : save === "saving"
                    ? tt("Saving…")
                    : save === "saved"
                      ? tt("Saved to your draft. Visitors see it after you publish.")
                      : ""}
            </span>
            {exists && (
              <button type="button" onClick={() => ctx.onEditPage(page.key)} className={textLinkClass}>
                {tt("Open the page in the builder")}
              </button>
            )}
          </div>
        </DarkScope>
      </Reveal>
    </Card>
  )
}
