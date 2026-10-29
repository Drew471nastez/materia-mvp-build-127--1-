"use client"

/**
 * ===========================================================================
 *  SETTINGS, NOTIFICATIONS
 * ===========================================================================
 * What reaches the person's phone and browser, and what comes by email, in
 * five short cards, read once from GET /api/me/push:
 *
 *   PUSH            the one switch for all of it (components/account/push-
 *                   switch-row.tsx); in the Storelib app the phone's own
 *                   permission under it, asked for only when the person
 *                   turns push on or taps Allow (lib/native-push.ts), the
 *                   answer said in a line and a "no" explained with where to
 *                   change it in the phone's settings; in a browser, "This
 *                   browser" (lib/push/web-client.ts), which subscribes or
 *                   unsubscribes this browser and says why when it cannot.
 *   WHAT TO PUSH    one switch per kind (lib/notifications/push-kinds.ts),
 *                   live only while the main switch is on. Each saves on the
 *                   press, one save at a time, so two quick taps never undo
 *                   each other on the server.
 *   QUIET HOURS     a stretch of the night with no pushes, and the day's
 *                   limit said in one line (lib/notifications/push-budget.ts).
 *   COMMUNITIES     each community the person is in: its level (the same
 *                   choice as in the community, PATCH /api/community/<id>/
 *                   me) and the kinds turned off there alone.
 *   EMAIL           the weekly digest they may ask for, and for someone who
 *                   reviews reports, the daily report summary. A line says
 *                   what always comes by email (lib/notify/email-budget.ts).
 *
 * Everything still lands in the bell; this is only what interrupts. The
 * browser's time zone is saved quietly when it differs, so quiet hours and
 * the daily limit follow the person's own clock.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { PrivacyRow, Saved, Switch } from "@/components/app/settings/account-panels"
import { PUSH_ROUTE, PushSwitchRow } from "@/components/account/push-switch-row"
import { pushStateFrom } from "@/lib/account/push-state"
import { askPushPermission, inNativeApp, nativePlatform, openPhoneSettings, phoneSettingsPath, readPushPermission, type PushPermission } from "@/lib/native-push"
import { DAILY_PUSH_CAP, DIGEST_HOUR } from "@/lib/notifications/push-budget"
import { COMMUNITY_KIND_KEYS, PUSH_KINDS, clockText, type CommunityKindKey, type PushKindKey, type QuietHours } from "@/lib/notifications/push-kinds"
import { WebPushError, disableWebPush, enableWebPush, readWebPush, type WebPushState } from "@/lib/push/web-client"
import { cn } from "@/lib/utils"

const CARD = "bg-white rounded-2xl app-card-x py-4 sm:py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e7eb]/60"
const CARD_TITLE = "text-[15px] font-semibold text-[#1a1a2e]"
const INK =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] px-4 text-[14px] font-medium text-white " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(15,23,42,0.18)] transition-colors hover:bg-[#2a2a40] active:bg-[#111122] disabled:cursor-not-allowed disabled:opacity-50 sm:text-[13px]"
const QUIET_BUTTON =
  "inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[#f3f4f6] px-4 text-[13px] font-medium text-[#374151] transition-colors hover:bg-[#e5e7eb] disabled:opacity-60"
const SELECT =
  "h-10 min-w-0 appearance-none rounded-xl border border-[#e5e7eb] bg-white bg-[length:16px] bg-[right_10px_center] bg-no-repeat pl-3 pr-8 text-[14px] text-[#1a1a2e] " +
  "shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-[#d1d5db] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111113]/20 disabled:opacity-50 sm:text-[13px]"
/* A small chevron drawn in the select's own background, so the native control keeps its own picker on a phone. */
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236b7280'%3E%3Cpath d='M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z'/%3E%3C/svg%3E")`

type Level = "all" | "important" | "mentions" | "none"
const LEVELS: { key: Level; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "important", label: "Everything but likes" },
  { key: "mentions", label: "Only mentions and replies" },
  { key: "none", label: "Nothing" },
]

export interface CommunityChoice {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  level: Level
  kinds: Record<CommunityKindKey, boolean>
}

