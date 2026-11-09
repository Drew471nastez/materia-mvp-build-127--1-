"use client"

/**
 * ===========================================================================
 *  SETTINGS › TEAM
 * ===========================================================================
 * The owner's side: who is on the store's team, with what access, an invite
 * by email with the access it gives (a preset or permissions ticked one by
 * one, ./team-permissions), changing that later, and how many seats the plan
 * has. A member given Team manages the same list, up to their own access. A
 * member's side: the stores they are on, which one they are working in, and
 * leaving one. Everything is decided on the server (lib/team); this only
 * shows it and asks.
 *
 * HOW IT FEELS. A change shows at once and is put back if the server says
 * no (optimistic). What happened is said in a toast, never a banner that
 * pushes the card down. Cancel, Remove and Leave ask first. Each row is one
 * line on a phone: the person, their access and status under the name, and
 * a "..." that opens the row's actions as a sheet (ResponsiveActionMenu); on
 * a computer the access and Resend sit in the row as well.
 */
import * as React from "react"
import { MoreHorizontal, RotateCw, LogOut, UserMinus, X, SlidersHorizontal } from "lucide-react"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Card, Empty, Modal, Notice, Pill, TextInput, api, peekGet } from "@/components/physical/ui"
import { AppAvatar } from "@/components/app/app-avatar"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { resendWait, teamEmail } from "@/lib/team/roles"
import { accessSummary, defaultPreset, homeFor, normalizePermissions, presetPermissions, type TeamPermission } from "@/lib/team/permissions"
import { PermissionPicker } from "./team-permissions"
import { Reveal } from "@/components/ui/reveal"
import { tt } from "@/lib/i18n/text"
import { formatRelative } from "@/lib/i18n/format"
import { displayEmail } from "@/lib/businesses/email-alias"

interface Member {
  id: string
  email: string
  permissions: TeamPermission[]
  status: "invited" | "active"
  invited_at: string
  expires_at: string | null
  accepted_at?: string | null
  name?: string | null
  avatar_url?: string | null
  /** Drawn before the server has answered (an invite on its way). */
  pending?: boolean
}
interface StoreRow {
  creatorId: string
  name: string
  avatarUrl: string | null
  permissions: TeamPermission[]
}
interface TeamData {
  ready: boolean
  /**
   * The team this account manages: its own store's (byOwner), or the store it
   * works in when it was given Team. `grant` is what it may give, `open` what
   * is open to the team today, `self` its own row when it is a member.
   */
  team: { members: Member[]; limit: number; byOwner: boolean; grant: TeamPermission[]; open: TeamPermission[]; self: string | null } | null
  stores: StoreRow[]
  acting: { creatorId: string; name: string; permissions: TeamPermission[] } | null
  me?: { name: string | null; avatarUrl: string | null; email: string | null }
}

function ago(iso: string | null | undefined, now: number): string {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return ""
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return tt("just now")
  /* "5 minutes ago", "yesterday", "vor 3 Tagen": Intl writes it in the dashboard's language. */
  return formatRelative(t, now)
}

/** A clock that ticks once a second only while something on screen is counting down. */
function useNow(active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), active ? 1000 : 30_000)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

/** A person's photo, or their first letter on a soft ground: a list of grey silhouettes reads as nobody. */
function Face({ src, name, size = 36 }: { src: string | null | undefined; name: string; size?: number }) {
  if (src) return <AppAvatar src={src} name={name} size={size} className="shrink-0 ring-1 ring-[#e5e7eb]" />
  const first = name.trim().match(/[\p{L}\p{N}]/u)?.[0]
  /* No letter to draw (an address of symbols): the app's own avatar for nobody, never a question mark. */
  if (!first) return <AppAvatar src={null} name={name} size={size} className="shrink-0 ring-1 ring-[#e5e7eb]" />
  const letter = first.toUpperCase()
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full bg-[#eef0f3] font-semibold text-[#4b5563]" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      {letter}
    </span>
  )
}

type Confirm =
  | { kind: "cancel" | "remove"; member: Member }
  | { kind: "leave"; store: StoreRow }

const DOTS =
  "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#6b7280] outline-none transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#9ca3af]/40 [-webkit-tap-highlight-color:transparent]"

