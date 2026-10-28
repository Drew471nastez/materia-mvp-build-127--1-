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
 *   ?tab=<tab>               replaced, not pushed, so back does not walk
 *                            through every tab. Next.js syncs history.pushState
 *                            and replaceState into useSearchParams without
 *                            asking the server for anything (a router.replace
 *                            would fetch the page again for a query change).
 *
 * TABS ARE READ ONCE (components/email/emails-cache.ts). The tab that is
 * open shows what was read before at once and reads again behind it; once it
 * has loaded, the other tabs are read while the browser is idle, so a switch
 * rarely waits. Each tab keeps its own scroll position.
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
import { createClient } from "@/lib/supabase/client"
import { sourceView } from "@/lib/contacts/contact-source"
import { viewerTimeZone } from "@/lib/orders/time-zone"
import { boundsOf, resolveValue, todayIn, type RangeValue } from "@/lib/date-range/range"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { buttonPrimary, buttonSecondary } from "../orders/order-parts"
import { markRow, moveOrder, stillOrder } from "../orders/order-motion"
import { holdLanding, isTraversing } from "@/lib/ui/app-navigation"
import { backThen } from "@/lib/navigation/go-back"
import { EmailsHome, type CampaignRow, type EmailsTab, type FlowRow, type MessageRow, type SubscriberRow } from "./emails-home"
import type { CustomerEmailsData } from "@/components/app/settings/customer-emails-panel"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { ContactPage } from "./contact-detail"
import { MessagePage } from "./message-detail"
import { EmailDetail, type EmailAction, type EmailSeed } from "./email-detail"
import { TABS, campaignKey, isTab, loadReport, loadTab, reportKey, tabKey, type MessagesData, type SentData, type SubscribersData } from "./emails-data"
import { noteListAddress } from "./list-return"
import { openLayer } from "./layer-nav"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"

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

