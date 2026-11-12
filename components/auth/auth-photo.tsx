import { getImageProps } from "next/image"

/**
 * ===========================================================================
 *  THE PHOTO BESIDE LOG IN AND SIGN UP
 * ===========================================================================
 * The right half of every sign in step from 1024px. It was a next/image with
 * `priority` inside a page that, until round 3, drew only a spinner in its
 * first HTML: the photo was asked for after the script had run and the
 * session had been read, 400ms into a cold load, and arrived into a black
 * panel. On a phone, where the panel is never shown, `sizes` of 0px still
 * fetched the smallest copy.
 *
 * Now:
 *   - a <picture> whose only source is for a screen 1024px wide or more, so a
 *     phone asks for nothing at all;
 *   - the source preloaded at high priority from <head>, for the same media,
 *     so the photo's request leaves with the document's first bytes;
 *   - under it, the same photo 32px wide (a few hundred bytes), also
 *     preloaded, drawn soft and full size: what shows for the moment before
 *     the photo lands is the photo, blurred, never a black or grey block;
 *   - AVIF or WebP at the panel's width from the image optimiser (50vw).
 *
 * scripts/check-auth-arrival-r3.mjs measures when it is asked for and drawn.
 */

export const LOGIN_PHOTO = "https://storelib.com/media/platform%20images/collage%20imags/eemo.png"
export const SIGNUP_PHOTO = "https://storelib.com/media/platform%20images/collage%20imags/awapage.png"

const WIDE = "(min-width: 1024px)"
const SIZES = "50vw"
/** An empty image for the <img> a phone falls back to: no request. */
const NOTHING = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="

export function AuthPhoto({ src, className }: { src: string; className?: string }) {
  const { props } = getImageProps({ src, alt: "", fill: true, sizes: SIZES, quality: 75 })
  const { props: soft } = getImageProps({ src, alt: "", width: 32, height: 32, quality: 75 })
  return (
    <div
      data-auth-photo=""
      aria-hidden
      className={`relative hidden shrink-0 overflow-hidden bg-[#2a2a30] lg:block lg:h-[100dvh] lg:w-1/2 ${className ?? ""}`}
    >
      {/* React puts both links in <head>; `media` keeps a phone from fetching either. */}
      <link rel="preload" as="image" href={soft.src} media={WIDE} fetchPriority="high" />
      <link rel="preload" as="image" imageSrcSet={props.srcSet} imageSizes={SIZES} media={WIDE} fetchPriority="high" />
      <div
        className="absolute inset-[-8%] bg-cover bg-center blur-2xl"
        style={{ backgroundImage: `url("${soft.src}")` }}
      />
      <picture>
        <source media={WIDE} srcSet={props.srcSet} sizes={SIZES} />
        <img
          src={NOTHING}
          alt=""
          decoding="async"
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
      </picture>
    </div>
  )
}

/**
 * Asks for the photo a moment early: a pointer resting on Log in, Sign up or
 * Sell on Storelib in the header, on a screen wide enough to show it. The
 * press then lands on a page whose photo is already in the cache. A phone
 * never calls it, and a narrow window asks for nothing.
 */
export function warmAuthPhoto(href: string): void {
  if (typeof window === "undefined" || !window.matchMedia(WIDE).matches) return
  const src = /^\/login(?:[?#]|$)/.test(href) ? LOGIN_PHOTO : /^\/signup(?:[?#]|$)/.test(href) ? SIGNUP_PHOTO : null
  if (!src) return
  const { props } = getImageProps({ src, alt: "", fill: true, sizes: SIZES, quality: 75 })
  const { props: soft } = getImageProps({ src, alt: "", width: 32, height: 32, quality: 75 })
  for (const [key, attrs] of [
    [soft.src, { href: soft.src }],
    [props.srcSet ?? props.src, { imageSrcset: props.srcSet ?? "", imageSizes: SIZES }],
  ] as const) {
    if (document.head.querySelector(`link[data-auth-photo-warm="${CSS.escape(key)}"]`)) continue
    const link = document.createElement("link")
    link.rel = "preload"
    link.as = "image"
    link.media = WIDE
    link.dataset.authPhotoWarm = key
    if ("href" in attrs) link.href = attrs.href
    else {
      link.setAttribute("imagesrcset", attrs.imageSrcset)
      link.setAttribute("imagesizes", attrs.imageSizes)
    }
    document.head.appendChild(link)
  }
}
