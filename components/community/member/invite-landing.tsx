"use client"

/**
 * An invite, accepted with one press. The redeem route (W3's, ARCH 4
 * `POST /api/community/<id>/invite/redeem { token }`) checks the token,
 * its limits and its email, and makes the membership; this page only says
 * what happened in words and sends the new member in.
 */
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { AppAvatar } from "@/components/app/app-avatar"
import { memberCountLabel } from "@/lib/communities/format"
import { api, apiBase } from "./api"
import { BTN_PRIMARY, BTN_SECONDARY, CARD } from "./ui"

const REASONS: Record<string, string> = {
  not_found: "This invite link does not work. Ask for a new one.",
  revoked: "This invite was withdrawn. Ask for a new one.",
  expired: "This invite has expired. Ask for a new one.",
  email_mismatch: "This invite was sent to a different email address. Sign in with that address to accept it.",
  used_up: "This invite has been used as many times as it allows.",
  banned: "You can no longer join this community.",
}

export function InviteLanding({
  community,
  token,
  state,
  loginHref,
}: {
  community: { id: string; slug: string; name: string; tagline: string | null; logoUrl: string | null; memberCount: number }
  token: string | null
  state: string
  loginHref: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(state === "banned" ? REASONS.banned : token ? null : REASONS.not_found)

  const accept = async () => {
    if (!token || busy) return
    setBusy(true)
    setError(null)
    const r = await api<{ ok?: boolean; reason?: string; error?: string }>(`${apiBase(community.id)}/invite/redeem`, { body: { token } })
    if (r.ok && r.data.ok !== false) {
      router.push(`/community/${community.slug}?welcome=1`)
      return
    }
    setBusy(false)
    const reason = r.ok ? r.data.reason : undefined
    setError((reason && REASONS[reason]) || (!r.ok ? r.error : null) || "The invite could not be accepted. Try again.")
  }

  /*
    BACK FROM SIGNING UP WITH ?accept=1 (lib/account/welcome welcomeDone):
    the invite they followed before they had an account is accepted once,
    on arrival, so a new member lands in the community rather than one more
    press away. The flag leaves the address first, so a reload never asks
    twice.
  */
  const autoAccepted = useRef(false)
  useEffect(() => {
    if (autoAccepted.current || state === "signed_out" || state === "banned" || !token) return
    const url = new URL(window.location.href)
    if (url.searchParams.get("accept") !== "1") return
    autoAccepted.current = true
    url.searchParams.delete("accept")
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
    void accept()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, token])

  return (
    <div className="min-h-[70svh] bg-[#f8f9fa] px-4 py-14 sm:py-20" data-invite="">
      <div className={`${CARD} mx-auto max-w-[440px] px-6 py-9 text-center`}>
        <AppAvatar src={community.logoUrl} name={community.name} alt="" size={64} className="mx-auto rounded-2xl" markWhileLoading />
        <p className="mt-4 text-[13.5px] text-[#6b7280]">You are invited to join</p>
        <h1 className="mt-1 text-[22px] font-bold text-[#1a1a2e]">{community.name}</h1>
        {community.tagline ? <p className="mt-2 text-[14.5px] leading-relaxed text-[#4b5563]">{community.tagline}</p> : null}
        <p className="mt-2 text-[13px] text-[#8a8f98]">{memberCountLabel(community.memberCount)}</p>
        {error ? <p className="mt-5 rounded-xl bg-[#fef1ee] px-3.5 py-2.5 text-[14px] text-[#9f2a12]">{error}</p> : null}
        <div className="mt-6 flex flex-col gap-2">
          {state === "signed_out" ? (
            <Link href={loginHref} className={BTN_PRIMARY}>
              Sign in to accept
            </Link>
          ) : token && state !== "banned" ? (
            <button type="button" className={BTN_PRIMARY} onClick={accept} disabled={busy}>
              {busy ? "Joining..." : "Accept invite"}
            </button>
          ) : null}
          <Link href={`/community/${community.slug}/about`} className={BTN_SECONDARY}>
            About {community.name}
          </Link>
        </div>
      </div>
    </div>
  )
}
