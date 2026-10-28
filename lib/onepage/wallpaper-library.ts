/**
 * The wallpaper picker's library (components/onepage/themes/wallpaper-library.tsx explains where each picture
 * comes from), and the sized copies a square asks for. Kept apart from the picker so it can be read without React.
 */
import { tt } from "@/lib/i18n/text"
import { optimizedImageUrl } from "@/lib/images/optimized-url"

export interface LibraryWallpaper {
  id: string
  url: string
  /** The picture's own colour, under it while it loads. */
  tone: string
  label: () => string
}

const STORELIB = "https://storelib.com/media/platform%20images/wallpapers%20blocks/"

export const WALLPAPER_LIBRARY: readonly LibraryWallpaper[] = [
  /* The ten the picker always had, in their order. */
  { id: "forest", url: "https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?w=1920&q=95", tone: "#55625a", label: () => tt("Nature") },
  { id: "space-stars", url: "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=1920&q=95", tone: "#1d2333", label: () => tt("Space") },
  { id: "blocks-gradient", url: `${STORELIB}download.png`, tone: "#9a7f8f", label: () => tt("Gradient Blocks") },
  { id: "abstract-pink", url: `${STORELIB}c78fa2c87ca69f52361687fa7b27b909.jpg`, tone: "#d9a3b0", label: () => tt("Abstract Pink") },
  { id: "black-solid", url: `${STORELIB}black_background.jpg`, tone: "#0b0b0b", label: () => tt("Black") },
  { id: "dark-texture", url: `${STORELIB}b607af5996db7b6b9af70e1a777aa808.jpg`, tone: "#202020", label: () => tt("Dark Texture") },
  { id: "gradient-warm", url: `${STORELIB}510e061be1f3d8c7a56a9cff56c8ae24.jpg`, tone: "#5c4636", label: () => tt("Warm Gradient") },
  { id: "fusion-gradient", url: `${STORELIB}3513ccb7c260ffd3f3662776ca8ac9e0.jpg`, tone: "#4a3550", label: () => tt("Fusion") },
  { id: "blue-texture", url: `${STORELIB}214ffad10a8306624600af8823503d46.jpg`, tone: "#2c4a6e", label: () => tt("Blue Texture") },
  { id: "abstract-dark", url: `${STORELIB}19fef3f73560866d37752eb95418f4bb.jpg`, tone: "#1c1c22", label: () => tt("Abstract Dark") },
  /* Round 40: the Links tab's library, the ones not above already. */
  { id: "mountains-night", url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1920&q=80", tone: "#22324a", label: () => tt("Mountains") },
  { id: "ocean", url: "https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=1920&q=80", tone: "#6b88a3", label: () => tt("Ocean") },
  { id: "colourful-gradient", url: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1920&q=80", tone: "#c26fa0", label: () => tt("Colourful Gradient") },
  { id: "blue-gradient", url: "https://images.unsplash.com/photo-1557683316-973673baf926?w=1920&q=80", tone: "#3d5fb8", label: () => tt("Blue Gradient") },
  { id: "abstract-minimal", url: "https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?w=1920&q=80", tone: "#d7c9bd", label: () => tt("Abstract Minimal") },
  { id: "soft-waves", url: "https://images.unsplash.com/photo-1620121692029-d088224ddc74?w=1920&q=80", tone: "#e0b7a4", label: () => tt("Soft Waves") },
  { id: "mesh-gradient", url: "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=1920&q=80", tone: "#4c6ea8", label: () => tt("Mesh Gradient") },
  { id: "marble", url: "https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=1920&q=80", tone: "#c9c3bd", label: () => tt("Marble") },
  { id: "paper-texture", url: "https://images.unsplash.com/photo-1604076913837-52ab5629fba9?w=1920&q=80", tone: "#d8d2c4", label: () => tt("Paper Texture") },
  /* And the photos two themes are made of, as those themes save them. */
  { id: "silver-peak", url: "https://images.unsplash.com/photo-1505765050516-f72dcac9c60e?w=1920&q=80&sat=-100", tone: "#5a5a5a", label: () => tt("Silver Peak") },
  { id: "dusk-haze", url: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?rect=0,0,3456,3000&w=1920&q=80&blur=25", tone: "#c9b9ad", label: () => tt("Dusk Haze") },
]

/** The copies a square can be drawn from: 256, 384 and 640 pixels wide (the optimizer's own widths). */
export function librarySrcSet(url: string): { src: string; srcSet: string | undefined } {
  const small = optimizedImageUrl(url, 128, 75)
  if (small === url) return { src: url, srcSet: undefined }
  return { src: optimizedImageUrl(url, 192, 75), srcSet: `${small} 256w, ${optimizedImageUrl(url, 192, 75)} 384w, ${optimizedImageUrl(url, 320, 75)} 640w` }
}