const sameAccess = (a: readonly TeamPermission[], b: readonly TeamPermission[]) => normalizePermissions(a).join() === normalizePermissions(b).join()

export function TeamPanel() {
  /* Drawn from what Settings fetched ahead (settings-form-new TAB_WARM), so Team opens with its people rather than empty; read again as it opens. */
  const [data, setData] = React.useState<TeamData | null>(() => peekGet<TeamData>("/api/team"))
  const [error, setError] = React.useState<string | null>(null)
  const [email, setEmail] = React.useState("")
  const [touched, setTouched] = React.useState(false)
  /* What the invite gives: the default preset, inside what this person may give once the server has said. */
  const [access, setAccess] = React.useState<TeamPermission[]>(() => presetPermissions(defaultPreset()))
  const [sending, setSending] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [confirm, setConfirm] = React.useState<Confirm | null>(null)
  /* Changing someone's access: who, and the ticks while the sheet is open. */
  const [editing, setEditing] = React.useState<Member | null>(null)
  const [editAccess, setEditAccess] = React.useState<TeamPermission[]>([])

  const load = React.useCallback(async () => {
    const r = await api<TeamData>("/api/team")
    if (r.ok) {
      setData(r.data)
      setError(null)
      const grant = r.data.team?.grant
      if (grant) setAccess((a) => a.filter((p) => grant.includes(p)))
    } else setError(r.error)
  }, [])
  React.useEffect(() => { void load() }, [load])

  const members = data?.team?.members ?? []
  const counting = members.some((m) => m.status === "invited" && resendWait(m.invited_at) > 0)
  const now = useNow(counting)

  const setMembers = (fn: (list: Member[]) => Member[]) =>
    setData((d) => (d && d.team ? { ...d, team: { ...d.team, members: fn(d.team.members) } } : d))

  const cleanEmail = teamEmail(email)
  const ownEmail = data?.me?.email?.toLowerCase() ?? null
  const emailProblem = !email.trim()
    ? null
    : !cleanEmail
      ? tt("Enter a full email address, like name@example.com.")
      : cleanEmail === ownEmail
        ? tt("That's your own email. You're already on this store.")
        : members.some((m) => m.email === cleanEmail && m.status === "active")
          ? tt("They're already on your team.")
          : null

  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!cleanEmail || emailProblem || sending || access.length === 0) return
    const existing = members.find((m) => m.email === cleanEmail)
    const temp: Member = { id: `pending-${cleanEmail}`, email: cleanEmail, permissions: access, status: "invited", invited_at: new Date().toISOString(), expires_at: null, pending: true }
    setSending(true)
    /* Shown at once: an invite to someone new joins the list, a repeat moves to "just now". */
    if (!existing) setMembers((list) => [...list, temp])
    const r = await api<{ member: Member; emailed: boolean }>("/api/team", { method: "POST", body: { email: cleanEmail, permissions: access } })
    setSending(false)
    if (r.ok === false) {
      if (!existing) setMembers((list) => list.filter((m) => m.id !== temp.id))
      toast({ title: tt("Invite not sent"), description: r.error, variant: "destructive" })
      return
    }
    setMembers((list) => {
      const next = list.filter((m) => m.id !== temp.id && m.id !== r.data.member.id)
      return [...next, { ...r.data.member, name: null, avatar_url: null }].sort((a, b) => Date.parse(a.invited_at) - Date.parse(b.invited_at))
    })
    setEmail("")
    setTouched(false)
    toast(r.data.emailed ? { title: tt("Invite sent"), description: tt("To {cleanEmail}. The link works for 7 days.", { cleanEmail }) } : { title: tt("Invite saved"), description: tt("The email didn't go out. Use Resend in a minute."), variant: "destructive" })
  }

  const openEdit = (m: Member) => {
    setEditAccess(normalizePermissions(m.permissions))
    setEditing(m)
  }

  const saveAccess = async () => {
    const m = editing
    if (!m) return
    const next = normalizePermissions(editAccess)
    setEditing(null)
    if (sameAccess(next, m.permissions)) return
    setBusy(m.id)
    setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, permissions: next } : x)))
    const r = await api(`/api/team/${m.id}`, { method: "PATCH", body: { permissions: next } })
    setBusy(null)
    if (r.ok === false) {
      setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, permissions: m.permissions } : x)))
      toast({ title: tt("Access not changed"), description: r.error, variant: "destructive" })
      return
    }
    toast({ title: tt("Access changed for {value}", { value: m.name || (displayEmail(m.email) ?? "") }), description: m.status === "active" ? tt("It applies right away.") : tt("It applies when they join.") })
  }

  const remove = async (m: Member) => {
    setConfirm(null)
    setMembers((list) => list.filter((x) => x.id !== m.id))
    const r = await api(`/api/team/${m.id}`, { method: "DELETE" })
    if (r.ok === false) {
      setMembers((list) => [...list, m].sort((a, b) => Date.parse(a.invited_at) - Date.parse(b.invited_at)))
      toast({ title: m.status === "invited" ? tt("Invite not cancelled") : tt("Not removed"), description: r.error, variant: "destructive" })
      return
    }
    toast({ title: m.status === "invited" ? tt("Invite cancelled") : tt("{value} removed", { value: m.name || (displayEmail(m.email) ?? "") }), description: m.status === "invited" ? tt("The link in their email stops working.") : tt("They can't open your store any more.") })
  }

  const resend = async (m: Member) => {
    if (resendWait(m.invited_at) > 0) return
    setBusy(m.id)
    const r = await api<{ member: Member; emailed: boolean }>("/api/team", { method: "POST", body: { email: m.email, permissions: m.permissions } })
    setBusy(null)
    if (r.ok === false) return toast({ title: tt("Not sent"), description: r.error, variant: "destructive" })
    setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, ...r.data.member } : x)))
    toast({ title: tt("Invite sent again"), description: tt("A new link went to {email}. The old one stops working.", { email: (displayEmail(m.email) ?? "") }) })
  }

  const work = async (store: string | null) => {
    setBusy(store ?? "own")
    const r = await api("/api/team/act", { method: "POST", body: { store } })
    if (r.ok === false) {
      setBusy(null)
      return toast({ title: tt("Couldn't switch"), description: r.error, variant: "destructive" })
    }
    /* The whole dashboard is drawn for the store now: a full load, not a refresh of this panel, on the first page they may use. */
    window.location.href = store ? homeFor(data?.stores.find((x) => x.creatorId === store)?.permissions ?? []) : "/app"
  }

  const leave = async (s: StoreRow) => {
    setConfirm(null)
    setBusy(s.creatorId)
    const r = await api("/api/team/leave", { method: "POST", body: { store: s.creatorId } })
    setBusy(null)
    if (r.ok === false) return toast({ title: tt("Couldn't leave"), description: r.error, variant: "destructive" })
    if (data?.acting?.creatorId === s.creatorId) {
      window.location.href = "/app"
      return
    }
    setData((d) => (d ? { ...d, stores: d.stores.filter((x) => x.creatorId !== s.creatorId) } : d))
    toast({ title: tt("You left {name}", { name: s.name }) })
  }

  if (error) return <Notice>{error}</Notice>
  if (!data) return <TeamSkeleton />
  if (!data.ready) return <Notice tone="gray">{tt("The team is not set up on Storelib yet. Try again later.")}</Notice>

  const team = data.team
  const used = members.length
  const full = !!team && used >= team.limit
  const expired = (m: Member) => m.status === "invited" && !!m.expires_at && Date.parse(m.expires_at) < now
  const showError = touched && !!emailProblem
  /* An address worth inviting is typed: the access for this invite is chosen now, and only now. */
  const choosing = !full && !!cleanEmail && !emailProblem
  const grant = team?.grant ?? []
  const open = team?.open ?? []
  /* A member with Team edits only people whose access is within their own, never themselves (the server checks it again). */
  const editable = (m: Member) => !!team && m.id !== team.self && (team.byOwner || m.permissions.every((p) => grant.includes(p)))

  return (
    <div className="space-y-4 sm:space-y-6" data-team-panel="">
      {data.acting && (
        <Card>
          <div className="flex items-center gap-3">
            <Face src={data.stores.find((s) => s.creatorId === data.acting?.creatorId)?.avatarUrl ?? null} name={data.acting.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-[#1a1a2e]">{tt("Working in {name}", { name: data.acting.name })}</p>
              <p className="truncate text-[13px] text-[#6b7280]">{accessSummary(data.acting.permissions)}</p>
            </div>
            <button type="button" className={cn(BTN_SECONDARY, "h-9 px-3 text-[13px]")} disabled={busy !== null} onClick={() => work(null)}>
              {busy === "own" ? tt("Going back") : tt("Back to my account")}
            </button>
          </div>
        </Card>
      )}

      {team && (
        <Card title={tt("Team")} help="team" description={tt("People who help run your store. {used} of {limit} seats used.", { used, limit: team.limit })}>
          <ul className="-mx-1" data-team-list="">
            {team.byOwner ? (
              <li className="flex min-h-[56px] items-center gap-3 rounded-xl px-1 py-2">
                <Face src={data.me?.avatarUrl ?? null} name={data.me?.name || displayEmail(data.me?.email) || tt("You")} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{data.me?.name ? tt("{name} (you)", { name: data.me.name }) : tt("You")}</p>
                  <p className="truncate text-[13px] text-[#6b7280]">{tt("Everything, payouts and billing too")}</p>
                </div>
                <Pill tone="gray">{tt("Owner")}</Pill>
              </li>
            ) : null}
            {members.map((m) => {
              const wait = m.status === "invited" ? resendWait(m.invited_at, now) : 0
              const isExpired = expired(m)
              const mine = m.id === team.self
              const canEdit = editable(m)
              const status =
                m.pending ? tt("Sending invite") :
                m.status === "active" ? (m.name ? (displayEmail(m.email) ?? "") : tt("Joined {when}", { when: ago(m.accepted_at, now) }).trim()) :
                isExpired ? tt("Expired, sent {value}", { value: ago(m.invited_at, now) }) :
                tt("Invited {value}", { value: ago(m.invited_at, now) })
              const items: ActionMenuItem[] = canEdit
                ? [
                    { label: tt("Change access"), icon: <SlidersHorizontal className="h-4 w-4" />, onClick: () => openEdit(m) },
                    ...(m.status === "invited"
                      ? [{ label: wait > 0 ? tt("Resend in {wait}s", { wait }) : tt("Resend invite"), icon: <RotateCw className="h-4 w-4" />, onClick: () => void resend(m) }]
                      : []),
                    m.status === "invited"
                      ? { label: tt("Cancel invite"), icon: <X className="h-4 w-4" />, variant: "destructive" as const, separatorBefore: true, onClick: () => setConfirm({ kind: "cancel", member: m }) }
                      : { label: tt("Remove from team"), icon: <UserMinus className="h-4 w-4" />, variant: "destructive" as const, separatorBefore: true, onClick: () => setConfirm({ kind: "remove", member: m }) },
                  ]
                : []
              const name = m.name || (displayEmail(m.email) ?? "")
              return (
                <li key={m.id} className={cn("flex min-h-[56px] items-center gap-3 rounded-xl px-1 py-2 transition-opacity", m.pending && "opacity-60")} data-team-member={m.status}>
                  <Face src={m.avatar_url ?? null} name={name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{mine ? tt("{name} (you)", { name }) : name}</p>
                    <p className={cn("truncate text-[13px]", isExpired ? "text-[#b45309]" : "text-[#6b7280]")}>
                      <span className="sm:hidden">{accessSummary(m.permissions)} · </span>
                      {status}
                    </p>
                  </div>
                  {m.status === "invited" && !m.pending ? (
                    <Pill tone={isExpired ? "amber" : "blue"} className="hidden sm:inline-flex">{isExpired ? tt("Expired") : tt("Invited")}</Pill>
                  ) : null}
                  {canEdit && !m.pending ? (
                    <button
                      type="button"
                      onClick={() => openEdit(m)}
                      disabled={busy === m.id}
                      className="hidden max-w-[160px] truncate rounded-lg px-2 py-1.5 text-right text-[13px] text-[#4b5563] underline-offset-2 hover:bg-[#f1f2f4] hover:text-[#1a1a2e] sm:inline"
                      aria-label={tt("Change access for {email}", { email: (displayEmail(m.email) ?? "") })}
                      data-team-access=""
                    >
                      {accessSummary(m.permissions)}
                    </button>
                  ) : (
                    <span className="hidden max-w-[160px] truncate text-right text-[13px] text-[#4b5563] sm:inline">{accessSummary(m.permissions)}</span>
                  )}
                  {canEdit && m.status === "invited" && !m.pending ? (
                    <button type="button" className={cn(BTN_SECONDARY, "hidden h-9 min-w-[124px] px-3 text-[13px] tabular-nums sm:inline-flex")} disabled={busy === m.id || wait > 0} onClick={() => resend(m)} title={wait > 0 ? tt("You can resend in {wait} seconds", { wait }) : undefined}>
                      {busy === m.id ? tt("Sending") : wait > 0 ? tt("Resend in {wait}s", { wait }) : tt("Resend")}
                    </button>
                  ) : null}
                  {m.pending ? (
                    <span className="grid h-9 w-9 place-items-center" aria-hidden>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#d1d5db] border-t-[#6b7280]" />
                    </span>
                  ) : items.length > 0 ? (
                    <ResponsiveActionMenu
                      title={name}
                      items={items}
                      trigger={
                        <button type="button" className={DOTS} aria-label={tt("Actions for {email}", { email: (displayEmail(m.email) ?? "") })} disabled={busy === m.id}>
                          <MoreHorizontal className="h-[18px] w-[18px]" />
                        </button>
                      }
                    />
                  ) : (
                    <span className="h-9 w-9 shrink-0" aria-hidden />
                  )}
                </li>
              )
            })}
          </ul>

          <form onSubmit={invite} noValidate className="mt-3 border-t border-[#f1f2f4] pt-4" data-team-invite="">
            <label htmlFor="team-invite-email" className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">
              {tt("Invite someone")}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <TextInput
                id="team-invite-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched(true)}
                disabled={full}
                aria-invalid={showError || undefined}
                aria-describedby="team-invite-hint"
                className={cn("sm:flex-1", showError && "border-[#fca5a5] focus:border-[#f87171]")}
              />
              <button type="submit" className={cn(BTN_PRIMARY, "sm:min-w-[120px]")} disabled={full || sending || !cleanEmail || !!emailProblem || access.length === 0}>
                {sending ? tt("Sending") : tt("Send invite")}
              </button>
            </div>
            <p id="team-invite-hint" className={cn("mt-2 min-h-5 text-[13px] leading-5", showError ? "text-[#b42318]" : "text-[#6b7280]")} aria-live="polite">
              {full
                ? tt("Every seat is taken. Remove someone, or upgrade your plan to invite more.")
                : showError
                  ? emailProblem
                  : tt("They sign in with their own Storelib account. Refunds and deleting the store stay with the owner.")}
            </p>
            {/*
              WHAT THEY CAN DO, ONLY WHILE INVITING (round 51, the owner): folded
              away until an address to invite is typed, then it opens under it
              (Reveal: its own height, 200ms, nothing below jumps) for the
              choice that goes with this invite, and folds again once it is sent.
            */}
            <Reveal open={choosing} data-team-invite-access={choosing ? "open" : "closed"}>
              <div className="pt-4">
                <p className="mb-2 text-[13px] font-medium text-[#1a1a2e]">{tt("What they can do")}</p>
                <PermissionPicker value={access} onChange={setAccess} grant={grant} open={open} idPrefix="team-invite" />
                {access.length === 0 ? <p className="mt-2 text-[13px] leading-5 text-[#b45309]">{tt("Tick at least one thing they can do.")}</p> : null}
              </div>
            </Reveal>
          </form>
        </Card>
      )}

      {data.stores.length > 0 ? (
        <Card title={tt("Stores you're on")} description={tt("Stores whose owners invited you. Open one to work in it.")}>
          <ul className="-mx-1">
            {data.stores.map((s) => {
              const here = data.acting?.creatorId === s.creatorId
              return (
                <li key={s.creatorId} className="flex min-h-[56px] items-center gap-3 rounded-xl px-1 py-2" data-team-store="">
                  <Face src={s.avatarUrl} name={s.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{s.name}</p>
                    <p className="truncate text-[13px] text-[#6b7280]">{accessSummary(s.permissions)}</p>
                  </div>
                  {here ? (
                    <Pill tone="green">{tt("Working here")}</Pill>
                  ) : (
                    <button type="button" className={cn(BTN_PRIMARY, "h-9 px-3.5 text-[13px]")} disabled={busy !== null} onClick={() => work(s.creatorId)}>
                      {busy === s.creatorId ? tt("Opening") : tt("Open")}
                    </button>
                  )}
                  <ResponsiveActionMenu
                    title={s.name}
                    items={[{ label: tt("Leave {name}", { name: s.name }), icon: <LogOut className="h-4 w-4" />, variant: "destructive", onClick: () => setConfirm({ kind: "leave", store: s }) }]}
                    trigger={
                      <button type="button" className={DOTS} aria-label={tt("Actions for {name}", { name: s.name })} disabled={busy !== null}>
                        <MoreHorizontal className="h-[18px] w-[18px]" />
                      </button>
                    }
                  />
                </li>
              )
            })}
          </ul>
        </Card>
      ) : !team ? (
        <Card title={tt("Team")} help="team">
          <Empty title={tt("No team yet")}>{tt("When a store's owner invites you, it shows here and you can open it from your own account.")}</Empty>
        </Card>
      ) : null}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        wide
        title={editing ? tt("Access for {value}", { value: editing.name || (displayEmail(editing.email) ?? "") }) : tt("Access")}
        footer={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => setEditing(null)}>
              {tt("Cancel")}
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={editAccess.length === 0 || (!!editing && sameAccess(editAccess, editing.permissions))} onClick={() => void saveAccess()}>
              {tt("Save")}
            </button>
          </>
        }
      >
        {editing ? (
          <div data-team-edit="">
            <PermissionPicker key={editing.id} value={editAccess} onChange={setEditAccess} grant={grant} open={open} idPrefix={`team-edit-${editing.id}`} />
            <p className="mt-3 text-[13px] leading-5 text-[#6b7280]">
              {editAccess.length === 0
                ? tt("Tick at least one thing they can do, or remove them from the team.")
                : editing.status === "active"
                  ? tt("It applies on their next page.")
                  : tt("It applies when they join.")}
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === "cancel" ? tt("Cancel this invite?") : confirm?.kind === "remove" ? tt("Remove from the team?") : tt("Leave this store?")}
        footer={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => setConfirm(null)}>
              {tt("Keep")}
            </button>
            <button
              type="button"
              className={BTN_DANGER}
              onClick={() => {
                if (!confirm) return
                if (confirm.kind === "leave") void leave(confirm.store)
                else void remove(confirm.member)
              }}
            >
              {confirm?.kind === "cancel" ? tt("Cancel invite") : confirm?.kind === "remove" ? tt("Remove") : tt("Leave")}
            </button>
          </>
        }
      >
        <p className="text-[14px] leading-[21px] text-[#4b5563]">
          {confirm?.kind === "cancel"
            ? tt("The link sent to {email} stops working. You can invite them again later.", { email: (displayEmail(confirm.member.email) ?? "") })
            : confirm?.kind === "remove"
              ? tt("{value} can't open your store any more, starting now. Their own Storelib account stays as it is.", { value: confirm.member.name || (displayEmail(confirm.member.email) ?? "") })
              : confirm?.kind === "leave"
                ? tt("You won't be able to open {name} until its owner invites you again. Your own account stays as it is.", { name: confirm.store.name })
                : null}
        </p>
      </Modal>
    </div>
  )
}

/** The card's shape while the team loads, so nothing jumps when it arrives. */
function TeamSkeleton() {
  return (
    <Card title={tt("Team")} help="team" description={tt("People who help run your store.")}>
      <div className="space-y-3" aria-hidden>
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3 px-0 py-2">
            <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-[#f1f2f4]" />
            <div className="flex-1 space-y-1.5">
              <span className="block h-3.5 w-1/3 animate-pulse rounded bg-[#f1f2f4]" />
              <span className="block h-3 w-1/2 animate-pulse rounded bg-[#f3f4f6]" />
            </div>
          </div>
        ))}
        <span className="block h-10 w-full animate-pulse rounded-lg bg-[#f6f7f8]" />
      </div>
    </Card>
  )
}
