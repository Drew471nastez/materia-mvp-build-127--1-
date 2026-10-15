"use client"

/**
 * ===========================================================================
 *  WRITE AND SEND AN EMAIL: /app/emails/new and /app/emails/edit/<id>
 * ===========================================================================
 * Drawn in the Emails list's language (app/app/emails/emails-home.tsx) and
 * the Orders page's parts: the pane's bar with back, title, status and the
 * actions; under it the envelope (who it goes to, who it is from, subject,
 * preview text), the email itself, written as it will read
 * (./block-editor.tsx), and the email as it will arrive: beside the writing
 * from 1024px, and below that on a screen of its own that Preview raises
 * from the bottom edge and Done takes down again (./preview-layer.tsx).
 *
 * ON A PHONE the page is a full screen layer (app/app/emails/new/layout.tsx):
 * no /app header and no nav pill. Its bar holds Back, the title and the
 * menu; Preview and Send are at the foot, where a thumb is, and step out of
 * the way while something is being typed, when the formatting bar takes the
 * place on the keyboard (./format-bar.tsx).
 *
 * NOTHING HERE WRITES TO THE DATABASE DIRECTLY. Every save goes through
 * /api/email/campaigns, which cleans the body and refuses a save when
 * somebody else saved in between (the version is the row's updated_at), and
 * every send through /api/email/send, which decides on the server whether
 * this click is the one that sends. The page shows what the server says: a
 * status read back after every action and while a send runs, never a guess.
 *
 * Saving is automatic, a second after the typing stops. There is no Save
 * button to forget and no "unsaved changes" dialog on the way out.
 */
import * as React from "react"
import { ArrowLeft, MoreHorizontal } from "lucide-react"
import { PaneBar, LIST_WIDTH, GUTTER } from "@/app/app/orders/order-parts"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { createClient } from "@/lib/supabase/client"
import { displayEmail } from "@/lib/businesses/email-alias"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { blockIssues, hasRealContent, newBlock, renderBlocks, storeBlocks } from "@/lib/email-campaigns/blocks"
import { DEFAULT_BRAND, brandName, themeOf, type Brand } from "@/lib/email-campaigns/brand"
import { readStoredBody } from "@/lib/email-campaigns/stored"
import { buildEmail, personalizeHtml, personalizeSubject, unknownMergeFields } from "@/lib/email-campaigns/template"
import { senderPhoto } from "@/lib/email-campaigns/sender"
import { SAMPLE_READER } from "@/lib/email-variables"
import { byteLength, checkContent, PREVIEW_MAX, SUBJECT_MAX, SUBJECT_SHORT, type Problem } from "@/lib/email-campaigns/validate"
import { STATUS_LABEL, readStatus, type CampaignStatus, type RecipientCounts } from "@/lib/email-campaigns/state"
import { BlockEditor } from "./block-editor"
import { EmailPreview, type PreviewMode } from "./email-preview"
import { AudiencePicker, audienceLabel, type Audience, type AudienceOption, type SegmentOption } from "./audience-picker"
import { useDoc } from "./use-doc"
import { campaignKey, takeFresh } from "@/components/email/emails-cache"
import { ComposeDialog, StatusBadge, buttonAccent, buttonPrimary, buttonSecondary, card, errorClass, helpClass, iconButton } from "./ui"
import { PreviewLayer } from "./preview-layer"
import { StarterList, type LayoutChoice } from "./starter-list"
import { LayoutBar, LayoutDialog, type LayoutDialogState } from "./layout-bar"
import { starterDraft } from "@/lib/email-campaigns/starters"
import { appliedLayout, blankBlocks, detectLayout, envelopeAfter, layoutEdited, needsConfirm, readAppliedLayout, trimTrailingEmpty, type AppliedLayout } from "@/lib/email-campaigns/layouts"
import { useMedia } from "./format-bar"
import { SendStatus } from "./send-status"
import { afterLayerMove } from "@/components/app/page-layer"
import { tt } from "@/lib/i18n/text"
import { appLocale, appTimeZone, instantAt, wallClockIn, zoned } from "@/lib/i18n/format"

export interface ComposerProps {
  campaignId: string | null
  /** Leave the page; the list opens on the tab that now holds this email. */
  onExit: (tab?: "drafts" | "scheduled" | "published") => void
}

interface Loaded {
  id: string
  status: CampaignStatus
  version: string
  scheduledAt: string | null
  sentAt: string | null
  lastError: string | null
  counts: RecipientCounts | null
}

type SaveState = "idle" | "pending" | "saving" | "saved" | "error" | "conflict"

interface Me {
  creatorId: string | null
  name: string
  username: string | null
  avatarUrl: string | null
  email: string | null
  replyTo: string | null
}

const EDITABLE: CampaignStatus[] = ["draft", "scheduled"]

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16))
}

function when(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString(appLocale(), zoned({ weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))
}

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & { error?: string; errors?: Problem[] } }> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: tt("You seem to be offline. Check your connection and try again.") } as T & { error: string } }
  }
}

