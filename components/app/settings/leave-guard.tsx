"use client"

/**
 * ===========================================================================
 *  LEAVING SETTINGS WITH CHANGES THAT AREN'T SAVED
 * ===========================================================================
 * The dialog that asks, and every way out it stands in front of
 * (lib/settings/unsaved-guard.ts holds what is unsaved):
 *
 *   another section        the form calls requestLeave before it switches
 *   closing the sheet      the close button, Escape, the dim, a drag
 *                          (components/app/settings-sheet.tsx)
 *   a link out             the nav pill, the header, the sidebar, a link in a
 *                          card: a press on any link to another page of ours
 *                          is caught before the router sees it
 *   Back                   the browser's Back, the swipe back and Android's
 *                          button: while something is unsaved one extra entry
 *                          stands in front of Settings in the history, so the
 *                          first Back lands on it and asks instead of leaving
 *
 * Save, Discard, Keep editing. A save that fails keeps the dialog up with the
 * reason, so nothing typed is lost. A computer gets a small dialog over the
 * sheet; a phone gets the app's own bottom sheet.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { useModalPhone } from "@/components/physical/ui"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { cn } from "@/lib/utils"
import { takeTraversal } from "@/lib/ui/app-navigation"
import { discardAllUnsaved, hasUnsaved, requestLeave, saveAllUnsaved, setLeaveAsker, subscribeUnsaved } from "@/lib/settings/unsaved-guard"

/** The extra history entry's mark (see Back, above). */
const GUARD_KEY = "__settingsUnsaved"

export function useHasUnsaved(): boolean {
  return React.useSyncExternalStore(subscribeUnsaved, hasUnsaved, () => false)
}

