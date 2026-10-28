"use client"

/**
 * ===========================================================================
 *  THE WALLPAPER LIBRARY: MORE PICTURES, EACH ARRIVING WHOLE
 * ===========================================================================
 * Round 40, the owner: "Images in the wallpaper more optimized, no glitching,
 * appear smooth, no lag. Add more images from the library to the wallpaper
 * picker."
 *
 * The picker drew each wallpaper's own file into a square the size of a
 * thumb: Nature's 1920px JPEG at quality 95 for a 110px tile, ten of them,
 * each painting in from the top as it arrived. Now each square asks the
 * image optimizer for a copy its own size (a srcset of 256, 384 and 640
 * pixel copies, the browser picks by the screen), sits on the picture's own
 * colour while it comes, and fades in once it is decoded, never drawn half
 * way. A picture already in the cache is shown at once, with no fade.
 *
 * MORE PICTURES, ALL FROM STORELIB'S OWN LIBRARY. Nothing new is fetched
 * from anywhere the product does not already use: the ten wallpapers the
 * picker had; the nine further pictures the Links tab's image library
 * already offers (components/onepage/tabs/links-tab IMAGE_LIBRARY, Unsplash,
 * free for commercial use under the Unsplash License); and the two photos
 * the Darkroom and Haze themes are made from. Each is saved as the same
 * address it always was, so a page that chose one keeps it.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { WALLPAPER_LIBRARY, librarySrcSet, type LibraryWallpaper } from "@/lib/onepage/wallpaper-library"
import { SwatchMark } from "@/components/onepage/editor-kit"

/** One square: its colour first, then the picture, faded in once decoded (at once when it is already in the cache). */
function LibraryTile({ item, selected, onPick }: { item: LibraryWallpaper; selected: boolean; onPick: (url: string) => void }) {
  const imgRef = React.useRef<HTMLImageElement>(null)
  const [ready, setReady] = React.useState(false)
  const [instant, setInstant] = React.useState(false)
  const { src, srcSet } = librarySrcSet(item.url)
  React.useLayoutEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth > 0) {
      setInstant(true)
      setReady(true)
    }
  }, [])
  const shown = () => {
    const img = imgRef.current
    if (!img) return setReady(true)
    if (typeof img.decode !== "function") return setReady(true)
    img.decode().then(() => setReady(true), () => setReady(true))
  }
  const label = item.label()
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      data-wallpaper-library={item.id}
      onClick={() => onPick(item.url)}
      className="relative aspect-square cursor-pointer rounded-xl outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)] [-webkit-tap-highlight-color:transparent]"
    >
      <span className="block h-full w-full overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]" style={{ background: item.tone }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          srcSet={srcSet}
          sizes="(min-width: 768px) 176px, 31vw"
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={shown}
          onError={() => setReady(true)}
          className={cn("h-full w-full object-cover", instant ? "" : "transition-opacity duration-300 ease-out", ready ? "opacity-100" : "opacity-0")}
        />
      </span>
      <SwatchMark on={selected} className="rounded-[15.5px]" />
    </button>
  )
}

export function WallpaperLibrary({ value, onPick }: { value: string | null | undefined; onPick: (url: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2.5" data-wallpaper-library-grid="">
      {WALLPAPER_LIBRARY.map((item) => (
        <LibraryTile key={item.id} item={item} selected={value === item.url} onPick={onPick} />
      ))}
    </div>
  )
}
