"use client"

/**
 * ===========================================================================
 *  /app/emails: THE LIST, AND AN EMAIL OPENED OVER IT
 * ===========================================================================
 * Built the way Orders is (app/app/orders/orders-client.tsx), because the
 * owner asked for an email's page to open and close like an order's:
 *
 *   the same move            an email comes in over the list and goes back
 *                            with Orders' own motion (app/app/orders/
 *                            order-motion.ts): pushed from the right edge on a
 *                            phone, its cards faded in on a computer; on
 *                            Back popped the same way on a phone, and on a
 *                            computer gone at once with the list there
 *                            whole, not settling in (the list rising half
 *                            faded on every Back was the "bump"), the row it
 *                            came from tinted and fading so the eye lands
 *                            where it left
 *   the list stays mounted   an email opens over it, in its own scroll
 *                            container, and Back shows again a list nobody
 *                            touched: same tab, same scroll, same search
 *   ?email=<id>              pushed as a real history entry, so the browser's
 *                            back, the Android gesture and an iOS swipe close
 *                            it, a reload opens it again and a link to it can
 *                            be shared (/app/emails/<id> lands here too)
 *   ?tab=<tab>, &show=, &section=
 *                            Campaigns | Automations | Settings (round 51),
 *                            Campaigns' filter and Settings' section;
 *                            replaced, not pushed, so back does not walk
 *                            through every tab. Next.js syncs history.pushState
 *                            and replaceState into useSearchParams without
 *                            asking the server for anything (a router.replace
 *                            would fetch the page again for a query change).
 *
 * TABS ARE READ ONCE (components/email/emails-cache.ts). The tab that is
 * open shows what was read before at once and reads again behind it; once it
 * has loaded, the other tabs are read while the browser is idle, and a tab
 * is read ahead when a pointer rests on it, so a switch rarely waits; when it
 * does, the last tab's content stays until the rows come (HOLD_MS).
 *
 * Every write goes through a route that checks the creator owns what it
 * changes, or through Supabase under the row policies.
 */

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { TryProStrip } from "@/components/app/announcement-bar-mobile"
import { ComposeDialog } from "@/components/email/compose/ui"
import { load, peek, prefetch, refresh, useCached, write } from "@/components/email/emails-cache"
import { PullToRefresh } from "@/components/ui/pull-to-refresh"
import { viewerTimeZone } from "@/lib/orders/time-zone"
import { boundsOf, resolveValue, todayIn, type RangeValue } from "@/lib/date-range/range"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { buttonPrimary, buttonSecondary } from "../orders/order-parts"
import { markRow, moveOrder, stillOrder } from "../orders/order-motion"
import { APP_PAGE_KEPT_MS, holdLanding, isTraversing } from "@/lib/ui/app-navigation"
import { backThen } from "@/lib/navigation/go-back"
import { EmailsHome, type CampaignRow, type EmailsTab, type FlowRow } from "./emails-home"
import type { CustomerEmailsData } from "@/components/app/settings/customer-emails-panel"
import type { PlatformsData } from "@/components/email/connected-platforms"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { EmailDetail, type EmailAction, type EmailSeed } from "./email-detail"
import { TABS, campaignKey, loadReport, loadTab, mergeCampaigns, reportKey, tabKey, viewOf, type AllData, type SendingData, type SentData } from "./emails-data"
import { isPageTab, isSection, isShow, placeOfView, type CampaignShow, type EmailsPageTab, type SettingsSection } from "./emails-route"
import { noteListAddress } from "./list-return"
import { openLayer } from "./layer-nav"
import { tt } from "@/lib/i18n/text"

