"use client"

/**
 * ===========================================================================
 *  INVITE PEOPLE: THE COMMUNITY'S SHARE SHEET
 * ===========================================================================
 * "Invite people" in the bar's "..." menu opens this: a centred dialog on a
 * computer, Storelib's own bottom sheet on a phone (components/ui/
 * sheet-dialog.tsx, the sheet every other one uses).
 *
 * ROUND 10: SIMPLER. Fewer words and one obvious action:
 *
 *   THE LINK    the community's address, storelib.com/community/<slug>, as
 *               one quiet line, and under it Copy link, the one filled
 *               button. One short line says what the link does, from how the
 *               community lets people in.
 *   SHARE       beside Copy link: the phone's own share sheet where there is
 *               one, Email where there is not (a computer), never a dead
 *               button.
 *   STAFF       the owner and its admins (can("invite")) get one quiet row,
 *               "Private invites", that opens in place to the invites the
 *               creator side makes: one for an email address (sent, used
 *               once) or a link with an end date and a number of uses,
 *               through POST /api/community/<id>/invites
 *               (lib/communities/server/invites.ts). An invite lets somebody
 *               straight in: no payment, no request. Its link is shown once,
 *               with Copy, because only its hash is kept.
 *
 * Calm on purpose: white, hairlines, ink for the one primary action, no
 * violet, no pills.
 */
import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { AltArrowDownIcon } from "@solar-icons/react/linear/alt-arrow-down"
import { CheckCircleIcon } from "@solar-icons/react/bold/check-circle"
import { CopyIcon } from "@solar-icons/react/linear/copy"
import { LetterIcon } from "@solar-icons/react/linear/letter"
import { LinkMinimalistic2Icon } from "@solar-icons/react/linear/link-minimalistic-2"
import { ShareIcon } from "@solar-icons/react/linear/share"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import type { CommunityAccess } from "@/lib/communities/types"
import { cn } from "@/lib/utils"
import { api, apiBase } from "./api"
import { CommunityMark } from "./community-mark"
import { DEPTH, DEPTH_INK, DEPTH_PRESS, FIELD } from "./ui"

export interface InviteSheetCommunity {
  id: string
  slug: string
  name: string
  logoUrl: string | null
  access?: CommunityAccess
  approvalRequired?: boolean
}

/** The address a shared link carries: the community's canonical one, never the page the person is on. */
export function communityShareUrl(slug: string): string {
  return `https://storelib.com/community/${slug}`
}

/** What the shared link does for whoever opens it, in a few words (round 10: fewer words). */
export function shareLinkLine(c: Pick<InviteSheetCommunity, "access" | "approvalRequired">): string {
  if (c.access === "invite_only") return "This community is invite only. People need an invite from an admin."
  if (c.approvalRequired) return "People with the link ask to join, and an admin approves."
  if (c.access === "paid") return "People with the link see the price and pay to join."
  if (c.access === "product" || c.access === "custom") return "People with the link see how to get in."
  return "Anyone with the link can join for free."
}

/** What a staff invite does here, in one line. */
export function staffInviteLine(c: Pick<InviteSheetCommunity, "access" | "approvalRequired">): string {
  if (c.access === "paid" || c.access === "product" || c.access === "custom") return "An invite lets someone in without paying."
  if (c.access === "invite_only" || c.approvalRequired) return "An invite lets someone in without a request."
  return "An invite lets someone in directly, on your default tier."
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    /* An older webview, or a page without clipboard permission. */
    try {
      const area = document.createElement("textarea")
      area.value = text
      area.setAttribute("readonly", "")
      area.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none"
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand("copy")
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}

function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return phone
}

