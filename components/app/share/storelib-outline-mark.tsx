import { STORELIB_S_PATH, STORELIB_S_TRANSFORM } from "@/components/storelib-mark"

/**
 * The Storelib mark as an outline: the rounded square drawn as a line and the
 * S solid inside it, both in `currentColor`.
 *
 * It is for the grey address pill on the home page and the share sheet, where
 * the violet tile would be the loudest thing on the screen next to a line of
 * grey text. In a very dark grey it reads as the same kind of mark as the
 * icons around it. The S is the real one (components/storelib-mark.tsx), so
 * the two drawings cannot drift apart.
 *
 * The square's line is 16 units of 200, so about 1.4px at the pill's 18px:
 * the weight of the other outline icons in /app.
 */
export function StorelibOutlineMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect x="12" y="10" width="176" height="180" rx="38" stroke="currentColor" strokeWidth="16" />
      {/* data-keep-transform: globals.css flattens transforms inside a `.group` on touch screens, and this one places the S. */}
      <path d={STORELIB_S_PATH} transform={STORELIB_S_TRANSFORM} fill="currentColor" data-keep-transform="" />
    </svg>
  )
}