function writeAddress(mutate: (p: URLSearchParams) => void, mode: "push" | "replace") {
  const params = new URLSearchParams(window.location.search)
  mutate(params)
  const qs = params.toString()
  const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`
  if (mode === "push") window.history.pushState(null, "", url)
  else window.history.replaceState(null, "", url)
}

async function postJson(url: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null)
  const data = res ? await res.json().catch(() => ({})) : { error: tt("You seem to be offline. Try again.") }
  return { ok: !!res?.ok, data }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16))
}

const ALL_EMAIL_LISTS = ["emails:drafts", "emails:scheduled"]

/** How long a chosen tab with nothing read yet keeps the last tab's content before its skeleton shows. */
const HOLD_MS = 300

export function EmailsClient({ initialTab, initialShow = "all", initialSection = "sending" }: { initialTab: EmailsPageTab; initialShow?: CampaignShow; initialSection?: SettingsSection }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  /*
    BACK TO THE LIST IS THE LIST, AS IT WAS. Coming back from an automation
    or a draft (the browser's back, or their own back arrow, which is a
    history back when the list is behind them) is a return: the stage has
    already put the list's scroll back, and the rows are the ones the page
    read before (components/email/emails-cache.ts). So it asks the stage for
    no landing (lib/ui/app-navigation holdLanding): no fade from nothing, no
    2px rise of the whole page. Decided on the first render, while the
    return is still marked; a visit from the rail or the pill lands as any
    page does.
  */
  const [returning] = React.useState(() => isTraversing())
  React.useLayoutEffect(() => {
    if (returning) holdLanding()
  }, [returning])

  /* Where the list is, for the composer's way back (./list-return). */
  const address = searchParams.toString()
  React.useEffect(() => {
    noteListAddress(address)
  }, [address])

  /* ── The tab, Campaigns' filter, Settings' section ─────────────────── */
  const urlTab = searchParams.get("tab")
  const urlShow = searchParams.get("show")
  const urlSection = searchParams.get("section")
  const [pageTab, setPageTabState] = React.useState<EmailsPageTab>(isPageTab(urlTab) ? urlTab : initialTab)
  const [show, setShowState] = React.useState<CampaignShow>(isShow(urlShow) ? urlShow : initialShow)
  const [section, setSectionState] = React.useState<SettingsSection>(isSection(urlSection) ? urlSection : initialSection)
  /* The browser's own back and forward between tabs a link opened. */
  React.useEffect(() => {
    const t = isPageTab(urlTab) ? urlTab : "campaigns"
    if (t !== pageTab) setPageTabState(t)
    const sh = isShow(urlShow) ? urlShow : "all"
    if (sh !== show) setShowState(sh)
    const se = isSection(urlSection) ? urlSection : "sending"
    if (se !== section) setSectionState(se)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab, urlShow, urlSection])
  /* What is drawn: the view of this tab, filter and section (./emails-data.ts viewOf). */
  const tab: EmailsTab = viewOf(pageTab, show, section)

  /* ── The Sent tab's period: the date picker every page in /app shares ── */
  const timeZone = React.useMemo(() => viewerTimeZone(), [])
  const today = todayIn(timeZone, Date.now())
  const [period, setPeriod] = React.useState<RangeValue>(() => resolveValue({ preset: "last_30_days" }, today, "last_30_days"))
  const periodKey = `${period.preset}:${period.start}:${period.end}`
  const rangeQuery = React.useMemo(() => {
    if (period.preset === "all_time") return "timeRange=all"
    const b = boundsOf(period, timeZone, Date.now())
    return `start=${encodeURIComponent(new Date(b.start).toISOString())}&end=${encodeURIComponent(new Date(b.end).toISOString())}`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey, timeZone])

  const keyFor = React.useCallback((t: EmailsTab) => tabKey(t, periodKey), [periodKey])
  const loaderFor = React.useCallback((t: EmailsTab) => () => loadTab(t, rangeQuery), [rangeQuery])

  /*
    THE CONTENT WAITS FOR ITS ROWS (round 28, the owner: "no blank, keep the
    previous tab's content until the next is ready"). The bar shows the tab
    chosen at once; what is under it stays the last tab's until the chosen
    one has its rows, read before (at once) or arriving now. Only a read
    slower than HOLD_MS shows the table's own skeleton, the shape of the
    rows it stands for. `shown` is the tab whose content is drawn.
  */
  const [shown, setShown] = React.useState<EmailsTab>(tab)
  const wanted = useCached<unknown>(keyFor(tab), loaderFor(tab))
  const current = useCached<unknown>(keyFor(shown), loaderFor(shown))
  const [heldOut, setHeldOut] = React.useState<EmailsTab | null>(null)
  /*
    THE BAR FIRST, THE CONTENT AS A TRANSITION. The chosen tab's pill moves
    in the render the click makes; the new content is drawn after it, as a
    transition React can pause for the next input, with the last content on
    screen until it is done. A tab drawn in one go with its pill held the
    pill still for the 60 to 150ms its rows took to draw.
  */
  const canShow = wanted.data !== undefined || wanted.error !== null || heldOut === tab
  React.useEffect(() => {
    if (shown !== tab && canShow) React.startTransition(() => setShown(tab))
  }, [shown, tab, canShow])
  React.useEffect(() => {
    if (shown === tab) return
    const t = window.setTimeout(() => setHeldOut(tab), HOLD_MS)
    return () => window.clearTimeout(t)
  }, [shown, tab])
  /* Pull to refresh: the open tab is read again and the spinner waits for it; the other tabs are marked old, read when next opened. */
  const onPullRefresh = React.useCallback(async () => {
    await load(keyFor(tab), loaderFor(tab))
    refresh(...TABS.filter((t) => t !== tab).map(keyFor))
  }, [tab, keyFor, loaderFor])

  /*
    Once the open tab has what it needs, the others are read while the browser is idle.
    ONCE PER FIVE MINUTES, NOT ONCE A MINUTE (round 48). A visit to Emails more than a minute after the last one
    asked for all seven other tabs again, seven signed in requests, before anything on screen needed them. A tab
    that is opened is read again behind what is kept whenever that is older than a few seconds (useCached), so
    what is warmed only decides what is drawn in the frame of the press, and the router keeps the pages
    themselves for the same five minutes (APP_PAGE_KEPT_MS).
  */
  const warmed = React.useRef(false)
  React.useEffect(() => {
    if (warmed.current || current.loading) return
    warmed.current = true
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }
    const idle = (fn: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(fn, { timeout: 1500 }) : window.setTimeout(fn, 300))
    idle(() => {
      for (const t of TABS) if (t !== tab) prefetch(keyFor(t), loaderFor(t), APP_PAGE_KEPT_MS)
    })
  }, [current.loading, tab, keyFor, loaderFor])

  /* ── A tab switch ────────────────────────────────────────────────────── */
  const listRef = React.useRef<HTMLDivElement>(null)
  const setPageTab = (next: EmailsPageTab) => {
    if (next === pageTab) return
    setPageTabState(next)
    writeAddress((p) => {
      p.set("tab", next)
      /* Each tab keeps only its own: Campaigns its filter, Settings its section and the editor's family. */
      if (next !== "campaigns") p.delete("show")
      else if (show !== "all") p.set("show", show)
      if (next !== "settings") {
        p.delete("section")
        p.delete("kind")
        p.delete("community")
      } else p.set("section", section)
    }, "replace")
  }
  const setShow = (next: CampaignShow) => {
    if (next === show) return
    setShowState(next)
    writeAddress((p) => {
      p.set("tab", "campaigns")
      if (next === "all") p.delete("show")
      else p.set("show", next)
    }, "replace")
  }
  const setSection = (next: SettingsSection) => {
    if (next === section) return
    setSectionState(next)
    writeAddress((p) => {
      p.set("tab", "settings")
      p.set("section", next)
      if (next !== "customer") {
        p.delete("kind")
        p.delete("community")
      }
    }, "replace")
  }
  /*
    A PHONE'S VIEW, CHOSEN IN ONE STEP (round w5). A phone has one row of
    views (emails-home PHONE_VIEWS): the tab and its filter or section are
    set together and the address written once, the way setPageTab,
    setShow and setSection each write it.
  */
  const setView = (next: EmailsTab) => {
    const at = placeOfView(next)
    if (at.tab === pageTab && (at.show ?? show) === show && (at.section ?? section) === section) return
    setPageTabState(at.tab)
    if (at.show) setShowState(at.show)
    if (at.section) setSectionState(at.section)
    writeAddress((p) => {
      p.set("tab", at.tab)
      if (at.show && at.show !== "all") p.set("show", at.show)
      else p.delete("show")
      if (at.section) p.set("section", at.section)
      else p.delete("section")
      if (at.section !== "customer") {
        p.delete("kind")
        p.delete("community")
      }
    }, "replace")
  }
  /* A tab's view, for reading ahead when a pointer rests on it. */
  const viewOfTab = (t: EmailsPageTab) => viewOf(t, show, section)
  /*
    THE SCROLL IS LEFT WHERE IT IS. The bar scrolls with the page now (it is
    not sticky), so a tab is only ever pressed with the bar in view, and the
    content changing under it must not move it: no scroll is placed on a
    switch. The content is at least a pane tall (--pane-h, below), so a
    shorter tab never pulls the page up under the finger either.

    A SOFT CROSSFADE. The content that replaces another comes in from 55%
    opacity over 160ms, never from nothing, so there is no blank frame and
    no flash of the page's grey between the two; compositor only, and none
    under reduced motion.
  */
  const drawnTab = React.useRef(shown)
  React.useLayoutEffect(() => {
    if (drawnTab.current === shown) return
    drawnTab.current = shown
    const el = listRef.current?.querySelector<HTMLElement>("[data-tab-content]")
    if (!el || typeof el.animate !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    el.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 160, easing: "cubic-bezier(0.32,0.72,0,1)" })
  }, [shown])

  /*
    THE PANE'S HEIGHT, MEASURED ONCE. A tab's content is at least a pane
    tall (emails-home), so a short tab never pulls the bar up or down under
    the finger that chose it. A percentage cannot say that through the pull's wrapper, which
    is as tall as what it holds, so the pane says it as --pane-h.
  */
  React.useLayoutEffect(() => {
    const pane = listRef.current
    if (!pane || typeof ResizeObserver === "undefined") return
    const put = () => pane.style.setProperty("--pane-h", `${pane.clientHeight}px`)
    put()
    const ro = new ResizeObserver(put)
    ro.observe(pane)
    return () => ro.disconnect()
  }, [])

  /* ── What the list shows ─────────────────────────────────────────────── */
  const flows = ((shown === "flows" ? current.data : peek(keyFor("flows"))) as FlowRow[] | undefined) ?? []
  const customerEmails = (shown === "customer" ? current.data : peek(keyFor("customer"))) as CustomerEmailsData | undefined
  const platforms = (shown === "platforms" ? current.data : peek(keyFor("platforms"))) as SendingData | undefined
  const physical = usePhysicalCommerceEnabled()
  const allData = (shown === "all" ? current.data : undefined) as AllData | undefined
  const sentData = (shown === "published" ? (current.data as SentData | undefined) : allData?.sent) as SentData | undefined
  const campaigns: CampaignRow[] = React.useMemo(
    () =>
      shown === "all"
        ? mergeCampaigns(allData)
        : shown === "published"
          ? sentData?.campaigns ?? []
          : shown === "scheduled" || shown === "drafts"
            ? ((current.data as CampaignRow[] | undefined) ?? [])
            : [],
    [shown, allData, sentData, current.data],
  )

  /* ── Notices ────────────────────────────────────────────────────────── */
  /*
    The app's own toast (components/ui/toaster.tsx), the same dark box with
    a white mark as the automation pages and the rest of /app, where this
    page used to draw a notice of its own at the top. Something that did not
    happen gets the other mark: said so by the caller, or by the words ("Not
    deleted. Try again.", "Could not copy the email").
  */
  const { toast } = useToast()
  const onNotice = React.useCallback(
    (message: string, failed = /^(Not |Could not |There are no )|Try again\.?$/.test(message)) => {
      toast(failed ? { title: message, variant: "destructive" } : { title: message })
    },
    [toast],
  )

  /* ── An email over the list ───────────────────────────────────────── */
  /*
    One page at a time over the list, an email (?email=<id>), under the key
    "email:<id>". Subscribers and messages opened here before round 51; their
    addresses now go to Contacts (./emails-route.ts), before this page draws.
  */
  const emailParam = searchParams.get("email")
  const openId = emailParam ? `email:${emailParam}` : null
  /* The row a page key came from: "email:<id>" marks row <id>. */
  const rowOf = (key: string) => key.slice(key.indexOf(":") + 1)
  const pushed = React.useRef(false)
  const detailRef = React.useRef<HTMLDivElement>(null)
  const [openedOnEmail] = React.useState(() => openId !== null)
  React.useEffect(() => {
    if (!openId) pushed.current = false
  }, [openId])

  /*
    THE EMAIL THAT IS LEAVING, as Orders keeps its leaving order: when the
    address stops naming an email (Back, in any of its forms) its page stays
    drawn, inert, while it moves off the list, and goes when that ends.
    Worked out while rendering, in the render that closes it, so no frame
    shows it gone and then back for its exit.
  */
  const [lastId, setLastId] = React.useState(openId)
  const [leavingId, setLeavingId] = React.useState<string | null>(null)
  if (openId !== lastId) {
    setLastId(openId)
    setLeavingId(openId === null ? lastId : null)
  }
  const displayedId = openId ?? leavingId

  /* Each email starts at its top, before it is drawn. One on its way out keeps where it was. */
  React.useLayoutEffect(() => {
    if (openId) detailRef.current?.scrollTo({ top: 0 })
  }, [openId])

  /*
    A browser that already drew its own transition for this entry (Safari's
    swipe back) says so on the popstate, and the email then just goes: a
    second slide after the browser's own would be a double animation.
  */
  const browserMoved = React.useRef(false)
  React.useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      browserMoved.current = Boolean((e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition)
    }
    window.addEventListener("popstate", onPop, { capture: true })
    return () => window.removeEventListener("popstate", onPop, { capture: true })
  }, [])

  /* THE MOVE, Orders' own, before the commit that draws or closes the email is painted. */
  const settledId = React.useRef(openId)
  React.useLayoutEffect(() => {
    const was = settledId.current
    settledId.current = openId
    if (was === openId) return
    const detail = detailRef.current
    const list = listRef.current
    if (!list) return
    const skip = browserMoved.current
    browserMoved.current = false
    if (openId !== null) {
      if (was !== null || !detail) return
      markRow(list, rowOf(openId), "held")
      if (skip) return stillOrder(detail, list)
      moveOrder("push", detail, list)
      return
    }
    markRow(list, was && rowOf(was), "fading")
    if (!detail || skip) {
      stillOrder(detail, list)
      setLeavingId(null)
      return
    }
    /* Back shows the list at once, whole, where it was: no settling in (order-motion, `settle`). */
    moveOrder("pop", detail, list, () => setLeavingId(null), { settle: false })
  }, [openId])

  /* What the bar can show on the first frame: the row that was clicked. */
  const seedFor = (id: string): EmailSeed => {
    const lists = [campaigns, peek<SentData>(keyFor("published"))?.campaigns, peek<CampaignRow[]>(keyFor("scheduled")), peek<CampaignRow[]>(keyFor("drafts"))]
    for (const list of lists) {
      const row = list?.find((c) => c.id === id)
      if (row) return { id, subject: row.subject, status: row.status ?? (row.kind === "scheduled" ? "scheduled" : row.kind === "draft" ? "draft" : "sent"), sent_at: row.sent_at, scheduled_at: row.scheduled_at }
    }
    const r = peek<{ campaign: { subject: string; status: string } }>(reportKey(id))
    return { id, subject: r?.campaign.subject ?? "", status: r?.campaign.status }
  }

  const onOpen = (c: CampaignRow) => {
    prefetch(reportKey(c.id), () => loadReport(c.id))
    pushed.current = true
    writeAddress((p) => p.set("email", c.id), "push")
  }
  /*
    BACK CLOSES IT, AND CLOSES IT EVEN WHEN THE BACK DOES NOTHING. The entry
    this page pushed is the app's own note, and the browser has cases the note
    does not know about (an entry it replaced, a web view that reports a
    length it cannot go back through). `history.back()` reports nothing when
    it does nothing, so the email stayed over the list with nothing happening
    at all. A back that does not show itself within BACK_WATCH_MS is followed
    by the address being cleared, which closes it the same way
    (lib/navigation/go-back backThen).
  */
  const closeOver = () => writeAddress((p) => p.delete("email"), "replace")
  const onBack = React.useCallback(() => {
    if (pushed.current) backThen(closeOver)
    else closeOver()
  }, [])

  const onCampaignIntent = (c: CampaignRow) => {
    if (c.kind === "draft" || (!c.kind && shown === "drafts")) {
      router.prefetch(`/app/emails/edit/${c.id}`)
      prefetch(campaignKey(c.id), () => fetch(`/api/email/campaigns/${c.id}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("not ok")))), 5_000)
    } else {
      prefetch(reportKey(c.id), () => loadReport(c.id), 15_000)
    }
  }

  /* ── Actions ────────────────────────────────────────────────────────── */
  const [confirm, setConfirm] = React.useState<{ type: "campaign" | "flow" | "flow-off"; id: string } | null>(null)

  const refreshCampaignLists = () => {
    refresh(...ALL_EMAIL_LISTS, keyFor("published"), keyFor("all"))
  }

  const duplicate = async (id: string): Promise<string | null> => {
    const newId = uuid()
    const r = await postJson(`/api/email/campaigns/${id}/duplicate`, { id: newId })
    if (!r.ok) return String(r.data.error ?? "Could not make a copy. Try again.")
    refresh("emails:drafts", keyFor("all"))
    router.push(`/app/emails/edit/${String((r.data.campaign as { id?: string } | undefined)?.id ?? newId)}`)
    return null
  }

  const deleteCampaign = async (id: string): Promise<string> => {
    /* On the server, by the store the session works in (app/api/email/area): the owner's, or the one a team member given Marketing works in. */
    const res = await fetch("/api/email/area", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_campaign", id }) }).catch(() => null)
    if (!res || !res.ok) return tt("The email was not deleted. Try again.")
    for (const key of ALL_EMAIL_LISTS) write<CampaignRow[]>(key, (prev) => (prev ?? []).filter((c) => c.id !== id))
    write<SentData | undefined>(keyFor("published"), (prev) => (prev ? { ...prev, campaigns: prev.campaigns.filter((c) => c.id !== id) } : prev))
    write<AllData | undefined>(keyFor("all"), (prev) => (prev ? { sent: { ...prev.sent, campaigns: prev.sent.campaigns.filter((c) => c.id !== id) }, scheduled: prev.scheduled.filter((c) => c.id !== id), drafts: prev.drafts.filter((c) => c.id !== id) } : prev))
    refreshCampaignLists()
    return tt("Email deleted")
  }

  const onEmailAction = async (id: string, action: EmailAction): Promise<string | null> => {
    switch (action) {
      case "unschedule": {
        const r = await postJson(`/api/email/campaigns/${id}/schedule`, { scheduled_at: null })
        refreshCampaignLists()
        return r.ok ? tt("Moved back to drafts") : String(r.data.error ?? "Could not unschedule. Try again.")
      }
      case "stop": {
        const r = await postJson(`/api/email/campaigns/${id}/stop`)
        refreshCampaignLists()
        return r.ok ? tt("Stopped. Nobody else will get it.") : String(r.data.error ?? "Could not stop it. Try again.")
      }
      case "retry": {
        const r = await postJson("/api/email/send", { campaign_id: id, retry_failed: true })
        refreshCampaignLists()
        return r.ok ? tt("Sending again to the ones not sent") : String(r.data.error ?? "Could not send again. Try again.")
      }
      case "duplicate":
        return duplicate(id)
      case "delete": {
        const message = await deleteCampaign(id)
        if (message === tt("Email deleted")) onBack()
        return message
      }
      case "test":
        return null
    }
  }

  const deleteFlow = async (id: string) => {
    /* Through the server, which takes everyone out of it first. */
    const res = await fetch(`/api/automations/flows/${id}`, { method: "DELETE" }).catch(() => null)
    if (!res || !res.ok) return onNotice(tt("Not deleted. Try again."))
    write<FlowRow[]>(keyFor("flows"), (prev) => (prev ?? []).filter((f) => f.id !== id))
    onNotice(tt("Automation deleted"))
  }

  /**
   * The list's switch. The server checks a flow is complete before it goes
   * on, and turning one off takes out everyone partway through, so both are
   * its answer to give (app/api/automations/flows/[id]/status).
   */
  const toggleFlow = async (flow: FlowRow, confirmed = false) => {
    const on = flow.status !== "active"
    /* Turning off stops everyone partway through, so it asks first, as the automation's own page does. */
    if (!on && !confirmed && (flow.totals?.in_progress ?? 0) > 0) {
      setConfirm({ type: "flow-off", id: flow.id })
      return
    }
    const res = await fetch(`/api/automations/flows/${flow.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on }),
    }).catch(() => null)
    const out = res ? await res.json().catch(() => ({})) : {}
    if (!res || !res.ok) {
      const first = Array.isArray(out.problems) && out.problems[0]?.message
      onNotice(first || out.error || (on ? tt("Not turned on. Try again.") : tt("Not turned off. Try again.")), true)
      return
    }
    write<FlowRow[]>(keyFor("flows"), (prev) => (prev ?? []).map((f) => (f.id === flow.id ? { ...f, status: on ? "active" : "paused" } : f)))
    refresh(keyFor("flows"))
    onNotice(
      on
        ? tt("On. New people start it from now.")
        : out.stopped > 0
          ? tt("Off. {stopped, plural, one {# person} other {# people}} stopped partway.", { stopped: out.stopped })
          : tt("Off. Sign-ups are still recorded."),
    )
  }

  /**
   * A copy of an automation, off, opened so it can be changed before it is
   * turned on (app/api/automations/flows/[id]/duplicate).
   */
  const duplicateFlow = async (flow: FlowRow) => {
    const res = await fetch(`/api/automations/flows/${flow.id}/duplicate`, { method: "POST" }).catch(() => null)
    const out = res ? await res.json().catch(() => ({})) : {}
    if (!res || !res.ok || !out.id) return onNotice(out.error || tt("Could not make a copy. Try again."), true)
    refresh(keyFor("flows"))
    onNotice(tt("Copy made. It is off until you turn it on."))
    openLayer(router, `/app/emails/flow/${out.id}`)
  }

  const confirmDelete = async () => {
    const target = confirm
    setConfirm(null)
    if (!target) return
    if (target.type === "campaign") onNotice(await deleteCampaign(target.id))
    else if (target.type === "flow") await deleteFlow(target.id)
    else if (target.type === "flow-off") {
      const flow = flows.find((f) => f.id === target.id)
      if (flow) await toggleFlow(flow, true)
    }
  }

  /* Under a settled email the list is hidden by the stage (app/globals.css,
     `.orders-stage[data-order-open]`), and drawn again while anything moves. */
  const listCovered = openId !== null

  return (
    <div
      className={cn("orders-stage relative h-full overflow-hidden bg-[#f8f9fa]", !openedOnEmail && "app-page-enter")}
      data-emails-page=""
      data-order-open={listCovered ? "" : undefined}
    >
      <div
        ref={listRef}
        className="orders-pane orders-list page-scroll absolute inset-0 overflow-y-auto overflow-x-hidden"
        inert={listCovered}
        aria-hidden={listCovered || undefined}
      >
        <TryProStrip />

        {/* Try Pro, from md up only (none on a phone), stays put; what is under it is what a pull moves (components/ui/pull-to-refresh). */}
        <PullToRefresh onRefresh={onPullRefresh}>
        <EmailsHome
          pageTab={pageTab}
          onPageTab={setPageTab}
          onPageTabIntent={(t) => prefetch(keyFor(viewOfTab(t)), loaderFor(viewOfTab(t)), 30_000)}
          show={show}
          onShow={setShow}
          section={section}
          onSection={setSection}
          onView={setView}
          onViewIntent={(v) => prefetch(keyFor(v), loaderFor(v), 30_000)}
          tab={shown}
          chosenTab={tab}
          skeletonAtOnce={heldOut === shown && current.loading}
          loading={current.loading}
          customerEmails={customerEmails ?? null}
          onCustomerEmails={(d) => write<CustomerEmailsData>(keyFor("customer"), () => d)}
          platforms={platforms ?? null}
          onPlatforms={(d) => write<SendingData>(keyFor("platforms"), (prev) => ({ ...d, sender: prev?.sender ?? null }))}
          physical={physical}
          flows={flows}
          onToggleFlow={(f) => void toggleFlow(f)}
          onDeleteFlow={(id) => setConfirm({ type: "flow", id })}
          onDuplicateFlow={(f) => void duplicateFlow(f)}
          campaigns={campaigns}
          onOpenCampaign={onOpen}
          onCampaignIntent={onCampaignIntent}
          onDuplicateCampaign={(c) => void duplicate(c.id).then((m) => m && onNotice(m))}
          onDeleteCampaign={(id) => setConfirm({ type: "campaign", id })}
          overview={sentData?.overview ?? null}
          usage={sentData?.usage ?? { sent: 0, limit: 500 }}
          period={period}
          onPeriod={setPeriod}
          today={today}
        />
        </PullToRefresh>
      </div>

      {displayedId ? (
        <div
          ref={detailRef}
          className="orders-pane orders-detail page-scroll absolute inset-0 overflow-y-auto overflow-x-hidden bg-[#f8f9fa]"
          role="region"
          aria-label={tt("Email")}
          data-email-detail={rowOf(displayedId)}
          data-arrival="list"
          data-leaving={openId ? undefined : ""}
          inert={!openId}
          aria-hidden={!openId || undefined}
        >
          <EmailDetail key={displayedId} seed={seedFor(rowOf(displayedId))} onBack={onBack} onAction={onEmailAction} onNotice={onNotice} />
        </div>
      ) : null}

      <ComposeDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.type === "campaign" ? tt("Delete this email?") : confirm?.type === "flow" ? tt("Delete this automation?") : tt("Turn off {value}?", { value: flows.find((f) => f.id === confirm?.id)?.name ?? tt("this automation") })}
        footer={
          <>
            <button type="button" className={buttonSecondary} onClick={() => setConfirm(null)}>
              {tt("Cancel")}
            </button>
            <button type="button" className={cn(buttonPrimary, "bg-[#b42318] hover:bg-[#9b1c14] active:bg-[#861912]")} onClick={() => void confirmDelete()}>
              {confirm?.type === "flow-off" ? tt("Turn off") : tt("Delete")}
            </button>
          </>
        }
      >
        <p className="text-[14px] text-[#1a1a2e]">
          {confirm?.type === "campaign"
            ? tt("It is removed with its numbers. Anything already sent stays in people's inboxes.")
            : confirm?.type === "flow"
              ? tt("Everyone partway through it gets nothing more, and it is removed.")
              : (() => {
                  const n = flows.find((f) => f.id === confirm?.id)?.totals?.in_progress ?? 0
                  return tt("{n, plural, one {# person is} other {# people are}} partway through. Turning it off stops them where they are, and their remaining emails are not sent, now or if you turn it on again.", { n })
                })()}
        </p>
      </ComposeDialog>
    </div>
  )
}