const SECONDARY = `inline-flex h-11 min-w-0 select-none items-center justify-center gap-2 rounded-xl ${DEPTH} ${DEPTH_PRESS} px-3.5 text-[14.5px] font-medium text-[#1a1a2e] outline-none transition-[background-color,box-shadow] hover:bg-[#f6f7f8] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 disabled:opacity-50 sm:h-10 sm:text-[14px] [-webkit-tap-highlight-color:transparent]`
/* A native select (the phone's own picker), squared like the fields, with its own chevron drawn over it (Chevron below). */
const SELECT = "h-11 w-full min-w-0 cursor-pointer appearance-none truncate rounded-xl border border-[#e3e4e8] bg-white pl-3 pr-8 text-[15px] font-medium text-[#1a1a2e] outline-none focus:border-[#c9ccd3] focus:ring-2 focus:ring-[#1a1a2e]/[0.06] sm:h-10 sm:text-[14px]"
function Chevron() {
  return <AltArrowDownIcon size={16} className="pointer-events-none absolute bottom-3.5 right-2.5 text-[#6b7280] sm:bottom-3" aria-hidden />
}
const PRIMARY = `inline-flex h-11 shrink-0 select-none items-center justify-center gap-1.5 rounded-xl ${DEPTH_INK} px-4 text-[14.5px] font-semibold text-white outline-none transition-[background-color,box-shadow] hover:bg-[#2b2b42] active:shadow-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 disabled:pointer-events-none disabled:opacity-50 sm:h-10 sm:text-[14px] [-webkit-tap-highlight-color:transparent]`

/**
 * A link as one control: the address and Copy, which says Copied for a
 * moment. The address is drawn in two parts so the part that matters stays
 * in view on a phone: the muted lead (storelib.com/community/) gives way
 * first, the community's own name (or the invite's) is kept, in ink.
 */
export function splitShareUrl(url: string): { lead: string; tail: string } {
  const shown = url.replace(/^https?:\/\//, "")
  const m = shown.match(/^(.*?\/community\/)(.*)$/)
  if (!m) return { lead: "", tail: shown }
  const [, lead, rest] = m
  /* An invite: the community is part of the lead, the invite is the tail. */
  const join = rest.indexOf("/join")
  return join > 0 ? { lead: `${lead}${rest.slice(0, join + 1)}`, tail: rest.slice(join + 1) } : { lead, tail: rest }
}

/** Copy, and what it said for a moment after: "yes", "no" (the clipboard refused), or null. */
function useCopy(text: string): ["yes" | "no" | null, () => Promise<void>] {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null)
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])
  const copy = async () => {
    const ok = await copyText(text)
    setCopied(ok ? "yes" : "no")
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(null), 1800)
  }
  return [copied, copy]
}

function LinkRow({ url, label, primary = false, testId }: { url: string; label: string; primary?: boolean; testId: string }) {
  const [copied, copy] = useCopy(url)
  const { lead, tail } = splitShareUrl(url)
  return (
    <div className="flex items-center gap-2" data-invite-link={testId}>
      <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#e3e4e8] bg-[#f8f9fa] pl-3 pr-3 sm:h-10" aria-label={`${label}: ${url}`} role="group">
        <LinkMinimalistic2Icon size={17} className="shrink-0 text-[#8a8f98]" aria-hidden />
        <span className="flex min-w-0 flex-1 select-all items-baseline text-[15px] sm:text-[14px]" data-invite-url={`${lead}${tail}`}>
          <span className="min-w-0 flex-initial truncate text-[#8a8f98]">{lead}</span>
          <span className="max-w-[78%] shrink-0 truncate font-medium text-[#1a1a2e]">{tail}</span>
        </span>
      </div>
      <button
        type="button"
        className={cn(primary ? PRIMARY : SECONDARY, "w-[96px] shrink-0")}
        onClick={() => void copy()}
        data-invite-copy={testId}
        aria-live="polite"
      >
        {copied === "yes" ? (
          <>
            <CheckCircleIcon size={17} className={primary ? "text-white" : "text-[#22a06b]"} aria-hidden />
            Copied
          </>
        ) : copied === "no" ? (
          "Try again"
        ) : (
          <>
            <CopyIcon size={17} aria-hidden />
            Copy
          </>
        )}
      </button>
    </div>
  )
}

type Made = { url: string; note: string }

