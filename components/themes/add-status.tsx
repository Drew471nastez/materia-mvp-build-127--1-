"use client"

import Link from "next/link"

import type { AddState } from "./use-add-theme"

/** What happened to an Add, at the foot of the window until it is dismissed. */
export function AddStatus({ state, name, onClose }: { state: AddState; name: string | null; onClose: () => void }) {
  if (state.phase !== "added" && state.phase !== "refused") return null
  const added = state.phase === "added"
  return (
    <div role="status" data-theme-add-status={state.phase} className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
      <div className="flex max-w-[560px] items-center gap-3 rounded-xl bg-[#1a1a2e] px-4 py-3 text-[14px] text-white shadow-[0_12px_40px_-12px_rgba(17,24,39,0.55)]">
        <span className="min-w-0">{added ? `${name ?? "The theme"} is in your library.` : state.text}</span>
        {added ? (
          <Link href="/app/website-builder" className="shrink-0 font-semibold underline decoration-white/40 underline-offset-2 hover:decoration-white">
            Open library
          </Link>
        ) : state.code === "needs_pro" ? (
          <Link href="/pricing" className="shrink-0 font-semibold underline decoration-white/40 underline-offset-2 hover:decoration-white">
            See Pro
          </Link>
        ) : null}
        <button type="button" onClick={onClose} aria-label="Dismiss" className="-mr-1 shrink-0 rounded-md px-1.5 text-white/60 hover:text-white">
          ×
        </button>
      </div>
    </div>
  )
}
