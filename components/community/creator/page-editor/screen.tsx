"use client"

/**
 * ===========================================================================
 *  THE PAGE EDITOR'S OWN SCREEN (round 37)
 * ===========================================================================
 * The owner, on an iPhone: "when I'm trying to edit the Page, make sure that
 * it is full screen, especially on mobile ... it shows the header, the
 * navigation bar at the bottom, it shows the menus, the text of the
 * community, it's absolutely horrible. Make sure it's full screen like I'm
 * getting inside of the creator page."
 *
 * So /app/community/<slug>/page is drawn over the whole window at every
 * width, the way the creator page (app/creator-page) and the website builder
 * own theirs: one light bar of its own at the top (the way back, the
 * community, the preview's controls, Save), the page below it, the editing
 * panel beside it or the drawer under it. No /app header, rail, nav pill or
 * menu button, and no community bar or row of tabs while it is up.
 *
 * WHY A LAYER AND NOT A ROUTE OUTSIDE /app. The address stays where the
 * admin's tabs, links and bookmarks already send people, and the section
 * stays one of the shell's kept places (community-shell.tsx): opened again
 * from a tab it is there on the frame of the press, with what was typed.
 * It is the app's page layer (components/app/page-layer.tsx, lib/ui/layers):
 * while it is on screen `has-page-layer` is on <html>, which hides
 * everything that carries [data-shell-chrome] and stands the native shield
 * under the clock down (app/globals.css), so the bar here paints that strip
 * itself.
 *
 * ON SCREEN, NOT MOUNTED. The shell keeps a section it has left mounted and
 * not displayed, so the layer is held while the box is drawn and let go
 * when it is not, read from the box itself (a ResizeObserver hears a box
 * that stops being displayed, before that frame is painted). The server's
 * HTML sets the class from its first paint (HtmlClassScript).
 *
 * Drawn where the section is, not portalled: the editor is the section's
 * content, so Back, the shell's kept copy and its hidden state are the
 * shell's own. The shell does not play its arrival on a section that owns
 * the screen (OWN_SCREEN_ATTR), since a moving box would carry a fixed one
 * with it.
 */
import * as React from "react"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { HtmlClassScript } from "@/components/platform/html-class"
import { openLayer, sweepLayers } from "@/lib/ui/layers"
import { holdLanding } from "@/lib/ui/app-navigation"
import { previousPath } from "@/lib/navigation/in-app-history"
import { useRouter } from "next/navigation"
import { Shimmer, ShimmerBlock } from "@/components/ui/shimmer"
import { card } from "@/app/app/orders/order-parts"

/** On a section that draws its own screen: the shell plays no arrival on it (community-shell.tsx). */
export const OWN_SCREEN_ATTR = "data-section-own-screen"

/**
 * The box over the whole window. Above the shell's toasts and the nav pill (50 to 55), under every dialog, sheet and
 * menu (components/ui: 2147483638 and up), so a question asked from inside it is in front of it.
 */
export const EditorScreen = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function EditorScreen({ className, children, ...rest }, ref) {
  const box = React.useRef<HTMLDivElement | null>(null)
  const setBox = React.useCallback(
    (el: HTMLDivElement | null) => {
      box.current = el
      if (typeof ref === "function") ref(el)
      else if (ref) ref.current = el
    },
    [ref],
  )
  React.useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    let release: (() => void) | null = null
    const sync = () => {
      const on = el.getClientRects().length > 0
      if (on && !release) {
        sweepLayers()
        release = openLayer("page", () => box.current)
        /* Drawn whole on its first frame, as a page layer is: the stage lands nothing under it. */
        holdLanding()
      } else if (!on && release) {
        release()
        release = null
      }
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => {
      ro.disconnect()
      release?.()
    }
  }, [])
  return (
    <div ref={setBox} {...{ [OWN_SCREEN_ATTR]: "" }} {...rest} className={cn("fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#f8f9fa]", className)}>
      <HtmlClassScript name="has-page-layer" />
      {children}
    </div>
  )
})

/** The community's admin, from the address of any of its sections: /app/community/<slug>. */
export function adminHome(pathname: string): string {
  const m = /^\/app\/community\/[^/]+/.exec(pathname)
  return m ? m[0] : "/app/community"
}

/**
 * BACK TO WHERE THE OWNER WAS. Came from one of this community's sections (a tab, Edit page on the Overview): one
 * entry back, so the shell shows that section again as it was left, its scroll and its open panel (community-shell.tsx
 * Back and Forward). Arrived any other way (a link, a reload): the community's Overview.
 */
export function leavePlan(home: string, here: string, previous: string | null): "back" | string {
  if (previous && previous !== here && (previous === home || previous.startsWith(`${home}/`))) return "back"
  return home
}

