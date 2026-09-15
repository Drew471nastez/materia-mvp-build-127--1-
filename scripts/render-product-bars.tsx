/**
 * The real buy bar, rendered so it can be measured rather than described.
 *
 * `EditorStickyAddToCart` is the same file the live bar lives in and shares
 * the desktop row with it, so what this measures is what a visitor gets at
 * that width. The picture is a data URI: `optimizedImageUrl` hands those back
 * untouched, so nothing here depends on a network or on the image optimizer.
 */
import { createRoot } from "react-dom/client"
import { EditorStickyAddToCart } from "@/components/store-builder/sticky-add-to-cart"

/* 2x2 opaque PNG. Small enough to inline, real enough to decode. */
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4XmNkYPjPgAUwDikJAFRuAQ/7YRPjAAAAAElFTkSuQmCC"

const settings = {
  visible: true,
  backgroundColor: "#ffffff",
  buttonColor: "#2563eb",
  buttonTextColor: "#ffffff",
  buttonStyle: "add_to_cart" as const,
  borderRadius: 8,
}

const product = {
  id: "p1",
  slug: "geanta-guess-reptila",
  title: "Geanta Guess Reptila",
  thumbnail_url: PIXEL,
  price_cents: 35000,
  reviews_count: 12,
  reviews_average: 4.6,
}

const node = document.getElementById("buybar")
if (node) {
  createRoot(node).render(
    <div style={{ width: 1200 }}>
      <EditorStickyAddToCart settings={settings} product={product} isMobile={false} isEditorPreview />
    </div>,
  )
}
