"use client"

/**
 * ONE PART OF THE ONEPAGE EDITOR THAT BROKE, AND ONLY THAT PART (round AU).
 *
 * The editor had no error boundary of its own: a throw while drawing one
 * block's settings (a field shaped in a way its editor never expected, a page
 * saved by an older build) reached the route's error page, and the whole
 * editor, its bar, its Save and every other block went with it. Now a tab, a
 * block's settings and the preview each break on their own: the rest of the
 * editor keeps working, Save still sends the page, and the part offers to
 * draw itself again. What was typed is still in the page (lib/onepage/context)
 * and on the device (lib/onepage/local-draft).
 */
import * as React from "react"
import { tt } from "@/lib/i18n/text"

type Props = { children: React.ReactNode; part: string; className?: string }
type State = { failed: boolean; tries: number }

export class EditorPartBoundary extends React.Component<Props, State> {
  state: State = { failed: false, tries: 0 }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(`[OnePage editor] ${this.props.part} could not be drawn:`, error instanceof Error ? error.message : error)
  }

  render() {
    if (!this.state.failed) return <React.Fragment key={this.state.tries}>{this.props.children}</React.Fragment>
    return (
      <div role="alert" data-editor-part-failed={this.props.part} className={this.props.className ?? "rounded-xl border border-[#e5e7eb] bg-white px-4 py-3"}>
        <p className="text-[14px] font-medium text-[#1a1a2e]">{tt("This part could not be shown")}</p>
        <p className="mt-0.5 text-[13px] text-[#6b7280]">{tt("Your changes are kept. The rest of the editor still works.")}</p>
        <button
          type="button"
          onClick={() => this.setState((s) => ({ failed: false, tries: s.tries + 1 }))}
          className="mt-2 text-[13px] font-medium text-[#1a1a2e] underline underline-offset-2"
        >
          {tt("Try again")}
        </button>
      </div>
    )
  }
}