interface Loaded {
  enabled: boolean | "not_yet"
  devices: number
  kinds: Record<PushKindKey, boolean>
  reportEmail: boolean
  weeklyEmail: boolean
  moderates: boolean
  quiet: QuietHours | null
  tz: string | null
  communities: CommunityChoice[]
}

const isLevel = (v: unknown): v is Level => v === "all" || v === "important" || v === "mentions" || v === "none"

function loadedFrom(status: number, body: unknown): Loaded | null {
  const enabled = pushStateFrom(status, body)
  if (enabled === null) return null
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const raw = (b.kinds && typeof b.kinds === "object" ? b.kinds : {}) as Record<string, unknown>
  const kinds = Object.fromEntries(PUSH_KINDS.map((k) => [k.key, raw[k.key] !== false])) as Record<PushKindKey, boolean>
  const emails = (b.emails && typeof b.emails === "object" ? b.emails : {}) as Record<string, unknown>
  const q = (b.quiet && typeof b.quiet === "object" ? b.quiet : null) as { from?: unknown; to?: unknown } | null
  const quiet = q && typeof q.from === "number" && typeof q.to === "number" ? { from: q.from, to: q.to } : null
  const communities = (Array.isArray(b.communities) ? b.communities : [])
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string" && typeof (c as { name?: unknown }).name === "string")
    .map((c) => {
      const k = (c.kinds && typeof c.kinds === "object" ? c.kinds : {}) as Record<string, unknown>
      return {
        id: c.id as string,
        name: c.name as string,
        slug: typeof c.slug === "string" ? c.slug : "",
        logoUrl: typeof c.logoUrl === "string" ? c.logoUrl : null,
        level: isLevel(c.level) ? c.level : "important",
        kinds: Object.fromEntries(COMMUNITY_KIND_KEYS.map((key) => [key, k[key] !== false])) as Record<CommunityKindKey, boolean>,
      }
    })
  return {
    enabled,
    devices: typeof b.devices === "number" ? b.devices : 0,
    kinds,
    reportEmail: emails.report_digest !== false,
    weeklyEmail: emails.weekly_digest === true,
    moderates: b.moderates === true,
    quiet,
    tz: typeof b.tz === "string" ? b.tz : null,
    communities,
  }
}

