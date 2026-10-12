"use client"

/**
 * ===========================================================================
 *  ONE CONNECTION, ONE LINE: WHAT IT IS, WHETHER IT WORKS, WHAT TO PRESS
 * ===========================================================================
 * Connections is a short list: Claude Code, Codex, GitHub. Each line says
 * whether that tool can reach this website right now, and has one button
 * for the one thing there is to do about it: Connect when it cannot, Manage
 * when it can, Done while the line is open. Opening a line shows its steps
 * or its settings under it, by height (./editor/collapse), and the lines
 * below move down to make room instead of jumping.
 *
 * It replaced a question ("directly, or through GitHub?") that had to be
 * answered before anything else was shown, and then three steps for the
 * answer. A creator who does not know what MCP or a repository is could not
 * answer it. Everyone knows which tool they use.
 */
import { useEffect, useRef, type ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { COLLAPSE_OPEN_MS, Collapse } from "@/components/website-builder/editor/collapse"
import { cn } from "@/lib/utils"
import { buttonClass } from "./parts"
import { tt } from "@/lib/i18n/text"

/**
 *   off        not connected
 *   on         connected and has been used
 *   waiting    set up, not used yet
 *   attention  needs something from the creator (a repository to pick, a failed sync)
 *   none       not available on this Storelib at all
 */
export type ConnectionTone = "off" | "on" | "waiting" | "attention" | "none"

const TONE: Record<ConnectionTone, string> = {
  off: "text-white/45",
  on: "text-emerald-300",
  waiting: "text-white/60",
  attention: "text-amber-200",
  none: "text-white/40",
}

export function ConnectionRow({
  id,
  mark,
  name,
  status,
  detail,
  tone,
  loading = false,
  action,
  busy = false,
  open,
  onToggle,
  children,
  badge,
  featured = false,
}: {
  id: string
  mark: ReactNode
  name: string
  /** A word beside the name: "Recommended". */
  badge?: string
  /** The line to start with: a faint lift so the eye lands on it first. */
  featured?: boolean
  /** A word or two: "Connected", "Not connected". */
  status?: ReactNode
  /** After the status, quieter: "used 2 hours ago", a repository's name. */
  detail?: ReactNode
  tone: ConnectionTone
  /** Not known yet: the status line is a quiet bar and there is no button. */
  loading?: boolean
  /** The row's one button while it is closed. Open, it is always Done. */
  action?: string
  busy?: boolean
  open: boolean
  onToggle: () => void
  children?: () => ReactNode
}) {
  const bodyId = `connection-${id}-body`
  const ref = useRef<HTMLDivElement>(null)
  const was = useRef(open)
  /*
    A line opened near the foot of the screen has its steps below the fold,
    which on a phone is most of them. Once it has opened, it is scrolled up
    by as little as shows it: all of it if it fits, its top if not.
    `scroll-mt` keeps it clear of the phone's sticky Back bar.
  */
  useEffect(() => {
    const opened = open && !was.current
    was.current = open
    if (!opened) return
    const t = window.setTimeout(() => {
      const still = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ref.current?.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" })
    }, COLLAPSE_OPEN_MS + 20)
    return () => window.clearTimeout(t)
  }, [open])
  return (
    <div ref={ref} data-connection={id} data-open={open ? "" : undefined} className={cn("scroll-mt-16 md:scroll-mt-6", featured && "bg-white/[0.035]")}>
      <div className="flex min-h-[72px] items-center gap-3.5 px-4 py-3 md:min-h-[68px] md:gap-4 md:px-5">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-white/[0.07] text-white/90">
          {mark}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-[15.5px] font-medium leading-snug text-white md:text-[15px]">
            {name}
            {badge && (
              <span className="rounded-full bg-emerald-400/[0.14] px-2 py-[1px] text-[11.5px] font-medium text-emerald-200">{badge}</span>
            )}
          </h3>
          {loading ? (
            <span aria-hidden className="mt-1.5 block h-3 w-28 rounded-[4px] bg-white/[0.07]" />
          ) : (
            /*
              On a computer: "● Connected · used 2 hours ago" on one line. On
              a phone the button leaves the words about 160px, which cut that
              to "used 2 …", so the detail takes a line of its own there.
            */
            <p
              data-connection-status={tone}
              className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13.5px] leading-snug md:flex-nowrap md:text-[13px]"
            >
              {tone === "on" && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />}
              <span className={cn("shrink-0", TONE[tone])}>{status}</span>
              {/* The spaces are for whoever reads this aloud or copies it; a flex row draws its gaps without them. */}
              {detail && (
                <>
                  {" "}
                  <span aria-hidden className="shrink-0 text-white/25 max-md:hidden">·</span>{" "}
                  <span className="min-w-0 truncate text-white/45 max-md:basis-full">{detail}</span>
                </>
              )}
            </p>
          )}
        </div>
        {!loading && (action || open) && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={open ? bodyId : undefined}
            disabled={busy}
            onClick={onToggle}
            className={cn(buttonClass, "min-w-[88px] md:min-w-[80px]")}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {open ? tt("Done") : action}
          </button>
        )}
      </div>
      <Collapse open={open && !!children}>
        {() => (
          <div id={bodyId} className="px-4 pb-6 pt-1 md:pb-7 md:pl-[76px] md:pr-6">
            {children?.()}
          </div>
        )}
      </Collapse>
    </div>
  )
}

/** A line under a row's steps that sends the creator somewhere else, or says what just happened. */
export function RowNote({ children, tone = "quiet" }: { children: ReactNode; tone?: "quiet" | "good" | "bad" }) {
  return (
    <p
      className={cn(
        "mt-5 text-[13.5px] leading-relaxed first:mt-0 md:text-[13px]",
        tone === "good" && "text-emerald-300",
        tone === "bad" && "text-red-300",
        tone === "quiet" && "text-white/50",
      )}
      role={tone === "bad" ? "alert" : tone === "good" ? "status" : undefined}
    >
      {children}
    </p>
  )
}

/** A word in a note that is a button: opens another row, tries again. */
export function InlineButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative text-white/80 underline underline-offset-2 transition-colors hover:text-white after:absolute after:-inset-x-1 after:-inset-y-[13px] after:content-[''] md:after:hidden [-webkit-tap-highlight-color:transparent]"
    >
      {children}
    </button>
  )
}