export function SettingsLeaveGuard() {
  const router = useRouter()
  const phone = useModalPhone()
  const dirty = useHasUnsaved()
  const [pending, setPending] = React.useState<null | (() => void)>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  /* The one that asks. */
  React.useEffect(() => {
    setLeaveAsker((go) => {
      setError(null)
      setPending(() => go)
    })
    return () => setLeaveAsker(null)
  }, [])

  /* A link out, caught on the way down, before React and the router see it. */
  React.useEffect(() => {
    if (!dirty) return
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return
      /* A link inside a dialog over Settings is that dialog's business. */
      if (a.closest("[data-settings-leave-guard]")) return
      let url: URL
      try {
        url = new URL(a.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname) return
      e.preventDefault()
      e.stopPropagation()
      const href = url.pathname + url.search + url.hash
      requestLeave(() => router.push(href))
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [dirty, router])

  /* Back: one entry in front while something is unsaved. */
  const guarded = React.useRef(false)
  const ignorePop = React.useRef(false)
  React.useEffect(() => {
    if (!dirty || guarded.current) return
    try {
      window.history.pushState({ ...(window.history.state ?? {}), [GUARD_KEY]: true }, "", window.location.href)
      guarded.current = true
    } catch {
      /* A history that refuses: the dialog still stands in front of every other way out. */
    }
  }, [dirty])
  React.useEffect(() => {
    /*
      The extra entry has the same address as Settings, so its Back lands on
      no new page: the stage is told it was not a traversal (lib/ui/
      app-navigation markTraversal, read on the next commit), or the next
      real visit would be taken for a Back and put at an old scroll.
    */
    const notATraversal = () => window.setTimeout(() => takeTraversal(), 0)
    const onPop = () => {
      if (ignorePop.current) {
        ignorePop.current = false
        notATraversal()
        return
      }
      if (!guarded.current) return
      /* The extra entry is gone: Back was pressed. */
      guarded.current = false
      notATraversal()
      if (!hasUnsaved()) return
      requestLeave(() => {
        ignorePop.current = false
        window.history.back()
      })
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])
  /* Saved or put back without leaving: the extra entry goes, so the next Back is a real one. */
  React.useEffect(() => {
    if (dirty || !guarded.current || pending) return
    /* After a moment: typing a field back to what it was and on again would otherwise go back and push again in one breath. */
    const t = window.setTimeout(() => {
      if (hasUnsaved() || !guarded.current) return
      if ((window.history.state as Record<string, unknown> | null)?.[GUARD_KEY]) {
        guarded.current = false
        ignorePop.current = true
        window.history.back()
      } else guarded.current = false
    }, 600)
    return () => window.clearTimeout(t)
  }, [dirty, pending])
  /* Leaving Settings with the entry still there (Discard, then the way out it asked for). */
  React.useEffect(() => () => {
    guarded.current = false
  }, [])

  const keep = () => {
    if (busy) return
    setPending(null)
    setError(null)
    /* Back was what asked: stand in front of it again. */
    if (!guarded.current && hasUnsaved()) {
      try {
        window.history.pushState({ ...(window.history.state ?? {}), [GUARD_KEY]: true }, "", window.location.href)
        guarded.current = true
      } catch {
        /* nothing to stand in front of */
      }
    }
  }
  const leave = (go: () => void) => {
    setPending(null)
    /* The extra entry is passed over on the way out. */
    if (guarded.current && (window.history.state as Record<string, unknown> | null)?.[GUARD_KEY]) {
      guarded.current = false
      ignorePop.current = true
      window.history.back()
      window.setTimeout(go, 60)
      return
    }
    go()
  }
  const discard = () => {
    const go = pending
    if (!go || busy) return
    discardAllUnsaved()
    leave(go)
  }
  const save = async () => {
    const go = pending
    if (!go || busy) return
    setBusy(true)
    setError(null)
    const ok = await saveAllUnsaved()
    setBusy(false)
    if (!ok) {
      setError("That didn't save. Check the fields and try again.")
      return
    }
    leave(go)
  }

  const open = !!pending
  const body = (
    <div className="space-y-4" data-settings-leave-guard="">
      <div className={phone ? "px-1" : ""}>
        <h2 className="text-[17px] font-semibold text-[#1a1a2e]">Save your changes?</h2>
        <p className="mt-1 text-[14px] leading-[20px] text-[#6b7280]">You changed some settings and haven&apos;t saved them yet.</p>
        {error ? (
          <p role="alert" className="mt-2 text-[13.5px] text-[#b42318]">
            {error}
          </p>
        ) : null}
      </div>
      <div className={cn("flex gap-2", phone ? "flex-col" : "flex-row-reverse")}>
        <button type="button" onClick={() => void save()} disabled={busy} className={cn(primaryDepth, "h-11 gap-2 rounded-xl px-5 text-[14px] disabled:opacity-70", phone ? "w-full" : "")} data-leave-save="">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {busy ? "Saving" : "Save"}
        </button>
        <button type="button" onClick={discard} disabled={busy} className={cn(secondaryDepth, "h-11 rounded-xl px-5 text-[14px] text-[#b42318]", phone ? "w-full" : "")} data-leave-discard="">
          Discard
        </button>
        <button type="button" onClick={keep} disabled={busy} className={cn("h-11 rounded-xl px-4 text-[14px] font-medium text-[#4b5563] hover:bg-[#f3f4f6]", phone ? "w-full" : "mr-auto")} data-leave-keep="">
          Keep editing
        </button>
      </div>
    </div>
  )

  if (phone) {
    return (
      <BottomSheet isOpen={open} onClose={keep} label="Save your changes?" hideFrom={null} dismissible={!busy} zIndex={210}>
        <div className="px-4 pb-3 pt-2">{body}</div>
      </BottomSheet>
    )
  }
  return <GuardDialog open={open} onClose={keep}>{body}</GuardDialog>
}

/** A small dialog over the sheet: fades and settles in, Escape and the dim keep editing. */
function GuardDialog({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const card = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    window.addEventListener("keydown", onKey, true)
    const t = window.setTimeout(() => card.current?.querySelector<HTMLElement>("[data-leave-save]")?.focus({ preventScroll: true }), 20)
    return () => {
      window.removeEventListener("keydown", onKey, true)
      window.clearTimeout(t)
    }
  }, [open, onClose])
  if (!open || typeof document === "undefined") return null
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="presentation">
      <div aria-hidden className="absolute inset-0 bg-[rgba(17,24,39,0.36)] animate-in fade-in duration-150" onClick={onClose} />
      <div
        ref={card}
        role="alertdialog"
        aria-modal="true"
        aria-label="Save your changes?"
        className="relative w-full max-w-[420px] rounded-2xl border border-[#e5e7eb]/60 bg-white p-5 shadow-[0_24px_64px_-16px_rgba(17,24,39,0.28)] animate-in fade-in zoom-in-[0.97] duration-150"
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