/* One save at a time for everything kept on the account, in the order it was pressed. */
let chain: Promise<unknown> = Promise.resolve()
async function saveKinds(body: Record<string, unknown>, url: string = PUSH_ROUTE): Promise<void> {
  const run = chain.then(async () => {
    let res: Response
    try {
      res = await fetch(url, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    } catch {
      throw new Error("Could not reach Storelib. Check your connection and try again.")
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw new Error((data && typeof data.error === "string" && data.error) || "That did not save. Try again.")
    }
  })
  chain = run.catch(() => undefined)
  return run
}

function browserZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

/*
  READ AHEAD, USED ONCE (round 17). Settings reads these switches while the person is still on another section
  (warmNotifications, account-settings.tsx), so pressing the Notifications pill draws them at once instead of a skeleton and
  a jump when they arrive. A warm answer is used by one screen only and only while it is fresh: every later visit reads again,
  so a switch changed on another device is never shown as it was.
*/
const WARM_MS = 60_000
let warm: { at: number; value: Loaded | null; done: boolean; promise: Promise<Loaded | null> } | null = null

function readPush(): Promise<Loaded | null> {
  return fetch(PUSH_ROUTE, { credentials: "include", cache: "no-store" })
    .then(async (res) => loadedFrom(res.status, await res.json().catch(() => null)))
    .catch(() => null)
}

/** Read the switches ahead of the pill, once a minute at most. */
export function warmNotifications() {
  if (warm && Date.now() - warm.at < WARM_MS) return
  const entry: NonNullable<typeof warm> = { at: Date.now(), value: null, done: false, promise: readPush() }
  entry.promise.then((v) => {
    entry.value = v
    entry.done = true
  })
  warm = entry
}

/** The warm read, for one screen: its answer if it is here, its promise if it is on its way, else nothing. */
function takeWarm(): { value: Loaded | null; done: boolean; promise: Promise<Loaded | null> } | null {
  const w = warm
  if (!w || Date.now() - w.at >= WARM_MS) return null
  warm = null
  return w
}

export function NotificationSettings() {
  const [took] = useState(() => (typeof window === "undefined" ? null : takeWarm()))
  const [state, setState] = useState<Loaded | "loading" | "none">(() => (took?.done ? (took.value ?? "none") : "loading"))
  useEffect(() => {
    let live = true
    ;(took ? took.promise : readPush())
      .then((v) => {
        if (!live) return
        setState(v ?? "none")
        /* The person's own clock, kept so quiet hours and the daily limit follow it. Quietly: there is nothing to show. */
        const zone = browserZone()
        if (v && zone && zone !== v.tz) void saveKinds({ tz: zone }).catch(() => undefined)
      })
    return () => {
      live = false
    }
  }, [])

  if (state === "loading") return <NotificationsSkeleton />
  if (state === "none") {
    return (
      <section className={CARD} aria-labelledby="account-notifications" data-account-card="notifications">
        <h2 id="account-notifications" className={cn(CARD_TITLE, "mb-1")}>
          Notifications
        </h2>
        <p className="text-[13px] leading-[1.45] text-[#6b7280]">Your notification settings could not be read. Check your connection and open this again.</p>
      </section>
    )
  }
  return <NotificationCards initial={state} />
}

function NotificationCards({ initial }: { initial: Loaded }) {
  const [on, setOn] = useState(initial.enabled === true)
  const onValue = useCallback((v: boolean) => setOn(v), [])
  const phone = usePhonePermission()

  return (
    <>
      <section className={CARD} aria-labelledby="account-notifications" data-account-card="notifications">
        <h2 id="account-notifications" className={cn(CARD_TITLE, "mb-3")}>
          Push notifications
        </h2>
        <div className="divide-y divide-[#f0f1f3]">
          <PushSwitchRow initial={initial.enabled} onValue={onValue} onTurnedOn={phone.askIfNeeded} />
          {phone.inApp ? <PhoneRow phone={phone} on={on} /> : <BrowserRow on={on} devices={initial.devices} />}
          <TestPushRow />
        </div>
      </section>

      <section className={CARD} aria-labelledby="account-push-kinds" data-account-card="push-kinds">
        <h2 id="account-push-kinds" className={cn(CARD_TITLE, "mb-1")}>
          What to push
        </h2>
        <p className="mb-4 text-[13px] leading-[1.45] text-[#6b7280]">Everything still arrives in your notifications. These choose what also reaches your phone and browser.</p>
        <div className={cn("divide-y divide-[#f0f1f3] transition-opacity duration-200 motion-reduce:transition-none", !on && "opacity-55")} data-push-kinds={on ? "live" : "off"}>
          {PUSH_KINDS.map((k) => (
            <KindRow key={k.key} kind={k.key} label={k.label} detail={k.detail} initial={initial.kinds[k.key]} live={on} />
          ))}
        </div>
      </section>

      <QuietCard initial={initial.quiet} live={on} />

      {initial.communities.length > 0 ? <CommunitiesCard communities={initial.communities} live={on} /> : null}

      <section className={CARD} aria-labelledby="account-notify-email" data-account-card="notify-email">
        <h2 id="account-notify-email" className={cn(CARD_TITLE, "mb-3")}>
          Email
        </h2>
        <div className="divide-y divide-[#f0f1f3]">
          <WeeklyRow initial={initial.weeklyEmail} />
          {initial.moderates ? <EmailRow initial={initial.reportEmail} /> : null}
        </div>
        <p className="mt-3 border-t border-[#f0f1f3] pt-3 text-[12px] leading-[1.5] text-[#6b7280]" data-email-always="">
          Receipts, payments, membership changes and security always come by email. Everything else stays in your notifications and on your phone.
        </p>
      </section>
    </>
  )
}

/* ── The switches ──────────────────────────────────────────────────────── */

function useQueuedSwitch(initial: boolean, body: (v: boolean) => Record<string, unknown>) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState(0)
  const saved = useRef(initial)
  const change = useCallback(
    (v: boolean) => {
      setValue(v)
      setError(null)
      saveKinds(body(v)).then(
        () => {
          saved.current = v
          setSavedAt(Date.now())
        },
        (e: unknown) => {
          setValue(saved.current)
          setError(e instanceof Error ? e.message : "That did not save. Try again.")
        },
      )
    },
    [body],
  )
  return { value, error, savedAt, change }
}

