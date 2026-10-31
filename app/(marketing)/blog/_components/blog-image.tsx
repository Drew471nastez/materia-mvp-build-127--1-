import Image from "next/image"

/**
 * A blog picture. Through next/image (resized, AVIF or WebP, the right width
 * for the screen) when its host is one next.config's images.remotePatterns
 * allows or it is a file on Storelib; a plain <img> otherwise, because the
 * optimizer refuses any other host and many posts link pictures from
 * elsewhere. Both carry a width and height, so the browser keeps the space
 * before the picture arrives.
 */
const OPTIMIZED_HOSTS: { host: RegExp; path?: RegExp }[] = [
  { host: /^storelib\.com$/, path: /^\/media\// },
  { host: /^[a-z0-9-]+\.supabase\.co$/, path: /^\/storage\/v1\// },
  { host: /^images\.unsplash\.com$/ },
  { host: /^img\.youtube\.com$/ },
  { host: /^i\.ytimg\.com$/ },
  { host: /^images\.pexels\.com$/ },
  { host: /^i\.pinimg\.com$/ },
]

export function canOptimize(src: string): boolean {
  if (/\.svg(?:[?#]|$)/i.test(src)) return false
  if (src.startsWith("/") && !src.startsWith("//")) return true
  try {
    const url = new URL(src)
    return url.protocol === "https:" && OPTIMIZED_HOSTS.some((h) => h.host.test(url.hostname) && (!h.path || h.path.test(url.pathname)))
  } catch {
    return false
  }
}

interface Props {
  src: string
  alt: string
  sizes: string
  className?: string
  /** The cover: loaded first, never lazily. */
  priority?: boolean
  /** Fill the parent box (which sets the shape); otherwise drawn at width x height, scaled to the column. */
  fill?: boolean
  width?: number
  height?: number
}

export function BlogImage({ src, alt, sizes, className, priority = false, fill = false, width = 1280, height = 720 }: Props) {
  if (canOptimize(src)) {
    return fill ? (
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={className} />
    ) : (
      <Image src={src} alt={alt} width={width} height={height} sizes={sizes} priority={priority} className={className} />
    )
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      {...(fill ? {} : { width, height })}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      {...(priority ? { fetchPriority: "high" as const } : {})}
      className={`${fill ? "absolute inset-0 h-full w-full " : ""}${className ?? ""}`}
    />
  )
}