export function EmailsClient({ initialTab }: { initialTab: EmailsTab }) {
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

  /* ── The tab ─────────────────────────────────────────────────────────── */
  const urlTab = searchParams.get("tab")
  const [tab, setTabState] = React.useState<EmailsTab>(isTab(urlTab) ? urlTab : initialTab)
  /* The browser's own back and forward between tabs a link opened. */
  React.useEffect(() => {
    if (isTab(urlTab) && urlTab !== tab) setTabState(urlTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab])

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

  const current = useCached<unknown>(keyFor(tab), loaderFor(tab))
  /* Pull to refresh: the open tab is read again and the spinner waits for it; the other tabs are marked old, read when next opened. */
  const onPullRefresh = React.useCallback(async () => {
    await load(keyFor(tab), loaderFor(tab))
    refresh(...TABS.filter((t) => t !== tab).map(keyFor))
  }, [tab, keyFor, loaderFor])

  /* Once the open tab has what it needs, the others are read while the browser is idle. */
  const warmed = React.useRef(false)
  React.useEffect(() => {
    if (warmed.current || current.loading) return
    warmed.current = true
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }
    const idle = (fn: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(fn, { timeout: 1500 }) : window.setTimeout(fn, 300))
    idle(() => {
      for (const t of TABS) if (t !== tab) prefetch(keyFor(t), loaderFor(t), 60_000)
    })
  }, [current.loading, tab, keyFor, loaderFor])

  /* ── Each tab keeps its own scroll position ──────────────────────────── */
  const listRef = React.useRef<HTMLDivElement>(null)
  const scrolls = React.useRef(new Map<EmailsTab, number>())
  const setTab = (next: EmailsTab) => {
    if (next === tab) return
    scrolls.current.set(tab, listRef.current?.scrollTop ?? 0)
    setTabState(next)
    writeAddress((p) => p.set("tab", next), "replace")
  }
  const tabShown = React.useRef(false)
  React.useLayoutEffect(() => {
    const pane = listRef.current
    if (!pane) return
    /*
      NOT ON THE FIRST DRAW. A switch of tab places the scroll; the page's
      first draw does not. On a return the stage has already put the list
      back where it was left (components/app/app-stage.tsx), and this ran
      straight after it with no scroll kept for the tab (the map is new with
      the page), so a list left below the point where the bar sticks came
      back pulled up to that point: the page jumped on the way back.
    */
    if (!tabShown.current) {
      tabShown.current = true
      return
    }
    /*
      THE BAR DOES NOT MOVE. While the bar is still in its place under the
      announcement, the scroll is left alone and only the content changes.
      Once it is stuck to the top, the new tab opens where it was left, or
      at its start, but never above the point where the bar sticks: that
      would drop the bar back down, and the tabs would jump under the finger.
      The content is at least a pane tall (min-h-full), so that point can
      always be reached.
    */
    /*
      Where the bar sticks: where it sits at rest, measured from what holds it
      still. Not its own offsetTop, which a stuck bar reports where it is
      stuck. The end of what is just above it, or, when it comes first in
      its wrapper (the pull to refresh's, under the Try Pro strip), the top
      of that wrapper's content. It used to read the sibling alone, found
      none there, took 0, and a switch while scrolled threw the page back to
      its top with the bar dropping down under the strip.
    */
    const bar = pane.querySelector<HTMLElement>("[data-orders-bar]")
    const above = bar?.previousElementSibling as HTMLElement | null
    const holder = above ? null : bar?.parentElement ?? null
    const paneTop = pane.getBoundingClientRect().top - pane.scrollTop
    const stick = above
      ? Math.round(above.getBoundingClientRect().bottom - paneTop)
      : holder
        ? Math.round(holder.getBoundingClientRect().top - paneTop + (parseFloat(getComputedStyle(holder).paddingTop) || 0))
        : 0
    const saved = scrolls.current.get(tab)
    if (pane.scrollTop >= stick && stick >= 0) pane.scrollTop = Math.max(saved ?? stick, stick)
  }, [tab])

  /*
    THE PANE'S HEIGHT, MEASURED ONCE. A tab's content is at least a pane
    tall (emails-home), so the point where the bar sticks can always be
    reached. A percentage cannot say that through the pull's wrapper, which
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
  const subscribersData = (tab === "subscribers" ? current.data : peek(keyFor("subscribers"))) as SubscribersData | undefined
  const messagesData = (tab === "messages" ? current.data : peek(keyFor("messages"))) as MessagesData | undefined
  const flows = ((tab === "flows" ? current.data : peek(keyFor("flows"))) as FlowRow[] | undefined) ?? []
  const customerEmails = (tab === "customer" ? current.data : peek(keyFor("customer"))) as CustomerEmailsData | undefined
  const physical = usePhysicalCommerceEnabled()
  const sentData = (tab === "published" ? current.data : undefined) as SentData | undefined
  const campaigns: CampaignRow[] =
    tab === "published" ? sentData?.campaigns ?? [] : tab === "scheduled" || tab === "drafts" ? ((current.data as CampaignRow[] | undefined) ?? []) : []

  const [search, setSearch] = React.useState("")

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

  /* ── An email, or a contact, over the list ──────────────────────────── */
  /*
    One page at a time over the list: an email (?email=<id>) or a subscriber
    (?contact=<id>). Both are one key, "email:<id>" or "contact:<id>", so the
    move, the leaving page and Back are the same code for either.
  */
  const emailParam = searchParams.get("email")
  const contactParam = emailParam ? null : searchParams.get("contact")
  /* A message from a website's contact form (?message=<id>), the bell's and the creator's email's link to it. */
  const messageParam = emailParam || contactParam ? null : searchParams.get("message")
  const openId = emailParam ? `email:${emailParam}` : contactParam ? `contact:${contactParam}` : messageParam ? `message:${messageParam}` : null
  /* The row a page key came from: "email:<id>" and "contact:<id>" both mark row <id>. */
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
    const lists = [peek<SentData>(keyFor("published"))?.campaigns, peek<CampaignRow[]>(keyFor("scheduled")), peek<CampaignRow[]>(keyFor("drafts")), campaigns]
    for (const list of lists) {
      const row = list?.find((c) => c.id === id)
      if (row) return { id, subject: row.subject, status: row.status ?? (tab === "scheduled" ? "scheduled" : tab === "drafts" ? "draft" : "sent"), sent_at: row.sent_at, scheduled_at: row.scheduled_at }
    }
    const r = peek<{ campaign: { subject: string; status: string } }>(reportKey(id))
    return { id, subject: r?.campaign.subject ?? "", status: r?.campaign.status }
  }

  const onOpen = (c: CampaignRow) => {
    prefetch(reportKey(c.id), () => loadReport(c.id))
    pushed.current = true
    writeAddress((p) => { p.delete("contact"); p.set("email", c.id) }, "push")
  }
  const onOpenMessage = (m: MessageRow) => {
    pushed.current = true
    writeAddress((p) => { p.delete("email"); p.delete("contact"); p.set("message", m.id) }, "push")
  }
  const onOpenContact = (s: SubscriberRow) => {
    pushed.current = true
    writeAddress((p) => { p.delete("email"); p.set("contact", s.id) }, "push")
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
  const closeOver = () => writeAddress((p) => { p.delete("email"); p.delete("contact"); p.delete("message") }, "replace")
  const onBack = React.useCallback(() => {
    if (pushed.current) backThen(closeOver)
    else closeOver()
  }, [])

  const onCampaignIntent = (c: CampaignRow) => {
    if (tab === "drafts") {
      router.prefetch(`/app/emails/edit/${c.id}`)
      prefetch(campaignKey(c.id), () => fetch(`/api/email/campaigns/${c.id}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("not ok")))), 5_000)
    } else {
      prefetch(reportKey(c.id), () => loadReport(c.id), 15_000)
    }
  }

  /* ── Actions ────────────────────────────────────────────────────────── */
  const copyEmail = (email: string) => {
    void navigator.clipboard?.writeText(email).then(
      () => onNotice(tt("Email copied")),
      () => onNotice(tt("Could not copy the email")),
    )
  }
  const [confirm, setConfirm] = React.useState<{ type: "campaign" | "subscriber" | "flow" | "flow-off" | "message"; id: string } | null>(null)

  const refreshCampaignLists = () => {
    refresh(...ALL_EMAIL_LISTS, keyFor("published"))
  }

  const duplicate = async (id: string): Promise<string | null> => {
    const newId = uuid()
    const r = await postJson(`/api/email/campaigns/${id}/duplicate`, { id: newId })
    if (!r.ok) return String(r.data.error ?? "Could not make a copy. Try again.")
    refresh("emails:drafts")
    router.push(`/app/emails/edit/${String((r.data.campaign as { id?: string } | undefined)?.id ?? newId)}`)
    return null
  }

  const deleteCampaign = async (id: string): Promise<string> => {
    const { error } = await createClient().from("email_campaigns").delete().eq("id", id)
    if (error) return tt("The email was not deleted. Try again.")
    for (const key of ALL_EMAIL_LISTS) write<CampaignRow[]>(key, (prev) => (prev ?? []).filter((c) => c.id !== id))
    write<SentData | undefined>(keyFor("published"), (prev) => (prev ? { ...prev, campaigns: prev.campaigns.filter((c) => c.id !== id) } : prev))
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

  /*
    A MESSAGE, READ OR NEW. Through the server, which changes the creator's
    own message only (app/api/email/messages/[id]); the row changes at once
    and goes back if the server says no.
  */
  const writeMessages = (fn: (rows: MessageRow[]) => MessageRow[]) =>
    write<MessagesData>(keyFor("messages"), (prev) => (prev ? { ...prev, rows: fn(prev.rows) } : prev!))
  const setRead = async (m: MessageRow, read: boolean, quiet = false) => {
    const before = m.read_at
    const at = read ? new Date().toISOString() : null
    writeMessages((rows) => rows.map((r) => (r.id === m.id ? { ...r, read_at: at } : r)))
    const res = await fetch(`/api/email/messages/${encodeURIComponent(m.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read }),
    }).catch(() => null)
    if (!res || !res.ok) {
      writeMessages((rows) => rows.map((r) => (r.id === m.id ? { ...r, read_at: before } : r)))
      if (!quiet) onNotice(tt("Not saved. Try again."))
      return
    }
    if (!quiet) onNotice(read ? tt("Marked as read") : tt("Marked as new"))
  }
  const toggleRead = (m: MessageRow) => void setRead(m, !m.read_at)
  const deleteMessage = async (id: string) => {
    const res = await fetch(`/api/email/messages/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null)
    if (!res || !res.ok) return onNotice(tt("Not deleted. Try again."))
    writeMessages((rows) => rows.filter((r) => r.id !== id))
    if (messageParam === id) onBack()
    onNotice(tt("Message deleted"))
  }
  /* Opening a new message reads it. */
  const openedMessage = messageParam ? (messagesData?.rows ?? []).find((r) => r.id === messageParam) ?? null : null
  React.useEffect(() => {
    if (openedMessage && !openedMessage.read_at) void setRead(openedMessage, true, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedMessage?.id, openedMessage?.read_at])
  /* A link to a message on another tab, or a reload: its list is read so the page has it. */
  React.useEffect(() => {
    if (messageParam && !messagesData) prefetch(keyFor("messages"), loaderFor("messages"))
  }, [messageParam, messagesData, keyFor, loaderFor])

  const removeSubscriber = async (id: string) => {
    const { error } = await createClient().from("subscribers").update({ is_active: false, status: "unsubscribed" }).eq("id", id)
    if (error) return onNotice(tt("Not removed. Try again."))
    write<SubscribersData>(keyFor("subscribers"), (prev) => (prev ? { ...prev, rows: prev.rows.map((s) => (s.id === id ? { ...s, status: "unsubscribed" } : s)) } : prev!))
    onNotice(tt("Subscriber removed"))
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

  /** Every subscribed address as a CSV, named for today. */
  const exportSubscribers = async () => {
    const rows = (subscribersData?.rows ?? []).filter((s) => s.status === "subscribed")
    if (rows.length === 0) return onNotice(tt("There are no subscribers to export"))
    const headers = [tt("Email"), tt("Name"), tt("Source"), tt("Source detail"), tt("Status"), tt("Subscribed Date")]
    const lines = rows.map((s) => {
      const v = sourceView(s.source_detail, s.source)
      return [s.email, s.name || "", v.label, v.detail, s.status === "subscribed" && s.unsubscribed_at ? "resubscribed" : s.status, s.subscribed_at ? new Date(s.subscribed_at).toLocaleDateString(appLocale(), zoned()) : ""]
    })
    const csv = [headers, ...lines].map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `subscribers-${new Date().toISOString().split("T")[0]}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    onNotice(tt("Exported {value} subscribers", { value: rows.length.toLocaleString(appLocale()) }))
  }

  const confirmDelete = async () => {
    const target = confirm
    setConfirm(null)
    if (!target) return
    if (target.type === "campaign") onNotice(await deleteCampaign(target.id))
    else if (target.type === "flow") await deleteFlow(target.id)
    else if (target.type === "message") await deleteMessage(target.id)
    else if (target.type === "flow-off") {
      const flow = flows.find((f) => f.id === target.id)
      if (flow) await toggleFlow(flow, true)
    }
    else await removeSubscriber(target.id)
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
          tab={tab}
          onTab={setTab}
          onTabIntent={(t) => prefetch(keyFor(t), loaderFor(t), 30_000)}
          loading={current.loading}
          subscribers={subscribersData?.rows ?? []}
          checkoutBuyersCount={subscribersData?.buyers ?? 0}
          customerEmails={customerEmails ?? null}
          physical={physical}
          search={search}
          onSearch={setSearch}
          onExportSubscribers={() => void exportSubscribers()}
          onCopyEmail={copyEmail}
          onRemoveSubscriber={(id) => setConfirm({ type: "subscriber", id })}
          messages={messagesData?.rows ?? []}
          messagesAvailable={messagesData?.available ?? true}
          onOpenMessage={onOpenMessage}
          onToggleRead={toggleRead}
          onDeleteMessage={(id) => setConfirm({ type: "message", id })}
          flows={flows}
          onToggleFlow={(f) => void toggleFlow(f)}
          onDeleteFlow={(id) => setConfirm({ type: "flow", id })}
          onDuplicateFlow={(f) => void duplicateFlow(f)}
          campaigns={campaigns}
          onOpenCampaign={onOpen}
          onOpenContact={onOpenContact}
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
          aria-label={displayedId.startsWith("contact:") ? tt("Contact") : displayedId.startsWith("message:") ? tt("Message") : tt("Email")}
          data-email-detail={displayedId.startsWith("email:") ? rowOf(displayedId) : undefined}
          data-contact-page={displayedId.startsWith("contact:") ? rowOf(displayedId) : undefined}
          data-message-page={displayedId.startsWith("message:") ? rowOf(displayedId) : undefined}
          data-arrival="list"
          data-leaving={openId ? undefined : ""}
          inert={!openId}
          aria-hidden={!openId || undefined}
        >
          {displayedId.startsWith("message:") ? (
            <MessagePage
              key={displayedId}
              message={(messagesData?.rows ?? []).find((r) => r.id === rowOf(displayedId)) ?? null}
              gone={!!messagesData && !(messagesData.rows ?? []).some((r) => r.id === rowOf(displayedId))}
              onBack={onBack}
              onCopy={copyEmail}
              onToggleRead={toggleRead}
              onDelete={(id) => setConfirm({ type: "message", id })}
              onOpenContact={(m) => {
                if (!m.subscriber_id) return
                const id = m.subscriber_id
                writeAddress((p) => { p.delete("message"); p.set("contact", id) }, "replace")
              }}
            />
          ) : displayedId.startsWith("contact:") ? (
            <ContactPage
              key={displayedId}
              contact={(subscribersData?.rows ?? []).find((r) => r.id === rowOf(displayedId)) ?? null}
              onBack={onBack}
              onCopy={copyEmail}
              onRemove={(id) => setConfirm({ type: "subscriber", id })}
            />
          ) : (
            <EmailDetail key={displayedId} seed={seedFor(rowOf(displayedId))} onBack={onBack} onAction={onEmailAction} onNotice={onNotice} />
          )}
        </div>
      ) : null}

      <ComposeDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.type === "message" ? tt("Delete this message?") : confirm?.type === "campaign" ? tt("Delete this email?") : confirm?.type === "flow" ? tt("Delete this automation?") : confirm?.type === "flow-off" ? tt("Turn off {value}?", { value: flows.find((f) => f.id === confirm.id)?.name ?? tt("this automation") }) : tt("Remove this subscriber?")}
        footer={
          <>
            <button type="button" className={buttonSecondary} onClick={() => setConfirm(null)}>
              {tt("Cancel")}
            </button>
            <button type="button" className={cn(buttonPrimary, "bg-[#b42318] hover:bg-[#9b1c14] active:bg-[#861912]")} onClick={() => void confirmDelete()}>
              {confirm?.type === "subscriber" ? tt("Remove") : confirm?.type === "flow-off" ? tt("Turn off") : tt("Delete")}
            </button>
          </>
        }
      >
        <p className="text-[14px] text-[#1a1a2e]">
          {confirm?.type === "message"
            ? tt("It is removed from Messages. The email you got about it stays in your inbox, and the sender stays in your contacts.")
            : confirm?.type === "campaign"
            ? tt("It is removed with its numbers. Anything already sent stays in people's inboxes.")
            : confirm?.type === "flow"
              ? tt("Everyone partway through it gets nothing more, and it is removed.")
              : confirm?.type === "flow-off"
                ? (() => {
                    const n = flows.find((f) => f.id === confirm.id)?.totals?.in_progress ?? 0
                    return tt("{n, plural, one {# person is} other {# people are}} partway through. Turning it off stops them where they are, and their remaining emails are not sent, now or if you turn it on again.", { n })
                  })()
              : tt("They are unsubscribed and get no more of your emails.")}
        </p>
      </ComposeDialog>
    </div>
  )
}

