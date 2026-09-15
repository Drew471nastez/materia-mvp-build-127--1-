/**
 * The three lines under a creator's name, and a weight ladder beside them.
 *
 * The claim that needs testing is not "the class is there" — it is that 450
 * is a REAL weight on this page. Inter arrives through next/font with no
 * weight list, which should mean the variable face; if it did not, 450 would
 * snap to 400 and the change would be a pixel and nothing else.
 *
 * A variable axis is measurable: the same string set at 400, 450 and 500 gets
 * wider as the weight goes up. If 450 has snapped, two of the three widths
 * are identical.
 */
import React from "react"
import { createRoot } from "react-dom/client"

const SAMPLE = "Building cool stuff on the internet…CEO @Storelib"

createRoot(document.getElementById("app")!).render(
  <div /* Inter by name: --font-inter is set by a class next/font puts on <html>,
     which a bare harness does not have. */
    style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
    {[400, 450, 500, 530].map((w) => (
      <p key={w} data-weight={w} style={{ fontWeight: w, fontSize: 15, margin: 0, display: "inline-block" }}>
        {SAMPLE}
      </p>
    ))}
    <hr />
    {/* The real classes, as the profile sets them. */}
    <p data-line="handle" className="mt-0.5 break-words max-w-full px-4 font-[450] text-[13px]">@andrewrullz</p>
    <p data-line="bio" className="max-w-xl break-words px-4 font-[450] mt-3 text-[13px]">{SAMPLE}</p>
    <div data-line="meta" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-5 font-[450] mt-3 text-[13px]">
      <span>2 followers</span>
    </div>
    {/* The tab row, as storefront-tabs sets it. */}
    <span data-tab="rest" className="font-[450] text-sm">Products</span>
    <span data-tab="selected" className="font-[530] text-sm">Home</span>
  </div>,
)
