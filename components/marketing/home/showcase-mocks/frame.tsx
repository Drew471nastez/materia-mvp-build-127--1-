import type { CSSProperties, ReactNode } from "react"
import type { SectionStyle } from "../lazy-section"

/*
  SHOWCASE MOCKS: one design pixel = `--u`.
  Every mock is drawn at a fixed design width (e.g. 1040 for a desktop page,
  390 for a phone) and measured in `Nu` units, which this file rewrites to
  calc(N * var(--u)). `--u` is the frame's container width divided by the
  design width, so a mock is the same picture at any size, crisp, with no
  JavaScript measuring and no transform scaling text into blur.
*/
export const u = (css: string) =>
  css.replace(/(^|[\s(,:/*])(-?\d*\.?\d+)u\b/g, (_, pre: string, n: string) => `${pre}calc(${n}*var(--u))`)

/** Optimized Unsplash photos, downloaded and re-encoded (public/home/showcase). */
export const pic = (name: string) => `/home/showcase/${name}.webp`

/*
  Landing round 19 (perf on a phone): the mocks draw these photographs a few times smaller than the files, and a
  browser decodes the whole file whatever it draws (stz-hero.webp, 1800 x 800, was shown 268px wide on a phone). Each
  has smaller copies (scripts/build-home-image-variants.mjs writes them: <name>-<width>.webp) and the width it is drawn
  at, measured at 390, 768, 1024, 1440 and 1920px wide, so the browser takes the smallest copy that is still sharp.
  Every name here is drawn in one place (builder-mocks.tsx), so its size is that place's.
*/
export const PIC_SETS: Record<string, { widths: readonly number[]; sizes: string }> = {
  /* The Steez store's two slideshow photos: 69% of a phone's width, 55% of a wider screen's. */
  "stz-hero": { widths: [480, 960], sizes: "(max-width:767px) 69vw, 55vw" },
  "stz-summer": { widths: [480, 960], sizes: "(max-width:767px) 69vw, 55vw" },
  /* Its product shots: 17% of a phone, 13.5% wider. */
  "stz-p-hoodie": { widths: [240], sizes: "(max-width:767px) 17vw, 14vw" },
  "stz-p-raw": { widths: [240], sizes: "(max-width:767px) 17vw, 14vw" },
  "stz-p-grey": { widths: [240], sizes: "(max-width:767px) 17vw, 14vw" },
  "stz-p-faith": { widths: [240], sizes: "(max-width:767px) 17vw, 14vw" },
  /* The community mock's cover and the two photos in its post, and the OnePage mock's video still (phone measured; a wider screen given as much again). */
  "st-banner": { widths: [240, 480], sizes: "20vw" },
  "st-pull": { widths: [360], sizes: "30vw" },
  "st-squat": { widths: [360], sizes: "30vw" },
  "lp-f2": { widths: [240], sizes: "19vw" },
}

export function Pic({
  n,
  w,
  h,
  className = "",
  style,
}: {
  n: string
  w: number
  h: number
  className?: string
  style?: CSSProperties
}) {
  const set = PIC_SETS[n]
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={pic(n)}
      srcSet={set ? [...set.widths.map((x) => `/home/showcase/${n}-${x}.webp ${x}w`), `${pic(n)} ${w}w`].join(", ") : undefined}
      sizes={set?.sizes}
      alt=""
      width={w}
      height={h}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={`smk-pic ${className}`}
      style={style}
    />
  )
}

/** A sized, labelled picture of a page; its insides are decorative. */
export function MockFrame({
  w,
  ratio,
  label,
  className = "",
  children,
}: {
  /** Design width; omit to let the className's CSS set --w (responsive mocks). */
  w?: number
  /** Aspect ratio; omit to let the className's CSS set it. */
  ratio?: string
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`smk-frame ${className}`}
      style={ratio ? { aspectRatio: ratio } : undefined}
      role="img"
      aria-label={label}
    >
      <div className="smk" style={w ? ({ "--w": w } as CSSProperties) : undefined} aria-hidden="true">
        {children}
      </div>
    </div>
  )
}

export const FRAME_CSS = u(`
.smk-frame{position:relative;width:100%;container-type:inline-size;overflow:hidden;contain:layout paint;isolation:isolate}
.smk{--u:calc(100cqw / var(--w));position:absolute;inset:0;overflow:hidden;font-family:var(--font-inter,Inter),Inter,system-ui,sans-serif;font-size:14u;line-height:1.4;color:#16161a;text-align:left;letter-spacing:0;-webkit-font-smoothing:antialiased}
.smk *{box-sizing:border-box}
.smk p,.smk h1,.smk h2,.smk h3,.smk h4{margin:0}
.smk-pic{display:block;width:100%;height:100%;object-fit:cover;background:#e9e6e1}
.smk svg{flex:none}
.smk-status{display:flex;align-items:center;justify-content:space-between;height:44u;padding:0 26u 0 30u;font-size:15u;font-weight:600}
.smk-status i{display:flex;gap:5u;align-items:center}
.smk-status b{display:block;width:17u;height:10u;border-radius:2u;background:currentColor;opacity:.9}
.smk-status s{display:block;width:24u;height:11u;border:1.5u solid currentColor;border-radius:3.5u;opacity:.85;position:relative}
.smk-status s::after{content:"";position:absolute;inset:1.5u 5u 1.5u 1.5u;background:currentColor;border-radius:1.5u}
`)

/** iOS-like status bar for phone mocks. */
export function StatusBar({ color }: { color?: string }) {
  return (
    <div className="smk-status" style={{ color }}>
      <span>9:41</span>
      <i>
        <b />
        <s />
      </i>
    </div>
  )
}

/** The showcase sections' stylesheets share one precedence (React puts them in <head>, after the site's own CSS, once each however many sections draw them). */
export const SHOWCASE_PRECEDENCE = "w12-showcase"

/** Draws a section's stylesheets as React-managed <style href precedence>: the mocks two sections share are added once, and lazySection can put them in place ahead (SectionStyle). */
export function ShowcaseStyles({ styles }: { styles: readonly SectionStyle[] }) {
  return (
    <>
      {styles.map((s) => (
        <style key={s.href} href={s.href} precedence={s.precedence}>
          {s.css}
        </style>
      ))}
    </>
  )
}
