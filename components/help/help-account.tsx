"use client"

import { AppAvatar } from "@/components/app/app-avatar"
import * as React from "react"
import { ArrowUpRight, LayoutGrid, LogOut, Mail, Settings, Compass, Library, UserRound } from "lucide-react"
import { mainSiteUrl } from "@/lib/help/paths"
import { SUPPORT_EMAIL } from "@/lib/help/articles"

type Me = { signedIn: false } | { signedIn: true; kind?: "seller" | "buyer"; name: string; email: string | null; avatarUrl: string | null }

/** storelib.com's own origin, where the session lives (help.storelib.com asks it). Empty on a local run: the same host. */
function mainOrigin(): string {
  return mainSiteUrl("/").replace(/\/$/, "")
}

/**
 * THE HELP CENTER'S ACCOUNT MENU, like Shopify's: your photo at the right
 * of the bar, a small menu under it. A store owner gets their dashboard and
 * settings; a buyer gets their purchases and account. Both get Explore,
 * support and Log out. Every link is to storelib.com itself, never a path on
 * help.storelib.com. Signed out, a Log in button that comes back here. The
 * answer comes from storelib.com (app/api/help/me), where the session is.
 */
export function HelpAccount() {
  const [me, setMe] = React.useState<Me | null>(null)
  const [open, setOpen] = React.useState(false)
  const [shown, setShown] = React.useState(false)
  const box = React.useRef<HTMLDivElement>(null)
  const origin = mainOrigin()

  React.useEffect(() => {
    let live = true
    fetch(`${origin}/api/help/me`, { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { signedIn: false }))
      .then((d: Me) => live && setMe(d))
      .catch(() => live && setMe({ signedIn: false }))
    return () => {
      live = false
    }
  }, [origin])

  React.useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => setShown(true))
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("pointerdown", away)
    document.addEventListener("keydown", key)
    return () => {
      cancelAnimationFrame(raf)
      setShown(false)
      document.removeEventListener("pointerdown", away)
      document.removeEventListener("keydown", key)
    }
  }, [open])

  if (!me) return <span aria-hidden className="h-9 w-9 rounded-full bg-[#f3f4f6]" />
  if (!me.signedIn) {
    return (
      <a
        href={`${origin}/login?next=${encodeURIComponent(typeof window === "undefined" ? "/" : window.location.href)}`}
        className="inline-flex h-9 items-center rounded-lg bg-[#1a1a2e] px-3.5 text-[13.5px] font-medium text-white shadow-[0_1px_2px_rgba(16,24,40,0.12),inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors hover:bg-[#2b2b42]"
      >
        Log in
      </a>
    )
  }

  const logOut = async () => {
    try {
      await fetch(`${origin}/api/help/logout`, { method: "POST", credentials: "include" })
    } catch {
      /* the page reloads either way */
    }
    window.location.reload()
  }
  const row = "flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] text-[#374151] transition-colors hover:bg-[#f5f6f7] hover:text-[#1a1a2e]"

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Your account"
        onClick={() => setOpen((v) => !v)}
        className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-[#eef0f2] text-[13px] font-semibold text-[#1a1a2e] shadow-[0_0_0_1px_rgba(17,24,39,0.08),0_1px_2px_rgba(17,24,39,0.08)] outline-none transition-[box-shadow,transform] duration-200 hover:shadow-[0_0_0_1px_rgba(17,24,39,0.14),0_2px_6px_rgba(17,24,39,0.12)] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 active:scale-[0.97]"
      >
        <AppAvatar src={me.avatarUrl} name={me.name} alt="" size={36} />
      </button>
      {open ? (
        <div
          role="menu"
          className={`absolute right-0 top-[calc(100%+8px)] z-50 w-[260px] origin-top-right rounded-2xl border border-[#e5e7eb] bg-white p-1.5 shadow-[0_18px_40px_-12px_rgba(17,24,39,0.25),0_2px_6px_rgba(17,24,39,0.06)] transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${shown ? "translate-y-0 scale-100 opacity-100" : "-translate-y-1 scale-[0.98] opacity-0"}`}
        >
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="truncate text-[13.5px] font-semibold text-[#1a1a2e]">{me.name}</p>
            {me.email ? <p className="truncate text-[12.5px] text-[#6b7280]">{me.email}</p> : null}
          </div>
          <div className="my-1 h-px bg-[#f1f2f4]" />
          {me.kind === "buyer" ? (
            <>
              <a role="menuitem" href={`${origin}/account/library`} className={row}>
                <Library className="h-4 w-4 text-[#6b7280]" strokeWidth={1.75} />
                <span className="flex-1">Your purchases</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-[#9ca3af]" />
              </a>
              <a role="menuitem" href={`${origin}/account`} className={row}>
                <UserRound className="h-4 w-4 text-[#6b7280]" strokeWidth={1.75} />
                Your account
              </a>
            </>
          ) : (
            <>
              <a role="menuitem" href={`${origin}/app`} className={row}>
                <LayoutGrid className="h-4 w-4 text-[#6b7280]" strokeWidth={1.75} />
                <span className="flex-1">Go to dashboard</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-[#9ca3af]" />
              </a>
              <a role="menuitem" href={`${origin}/app/settings`} className={row}>
                <Settings className="h-4 w-4 text-[#6b7280]" strokeWidth={1.75} />
                Settings
              </a>
              <a role="menuitem" href={`${origin}/account/library`} className={row}>
                <Library className="h-4 w-4 text-[#6b7280]" strokeWidth={1.75} />
                Your purchases
              </a>
            </>
          )}
          <a role="menuitem" href={`${origin}/explore`} className={row}>
            <Compass className="h-4 w-4 text-[#6b7280]" strokeWidth={1.75} />
            Explore
          </a>
          <a role="menuitem" href={`mailto:${SUPPORT_EMAIL}`} className={row}>
            <Mail className="h-4 w-4 text-[#6b7280]" strokeWidth={1.75} />
            Contact support
          </a>
          <div className="my-1 h-px bg-[#f1f2f4]" />
          <button role="menuitem" type="button" onClick={() => void logOut()} className={row}>
            <LogOut className="h-4 w-4 text-[#6b7280]" strokeWidth={1.75} />
            Log out
          </button>
        </div>
      ) : null}
    </div>
  )
}

