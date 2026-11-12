import type { CSSProperties, ReactNode } from "react"

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
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={pic(n)}
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
.smk{--u:calc(100cqw / var(--w));position:absolute;inset:0;overflow:hidden;font-family:var(--font-inter),Inter,system-ui,sans-serif;font-size:14u;line-height:1.4;color:#16161a;text-align:left;letter-spacing:0;-webkit-font-smoothing:antialiased}
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
