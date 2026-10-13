import { NEXT_IMAGE_WIDTHS } from "./optimized-url"

/**
 * THE COVER'S FILE, FOR THIS SCREEN (round 25: "images optimized, the right sizes, without lowering visible quality").
 * A cover band `column` CSS px wide at most, on a screen `viewport` wide at `dpr`: the band's width on this screen times
 * its density (up to 3x), rounded up to a width the image route makes. 1200px on a 3x iPhone, 828px on a 2x one, 1920 on
 * a 2x computer, where a member's profile asked for the 1920px file on every screen before.
 */
export function coverFileWidth(viewport: number, dpr: number, column = 680): number {
  const want = Math.min(column, Math.max(320, viewport)) * Math.min(3, Math.max(1, dpr))
  return NEXT_IMAGE_WIDTHS.find((w) => w >= want) ?? 1920
}