export function useLeaveEditor(push: (href: string) => void) {
  const going = React.useRef(0)
  return React.useCallback(() => {
    /* One leave per press, however many times the finger lands. */
    if (Date.now() - going.current < 800) return
    going.current = Date.now()
    const here = window.location.pathname
    const plan = leavePlan(adminHome(here), here, previousPath())
    if (plan === "back") window.history.back()
    else push(plan)
  }, [push])
}

/**
 * THE BAR. White, one row, padded into the status bar on an iPhone (env(), never a check of the device): the way back,
 * the community, then whatever the screen puts in it.
 */
export function EditorBar({ onBack, title, children, className }: { onBack: () => void; title: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("@container relative z-[2] shrink-0 bg-white pt-[env(safe-area-inset-top,0px)] shadow-[inset_0_-1px_0_#e5e7eb]", className)} data-page-editor-bar="">
      <div className="flex min-h-[52px] min-w-0 items-center gap-1.5 pl-[max(8px,env(safe-area-inset-left,0px))] pr-[max(8px,env(safe-area-inset-right,0px))] sm:min-h-14 sm:gap-2 sm:pl-3 sm:pr-4" data-page-editor-bar-row="">
        <button type="button" onClick={onBack} aria-label={tt("Back to the community")} title={tt("Back to the community")} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#4b5563] outline-none transition-colors duration-100 hover:bg-[#f3f4f6] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 active:bg-[#eceef1] sm:h-9 sm:w-9 [-webkit-tap-highlight-color:transparent]" data-page-editor-back="">
          <ArrowLeft aria-hidden className="h-5 w-5" strokeWidth={1.9} />
        </button>
        {title}
        {children}
      </div>
    </div>
  )
}

/**
 * THE EDITOR'S FRAME, WHILE ITS READS ARE ON THEIR WAY (community-shell.tsx on the press, the page's Suspense fallback
 * on the server: section-frame.tsx). Already the editor's own screen, so the admin's bar and tabs never show between
 * the press and the editor: its bar with the way back and the community's name, the page's card, and the panel beside
 * it where the editor will have one (from 640px, ./layout.ts SIDE_MIN) or the drawer's head at the foot.
 */
export function PageEditorFrame({ name }: { name?: string }) {
  const router = useRouter()
  const leave = useLeaveEditor(React.useCallback((href: string) => router.push(href, { scroll: false }), [router]))
  return (
    <EditorScreen data-page-editor-frame="" data-section-frame="page" aria-busy="true">
      <EditorBar
        onBack={leave}
        title={
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {name ? (
              <h1 className="truncate text-[15px] font-semibold leading-5 text-[#1a1a2e]">{name}</h1>
            ) : (
              <Shimmer>
                <ShimmerBlock className="h-3 w-40 rounded-full" />
              </Shimmer>
            )}
          </div>
        }
      >
        <Shimmer className="flex shrink-0 items-center gap-1.5">
          <ShimmerBlock className="h-9 w-[76px] rounded-[10px] sm:w-[188px]" />
          <ShimmerBlock className="h-9 w-9 rounded-lg" />
        </Shimmer>
      </EditorBar>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2 pb-[96px] sm:p-3 sm:pr-0">
          <section className={cn(card, "min-h-0 flex-1 overflow-hidden p-3")} data-frame-card="">
            <Shimmer className="h-full">
              <ShimmerBlock className="h-full w-full rounded-xl" />
            </Shimmer>
          </section>
        </div>
        <div aria-hidden className="hidden w-4 shrink-0 sm:block" />
        <aside className="hidden w-[360px] shrink-0 flex-col bg-white shadow-[inset_1px_0_0_#e5e7eb] sm:flex">
          <div className="flex h-[57px] items-center border-b border-[#f1f2f4] px-5">
            <Shimmer>
              <ShimmerBlock className="h-3 w-20 rounded-full" />
            </Shimmer>
          </div>
          <Shimmer>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex min-h-[56px] flex-col justify-center gap-2 border-b border-[#f1f2f4] px-5">
                <ShimmerBlock className="h-3 rounded-full" style={{ width: 72 + ((i * 37) % 60) }} />
                <ShimmerBlock className="h-2.5 rounded-full" style={{ width: 140 + ((i * 53) % 70) }} />
              </div>
            ))}
          </Shimmer>
        </aside>
      </div>
      {/* Where the drawer's head will be on a narrow screen. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+8px)] mx-auto max-w-[620px] px-2 sm:hidden">
        <div className="h-[78px] rounded-[16px] border border-[#e5e7eb]/80 bg-white shadow-[0_-6px_28px_-14px_rgba(17,24,39,0.30)]" />
      </div>
    </EditorScreen>
  )
}