/** The owner's and admins' half: an email invite or a private link, the creator side's invites, made from here. */
function StaffInvites({ community, manageHref }: { community: InviteSheetCommunity; manageHref: string | null }) {
  const [email, setEmail] = useState("")
  const [days, setDays] = useState("30")
  const [uses, setUses] = useState("")
  const [busy, setBusy] = useState<"email" | "link" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [made, setMade] = useState<Made | null>(null)
  const [staffOpen, setStaffOpen] = useState(false)
  const panelId = useId()
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const make = async (kind: "email" | "link") => {
    setBusy(kind)
    setError(null)
    const res = await api<{ invite?: { url?: string }; sent?: boolean | null }>(`${apiBase(community.id)}/invites`, {
      body: kind === "email" ? { email: email.trim() } : { maxUses: uses || undefined, expiresInDays: days === "never" ? undefined : days },
    })
    setBusy(null)
    if (res.ok === false) return setError(res.error)
    const url = res.data.invite?.url
    if (!url) return setError("The invite could not be made. Try again.")
    if (kind === "email") {
      setMade({ url, note: res.data.sent ? `Sent to ${email.trim()}. The link works once, for that address.` : `The email could not be sent just now. Send ${email.trim()} this link yourself.` })
      setEmail("")
    } else {
      setMade({ url, note: "Copy it now: an invite link is shown once." })
    }
  }

  return (
    /*
      ONE QUIET ROW, CLOSED AT FIRST (round 10: "staff options tucked behind one quiet row"). Pressed, it opens in place: the panel's
      height eases from 0 to its own (a grid row from 0fr to 1fr, nothing measured), its content fades in, the chevron turns.
    */
    <section className="mt-4 border-t border-[#eceef1] pt-1" data-invite-staff="" data-open={staffOpen ? "true" : "false"}>
      <button
        type="button"
        aria-expanded={staffOpen}
        aria-controls={panelId}
        onClick={() => setStaffOpen((o) => !o)}
        className="group/staff -mx-2 flex h-11 w-[calc(100%+16px)] items-center justify-between gap-3 rounded-xl px-2 text-left outline-none transition-colors duration-150 hover:bg-[#f6f7f8] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 active:bg-[#f1f2f4] [-webkit-tap-highlight-color:transparent]"
        data-invite-staff-toggle=""
      >
        <span className="min-w-0 text-[14.5px] font-medium text-[#1a1a2e]">Private invites</span>
        <AltArrowDownIcon size={18} className={cn("shrink-0 text-[#8a8f98] transition-[rotate] duration-200 ease-sheet motion-reduce:transition-none", staffOpen && "rotate-180")} aria-hidden />
      </button>
      <div id={panelId} className={cn("grid transition-[grid-template-rows] duration-250 ease-sheet motion-reduce:transition-none", staffOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")} data-invite-staff-panel="">
        <div className={cn("min-h-0 overflow-hidden transition-opacity duration-200 motion-reduce:transition-none", staffOpen ? "opacity-100" : "opacity-0")} inert={!staffOpen || undefined}>
          <div className="px-px pb-1 pt-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 text-[13px] leading-snug text-[#6b7280]">{staffInviteLine(community)}</p>
              {manageHref ? (
                <Link href={manageHref} className="shrink-0 text-[13px] font-medium text-[#4b5563] underline-offset-4 hover:text-[#1a1a2e] hover:underline" data-invite-manage="">
                  Manage invites
                </Link>
              ) : null}
            </div>

            <form
              className="mt-3 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (validEmail && !busy) void make("email")
              }}
            >
              <label className="min-w-0 flex-1">
                <span className="sr-only">Email address</span>
                <input type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value.slice(0, 254))} placeholder="name@example.com" className={cn(FIELD, "h-11 sm:h-10")} data-invite-email="" />
              </label>
              <button type="submit" disabled={!validEmail || !!busy} className={cn(SECONDARY, "w-[96px] shrink-0")} data-invite-send="">
                {busy === "email" ? "Sending" : "Send"}
              </button>
            </form>

            <div className="mt-3 grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <label className="relative block min-w-0">
                <span className="mb-1 block text-[12.5px] font-medium text-[#6b7280]">Works for</span>
                <select value={days} onChange={(e) => setDays(e.target.value)} className={SELECT} data-invite-days="">
                  <option value="1">1 day</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="never">No end date</option>
                </select>
                <Chevron />
              </label>
              <label className="relative block min-w-0">
                <span className="mb-1 block text-[12.5px] font-medium text-[#6b7280]">Uses</span>
                <select value={uses} onChange={(e) => setUses(e.target.value)} className={SELECT} data-invite-uses="">
                  <option value="">No limit</option>
                  <option value="1">1 person</option>
                  <option value="10">10 people</option>
                  <option value="50">50 people</option>
                  <option value="100">100 people</option>
                </select>
                <Chevron />
              </label>
              <button type="button" disabled={!!busy} onClick={() => void make("link")} className={cn(SECONDARY, "col-span-2 sm:col-span-1")} data-invite-create="">
                {busy === "link" ? "Making" : "Create link"}
              </button>
            </div>

            {error ? (
              <p role="alert" className="mt-2.5 text-[13px] text-[#b42318]" data-invite-error="">
                {error}
              </p>
            ) : null}
            {made ? (
              <div className="mt-3 space-y-1.5" data-invite-made="">
                <LinkRow url={made.url} label="Invite link" testId="made" />
                <p className="text-[12.5px] leading-snug text-[#6b7280]">{made.note}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}

export function InviteSheet({ open, onClose, community, staff = false, manageHref = null }: { open: boolean; onClose: () => void; community: InviteSheetCommunity; staff?: boolean; manageHref?: string | null }) {
  const phone = usePhone()
  const url = communityShareUrl(community.slug)
  const [canShare, setCanShare] = useState(false)
  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), [])
  const text = `Join me in ${community.name} on Storelib`
  const mail = `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(`${text}:\n${url}`)}`
  const { lead, tail } = splitShareUrl(url)
  const [copied, copy] = useCopy(url)

  return (
    <SheetDialog open={open} onClose={onClose} phone={phone} label={`Invite people to ${community.name}`} className="max-w-[460px] gap-0 rounded-2xl p-6">
      <div className={cn("min-w-0", phone && "px-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-1")} data-invite-sheet="">
        <div className="flex min-w-0 items-center gap-3 pr-8">
          <CommunityMark community={community} size={44} />
          <div className="min-w-0">
            <SheetDialogTitle className="text-[18px] font-semibold leading-6 text-[#1a1a2e]">Invite people</SheetDialogTitle>
            <p className="truncate text-[13.5px] leading-5 text-[#6b7280]">{community.name}</p>
          </div>
        </div>
        {/* The address, quiet, then the one filled button: Copy link. Share (or Email on a computer) beside it. One short line under. */}
        <div className="mt-5 flex h-11 min-w-0 items-center gap-2 rounded-xl border border-[#e8eaee] bg-[#f8f9fa] px-3 sm:h-10" role="group" aria-label={`Community link: ${url}`}>
          <LinkMinimalistic2Icon size={17} className="shrink-0 text-[#8a8f98]" aria-hidden />
          <span className="flex min-w-0 flex-1 select-all items-baseline text-[15px] sm:text-[14px]" data-invite-url={`${lead}${tail}`}>
            <span className="min-w-0 flex-initial truncate text-[#8a8f98]">{lead}</span>
            <span className="max-w-[78%] shrink-0 truncate font-medium text-[#1a1a2e]">{tail}</span>
          </span>
        </div>
        <div className="mt-2.5 flex gap-2">
          <button type="button" className={cn(PRIMARY, "min-w-0 flex-1")} onClick={() => void copy()} data-invite-copy="community" aria-live="polite">
            {copied === "yes" ? (
              <>
                <CheckCircleIcon size={18} className="text-white" aria-hidden />
                Copied
              </>
            ) : copied === "no" ? (
              "Try again"
            ) : (
              <>
                <CopyIcon size={18} aria-hidden />
                Copy link
              </>
            )}
          </button>
          {canShare ? (
            <button
              type="button"
              className={cn(SECONDARY, "w-[112px] shrink-0")}
              data-invite-share=""
              onClick={async () => {
                try {
                  await navigator.share({ title: community.name, text, url })
                } catch {
                  /* Closing the sheet is an answer, not a failure. */
                }
              }}
            >
              <ShareIcon size={18} aria-hidden />
              Share
            </button>
          ) : (
            <a href={mail} className={cn(SECONDARY, "w-[112px] shrink-0")} data-invite-mail="">
              <LetterIcon size={18} aria-hidden />
              Email
            </a>
          )}
        </div>
        <p className="mt-3 text-[13px] leading-snug text-[#6b7280]" data-invite-line="">
          {shareLinkLine(community)}
        </p>

        {staff ? <StaffInvites community={community} manageHref={manageHref} /> : null}
      </div>
    </SheetDialog>
  )
}
