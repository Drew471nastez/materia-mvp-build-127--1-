"use client"

/**
 * ===========================================================================
 *  EMAILS › AUTOMATIONS › COMMUNITIES
 * ===========================================================================
 * What each community sends by itself (its automated messages: a welcome, a
 * level message, a broadcast; lib/communities/chat-automations.ts, part 272)
 * listed with the store's automations, as Customer emails lists the store's
 * automations beside its emails. A row says when it goes and what it sent,
 * its switch pauses or resumes it, and the row opens the community's own
 * manager in a sheet over this page (components/community/creator/
 * automations-panel.tsx), so writing, sending and deleting one happen here
 * and the page never moves to the community area. The same route as the
 * community's settings (/api/app/community/<id>/chat/automations), so
 * nothing saved moved.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { api } from "@/components/physical/ui"
import { communityAutomationsFrom } from "@/lib/emails/shapes"
import { Switch } from "@/components/ui/switch"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { AutomationsPanel, statusWord, whenLine, type Automation } from "@/components/community/creator/automations-panel"
import { ToastHost } from "@/components/community/creator/parts"
import { PHONE_SHEET_HEIGHT } from "./email-parts"
import type { CommunityRef } from "./community-emails"

type Listed = { ready: boolean; automations: Automation[]; channels: { id: string; name: string }[]; canEdit: boolean }

export const communityAutomationsPath = (id: string) => `/api/app/community/${id}/chat/automations`

/* Each community's list, kept for the page's life: switching tabs and back draws it at once, read again behind it. */
const listedKept = new Map<string, Listed>()
const warming = new Set<string>()

/**
 * A community's automated messages read ahead (Emails, while the browser is
 * idle, wave 8), so Automations draws them in its first frame instead of
 * adding them under the store's a moment later. Once per community; the rows
 * read again behind what is kept when they are drawn.
 */
export function warmCommunityAutomations(id: string) {
  if (listedKept.has(id) || warming.has(id)) return
  warming.add(id)
  void api<Listed>(communityAutomationsPath(id)).then((r) => {
    warming.delete(id)
    const next = r.ok ? communityAutomationsFrom<Automation, Listed["channels"][number]>(r.data) : null
    if (next && !listedKept.has(id)) listedKept.set(id, next)
  })
}

/** The switch's state for a row: on unless it is paused. A one-off that has gone has no switch. */
export function automationSwitch(a: Pick<Automation, "status" | "trigger">): boolean | null {
  if (a.status === "done" || (a.trigger === "broadcast" && a.status === "sending")) return null
  return a.status !== "paused"
}

/**
 * Every listed community's automated messages, under the community's name
 * when there is more than one (`titled`). Nothing is drawn for a community
 * with none, so a store without communities sees no change.
 */
export function CommunityAutomations({ communities, bare = true, titled = true }: { communities: CommunityRef[]; bare?: boolean; titled?: boolean }) {
  const [opened, setOpened] = React.useState<CommunityRef | null>(null)
  const [version, setVersion] = React.useState(0)
  const phone = usePhoneWidth()
  if (communities.length === 0) return null
  return (
    <div data-community-automations="">
      {communities.map((c) => (
        <CommunityAutomationRows key={`${c.id}:${version}`} community={c} bare={bare} titled={titled} onOpen={() => setOpened(c)} />
      ))}
      <SheetDialog
        open={!!opened}
        onClose={() => {
          setOpened(null)
          /* What was written in the sheet shows in the rows at once. */
          setVersion((v) => v + 1)
        }}
        phone={phone}
        label={opened ? tt("Automated messages in {name}", { name: opened.name }) : tt("Automated messages")}
        sheet={{ height: PHONE_SHEET_HEIGHT, maxHeight: PHONE_SHEET_HEIGHT }}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="flex max-h-[min(92dvh,880px)] w-[calc(100vw-48px)] flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-[0_0_0_1px_rgba(16,24,40,0.06),0_24px_56px_-12px_rgba(16,24,40,0.28)] outline-none focus:outline-none focus-visible:outline-none sm:max-w-[760px]"
      >
        <div className={cn("flex min-h-0 flex-1 flex-col", phone && "h-full")} data-community-automations-sheet={opened?.id}>
          <div className="shrink-0 border-b border-[#f1f2f4] px-4 py-3 pr-12 sm:px-5 sm:py-4">
            <SheetDialogTitle className="text-[16px] font-semibold leading-6 text-[#1a1a2e]">{tt("Automated messages")}</SheetDialogTitle>
            <p className="truncate text-[12.5px] text-[#6b7280]">{opened?.name}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8f9fa] px-4 py-4 sm:px-5 sm:py-5">
            {opened ? (
              <ToastHost>
                <AutomationsPanel head={opened} />
              </ToastHost>
            ) : null}
          </div>
        </div>
      </SheetDialog>
    </div>
  )
}

