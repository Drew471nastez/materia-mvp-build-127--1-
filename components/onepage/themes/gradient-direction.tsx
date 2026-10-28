"use client"

/**
 * ===========================================================================
 *  THE GRADIENT'S DIRECTION: EIGHT SWATCHES AND ONE ANGLE
 * ===========================================================================
 * Round 40, the owner: "The gradient adjuster for wallpaper style (the clock
 * ring thing) is very cheap UI. Replace it with something better."
 *
 * It was a dial with a needle and a number under it: to get "top to bottom"
 * the creator had to know that is 180 degrees, and turn a needle to it. Now
 * the eight directions anyone wants are eight small squares, each painted
 * with this page's own two colours running that way, so the choice is the
 * picture of the result. Under them one angle, on the editor's own slider
 * (editor-kit RangeRow: dragged, typed or nudged with the arrows), for the
 * angles in between. A swatch is picked when the angle is its angle.
 *
 * The value saved is the same number in the same gradient as ever
 * (lib/onepage/theme-layout linearGradientValue).
 */
import { tt } from "@/lib/i18n/text"
import { cn } from "@/lib/utils"
import { GRADIENT_DIRECTIONS, normalAngle } from "@/lib/onepage/theme-layout"
import { RangeRow, SwatchMark } from "@/components/onepage/editor-kit"

const NAMES: Record<number, () => string> = {
  180: () => tt("Top to bottom"),
  0: () => tt("Bottom to top"),
  90: () => tt("Left to right"),
  270: () => tt("Right to left"),
  135: () => tt("Top left to bottom right"),
  225: () => tt("Top right to bottom left"),
  45: () => tt("Bottom left to top right"),
  315: () => tt("Bottom right to top left"),
}

export function GradientDirection({ value, from, to, onChange }: { value: number; from: string; to: string; onChange: (deg: number) => void }) {
  const angle = normalAngle(value)
  return (
    <div data-gradient-direction="">
      <p className="mb-2 text-[15px] font-medium text-[#1a1a2e]">{tt("Direction")}</p>
      <div role="radiogroup" aria-label={tt("Gradient direction")} className="grid grid-cols-8 gap-1.5">
        {GRADIENT_DIRECTIONS.map((deg) => {
          const on = angle === deg
          return (
            <button
              key={deg}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={NAMES[deg]()}
              title={NAMES[deg]()}
              data-gradient-preset={deg}
              onClick={() => onChange(deg)}
              className={cn(
                "relative aspect-square min-h-9 cursor-pointer rounded-[10px] outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)] [-webkit-tap-highlight-color:transparent]",
              )}
              style={{ background: `linear-gradient(${deg}deg, ${from} 0%, ${to} 100%)` }}
            >
              <SwatchMark on={on} className="rounded-[13.5px]" />
            </button>
          )
        })}
      </div>
      <div className="mt-4">
        <RangeRow label={tt("Angle")} value={angle} min={0} max={355} step={5} unit="°" onChange={(v) => onChange(normalAngle(v))} />
      </div>
    </div>
  )
}
