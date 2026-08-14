"use client"

import {
  Archive,
  Armchair,
  BabyCarriage,
  Backpack,
  Bathtub,
  BookOpenText,
  Cards,
  CastleTurret,
  Coins,
  DiceFive,
  Dress as PhDress,
  Envelope,
  FilmSlate,
  FirstAid,
  GameController,
  Handbag,
  HighHeel,
  MoonStars,
  Newspaper,
  PaintBrush,
  PianoKeys,
  PuzzlePiece,
  Scissors,
  ShieldCheck,
  Sneaker,
  Sparkle,
  SprayBottle,
  SquaresFour,
  Stamp,
  TShirt,
  VinylRecord,
  Watch,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react"

/**
 * ===========================================================================
 *  THE MARKETPLACE'S CATEGORY ICONOGRAPHY, IN ONE PLACE
 * ===========================================================================
 *
 * Phosphor, at DUOTONE weight, and both halves of that are the decision.
 *
 * PHOSPHOR, because it is the one icon set that actually drew the objects this
 * marketplace sells. lucide ships exactly one garment; three rounds of
 * assembling department marks out of its box produced a diamond for Femei and a
 * clapperboard for Divertisment — well-drawn icons that are pictures of nothing
 * in the department. Phosphor has the dress, the sneaker, the high heel, the
 * handbag, the pram, the vinyl record, the trading cards: every tile and row
 * below is the thing itself.
 *
 * DUOTONE, because a filled second layer at 20% is what separates "an icon" from
 * "the system font's idea of an icon". Every outline set at 18px converges on
 * the same thin grey line-drawing — that is the "plain, no branding" complaint,
 * and it is a property of the weight, not of the glyphs. The duotone fill gives
 * each mark a body, and because the fill is drawn from currentColor, the violet
 * the chips set below becomes a soft violet wash inside every icon: the brand
 * colour is IN the drawing, not around it.
 *
 * One wrapper rather than `weight="duotone"` at forty call sites, so the weight
 * cannot drift per surface — the whole point of an icon system is that it is
 * one decision.
 */

export type DeptIconProps = { className?: string; strokeWidth?: number }

function branded(Icon: PhosphorIcon) {
  // `strokeWidth` is swallowed, deliberately: it is lucide's dial, the callers
  // still pass it, and Phosphor draws filled paths where it would land as a
  // meaningless SVG attribute.
  return function BrandedIcon({ className, strokeWidth: _sw, ...rest }: DeptIconProps) {
    return <Icon weight="duotone" className={className} {...rest} />
  }
}

/* ── The five departments, plus Toate ────────────────────────────────────── */

export const Dress = branded(PhDress)
export const Tee = branded(TShirt)
export const Pram = branded(BabyCarriage)
export const OpenBook = branded(BookOpenText)
export const Dice = branded(DiceFive)
export const AllSquares = branded(SquaresFour)

/* ── Every group, as the object it sells ─────────────────────────────────── */

export const GROUP_ICONS: Record<string, React.ComponentType<DeptIconProps>> = {
  "women-clothing": Dress,
  "women-shoes": branded(HighHeel),
  "women-bags": branded(Handbag),
  "women-accessories": branded(Watch),
  "women-beauty": branded(SprayBottle),
  "men-clothing": Tee,
  "men-shoes": branded(Sneaker),
  "men-accessories": branded(Watch),
  "men-grooming": branded(Scissors),
  "kids-girls": Dress,
  "kids-boys": Tee,
  "kids-toys": branded(GameController),
  "kids-transport": Pram,
  "kids-furniture": branded(Armchair),
  "kids-bath": branded(Bathtub),
  "kids-safety": branded(ShieldCheck),
  "kids-health": branded(FirstAid),
  "kids-feeding": branded(Sparkle),
  "kids-sleep": branded(MoonStars),
  "kids-school": branded(Backpack),
  "kids-other": AllSquares,
  "ent-books": OpenBook,
  "ent-magazines": branded(Newspaper),
  "ent-music": branded(VinylRecord),
  "ent-video": branded(FilmSlate),
  "hobby-cards": branded(Cards),
  "hobby-boardgames": Dice,
  "hobby-puzzles": branded(PuzzlePiece),
  "hobby-miniatures": branded(CastleTurret),
  "hobby-memorabilia": branded(Sparkle),
  "hobby-coins": branded(Coins),
  "hobby-stamps": branded(Stamp),
  "hobby-postcards": branded(Envelope),
  "hobby-instruments": branded(PianoKeys),
  "hobby-crafts": branded(PaintBrush),
  "hobby-storage": branded(Archive),
  "hobby-gaming": branded(GameController),
}

/** The group's own object, or the department's grid as the honest fallback. */
export function groupIcon(groupId: string): React.ComponentType<DeptIconProps> {
  return GROUP_ICONS[groupId] ?? AllSquares
}

/**
 * ===========================================================================
 *  THE CHIP THE ICON SITS IN
 * ===========================================================================
 *
 * One circle, violet-tinted, everywhere a category wears a picture. The tint is
 * violet-50 under violet-700, which is the sell button's own family — so the
 * category surfaces carry the brand's colour without shouting it, and a row of
 * chips reads as one designed system rather than five grey circles. Drawn as a
 * component so the tile, the row and the drawer cannot each pick their own
 * shade of "almost the brand".
 */
export function IconChip({
  icon: Icon,
  size = "md",
}: {
  icon: React.ComponentType<DeptIconProps>
  size?: "sm" | "md"
}) {
  const box = size === "sm" ? "h-8 w-8" : "h-10 w-10"
  const glyph = size === "sm" ? "h-[17px] w-[17px]" : "h-[21px] w-[21px]"
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-[#f5f3ff] text-[#6d28d9] ring-1 ring-[#7c3aed]/10`}>
      <Icon className={glyph} />
    </span>
  )
}
