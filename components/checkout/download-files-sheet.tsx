"use client"

/**
 * DownloadFilesSheet
 *
 * Shared component used by PurchaseStatusWrapper, LiveStickyAddToCart, and
 * EditorStickyAddToCart.  Portaled to document.body so it always sits above
 * every sticky bar (z-index 99999).
 *
 * Desktop ≥ 768 px → polished centered modal (scale + fade animation)
 * Mobile  < 768 px → bottom sheet with drag-to-dismiss + smooth enter / exit
 *
 * Key design choices vs the old Dialog + isMobileViewport approach:
 * - createPortal guarantees the overlay is NEVER clipped by a parent overflow
 * - No isMobileViewport state: CSS media queries handle the split (no flash)
 * - Exit animation: isOpen false → setAnimateIn(false) → setTimeout unmount
 *   so the closing transition always plays
 * - Body scroll locked only while mounted; released on any unmount path
 * - No focus trap that can accidentally lock mobile scroll
 */

import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { Download, FileText, Loader2, X } from "lucide-react"

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

  // Drag state for mobile sheet
  const [dragY, setDragY] = useState(0)
  const dragStartY = useRef<number | null>(null)
  const dragging = useRef(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Mount / unmount with enter + exit animation
  useEffect(() => {
    if (isOpen) {
      setMounted(true)
      // Double-rAF: browser paints the initial hidden state before we flip to
      // visible, so the CSS transition actually fires on first render.
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => setAnimateIn(true))
        return () => cancelAnimationFrame(r2)
      })
      return () => cancelAnimationFrame(r1)
    } else {
      setAnimateIn(false)
      setDragY(0)
      dragging.current = false
      dragStartY.current = null
      const t = setTimeout(() => setMounted(false), 400)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  // Lock body scroll while sheet is visible.
  // Now that globals.css no longer has overflow-y: auto !important on body,
  // overflow: hidden works correctly on iOS Safari too.
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

  // ── Drag-to-dismiss (mobile sheet only) ──────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
    dragging.current = false
  }, [])

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (dragStartY.current === null) return
      const dy = e.touches[0].clientY - dragStartY.current
      const scrollTop = contentRef.current?.scrollTop ?? 0
      // Only drag down; only engage when the file list is scrolled to the top
      if (dy > 0 && scrollTop === 0) {
        dragging.current = true
        setDragY(dy)
      }
    },
    []
  )

  const handleTouchEnd = useCallback(() => {
    if (dragY > 90) {
      onClose()
    } else {
      setDragY(0)
    }
    dragStartY.current = null
  }, [dragY, onClose])

  if (!mounted || typeof window === "undefined") return null

  // ── Shared file list ──────────────────────────────────────────────────────
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
          {/* Icon + name */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              minWidth: 0,
              flex: 1,
              paddingRight: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: "#f4f4f5",
                flexShrink: 0,
              }}
            >
              <FileText style={{ width: 16, height: 16, color: "#71717a" }} />
            </div>
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "#18181b",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap" as const,
              }}
            >
              {file.file_name || "File"}
            </span>
          </div>
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
          // pointer-events: none when invisible — prevents this fixed overlay
          // from consuming touches/scroll when the sheet is closing/closed.
          pointerEvents: animateIn ? "auto" : "none",
        }}
      />

      {/* ── Desktop modal (md+) ──────────────────────────────────────────── */}
      <div
        onClick={onClose}
        className="hidden md:flex"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
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
              gap: 16,
              padding: "24px 24px 20px 24px",
              borderBottom: "1px solid #f4f4f5",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: "#f4f4f5",
                  flexShrink: 0,
                }}
              >
                <Download style={{ width: 20, height: 20, color: "#3f3f46" }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 17,
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
              padding: "20px 24px 24px 24px",
              maxHeight: "60vh",
              overflowY: "auto",
            }}
          >
            {fileList}
          </div>
        </div>
      </div>

      {/* ── Mobile bottom sheet (< md) ──────────────────────────────────── */}
      <div
        className="md:hidden"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99999,
          // pointer-events: none when translated off-screen (closing/closed)
          pointerEvents: animateIn ? "auto" : "none",
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            borderRadius: "22px 22px 0 0",
            backgroundColor: "#fff",
            boxShadow:
              "0 -8px 48px -4px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.04)",
            // Disable CSS transition while user is actively dragging for instant follow
            transform:
              dragging.current && dragY > 0
                ? `translateY(${dragY}px)`
                : animateIn
                ? "translateY(0)"
                : "translateY(100%)",
            transition:
              dragging.current && dragY > 0
                ? "none"
                : "transform 400ms cubic-bezier(0.32,0.72,0,1)",
            maxHeight: "88dvh",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            display: "flex",
            flexDirection: "column" as const,
          }}
        >
          {/* Drag handle */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              paddingTop: 14,
              paddingBottom: 6,
              touchAction: "none",
            }}
          >
            <div
              style={{
                width: 38,
                height: 4,
                borderRadius: 9999,
                backgroundColor: "#d4d4d8",
              }}
            />
          </div>

          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "8px 20px 14px 20px",
              borderBottom: "1px solid #f4f4f5",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 17,
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
                {files.length} file{files.length !== 1 ? "s" : ""} included
              </p>
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
              }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>

          {/* File list */}
          <div
            ref={contentRef}
            style={{
              flex: 1,
              padding: "16px 20px 8px 20px",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
            }}
          >
            {fileList}
          </div>
          <div style={{ height: 16 }} />
        </div>
      </div>
    </>,
    document.body
  )
}
