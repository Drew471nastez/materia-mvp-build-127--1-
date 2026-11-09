"use client"

/**
 * ===========================================================================
 *  START WITH AI: THE CANVAS WHILE THE SITE IS BEING MADE (round N, N1)
 * ===========================================================================
 * What the canvas shows while a build is live and the open page has nothing
 * of its own yet. It used to be the theme's header and footer around
 * "EMPTY PAGE, Create your beautiful page by adding sections", or a white
 * page, which read as "it took me to the default theme" and "nothing is
 * happening". Now it is one quiet, intentional state: what the AI is on, in
 * plain words, and where the sections will appear. It is replaced section by
 * section as the build places them (the editor reads the drafts again on
 * each change, ./live-build.ts).
 *
 * Also the editor shell's canvas on the Website page between the press of
 * Create and the editor (StartingShell below), so the person sees the same
 * thing from the press to the first section.
 *
 * Not a skeleton (round 16, the owner: no grey outline of a page while
 * waiting): a small mark, a title and a line. Motion is CSS on transform and
 * opacity (.wb-building-mark in app/globals.css), a still mark under reduced
 * motion.
 */
import * as React from "react"
import { createPortal } from "react-dom"
import { tt } from "@/lib/i18n/text"

function Mark() {
  return (
    <span aria-hidden className="wb-building-mark" data-building-mark="">
      <span />
      <span />
      <span />
    </span>
  )
}

export function BuildingCanvas({ title, step, note }: { title?: string; step?: string | null; note?: string | null }) {
  return (
    <div data-building-canvas="" className="flex min-h-[60vh] flex-1 items-center justify-center px-6 py-20 text-center">
      <div className="flex max-w-[360px] flex-col items-center">
        <Mark />
        <p className="mt-5 text-[17px] font-semibold tracking-tight text-[#1a1a2e]" data-building-title="">
          {title ?? tt("Designing your website")}
        </p>
        <p role="status" aria-live="polite" className="mt-1 min-h-[20px] text-[14px] leading-snug text-[#4b5563]" data-building-step="">
          {step ?? tt("Getting started")}
        </p>
        <p className="mt-4 text-[12.5px] leading-snug text-[#9ca3af]">{note ?? tt("Sections show up here as they are made.")}</p>
      </div>
    </div>
  )
}

/**
 * THE EDITOR'S SHELL, AT ONCE. Start with AI was a spinner in the Create
 * button for as long as the website took to be made, then a page change,
 * then "Loading the editor". From the press, the Website page now draws the
 * editor's frame (its white bar, the grey stage, the canvas card) with the
 * building state in it, and the editor takes over the same picture.
 */
export function StartingShell({ step }: { step?: string | null }) {
  /* On the body, so no transformed or clipped box of the page it is drawn from can hold it in. */
  const [host, setHost] = React.useState<HTMLElement | null>(null)
  React.useEffect(() => setHost(document.body), [])
  /* The page under it does not scroll while it is up. */
  React.useEffect(() => {
    const html = document.documentElement
    const was = html.style.overflow
    html.style.overflow = "hidden"
    return () => {
      html.style.overflow = was
    }
  }, [])
  const shell = (
    <div data-starting-shell="" role="dialog" aria-modal="true" aria-label={tt("Opening the website builder")} className="fixed inset-0 z-[200] flex flex-col bg-[#f4f5f7]">
      {/* The editor's bar: dark, as the editor draws it (--wb-chrome-bg in app/globals.css). */}
      <div className="flex h-[calc(48px+env(safe-area-inset-top))] shrink-0 items-center gap-2.5 bg-[#171717] px-4 pt-[env(safe-area-inset-top)]">
        <span className="text-[14px] font-semibold text-white">{tt("New website")}</span>
        <span className="text-[13px] text-white/60">{tt("Draft")}</span>
      </div>
      {/* The sidebar's card and the canvas's card, where the editor puts them; the sidebar fills in when the editor is up. */}
      <div className="flex min-h-0 flex-1 gap-1.5 p-0 md:px-1.5 md:pt-1.5">
        <div aria-hidden className="hidden w-[288px] shrink-0 rounded-t-[14px] bg-white md:block" />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white md:rounded-t-[20px]">
          <BuildingCanvas step={step ?? tt("Setting up your website")} />
        </div>
      </div>
    </div>
  )
  return host ? createPortal(shell, host) : shell
}
