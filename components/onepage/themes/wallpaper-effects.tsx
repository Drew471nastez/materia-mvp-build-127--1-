"use client"

/**
 * ===========================================================================
 *  A PHOTO OR VIDEO WALLPAPER'S EFFECT, TINT AND BLUR (round AR)
 * ===========================================================================
 * The Design tab's controls for lib/onepage/wallpaper wallpaperMediaLook,
 * under the picture or the video. Each effect is shown on the creator's own
 * wallpaper (the photo, or the video's saved frame), drawn by the same
 * function the page draws it with, so the tile is what the page will be.
 *
 *   Effect   None, Mono, Blur, Halftone, Grain, Duotone
 *   Blur     how soft, for Blur (2 to 40px)
 *   Tint     a colour over the picture, and how strong; Duotone's colour
 *
 * A page from before this kept its blur in `image_blur`. It shows here as
 * Blur at that amount, and picking any effect moves it to the new fields, so
 * one blur is never drawn twice.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { CheckMark, ChoiceMark, ColorRow, RangeRow, choiceOff } from "@/components/onepage/editor-kit"
import { WallpaperEffectLayers } from "@/components/onepage/wallpaper-layers"
import { WALLPAPER_BLUR_DEFAULT, WALLPAPER_BLUR_MAX, WALLPAPER_EFFECTS, wallpaperEffectOf, wallpaperMediaLook, wallpaperTint, type WallpaperEffect } from "@/lib/onepage/wallpaper"

type ThemeLike = Record<string, unknown>

function effectLabel(id: WallpaperEffect): string {
  switch (id) {
    case "mono":
      return tt("Mono")
    case "blur":
      return tt("Blur")
    case "halftone":
      return tt("Halftone")
    case "grain":
      return tt("Grain")
    case "duotone":
      return tt("Duotone")
    default:
      return tt("None")
  }
}

/** The effect the controls show: an old page's own image blur reads as Blur. */
export function shownEffect(theme: ThemeLike, kind: "image" | "video"): WallpaperEffect {
  const effect = wallpaperEffectOf(theme)
  if (effect === "none" && kind === "image" && Number(theme.image_blur) > 0) return "blur"
  return effect
}

/** What picking `effect` writes. */
export function effectUpdate(theme: ThemeLike, kind: "image" | "video", effect: WallpaperEffect): ThemeLike {
  const legacyBlur = kind === "image" ? Number(theme.image_blur) || 0 : 0
  const next: ThemeLike = { wallpaper_effect: effect === "none" ? null : effect }
  if (legacyBlur > 0) {
    next.image_blur = 0
    if (effect === "blur" && theme.wallpaper_blur == null) next.wallpaper_blur = legacyBlur
  }
  return next
}

export function WallpaperEffects({
  theme,
  kind,
  src,
  onChange,
}: {
  theme: ThemeLike
  kind: "image" | "video"
  /** The picture the tiles show: the photo, or the video's saved frame. Null draws a plain sample. */
  src: string | null
  onChange: (patch: ThemeLike) => void
}) {
  const current = shownEffect(theme, kind)
  const tint = wallpaperTint(theme)
  const strength = typeof theme.wallpaper_tint_strength === "number" ? theme.wallpaper_tint_strength : current === "duotone" ? 100 : 0
  const blur = typeof theme.wallpaper_blur === "number" ? theme.wallpaper_blur : current === "blur" && kind === "image" && Number(theme.image_blur) > 0 ? Number(theme.image_blur) : WALLPAPER_BLUR_DEFAULT
  return (
    <div data-wallpaper-effects={kind}>
      <p className="mb-1.5 text-[15px] font-medium text-[#1a1a2e]">{tt("Effect")}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="group" aria-label={tt("Effect")}>
        {WALLPAPER_EFFECTS.map((id) => {
          const on = current === id
          /* The tile's own look: this effect on this theme, with the tile's blur kept small enough to see the picture. */
          const sample = { ...theme, wallpaper_effect: id, image_blur: 0, wallpaper_blur: id === "blur" ? Math.min(blur, 6) : theme.wallpaper_blur }
          const look = wallpaperMediaLook(sample, kind)
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              data-wallpaper-effect-choice={id}
              onClick={() => onChange(effectUpdate(theme, kind, id))}
              className={cn(
                "relative flex min-h-11 cursor-pointer flex-col items-stretch rounded-2xl border bg-white p-1.5 text-center outline-none transition-[border-color] duration-150 focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)] [-webkit-tap-highlight-color:transparent]",
                choiceOff,
              )}
            >
              <ChoiceMark on={on} />
              <span className="relative block aspect-square overflow-hidden rounded-xl bg-[#d9d4cb] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                {src ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={src} alt="" decoding="async" loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ filter: look.filter, scale: String(look.scale) }} />
                ) : (
                  <span className="absolute inset-0" style={{ background: "linear-gradient(140deg,#7d8ca3 0%,#d8c3a5 60%,#f2e6d4 100%)", filter: look.filter }} />
                )}
                <WallpaperEffectLayers look={look} box={{ position: "absolute", inset: 0 }} />
                <CheckMark on={on} small className="right-1 top-1" />
              </span>
              <span className={cn("block truncate pb-0.5 pt-1.5 text-[12px] font-medium transition-colors duration-[180ms]", on ? "text-[#1a1a2e]" : "text-[#4b5563]")}>{effectLabel(id)}</span>
            </button>
          )
        })}
      </div>
      {current === "blur" ? (
        <div className="mt-5">
          <RangeRow label={tt("Blur")} value={blur} min={2} max={WALLPAPER_BLUR_MAX} step={1} unit="px" onChange={(v) => onChange({ wallpaper_effect: "blur", wallpaper_blur: v, ...(kind === "image" ? { image_blur: 0 } : {}) })} />
        </div>
      ) : null}
      <div className="mt-5 space-y-4">
        <ColorRow
          label={current === "duotone" ? tt("Duotone colour") : tt("Tint")}
          value={tint}
          emptyLabel={current === "duotone" ? tt("Deep blue") : tt("No tint")}
          onChange={(hex) => onChange({ wallpaper_tint: hex, ...(current !== "duotone" && !strength ? { wallpaper_tint_strength: 30 } : {}) })}
          onClear={() => onChange({ wallpaper_tint: null, wallpaper_tint_strength: null })}
          suggestions={["#000000", "#ffffff", "#1f2a6b", "#b2846c", "#0c3b35", "#d42d17"]}
        />
        {tint || current === "duotone" ? (
          <RangeRow label={current === "duotone" ? tt("Duotone strength") : tt("Tint strength")} value={strength} min={0} max={100} step={5} unit="%" onChange={(v) => onChange({ wallpaper_tint_strength: v })} />
        ) : null}
      </div>
    </div>
  )
}