function CommunityAutomationRows({ community, bare, titled, onOpen }: { community: CommunityRef; bare: boolean; titled: boolean; onOpen: () => void }) {
  const [listed, setListed] = React.useState<Listed | null>(() => listedKept.get(community.id) ?? null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    let live = true
    void api<Listed>(communityAutomationsPath(community.id)).then((r) => {
      if (!live || !r.ok) return
      /* Checked at the door (lib/emails/shapes.ts): lists that are lists, or nothing drawn. */
      const next = communityAutomationsFrom<Automation, Listed["channels"][number]>(r.data)
      if (!next) return
      listedKept.set(community.id, next)
      setListed(next)
    })
    return () => {
      live = false
    }
  }, [community.id])

  const toggle = async (a: Automation, on: boolean) => {
    const was = a.status
    const put = (status: Automation["status"]) =>
      setListed((l) => {
        if (!l) return l
        const next = { ...l, automations: l.automations.map((x) => (x.id === a.id ? { ...x, status } : x)) }
        listedKept.set(community.id, next)
        return next
      })
    put(on ? (a.trigger === "broadcast" ? "scheduled" : "active") : "paused")
    const r = await api(communityAutomationsPath(community.id), { method: "POST", body: { action: on ? "resume" : "pause", id: a.id } })
    if (!r.ok) {
      put(was)
      setError("error" in r ? r.error : null)
    } else setError(null)
  }

  if (!listed?.ready || listed.automations.length === 0) return null
  const channel = (id: string | null) => listed.channels.find((c) => c.id === id)?.name ?? null
  return (
    <section aria-label={tt("Automated messages in {name}", { name: community.name })} data-email-group="community-automations" data-community={community.id}>
      <h4 className={cn("text-[12.5px] font-medium text-[#6b7280]", bare ? "px-4 pb-1.5 pt-3 sm:px-5" : "mb-1.5 mt-3")}>{titled ? community.name : tt("Automated messages")}</h4>
      <ul className={cn("divide-y divide-[#f1f2f4]", bare ? "border-y border-[#f1f2f4]" : "overflow-hidden rounded-xl border border-[#eceef1]")}>
        {listed.automations.map((a) => {
          const on = automationSwitch(a)
          const sent = a.sent ? tt("{n} sent", { n: a.sent }) : null
          return (
            <li key={a.id} className="flex items-center" data-community-automation={a.id}>
              <button
                type="button"
                onClick={onOpen}
                className={cn("flex min-h-[60px] min-w-0 flex-1 items-center gap-3 py-3 text-left outline-none transition-colors duration-100 hover:bg-[#fafafa] focus-visible:bg-[#f4f5f7] active:bg-[#f4f5f7] [-webkit-tap-highlight-color:transparent]", bare ? "pl-4 pr-2 sm:pl-5" : "pl-3.5 pr-2")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{a.name}</span>
                  <span className="block text-[12.5px] leading-[18px] text-[#6b7280]">{`${whenLine(a, channel(a.spaceId))} · ${statusWord(a)}`}</span>
                  {sent ? <span className="mt-0.5 block text-[12px] tabular-nums leading-4 text-[#9ca3af] md:hidden">{sent}</span> : null}
                </span>
                {sent ? <span className="hidden shrink-0 text-[12.5px] tabular-nums text-[#6b7280] md:block">{sent}</span> : null}
              </button>
              <span className={cn("flex h-11 shrink-0 items-center", bare ? "pr-4 sm:pr-5" : "pr-3.5")}>
                {on === null ? null : <Switch checked={on} disabled={!listed.canEdit} onCheckedChange={(v) => void toggle(a, v)} aria-label={tt("Send {name} automatically", { name: a.name })} />}
              </span>
            </li>
          )
        })}
      </ul>
      {error ? <p className={cn("mt-2 text-[13px] text-[#b42318]", bare && "px-4 pb-2 sm:px-5")}>{error}</p> : null}
    </section>
  )
}
