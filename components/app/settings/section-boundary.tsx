"use client"

/**
 * ===========================================================================
 *  A SECTION THAT FAILS STAYS A SECTION THAT FAILED
 * ===========================================================================
 * "Clicking a category reloads the whole settings page." Every section but
 * Profile's own is a chunk of its own (components/app/settings/lazy-panels),
 * and a chunk a deploy renamed cannot be fetched by a tab opened before it:
 * the import fails, the section throws as it is drawn, and with nothing in
 * Settings to catch it the throw reached the /app error boundary
 * (app/app/error.tsx), which reloads the whole page for stale code
 * (components/platform/error-screen): the sheet, the column and everything
 * in them gone and loaded again, on a press that only asked for Taxes. The
 * native apps keep one web view alive for days, across many deploys, so
 * there it was the usual case, not the rare one. Any other fault in one
 * section (a field the server stopped sending) took Settings down the same
 * way.
 *
 * Now the section is caught where it is drawn. The column, the pills and
 * the title stay; only the section's own place says what happened, and the
 * reload is the person's to press. Keyed by the section (settings-form-new
 * wraps each one), so the next press starts clean.
 */
import * as React from "react"
import { buildReport, isStaleCodeError } from "@/lib/client-errors"
import { newDeployKnown } from "@/lib/ui/new-deploy"
import { tt } from "@/lib/i18n/text"

interface Props {
  children: React.ReactNode
  /** The section's name, for the words and the report. */
  name: string
}

export class SettingsSectionBoundary extends React.Component<Props, { error: unknown }> {
  state: { error: unknown } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error(String(error)) }
  }

  componentDidCatch(error: unknown) {
    try {
      const report = buildReport(error, window.location.href, newDeployKnown())
      void fetch("/api/client-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ ...report, message: `[settings:${this.props.name}] ${report.message}`.slice(0, 500) }),
      }).catch(() => {})
    } catch {
      /* Reporting a fault is never the thing that throws. */
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const stale = isStaleCodeError(error, newDeployKnown())
    return (
      <div
        role="alert"
        data-settings-section-failed={stale ? "stale" : "fault"}
        className="rounded-2xl border border-[#e5e7eb]/60 bg-white app-card-x py-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      >
        <p className="text-[14px] font-medium text-[#1a1a2e]">
          {stale ? tt("Storelib was updated while Settings was open.") : tt("{name} could not be shown.", { name: this.props.name })}
        </p>
        <p className="mt-1 text-[13px] text-[#6b7280]">
          {stale ? tt("Reload to open {name}. Everything you saved is kept.", { name: this.props.name }) : tt("Nothing you saved is lost. Try again, or open another section.")}
        </p>
        <button
          type="button"
          onClick={() => (stale ? window.location.reload() : this.setState({ error: null }))}
          className="mt-3 h-9 cursor-pointer rounded-lg bg-[#1a1a2e] px-4 text-[13px] font-semibold text-white"
        >
          {stale ? tt("Reload") : tt("Try again")}
        </button>
      </div>
    )
  }
}
