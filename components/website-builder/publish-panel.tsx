"use client"

import { relativeTime } from "@/lib/website-builder/relative-time"
import { ownOpen } from "@/lib/analytics/own-site"
import { useCallback, useEffect, useRef, useState } from "react"
import { Check, ChevronDown, ChevronRight, Copy, ExternalLink, Eye, Globe, Loader2, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react"

import { AnchoredPanel } from "@/components/website-builder/anchored-panel"
import { ConnectionMarkIcon } from "@/components/website-builder/connection-marks"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"
import { connectedTools, toolNames, type ConnectionsBrief } from "@/lib/agent-access/connection-mark"
import type { SecurityIssue } from "@/lib/website-builder/security-scan"
import { PAGE_META, type PageKey } from "@/lib/website-builder/types"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { openOpeningTab } from "@/lib/website-builder/opening-tab"
import { liveSiteLink } from "@/lib/website-builder/live-site-link"
import { openInBrowser } from "@/lib/native-bridge"

/**
 * ===========================================================================
 *  PUBLISH, AS A PLACE RATHER THAN A BUTTON
 * ===========================================================================
 *
 * A button that says "Publish" answers one question and asks none. Pressing
 * it is the moment somebody most wants to know: what is the address, who can
 * see it, how long ago did it last go out, and what is about to change. So
 * the button opens a panel that answers those, and the act of publishing is
 * the last thing in it rather than the only thing.
 *
 * ONE PANEL, TWO CONTAINERS. On a desktop it hangs from the button, grown from
 * it. On a phone it is a bottom sheet with the same drag physics as the rest of
 * the editor — the sheet component already owns detents, velocity and the
 * keyboard, and a second implementation of any of that is a second set of bugs.
 * The content in the middle does not know which it is in.
 */

export interface PublishPanelProps {
  open: boolean
  /** Whose drafts a preview link would show. */
  installId: string
  onOpenChange: (open: boolean) => void
  /** Anchor for the desktop popover. */
  anchorRef: React.RefObject<HTMLElement | null>
  mobile: boolean
  live: boolean
  /** The draft is ahead of what visitors see. */
  pending: boolean
  publishedAt: string | null
  websiteUrl: string
  websiteUrlDisplay: string
  busy: boolean
  onPublish: () => void
  /**
   * Whether publishing will take a backup. Null while it is being asked.
   * See lib/website-builder/setup-state.ts: the backup is skipped silently
   * when its table has not been created, and the first anybody knew was the
   * day they wanted one back.
   */
  backupsReady?: boolean | null
  /**
   * What is connected: the editor's own read of it, the one the bar's mark
   * comes from (useSiteActivity), so opening this asks the server nothing
   * more. Shown on a phone only, whose bar has no room for the mark.
   */
  connections?: ConnectionsBrief | null
  /** That read has come back, with an answer or without one. Until then the row keeps its place, empty. */
  connectionsSettled?: boolean
  /** Website Settings, on Connections. */
  onConnections?: () => void
}

/**
 * The time the phone sheet takes to arrive (MobileEditorSheet's snap, 360ms)
 * and a frame over. Anything that would change the card's height waits for
 * it: a row appearing during the slide changed the sheet's height under the
 * slide, and its top edge jumped.
 */
const SHEET_ARRIVES_MS = 400

/**
 * ===========================================================================
 *  WHAT IS CONNECTED, AT THE FOOT OF THE PUBLISH SHEET
 * ===========================================================================
 * "Publish should also have a section showing what is connected." On a phone
 * only: a desktop has the mark on its bar. Each connected tool by its own
 * mark (Claude, Codex, GitHub) and Connected; with nothing connected, the
 * GitHub mark, "Connect your own AI" and GitHub not connected. A tap opens
 * Website Settings on Connections, the same place the bar's mark opens.
 *
 * The row is there from the first frame at its full height, and its content
 * fades in if the editor is still hearing back, so it never moves the card.
 */
function ConnectionsRow({
  brief,
  settled,
  onOpen,
}: {
  brief: ConnectionsBrief | null
  settled: boolean
  onOpen?: () => void
}) {
  const tools = connectedTools(brief)
  const connected = tools.length > 0
  const shown = connected ? tools.slice(0, 3) : [{ kind: "github" as const, name: "GitHub" }]
  return (
    <button
      type="button"
      onClick={onOpen}
      data-publish-connections={!settled ? "waiting" : connected ? "connected" : "none"}
      aria-label={!settled ? tt("Connections") : connected ? tt("{name} connected. Open Connections", { name: toolNames(tools) }) : tt("Connect your own AI. GitHub not connected")}
      className="flex min-h-[60px] w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-left transition-colors duration-150 hover:bg-white/[0.06] active:bg-white/[0.08] [-webkit-tap-highlight-color:transparent]"
    >
      <span className={cn("flex min-w-0 flex-1 items-center gap-3 transition-opacity duration-200", settled ? "opacity-100" : "opacity-0")}>
        <span className="flex shrink-0 items-center">
          {shown.map((t, i) => (
            <span
              key={`${t.kind}:${t.name}`}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#1f1f1f] bg-[#2c2c2c]",
                connected ? "text-white" : "text-white/55",
                i > 0 && "-ml-2",
              )}
            >
              <ConnectionMarkIcon kind={t.kind} className="h-4 w-4" />
            </span>
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-white">{connected ? toolNames(tools) : tt("Connect your own AI")}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-white/55">
            {connected && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />}
            {connected ? tt("Connected") : tt("GitHub not connected")}
          </span>
        </span>
      </span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-white/35" strokeWidth={2} />
    </button>
  )
}

/**
 * ===========================================================================
 *  THE SECURITY LINE, WITH A CHECK BEHIND IT
 * ===========================================================================
 * It said "No security issues found" whatever the site held. It says what the
 * check of the draft says now (GET .../security, lib/website-builder/
 * security-scan.ts). The draft is what Publish is about to put up, so it is
 * read again each time the panel opens. A check that could not run says so,
 * and never reads as a clean result.
 *
 * ONE LINE TALL, WHATEVER IT SAYS. The phone sheet sizes itself to its card
 * as it opens, and a line that grew when the answer came back would move the
 * sheet's top edge mid-slide (SHEET_ARRIVES_MS). What was found opens under
 * the line on a press, the one time a change of height is expected.
 */
type SecurityCheck =
  | { state: "checking" }
  | { state: "clear" }
  | { state: "found"; issues: SecurityIssue[]; truncated: boolean }
  | { state: "unknown" }

/** Where an issue is, in the words the Pages list uses. */
function issuePlace(page: string | null): string {
  if (page === null) return tt("Theme settings")
  const known = (PAGE_META as Partial<Record<string, { label: string }>>)[page as PageKey]
  if (known) return known.label
  const words = page.replace(/[-_]+/g, " ").trim()
  return words ? tt("{value}{value2} page", { value: words.charAt(0).toUpperCase(), value2: words.slice(1) }) : tt("A page")
}

function SecurityLine({
  check,
  open,
  onToggle,
  onRetry,
}: {
  check: SecurityCheck
  open: boolean
  onToggle: () => void
  onRetry: () => void
}) {
  const line = "flex min-h-6 w-full items-center gap-2.5 text-[14px]"
  return (
    <div data-publish-security={check.state}>
      {check.state === "checking" && (
        <p className={cn(line, "text-white/55")}>
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/40" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 truncate">{tt("Checking for security issues")}</span>
        </p>
      )}
      {check.state === "clear" && (
        <p className={cn(line, "text-white/80")}>
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 truncate">{tt("No security issues found")}</span>
        </p>
      )}
      {check.state === "unknown" && (
        <p className={cn(line, "text-white/60")}>
          <ShieldQuestion className="h-4 w-4 shrink-0 text-white/40" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 truncate">{tt("Could not check for security issues")}</span>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-md px-1.5 font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            {tt("Try again")}
          </button>
        </p>
      )}
      {check.state === "found" && (
        <>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className={cn(line, "text-left text-amber-200 transition-colors hover:text-amber-100 [-webkit-tap-highlight-color:transparent]")}
          >
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate">
              {check.issues.length}
              {check.truncated ? "+" : ""} {check.issues.length === 1 && !check.truncated ? "thing" : "things"} {tt("to check")}
            </span>
            <ChevronDown
              aria-hidden
              className={cn("h-4 w-4 shrink-0 text-white/40 transition-transform duration-200", open && "rotate-180")}
              strokeWidth={2}
            />
          </button>
          {open && (
            <ul data-publish-security-issues="" className="mt-3 flex flex-col gap-2">
              {check.issues.map((issue, i) => (
                <li key={i} className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
                  <p className="text-[13px] text-white/50">{issuePlace(issue.page)}</p>
                  <p className="mt-0.5 text-[14px] leading-snug text-white/85">{issue.message}</p>
                </li>
              ))}
              {/* 15px: the card's border and its 14px of padding, so this line starts where the lines above it do. */}
              {check.truncated && <li className="px-[15px] text-[13px] text-white/50">{tt("And more after these.")}</li>}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

/**
 * "4 minutes ago", and nothing cleverer. A relative time is read once, in
 * passing, and "yesterday at 14:32" is more than anybody asked.
 */
export { relativeTime }

function Body({
  backupsReady,
  connections = null,
  connectionsSettled = false,
  onConnections,
  installId,
  active,
  live,
  pending,
  publishedAt,
  websiteUrl,
  websiteUrlDisplay,
  busy,
  onPublish,
  pinActions = false,
}: Omit<PublishPanelProps, "open" | "onOpenChange" | "anchorRef" | "mobile"> & {
  /** Keep the actions on screen under a scrolling body: the phone's sheet. */
  pinActions?: boolean
  /** The panel is on screen. On a phone the sheet keeps this mounted while
      closed, and a closed sheet has no business asking the server anything. */
  active: boolean
}) {
  const [copied, setCopied] = useState<"site" | "preview" | null>(null)
  /**
   * ═════════════════════════════════════════════════════════════════════
   *  THE LINK THAT SHOWS UNPUBLISHED WORK
   * ═════════════════════════════════════════════════════════════════════
   * Preview used to be an ordinary link to the live address with
   * `builder_preview=1` on it, and nothing anywhere read that parameter. It
   * appeared to work because the public pages were serving drafts to
   * everybody: the preview and the leak were the same behaviour seen from
   * two sides. With the pages fixed to serve only what was published, this
   * needs a real answer, and the real answer is a secret in the URL.
   *
   * Asked for, never assumed. Opening this panel reads whether a link
   * exists; it does not create one. The first press of Preview creates it,
   * and Turn off destroys it, which un-shares every copy already sent.
   */
  const [previewToken, setPreviewToken] = useState<string | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewNote, setPreviewNote] = useState<string | null>(null)
  const asked = useRef(false)
  /** When the panel last came on screen, so a late answer can wait for the sheet to land. */
  const shownAt = useRef(0)
  useEffect(() => {
    if (active) shownAt.current = performance.now()
  }, [active])

  useEffect(() => {
    if (!active || asked.current || !installId) return
    asked.current = true
    void (async () => {
      try {
        const r = await fetch(`/api/website-builder/themes/${installId}/preview`)
        const j = (await r.json().catch(() => ({}))) as { token?: string | null }
        const token = r.ok ? j.token : null
        if (!token) return
        /* A row that arrives mid-slide grows the sheet under the slide; one
           that arrives after it is grown smoothly, on a transform. */
        const wait = pinActions ? Math.max(0, shownAt.current + SHEET_ARRIVES_MS - performance.now()) : 0
        if (wait > 0) window.setTimeout(() => setPreviewToken(token), wait)
        else setPreviewToken(token)
      } catch {
        /* the link is an extra; not having asked yet is not an error to show */
      }
    })()
  }, [active, installId, pinActions])

  const [security, setSecurity] = useState<SecurityCheck>({ state: "checking" })
  const [issuesOpen, setIssuesOpen] = useState(false)
  /** Which read is the latest, so an answer that comes back late cannot replace a newer one. */
  const securityRun = useRef(0)
  const checkSecurity = useCallback(async () => {
    const run = ++securityRun.current
    try {
      const r = await fetch(`/api/website-builder/themes/${installId}/security`, { cache: "no-store" })
      const j = (await r.json().catch(() => null)) as { issues?: unknown; truncated?: unknown } | null
      if (run !== securityRun.current) return
      const issues = r.ok && j && Array.isArray(j.issues) ? (j.issues as SecurityIssue[]) : null
      if (!issues) setSecurity({ state: "unknown" })
      else if (issues.length === 0) setSecurity({ state: "clear" })
      else setSecurity({ state: "found", issues, truncated: j?.truncated === true })
    } catch {
      if (run === securityRun.current) setSecurity({ state: "unknown" })
    }
  }, [installId])
  /* Each time the panel comes on screen: the draft may have changed since the last look. The last answer stays up while the new one is read. */
  useEffect(() => {
    if (!active) return
    setIssuesOpen(false)
    if (!installId) {
      setSecurity({ state: "unknown" })
      return
    }
    void checkSecurity()
  }, [active, installId, checkSecurity])

  // A path, not a query: see `withToken` in the preview route for why.
  const previewUrl = previewToken && websiteUrl
    ? `${websiteUrl.replace(/\/$/, "")}/preview/${previewToken}`
    : null

  const openPreview = async () => {
    if (previewUrl) {
      openInBrowser(previewUrl)
      return
    }
    /**
     * The tab is opened now and pointed somewhere after. A window opened on
     * the far side of an await is not attributable to the press any more,
     * and every browser blocks it. It says "Opening your website" while it
     * waits and why in place when the link cannot be made, never a blank
     * about:blank tab (lib/website-builder/opening-tab.ts).
     */
    const tab = openOpeningTab(tt("Getting the preview of your drafts."))
    setPreviewBusy(true)
    setPreviewNote(null)
    try {
      const r = await fetch(`/api/website-builder/themes/${installId}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ base: websiteUrl }),
      })
      const j = (await r.json().catch(() => ({}))) as { token?: string; url?: string; error?: string }
      if (!r.ok || !j.url || !j.token) {
        const reason = j.error ?? tt("Could not make a preview link.")
        tab?.fail(reason)
        setPreviewNote(reason)
        return
      }
      setPreviewToken(j.token)
      if (!tab?.go(j.url)) openInBrowser(j.url)
    } catch {
      tab?.fail(tt("Could not make a preview link."))
      setPreviewNote(tt("Could not make a preview link."))
    } finally {
      setPreviewBusy(false)
    }
  }

  const revokePreview = async () => {
    setPreviewBusy(true)
    try {
      const r = await fetch(`/api/website-builder/themes/${installId}/preview`, { method: "DELETE" })
      if (r.ok) {
        setPreviewToken(null)
        setPreviewNote(null)
      }
    } catch {
      /* left on, and it says so: the row is still there */
    } finally {
      setPreviewBusy(false)
    }
  }
  // Re-rendered every half minute while visible, so "4 minutes ago" does not
  // still say four after ten. Cheap, and only while the panel is open.
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const ago = relativeTime(publishedAt)
  const status = !live
    ? tt("Not published yet")
    : pending
      ? tt("Changes since published{value}", { value: ago ? ` ${ago}` : "" })
      : tt("Published{value}", { value: ago ? ` ${ago}` : "" })

  const copy = async (text: string, which: "site" | "preview") => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      window.setTimeout(() => setCopied(null), 1400)
    } catch {
      /* a clipboard that refuses is not worth an error */
    }
  }

  const actions = (
    /**
     * Wrapping, and the primary action pushed right by its own margin rather
     * than by `justify-between`. Measured at 15px/600, "Publish changes"
     * wants 178px inside its padding and the Preview link wants 116, which
     * with the gap is 306 — more than a 320px phone has once the card's own
     * padding is off it. `justify-between` cannot wrap without stranding the
     * button on the left of its new line; `ml-auto` holds it to the right on
     * one line or two.
     */
    <div className="flex flex-wrap items-center gap-3">
      {/* Preview: the draft as a visitor would see it, with the builder's
          bar over it. It was a button on the bar next to Publish, which
          made two buttons for one decision. Here it is the question
          before the answer. */}
      {websiteUrl ? (
        <button
          type="button"
          onClick={() => void openPreview()}
          disabled={previewBusy}
          className="flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-white/15 px-4 text-[15px] font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          {previewBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
          ) : (
            <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
          )}
          {tt("Preview")}
        </button>
      ) : null}
      {/**
       * ONE BOX, WHATEVER IT SAYS.
       *
       * This button has four labels — Publish, Publish changes, Published,
       * Publishing — and it was sized by whichever one it was showing, with
       * `transition-all` animating the change. So pressing it started a width
       * animation at the same moment its contents were replaced, inside a
       * sheet that is itself a `contain: paint` layer being transformed. What
       * came out of that on a phone was a button whose purple had been
       * painted for one width while its spinner and its word sat at another:
       * a slab of colour with the label stranded beside it.
       *
       * A fixed floor wide enough for the longest label removes the animation
       * rather than smoothing it. 180px: "Publish changes" is the widest of
       * the four at 137.7px, which is 178 inside the button's padding, and
       * "Publishing" with its spinner is 153. Nothing about the box changes
       * when the state does, so there is no resize to tear, and the label
       * swap is the only thing that moves. Colours still transition; the
       * geometry does not.
       *
       * Busy is not disabled-looking. The press is refused while a publish is
       * in flight, but a button that fades out the instant you use it reads
       * as one that did not take the press. It stays lit and says what it is
       * doing; only the genuinely unavailable state — live with nothing to
       * publish — is dimmed.
       */}
      <button
        type="button"
        onClick={onPublish}
        disabled={busy || (live && !pending)}
        aria-busy={busy}
        className={cn(
          "ml-auto flex h-10 min-w-[180px] shrink-0 items-center justify-center gap-2 rounded-xl px-5",
          "text-[15px] font-semibold whitespace-nowrap text-white",
          "bg-[#8B56FA] transition-colors duration-150 hover:bg-[#7b46ec]",
          busy ? "cursor-default" : "disabled:cursor-default disabled:opacity-40",
        )}
      >
        {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
        {busy ? tt("Publishing") : live ? (pending ? tt("Publish changes") : tt("Published")) : tt("Publish")}
      </button>
    </div>
  )

  const content = (
    <div className="flex flex-col gap-5 text-white">
      <div>
        <div className="flex items-center gap-2.5">
          <span
            className={cn("h-2.5 w-2.5 rounded-full", live ? (pending ? "bg-blue-500" : "bg-emerald-500") : "bg-white/30")}
          />
          <h2 className="text-[20px] font-semibold leading-none">{tt("Publish")}</h2>
        </div>
        <p className="mt-2.5 text-[15px] text-white/60">{status}</p>
      </div>

      {/**
        * Said here because this is where it costs something. Publishing
        * normally saves a copy of the site first, so a publish can be undone;
        * with the table missing it saves nothing and says nothing, which is
        * the worst version of both.
        */}
      {backupsReady === false && (
        <p className="flex items-start gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-[14px] text-amber-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span>
            {tt("This publish will not be backed up. Run supabase/sql/RUN_THEME_BACKUPS.sql once to turn backups on.")}
          </span>
        </p>
      )}

      {websiteUrl && (
        <div>
          <p className="mb-2.5 text-[15px] font-medium">{tt("Website URL")}</p>
          <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <Globe className="h-4 w-4 shrink-0 text-white/50" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate text-[15px]">{websiteUrlDisplay}</span>
              <button
                type="button"
                onClick={() => void copy(websiteUrl, "site")}
                className="rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                aria-label={tt("Copy address")}
              >
                {copied === "site" ? <Check className="h-4 w-4" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.75} />}
              </button>
              {/* In the phone app, the phone's browser and nothing in the app (lib/website-builder/live-site-link.ts). */}
              <a
                {...liveSiteLink(ownOpen(websiteUrl))}
                data-publish-open-live=""
                className="rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                aria-label={tt("Open the live site")}
              >
                <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
              </a>
            </div>
            <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3 text-[14px] text-white/70">
              <Globe className="h-4 w-4 shrink-0 text-white/40" strokeWidth={1.75} />
              {live ? tt("Visible to anyone with the link") : tt("Nobody can see it until it is published")}
            </div>
            {/**
              * Only once there is one. A row explaining a link that does not
              * exist is a row about a button three inches away.
              */}
            {previewUrl && (
              <div className="wb-settings-swap flex items-center gap-3 border-t border-white/10 px-4 py-3 text-[14px]">
                <Eye className="h-4 w-4 shrink-0 text-white/40" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 text-white/70">{tt("Preview link shows unpublished changes")}</span>
                <button
                  type="button"
                  onClick={() => void copy(previewUrl, "preview")}
                  className="rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label={tt("Copy the preview link")}
                >
                  {copied === "preview" ? <Check className="h-4 w-4" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.75} />}
                </button>
                <button
                  type="button"
                  onClick={() => void revokePreview()}
                  disabled={previewBusy}
                  className="shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  {tt("Turn off")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {previewNote && <p className="text-[14px] text-amber-300/90">{previewNote}</p>}

      {/* What is connected, then the security line under it: the owner asked
          for the row above the check, so the check is the last word before
          the actions. A desktop has the mark on its bar instead of the row. */}
      {pinActions && <ConnectionsRow brief={connections} settled={connectionsSettled} onOpen={onConnections} />}

      <SecurityLine
        check={security}
        open={issuesOpen}
        onToggle={() => setIssuesOpen((v) => !v)}
        onRetry={() => {
          setSecurity({ state: "checking" })
          void checkSecurity()
        }}
      />
    </div>
  )

  /**
   * On a phone the actions are pinned under the scrolling part, so Publish
   * is on screen whatever the sheet's height: a sheet at 40% of the screen
   * cannot always show the whole card, and the one thing it must show is
   * the button. On a desktop the card is as tall as it needs to be and the
   * actions are simply its last row.
   */
  if (pinActions) {
    return (
      <>
        <div data-sheet-scroll className="wb-slim-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-1">
          {/* The box the sheet measures. It is inside the scroller, so its
              height is the content's own at any sheet height, which is what
              lets the sheet size to it without the answer feeding back into
              the question. */}
          <div data-sheet-content>{content}</div>
        </div>
        <div className="shrink-0 border-t border-white/10 px-5 pb-3 pt-3 text-white">{actions}</div>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-5 text-white">
      {content}
      <div className="pt-1">{actions}</div>
    </div>
  )
}

export function PublishPanel(props: PublishPanelProps) {
  const { open, onOpenChange, anchorRef, mobile } = props
  const panelRef = useRef<HTMLDivElement | null>(null)

  // Kept in the tree for one beat after closing so it can leave the way it
  // came. A panel that grows in and then vanishes is half an animation.
  const [present, setPresent] = useState(open)
  useEffect(() => {
    if (open) {
      setPresent(true)
      return
    }
    const id = window.setTimeout(() => setPresent(false), 160)
    return () => window.clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open || mobile) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return
      onOpenChange(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    /*
      A TAP ON AN IMPORTED THEME'S CANVAS IS A TAP AWAY TOO. That canvas is an
      iframe, and a press inside it never reaches this document, so the
      pointerdown above never heard it and the panel stayed open over the
      page. What does reach this window is the focus leaving for the frame.
      Closing does not stop a publish that is running: that is the editor's,
      and the button keeps saying "Publishing" until it is done.
    */
    const onBlur = () => {
      window.setTimeout(() => {
        if (document.activeElement instanceof HTMLIFrameElement) onOpenChange(false)
      }, 0)
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    window.addEventListener("blur", onBlur)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("blur", onBlur)
    }
  }, [open, mobile, onOpenChange, anchorRef])

  if (mobile) {
    return (
      <MobileEditorSheet
        open={open}
        onOpenChange={onOpenChange}
        className="bg-[#1f1f1f]"
        /**
         * AS TALL AS WHAT IS IN IT, CAPPED.
         *
         * This was a flat 40% of the screen. Forty percent of a phone is not
         * enough for a status line, a URL row, its visibility note and a
         * security line, so the card arrived with its own content already
         * scrolled: everything below the URL had to be dragged into view,
         * which is not what a confirmation is for.
         *
         * `fit` measures what the content actually wants — including
         * whatever the inner scroller is currently clipping, so it converges
         * upward rather than settling into a collapse — and takes that,
         * capped at 88% of the screen so it can never become a page. On a
         * phone the whole card fits inside the cap and nothing scrolls at
         * all; on a small screen it scrolls, with the actions still pinned
         * underneath.
         */
        fit
        detents={[0.88]}
        // Above the persistent Sections / Pages / Settings sheet, and gone
        // entirely when closed rather than leaving a peek of its own.
        layer="raised"
        peekHeight={0}
      >
        <Body {...props} pinActions active={open} />
      </MobileEditorSheet>
    )
  }

  if (!present) return null
  /**
   * PORTALLED, like the sheet on a phone, and for the same reason.
   *
   * This used to hang from the button inside the top bar, which is
   * `relative z-50` and therefore a stacking context: the panel's own z-50
   * was only ever compared with the bar's other children, and out over the
   * canvas the whole bar is one layer at 50. The code editor's pane is
   * `absolute inset-0 z-[80]` in the canvas, so with the code editor open
   * the Publish panel was painted UNDERNEATH it, showing at the edges and
   * unusable in the middle. No number written here could have fixed that.
   * See components/website-builder/anchored-panel.tsx.
   */
  return (
    <AnchoredPanel
      anchorRef={anchorRef}
      align="right"
      panelRef={panelRef}
      role="dialog"
      aria-label={tt("Publish")}
      data-state={open ? "open" : "closed"}
      className={cn(
        "w-[420px] max-w-[calc(100vw-16px)] overflow-y-auto wb-slim-scroll rounded-2xl border border-white/10 bg-[#1f1f1f] p-6 shadow-[0_24px_80px_-16px_rgba(0,0,0,0.7)]",
        "origin-top-right duration-150",
        open
          ? "animate-in fade-in-0 zoom-in-95 slide-in-from-top-1"
          : "pointer-events-none animate-out fade-out-0 zoom-out-95 slide-out-to-top-1 fill-mode-forwards",
      )}
    >
      <Body {...props} active={open} />
    </AnchoredPanel>
  )
}
