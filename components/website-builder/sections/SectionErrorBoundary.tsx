"use client"

/**
 * ===========================================================================
 *  ONE BROKEN SECTION IS ONE BROKEN SECTION
 * ===========================================================================
 * React unmounts the whole tree when a render throws and nothing catches it.
 * On a published page that is the entire site replaced by nothing; in the
 * editor it is the canvas, the sidebar and every unsaved change with it. A
 * single bad value in a single section could do that, and there was no
 * boundary anywhere in the builder to stop it.
 *
 * The two surfaces want different answers, and they are the same two answers
 * a section that does not compile already gets:
 *
 *   A PUBLISHED PAGE renders nothing where the section was. A visitor sees a
 *   site missing one band, which is a gap; the alternative is a blank page,
 *   which is an outage. Nothing about the failure is shown to them, because
 *   a stack trace on a storefront tells a stranger about the software and
 *   the creator nothing they can act on.
 *
 *   THE EDITOR says which section, which type, and what the error was, with
 *   a button to try it again — because a re-render after fixing the setting
 *   that caused it should recover, and often does.
 *
 * WHY A CLASS. Error boundaries are the one thing React has no hook for:
 * `componentDidCatch` and `getDerivedStateFromError` exist on classes only.
 * This is that, and nothing else.
 */
import { Component, type ReactNode } from "react"

interface Props {
  children: ReactNode
  /** For the message, so it names the section rather than "a section". */
  sectionId: string
  sectionType: string
  sectionName?: string
  /** True in the builder. False, and a failure is silent. */
  isEditing?: boolean
}

interface State {
  error: Error | null
  /** Bumped to remount the children when somebody asks to try again. */
  attempt: number
}

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error) {
    /**
     * The creator's own console, and only theirs. A published page says
     * nothing: a visitor cannot act on it, and it is not their business
     * which section of somebody's site threw what.
     */
    if (this.props.isEditing && typeof console !== "undefined") {
      console.error(`[storelib] ${this.props.sectionType} [${this.props.sectionId}] could not be drawn:`, error)
    }
  }

  /**
   * A NEW SECTION IS NOT THE OLD ONE'S FAILURE. Without this, a section that
   * threw kept its error card for as long as the boundary was mounted, so
   * changing the setting that caused it left the card sitting there and the
   * only way back was a refresh.
   */
  componentDidUpdate(prev: Props) {
    if (this.state.error && (prev.sectionId !== this.props.sectionId || prev.children !== this.props.children)) {
      this.setState({ error: null })
    }
  }

  render() {
    const { error } = this.state
    if (!error) return <div key={this.state.attempt}>{this.props.children}</div>

    // A visitor gets a gap, not an outage and not a stack trace.
    if (!this.props.isEditing) return null

    const label = this.props.sectionName || this.props.sectionType
    return (
      <div
        data-section-error={this.props.sectionId}
        className="px-6 py-5 text-[13px] leading-5 text-[#991b1b] bg-[#fef2f2] border-y border-[#fecaca]"
      >
        <p className="font-semibold">{label} could not be drawn</p>
        <p className="mt-1 font-mono text-[12px] break-words">{error.message || String(error)}</p>
        <p className="mt-1 text-[12px] opacity-80">
          The rest of the page is fine. Change a setting on this section, or remove it.
        </p>
        <button
          type="button"
          onClick={() => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))}
          className="mt-2 h-7 rounded-md border border-[#fecaca] bg-white px-2.5 text-[12px] font-[550] text-[#991b1b] hover:bg-[#fff5f5]"
        >
          Try again
        </button>
      </div>
    )
  }
}

export default SectionErrorBoundary