function KindRow({ kind, label, detail, initial, live }: { kind: PushKindKey; label: string; detail: string; initial: boolean; live: boolean }) {
  const s = useQueuedSwitch(initial, useCallback((v: boolean) => ({ push: { [kind]: v } }), [kind]))
  return (
    <PrivacyRow
      id={`push-${kind}`}
      title={
        <>
          {label}
          <Saved at={s.savedAt} />
        </>
      }
      detail={
        <>
          {detail}
          {s.error && <span className="mt-1 block text-red-600">{s.error}</span>}
        </>
      }
      control={<Switch id={`push-kind-${kind}`} label={label} checked={live && s.value} disabled={!live} onChange={s.change} />}
    />
  )
}

function EmailRow({ initial }: { initial: boolean }) {
  const s = useQueuedSwitch(initial, useCallback((v: boolean) => ({ email: { report_digest: v } }), []))
  return (
    <PrivacyRow
      id="report-digest"
      title={
        <>
          Daily report summary
          <Saved at={s.savedAt} />
        </>
      }
      detail={
        <>
          One email a day at most, when members report something in a community you moderate. Each report also shows in your notifications right away.
          {s.error && <span className="mt-1 block text-red-600">{s.error}</span>}
        </>
      }
      control={<Switch id="report-digest-switch" label="Daily report summary" checked={s.value} onChange={s.change} />}
    />
  )
}

function WeeklyRow({ initial }: { initial: boolean }) {
  const s = useQueuedSwitch(initial, useCallback((v: boolean) => ({ email: { weekly_digest: v } }), []))
  return (
    <PrivacyRow
      id="weekly-digest"
      title={
        <>
          Weekly digest
          <Saved at={s.savedAt} />
        </>
      }
      detail={
        <>
          Monday morning: new posts, the most liked one and what is coming up in your communities. Only weeks with something new.
          {s.error && <span className="mt-1 block text-red-600">{s.error}</span>}
        </>
      }
      control={<Switch id="weekly-digest-switch" label="Weekly digest" checked={s.value} onChange={s.change} />}
    />
  )
}

/* ── Quiet hours ───────────────────────────────────────────────────────── */

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i * 30)
const DEFAULT_QUIET: QuietHours = { from: 22 * 60, to: 8 * 60 }

