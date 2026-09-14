/**
 * The workspace's top bar with an editor sheet open under it.
 *
 * The sheet dims the page, and the page is only the part below this bar, so
 * the bar dims itself to match. The bar's own hairline was the one thing the
 * dim could not reach: `absolute inset-0` resolves against the PADDING box
 * and a border sits outside it, so a 1px lit line ran across a dimmed screen.
 *
 * Only the bar is rendered. The iframe under it is a different document and
 * has nothing to do with where this overlay's edges land.
 */
import React from "react"
import { createRoot } from "react-dom/client"

function Bar({ dimmed }: { dimmed: boolean }) {
  return (
    <div
      data-case={dimmed ? "sheet open" : "sheet closed"}
      data-bar
      className="relative flex shrink-0 items-center gap-1.5 bg-white px-3 pb-2 shadow-[inset_0_-1px_0_#e5e7eb] sm:gap-2 sm:px-4"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
    >
      <div
        data-dim
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 bg-black/30 transition-opacity duration-[360ms]"
        style={{ opacity: dimmed ? 1 : 0 }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold leading-tight text-[#1a1a2e]">Andrew Rullz</p>
        <p className="truncate text-[11px] leading-tight text-[#9ca3af]">storelib.com/u/andrew-rullz</p>
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <div>
    <Bar dimmed />
    <Bar dimmed={false} />
  </div>,
)
