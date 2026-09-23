/**
 * ===========================================================================
 *  THE SPOT A SECTION IS BEING WRITTEN INTO
 * ===========================================================================
 * Drawn in the canvas, where the section will land, for as long as Ask AI is
 * writing and compiling it. The finished section replaces it in place.
 *
 * It is never a section of the page. The editor adds it to the list the
 * canvas draws and nowhere else (lib/website-builder/ai-placement.ts), so it
 * cannot be saved, published, selected or dragged.
 *
 * WHAT IT SAYS IS TRUE. The server does not report progress while it writes,
 * so this does not invent any: no percentage, no "styling it" that is not
 * happening. It says a section is being written and shows what was asked
 * for. The chat beside it says the rest.
 *
 * Coloured from the page it sits on, `--theme-text` over `--theme-bg`, so it
 * reads as part of a dark site on a dark site. The moving ring is the Ask AI
 * button's ring, so it is plainly the AI's doing. Styles in globals.css,
 * under "A SECTION THE AI IS STILL WRITING".
 */
export function WritingSection({ prompt }: { prompt: string }) {
  return (
    <div className="wb-writing" role="status" aria-live="polite" data-writing-section="">
      <div className="wb-writing-inner">
        <p className="wb-writing-label">
          <span className="wb-writing-dot" aria-hidden="true" />
          Writing a section
        </p>
        {prompt ? <p className="wb-writing-prompt">{prompt}</p> : null}
        <div className="wb-writing-bones" aria-hidden="true">
          <span className="wb-bone" style={{ width: "44%", height: 26 }} />
          <span className="wb-bone" style={{ width: "70%", height: 12 }} />
          <span className="wb-bone" style={{ width: "56%", height: 12 }} />
          <div className="wb-writing-row">
            <span className="wb-bone wb-bone-card" />
            <span className="wb-bone wb-bone-card" />
            <span className="wb-bone wb-bone-card" />
          </div>
        </div>
      </div>
    </div>
  )
}