function QuietCard({ initial, live }: { initial: QuietHours | null; live: boolean }) {
  const [quiet, setQuiet] = useState<QuietHours | null>(initial)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState(0)
  const saved = useRef<QuietHours | null>(initial)
  const last = useRef<QuietHours>(initial ?? DEFAULT_QUIET)
  const fromId = useId()
  const toId = useId()

  const save = useCallback((next: QuietHours | null) => {
    setQuiet(next)
    if (next) last.current = next
    setError(null)
    saveKinds({ quiet: next }).then(
      () => {
        saved.current = next
        setSavedAt(Date.now())
      },
      (e: unknown) => {
        setQuiet(saved.current)
        setError(e instanceof Error ? e.message : "That did not save. Try again.")
      },
    )
  }, [])

  const set = (part: "from" | "to", minutes: number) => {
    const next = { ...(quiet ?? last.current), [part]: minutes }
    /* The same start and end would be no quiet time at all: the other end moves half an hour on. */
    if (next.from === next.to) next[part === "from" ? "to" : "from"] = (minutes + 30) % 1440
    save(next)
  }
  const shown = quiet ?? last.current

  return (
    <section className={CARD} aria-labelledby="account-quiet" data-account-card="quiet-hours">
      <h2 id="account-quiet" className={cn(CARD_TITLE, "mb-3")}>
        Quiet hours
      </h2>
      <div className={cn("transition-opacity duration-200 motion-reduce:transition-none", !live && "opacity-55")}>
        <PrivacyRow
          id="quiet"
          title={
            <>
              Pause pushes overnight
              <Saved at={savedAt} />
            </>
          }
          detail={
            <>
              <span data-quiet-detail="">{quiet ? `Nothing from ${clockText(quiet.from)} to ${clockText(quiet.to)}, then one summary.` : "Pushes can arrive at any hour."}</span>
              {error && <span className="mt-1 block text-red-600">{error}</span>}
            </>
          }
          control={<Switch id="quiet-switch" label="Pause pushes overnight" checked={!!quiet} disabled={!live} onChange={(v) => save(v ? last.current : null)} />}
        />
        <div className={cn("grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none", quiet ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")} data-quiet-times={quiet ? "open" : "closed"} aria-hidden={!quiet}>
          <div className="overflow-hidden">
            <div className="flex items-center gap-2 pb-0.5 pt-3">
              <label htmlFor={fromId} className="sr-only">
                Quiet from
              </label>
              <select id={fromId} data-quiet-from="" disabled={!quiet || !live} tabIndex={quiet ? 0 : -1} className={cn(SELECT, "flex-1 sm:w-[120px] sm:flex-none")} style={{ backgroundImage: CHEVRON }} value={shown.from} onChange={(e) => set("from", Number(e.target.value))}>
                {HALF_HOURS.map((m) => (
                  <option key={m} value={m}>
                    {clockText(m)}
                  </option>
                ))}
              </select>
              <span className="shrink-0 px-0.5 text-[13px] text-[#6b7280]">to</span>
              <label htmlFor={toId} className="sr-only">
                Quiet until
              </label>
              <select id={toId} data-quiet-to="" disabled={!quiet || !live} tabIndex={quiet ? 0 : -1} className={cn(SELECT, "flex-1 sm:w-[120px] sm:flex-none")} style={{ backgroundImage: CHEVRON }} value={shown.to} onChange={(e) => set("to", Number(e.target.value))}>
                {HALF_HOURS.map((m) => (
                  <option key={m} value={m}>
                    {clockText(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 border-t border-[#f0f1f3] pt-3 text-[12px] leading-[1.5] text-[#6b7280]" data-daily-limit="">
        After {DAILY_PUSH_CAP} pushes in a day, likes and other updates wait for one summary around {clockText(DIGEST_HOUR * 60)}. Mentions, replies and messages still come through.
      </p>
    </section>
  )
}

/* ── Communities ───────────────────────────────────────────────────────── */

const COMMUNITY_KIND_WORDS: Record<CommunityKindKey, string> = {
  mentions: "Mentions",
  comments: "Replies and comments",
  admin_posts: "Posts from owners and admins",
  posts: "Posts from members",
  events: "Events",
  programs: "Programs and lessons",
  likes: "Likes",
  messages: "Messages",
}

function CommunitiesCard({ communities, live }: { communities: CommunityChoice[]; live: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <section className={CARD} aria-labelledby="account-notify-communities" data-account-card="notify-communities">
      <h2 id="account-notify-communities" className={cn(CARD_TITLE, "mb-1")}>
        Communities
      </h2>
      <p className="mb-2 text-[13px] leading-[1.45] text-[#6b7280]">How much each community tells you, and what it may push.</p>
      <ul className="divide-y divide-[#f0f1f3]">
        {communities.map((c) => (
          <CommunityRow key={c.id} c={c} open={open === c.id} onToggle={() => setOpen((o) => (o === c.id ? null : c.id))} live={live} />
        ))}
      </ul>
    </section>
  )
}

function CommunityMark({ c }: { c: Pick<CommunityChoice, "name" | "logoUrl"> }) {
  if (c.logoUrl) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img src={c.logoUrl} alt="" width={32} height={32} loading="lazy" decoding="async" className="h-8 w-8 shrink-0 rounded-lg object-cover shadow-[0_0_0_1px_rgba(15,23,42,0.06)]" />
  }
  return (
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f3f4f6] text-[13px] font-semibold text-[#374151] shadow-[0_0_0_1px_rgba(15,23,42,0.05)]">
      {(c.name.trim()[0] || "C").toUpperCase()}
    </span>
  )
}

function CommunityRow({ c, open, onToggle, live }: { c: CommunityChoice; open: boolean; onToggle: () => void; live: boolean }) {
  const [level, setLevel] = useState<Level>(c.level)
  const [kinds, setKinds] = useState<Record<CommunityKindKey, boolean>>(c.kinds)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState(0)
  /* Drawn from the first open on, so closing it again folds real content rather than an empty box. */
  const [drawn, setDrawn] = useState(false)
  const saved = useRef<Level>(c.level)
  const panelId = useId()
  const selectId = useId()
  useEffect(() => {
    if (open) setDrawn(true)
  }, [open])
  const changeLevel = (next: Level) => {
    setLevel(next)
    setError(null)
    saveKinds({ notifyLevel: next }, `/api/community/${encodeURIComponent(c.id)}/me`).then(
      () => {
        saved.current = next
        setSavedAt(Date.now())
      },
      (e: unknown) => {
        setLevel(saved.current)
        setError(e instanceof Error ? e.message : "That did not save. Try again.")
      },
    )
  }
  const onKind = useCallback((k: CommunityKindKey, v: boolean) => setKinds((had) => (had[k] === v ? had : { ...had, [k]: v })), [])
  const levelWord = LEVELS.find((l) => l.key === level)?.label ?? "Everything but likes"
  const off = COMMUNITY_KIND_KEYS.filter((k) => !kinds[k]).length
  return (
    <li data-notify-community={c.id}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="-mx-2 flex min-h-[52px] w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[#f9fafb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111113]/20"
        data-notify-community-toggle=""
      >
        <CommunityMark c={c} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium leading-[1.35] text-[#1a1a2e]">{c.name}</span>
          <span className="block truncate text-[12.5px] leading-[1.4] text-[#6b7280]" data-community-summary="">
            {levelWord}
            {off > 0 && level !== "none" ? `, ${off} off here` : ""}
            <Saved at={savedAt} />
          </span>
        </span>
        <ChevronDown aria-hidden="true" className={cn("h-4 w-4 shrink-0 text-[#9ca3af] transition-[rotate] duration-200 motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      <div id={panelId} className={cn("grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")} aria-hidden={!open} inert={!open} data-community-panel={open ? "open" : "closed"}>
        <div className="overflow-hidden">
          {open || drawn ? (
            <div className="mb-3 mt-1 rounded-xl bg-[#f8f9fa] px-3.5 py-3 shadow-[inset_0_0_0_1px_rgba(229,231,235,0.7)]">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label htmlFor={selectId} className="text-[13px] font-medium text-[#1a1a2e]">
                  Notify me about
                </label>
                <select id={selectId} data-community-level="" className={cn(SELECT, "w-full sm:w-[240px]")} style={{ backgroundImage: CHEVRON }} value={level} onChange={(e) => changeLevel(e.target.value as Level)}>
                  {LEVELS.map((l) => (
                    <option key={l.key} value={l.key}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
              {level !== "none" ? (
                <div className={cn("mt-2 divide-y divide-[#eceef1] transition-opacity duration-200 motion-reduce:transition-none", !live && "opacity-55")}>
                  {COMMUNITY_KIND_KEYS.map((k) => (
                    <CommunityKindRow key={k} communityId={c.id} kind={k} initial={kinds[k]} live={live} onValue={onKind} />
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[13px] leading-[1.45] text-[#6b7280]">Nothing from {c.name} will reach your notifications or your phone.</p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function CommunityKindRow({ communityId, kind, initial, live, onValue }: { communityId: string; kind: CommunityKindKey; initial: boolean; live: boolean; onValue: (k: CommunityKindKey, v: boolean) => void }) {
  const s = useQueuedSwitch(initial, useCallback((v: boolean) => ({ community: { id: communityId, push: { [kind]: v } } }), [communityId, kind]))
  useEffect(() => onValue(kind, s.value), [kind, s.value, onValue])
  const label = COMMUNITY_KIND_WORDS[kind]
  return (
    <div data-privacy-row={`community-${kind}`} className="flex items-center justify-between gap-4 py-0.5">
      <p className="min-w-0 text-[13.5px] leading-[1.4] text-[#374151]">
        {label}
        <Saved at={s.savedAt} />
        {s.error && <span className="mt-0.5 block text-[12.5px] text-red-600">{s.error}</span>}
      </p>
      <Switch id={`community-${communityId}-${kind}`} label={`${label} from this community`} checked={live && s.value} disabled={!live} onChange={s.change} />
    </div>
  )
}

/* ── This browser (not in the app, which has its own) ──────────────────── */

export const BROWSER_WORDS: Record<"blocked" | "iphone" | "idle" | "on", string> = {
  blocked: "Blocked in this browser's settings for storelib.com. Allow notifications there (the icon beside the address), then turn this on.",
  iphone: "Safari on iPhone shows them once Storelib is on your Home Screen, or in the Storelib app.",
  idle: "Get your notifications on this device, even with Storelib closed.",
  on: "This browser gets your notifications.",
}

function BrowserRow({ on, devices }: { on: boolean; devices: number }) {
  const [state, setState] = useState<WebPushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState(0)
  const busyRef = useRef(false)

  useEffect(() => {
    let live = true
    const read = () => {
      /* Not while a change is under way: it would read the half made state. */
      if (busyRef.current) return
      void readWebPush().then((s) => live && !busyRef.current && setState(s))
    }
    read()
    /* Back from the browser's own settings with the permission changed. */
    document.addEventListener("visibilitychange", read)
    return () => {
      live = false
      document.removeEventListener("visibilitychange", read)
    }
  }, [])

  if (state === null) return null
  if (state === "unsupported") return devices === 0 ? <NoDeviceLine /> : null

  const change = async (next: boolean) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    const was = state
    setState(next ? "on" : "off")
    try {
      const now = next ? await enableWebPush() : await disableWebPush()
      setState(now)
      if (now === (next ? "on" : "off")) setSavedAt(Date.now())
    } catch (e) {
      setState(was)
      setError(e instanceof WebPushError ? e.message : "That did not change. Try again.")
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const detail = state === "blocked" ? BROWSER_WORDS.blocked : state === "iphone" ? BROWSER_WORDS.iphone : state === "on" ? BROWSER_WORDS.on : BROWSER_WORDS.idle
  return (
    <PrivacyRow
      id="browser-push"
      title={
        <>
          This browser
          <Saved at={savedAt} />
        </>
      }
      detail={
        <>
          <span data-browser-detail={state}>{detail}</span>
          {state === "on" && !on ? <span className="mt-1 block">Paused while push notifications are off.</span> : null}
          {error && (
            <span role="alert" data-browser-error="" className="mt-1 block text-red-600">
              {error}
            </span>
          )}
        </>
      }
      control={<Switch id="browser-push-switch" label="Notifications on this browser" checked={state === "on"} busy={busy} disabled={state === "blocked" || state === "iphone"} onChange={(v) => void change(v)} />}
    />
  )
}

/* ── The phone (the Storelib app only) ─────────────────────────────────── */

interface Phone {
  inApp: boolean
  permission: PushPermission | null
  asking: boolean
  /** What the last ask answered, said once under the row. */
  answered: PushPermission | null
  ask: () => void
  askIfNeeded: () => void
  recheck: () => void
}

function usePhonePermission(): Phone {
  const [inApp] = useState(() => inNativeApp())
  const [permission, setPermission] = useState<PushPermission | null>(null)
  const [asking, setAsking] = useState(false)
  const [answered, setAnswered] = useState<PushPermission | null>(null)
  const current = useRef<PushPermission | null>(null)

  const recheck = useCallback(() => {
    if (!inApp) return
    void readPushPermission().then((p) => {
      current.current = p
      setPermission(p)
    })
  }, [inApp])

  /* Read without asking, and again when the person comes back from the phone's settings. */
  useEffect(() => {
    if (!inApp) return
    recheck()
    const back = () => {
      if (document.visibilityState === "visible") recheck()
    }
    document.addEventListener("visibilitychange", back)
    return () => document.removeEventListener("visibilitychange", back)
  }, [inApp, recheck])

  const ask = useCallback(() => {
    if (!inApp || asking) return
    setAsking(true)
    void askPushPermission()
      .then((p) => {
        current.current = p
        setPermission(p)
        setAnswered(p)
      })
      .finally(() => setAsking(false))
  }, [inApp, asking])

  const askIfNeeded = useCallback(() => {
    if (current.current === "prompt") ask()
  }, [ask])

  return { inApp, permission, asking, answered, ask, askIfNeeded, recheck }
}

function PhoneRow({ phone, on }: { phone: Phone; on: boolean }) {
  const platform = nativePlatform()
  if (phone.permission === null || phone.permission === "unsupported") return null
  if (phone.permission === "granted") {
    if (phone.answered !== "granted") return null
    return (
      <div className="flex items-center gap-2 py-3 text-[13px] text-[#374151]" data-phone-permission="granted" role="status">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#ecfdf3] text-[#15803d]">
          <Check className="h-3 w-3" aria-hidden="true" />
        </span>
        Notifications are allowed on this phone.
      </div>
    )
  }
  if (phone.permission === "denied") {
    return (
      <div className="pt-3" data-phone-permission="denied" role="status">
        <div className="rounded-xl bg-[#f8f9fa] px-3.5 py-3 shadow-[inset_0_0_0_1px_rgba(229,231,235,0.8)]">
          <p className="text-[14px] font-medium leading-[1.4] text-[#1a1a2e]">Notifications are off for Storelib on this phone</p>
          <p className="mt-1 text-[13px] leading-[1.5] text-[#6b7280]">
            To get them, open {phoneSettingsPath(platform)} on your {platform === "android" ? "phone" : "iPhone"} and turn on {platform === "android" ? "notifications" : "Allow Notifications"}. Then come back here.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => openPhoneSettings()} className={INK} data-phone-open-settings="">
              Open Settings
            </button>
            <button type="button" onClick={phone.recheck} className={cn(QUIET_BUTTON, "bg-white shadow-[0_0_0_1px_#e5e7eb,0_1px_2px_rgba(15,23,42,0.05)] hover:bg-[#f9fafb]")} data-phone-recheck="">
              Check again
            </button>
          </div>
        </div>
      </div>
    )
  }
  /* "prompt": not asked yet. Only offered while push is on; turning push on asks by itself. */
  if (!on) return null
  return (
    <PrivacyRow
      id="phone"
      title="This phone"
      detail="Allow notifications so they can reach you here."
      control={
        <button type="button" onClick={phone.ask} disabled={phone.asking} className={INK} data-phone-allow="">
          {phone.asking ? "Asking" : "Allow"}
        </button>
      }
    />
  )
}

/**
 * Send a test notification: one push to this account's own phones and
 * browsers, and the exact result under the button (lib/push/test-client.ts):
 * nothing registered, sent to N, or the provider's own error. Sales go to
 * the same devices whatever the switch above says, so this is always here.
 */
function TestPushRow() {
  const [sending, setSending] = useState(false)
  const [line, setLine] = useState<{ ok: boolean; phone: string | null; message: string } | null>(null)
  const send = useCallback(() => {
    if (sending) return
    setSending(true)
    setLine(null)
    void import("@/lib/push/test-client")
      .then((m) => m.sendTestNotification())
      .then(setLine, () => setLine({ ok: false, phone: null, message: "Could not send the test. Try again." }))
      .finally(() => setSending(false))
  }, [sending])
  return (
    <PrivacyRow
      id="push-test"
      title="Test notification"
      detail={
        <>
          Sends one to every phone and browser signed in to this account.
          {line ? (
            <span className={cn("mt-1.5 block", line.ok ? "text-[#15803d]" : "text-[#b42318]")} role="status" data-push-test-result={line.ok ? "ok" : "failed"}>
              {line.phone ? <span className="block text-[#374151]">{line.phone}</span> : null}
              {line.message}
            </span>
          ) : null}
        </>
      }
      control={
        <button type="button" onClick={send} disabled={sending} className={QUIET_BUTTON} data-push-test="">
          {sending ? "Sending" : "Send test"}
        </button>
      }
    />
  )
}

function NoDeviceLine() {
  return (
    <p className="py-3 text-[13px] leading-[1.45] text-[#6b7280]" data-push-no-device="">
      No phone gets them yet. Sign in to the Storelib app and they will reach you there.
    </p>
  )
}

/* ── While the route answers ───────────────────────────────────────────── */

function NotificationsSkeleton() {
  const bar = "rounded-md bg-[#f0f1f3]"
  return (
    <section className={CARD} aria-busy="true" aria-label="Notifications" data-account-card="notifications-loading">
      <div className={cn(bar, "mb-4 h-4 w-28")} />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0 flex-1">
            <div className={cn(bar, "h-3.5 w-40")} />
            <div className={cn(bar, "mt-2 h-3 w-full max-w-[320px]")} />
          </div>
          <div className="h-6 w-10 shrink-0 rounded-full bg-[#f0f1f3]" />
        </div>
      ))}
    </section>
  )
}
