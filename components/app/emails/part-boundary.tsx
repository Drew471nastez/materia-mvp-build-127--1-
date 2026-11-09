"use client"

/**
 * ===========================================================================
 *  ONE PART OF THE EMAILS PAGE THAT FAILS, NOT THE PAGE (wave 7)
 * ===========================================================================
 * The owner: "Something went wrong in this page… the rest of the service is
 * still working". One part of /app/emails threw while it was drawn (a list
 * that was not a list, `eN.find is not a function`) and, with nothing on the
 * page to catch it, the throw reached the /app error screen: the title, the
 * navigation and every other part were gone with it.
 *
 * Each part is now drawn inside one of these: the numbers, the list, the
 * customer emails, delivery, the communities' automations, an email's own
 * page and the templates. When one throws, only its own place says so, small
 * and in line: "Couldn't load this part" and Retry. Retry reads the part's
 * data again (`onRetry`) and draws it afresh; going to another part of the
 * page (`resetKey`) starts it clean too. The fault is reported as the
 * Settings sections report theirs (components/app/settings/section-boundary),
 * named `[emails:<part>]`, so the next one is found from the reports.
 *
 * The data itself is checked on its way in (lib/emails/shapes.ts); this is
 * the net under that, for whatever is not foreseen.
 */
import * as React from "react"
import { ArrowLeft, RotateCw } from "lucide-react"
import { buildReport } from "@/lib/client-errors"
import { newDeployKnown } from "@/lib/ui/new-deploy"
import { tt } from "@/lib/i18n/text"
import { cn } from "@/lib/utils"

interface Props {
  /** The part, for the report and for tests (data-emails-part-failed). */
  name: string
  children: React.ReactNode
  /** Read the part's data again before it is drawn afresh. */
  onRetry?: () => void
  /** A change of this (another view, another email) draws the part afresh. */
  resetKey?: unknown
  /** A part that is a page of its own (an email over the list): its way back stays with the words. */
  onBack?: () => void
  /** In a card of its own (the default) or inside one that is already there. */
  framed?: boolean
  className?: string
}

export class EmailsPartBoundary extends React.Component<Props, { error: unknown }> {
  state: { error: unknown } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error(String(error)) }
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && !Object.is(prev.resetKey, this.props.resetKey)) this.setState({ error: null })
  }

  componentDidCatch(error: unknown) {
    try {
      const report = buildReport(error, window.location.href, newDeployKnown())
      void fetch("/api/client-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ ...report, message: `[emails:${this.props.name}] ${report.message}`.slice(0, 500) }),
      }).catch(() => {})
    } catch {
      /* Reporting a fault is never the thing that throws. */
    }
  }

  private retry = () => {
    try {
      this.props.onRetry?.()
    } finally {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    const framed = this.props.framed !== false
    return (
      <div
        role="alert"
        data-emails-part-failed={this.props.name}
        className={cn(
          "flex min-h-12 items-center justify-between gap-3 py-1.5 pl-4 pr-1.5 text-[13.5px] text-[#4b5563] sm:pl-5",
          framed && "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
          this.props.className,
        )}
      >
        <span className="flex min-w-0 items-center gap-1">
          {this.props.onBack ? (
            <button type="button" onClick={this.props.onBack} aria-label={tt("Back")} className="-ml-3 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#1a1a2e] hover:bg-[#f4f5f7] sm:h-9 sm:w-9" data-emails-part-back="">
              <ArrowLeft className="h-[18px] w-[18px]" aria-hidden />
            </button>
          ) : null}
          <span className="min-w-0">{tt("Couldn't load this part.")}</span>
        </span>
        <button
          type="button"
          onClick={this.retry}
          className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13.5px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f4f5f7] active:bg-[#eceef1] sm:h-9 [-webkit-tap-highlight-color:transparent]"
          data-emails-part-retry=""
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden />
          {tt("Retry")}
        </button>
      </div>
    )
  }
}
