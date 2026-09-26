/**
 * ===========================================================================
 *  WHERE THE PAGE MEETS THE BLACK BAR: TWO ROUNDED CORNERS, AT EVERY WIDTH
 * ===========================================================================
 * "In the whole app where the black top bar is, on mobile devices, it needs
 * to be the rounded concave thing, across all pages, the same as it is on
 * desktop."
 *
 * The bar's own colour, drawn as two quarter circles hanging from its bottom
 * edge at the left and right of the screen, over whatever the page puts
 * there. The page is never clipped and never moves for them: it scrolls
 * under two corners that stay put, and a strip at the top of a page (Try Pro
 * on Home, Analytics, Emails and Payouts, a page's own sticky bar) gets the
 * same rounded top as the plain grey page does.
 *
 * ONE NUMBER. The radius and the overlap are `--app-top-corner` and
 * `--app-top-overlap` on :root in app/globals.css, and nothing else says how
 * big these corners are: the phone header, the desktop header, the native
 * cold start (app/app/cold-start.tsx) and a slow page's surface
 * (components/app/app-stage.tsx) all read them there, and so does
 * scripts/check-app-top-corners.mjs. The overlap starts each corner inside
 * the bar, so no hairline seam can open between the two at any zoom.
 *
 * The colour is the parent's `color` (the corners are drawn with
 * box-shadow, which takes currentColor), so each header says its own:
 * #111111 on a phone, #131316 from md.
 *
 * Inside the header, so everything that hides the header (a page layer, the
 * OnePage editor on a phone: `[data-shell-chrome]` in app/globals.css) hides
 * these with it. It takes no presses.
 */
export function AppTopCorners({ className = "" }: { className?: string }) {
  return (
    <div data-app-top-corners="" aria-hidden="true" className={`app-top-corners ${className}`}>
      <span data-corner="left" />
      <span data-corner="right" />
    </div>
  )
}
