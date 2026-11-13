/*
  THE HOME PAGE'S ONEPAGES ARE PICTURES OF THE LIVE ONEPAGE (land round 2).

  Every OnePage the home page shows (the storefront card's strip, the
  checkout tile, the OnePage editor's preview, the OnePage slide of the
  business carousel) is a capture of the live page's own component
  (components/onepage/public-onepage PublicOnePage), drawn in a theme the
  Design tab ships (lib/onepage/theme-apply lookFromTemplate) with sample
  blocks a creator would really add: the header block and the social row,
  link buttons with thumbnails, product rows, callouts and tiles with
  prices and Buy, a video card, an image carousel or grid, an FAQ, a
  testimonial and the email signup. So each one has the live page's real
  chrome (the Share button, the theme's wallpaper and skin, the "on
  Storelib" badge), which a hand drawn copy cannot keep up with.

  A picture costs the home page no script, no theme fonts and none of the
  skins' stylesheet (components/onepage/themes/theme-skins.css, about 34 KB
  gzipped, which ThemePreview brought in before). Each is a small webp in
  public/home/onepage, sized for the box it fills at 2x, loaded lazily.

  The creators are made up. Their photos are Unsplash (Unsplash License, free
  for commercial use), by photo id (images.unsplash.com/photo-<id>):
    Kofi       1463453091185-61582044d556, 1470225620780-dba8ba36b745,
               1514525253161-7a46d19cd819, 1603048588665-791ca8aea617
    Mariana    1546961329-78bef0414d7c, 1510894347713-fc3ed6fdf539,
               1544367567-0f2fcb009e0b, 1585208798174-6cedd86e019a,
               1588286840104-8957b019727f
    Arjun      1595152772835-219674b2a8a6, 1586165368502-1bad197a6461,
               1560174038-da43ac74f01b, 1611195974226-a6a9be9dd763
    Ruth       1489424731084-a5d8b219a5bb, 1586444248902-2f64eddc13df,
               1549931319-a545dcf3bc73, 1517433670267-08bbd4be890f
    Rafa       1521119989659-a83eee488004, 1565058379802-bbe93b2f703a,
               1598371839696-5c5bb00bdc28, 1611501275019-9b5cda994e8d
    Lucía      1506863530036-1efeddceb993, 1589903308904-1010c2294adc,
               1478737270239-2f02b77fc618, 1511671782779-c97d3d27a1d4,
               1590602847861-f357a9332bbc
  (and the showcase's Jonas, Hemi and Noor, components/marketing/build-showcase:
    1531427186611-ecfd6d936c79, 1517649763962-0c623066013b,
    1464822759023-fed622ff2c3b, 1507035895480-2b3156c31fc8;
    1564564321837-a57b7070ac4f, 1502680390469-be75c86b636f,
    1455729552865-3658a5d39692, 1531722569936-825d3dd91b15;
    1573496359142-b8d87734a5a2, 1416879595882-3373a0480b5b,
    1501004318641-b39e6451bec6, 1466781783364-36c955e42a7f,
    1485955900006-10f4d324d411)
*/
import type { CSSProperties } from "react"

export type HomeOnePageShot = {
  src: string
  width: number
  height: number
  /** The page's own ground, painted behind the picture while it loads. */
  paint: string
  /** Who and what, for the section's own alt text and tests. */
  who: string
  theme: string
  handle: string
}

const D = "/home/onepage"

/** The storefront card's strip: three OnePages between the stores. */
export const KOFI: HomeOnePageShot = { src: `${D}/op-kofi.webp`, width: 560, height: 1091, paint: "#080717", who: "Kofi Asante", theme: "arcade", handle: "kofiasante" }
export const MARIANA: HomeOnePageShot = { src: `${D}/op-mariana.webp`, width: 560, height: 1091, paint: "#f5efe8", who: "Mariana Lopes", theme: "dune", handle: "marianayoga" }
export const ARJUN: HomeOnePageShot = { src: `${D}/op-arjun.webp`, width: 560, height: 1091, paint: "#007f7f", who: "Arjun Mehta", theme: "classic98", handle: "arjunplays" }
/** The checkout tile: the tap lands on her guide's Buy now. */
export const RUTH: HomeOnePageShot = { src: `${D}/op-ruth.webp`, width: 444, height: 706, paint: "#f8f4ec", who: "Ruth Callaghan", theme: "notebook", handle: "ruthbakes" }
/** The OnePage editor's preview, before and after the signup block is switched on. */
export const RAFA: HomeOnePageShot = { src: `${D}/op-rafa.webp`, width: 500, height: 1058, paint: "#d9d7d1", who: "Rafa Ortega", theme: "grunge", handle: "rafa.ink" }
export const RAFA_SIGNUP: HomeOnePageShot = { ...RAFA, src: `${D}/op-rafa-signup.webp` }
/** The business carousel's OnePage slide: the live page on a computer (a card on the wallpaper) and on a phone. */
export const LUCIA_DESKTOP: HomeOnePageShot = { src: `${D}/op-lucia-desktop.webp`, width: 1536, height: 1152, paint: "#edeae0", who: "Lucía Ferrer", theme: "gazette", handle: "luciaferrer" }
export const LUCIA_PHONE: HomeOnePageShot = { ...LUCIA_DESKTOP, src: `${D}/op-lucia-phone.webp`, width: 720, height: 1280 }

/**
 * A OnePage as a phone shows it: the capture fills the box it is given from
 * the top, its width the box's width (a taller box shows more of the page).
 */
export function HomeOnePage({ shot, className = "", style, imgClassName = "" }: { shot: HomeOnePageShot; className?: string; style?: CSSProperties; imgClassName?: string }) {
  return (
    <div className={`hop ${className}`} style={{ background: shot.paint, ...style }} data-home-onepage={shot.theme} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot.src} width={shot.width} height={shot.height} alt="" loading="lazy" decoding="async" draggable={false} className={imgClassName} />
    </div>
  )
}

/** The box's rules: the picture fills it from the top (a section's own class places the box). Put by each section that draws one (React keeps one copy). */
export const HOME_ONEPAGE_CSS = `:where(.hop){position:relative}
.hop{overflow:hidden;contain:layout paint}
.hop>img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;object-position:top center;user-select:none}`

export function HomeOnePageStyle() {
  return (
    <style href="home-onepage" precedence="w13-home">
      {HOME_ONEPAGE_CSS}
    </style>
  )
}
