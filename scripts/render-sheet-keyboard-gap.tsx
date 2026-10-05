/**
 * ===========================================================================
 *  THE POST SHEET OVER A PAGE OF DARK MEDIA, WITH A COMMENT FIELD IN IT
 * ===========================================================================
 * Image 66's shape, built from the real parts: ViewportVars publishing the
 * viewport on <html>, the app's own BottomSheet with `aboveKeyboard`, the
 * post sheet's own height (`--vv-h` less the status bar), a comment box with
 * a field and a send button at the foot of a long scroller, and behind all
 * of it a page of dark photographs so any pixel of page that shows between
 * the sheet and the keyboard is unmistakable.
 *
 * `?max=` and `?height=` give the other sheets their own geometry: the GIF
 * picker's fixed height, the pickers' default, a short sheet.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { ViewportVars } from "@/components/viewport-vars"

const q = new URLSearchParams(location.search)
/* The post sheet's own numbers (components/community/member/post-overlay.tsx). */
const POST_HEIGHT = "calc(var(--vv-h, 100dvh) - max(env(safe-area-inset-top), 12px) - 8px)"
const height = q.get("height") ?? (q.has("short") ? undefined : q.has("fill") ? "min(70dvh, 560px)" : POST_HEIGHT)
const maxHeight = q.get("max") ?? (q.has("short") ? "min(86dvh, 720px)" : q.has("fill") ? "min(70dvh, 560px)" : POST_HEIGHT)
/* The GIF picker's shape: the children lay themselves out and scroll themselves. */
const fill = q.has("fill")

/* A photograph, dark enough that a strip of it behind a white sheet is plain. */
const photo = (a: string, b: string) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${a}"/><circle cx="60" cy="140" r="70" fill="${b}"/><rect x="110" y="10" width="80" height="120" fill="${b}"/></svg>`)}")`

function Page() {
  return (
    <div id="page" style={{ background: "#0b0b0f", minHeight: "200vh" }}>
      {Array.from({ length: 30 }, (_, i) => (
        <div key={i} data-page-media="" style={{ height: 160, margin: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          <div style={{ background: photo("#15161c", "#2b2f3a"), backgroundSize: "cover" }} />
          <div style={{ background: photo("#1d1a16", "#3a332b"), backgroundSize: "cover" }} />
        </div>
      ))}
    </div>
  )
}

function CommentBox() {
  return (
    <div data-comment-box="comment" style={{ display: "flex", gap: 8, alignItems: "flex-end", padding: "12px 16px" }}>
      <div style={{ width: 32, height: 32, borderRadius: 999, background: "#f1f2f4", flex: "0 0 auto" }} />
      <div style={{ flex: 1, minWidth: 0, border: "1px solid #e6e8ec", borderRadius: 16, padding: 8, display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea data-comment-field="" aria-label="Write a comment" placeholder="Write a comment..." rows={2} style={{ flex: 1, minWidth: 0, border: 0, outline: "none", resize: "none", font: "inherit", fontSize: 16, background: "transparent" }} />
        <button data-comment-send="" type="button" style={{ flex: "0 0 auto", height: 40, padding: "0 16px", borderRadius: 999, border: 0, background: "#8b5cf6", color: "#fff", fontSize: 15 }}>Comment</button>
      </div>
    </div>
  )
}

function Harness() {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    ;(window as unknown as { __sheet: unknown }).__sheet = { open: () => setOpen(true), close: () => setOpen(false) }
  }, [])
  return (
    <>
      <ViewportVars />
      <Page />
      <BottomSheet
        isOpen={open}
        onClose={() => setOpen(false)}
        label="Post"
        hideFrom="sm"
        zIndex={130}
        aboveKeyboard
        height={height}
        maxHeight={maxHeight}
        fill={fill}
        header={<div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid #f0f1f3", fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>Introductions</div>}
      >
        <div data-post-overlay="phone" style={fill ? { display: "flex", minHeight: 0, flex: 1, flexDirection: "column", overflowY: "auto" } : undefined}>
          {Array.from({ length: q.has("short") ? 1 : 6 }, (_, i) => (
            <p key={i} style={{ margin: "12px 16px", fontSize: 15, color: "#1a1a2e" }}>
              A line of the post, long enough to wrap on a phone and give the scroller something to carry. Number {i + 1}.
            </p>
          ))}
          {!q.has("short") && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, margin: "0 16px" }}>
                <div style={{ height: 120, background: photo("#15161c", "#2b2f3a"), backgroundSize: "cover" }} />
                <div style={{ height: 120, background: photo("#1d1a16", "#3a332b"), backgroundSize: "cover" }} />
              </div>
              <div style={{ display: "flex", gap: 20, padding: "14px 16px", borderBottom: "1px solid #f0f1f3", fontSize: 15, color: "#1a1a2e" }}>
                <span>Like</span><span>Comment</span><span style={{ marginLeft: "auto" }}>Save</span>
              </div>
            </>
          )}
          <CommentBox />
          {!q.has("short") && <p style={{ margin: "8px 16px 24px", fontSize: 15, color: "#9aa0a6" }}>No comments yet. Say something first.</p>}
        </div>
      </BottomSheet>
    </>
  )
}

createRoot(document.getElementById("app")!).render(<Harness />)
