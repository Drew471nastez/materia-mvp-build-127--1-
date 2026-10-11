"use client"

/**
 * ===========================================================================
 *  SETTINGS › TEAM
 * ===========================================================================
 * The owner's side: who is on the store's team, with what role, an invite by
 * email, and how many seats the plan has. A member's side: the stores they
 * are on, which one they are working in, and leaving one. Everything is
 * decided on the server (lib/team); this only shows it and asks.
 */
import * as React from "react"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Card, Empty, Notice, Pill, SelectInput, TextInput, api } from "@/components/physical/ui"
import { ROLE_LABEL, ROLE_SUMMARY, invitable, type MemberRole } from "@/lib/team/roles"

interface Member {
  id: string
  email: string
  role: MemberRole
  status: "invited" | "active"
  expires_at: string | null
}
interface StoreRow {
  creatorId: string
  name: string
  avatarUrl: string | null
  role: MemberRole
}
interface TeamData {
  ready: boolean
  team: { members: Member[]; limit: number } | null
  stores: StoreRow[]
  acting: { creatorId: string; name: string; role: MemberRole } | null
}

const ROLES: MemberRole[] = ["manager", "staff"]

export function TeamPanel() {
  const [data, setData] = React.useState<TeamData | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [email, setEmail] = React.useState("")
  const [role, setRole] = React.useState<MemberRole>("manager")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [said, setSaid] = React.useState<{ tone: "green" | "red"; text: string } | null>(null)

  const load = React.useCallback(async () => {
    const r = await api<TeamData>("/api/team")
    if (r.ok) {
      setData(r.data)
      setError(null)
    } else setError(r.error)
  }, [])
  React.useEffect(() => { void load() }, [load])

  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy("invite")
    setSaid(null)
    const r = await api<{ emailed: boolean }>("/api/team", { method: "POST", body: { email, role } })
    setBusy(null)
    if (r.ok === false) return setSaid({ tone: "red", text: r.error })
    setSaid({ tone: "green", text: r.data.emailed ? `Invite sent to ${email.trim().toLowerCase()}.` : "Invite saved, but the email did not go out. Use Resend in a moment." })
    setEmail("")
    void load()
  }
  const change = async (m: Member, next: MemberRole) => {
    setBusy(m.id)
    const r = await api(`/api/team/${m.id}`, { method: "PATCH", body: { role: next } })
    setBusy(null)
    if (r.ok === false) setSaid({ tone: "red", text: r.error })
    void load()
  }
  const remove = async (m: Member) => {
    setBusy(m.id)
    const r = await api(`/api/team/${m.id}`, { method: "DELETE" })
    setBusy(null)
    if (r.ok === false) setSaid({ tone: "red", text: r.error })
    void load()
  }
  const resend = async (m: Member) => {
    setBusy(m.id)
    const r = await api<{ emailed: boolean }>("/api/team", { method: "POST", body: { email: m.email, role: m.role } })
    setBusy(null)
    setSaid(r.ok ? { tone: "green", text: `A new invite went to ${m.email}.` } : { tone: "red", text: r.error })
    void load()
  }
  const work = async (store: string | null) => {
    setBusy(store ?? "own")
    const r = await api("/api/team/act", { method: "POST", body: { store } })
    if (r.ok === false) {
      setBusy(null)
      return setSaid({ tone: "red", text: r.error })
    }
    /* The whole dashboard is drawn for the store now: a full load, not a refresh of this panel. */
    window.location.href = "/app"
  }
  const leave = async (s: StoreRow) => {
    setBusy(s.creatorId)
    const r = await api("/api/team/leave", { method: "POST", body: { store: s.creatorId } })
    setBusy(null)
    if (r.ok === false) return setSaid({ tone: "red", text: r.error })
    if (data?.acting?.creatorId === s.creatorId) window.location.href = "/app"
    else void load()
  }

  if (error) return <Notice>{error}</Notice>
  if (!data) return <Card title="Team" help="team"><div className="h-24" aria-hidden /></Card>
  if (!data.ready) return <Notice tone="gray">The team is not set up on Storelib yet. Try again later.</Notice>

  const team = data.team
  const used = team?.members.length ?? 0
  const full = !!team && used >= team.limit
  const expired = (m: Member) => m.status === "invited" && !!m.expires_at && Date.parse(m.expires_at) < Date.now()

  return (
    <div className="space-y-4 sm:space-y-6">
      {said && <Notice tone={said.tone}>{said.text}</Notice>}

      {data.acting && (
        <Card title={`Working in ${data.acting.name}`} description={`As ${ROLE_LABEL[data.acting.role]}: ${ROLE_SUMMARY[data.acting.role].toLowerCase()}.`}>
          <button type="button" className={BTN_SECONDARY} disabled={busy !== null} onClick={() => work(null)}>
            Back to my account
          </button>
        </Card>
      )}

      {team && (
        <Card
          title="Team"
          help="team"
          description={`People who help run your store. ${used} of ${team.limit} seats used.`}
        >
          <ul className="divide-y divide-[#f1f2f4]">
            <li className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-[#1a1a2e]">You</p>
                <p className="text-[13px] text-[#6b7280]">Everything, including payouts, billing and the team</p>
              </div>
              <Pill tone="gray">Owner</Pill>
            </li>
            {team.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{m.email}</p>
                  <p className="text-[13px] text-[#6b7280]">{ROLE_SUMMARY[m.role]}</p>
                </div>
                <div className="flex items-center gap-2">
                  {m.status === "invited" && <Pill tone={expired(m) ? "amber" : "blue"}>{expired(m) ? "Invite expired" : "Invited"}</Pill>}
                  <SelectInput value={m.role} onChange={(v) => change(m, v as MemberRole)} disabled={busy === m.id} aria-label={`Role for ${m.email}`} className="w-[120px]">
                    {ROLES.map((r) => <option key={r} value={r} disabled={!invitable(r)}>{invitable(r) ? ROLE_LABEL[r] : `${ROLE_LABEL[r]} (not open yet)`}</option>)}
                  </SelectInput>
                  {m.status === "invited" && (
                    <button type="button" className={BTN_SECONDARY} disabled={busy === m.id} onClick={() => resend(m)}>Resend</button>
                  )}
                  <button type="button" className={BTN_DANGER} disabled={busy === m.id} onClick={() => remove(m)}>
                    {m.status === "invited" ? "Cancel" : "Remove"}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <form onSubmit={invite} className="mt-4 flex flex-col gap-2 border-t border-[#f1f2f4] pt-4 sm:flex-row">
            <TextInput
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="name@example.com"
              aria-label="Email to invite"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={full}
              className="flex-1"
            />
            <SelectInput value={role} onChange={(v) => setRole(v as MemberRole)} aria-label="Role" disabled={full} className="sm:w-[140px]">
              {ROLES.map((r) => <option key={r} value={r} disabled={!invitable(r)}>{invitable(r) ? ROLE_LABEL[r] : `${ROLE_LABEL[r]} (not open yet)`}</option>)}
            </SelectInput>
            <button type="submit" className={BTN_PRIMARY} disabled={full || busy === "invite" || !email.trim()}>
              {busy === "invite" ? "Sending" : "Send invite"}
            </button>
          </form>
          <p className="mt-2 text-[13px] leading-5 text-[#6b7280]">
            {full ? "Every seat is taken. Remove someone, or upgrade your plan to invite more." : `${ROLE_LABEL[role]}: ${ROLE_SUMMARY[role].toLowerCase()}. They sign in with their own Storelib account.`}
          </p>
        </Card>
      )}

      {data.stores.length > 0 ? (
        <Card title="Stores you're on" description="Stores whose owners invited you. Open one to work in it.">
          <ul className="divide-y divide-[#f1f2f4]">
            {data.stores.map((s) => {
              const here = data.acting?.creatorId === s.creatorId
              return (
                <li key={s.creatorId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{s.name}</p>
                    <p className="text-[13px] text-[#6b7280]">{ROLE_LABEL[s.role]} · {ROLE_SUMMARY[s.role]}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {here ? <Pill tone="green">Working here</Pill> : (
                      <button type="button" className={BTN_PRIMARY} disabled={busy !== null} onClick={() => work(s.creatorId)}>Open</button>
                    )}
                    <button type="button" className={BTN_SECONDARY} disabled={busy !== null} onClick={() => leave(s)}>Leave</button>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      ) : !team ? (
        <Card title="Team" help="team">
          <Empty title="No team yet">When a store's owner invites you, it shows here and you can open it from your own account.</Empty>
        </Card>
      ) : null}
    </div>
  )
}
