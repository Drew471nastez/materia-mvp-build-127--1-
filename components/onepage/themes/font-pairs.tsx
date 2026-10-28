"use client"

/**
 * FONT PAIRS (round 40): a title face and a page face made to sit together,
 * set in one press. Each card is drawn in its own two faces: a large "Aa" in
 * the title face over a line in the page face. Picking one writes the same
 * two values the Page font and Title font pickers below write, so those show
 * the pair afterwards and either can still be changed alone.
 *
 * The faces come from one small stylesheet cut to the letters drawn here
 * (lib/onepage/fonts onePageFontSampleHref).
 */
import { tt } from "@/lib/i18n/text"
import { familyOf, fontStack, onePageFontSampleHref } from "@/lib/onepage/fonts"
import { FONT_PAIRS, fontPairOf } from "@/lib/onepage/theme-layout"
import { ChoiceCard } from "@/components/onepage/editor-kit"

const SAMPLE_TITLE = "Aa" // i18n-ignore: a type sample, the same in every language
const SAMPLE_BODY = "Hamburgefonts" // i18n-ignore: the type designer's sample word, the same in every language

const PAIR_FONTS_HREF = onePageFontSampleHref(
  [...new Set(FONT_PAIRS.flatMap((p) => [familyOf(p.title), familyOf(p.body)]).filter((f): f is string => !!f))],
  SAMPLE_TITLE + SAMPLE_BODY,
)

export function FontPairs({ theme, onPick }: { theme: { font_family?: unknown; title_font?: unknown }; onPick: (pair: { font_family: string; title_font: string }) => void }) {
  const current = fontPairOf(theme)
  return (
    <div data-font-pairs="">
      {PAIR_FONTS_HREF ? <link rel="stylesheet" href={PAIR_FONTS_HREF} /> : null}
      <div className="grid grid-cols-2 gap-2.5">
        {FONT_PAIRS.map((pair) => {
          const title = familyOf(pair.title) || ""
          const body = familyOf(pair.body) || ""
          return (
            <ChoiceCard
              key={pair.id}
              selected={current === pair.id}
              onClick={() => onPick({ font_family: pair.body, title_font: pair.title })}
              label={title === body ? title : tt("{title} and {body}", { title, body })}
              title={title === body ? title : tt("{title} and {body}", { title, body })}
            >
              <span className="flex h-[64px] flex-col items-center justify-center gap-1 rounded-xl bg-[#f7f7f8] px-2 text-[#1a1a2e]">
                <span className="text-[24px] font-semibold leading-none" style={{ fontFamily: fontStack(pair.title) }}>
                  {SAMPLE_TITLE}
                </span>
                <span className="max-w-full truncate text-[11.5px] leading-tight text-[#4b5563]" style={{ fontFamily: fontStack(pair.body) }}>
                  {SAMPLE_BODY}
                </span>
              </span>
            </ChoiceCard>
          )
        })}
      </div>
    </div>
  )
}
