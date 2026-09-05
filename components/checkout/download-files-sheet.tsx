"use client"

/**
 * DownloadFilesSheet
 *
 * Shared component used by PurchaseStatusWrapper, LiveStickyAddToCart, and
 * EditorStickyAddToCart.  Portaled to document.body so it always sits above
 * every sticky bar (z-index 99999).
 *
 * All screen sizes → polished centered modal popup (scale + fade animation)
 *
 * Key design choices:
 * - createPortal guarantees the overlay is NEVER clipped by a parent overflow
 * - Exit animation: isOpen false → setAnimateIn(false) → setTimeout unmount
 *   so the closing transition always plays
 * - Body scroll locked only while mounted; released on any unmount path
 * - Responsive padding/sizing adapts to mobile, tablet, and desktop
 */

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { Download, Loader2, X, FileText } from "lucide-react"

export interface DownloadFileEntry {
  id: string
  file_name?: string
}

export function DownloadFilesSheet({
  isOpen,
  onClose,
  title,
  files,
  downloadingFileId,
  onDownload,
}: {
  isOpen: boolean
  onClose: () => void
  title: string
  files: DownloadFileEntry[]
  downloadingFileId: string | null
  onDownload: (id: string) => void
}) {
  const [animateIn, setAnimateIn] = useState(false)
  const [mounted, setMounted] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Mount / unmount with enter + exit animation
  useEffect(() => {
    if (isOpen) {
      setMounted(true)
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => setAnimateIn(true))
        return () => cancelAnimationFrame(r2)
      })
      return () => cancelAnimationFrame(r1)
    } else {
      setAnimateIn(false)
      const t = setTimeout(() => setMounted(false), 400)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  // Lock body scroll while modal is visible.
  useEffect(() => {
    if (!mounted) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [mounted])

  // Escape key
  useEffect(() => {
    if (!mounted) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [mounted, onClose])

  if (!mounted || typeof window === "undefined") return null

  // ── File list ──────────────────────────────────────────────────────────
  const fileList = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {files.map((file) => (
        <button
          key={file.id}
          type="button"
          onClick={() => onDownload(file.id)}
          disabled={downloadingFileId === file.id}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            padding: "12px 14px",
            borderRadius: 14,
            border: "1px solid #ebebeb",
            backgroundColor: "#fff",
            cursor: downloadingFileId === file.id ? "default" : "pointer",
            opacity: downloadingFileId === file.id ? 0.55 : 1,
            textAlign: "left" as const,
            transition: "background-color 120ms, box-shadow 120ms",
          }}
          onMouseEnter={(e) => {
            if (downloadingFileId !== file.id) {
              const el = e.currentTarget as HTMLElement
              el.style.backgroundColor = "#fafafa"
              el.style.boxShadow = "0 0 0 1px #e0e0e0"
            }
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement
            el.style.backgroundColor = "#fff"
            el.style.boxShadow = "none"
          }}
        >
          {/* File icon in gray square */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: "#f3f4f6",
              flexShrink: 0,
            }}
          >
            <FileText style={{ width: 20, height: 20, color: "#9ca3af" }} />
          </div>
          {/* File name */}
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "#18181b",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap" as const,
              minWidth: 0,
              flex: 1,
              paddingLeft: 12,
              paddingRight: 12,
            }}
          >
            {file.file_name || "File"}
          </span>
          {/* Download indicator */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 34,
              height: 34,
              borderRadius: "50%",
              backgroundColor: "#18181b",
              color: "#fff",
              flexShrink: 0,
            }}
          >
            {downloadingFileId === file.id ? (
              <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
            ) : (
              <Download style={{ width: 14, height: 14 }} />
            )}
          </div>
        </button>
      ))}
    </div>
  )

  return createPortal(
    <>
      {/* ── Backdrop ─────────────────────────────────────────────────────── */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99998,
          backgroundColor: "rgba(0,0,0,0.48)",
          opacity: animateIn ? 1 : 0,
          transition: "opacity 280ms ease",
          pointerEvents: animateIn ? "auto" : "none",
        }}
      />

      {/* ── Centered modal (all screen sizes) ────────────────────────────── */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          pointerEvents: animateIn ? "auto" : "none",
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Download files"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 520,
            borderRadius: 20,
            backgroundColor: "#fff",
            boxShadow:
              "0 32px 80px -12px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.05)",
            opacity: animateIn ? 1 : 0,
            transform: animateIn
              ? "scale(1) translateY(0)"
              : "scale(0.96) translateY(14px)",
            transition:
              "opacity 260ms cubic-bezier(0.16,1,0.3,1), transform 260ms cubic-bezier(0.16,1,0.3,1)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              padding: "20px 20px 16px 20px",
              borderBottom: "1px solid #f4f4f5",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: "#f4f4f5",
                  flexShrink: 0,
                }}
              >
                <Download style={{ width: 18, height: 18, color: "#3f3f46" }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#09090b",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap" as const,
                  }}
                >
                  {title}
                </h2>
                <p style={{ margin: 0, marginTop: 2, fontSize: 13, color: "#71717a" }}>
                  {files.length} file{files.length !== 1 ? "s" : ""} — click any to download
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "none",
                backgroundColor: "#f4f4f5",
                color: "#71717a",
                cursor: "pointer",
                flexShrink: 0,
                transition: "background-color 130ms",
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLElement).style.backgroundColor = "#e4e4e7"
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.backgroundColor = "#f4f4f5"
              }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>

          {/* File list */}
          <div
            ref={contentRef}
            style={{
              padding: "16px 20px 20px 20px",
              maxHeight: "60vh",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
            }}
          >
            {fileList}
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
