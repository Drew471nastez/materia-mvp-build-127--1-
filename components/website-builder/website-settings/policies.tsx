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
import { COOKIE_ACCEPT_TEXT, COOKIE_DECLINE_TEXT, SITE_COOKIE_TEXT } from "@/lib/consent/copy"
import { cn } from "@/lib/utils"
import { Card, GOES_LIVE, Lead, PageTitle, Row, Toggle, buttonClass, inputClass, textAreaClass, textLinkClass } from "./parts"
import type { SettingsContext } from "./types"

/** A stored colour the colour input can show, or its default. */
const colourOr = (v: unknown, fallback: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback)

/** How long typing rests before the policy is saved. */
const SAVE_AFTER_MS = 700

export function PolicySettings({ ctx }: { ctx: SettingsContext }) {
  /* Shown unless switched off; a site saved before the switch existed shows it. */
  const showBanner = ctx.settings.cookie_banner_show !== false
  const ownColours = ctx.settings.cookie_banner_enabled === true

  return (
    <>
      <PageTitle>Policies</PageTitle>
      <Lead>
        Each policy is a page of your site, linked from its footer. They start as templates: replace anything in square
        brackets with your own terms before you publish.
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
        THE BANNER, ON OR OFF, IN THE SITE'S OWN WORDS. The switch here used
        to be "use my own words", labelled as if it showed the banner, so
        turning it off changed the wording and the banner stayed. It shows
        and hides the banner now. The words are there to edit from the start,
        with the site's default sentence already in them, and the colours are
        a choice of their own. The same settings are in the builder's theme
        settings, under Cookie & privacy.
      */}
      <Card title="Cookie banner" footer={GOES_LIVE}>
        <Row label="Show the cookie banner" hint="Off: no banner, and nothing optional is stored for your visitors." inline>
          <Toggle checked={showBanner} onChange={(on) => ctx.onSettingChange("cookie_banner_show", on)} label="Show the cookie banner" />
        </Row>
        <Reveal open={showBanner} className="border-t border-white/[0.07]" innerClassName="divide-y divide-white/[0.07]">
          <Row label="Message" stack htmlFor="wb-cookie-text">
            <textarea
              id="wb-cookie-text"
              rows={3}
              value={typeof ctx.settings.cookie_banner_text === "string" ? ctx.settings.cookie_banner_text : SITE_COOKIE_TEXT}
              onChange={(e) => ctx.onSettingChange("cookie_banner_text", e.target.value)}
              className={textAreaClass}
            />
          </Row>
          <Row label="Accept button" htmlFor="wb-cookie-accept">
            <input
              id="wb-cookie-accept"
              value={typeof ctx.settings.cookie_accept_text === "string" ? ctx.settings.cookie_accept_text : COOKIE_ACCEPT_TEXT}
              onChange={(e) => ctx.onSettingChange("cookie_accept_text", e.target.value)}
              className={inputClass}
            />
          </Row>
          <Row label="Reject button" htmlFor="wb-cookie-decline">
            <input
              id="wb-cookie-decline"
              value={typeof ctx.settings.cookie_decline_text === "string" ? ctx.settings.cookie_decline_text : COOKIE_DECLINE_TEXT}
              onChange={(e) => ctx.onSettingChange("cookie_decline_text", e.target.value)}
              className={inputClass}
            />
          </Row>
          <Row label="Use my own colours" hint="Off: the banner is white with dark text." inline>
            <Toggle checked={ownColours} onChange={(on) => ctx.onSettingChange("cookie_banner_enabled", on)} label="Use my own colours" />
          </Row>
          <Reveal open={ownColours} className="border-t border-white/[0.07]">
            <Row label="Colours" hint="Background, then text." inline>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Banner background"
                  value={colourOr(ctx.settings.cookie_bg, "#0f172a")}
                  onChange={(e) => ctx.onSettingChange("cookie_bg", e.target.value)}
                  className="h-11 w-12 cursor-pointer rounded-lg border border-white/12 bg-transparent p-1 md:h-10"
                />
                <input
                  type="color"
                  aria-label="Banner text"
                  value={colourOr(ctx.settings.cookie_text_color, "#ffffff")}
                  onChange={(e) => ctx.onSettingChange("cookie_text_color", e.target.value)}
                  className="h-11 w-12 cursor-pointer rounded-lg border border-white/12 bg-transparent p-1 md:h-10"
                />
              </div>
            </Row>
          </Reveal>
        </Reveal>
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
  const brand = (typeof ctx.settings.brand_name === "string" && ctx.settings.brand_name.trim()) || ctx.name || "this shop"
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
    ? "This page is open in the builder"
    : !exists
      ? "Not on your site yet"
      : [edited, left > 0 ? `${left} ${left === 1 ? "placeholder" : "placeholders"} to fill in` : null].filter(Boolean).join(" · ") || "Saved"

  return (
    /* Clipped without being a scroller, so the field's toolbar can stick to the page while a long policy scrolls. */
    <Card className="overflow-clip">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 md:px-6" data-policy={page.key}>
        <div className="min-w-[180px] flex-1">
          <h2 className="text-[15px] font-semibold text-white md:text-[14.5px]">{page.title}</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-white/45" data-policy-status="">
            {load.state === "loading" && !live ? "Loading…" : load.state === "error" && !live ? load.message : status}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {load.state === "error" && !live ? (
            <button type="button" onClick={read} className={buttonClass}>
              Try again
            </button>
          ) : (
            <>
              {(blank || !exists) && load.state !== "loading" && (
                <button type="button" onClick={useTemplate} className={buttonClass} data-policy-template="">
                  Use template
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
                {open ? "Done" : "Edit"}
              </button>
            </>
          )}
        </div>
      </div>

      <Reveal open={open} id={panelId} className="border-t border-white/[0.07]">
        <div className="dark px-4 pb-4 pt-4 md:px-6" data-policy-editor={page.key}>
          {live && !liveBody ? (
            <p className="text-[14px] text-white/55">This page has no text section to write in. Add one in the builder.</p>
          ) : (
            <RichTextField
              variant="page"
              label={page.title}
              placeholder={`Write your ${page.title.toLowerCase()}`}
              value={body}
              minHeight={240}
              onChange={write}
            />
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13px]">
            <span
              className={cn("min-h-5", typeof save === "object" ? "text-red-300" : "text-white/45")}
              aria-live="polite"
              data-policy-save={typeof save === "object" ? "error" : save}
            >
              {live
                ? "Saved with your draft."
                : typeof save === "object"
                  ? save.error
                  : save === "saving"
                    ? "Saving…"
                    : save === "saved"
                      ? "Saved to your draft. Visitors see it after you publish."
                      : ""}
            </span>
            {exists && (
              <button type="button" onClick={() => ctx.onEditPage(page.key)} className={textLinkClass}>
                Open the page in the builder
              </button>
            )}
          </div>
        </div>
      </Reveal>
    </Card>
  )
}