export function EmailComposer({ campaignId, onExit }: ComposerProps) {
  const [loading, setLoading] = React.useState(!!campaignId)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [me, setMe] = React.useState<Me>({ creatorId: null, name: "", username: null, avatarUrl: null, email: null, replyTo: null })
  const [loaded, setLoaded] = React.useState<Loaded | null>(null)
  const [subject, setSubject] = React.useState("")
  const [previewText, setPreviewText] = React.useState("")
  const [audience, setAudience] = React.useState<Audience>({ type: "all", segmentId: null })
  const doc = useDoc([newBlock("rich")])
  const [options, setOptions] = React.useState<AudienceOption[]>([])
  const [segments, setSegments] = React.useState<SegmentOption[]>([])
  /* The creator's products, for New segment's "bought a product you pick". */
  const [segmentProducts, setSegmentProducts] = React.useState<{ id: string; title: string }[]>([])
  const [plan, setPlan] = React.useState<{ limit: number; used: number } | null>(null)
  /* The look the email is sent in, read by the server as it is now (lib/email-campaigns/brand-server). */
  const [brand, setBrand] = React.useState<(Brand & { avatarUrl?: string | null; creatorName?: string }) | null>(null)
  /* Counting opens is a setting only once the database has the column for it. */
  const [trackOpens, setTrackOpens] = React.useState(true)
  const [canSetOpens, setCanSetOpens] = React.useState(false)
  const [save, setSave] = React.useState<SaveState>("idle")
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [fieldError, setFieldError] = React.useState<Partial<Record<Problem["field"], string>>>({})
  const [showIssues, setShowIssues] = React.useState(false)
  /* Below 1024px the preview is a screen of its own, raised over the writing (./preview-layer.tsx). */
  const [previewOpen, setPreviewOpen] = React.useState(false)
  /* A field or the text has the keyboard: the foot's Preview and Send step aside for it. */
  const [typing, setTyping] = React.useState(false)
  /* From 1024px the preview is beside the writing. Below, it is not drawn at all until it is asked for: no frame rebuilt on every word typed. */
  const wide = useMedia("(min-width: 1024px)")
  /* A phone at life size reads at the width of the preview column; a computer is shown scaled. */
  const [previewMode, setPreviewMode] = React.useState<PreviewMode>("mobile")
  const [dialog, setDialog] = React.useState<null | "send" | "schedule" | "test" | "leave">(null)

  const paneRef = React.useRef<HTMLDivElement>(null)
  const clientId = React.useRef<string>(campaignId ?? uuid())
  const ready = React.useRef(!campaignId)

  /* ─── Who is writing ─── */

  /*
    What these two reads bring (who is sending, the audience and the brand)
    draws most of the composer again. On a phone the composer rises as a
    layer and the answers come back half way up, so they are put in once it
    has arrived (components/app/page-layer.tsx afterLayerMove), not in the
    frames of the move.
  */
  React.useEffect(() => {
    let live = true
    const cancels: Array<() => void> = []
    ;(async () => {
      const supabase = createClient()
      const { data: auth } = await supabase.auth.getUser()
      const user = auth.user
      if (!user || !live) return
      const [{ data: profile }, { data: creator }] = await Promise.all([
        supabase.from("profiles").select("display_name, username, avatar_url").eq("id", user.id).maybeSingle(),
        supabase.from("creators").select("id, support_email").eq("user_id", user.id).maybeSingle(),
      ])
      if (!live) return
      cancels.push(afterLayerMove(() => setMe({
        creatorId: creator?.id ?? null,
        name: (profile?.display_name || profile?.username || "").trim() || "You",
        username: profile?.username ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        /* Shown, so their own address and never the tag a second business's
           account carries (lib/businesses/email-alias.ts). Neither is posted:
           what a test is really sent to, and what replies really go to, are
           worked out on the server (app/api/email/send-test/route.ts,
           lib/email-campaigns/queue.ts). */
        email: displayEmail(user.email),
        replyTo: (creator?.support_email || displayEmail(user.email) || "").trim().toLowerCase() || null,
      })))
    })()
    fetch("/api/email/audience", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live || !d) return
        cancels.push(
          afterLayerMove(() => {
            setOptions(d.options ?? [])
            setSegments(d.segments ?? [])
            setSegmentProducts(Array.isArray(d.products) ? d.products : [])
            setPlan(d.plan ?? null)
            setBrand(d.brand ?? null)
            setCanSetOpens(d.upgraded === true)
          }),
        )
      })
      .catch(() => {})
    return () => {
      live = false
      for (const cancel of cancels) cancel()
    }
  }, [])

  /* ─── The email itself ─── */

  const applyCampaign = React.useCallback(
    (c: Record<string, unknown>, counts: RecipientCounts | null) => {
      const status = readStatus(c.status)
      setLoaded({
        id: String(c.id),
        status,
        version: String(c.updated_at ?? ""),
        scheduledAt: (c.scheduled_at as string) ?? null,
        sentAt: (c.sent_at as string) ?? null,
        lastError: (c.last_error as string) ?? null,
        counts,
      })
      return status
    },
    [],
  )

  const load = React.useCallback(
    async (id: string) => {
      setLoading(true)
      /* A draft's row reads it ahead on hover or touch; that copy is used if it is a few seconds old at most. */
      type Answer = { campaign: Record<string, unknown>; counts: RecipientCounts | null; upgraded?: boolean }
      const ahead = await takeFresh<Answer>(campaignKey(id), 5_000).catch(() => undefined)
      const r = ahead?.campaign ? { ok: true, status: 200, data: ahead as Answer & { error?: string } } : await api<Answer>(`/api/email/campaigns/${id}`)
      if (!r.ok) {
        setLoadError(r.data.error ?? tt("This email could not be opened."))
        setLoading(false)
        return
      }
      const c = r.data.campaign
      applyCampaign(c, r.data.counts)
      ready.current = false
      setSubject(String(c.subject ?? ""))
      setPreviewText(String(c.preview_text ?? ""))
      setAudience({ type: String(c.audience_type ?? "all"), segmentId: (c.segment_id as string) ?? null })
      setTrackOpens(c.track_opens !== false)
      if (r.data.upgraded === true) setCanSetOpens(true)
      doc.reset(readStoredBody(String(c.body ?? "")).blocks)
      lastSaved.current = null
      setSave("saved")
      setLoading(false)
      window.setTimeout(() => (ready.current = true), 0)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyCampaign],
  )

  React.useEffect(() => {
    if (campaignId) void load(campaignId)
  }, [campaignId, load])

  const status: CampaignStatus = loaded?.status ?? "draft"
  const editable = EDITABLE.includes(status) || (status === "failed" && !(loaded?.counts && loaded.counts.sent + loaded.counts.delivered + loaded.counts.bounced > 0))

  /* ─── What would be saved, and what would be sent ─── */

  /* An empty text block at the end is where the caret waits, not part of the email. */
  const clean = React.useMemo(() => trimTrailingEmpty(doc.blocks), [doc.blocks])
  /* What is saved: the blocks, each marked, text as the editor wrote it. */
  const bodyHtml = React.useMemo(() => storeBlocks(clean), [clean])
  const look: Brand = React.useMemo(() => brand ?? { ...DEFAULT_BRAND, name: brandName(me.name) }, [brand, me.name])
  const theme = React.useMemo(() => themeOf(look), [look])
  /* What is sent: the same blocks rendered in the brand, exactly as the server will. */
  const sentBody = React.useMemo(() => renderBlocks(clean, theme), [clean, theme])
  const issues = React.useMemo(() => blockIssues(clean), [clean])

  const verdict = React.useMemo(() => {
    const div = typeof document !== "undefined" ? document.createElement("div") : null
    if (div) div.innerHTML = sentBody
    const text = div ? (div.textContent ?? "") : ""
    return checkContent({
      subject,
      previewText,
      text: hasRealContent(clean) ? text || "content" : "",
      images: clean.filter((b) => b.type === "image" && b.src).length,
      bytes: byteLength(sentBody),
      unknownFields: unknownMergeFields(subject, previewText, sentBody),
    })
  }, [subject, previewText, sentBody, clean])

  /* The preview reads as a buyer gets it: a sample reader, and you as the send will read you (lib/email-variables). */
  const reader = React.useMemo(
    () => ({ name: SAMPLE_READER.name, email: SAMPLE_READER.email, creatorName: brand?.creatorName || me.name, storeName: look.name, storeUrl: look.storeUrl, unsubscribeUrl: "#" }),
    [brand, me.name, look],
  )
  const previewHtml = React.useMemo(() => {
    return buildEmail({
      subject: personalizeSubject(subject, reader),
      previewText: personalizeSubject(previewText, reader),
      bodyHtml: personalizeHtml(sentBody, reader).replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, "#"),
      brand: look,
      /* The photo the send reads (brand-server loadBrand). Until that answer
         arrives, the same photo put through the same rule (senderPhoto), so
         the preview never shows a picture the send would not: a missing
         photo on the brand used to fall through to the raw profile field. */
      avatarUrl: brand ? (brand.avatarUrl ?? null) : senderPhoto(me.avatarUrl),
      kind: "marketing",
      unsubscribeUrl: "#",
    })
  }, [subject, previewText, sentBody, reader, me.avatarUrl, look, brand])

  /* ─── Saving ─── */

  const lastSaved = React.useRef<string | null>(null)
  const inFlight = React.useRef<Promise<boolean> | null>(null)
  const latest = React.useRef({ subject, previewText, audience, bodyHtml, loaded, clean, trackOpens, canSetOpens })
  latest.current = { subject, previewText, audience, bodyHtml, loaded, clean, trackOpens, canSetOpens }

  const snapshot = () => JSON.stringify([latest.current.subject, latest.current.previewText, latest.current.audience, latest.current.bodyHtml, latest.current.canSetOpens ? latest.current.trackOpens : null])

  const saveNow = React.useCallback(
    async (force = false): Promise<boolean> => {
      if (inFlight.current) {
        await inFlight.current
      }
      const snap = snapshot()
      const l = latest.current
      if (!force && snap === lastSaved.current) return true
      const meaningful = l.subject.trim() || hasRealContent(l.clean)
      if (!l.loaded && !meaningful && !force) return true

      const run = (async () => {
        setSave("saving")
        const body = {
          subject: l.subject,
          preview_text: l.previewText,
          body: l.bodyHtml,
          audience_type: l.audience.type,
          segment_id: l.audience.type === "segment" ? l.audience.segmentId : null,
          ...(l.canSetOpens ? { track_opens: l.trackOpens } : {}),
        }
        const r = l.loaded
          ? await api<{ campaign: Record<string, unknown> }>(`/api/email/campaigns/${l.loaded.id}`, { method: "PATCH", body: JSON.stringify({ ...body, expected_updated_at: l.loaded.version }) })
          : await api<{ campaign: Record<string, unknown> }>(`/api/email/campaigns`, { method: "POST", body: JSON.stringify({ ...body, id: clientId.current }) })
        if (r.ok) {
          const c = r.data.campaign
          setLoaded((prev) => ({
            id: String(c.id),
            status: readStatus(c.status),
            version: String(c.updated_at),
            scheduledAt: (c.scheduled_at as string) ?? prev?.scheduledAt ?? null,
            sentAt: prev?.sentAt ?? null,
            lastError: readStatus(c.status) === "draft" ? null : prev?.lastError ?? null,
            counts: prev?.counts ?? null,
          }))
          latest.current.loaded = { ...(latest.current.loaded ?? ({} as Loaded)), id: String(c.id), version: String(c.updated_at), status: readStatus(c.status) } as Loaded
          lastSaved.current = snap
          setSaveError(null)
          setFieldError((f) => ({ ...f, audience: undefined }))
          setSave(snapshot() === snap ? "saved" : "pending")
          if (!campaignId && typeof window !== "undefined" && !window.location.pathname.endsWith(String(c.id))) {
            /* So a reload opens this draft. Only a nicety: never worth failing a save over. */
            try {
              window.history.replaceState(window.history.state, "", `/app/emails/edit/${c.id}`)
            } catch {}
          }
          return true
        }
        if (r.status === 409) {
          const s = readStatus((r.data as { status?: string }).status)
          if (!EDITABLE.includes(s) && l.loaded) {
            await load(l.loaded.id)
            return false
          }
          setSave("conflict")
          setSaveError(r.data.error ?? tt("This email was changed somewhere else."))
          return false
        }
        if ((r.data as { field?: string }).field === "audience") setFieldError((f) => ({ ...f, audience: r.data.error }))
        setSave("error")
        setSaveError(r.data.error ?? tt("Not saved. Check your connection."))
        return false
      })()
      inFlight.current = run
      try {
        return await run
      } finally {
        inFlight.current = null
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaignId, load],
  )

  /* A second after the last change. */
  React.useEffect(() => {
    if (!ready.current || !editable || loading) return
    if (snapshot() === lastSaved.current) return
    /* A new email with nothing in it yet is not "unsaved". */
    if (!latest.current.loaded && !subject.trim() && !hasRealContent(clean)) return
    if (save !== "conflict") setSave("pending")
    const t = window.setTimeout(() => {
      if (save !== "conflict") void saveNow()
    }, 1000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, previewText, audience, bodyHtml, trackOpens])

  /* Leaving with something unsaved asks the browser to check first. */
  React.useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (save === "pending" || save === "saving" || save === "error") {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [save])

  const back = async () => {
    if (editable && (save === "pending" || save === "saving")) {
      const ok = await saveNow()
      if (!ok) return setDialog("leave")
    } else if (save === "error" || save === "conflict") {
      return setDialog("leave")
    }
    onExit(status === "scheduled" ? "scheduled" : EDITABLE.includes(status) ? "drafts" : "published")
  }

  /* ─── Checking before a send or a schedule ─── */

  const firstProblem = (): boolean => {
    setShowIssues(true)
    const f: Partial<Record<Problem["field"], string>> = {}
    for (const e of verdict.errors) if (!f[e.field]) f[e.field] = e.message
    setFieldError(f)
    const blockError = issues.find((i) => i.level === "error")
    const target = f.subject ? "#compose-subject" : f.previewText ? "#compose-preview" : blockError ? `[data-block-id="${blockError.id}"]` : f.body ? "[data-email-editor]" : null
    if (target) {
      setPreviewOpen(false)
      window.setTimeout(() => {
        const el = document.querySelector<HTMLElement>(target)
        el?.scrollIntoView({ block: "center", behavior: "smooth" })
        if (el instanceof HTMLInputElement) el.focus({ preventScroll: true })
      }, 30)
      return true
    }
    return false
  }

  const beginSend = async (kind: "send" | "schedule") => {
    if (firstProblem()) return
    const ok = await saveNow(!loaded || status === "failed")
    if (!ok) return
    setDialog(kind)
  }

  /* ─── Sending ─── */

  const [confirm, setConfirm] = React.useState<{ loading: boolean; error: string | null; recipients?: number; excluded?: number; warnings?: Problem[]; sender?: { name: string; from: string; replyTo: string; address?: string | null } }>({ loading: false, error: null })
  const sendKey = React.useRef<string>(uuid())
  const [sending, setSending] = React.useState(false)

  React.useEffect(() => {
    if (dialog !== "send" || !latest.current.loaded) return
    sendKey.current = uuid()
    setConfirm({ loading: true, error: null })
    void api<{ recipients: number; excluded: number; warnings: Problem[]; sender: { name: string; from: string; replyTo: string; address: string | null } }>("/api/email/send", {
      method: "POST",
      body: JSON.stringify({ campaign_id: latest.current.loaded.id, dry_run: true, expected_updated_at: latest.current.loaded.version }),
    }).then((r) => {
      if (r.ok) setConfirm({ loading: false, error: null, recipients: r.data.recipients, excluded: r.data.excluded, warnings: r.data.warnings, sender: r.data.sender })
      else setConfirm({ loading: false, error: r.data.error ?? tt("This email cannot be sent yet.") })
    })
  }, [dialog])

  const sendNow = async () => {
    const l = latest.current.loaded
    if (!l || sending) return
    setSending(true)
    const r = await api<{ status: CampaignStatus; recipients?: number; already?: boolean }>("/api/email/send", {
      method: "POST",
      body: JSON.stringify({ campaign_id: l.id, idempotency_key: sendKey.current, expected_updated_at: l.version }),
    })
    setSending(false)
    if (!r.ok) {
      setConfirm((c) => ({ ...c, error: r.data.error ?? tt("Not sent. Try again.") }))
      return
    }
    setDialog(null)
    await load(l.id)
  }

  /* While a send runs, ask the server how far it has got: not while the tab is hidden, and once more the moment it comes back. */
  React.useEffect(() => {
    if (!loaded || (loaded.status !== "queued" && loaded.status !== "sending")) return
    const ask = async () => {
      if (document.hidden) return
      const r = await api<{ campaign: Record<string, unknown>; counts: RecipientCounts | null }>(`/api/email/campaigns/${loaded.id}`)
      if (r.ok) applyCampaign(r.data.campaign, r.data.counts)
    }
    const t = window.setInterval(ask, 5000)
    document.addEventListener("visibilitychange", ask)
    return () => {
      window.clearInterval(t)
      document.removeEventListener("visibilitychange", ask)
    }
  }, [loaded, applyCampaign])

  const stop = async () => {
    if (!loaded) return
    const r = await api<{ status: CampaignStatus }>(`/api/email/campaigns/${loaded.id}/stop`, { method: "POST" })
    if (!r.ok) setSaveError(r.data.error ?? tt("Could not stop it."))
    await load(loaded.id)
  }

  const retry = async () => {
    if (!loaded) return
    const r = await api<{ status: CampaignStatus }>("/api/email/send", { method: "POST", body: JSON.stringify({ campaign_id: loaded.id, retry_failed: true }) })
    if (!r.ok) setSaveError(r.data.error ?? tt("Could not send again."))
    await load(loaded.id)
  }

  /* ─── Scheduling ─── */

  const [scheduleError, setScheduleError] = React.useState<string | null>(null)
  const [scheduleBusy, setScheduleBusy] = React.useState(false)
  const schedule = async (at: Date | null) => {
    const l = latest.current.loaded
    if (!l) return
    setScheduleBusy(true)
    setScheduleError(null)
    const r = await api<{ campaign: Record<string, unknown> }>(`/api/email/campaigns/${l.id}/schedule`, {
      method: "POST",
      body: JSON.stringify({ scheduled_at: at ? at.toISOString() : null, expected_updated_at: l.version }),
    })
    setScheduleBusy(false)
    if (!r.ok) {
      if (at) setScheduleError(r.data.error ?? tt("Not scheduled. Try again."))
      else setSaveError(r.data.error ?? tt("Could not unschedule."))
      return
    }
    const c = r.data.campaign
    setLoaded((prev) => (prev ? { ...prev, status: readStatus(c.status), version: String(c.updated_at), scheduledAt: (c.scheduled_at as string) ?? null } : prev))
    setDialog(null)
  }

  /* ─── Test ─── */

  const [test, setTest] = React.useState<{ busy: boolean; done: string | null; error: string | null }>({ busy: false, done: null, error: null })
  const sendTest = async () => {
    setTest({ busy: true, done: null, error: null })
    const r = await api<{ sent_to: string }>("/api/email/send-test", { method: "POST", body: JSON.stringify({ subject, preview_text: previewText, body: bodyHtml }) })
    setTest({ busy: false, done: r.ok ? r.data.sent_to : null, error: r.ok ? null : r.data.error ?? tt("The test was not sent.") })
  }

  const uploadImage = async (file: File): Promise<string> => {
    const form = new FormData()
    form.append("file", file)
    const res = await fetch("/api/email/upload-image", { method: "POST", body: form })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || typeof data.url !== "string") throw new Error(data.error || tt("The image did not upload. Try again."))
    return data.url
  }

  /* ─── One number for the layout: the bar's height, shared with what sticks under it ─── */

  React.useLayoutEffect(() => {
    const pane = paneRef.current
    const bar = pane?.querySelector<HTMLElement>("[data-orders-bar]")
    if (!pane || !bar) return
    const write = () => {
      pane.style.setProperty("--compose-bar", `${bar.offsetHeight}px`)
      pane.style.setProperty("--compose-room", `${Math.max(320, pane.clientHeight - bar.offsetHeight - 32)}px`)
    }
    write()
    const ro = new ResizeObserver(write)
    ro.observe(bar)
    ro.observe(pane)
    return () => ro.disconnect()
  }, [loading])

  /* ─── Typing, for the foot ─── */

  React.useEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    const read = () => {
      const a = document.activeElement as HTMLElement | null
      /* The formatting bar is drawn in the body on a phone, so its link field counts as the page's. */
      const on = !!a && (pane.contains(a) || !!a.closest("[data-format-bar]")) && (a.isContentEditable || a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !/^(checkbox|radio|button|submit|range|color|file)$/i.test((a as HTMLInputElement).type)))
      setTyping((t) => (t === on ? t : on))
    }
    const later = () => requestAnimationFrame(read)
    document.addEventListener("focusin", read)
    document.addEventListener("focusout", later)
    return () => {
      document.removeEventListener("focusin", read)
      document.removeEventListener("focusout", later)
    }
  }, [loading])

  /* ─── The layout the email is on ─── */

  /*
    START, SWITCH, EDIT, GO BACK TO BLANK (lib/email-campaigns/layouts.ts).
    `layout` is what the layout wrote when it was put in, so the line above
    the email can say "edited" and a switch knows whether it would lose
    somebody's words. It is kept for this email in the browser (a per viewer
    convenience: nothing about sending depends on it), and a draft reopened
    anywhere else still knows a layout it has not been written over.
  */
  const [layout, setLayout] = React.useState<AppliedLayout | null>(null)
  const [layoutDialog, setLayoutDialog] = React.useState<LayoutDialogState>(null)
  /* Once somebody has chosen, nothing read back later overrides them. */
  const layoutChosen = React.useRef(false)
  const layoutKey = `sl:email-layout:${clientId.current}`
  const edited = React.useMemo(() => (layout ? layoutEdited(layout, clean) : false), [layout, clean])
  const hasContent = hasRealContent(clean)

  React.useEffect(() => {
    if (loading || layoutChosen.current) return
    let stored: AppliedLayout | null = null
    try {
      stored = readAppliedLayout(JSON.parse(window.localStorage.getItem(layoutKey) ?? "null"))
    } catch {
      stored = null
    }
    const found = stored ?? detectLayout(clean, { name: look.name, storeUrl: brand?.storeUrl ?? null })
    if (found) setLayout(found)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, brand])

  const rememberLayout = (next: AppliedLayout | null) => {
    try {
      if (next) window.localStorage.setItem(layoutKey, JSON.stringify(next))
      else window.localStorage.removeItem(layoutKey)
    } catch {
      /* private mode: the line reads from the email itself next time */
    }
  }

  const applyLayout = (choice: LayoutChoice) => {
    layoutChosen.current = true
    const d = choice === "blank" ? null : starterDraft(choice, { name: look.name, storeUrl: brand?.storeUrl ?? null })
    const env = envelopeAfter({ subject, previewText }, layout, d)
    doc.set(d ? d.blocks : blankBlocks())
    setSubject(env.subject)
    setPreviewText(env.previewText)
    const next = d && choice !== "blank" ? appliedLayout(choice, d) : null
    setLayout(next)
    rememberLayout(next)
    setLayoutDialog(null)
    setShowIssues(false)
    requestAnimationFrame(() => paneRef.current?.querySelector("[data-email-editor]")?.scrollIntoView({ block: "start", behavior: "smooth" }))
  }

  /* A tap on a layout, or on Blank: straight in, unless it would throw away words somebody wrote. */
  const chooseLayout = (choice: LayoutChoice) => {
    const current: LayoutChoice = layout?.id ?? "blank"
    if (choice === current && !edited) return setLayoutDialog(null)
    if (needsConfirm(layout, clean)) setLayoutDialog({ mode: "confirm", choice })
    else applyLayout(choice)
  }

  const canStart = editable && !loading && !hasContent && !layout

  /* ─── Drawing ─── */

  const title = subject.trim() || (loaded ? tt("Untitled email") : tt("New email"))
  const tone = status === "failed" ? "critical" : status === "partially_failed" ? "critical" : status === "sending" || status === "queued" || status === "scheduled" ? "attention" : status === "sent" ? "success" : "neutral"
  const sub =
    status === "scheduled"
      ? tt("Goes out {date}", { date: when(loaded?.scheduledAt ?? null) })
      : !editable
        ? loaded?.sentAt
          ? tt("Sent {date}", { date: when(loaded.sentAt) })
          : ""
        : save === "saving"
          ? tt("Saving…")
          : save === "pending"
            ? tt("Unsaved changes")
            : save === "error"
              ? tt("Not saved")
              : save === "conflict"
                ? tt("Changed somewhere else")
                : loaded
                  ? tt("Saved")
                  : tt("Not saved yet")
  const aud = audienceLabel(audience, options, segments)

  const moreItems: ActionMenuItem[] = [
    { label: tt("Send a test to yourself"), onClick: () => { setTest({ busy: false, done: null, error: null }); setDialog("test") } },
    status === "scheduled"
      ? { label: tt("Unschedule"), onClick: () => void schedule(null) }
      : { label: tt("Schedule"), onClick: () => void beginSend("schedule") },
  ]

  if (loadError) {
    return (
      <div ref={paneRef} className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa]">
        <div className={cn("mx-auto pt-16 text-center", LIST_WIDTH, GUTTER)}>
          <p className="text-[15px] font-semibold text-[#1a1a2e]">{loadError}</p>
          <button type="button" className={cn(buttonSecondary, "mt-4")} onClick={() => onExit()}>
            {tt("Back to emails")}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={paneRef} data-compose="" className="orders-pane page-scroll flex h-full flex-col overflow-y-auto overflow-x-hidden bg-[#f8f9fa] app-page-enter [scroll-padding-bottom:72px]">
      <PaneBar width={LIST_WIDTH} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 pb-2.5 pt-2">
        <div className="-ml-1.5 flex h-9 w-9 items-center justify-center">
          <button type="button" onClick={back} aria-label={tt("Back to emails")} className={cn(iconButton, "h-9 w-9")}>
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>
        <div className="flex min-h-9 min-w-0 items-center gap-2.5">
          <h1 className="min-w-0 truncate text-[18px] font-bold leading-7 text-[#1a1a2e] sm:text-[20px]">{loading ? "" : title}</h1>
          {!loading && loaded ? <StatusBadge tone={tone}>{STATUS_LABEL[status]}</StatusBadge> : null}
        </div>
        <div className="flex min-h-9 shrink-0 items-center gap-1.5">
          {editable && !loading ? (
            <>
              <button type="button" className={cn(buttonSecondary, "hidden md:inline-flex")} onClick={() => { setTest({ busy: false, done: null, error: null }); setDialog("test") }}>
                {tt("Send test")}
              </button>
              {status === "scheduled" ? (
                <button type="button" className={cn(buttonSecondary, "hidden md:inline-flex")} onClick={() => void schedule(null)}>
                  {tt("Unschedule")}
                </button>
              ) : (
                <button type="button" className={cn(buttonSecondary, "hidden md:inline-flex")} onClick={() => void beginSend("schedule")}>
                  {tt("Schedule")}
                </button>
              )}
              <button type="button" className={cn(buttonSecondary, "hidden md:inline-flex lg:hidden")} onClick={() => setPreviewOpen(true)} data-open-preview="bar">
                {tt("Preview")}
              </button>
              <ResponsiveActionMenu
                title={tt("Email")}
                align="end"
                items={moreItems}
                trigger={
                  <button type="button" className={cn(buttonSecondary, "px-2 md:hidden")} aria-label={tt("More actions")}>
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                }
              />
              <button type="button" className={cn(buttonAccent, "hidden md:inline-flex")} onClick={() => void beginSend("send")} data-send-button="">
                {status === "scheduled" ? tt("Send now") : tt("Send")}
              </button>
            </>
          ) : null}
        </div>
        <div className="col-span-2 col-start-2 -mt-0.5 min-w-0 truncate text-[13px] leading-5 text-[#6b7280]" aria-live="polite">
          {loading ? "" : sub}
        </div>
      </PaneBar>

      {loading ? (
        <ComposeSkeleton />
      ) : (
        <div
          className={cn(
            "mx-auto w-full flex-1 pb-6 pt-4 md:pb-10",
            /* While the keyboard is up there is room under the email to scroll the line being typed above the formatting bar on it. */
            typing && "max-md:pb-[calc(var(--kb-inset,0px)+80px)]",
            LIST_WIDTH,
            GUTTER,
          )}
        >
          {save === "conflict" || save === "error" ? (
            <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#f3c1b9] bg-[#fdf1ef] px-4 py-3">
              <p className="text-[13px] text-[#8a1c0f]">{saveError}</p>
              <div className="flex gap-2">
                {save === "conflict" && loaded ? (
                  <>
                    <button type="button" className={buttonSecondary} onClick={() => void load(loaded.id)}>
                      {tt("Load that version")}
                    </button>
                    <button
                      type="button"
                      className={buttonPrimary}
                      onClick={async () => {
                        const r = await api<{ campaign: Record<string, unknown> }>(`/api/email/campaigns/${loaded.id}`)
                        if (r.ok) {
                          latest.current.loaded = { ...loaded, version: String(r.data.campaign.updated_at) }
                          setLoaded((p) => (p ? { ...p, version: String(r.data.campaign.updated_at) } : p))
                          void saveNow(true)
                        }
                      }}
                    >
                      {tt("Keep mine")}
                    </button>
                  </>
                ) : (
                  <button type="button" className={buttonSecondary} onClick={() => void saveNow(true)}>
                    {tt("Try again")}
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {status === "failed" && editable && loaded?.lastError ? (
            <div role="status" className="mb-3 rounded-xl border border-[#f3c1b9] bg-[#fdf1ef] px-4 py-3 text-[13px] text-[#8a1c0f]">
              {tt("This email was not sent. {lastError} Fix it and send it again.", { lastError: loaded.lastError })}
            </div>
          ) : null}

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="min-w-0 space-y-4">
              {editable ? (
                <>
                  <section aria-label={tt("Envelope")} className={cn(card, "divide-y divide-[#eef0f2]")}>
                    <Row label={tt("To")} htmlFor="compose-to" error={fieldError.audience}>
                      <AudiencePicker
                        id="compose-to"
                        value={audience}
                        options={options}
                        segments={segments}
                        onChange={setAudience}
                        products={segmentProducts}
                        onSegmentCreated={(s) => {
                          setSegments((list) => [...list.filter((x) => x.id !== s.id), s].sort((a, b) => a.name.localeCompare(b.name)))
                          setAudience({ type: "segment", segmentId: s.id })
                        }}
                      />
                    </Row>
                    <Row label={tt("From")}>
                      <p className="flex h-11 min-w-0 items-center truncate text-[16px] text-[#1a1a2e] sm:h-9 sm:text-[14px]">
                        <span className="truncate">
                          {me.name}
                          {me.replyTo ? <span className="text-[#6b7280]"> · {tt("replies go to {replyTo}", { replyTo: me.replyTo })}</span> : null}
                        </span>
                      </p>
                    </Row>
                    <Row
                      label={tt("Subject")}
                      htmlFor="compose-subject"
                      error={fieldError.subject}
                      counter={subject.length > SUBJECT_SHORT - 10 ? `${subject.length}/${SUBJECT_MAX}` : null}
                      hint={!fieldError.subject && subject.trim().length > SUBJECT_SHORT ? tt("Phones cut subjects past about 60 characters.") : null}
                    >
                      <input
                        id="compose-subject"
                        value={subject}
                        maxLength={SUBJECT_MAX + 50}
                        onChange={(e) => {
                          setSubject(e.target.value)
                          if (fieldError.subject) setFieldError((f) => ({ ...f, subject: undefined }))
                        }}
                        placeholder={tt("What is this email about?")}
                        aria-invalid={!!fieldError.subject}
                        className="h-11 w-full min-w-0 bg-transparent text-[16px] font-medium text-[#1a1a2e] outline-none placeholder:font-normal placeholder:text-[#9ca3af] sm:h-9 sm:text-[14px]"
                      />
                    </Row>
                    <Row
                      label={tt("Preview")}
                      htmlFor="compose-preview"
                      error={fieldError.previewText}
                      counter={previewText.length > 100 ? `${previewText.length}/${PREVIEW_MAX}` : null}
                    >
                      <input
                        id="compose-preview"
                        value={previewText}
                        maxLength={PREVIEW_MAX + 50}
                        onChange={(e) => {
                          setPreviewText(e.target.value)
                          if (fieldError.previewText) setFieldError((f) => ({ ...f, previewText: undefined }))
                        }}
                        placeholder={tt("The line shown after the subject in the inbox")}
                        className="h-11 w-full min-w-0 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] sm:h-9 sm:text-[14px]"
                      />
                    </Row>
                    {canSetOpens ? (
                      <Row label={tt("Opens")} htmlFor="compose-opens">
                        <label className="flex h-11 min-w-0 cursor-pointer items-center justify-between gap-3 sm:h-9">
                          <span className="truncate text-[14px] text-[#4b5563]">{trackOpens ? tt("Counted") : tt("Not counted")}</span>
                          <Switch id="compose-opens" checked={trackOpens} onCheckedChange={setTrackOpens} aria-label={tt("Count opens")} />
                        </label>
                      </Row>
                    ) : null}
                  </section>

                  {layout || hasContent ? (
                    <LayoutBar
                      className="-mb-2"
                      layout={layout?.id ?? null}
                      edited={edited}
                      onChange={() => setLayoutDialog({ mode: "pick" })}
                      onRemove={() => chooseLayout("blank")}
                    />
                  ) : null}
                  <section aria-label={tt("Email")} className={cn(card, "overflow-clip", fieldError.body && "shadow-[0_0_0_2px_#d72c0d]")}>
                    <BlockEditor doc={doc} creatorId={me.creatorId} username={me.username} issues={issues} showIssues={showIssues} theme={theme} onUploadImage={uploadImage} />
                  </section>
                  {fieldError.body ? <p className={errorClass}>{fieldError.body}</p> : null}
                  {canStart ? <StarterList onPick={chooseLayout} /> : null}
                  {plan ? (
                    <p className={cn(helpClass, "px-1")}>
                      {tt("{value} of {value2} emails used this month", { value: plan.used.toLocaleString(appLocale()), value2: plan.limit.toLocaleString(appLocale()) })}
                      {aud.count !== null ? tt(" · this one goes to about {value}", { value: aud.count.toLocaleString(appLocale()) }) : ""}
                    </p>
                  ) : null}
                </>
              ) : loaded ? (
                <SendStatus status={status} counts={loaded.counts} lastError={loaded.lastError} audienceLabel={aud.label} onStop={stop} onRetry={retry} onBack={() => onExit("published")} />
              ) : null}
            </div>

            <aside
              aria-label={tt("Preview")}
              className={cn("min-w-0 lg:sticky", editable && "hidden lg:block")}
              style={{ top: "calc(var(--compose-bar, 60px) + 16px)" }}
            >
              <div className={cn(card, "overflow-hidden lg:max-h-[var(--compose-room)] lg:overflow-y-auto")}>
                {editable && !wide ? null : (
                <EmailPreview html={previewHtml} senderName={me.name || tt("You")} subject={personalizeSubject(subject, reader)} previewText={personalizeSubject(previewText, reader)} mode={previewMode} onMode={setPreviewMode} />
                )}
              </div>
            </aside>
          </div>
        </div>
      )}

      {editable && !loading ? (
        <div
          data-compose-foot=""
          data-hidden={typing ? "true" : "false"}
          inert={typing}
          className={cn(
            "sticky bottom-0 z-10 shrink-0 transition-[translate,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none md:hidden",
            typing ? "pointer-events-none translate-y-full opacity-0" : "translate-y-0 opacity-100",
          )}
        >
          <div className="flex gap-2 border-t border-[#e5e7eb] bg-white px-4 pb-[calc(10px+env(safe-area-inset-bottom,0px))] pt-2.5 shadow-[0_-6px_20px_-14px_rgba(17,24,39,0.2)]">
            <button type="button" className={cn(buttonSecondary, "h-11 flex-1 text-[15px]")} onClick={() => setPreviewOpen(true)} data-open-preview="foot">
              {tt("Preview")}
            </button>
            <button type="button" className={cn(buttonAccent, "h-11 flex-1 text-[15px]")} onClick={() => void beginSend("send")} data-send-button="foot">
              {status === "scheduled" ? tt("Send now") : tt("Send")}
            </button>
          </div>
        </div>
      ) : null}

      {editable ? (
        <PreviewLayer
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          html={previewHtml}
          senderName={me.name || tt("You")}
          subject={personalizeSubject(subject, reader)}
          previewText={personalizeSubject(previewText, reader)}
          mode={previewMode}
          onMode={setPreviewMode}
        />
      ) : null}

      <ComposeDialog
        open={dialog === "send"}
        onClose={() => setDialog(null)}
        title={status === "scheduled" ? tt("Send it now?") : tt("Send this email?")}
        footer={
          <>
            <button type="button" className={buttonSecondary} onClick={() => setDialog(null)}>
              {tt("Cancel")}
            </button>
            <button type="button" className={buttonAccent} disabled={confirm.loading || !!confirm.error || sending} onClick={() => void sendNow()} data-confirm-send="">
              {sending ? tt("Sending…") : confirm.recipients ? tt("Send to {value}", { value: confirm.recipients.toLocaleString(appLocale()) }) : tt("Send")}
            </button>
          </>
        }
      >
        {confirm.loading ? (
          <p className="py-4 text-[14px] text-[#6b7280]">{tt("Counting who it goes to…")}</p>
        ) : confirm.error ? (
          <p className="py-2 text-[14px] text-[#b42318]">{confirm.error}</p>
        ) : (
          <dl className="grid gap-3 text-[14px]">
            <div>
              <dt className="text-[12px] font-medium text-[#6b7280]">{tt("To")}</dt>
              <dd className="text-[#1a1a2e]">
                <span className="font-semibold tabular-nums">{(confirm.recipients ?? 0).toLocaleString(appLocale())}</span> {tt("{recipients, plural, one {person} other {people}} in", { recipients: confirm.recipients })} {aud.label.toLowerCase()}
                {confirm.excluded ? (
                  <span className="block text-[13px] text-[#6b7280]">
                    {tt("{value} left out: unsubscribed, bounced, or not a working address.", { value: confirm.excluded.toLocaleString(appLocale()) })}
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] font-medium text-[#6b7280]">{tt("From")}</dt>
              <dd className="break-words text-[#1a1a2e]">{confirm.sender?.from}</dd>
              <dd className="break-words text-[13px] text-[#6b7280]">{tt("Replies go to {replyTo}", { replyTo: confirm.sender?.replyTo })}</dd>
              {confirm.sender && !confirm.sender.address ? (
                <dd className="mt-1 text-[13px] text-[#5c4300]">
                  {tt("No postal address in the footer. Marketing email must carry one in the US and many other places: add it under Settings, Address.")}
                </dd>
              ) : null}
            </div>
            <div>
              <dt className="text-[12px] font-medium text-[#6b7280]">{tt("Subject")}</dt>
              <dd className="break-words text-[#1a1a2e]">{subject}</dd>
            </div>
            {confirm.warnings?.length ? (
              <div className="rounded-lg bg-[#fff8e6] px-3 py-2 text-[13px] text-[#5c4300]">
                {confirm.warnings.map((w) => (
                  <p key={w.message}>{w.message}</p>
                ))}
              </div>
            ) : null}
            <p className="text-[13px] text-[#6b7280]">{tt("Once it starts it cannot be taken back. You can stop the ones not yet sent.")}</p>
          </dl>
        )}
      </ComposeDialog>

      {editable ? (
        <LayoutDialog
          state={layoutDialog}
          current={layout?.id ?? "blank"}
          onClose={() => setLayoutDialog(null)}
          onChoose={chooseLayout}
          onApply={applyLayout}
        />
      ) : null}

      <ScheduleDialog open={dialog === "schedule"} onClose={() => setDialog(null)} busy={scheduleBusy} error={scheduleError} onSchedule={(d) => void schedule(d)} />

      <ComposeDialog
        open={dialog === "test"}
        onClose={() => setDialog(null)}
        title={tt("Send a test")}
        footer={
          <>
            <button type="button" className={buttonSecondary} onClick={() => setDialog(null)}>
              {test.done ? tt("Done") : tt("Cancel")}
            </button>
            {!test.done ? (
              <button type="button" className={buttonPrimary} disabled={test.busy || !subject.trim()} onClick={() => void sendTest()}>
                {test.busy ? tt("Sending…") : tt("Send test")}
              </button>
            ) : null}
          </>
        }
      >
        <p className="text-[14px] text-[#1a1a2e]">
          {test.done ? (
            <>{tt("Sent to {done}. It can take a minute to arrive.", { done: test.done })}</>
          ) : (
            <>
              {tt("The email as your subscribers will get it, with your name filled in, to")} <span className="font-medium">{me.email ?? tt("your account's email")}</span>.
            </>
          )}
        </p>
        {!subject.trim() ? <p className={cn(helpClass, "mt-2")}>{tt("Add a subject first.")}</p> : null}
        {test.error ? <p className={cn(errorClass, "mt-2 text-[13px]")}>{test.error}</p> : null}
      </ComposeDialog>

      <ComposeDialog
        open={dialog === "leave"}
        onClose={() => setDialog(null)}
        title={tt("Leave without saving?")}
        footer={
          <>
            <button type="button" className={buttonSecondary} onClick={() => setDialog(null)}>
              {tt("Stay")}
            </button>
            <button type="button" className={buttonPrimary} onClick={() => onExit("drafts")}>
              {tt("Leave")}
            </button>
          </>
        }
      >
        <p className="text-[14px] text-[#1a1a2e]">{tt("Your latest changes are not saved. {saveError}", { saveError })}</p>
      </ComposeDialog>
    </div>
  )
}

function Row({
  label,
  htmlFor,
  error,
  hint,
  counter,
  children,
}: {
  label: string
  htmlFor?: string
  error?: string | null
  hint?: string | null
  counter?: string | null
  children: React.ReactNode
}) {
  return (
    <div className="px-4 py-1.5 transition-colors duration-100 focus-within:bg-[#fafbfb] first:rounded-t-2xl last:rounded-b-2xl sm:px-5">
      <div className="grid grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-x-2 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:gap-x-3">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-[#6b7280]">
          {label}
        </label>
        <div className="min-w-0">{children}</div>
        {counter ? <span className="text-[12px] tabular-nums text-[#6b7280]">{counter}</span> : null}
      </div>
      {error ? <p className={cn(errorClass, "pb-1 pl-[68px] sm:pl-[84px]")}>{error}</p> : hint ? <p className={cn(helpClass, "pb-1 pl-[68px] sm:pl-[84px]")}>{hint}</p> : null}
    </div>
  )
}

/* ─── Scheduling: a day, and a whole hour, because the queue runs on the hour ─── */

function ScheduleDialog({ open, onClose, busy, error, onSchedule }: { open: boolean; onClose: () => void; busy: boolean; error: string | null; onSchedule: (d: Date) => void }) {
  /* The creator's time zone (Settings), not the device's: "9:00" is 9:00 where they said they are. */
  const tz = React.useMemo(() => appTimeZone(), [])
  const next = React.useMemo(() => {
    /* Two hours on, on the hour; worked out again each time the dialog opens. */
    const w = wallClockIn(Date.now() + (open ? 2 : 2) * 3_600_000, tz)
    return { ...w, min: 0 }
  }, [open, tz])
  const ymdOf = (w: { y: number; m: number; d: number }) => `${w.y}-${String(w.m + 1).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`
  const [day, setDay] = React.useState(ymdOf(next))
  const [hour, setHour] = React.useState(next.h)
  React.useEffect(() => {
    if (open) {
      setDay(ymdOf(next))
      setHour(next.h)
    }
  }, [open, next])
  const [y, m, d] = day.split("-").map(Number)
  const at = instantAt(y, (m || 1) - 1, d || 1, hour, 0, tz)
  const past = at.getTime() < Date.now() + 5 * 60_000
  /* Hours as the wall clock says them, in the dashboard's language: "9:00 AM", "09:00". */
  const hours = Array.from({ length: 24 }, (_, h) => ({ h, label: new Date(Date.UTC(2000, 0, 1, h)).toLocaleTimeString(appLocale(), { hour: "numeric", minute: "2-digit", timeZone: "UTC" }) }))
  const field = "h-11 w-full min-w-0 rounded-lg border border-[#d5d7dd] bg-white px-3 text-[16px] text-[#1a1a2e] outline-none focus:border-[#1a1a2e] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.10)] sm:h-9 sm:text-[14px]"
  return (
    <ComposeDialog
      open={open}
      onClose={onClose}
      title={tt("Schedule")}
      footer={
        <>
          <button type="button" className={buttonSecondary} onClick={onClose}>
            {tt("Cancel")}
          </button>
          <button type="button" className={buttonPrimary} disabled={busy || past} onClick={() => onSchedule(at)}>
            {busy ? tt("Scheduling…") : tt("Schedule")}
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-[13px] font-medium text-[#1a1a2e]">{tt("Day")}</span>
          <input type="date" className={field} value={day} min={ymdOf(wallClockIn(Date.now(), tz))} onChange={(e) => setDay(e.target.value)} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[13px] font-medium text-[#1a1a2e]">{tt("Time")}</span>
          <select className={field} value={hour} onChange={(e) => setHour(Number(e.target.value))}>
            {hours.map((o) => (
              <option key={o.h} value={o.h}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className={cn("mt-3 text-[13px]", past ? "text-[#b42318]" : "text-[#6b7280]")}>
        {past ? tt("Choose a time later than now.") : tt("Goes out {date}, your time ({value}).", { date: when(at.toISOString()), value: tz.replace(/_/g, " ") })}
      </p>
      {error ? <p className={cn(errorClass, "mt-2 text-[13px]")}>{error}</p> : null}
    </ComposeDialog>
  )
}

function ComposeSkeleton() {
  return (
    <div aria-busy="true" aria-label={tt("Loading")} className={cn("skeleton-deferred mx-auto grid gap-4 pt-4 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]", LIST_WIDTH, GUTTER)}>
      <div className="space-y-4">
        <div className={cn(card, "h-[168px]")} />
        <div className={cn(card, "h-[420px]")} />
      </div>
      <div className={cn(card, "hidden h-[520px] lg:block")} />
    </div>
  )
}
