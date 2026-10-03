"use client"

/**
 * ===========================================================================
 *  FOLLOWERS AND FOLLOWING
 * ===========================================================================
 * Opened from the counts under a person's name. A centred dialog on a
 * computer and the shared bottom sheet on a phone (SheetDialog), with the
 * two lists side by side as a choice at the top so the one not opened is a
 * press away. Each person is a row: photo, name, @handle, opening their
 * page, and a Follow button for everyone but the viewer.
 *
 * The list is paged by the server (GET /api/follow/list, a keyset cursor,
 * thirty at a time); "Show more" asks for the next page, never the whole
 * graph. A list is read again each time it is opened, so a follow made on
 * the page is in it.
 */
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { secondaryDepth } from "@/components/ui/depth-button"
import { useIsPhone } from "@/components/storefront/use-is-phone"
import { cn } from "@/lib/utils"
import { FollowButton, useFollow } from "./follow-button"

export type FollowListKind = "followers" | "following"

interface Person {
  id: string
  name: string
  username: string | null
  avatarUrl: string | null
  href: string
  followedByViewer: boolean
  isViewer: boolean
}

function PersonRow({ person, signedIn }: { person: Person; signedIn: boolean }) {
  const follow = useFollow({ targetUserId: person.id, initialFollowing: person.followedByViewer, signedIn })
  return (
    <li className="flex min-h-[56px] items-center gap-3 py-2" data-follow-person="">
      <Link href={person.href} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20">
        <AppAvatar src={person.avatarUrl} name={person.name} size={40} className="h-10 w-10 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold leading-[1.3] text-[#1a1a2e]">{person.name}</span>
          {person.username ? <span className="block truncate text-[13px] leading-[1.35] text-[#6b7280]">@{person.username}</span> : null}
        </span>
      </Link>
      {person.isViewer ? (
        <span className="shrink-0 px-2 text-[13px] text-[#9ca3af]">You</span>
      ) : (
        <FollowButton following={follow.following} busy={follow.busy} onClick={follow.toggle} size="sm" name={person.name} />
      )}
    </li>
  )
}

export function FollowListSheet({
  userId,
  name,
  open,
  initialList,
  onClose,
  signedIn,
  counts,
}: {
  userId: string
  name: string
  open: boolean
  initialList: FollowListKind
  onClose: () => void
  signedIn: boolean
  counts: { followers: number; following: number }
}) {
  const phone = useIsPhone()
  const [list, setList] = useState<FollowListKind>(initialList)
  const [people, setPeople] = useState<Person[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [state, setState] = useState<"idle" | "loading" | "error">("idle")
  const asked = useRef(0)

  const load = useCallback(
    async (which: FollowListKind, cursor: string | null) => {
      const ticket = ++asked.current
      setState("loading")
      try {
        const qs = new URLSearchParams({ userId, list: which })
        if (cursor) qs.set("cursor", cursor)
        const res = await fetch(`/api/follow/list?${qs}`, { credentials: "include", cache: "no-store" })
        if (!res.ok) throw new Error("list")
        const data = (await res.json()) as { people: Person[]; next: string | null }
        if (ticket !== asked.current) return
        setPeople((prev) => (cursor ? [...prev, ...data.people.filter((p) => !prev.some((q) => q.id === p.id))] : data.people))
        setNext(data.next)
        setState("idle")
      } catch {
        if (ticket === asked.current) setState("error")
      }
    },
    [userId],
  )

  useEffect(() => {
    if (!open) return
    setList(initialList)
    setPeople([])
    setNext(null)
    void load(initialList, null)
  }, [open, initialList, load])

  const pick = (which: FollowListKind) => {
    if (which === list) return
    setList(which)
    setPeople([])
    setNext(null)
    void load(which, null)
  }

  const empty = state === "idle" && people.length === 0
  return (
    <SheetDialog open={open} onClose={onClose} phone={phone} label={`${name}: ${list}`} className="flex max-h-[min(640px,85vh)] max-w-[440px] flex-col gap-0 rounded-2xl p-0">
      <div className="px-5 pb-3 pt-5 sm:px-6" data-follow-list={list}>
        <SheetDialogTitle className="truncate pr-8 text-[17px] font-semibold text-[#1a1a2e]">{name}</SheetDialogTitle>
        <div role="tablist" aria-label="Followers and following" className="mt-3 grid grid-cols-2 rounded-xl bg-[#f1f2f4] p-1">
          {(["followers", "following"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={list === k}
              onClick={() => pick(k)}
              data-follow-list-tab={k}
              className={cn(
                "h-10 rounded-[9px] text-[13px] font-medium transition-[background-color,color,box-shadow] duration-150 [-webkit-tap-highlight-color:transparent]",
                list === k ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "text-[#6b7280] hover:text-[#1a1a2e]",
              )}
            >
              {k === "followers" ? `Followers ${counts.followers}` : `Following ${counts.following}`}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-[160px] flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6" data-follow-list-body="">
        {people.length > 0 ? (
          <ul className="divide-y divide-[#f0f1f3]">
            {people.map((p) => (
              <PersonRow key={p.id} person={p} signedIn={signedIn} />
            ))}
          </ul>
        ) : null}
        {empty ? (
          <p className="py-10 text-center text-[14px] text-[#6b7280]" data-follow-list-empty="">
            {list === "followers" ? "No followers yet." : "Not following anyone yet."}
          </p>
        ) : null}
        {state === "loading" && people.length === 0 ? (
          <div className="flex justify-center py-10 text-[#9ca3af]">
            <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
          </div>
        ) : null}
        {state === "error" ? (
          <p role="alert" className="py-6 text-center text-[13px] text-[#b42318]">
            That did not load.{" "}
            <button type="button" className="font-medium underline" onClick={() => void load(list, people.length ? next : null)}>
              Try again
            </button>
          </p>
        ) : null}
        {next && state !== "error" ? (
          <div className="pt-3">
            <button type="button" disabled={state === "loading"} onClick={() => void load(list, next)} className={cn(secondaryDepth, "h-10 w-full rounded-xl text-[14px]")} data-follow-list-more="">
              {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Show more
            </button>
          </div>
        ) : null}
      </div>
    </SheetDialog>
  )
}
