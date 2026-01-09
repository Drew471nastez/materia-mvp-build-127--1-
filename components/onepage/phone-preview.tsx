"use client"

import type React from "react"

import { useOnePage } from "@/lib/onepage/context"
import type {
  OnePageBlock,
  OnePageTheme,
  LinkButtonBlockData,
  TextBlockData,
  ImageBlockData,
  DividerBlockData,
  EmailCaptureBlockData,
  HeaderBlockData,
  SocialRowBlockData,
  GroupBlockData,
} from "@/lib/onepage/types"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Globe, Bell, X, Send, Check, Link2, ExternalLink } from "lucide-react"
import { useState, useRef, useCallback, createContext, useContext } from "react"

// Spotify Modal Context - allows modals to render at root level instead of inside blocks
interface SpotifyModalContextType {
  openSpotifyModal: (data: {
    title: string
    embedUrl: string
    spotifyUrl: string
    streamingServices?: { platform: string; url: string | null; found: boolean }[]
    spotifyMode?: string
  }) => void
}
const SpotifyModalContext = createContext<SpotifyModalContextType | null>(null)

// Notification Bell Component with Subscribe Form
function NotificationBell({
  sellerName,
  scale = "small",
  style = "glass",
  isVisible = true,
}: { sellerName: string; scale?: "small" | "normal"; style?: "glass" | "white" | "black"; isVisible?: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setIsSubmitting(true)
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 800))
    setIsSubmitting(false)
    setSubmitted(true)
    setTimeout(() => {
      setIsOpen(false)
      setSubmitted(false)
      setEmail("")
    }, 1500)
  }

  const size = scale === "small" ? { bell: 28, icon: 12, panel: 160 } : { bell: 36, icon: 16, panel: 200 }

  // Style configurations
  const styles = {
    glass: {
      buttonBg: "rgba(255, 255, 255, 0.15)",
      buttonBorder: "1px solid rgba(255, 255, 255, 0.2)",
      panelBg: "rgba(255, 255, 255, 0.2)",
      panelBorder: "1px solid rgba(255, 255, 255, 0.3)",
      iconColor: "text-white/80",
      textColor: "text-white/90",
      inputBg: "bg-white/20",
      inputBorder: "border-white/30",
      inputText: "text-white",
      inputPlaceholder: "placeholder-white/50",
      buttonSubmitBg: "bg-white/30 hover:bg-white/40",
      dotColor: "bg-white/60",
    },
    white: {
      buttonBg: "rgba(255, 255, 255, 0.9)",
      buttonBorder: "1px solid rgba(255, 255, 255, 0.95)",
      panelBg: "rgba(255, 255, 255, 0.95)",
      panelBorder: "1px solid rgba(0, 0, 0, 0.1)",
      iconColor: "text-gray-700",
      textColor: "text-gray-900",
      inputBg: "bg-gray-100",
      inputBorder: "border-gray-200",
      inputText: "text-gray-900",
      inputPlaceholder: "placeholder-gray-400",
      buttonSubmitBg: "bg-gray-900 hover:bg-gray-800 text-white",
      dotColor: "bg-blue-500",
    },
    black: {
      buttonBg: "rgba(0, 0, 0, 0.75)",
      buttonBorder: "1px solid rgba(255, 255, 255, 0.1)",
      panelBg: "rgba(0, 0, 0, 0.85)",
      panelBorder: "1px solid rgba(255, 255, 255, 0.15)",
      iconColor: "text-white/90",
      textColor: "text-white/90",
      inputBg: "bg-white/10",
      inputBorder: "border-white/20",
      inputText: "text-white",
      inputPlaceholder: "placeholder-white/40",
      buttonSubmitBg: "bg-white/20 hover:bg-white/30",
      dotColor: "bg-white/70",
    },
  }

  const s = styles[style]

  // Keep visible when modal is open
  const shouldShow = isVisible || isOpen

  return (
    <div
      className="absolute top-6 right-3 z-30 transition-all duration-500 ease-out"
      style={{
        opacity: shouldShow ? 1 : 0,
        transform: shouldShow ? "translateY(0)" : "translateY(-10px)",
        pointerEvents: shouldShow ? "auto" : "none",
      }}
    >
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative flex items-center justify-center rounded-full transition-all duration-300 hover:scale-105",
          style === "glass" && "backdrop-blur-md",
        )}
        style={{
          width: size.bell,
          height: size.bell,
          background: s.buttonBg,
          border: s.buttonBorder,
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
        }}
      >
        <Bell
          size={size.icon}
          className={cn(s.iconColor, "animate-pulse")}
          style={{
            animationDuration: "3s",
            animationIterationCount: "infinite",
          }}
        />
        {/* Subtle glow dot */}
        <span
          className={cn("absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full", s.dotColor)}
          style={{ boxShadow: style === "glass" ? "0 0 6px rgba(255, 255, 255, 0.5)" : "0 0 6px rgba(0, 0, 0, 0.2)" }}
        />
      </button>

      {/* Subscribe Panel - Slides from bell */}
      <div
        className={cn(
          "absolute top-0 right-0 overflow-hidden transition-all duration-300 ease-out rounded-xl",
          style === "glass" && "backdrop-blur-lg",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        style={{
          width: isOpen ? size.panel : size.bell,
          background: s.panelBg,
          border: s.panelBorder,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.15)",
          transformOrigin: "top right",
          transform: isOpen ? "scale(1)" : "scale(0.5)",
        }}
      >
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className={cn("text-[10px] font-medium truncate pr-2", s.textColor)}>Subscribe to {sellerName}</span>
            <button
              onClick={() => setIsOpen(false)}
              className={cn(
                "p-0.5 rounded-full transition-colors",
                style === "white" ? "hover:bg-gray-100" : "hover:bg-white/20",
              )}
            >
              <X size={12} className={style === "white" ? "text-gray-500" : "text-white/70"} />
            </button>
          </div>

          {submitted ? (
            <div className="text-center py-2">
              <span className={cn("text-[10px]", s.textColor)}>✓ Subscribed!</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className={cn(
                  "w-full px-2 py-1.5 text-[10px] rounded-lg border focus:outline-none",
                  s.inputBg,
                  s.inputBorder,
                  s.inputText,
                  s.inputPlaceholder,
                )}
                required
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className={cn(
                  "w-full py-1.5 text-[10px] font-medium rounded-lg transition-colors disabled:opacity-50",
                  s.buttonSubmitBg,
                  style !== "white" && "text-white",
                )}
              >
                {isSubmitting ? "..." : "Submit"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// Share Button Component for Phone Preview
function ShareButtonPreview({
  sellerName,
  avatarUrl,
  pageUrl,
  scale = "small",
  style = "white",
  showSubscribe = true,
  accentColor,
  isVisible = true,
}: {
  sellerName: string
  avatarUrl?: string | null
  pageUrl: string
  scale?: "small" | "normal"
  style?: "glass" | "white" | "black"
  showSubscribe?: boolean
  accentColor?: string
  isVisible?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  // Keep visible when modal is open
  const shouldShow = isVisible || isOpen

  const size = scale === "small" ? { btn: 28, icon: 10, panel: 180 } : { btn: 36, icon: 14, panel: 220 }

  // Generate gradient colors based on accent color or use default
  const gradientColor = accentColor || "#8B5CF6"

  const styles = {
    glass: {
      buttonBg: "rgba(255, 255, 255, 0.15)",
      buttonBorder: "1px solid rgba(255, 255, 255, 0.2)",
      iconColor: "text-white/80",
    },
    white: {
      buttonBg: "rgba(255, 255, 255, 0.9)",
      buttonBorder: "1px solid rgba(255, 255, 255, 0.95)",
      iconColor: "text-gray-700",
    },
    black: {
      buttonBg: "rgba(0, 0, 0, 0.75)",
      buttonBorder: "1px solid rgba(255, 255, 255, 0.1)",
      iconColor: "text-white/90",
    },
  }

  const s = styles[style]

  const copyLink = () => {
    navigator.clipboard.writeText(pageUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // REMOVED: LinkedIn from share options - only 4 icons in a row
  const shareOptions = [
    { name: "Copy", icon: copied ? "✓" : "🔗", color: copied ? "#22c55e" : "#6b7280", action: copyLink },
    { name: "X", icon: "𝕏", color: "#000000", action: () => {} },
    { name: "Facebook", icon: "f", color: "#1877F2", action: () => {} },
    { name: "WhatsApp", icon: "💬", color: "#25D366", action: () => {} },
  ]

  return (
    <>
      {/* Share Button - positioned top left with scroll visibility */}
      <div
        className="absolute top-6 left-3 z-30 transition-all duration-500 ease-out"
        style={{
          opacity: shouldShow ? 1 : 0,
          transform: shouldShow ? "translateY(0)" : "translateY(-10px)",
          pointerEvents: shouldShow ? "auto" : "none",
        }}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex items-center justify-center rounded-full transition-all duration-300 hover:scale-105",
            style === "glass" && "backdrop-blur-md",
          )}
          style={{
            width: size.btn,
            height: size.btn,
            background: s.buttonBg,
            border: s.buttonBorder,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
          }}
        >
          <Send size={size.icon} className={s.iconColor} />
        </button>
      </div>

      {/* Share Modal - positioned within phone preview */}
      {isOpen && (
        <>
          {/* Backdrop - covers phone preview only */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm z-40 animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal - centered within phone preview */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 rounded-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-200"
            style={{
              width: scale === "small" ? 200 : 260,
              background: "#ffffff",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.2)",
            }}
          >
            {/* Profile preview card with gradient background based on OnePage accent color */}
            <div
              className="relative px-3 pt-4 pb-5"
              style={{
                background: `linear-gradient(135deg, ${gradientColor} 0%, ${gradientColor} 100%)`,
              }}
            >
              {/* Close button */}
              <button
                onClick={() => setIsOpen(false)}
                className="absolute top-2 right-2 p-1 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm transition-all"
              >
                <X size={scale === "small" ? 8 : 10} className="text-white" />
              </button>

              <div className="text-center">
                <div
                  className={cn(
                    "mx-auto mb-2 rounded-full overflow-hidden bg-white/20 flex items-center justify-center ring-2 ring-white/30 shadow-lg",
                    scale === "small" ? "w-10 h-10" : "w-12 h-12",
                  )}
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl || "/placeholder.svg"}
                      alt={sellerName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className={cn("font-bold text-white", scale === "small" ? "text-sm" : "text-base")}>
                      {sellerName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <h3 className={cn("font-bold text-white mb-0.5", scale === "small" ? "text-[10px]" : "text-xs")}>
                  {sellerName}
                </h3>
                <p
                  className={cn(
                    "text-white/80 truncate max-w-[140px] mx-auto",
                    scale === "small" ? "text-[7px]" : "text-[8px]",
                  )}
                >
                  {pageUrl.replace(/^https?:\/\//, "")}
                </p>
              </div>
            </div>

            {/* Share options - centered and aligned */}
            <div className="px-2 py-2">
              <div className="flex justify-center items-center gap-2 px-2">
                {shareOptions.map((option) => (
                  <button
                    key={option.name}
                    onClick={option.action}
                    className="flex flex-col items-center gap-1 p-1.5 rounded-lg opacity-90 hover:opacity-100 transition-opacity duration-200"
                  >
                    <div
                      className={cn(
                        "flex items-center justify-center",
                        scale === "small" ? "w-7 h-7" : "w-8 h-8",
                      )}
                    >
                      {option.icon === "✓" ? (
                        <Check size={scale === "small" ? 14 : 16} className="text-green-600" />
                      ) : option.icon === "🔗" ? (
                        <Link2 size={scale === "small" ? 14 : 16} className="text-gray-700" />
                      ) : option.name === "X" ? (
                        <svg
                          className={scale === "small" ? "w-3.5 h-3.5" : "w-4 h-4"}
                          viewBox="0 0 24 24"
                          fill="#000000"
                        >
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      ) : option.name === "Facebook" ? (
                        <svg
                          className={scale === "small" ? "w-3.5 h-3.5" : "w-4 h-4"}
                          viewBox="0 0 24 24"
                          fill="#1877F2"
                        >
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                      ) : option.name === "WhatsApp" ? (
                        <svg
                          className={scale === "small" ? "w-3.5 h-3.5" : "w-4 h-4"}
                          viewBox="0 0 24 24"
                          fill="#25D366"
                        >
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                        </svg>
                      ) : (
                        <ExternalLink size={scale === "small" ? 14 : 16} className="text-gray-600" />
                      )}
                    </div>
                    <span className={cn("font-medium text-gray-600", scale === "small" ? "text-[6px]" : "text-[7px]")}>
                      {option.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Storelib CTA Section */}
            <div className="px-2 pb-2">
              <div className="bg-gray-50 rounded-xl p-2 border border-gray-100">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0",
                      scale === "small" ? "w-6 h-6" : "w-7 h-7",
                    )}
                  >
                    <svg
                      className={scale === "small" ? "w-3 h-3" : "w-3.5 h-3.5"}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("font-semibold text-gray-900", scale === "small" ? "text-[7px]" : "text-[8px]")}>
                      Create your own page
                    </p>
                    <p className={cn("text-gray-500 truncate", scale === "small" ? "text-[6px]" : "text-[7px]")}>
                      Build with Storelib
                    </p>
                  </div>
                  <button
                    className={cn(
                      "bg-black text-white font-semibold rounded-lg hover:bg-gray-800 transition-all",
                      scale === "small" ? "px-2 py-1 text-[6px]" : "px-2.5 py-1.5 text-[7px]",
                    )}
                  >
                    Join
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

const SocialIconsSVG: Record<string, React.FC<{ size?: number; color?: string }>> = {
  instagram: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  ),
  tiktok: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  ),
  youtube: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  ),
  twitter: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  spotify: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  ),
  linkedin: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  ),
  facebook: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  ),
  github: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  ),
  twitch: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </svg>
  ),
  threads: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 192 192" fill={color}>
      <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 125.084 64.8569 132.827 72.0518 138.095C78.0037 142.425 85.7883 144.669 93.8627 144.267C104.67 143.762 113.294 139.372 119.426 131.257C123.968 125.209 126.839 117.661 128.011 108.524C134.151 112.138 138.711 116.852 140.818 122.579C144.283 131.969 144.493 147.389 132.112 159.684C121.329 170.391 108.196 175.168 90.4863 175.313C71.1024 175.146 56.413 169.087 46.743 157.33C37.7196 146.384 33.0206 130.727 32.8218 110.728L32.8218 81.2724C33.0206 61.2734 37.7196 45.6164 46.743 34.6699C56.413 22.9131 71.1024 16.8538 90.4863 16.687C109.996 16.8551 124.983 22.969 135.077 34.8069C139.98 40.5571 143.818 47.559 146.498 55.5601L163.044 50.2802C159.626 40.0171 154.589 31.1436 147.971 23.8628C134.709 9.04939 116.136 1.41406 90.5517 1.18164L90.4209 1.18111C64.9526 1.41299 46.6603 9.0918 33.6384 23.9936C22.3006 36.9827 16.2393 54.9747 16.0037 77.5368V77.5752L16 110.766L16.0037 114.463V114.501C16.2393 137.063 22.3006 155.055 33.6384 168.044C46.6603 182.946 64.9526 190.625 90.4209 190.857L90.5517 190.856C113.049 190.674 129.763 184.282 143.474 170.655C161.387 152.86 160.887 130.625 155.586 117.281C151.64 107.259 143.663 99.0028 132.122 93.3506C131.667 91.8653 131.16 90.3969 130.603 88.9554L141.537 88.9883ZM98.4405 127.461C88.1005 127.987 77.7615 123.461 77.2019 114.047C76.7685 106.846 81.9377 97.7908 99.0178 96.8022C101.279 96.6754 103.499 96.6135 105.678 96.6135C111.478 96.6135 116.931 97.1398 121.955 98.1592C120.066 117.743 109.748 126.885 98.4405 127.461Z" />
    </svg>
  ),
  linkedin: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  ),
  facebook: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  ),
  github: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  ),
  twitch: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </svg>
  ),
  threads: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 192 192" fill={color}>
      <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 125.084 64.8569 132.827 72.0518 138.095C78.0037 142.425 85.7883 144.669 93.8627 144.267C104.67 143.762 113.294 139.372 119.426 131.257C123.968 125.209 126.839 117.661 128.011 108.524C134.151 112.138 138.711 116.852 140.818 122.579C144.283 131.969 144.493 147.389 132.112 159.684C121.329 170.391 108.196 175.168 90.4863 175.313C71.1024 175.146 56.413 169.087 46.743 157.33C37.7196 146.384 33.0206 130.727 32.8218 110.728L32.8218 81.2724C33.0206 61.2734 37.7196 45.6164 46.743 34.6699C56.413 22.9131 71.1024 16.8538 90.4863 16.687C109.996 16.8551 124.983 22.969 135.077 34.8069C139.98 40.5571 143.818 47.559 146.498 55.5601L163.044 50.2802C159.626 40.0171 154.589 31.1436 147.971 23.8628C134.709 9.04939 116.136 1.41406 90.5517 1.18164L90.4209 1.18111C64.9526 1.41299 46.6603 9.0918 33.6384 23.9936C22.3006 36.9827 16.2393 54.9747 16.0037 77.5368V77.5752L16 110.766L16.0037 114.463V114.501C16.2393 137.063 22.3006 155.055 33.6384 168.044C46.6603 182.946 64.9526 190.625 90.4209 190.857L90.5517 190.856C113.049 190.674 129.763 184.282 143.474 170.655C161.387 152.86 160.887 130.625 155.586 117.281C151.64 107.259 143.663 99.0028 132.122 93.3506C131.667 91.8653 131.16 90.3969 130.603 88.9554L141.537 88.9883ZM98.4405 127.461C88.1005 127.987 77.7615 123.461 77.2019 114.047C76.7685 106.846 81.9377 97.7908 99.0178 96.8022C101.279 96.6754 103.499 96.6135 105.678 96.6135C111.478 96.6135 116.931 97.1398 121.955 98.1592C120.066 117.743 109.748 126.885 98.4405 127.461Z" />
    </svg>
  ),
}

// Background Pattern Component for rendering pattern overlays
function BackgroundPattern({
  pattern,
  color,
  opacity = "medium",
}: { pattern: string; color: string; opacity?: "low" | "medium" | "hard" | "very_hard" }) {
  const opacityValue = opacity === "low" ? 0.4 : opacity === "hard" ? 1 : opacity === "very_hard" ? 1.5 : 0.7
  const patternSVGs: Record<string, React.ReactNode> = {
    grid: (
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 1, opacity: opacityValue }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id={`bg-grid-${pattern}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke={color} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#bg-grid-${pattern})`} />
      </svg>
    ),
    dots: (
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 1, opacity: opacityValue }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id={`bg-dots-${pattern}`} width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="8" cy="8" r="2" fill={color} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#bg-dots-${pattern})`} />
      </svg>
    ),
    waves: (
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 1, opacity: opacityValue }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id={`bg-waves-${pattern}`} width="50" height="25" patternUnits="userSpaceOnUse">
            <path d="M0 12.5 Q12.5 0, 25 12.5 T50 12.5" fill="none" stroke={color} strokeWidth="2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#bg-waves-${pattern})`} />
      </svg>
    ),
    zigzag: (
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 1, opacity: opacityValue }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id={`bg-zigzag-${pattern}`} width="20" height="12" patternUnits="userSpaceOnUse">
            <path d="M0 6 L5 0 L10 6 L15 0 L20 6" fill="none" stroke={color} strokeWidth="1.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#bg-zigzag-${pattern})`} />
      </svg>
    ),
    cross: (
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 1, opacity: opacityValue }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id={`bg-cross-${pattern}`} width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M8 0 L8 16 M0 8 L16 8" fill="none" stroke={color} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#bg-cross-${pattern})`} />
      </svg>
    ),
    diagonal: (
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 1, opacity: opacityValue }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id={`bg-diagonal-${pattern}`} width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M0 10 L10 0" fill="none" stroke={color} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#bg-diagonal-${pattern})`} />
      </svg>
    ),
    morph: (
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 1, opacity: opacityValue }}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 200 200"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern id={`bg-morph-${pattern}`} width="200" height="200" patternUnits="userSpaceOnUse">
            <path
              d="M40 20 Q60 40, 40 60 Q20 80, 40 100 Q60 80, 80 100 Q100 120, 80 140 Q60 120, 40 140 Q20 160, 40 180"
              fill="none"
              stroke={color}
              strokeWidth="2"
              opacity="0.5"
            />
            <path
              d="M120 10 Q140 30, 160 20 Q180 40, 160 60 Q180 80, 160 100 Q140 80, 120 100 Q100 80, 120 60"
              fill="none"
              stroke={color}
              strokeWidth="2"
              opacity="0.4"
            />
            <path
              d="M100 140 Q120 160, 140 150 Q160 170, 140 190 Q120 170, 100 180"
              fill="none"
              stroke={color}
              strokeWidth="2"
              opacity="0.45"
            />
            <circle cx="50" cy="50" r="8" fill={color} opacity="0.3" />
            <circle cx="150" cy="70" r="6" fill={color} opacity="0.25" />
            <circle cx="100" cy="160" r="5" fill={color} opacity="0.3" />
            <rect x="170" y="150" width="20" height="2" fill={color} opacity="0.4" rx="1" />
            <rect x="10" y="100" width="15" height="2" fill={color} opacity="0.35" rx="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#bg-morph-${pattern})`} />
      </svg>
    ),
    organic: (
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 1, opacity: opacityValue }}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 200 200"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern id={`bg-organic-${pattern}`} width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M30 40 Q50 20, 70 40 Q90 60, 70 80 Q50 100, 30 80 Q10 60, 30 40" fill={color} opacity="0.35" />
            <path
              d="M120 30 Q150 25, 160 50 Q170 80, 140 90 Q110 95, 100 70 Q95 45, 120 30"
              fill={color}
              opacity="0.3"
            />
            <path
              d="M60 130 Q80 110, 110 125 Q130 140, 115 165 Q95 185, 65 170 Q45 155, 60 130"
              fill={color}
              opacity="0.32"
            />
            <path
              d="M160 140 Q180 145, 185 165 Q188 185, 170 190 Q150 188, 145 170 Q143 152, 160 140"
              fill={color}
              opacity="0.28"
            />
            <path
              d="M20 160 Q35 150, 45 165 Q50 180, 35 190 Q20 185, 15 175 Q12 165, 20 160"
              fill={color}
              opacity="0.25"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#bg-organic-${pattern})`} />
      </svg>
    ),
  }

  return patternSVGs[pattern] || null
}

interface PhonePreviewProps {
  className?: string
}

export function PhonePreview({ className }: PhonePreviewProps) {
  const { onepage } = useOnePage()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [buttonsVisible, setButtonsVisible] = useState(true)
  const lastScrollY = useRef(0)
  
  // Spotify modal state - lifted to root level to prevent clipping in groups
  const [spotifyModalOpen, setSpotifyModalOpen] = useState(false)
  const [spotifyModalData, setSpotifyModalData] = useState<{
    title: string
    embedUrl: string
    spotifyUrl: string
    streamingServices?: { platform: string; url: string | null; found: boolean }[]
    spotifyMode?: string
  } | null>(null)
  
  const openSpotifyModal = useCallback((data: {
    title: string
    embedUrl: string
    spotifyUrl: string
    streamingServices?: { platform: string; url: string | null; found: boolean }[]
    spotifyMode?: string
  }) => {
    setSpotifyModalData(data)
    setSpotifyModalOpen(true)
  }, [])
  
  const spotifyModalContextValue = { openSpotifyModal }

  // Handle scroll for button visibility
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const currentScrollY = container.scrollTop
    const nearTop = currentScrollY < 50
    const scrollingUp = currentScrollY < lastScrollY.current - 5

    setButtonsVisible(nearTop || scrollingUp)
    lastScrollY.current = currentScrollY
  }, [])

  if (!onepage) {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const { title, bio, avatar_url, theme, draft_blocks, social_links, settings: rawSettings } = onepage
  const avatar_video_url = (onepage as any).avatar_video_url
  // Merge settings with defaults to ensure all fields exist (including verified badge)
  const settings = {
    show_branding: true,
    analytics_enabled: true,
    subscribe_enabled: true,
    subscribe_style: "glass" as const,
    share_enabled: true,
    share_style: "white" as const,
    verified_badge_enabled: false,
    verified_badge_type: "verified_creator" as const,
    ...rawSettings,
  }
  const avatar_video_crop = (settings as any)?.avatar_video_crop || null
  const sellerName = title || "Creator"

  // Animated gradient - only when explicitly enabled
  const isAnimatedGradient = theme.background_type === "gradient" && theme.animated_gradient === true
  // Use animation toggle state in key to force re-render and restart animation
  const animationKey = `gradient-${String(theme.animated_gradient)}-${theme.background_gradient || "none"}`

  // Check if background is dark for footer link color
  const isDarkBackground = (() => {
    const color = theme.background_color || "#ffffff"
    const hex = color.replace("#", "")
    const r = Number.parseInt(hex.substring(0, 2), 16) || 255
    const g = Number.parseInt(hex.substring(2, 4), 16) || 255
    const b = Number.parseInt(hex.substring(4, 6), 16) || 255
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance < 0.5 || theme.background_type === "image" || theme.background_type === "video"
  })()

  return (
    <SpotifyModalContext.Provider value={spotifyModalContextValue}>
      <div
        className={cn("relative flex-shrink-0", className)}
        style={{
          width: "280px",
          minWidth: "280px",
          maxWidth: "280px",
          height: "580px",
          minHeight: "580px",
          maxHeight: "580px",
        }}
      >
        {/* Animation keyframes - subtle animation */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
        @keyframes gradientShiftPreview {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `,
          }}
        />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "280px",
          height: "580px",
          backgroundColor: "#1a1a1a",
          borderRadius: "44px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          padding: "10px",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "-2px",
            top: "85px",
            width: "3px",
            height: "28px",
            backgroundColor: "#1a1a1a",
            borderRadius: "2px 0 0 2px",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "-2px",
            top: "125px",
            width: "3px",
            height: "44px",
            backgroundColor: "#1a1a1a",
            borderRadius: "2px 0 0 2px",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "-2px",
            top: "180px",
            width: "3px",
            height: "44px",
            backgroundColor: "#1a1a1a",
            borderRadius: "2px 0 0 2px",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: "-2px",
            top: "145px",
            width: "3px",
            height: "55px",
            backgroundColor: "#1a1a1a",
            borderRadius: "0 2px 2px 0",
          }}
        />

        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "34px",
            overflow: "hidden",
            position: "relative",
            backgroundColor: "#000",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "10px",
              left: "50%",
              transform: "translateX(-50%)",
              width: "84px",
              height: "25px",
              backgroundColor: "#000",
              borderRadius: "9999px",
              zIndex: 20,
            }}
          />

          <div
            key={animationKey}
            className="phone-screen-scroll"
            style={{
              position: "absolute",
              top: "0",
              left: "0",
              right: "0",
              bottom: "0",
              overflowY: "auto",
              overflowX: "hidden",
              background:
                theme.background_type === "gradient" && theme.background_gradient
                  ? theme.background_gradient
                  : theme.background_color,
              fontFamily: theme.font_family || "Inter",
              scrollbarWidth: "thin",
              scrollbarColor: `${theme.text_color}30 transparent`,
              backgroundSize: isAnimatedGradient ? "200% 200%" : undefined,
              animation: isAnimatedGradient ? "gradientShiftPreview 10s ease-in-out infinite" : undefined,
            }}
          >
            <style>{`.phone-screen-scroll::-webkit-scrollbar { width: 3px; } .phone-screen-scroll::-webkit-scrollbar-track { background: transparent; margin: 10px 0; } .phone-screen-scroll::-webkit-scrollbar-thumb { background: ${theme.text_color}30; border-radius: 3px; } .phone-screen-scroll::-webkit-scrollbar-thumb:hover { background: ${theme.text_color}50; }`}</style>

            {theme.background_type === "image" && theme.background_image_url && (
              <div
                style={{
                  position: "absolute",
                  top: "-30px",
                  left: "-30px",
                  right: "-30px",
                  bottom: "-30px",
                  backgroundImage: `url(${theme.background_image_url})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  zIndex: 0,
                  filter: `brightness(${(theme as any).image_brightness || 100}%) blur(${(theme as any).image_blur || 0}px)`,
                }}
              />
            )}

            {/* Video background */}
            {theme.background_type === "video" && (theme as any).background_video_url && (
              <video
                src={(theme as any).background_video_url}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  minWidth: "100%",
                  minHeight: "100%",
                  width: "auto",
                  height: "auto",
                  objectFit: "cover",
                  zIndex: 0,
                  filter: `brightness(${(theme as any).video_brightness || 100}%)`,
                }}
                autoPlay
                loop
                muted
                playsInline
              />
            )}

            {/* Noise overlay for gradient backgrounds */}
            {theme.background_type === "gradient" && (theme as any).gradient_noise && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{
                  mixBlendMode: "overlay",
                  zIndex: 1,
                  opacity: (((theme as any).noise_strength || 15) / 100) * 2,
                }}
              >
                <filter id="phone-noise-gradient">
                  <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
                </filter>
                <rect width="100%" height="100%" filter="url(#phone-noise-gradient)" />
              </svg>
            )}

            {/* Noise overlay for image backgrounds */}
            {theme.background_type === "image" && (theme as any).image_noise && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{
                  mixBlendMode: "overlay",
                  zIndex: 1,
                  opacity: (((theme as any).noise_strength || 15) / 100) * 2,
                }}
              >
                <filter id="phone-noise-image">
                  <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
                </filter>
                <rect width="100%" height="100%" filter="url(#phone-noise-image)" />
              </svg>
            )}

            {/* Pattern overlay */}
            {(theme.background_type === "solid" || theme.background_type === "gradient") &&
              (theme as any).background_pattern &&
              (theme as any).background_pattern !== "none" && (
                <BackgroundPattern
                  pattern={(theme as any).background_pattern}
                  color={(theme as any).pattern_color || "#00000090"}
                  opacity={(theme as any).pattern_opacity || "medium"}
                />
              )}

            {/* Share Button - conditionally rendered based on share settings */}
            {settings?.share_enabled !== false && (
              <ShareButtonPreview
                sellerName={sellerName}
                avatarUrl={avatar_url}
                pageUrl={`https://storelib.co/l/${(onepage as any).slug || "preview"}`}
                scale="small"
                style={(settings as any)?.share_style || "white"}
                showSubscribe={settings?.subscribe_enabled !== false}
                accentColor={theme.button_color}
                isVisible={buttonsVisible}
              />
            )}

            {/* Notification Bell - conditionally rendered based on subscribe settings */}
            {settings?.subscribe_enabled !== false && (
              <NotificationBell
                sellerName={sellerName}
                scale="small"
                style={(settings as any)?.subscribe_style || "glass"}
                isVisible={buttonsVisible}
              />
            )}

            <div
              style={{
                position: "relative",
                zIndex: 1,
                paddingTop: "45px",
                paddingBottom: "12px",
                paddingLeft: "16px",
                paddingRight: "16px",
                minHeight: "100%",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                className={cn(
                  "flex flex-col items-center",
                  theme.spacing === "compact"
                    ? "gap-[10px]"
                    : theme.spacing === "comfortable"
                      ? "gap-[14px]"
                      : "gap-[12px]",
                )}
              >
                {draft_blocks
                  .filter((b) => b.enabled)
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((block) => (
                    <BlockRenderer
                      key={block.id}
                      block={block}
                      theme={theme}
                      profile={{ title, bio, avatar_url, avatar_video_url, avatar_video_crop, social_links }}
                      scale="small"
                      settings={settings}
                    />
                  ))}
              </div>
              {/* Footer - pushed to bottom */}
              <div style={{ marginTop: "auto", paddingTop: "20px" }}>
                {settings.show_branding && (
                  <div className="text-center mb-2">
                    <span className="inline-flex items-center justify-center px-3 py-1.5 rounded-full text-[9px] font-medium bg-white text-gray-900">
                      {sellerName} on Storelib
                    </span>
                  </div>
                )}
                {/* Footer Links */}
                <div className="flex items-center justify-center gap-2 text-[8px]">
                  <a
                    href="https://materiathemes.com/cookies"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                    style={{ color: isDarkBackground ? "#9ca3af" : "#1f2937" }}
                  >
                    Cookies
                  </a>
                  <a
                    href="https://materiathemes.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                    style={{ color: isDarkBackground ? "#9ca3af" : "#1f2937" }}
                  >
                    Privacy
                  </a>
                  <a
                    href="https://materiathemes.com/report"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                    style={{ color: isDarkBackground ? "#9ca3af" : "#1f2937" }}
                  >
                    Report
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Spotify Modal - Popup style inside phone preview */}
      {spotifyModalOpen && spotifyModalData && (
        <div
          className="absolute inset-0 z-[50] flex items-center justify-center p-2 bg-black/60 backdrop-blur-sm rounded-[32px]"
          onClick={() => setSpotifyModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-[240px] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-2 py-1.5 border-b">
              <div className="flex items-center gap-1">
                <svg className="w-3 h-3 text-[#1DB954]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
                <span className="text-[9px] font-medium text-gray-600 truncate max-w-[140px]">
                  {spotifyModalData.title}
                </span>
              </div>
              <button
                onClick={() => setSpotifyModalOpen(false)}
                className="p-0.5 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-3 h-3 text-gray-500" />
              </button>
            </div>

            {/* Spotify Embed - compact */}
            <div className="p-1.5">
              <iframe
                src={spotifyModalData.embedUrl}
                width="100%"
                height="80"
                frameBorder="0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                className="rounded-md"
              />
            </div>

            {/* Streaming Services - if show_streaming mode */}
            {spotifyModalData.spotifyMode === 'show_streaming' && spotifyModalData.streamingServices && spotifyModalData.streamingServices.filter(s => s.found && s.url).length > 0 && (
              <div className="px-1.5 pb-1.5">
                <p className="text-[8px] font-medium text-gray-700 mb-1">Listen on</p>
                <div className="space-y-0.5">
                  {spotifyModalData.streamingServices.filter(s => s.found && s.url).slice(0, 3).map((service) => {
                    const names: Record<string, string> = {
                      apple_music: 'Apple Music',
                      spotify: 'Spotify',
                      youtube_music: 'YouTube Music',
                      youtube: 'YouTube',
                      itunes: 'iTunes',
                      soundcloud: 'SoundCloud',
                      tidal: 'TIDAL',
                      deezer: 'Deezer',
                      amazon_music: 'Amazon Music'
                    }
                    return (
                      <a
                        key={service.platform}
                        href={service.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between py-1 px-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-[9px] font-medium text-gray-900">{names[service.platform] || service.platform}</span>
                        <ExternalLink className="w-2.5 h-2.5 text-gray-400" />
                      </a>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Footer - Open in Spotify button */}
            <div className="px-1.5 pb-1.5 pt-0">
              <a
                href={spotifyModalData.spotifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 w-full py-1.5 rounded-full bg-black text-white text-[9px] font-medium hover:bg-gray-800 transition-colors"
              >
                Open in Spotify
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
    </SpotifyModalContext.Provider>
  )
}

export function MobilePreviewContent() {
  const { onepage } = useOnePage()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [buttonsVisible, setButtonsVisible] = useState(true)
  const lastScrollY = useRef(0)
  
  // Spotify modal state - lifted to root level to prevent clipping in groups
  const [spotifyModalOpen, setSpotifyModalOpen] = useState(false)
  const [spotifyModalData, setSpotifyModalData] = useState<{
    title: string
    embedUrl: string
    spotifyUrl: string
    streamingServices?: { platform: string; url: string | null; found: boolean }[]
    spotifyMode?: string
  } | null>(null)
  
  const openSpotifyModal = useCallback((data: {
    title: string
    embedUrl: string
    spotifyUrl: string
    streamingServices?: { platform: string; url: string | null; found: boolean }[]
    spotifyMode?: string
  }) => {
    setSpotifyModalData(data)
    setSpotifyModalOpen(true)
  }, [])
  
  const spotifyModalContextValue = { openSpotifyModal }

  // Handle scroll for button visibility
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const currentScrollY = container.scrollTop
    const nearTop = currentScrollY < 50
    const scrollingUp = currentScrollY < lastScrollY.current - 5

    setButtonsVisible(nearTop || scrollingUp)
    lastScrollY.current = currentScrollY
  }, [])

  if (!onepage) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const { title, bio, avatar_url, theme, draft_blocks, social_links, settings: rawSettings } = onepage
  const avatar_video_url = (onepage as any).avatar_video_url
  // Merge settings with defaults to ensure all fields exist (including verified badge)
  const settings = {
    show_branding: true,
    analytics_enabled: true,
    subscribe_enabled: true,
    subscribe_style: "glass" as const,
    share_enabled: true,
    share_style: "white" as const,
    verified_badge_enabled: false,
    verified_badge_type: "verified_creator" as const,
    ...rawSettings,
  }
  const avatar_video_crop = (settings as any)?.avatar_video_crop || null
  const sellerName = title || "Creator"

  // Animated gradient - only when explicitly enabled
  const isAnimatedGradient = theme.background_type === "gradient" && theme.animated_gradient === true
  // Use animation toggle state in key to force re-render and restart animation
  const animationKey = `gradient-${String(theme.animated_gradient)}-${theme.background_gradient || "none"}`

  // Check if background is dark for footer link color
  const isDarkBackground = (() => {
    const color = theme.background_color || "#ffffff"
    const hex = color.replace("#", "")
    const r = Number.parseInt(hex.substring(0, 2), 16) || 255
    const g = Number.parseInt(hex.substring(2, 4), 16) || 255
    const b = Number.parseInt(hex.substring(4, 6), 16) || 255
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance < 0.5 || theme.background_type === "image" || theme.background_type === "video"
  })()

  return (
    <SpotifyModalContext.Provider value={spotifyModalContextValue}>
      {/* Animation keyframes */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes gradientShiftFrame {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `,
        }}
      />
      <div
        key={animationKey}
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden relative"
        style={{
          background:
            theme.background_type === "gradient" && theme.background_gradient
              ? theme.background_gradient
              : theme.background_color,
          fontFamily: theme.font_family || "Inter",
          backgroundSize: isAnimatedGradient ? "200% 200%" : undefined,
          animation: isAnimatedGradient ? "gradientShiftFrame 10s ease-in-out infinite" : undefined,
        }}
      >
        {theme.background_type === "image" && theme.background_image_url && (
          <div
            style={{
              position: "fixed",
              top: "-50px",
              left: "-50px",
              right: "-50px",
              bottom: "-50px",
              backgroundImage: `url(${theme.background_image_url})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              zIndex: 0,
              pointerEvents: "none",
              filter: `brightness(${(theme as any).image_brightness || 100}%) blur(${(theme as any).image_blur || 0}px)`,
            }}
          />
        )}

        {/* Video background */}
        {theme.background_type === "video" && (theme as any).background_video_url && (
          <video
            src={(theme as any).background_video_url}
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              minWidth: "100%",
              minHeight: "100%",
              width: "auto",
              height: "auto",
              objectFit: "cover",
              zIndex: 0,
              pointerEvents: "none",
              filter: `brightness(${(theme as any).video_brightness || 100}%)`,
            }}
            autoPlay
            loop
            muted
            playsInline
          />
        )}

        {/* Noise overlay for gradient backgrounds */}
        {theme.background_type === "gradient" && (theme as any).gradient_noise && (
          <svg
            className="fixed inset-0 w-full h-full pointer-events-none"
            style={{ mixBlendMode: "overlay", zIndex: 1, opacity: (((theme as any).noise_strength || 15) / 100) * 2 }}
          >
            <filter id="mobile-noise-gradient">
              <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
            </filter>
            <rect width="100%" height="100%" filter="url(#mobile-noise-gradient)" />
          </svg>
        )}

        {/* Noise overlay for image backgrounds */}
        {theme.background_type === "image" && (theme as any).image_noise && (
          <svg
            className="fixed inset-0 w-full h-full pointer-events-none"
            style={{ mixBlendMode: "overlay", zIndex: 1, opacity: (((theme as any).noise_strength || 15) / 100) * 2 }}
          >
            <filter id="mobile-noise-image">
              <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
            </filter>
            <rect width="100%" height="100%" filter="url(#mobile-noise-image)" />
          </svg>
        )}

        {/* Pattern overlay for mobile */}
        {(theme.background_type === "solid" || theme.background_type === "gradient") &&
          (theme as any).background_pattern &&
          (theme as any).background_pattern !== "none" && (
            <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }}>
              <BackgroundPattern
                pattern={(theme as any).background_pattern}
                color={(theme as any).pattern_color || "#00000090"}
                opacity={(theme as any).pattern_opacity || "medium"}
              />
            </div>
          )}

        <div
          className="relative z-10 w-full max-w-md mx-auto px-5 py-8 pb-5 flex flex-col"
          style={{ minHeight: "100vh" }}
        >
          <div
            className={cn(
              "flex flex-col items-center",
              theme.spacing === "compact" ? "gap-3" : theme.spacing === "comfortable" ? "gap-5" : "gap-4",
            )}
          >
            {draft_blocks
              .filter((b) => b.enabled)
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((block) => (
                <BlockRenderer
                  key={block.id}
                  block={block}
                  theme={theme}
                  profile={{ title, bio, avatar_url, avatar_video_url, avatar_video_crop, social_links }}
                  scale="normal"
                  settings={settings}
                />
              ))}
          </div>
          {/* Footer - pushed to bottom */}
          <div className="mt-auto pt-8">
            {settings.show_branding && (
              <div className="text-center mb-4">
                <span className="inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-medium bg-white text-gray-900">
                  {sellerName} on Storelib
                </span>
              </div>
            )}
            {/* Footer Links */}
            <div className="flex items-center justify-center gap-4 text-xs">
              <a
                href="https://materiathemes.com/cookies"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ color: isDarkBackground ? "#9ca3af" : "#1f2937" }}
              >
                Cookies
              </a>
              <a
                href="https://materiathemes.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ color: isDarkBackground ? "#9ca3af" : "#1f2937" }}
              >
                Privacy
              </a>
              <a
                href="https://materiathemes.com/report"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ color: isDarkBackground ? "#9ca3af" : "#1f2937" }}
              >
                Report
              </a>
            </div>
          </div>
        </div>
      </div>
      
      {/* Spotify Modal - Popup style inside phone preview */}
      {spotifyModalOpen && spotifyModalData && (
        <div
          className="absolute inset-0 z-[50] flex items-center justify-center p-2 bg-black/60 backdrop-blur-sm rounded-[32px]"
          onClick={() => setSpotifyModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-[240px] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-2 py-1.5 border-b">
              <div className="flex items-center gap-1">
                <svg className="w-3 h-3 text-[#1DB954]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
                <span className="text-[9px] font-medium text-gray-600 truncate max-w-[140px]">
                  {spotifyModalData.title}
                </span>
              </div>
              <button
                onClick={() => setSpotifyModalOpen(false)}
                className="p-0.5 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-3 h-3 text-gray-500" />
              </button>
            </div>

            {/* Spotify Embed - compact */}
            <div className="p-1.5">
              <iframe
                src={spotifyModalData.embedUrl}
                width="100%"
                height="80"
                frameBorder="0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                className="rounded-md"
              />
            </div>

            {/* Streaming Services - if show_streaming mode */}
            {spotifyModalData.spotifyMode === 'show_streaming' && spotifyModalData.streamingServices && spotifyModalData.streamingServices.filter(s => s.found && s.url).length > 0 && (
              <div className="px-1.5 pb-1.5">
                <p className="text-[8px] font-medium text-gray-700 mb-1">Listen on</p>
                <div className="space-y-0.5">
                  {spotifyModalData.streamingServices.filter(s => s.found && s.url).slice(0, 3).map((service) => {
                    const names: Record<string, string> = {
                      apple_music: 'Apple Music',
                      spotify: 'Spotify',
                      youtube_music: 'YouTube Music',
                      youtube: 'YouTube',
                      itunes: 'iTunes',
                      soundcloud: 'SoundCloud',
                      tidal: 'TIDAL',
                      deezer: 'Deezer',
                      amazon_music: 'Amazon Music'
                    }
                    return (
                      <a key={service.platform} href={service.url || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between py-1 px-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors">
                        <span className="text-[9px] font-medium text-gray-900">{names[service.platform] || service.platform}</span>
                        <ExternalLink className="w-2.5 h-2.5 text-gray-400" />
                      </a>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Footer - Open in Spotify button */}
            <div className="px-1.5 pb-1.5 pt-0">
              <a href={spotifyModalData.spotifyUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1 w-full py-1.5 rounded-full bg-black text-white text-[9px] font-medium hover:bg-gray-800 transition-colors">
                Open in Spotify
              </a>
            </div>
          </div>
        </div>
      )}
    </SpotifyModalContext.Provider>
  )
}

interface BlockRendererProps {
  block: OnePageBlock
  theme: OnePageTheme
  profile: {
    title: string
    bio: string
    avatar_url: string | null | undefined
    avatar_video_url?: string | null
    avatar_video_crop?: { x: number; y: number; width: number; height: number } | null
    social_links: any
  }
  scale?: "small" | "normal"
  settings?: any
  isInsideCarousel?: boolean
}

// Verified Badge Component with tooltip
function VerifiedBadge({
  scale = "small",
  badgeType,
  textColor,
}: { scale?: "small" | "normal"; badgeType?: string; textColor?: string }) {
  // 10% bigger: small 14 -> 15, normal 18 -> 20
  const size = scale === "small" ? 15 : 20
  const badgeLabels: Record<string, string> = {
    verified_creator: "Verified Creator",
    verified_brand: "Verified Brand",
    verified_business: "Verified Business",
    official_page: "Official Page",
    verified_artist: "Verified Artist",
  }
  const label = badgeLabels[badgeType || "verified_creator"] || "Verified"

  return (
    <span className="group relative inline-flex items-center ml-1">
      <svg viewBox="0 0 22 22" width={size} height={size}>
        {/* Blue badge background */}
        <path
          fill="#3b82f6"
          d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.68.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816z"
        />
        {/* White checkmark */}
        <path
          fill="#ffffff"
          d="M9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"
        />
      </svg>
      <span
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50"
        style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
      >
        {label}
      </span>
    </span>
  )
}

// Group Block Preview Component with scroll-tracking dots
function GroupBlockPreview({
  data,
  theme,
  profile,
  scale,
  settings,
  BlockRenderer,
}: {
  data: GroupBlockData
  theme: OnePageTheme
  profile: BlockRendererProps['profile']
  scale: BlockRendererProps['scale']
  settings?: { filled_icons?: boolean }
  BlockRenderer: React.ComponentType<BlockRendererProps>
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollStart, setScrollStart] = useState(0)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const enabledChildren = data.children.filter(c => c.enabled)
  const gap = 8 // gap-2 = 8px

  // Calculate carousel item width based on view setting
  const getCarouselItemWidth = () => {
    const view = data.carousel_view || "1"
    switch (view) {
      case "1.5": return 67
      case "1.2": return 85
      case "1":
      default: return 100
    }
  }

  const itemWidthPercent = getCarouselItemWidth()

  // Handle scroll to update current index with requestAnimationFrame for smoothness
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return
    requestAnimationFrame(() => {
      if (!scrollContainerRef.current) return
      const container = scrollContainerRef.current
      const scrollPosition = container.scrollLeft
      const containerWidth = container.clientWidth
      const itemWidth = (containerWidth * itemWidthPercent) / 100
      const newIndex = Math.round(scrollPosition / (itemWidth + gap))
      setCurrentIndex(Math.min(Math.max(0, newIndex), enabledChildren.length - 1))
    })
  }, [itemWidthPercent, enabledChildren.length])

  // Scroll to specific index
  const scrollToIndex = (index: number) => {
    if (!scrollContainerRef.current) return
    const container = scrollContainerRef.current
    const containerWidth = container.clientWidth
    const itemWidth = (containerWidth * itemWidthPercent) / 100
    const targetScroll = index * (itemWidth + gap)
    container.scrollTo({ left: targetScroll, behavior: 'smooth' })
  }

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!scrollContainerRef.current) return
    setStartX(e.touches[0].pageX)
    setScrollStart(scrollContainerRef.current.scrollLeft)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!scrollContainerRef.current) return
    const diff = e.touches[0].pageX - startX
    scrollContainerRef.current.scrollLeft = scrollStart - diff
  }

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return
    setIsDragging(true)
    setStartX(e.pageX)
    setScrollStart(scrollContainerRef.current.scrollLeft)
    scrollContainerRef.current.style.scrollBehavior = 'auto'
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return
    e.preventDefault()
    const diff = e.pageX - startX
    scrollContainerRef.current.scrollLeft = scrollStart - diff
  }

  const handleMouseUp = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.scrollBehavior = 'smooth'
    }
    setIsDragging(false)
  }

  // Render carousel layout
  const renderCarousel = () => {
    const itemStyle = {
      width: `calc(${itemWidthPercent}% - ${gap}px)`,
      minWidth: `calc(${itemWidthPercent}% - ${gap}px)`,
    }

    return (
      <div className="w-full relative" style={{ overflow: 'visible' }}>
        {/* Fade on left edge */}
        {data.carousel_fade_edges && (
          <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-black/20 to-transparent z-10 pointer-events-none" />
        )}

        {/* Scrollable Container */}
        <div
          ref={scrollContainerRef}
          className={cn(
            "w-full scrollbar-hide snap-x snap-mandatory touch-pan-x",
            isDragging ? "cursor-grabbing select-none" : "cursor-grab"
          )}
          style={{ 
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            overflowX: 'auto',
            overflowY: 'visible',
          }}
          onScroll={handleScroll}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            className="flex"
            style={{
              gap: `${gap}px`,
              padding: '4px 10px 12px 10px',
            }}
          >
            {enabledChildren.map((child) => (
              <div
                key={child.id}
                className="shrink-0 snap-start"
                style={itemStyle}
              >
                <div className="w-full">
                  <BlockRenderer block={child} theme={theme} profile={profile} scale={scale} settings={settings} isInsideCarousel={true} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Fade on right edge */}
        {data.carousel_fade_edges && (
          <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-black/20 to-transparent z-10 pointer-events-none" />
        )}

        {/* Dots navigation - updates based on scroll position */}
        {enabledChildren.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-1 pt-1">
            {enabledChildren.map((_, index) => (
              <button
                key={index}
                onClick={() => scrollToIndex(index)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  index === currentIndex ? "w-3" : "w-1.5"
                )}
                style={{
                  backgroundColor: index === currentIndex ? theme.text_color : `${theme.text_color}40`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Render stack layout
  const renderStack = () => (
    <div className="w-full flex flex-col gap-2 px-1">
      {enabledChildren.map((child) => (
        <div key={child.id} className="w-full py-0.5">
          <BlockRenderer block={child} theme={theme} profile={profile} scale={scale} settings={settings} />
        </div>
      ))}
    </div>
  )

  return (
    <div className="w-full flex flex-col gap-2">
      {data.title && (
        <h3 
          className="text-xs font-medium text-center opacity-70 px-2" 
          style={{ 
            color: theme.text_color,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {data.title}
        </h3>
      )}
      {data.layout === "carousel" ? renderCarousel() : renderStack()}
    </div>
  )
}

function BlockRenderer({ block, theme, profile, scale = "small", settings, isInsideCarousel = false }: BlockRendererProps) {
  const [emailSubmitted, setEmailSubmitted] = useState(false)

  // Use context for Spotify modal - renders at root level to prevent clipping
  const spotifyModalContext = useContext(SpotifyModalContext)

  // Button hover animation - based on theme setting, disabled inside carousel
  const buttonHoverAnimation = (theme as any).button_hover_animation || "default"
  const getHoverEffect = () => {
    if (isInsideCarousel) return ""
    switch (buttonHoverAnimation) {
      case "fade":
        return "hover:opacity-80 transition-opacity duration-200"
      case "zoom":
        return "hover:scale-[1.03] transition-transform duration-200"
      case "default":
      default:
        return "hover:scale-[1.01] hover:opacity-95 transition-all duration-200"
    }
  }
  const hoverEffect = getHoverEffect()

  // Spotify URL helper
  const isSpotifyUrl = (url: string): boolean => {
    if (!url) return false
    return url.includes('spotify.com') || url.includes('open.spotify.com')
  }

  // Extract Spotify ID and type from URL
  const getSpotifyInfo = (url: string): { type: string; id: string; embedUrl: string } | null => {
    try {
      const patterns = [
        /spotify\.com\/(track|album|artist|playlist)\/([a-zA-Z0-9]+)/,
        /open\.spotify\.com\/(track|album|artist|playlist)\/([a-zA-Z0-9]+)/
      ]
      for (const pattern of patterns) {
        const match = url.match(pattern)
        if (match) {
          const type = match[1]
          const id = match[2]
          return {
            type,
            id,
            embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`
          }
        }
      }
    } catch {
      return null
    }
    return null
  }

  const s =
    scale === "small"
      ? {
          avatar: "h-[56px] w-[56px]",
          avatarFallback: "text-[16px]",
          title: "text-[16px]",
          bio: "text-[11px] max-w-[180px]",
          button: "py-[10px] px-[12px] text-[13px]",
          buttonThumb: "w-[26px] h-[26px]",
          text: "text-[11px]",
          input: "px-[10px] py-[8px] text-[11px]",
          inputBtn: "px-[12px] py-[8px] text-[11px]",
          headline: "text-[13px]",
          description: "text-[10px]",
          social: "w-[38px] h-[38px]",
          socialIcon: 16,
          socialGap: "gap-[10px]",
          socialMarginBottom: "mb-[8px]",
        }
      : {
          avatar: "h-20 w-20",
          avatarFallback: "text-2xl",
          title: "text-xl",
          bio: "text-sm max-w-xs",
          button: "py-3 px-4 text-base",
          buttonThumb: "w-[34px] h-[34px]",
          text: "text-sm",
          input: "px-4 py-3 text-base",
          inputBtn: "px-5 py-3 text-base",
          headline: "text-lg",
          description: "text-sm",
          social: "w-[42px] h-[42px]",
          socialIcon: 20,
          socialGap: "gap-3.5",
          socialMarginBottom: "mb-4",
        }

  const buttonShadow = (theme as any).button_shadow || "none"
  const shadowColor = (theme as any).button_shadow_color || "#000000"
  // Convert hex to rgba for shadow
  const hexToRgba = (hex: string, alpha: number) => {
    const r = Number.parseInt(hex.slice(1, 3), 16) || 0
    const g = Number.parseInt(hex.slice(3, 5), 16) || 0
    const b = Number.parseInt(hex.slice(5, 7), 16) || 0
    return `rgba(${r},${g},${b},${alpha})`
  }
  const shadowStyles: Record<string, string> = {
    none: "none",
    subtle: `0 2px 4px ${hexToRgba(shadowColor, 0.15)}`,
    strong: `0 4px 12px ${hexToRgba(shadowColor, 0.3)}`,
    hard: `4px 4px 0px ${hexToRgba(shadowColor, 0.9)}`,
  }

  const buttonStyles = {
    backgroundColor:
      theme.button_style === "outline"
        ? "transparent"
        : theme.button_style === "glass"
          ? "rgba(255, 255, 255, 0.15)"
          : theme.button_color,
    color: theme.button_style === "outline" ? theme.text_color : theme.button_text_color,
    borderRadius: `${theme.button_border_radius}px`,
    borderWidth: `${theme.button_style === "outline" ? Math.max(1, theme.button_border_width) : theme.button_border_width}px`,
    borderStyle: "solid" as const,
    borderColor: theme.button_style === "outline" ? theme.text_color : theme.button_border_color,
    backdropFilter: theme.button_style === "glass" ? "blur(10px)" : undefined,
    boxShadow: shadowStyles[buttonShadow] || "none",
  }

  const socialStyle = (theme as any).social_icon_style || "filled"
  const socialColor = (theme as any).social_icon_color || theme.text_color

  switch (block.type) {
    case "header": {
      const data = block.data as HeaderBlockData
      const headerLayout = (theme as any).header_layout || "classic"
      const hasVideo = !!profile.avatar_video_url

      // Helper to get gradient bottom color
      const getGradientBottomColor = () => {
        if (theme.background_type === "gradient" && theme.background_gradient) {
          const colorMatches = theme.background_gradient.match(
            /#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3}|rgb$$[^)]+$$|rgba$$[^)]+$$/g,
          )
          if (colorMatches && colorMatches.length > 0) {
            return colorMatches[colorMatches.length - 1]
          }
        }
        return theme.background_color
      }

      // Hero layout with SMOOTH fade using mask
      if (headerLayout === "hero" && (profile.avatar_url || hasVideo)) {
        const isGradientBg = theme.background_type === "gradient"
        const fadeColor = getGradientBottomColor()

        const heroMargin = scale === "small" ? "-mx-4 -mt-[45px]" : "-mx-5 -mt-8"
        const heroWidth = scale === "small" ? "w-[calc(100%+32px)]" : "w-[calc(100%+40px)]"
        // 10% taller on desktop editor preview (small scale = desktop preview)
        const heroAspect = scale === "small" ? "11/10" : "4/3"

        return (
          <div className={cn(heroWidth, "relative mb-2", heroMargin)}>
            <div className="relative w-full" style={{ aspectRatio: heroAspect }}>
              {hasVideo ? (
                <video
                  src={profile.avatar_video_url!}
                  className="w-full h-full object-cover"
                  style={{ objectPosition: `50% ${(theme as any).hero_position_y ?? 50}%` }}
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={profile.avatar_url! || "/placeholder.svg"}
                  alt=""
                  className="w-full h-full object-cover"
                  style={{ imageRendering: "auto", objectPosition: `50% ${(theme as any).hero_position_y ?? 50}%` }}
                />
              )}
              {/* Smooth gradient fade overlay using CSS mask for gradient backgrounds */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: isGradientBg ? theme.background_gradient : fadeColor,
                  maskImage: "linear-gradient(to bottom, transparent 0%, transparent 40%, black 100%)",
                  WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, transparent 40%, black 100%)",
                }}
              />
              {/* Additional soft fade for non-gradient backgrounds */}
              {!isGradientBg && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `linear-gradient(to bottom, 
                      transparent 0%, 
                      transparent 50%,
                      ${fadeColor}33 60%,
                      ${fadeColor}66 70%,
                      ${fadeColor}99 80%,
                      ${fadeColor}cc 90%,
                      ${fadeColor} 100%
                    )`,
                  }}
                />
              )}
            </div>
            <div className="absolute bottom-3 left-0 right-0 text-center px-4">
              {data.show_name &&
                ((theme as any).title_style === "logo" && (theme as any).title_logo_url ? (
                  <img
                    src={(theme as any).title_logo_url || "/placeholder.svg"}
                    alt={profile.title || "Logo"}
                    className="mx-auto w-auto"
                    style={{
                      maxHeight:
                        (theme as any).title_size === "large"
                          ? scale === "small"
                            ? "54px"
                            : "62px"
                          : scale === "small"
                            ? "46px"
                            : "54px",
                      maxWidth:
                        (theme as any).title_size === "large"
                          ? scale === "small"
                            ? "180px"
                            : "220px"
                          : scale === "small"
                            ? "160px"
                            : "200px",
                      objectFit: "contain",
                      filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.3))",
                      marginTop: (theme as any).logo_position === "more_up" ? "-10px" : undefined,
                    }}
                  />
                ) : (
                  profile.title && (
                    <h1
                      className={cn(
                        s.title,
                        "font-bold inline-flex items-center justify-center",
                        (theme as any).title_size === "large" && (scale === "small" ? "text-[19px]" : "text-2xl"),
                      )}
                      style={{
                        color: (theme as any).title_color || theme.text_color,
                        fontFamily: (theme as any).title_font || theme.font_family,
                        textShadow: "0 1px 4px rgba(0,0,0,0.3)",
                      }}
                    >
                      {profile.title}
                      {settings?.verified_badge_enabled && (
                        <VerifiedBadge scale={scale} badgeType={settings?.verified_badge_type} />
                      )}
                    </h1>
                  )
                ))}
              {data.show_bio && profile.bio && (
                <p
                  className={cn(s.bio, "text-center mt-1 mx-auto")}
                  style={{
                    color: theme.secondary_text_color || theme.text_color,
                    textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                  }}
                >
                  {profile.bio}
                </p>
              )}
            </div>
          </div>
        )
      }

      // Classic layout
      // Laser glow settings - glow travels along the avatar border
      const laserGlowEnabled = (theme as any).laser_glow_enabled
      const laserGlowColor = (theme as any).laser_glow_color || "#3b82f6"
      const laserGlowIntensity = (theme as any).laser_glow_intensity || "medium"
      // Glow intensity settings - reduced spread by 40%
      const glowSpread = laserGlowIntensity === "low" ? 4 : laserGlowIntensity === "hard" ? 8 : 6
      const glowOpacity = laserGlowIntensity === "low" ? 0.7 : laserGlowIntensity === "hard" ? 1 : 0.85
      // Avatar size increased by 3px
      const avatarSize = scale === "small" ? 75 : 91

      return (
        <div className="flex flex-col items-center gap-2 w-full text-center">
          {data.show_avatar && (
            <div className="relative" style={{ width: avatarSize, height: avatarSize, marginTop: 6 }}>
              {/* Laser Glow Effect - rotating gradient on border with trail */}
              {laserGlowEnabled && (
                <>
                  {/* Trail layer 3 - farthest behind */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      inset: 0,
                      background: `conic-gradient(from 0deg, transparent 0deg, transparent 200deg, ${laserGlowColor}22 260deg, ${laserGlowColor}44 300deg, ${laserGlowColor}66 340deg, ${laserGlowColor} 360deg)`,
                      animation: "laserGlowRotate 3.25s linear infinite",
                      filter: `blur(${glowSpread + 4}px)`,
                      opacity: glowOpacity * 0.4,
                    }}
                  />
                  {/* Trail layer 2 */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      inset: 0,
                      background: `conic-gradient(from 0deg, transparent 0deg, transparent 260deg, ${laserGlowColor}44 300deg, ${laserGlowColor}88 340deg, ${laserGlowColor} 360deg)`,
                      animation: "laserGlowRotate 3.25s linear infinite",
                      filter: `blur(${glowSpread + 2}px)`,
                      opacity: glowOpacity * 0.6,
                    }}
                  />
                  {/* Main glow layer - brightest point */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      inset: 0,
                      background: `conic-gradient(from 0deg, transparent 0deg, transparent 320deg, ${laserGlowColor}88 345deg, ${laserGlowColor} 360deg)`,
                      animation: "laserGlowRotate 3.25s linear infinite",
                      filter: `blur(${glowSpread}px)`,
                      opacity: glowOpacity,
                      boxShadow: `0 0 ${glowSpread * 2}px ${laserGlowColor}`,
                    }}
                  />
                </>
              )}
              {/* Avatar container */}
              <div className="absolute inset-0">
                {hasVideo ? (
                  <div
                    className={cn(s.avatar, "rounded-full overflow-hidden border-2 shadow-lg w-full h-full")}
                    style={{
                      borderColor: `${theme.text_color}20`,
                      transform: `scale(${((theme as any).avatar_scale || 100) / 100})`,
                    }}
                  >
                    <video
                      src={profile.avatar_video_url!}
                      className="object-cover"
                      style={
                        profile.avatar_video_crop
                          ? {
                              width: `${100 / (profile.avatar_video_crop.width / 100)}%`,
                              height: `${100 / (profile.avatar_video_crop.height / 100)}%`,
                              marginLeft: `-${profile.avatar_video_crop.x / (profile.avatar_video_crop.width / 100)}%`,
                              marginTop: `-${profile.avatar_video_crop.y / (profile.avatar_video_crop.height / 100)}%`,
                              transform: `translateY(${(theme as any).avatar_offset_y || 0}px)`,
                            }
                          : {
                              width: "100%",
                              height: "100%",
                              transform: `translateY(${(theme as any).avatar_offset_y || 0}px)`,
                            }
                      }
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                  </div>
                ) : (
                  <Avatar
                    className={cn(s.avatar, "border-2 shadow-lg w-full h-full")}
                    style={{
                      borderColor: `${theme.text_color}20`,
                      transform: `scale(${((theme as any).avatar_scale || 100) / 100})`,
                    }}
                  >
                    <AvatarImage
                      src={profile.avatar_url || undefined}
                      className="object-cover"
                      style={{
                        imageRendering: "auto",
                        transform: `translateY(${(theme as any).avatar_offset_y || 0}px)`,
                      }}
                    />
                    <AvatarFallback
                      className={cn(s.avatarFallback, "font-semibold")}
                      style={{ backgroundColor: theme.button_color, color: theme.button_text_color }}
                    >
                      {profile.title?.charAt(0)?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            </div>
          )}
          {data.show_name &&
            ((theme as any).title_style === "logo" && (theme as any).title_logo_url ? (
              <img
                src={(theme as any).title_logo_url || "/placeholder.svg"}
                alt={profile.title || "Logo"}
                className="mx-auto w-auto my-1"
                style={{
                  maxHeight:
                    (theme as any).title_size === "large"
                      ? scale === "small"
                        ? "54px"
                        : "62px"
                      : scale === "small"
                        ? "46px"
                        : "54px",
                  maxWidth:
                    (theme as any).title_size === "large"
                      ? scale === "small"
                        ? "180px"
                        : "220px"
                      : scale === "small"
                        ? "160px"
                        : "200px",
                  objectFit: "contain",
                  marginTop: (theme as any).logo_position === "more_up" ? "-5px" : undefined,
                }}
              />
            ) : (
              profile.title && (
                <h1
                  className={cn(
                    s.title,
                    "font-bold text-center inline-flex items-center justify-center",
                    (theme as any).title_size === "large" && (scale === "small" ? "text-[19px]" : "text-2xl"),
                  )}
                  style={{
                    color: (theme as any).title_color || theme.text_color,
                    fontFamily: (theme as any).title_font || theme.font_family,
                  }}
                >
                  {profile.title}
                  {settings?.verified_badge_enabled && (
                    <VerifiedBadge scale={scale} badgeType={settings?.verified_badge_type} />
                  )}
                </h1>
              )
            ))}
          {data.show_bio && profile.bio && (
            <p
              className={cn(s.bio, "text-center leading-relaxed mx-auto")}
              style={{ color: theme.secondary_text_color || `${theme.text_color}cc` }}
            >
              {profile.bio}
            </p>
          )}
        </div>
      )
    }

    case "link_button": {
      const data = block.data as LinkButtonBlockData
      // Icon paths for thumbnails
      const ICON_PATHS: Record<string, string> = {
        'link': 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
        'external': 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
        'star': 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
        'heart': 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
        'music': 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
        'video': 'M23 7l-7 5 7 5V7zM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z',
        'camera': 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
        'shopping': 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0',
        'gift': 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
        'book': 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z',
        'calendar': 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6zM16 2v4M8 2v4M3 10h18',
        'mail': 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
        'phone': 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
        'globe': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
        'map-pin': 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
        'download': 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
        'file': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
        'image': 'M3 3h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
        'coffee': 'M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3',
        'zap': 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
        // Platform icons
        'instagram': 'M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z',
        'twitter': 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
        'youtube': 'M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33zM9.75 15.02V8.48l5.75 3.27-5.75 3.27z',
        'tiktok': 'M16.8218 5.1344C16.0887 4.29394 15.648 3.19805 15.648 2H14.7293C14.9659 3.3095 15.7454 4.43326 16.8218 5.1344ZM8.3218 11.9048C6.73038 11.9048 5.43591 13.2004 5.43591 14.7931C5.43591 15.903 6.06691 16.8688 6.98556 17.3517C6.64223 16.8781 6.43808 16.2977 6.43808 15.6661C6.43808 14.0734 7.73255 12.7778 9.324 12.7778C9.62093 12.7778 9.90856 12.8288 10.1777 12.9124V9.40192C9.89927 9.36473 9.61628 9.34149 9.324 9.34149C9.27294 9.34149 9.22654 9.34614 9.1755 9.34614V12.0394C8.90176 11.9558 8.61873 11.9048 8.3218 11.9048ZM19.4245 6.67608V9.34614C17.6429 9.34614 15.9912 8.77501 14.6456 7.80911V14.7977C14.6456 18.2851 11.8108 21.127 8.32172 21.127C6.97621 21.127 5.7235 20.6998 4.69812 19.98C5.8534 21.2198 7.50049 22 9.32392 22C12.8083 22 15.6478 19.1627 15.6478 15.6707V8.68211C16.9933 9.64801 18.645 10.2191 20.4267 10.2191V6.78293C20.0787 6.78293 19.7446 6.74574 19.4245 6.67608ZM14.6456 14.7977V7.80911C15.9912 8.77501 17.6429 9.34614 19.4245 9.34614V6.67608C18.3945 6.45788 17.4899 5.90063 16.8218 5.1344C15.7454 4.43326 14.9704 3.3095 14.7245 2H12.2098L12.2051 15.7775C12.1495 17.3192 10.8782 18.5591 9.32393 18.5591C8.35884 18.5591 7.50977 18.0808 6.98085 17.3564C6.06219 16.8688 5.4312 15.9076 5.4312 14.7977C5.4312 13.205 6.72567 11.9094 8.31708 11.9094C8.61402 11.9094 8.90168 11.9605 9.17079 12.0441V9.35079C5.75598 9.42509 3 12.2298 3 15.6707C3 17.3331 3.64492 18.847 4.69812 19.98C5.7235 20.6998 6.97621 21.127 8.32172 21.127C11.8061 21.127 14.6456 18.2851 14.6456 14.7977Z',
        'spotify': 'M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.623.623 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 0 1-.277-1.215c3.809-.87 7.076-.496 9.712 1.115a.623.623 0 0 1 .207.857zm1.223-2.722a.78.78 0 0 1-1.072.257c-2.687-1.652-6.786-2.131-9.965-1.166a.78.78 0 0 1-.452-1.493c3.632-1.102 8.147-.568 11.232 1.329a.78.78 0 0 1 .257 1.073zm.105-2.835c-3.223-1.914-8.54-2.09-11.618-1.156a.935.935 0 0 1-.542-1.79c3.533-1.072 9.404-.865 13.115 1.338a.935.935 0 0 1-1.014 1.567l.059.041z',
        'facebook': 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
        'linkedin': 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
        'twitch': 'M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9V7m5 4V7',
        'discord': 'M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z',
        'telegram': 'M21.198 2.433a2.242 2.242 0 0 0-1.022.215l-16.5 7.5a2.25 2.25 0 0 0 .126 4.303l3.2 1.067 1.493 4.8a1.5 1.5 0 0 0 2.368.671l2.441-1.953 4.195 3.209a2.25 2.25 0 0 0 3.541-1.332l3-15A2.25 2.25 0 0 0 21.198 2.433zM6.988 13.678l7.25-4.812-5.5 5.562-.75 3z',
        'whatsapp': 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z',
        'pinterest': 'M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z',
        'snapchat': 'M11.99 2.75c-1.494-.011-3.017.567-4.003 1.714-.874.926-1.204 2.238-1.16 3.483-.004.64.004 1.28.006 1.92-.613-.152-1.234-.578-1.882-.367-.553.164-.783.886-.45 1.349.36.47.918.738 1.385 1.089.229.188.538.321.71.562 0 .577-.303 1.112-.59 1.599-.7 1.099-1.786 1.93-2.956 2.509-.3.129-.572.518-.309.812.485.453 1.167.598 1.77.811.256.08.635.168.608.507.042.365.276.758.687.76.982.114 2.036.065 2.918.59.868.501 1.756 1.059 2.777 1.117 1.02.1 2.08-.111 2.958-.663.654-.36 1.292-.81 2.06-.883.645-.15 1.338-.015 1.96-.26.4-.17.35-.66.51-.984.32-.22.72-.243 1.07-.388.46-.183 1.04-.332 1.27-.802.14-.38-.29-.586-.56-.734-1.42-.734-2.7-1.87-3.27-3.4-.06-.24-.29-.6.01-.78.62-.52 1.43-.82 1.94-1.46.39-.488.12-1.318-.52-1.418-.618-.098-1.19.24-1.77.391-.051-1.068.063-2.152-.102-3.218-.304-1.726-1.69-3.145-3.35-3.64-.565-.18-1.158-.25-1.746-.25z',
        'github': 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
        'apple-music': 'M8.5 7.5l10-1.75m-10 1.75v11.375m0-11.375V5.09a1 1 0 0 1 .83-.99l8-1.4a1.17 1.17 0 0 1 1.17.99V5.75m0 0v11.125m-12.31.154l-1.06.19a1.97 1.97 0 0 0-1.63 1.81c0 1.22 1.1 2.15 2.31 1.94l1.06-.19a1.97 1.97 0 0 0 1.63-1.81c0-1.22-1.1-2.15-2.31-1.94zm10-2l-1.06.19a1.97 1.97 0 0 0-1.63 1.81c0 1.22 1.1 2.15 2.31 1.94l1.06-.19a1.97 1.97 0 0 0 1.63-1.81c0-1.22-1.1-2.15-2.31-1.94z',
      }
      const iconPath = data.icon ? ICON_PATHS[data.icon] : null
      // Icons that should be rendered with fill instead of stroke
      const FILLED_ICONS = new Set([
        'instagram', 'twitter', 'youtube', 'tiktok', 'spotify', 'facebook', 'linkedin',
        'twitch', 'discord', 'telegram', 'whatsapp', 'pinterest', 'snapchat',
        'github', 'apple-music'
      ])
      const isFilledIcon = data.icon ? FILLED_ICONS.has(data.icon) : false
      // Icon color should match button text color
      const iconColor = theme.button_style === "outline" ? theme.text_color : theme.button_text_color

      // Pro Layout - Featured display with larger thumbnail
      if (data.layout_type === 'pro') {
        const displayMode = data.display_mode || 'cover'
        // Full mode: no fixed aspect ratio, image displays at natural size
        // Cover mode: 2:1 aspect ratio with object-cover
        // Contain mode: 2:1 aspect ratio with object-contain

        // Check if this is a YouTube URL and extract video ID
        const getYouTubeVideoId = (url: string): string | null => {
          if (!url) return null
          try {
            if (url.includes('youtube.com/watch')) {
              const urlObj = new URL(url)
              return urlObj.searchParams.get('v')
            } else if (url.includes('youtu.be/')) {
              const match = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
              return match ? match[1] : null
            }
          } catch {
            return null
          }
          return null
        }

        const youtubeVideoId = getYouTubeVideoId(data.url)
        const youtubeMode = data.youtube_mode || 'embed_video'
        const youtubeShowPlayButton = data.youtube_show_play_button === true

        // Determine which video ID to use based on mode
        const effectiveVideoId = youtubeMode === 'embed_latest' && data.youtube_latest_video_id
          ? data.youtube_latest_video_id
          : youtubeVideoId

        // Check if we should show embed (only for embed_video or embed_latest modes)
        const shouldEmbed = (youtubeMode === 'embed_video' || youtubeMode === 'embed_latest') && effectiveVideoId

        // Get animation class based on animation_type
        const getAnimationClass = (animationType: string | undefined) => {
          switch (animationType) {
            case 'pulse': return 'animate-onepage-pulse'
            case 'bounce': return 'animate-onepage-bounce'
            case 'shake': return 'animate-onepage-shake'
            case 'glow': return 'animate-onepage-glow'
            case 'swipe': return 'animate-onepage-swipe'
            default: return ''
          }
        }

        // Check if Pro layout should open Spotify modal
        const proSpotifyMode = data.spotify_mode || 'go_to_url'
        const proShouldOpenSpotifyModal = isSpotifyUrl(data.url) && (proSpotifyMode === 'audio_preview' || proSpotifyMode === 'show_streaming') && spotifyModalContext
        const proSpotifyInfo = proShouldOpenSpotifyModal ? getSpotifyInfo(data.url) : null

        // Pro layout content (shared between button and div)
        const proLayoutContent = (
          <>
            {/* Featured content area - YouTube embed or thumbnail */}
            {shouldEmbed ? (
              <div
                className="w-full aspect-video relative overflow-hidden"
                style={{
                  borderRadius: `${theme.button_border_radius}px ${theme.button_border_radius}px 0 0`,
                }}
              >
                <iframe
                  src={`https://www.youtube.com/embed/${effectiveVideoId}?rel=0&modestbranding=1`}
                  title="YouTube video player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full border-0"
                />
              </div>
            ) : (data.thumbnail_url || iconPath) && (
              <div
                className={cn(
                  "w-full relative overflow-hidden",
                  displayMode !== 'full' && "aspect-[2/1]"
                )}
                style={{
                  borderRadius: `${theme.button_border_radius}px ${theme.button_border_radius}px 0 0`,
                  backgroundColor: displayMode === 'contain' ? (
                    theme.button_style === "outline" ? `${theme.button_color}10` : `${theme.button_text_color}10`
                  ) : undefined,
                }}
              >
                {data.thumbnail_url ? (
                  <>
                    <img
                      src={data.thumbnail_url}
                      alt=""
                      className={cn(
                        "w-full",
                        displayMode === 'cover' && "h-full object-cover",
                        displayMode === 'contain' && "h-full object-contain",
                        displayMode === 'full' && "h-auto object-none"
                      )}
                      style={{ imageRendering: "auto" }}
                    />
                    {/* Play button overlay for YouTube open_video mode */}
                    {youtubeVideoId && youtubeMode === 'open_video' && youtubeShowPlayButton && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-sm"
                          style={{
                            backgroundColor: 'rgba(0, 0, 0, 0.55)',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                          }}
                        >
                          <svg className="w-4 h-4 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                      </div>
                    )}
                  </>
                ) : iconPath ? (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{
                      backgroundColor: theme.button_style === "outline"
                        ? `${theme.button_color}10`
                        : `${theme.button_text_color}10`,
                    }}
                  >
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill={isFilledIcon ? "currentColor" : "none"}
                      stroke={isFilledIcon ? "none" : "currentColor"}
                      strokeWidth={isFilledIcon ? "0" : "1.5"}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ color: iconColor, opacity: 0.6 }}
                    >
                      <path d={iconPath} />
                    </svg>
                  </div>
                ) : null}
                {/* Play button overlay for YouTube open_video mode (default layout) */}
                {youtubeMode === 'open_video' && youtubeShowPlayButton && data.url && (data.url.includes('youtube.com') || data.url.includes('youtu.be')) && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-sm"
                      style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.55)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="w-4 h-4 ml-0.5"
                        fill="white"
                      >
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Title area */}
            <div
              className="w-full px-4 py-3 flex flex-col items-center justify-center overflow-hidden"
              style={{
                backgroundColor: theme.button_style === "filled" ? theme.button_color : 'transparent',
              }}
            >
              <span className="truncate font-medium max-w-full block" style={{ color: theme.button_style === "outline" ? theme.text_color : theme.button_text_color }}>
                {data.label || "My Link"}
              </span>
              {/* Spotify metadata display for Pro Layout */}
              {isSpotifyUrl(data.url) && data.spotify_show_metadata !== false && (data.spotify_title || data.spotify_artist) && (
                <span
                  className="text-[10px] flex items-center justify-center gap-1 mt-0.5 max-w-full"
                  style={{
                    color: theme.button_style === "outline" ? theme.text_color : theme.button_text_color,
                    opacity: 0.7
                  }}
                >
                  <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                  </svg>
                  <span className="truncate">
                    {data.spotify_type === 'track' && `Song · ${data.spotify_artist || data.spotify_title}`}
                    {data.spotify_type === 'album' && `Album · ${data.spotify_title || data.spotify_artist}`}
                    {data.spotify_type === 'artist' && (data.spotify_artist || data.spotify_title)}
                    {data.spotify_type === 'playlist' && `Playlist · ${data.spotify_title || data.spotify_artist}`}
                    {!data.spotify_type && (data.spotify_title || data.spotify_artist)}
                  </span>
                </span>
              )}
            </div>
          </>
        )

        // If Pro layout should open Spotify modal, render as button
        if (proShouldOpenSpotifyModal && proSpotifyInfo) {
          return (
            <button
              type="button"
              onClick={() => {
                if (spotifyModalContext) {
                  spotifyModalContext.openSpotifyModal({
                    title: data.label || 'Listen on Spotify',
                    embedUrl: proSpotifyInfo.embedUrl,
                    spotifyUrl: data.url,
                    streamingServices: data.streaming_services,
                    spotifyMode: proSpotifyMode
                  })
                }
              }}
              className={cn(
                s.button,
                "w-full font-medium overflow-hidden",
                !shouldEmbed && hoverEffect,
                getAnimationClass(data.animation_type),
              )}
              style={{
                ...buttonStyles,
                padding: 0,
              }}
            >
              {proLayoutContent}
            </button>
          )
        }

        return (
          <div
            className={cn(
              s.button,
              "w-full font-medium overflow-hidden",
              !shouldEmbed && hoverEffect,
              getAnimationClass(data.animation_type),
            )}
            style={{
              ...buttonStyles,
              padding: 0,
            }}
          >
            {proLayoutContent}
          </div>
        )
      }

      // Default Layout
      const hasThumbnailOrIcon = data.thumbnail_url || iconPath

      // Get animation class based on animation_type (for default layout)
      const getDefaultAnimationClass = (animationType: string | undefined) => {
        switch (animationType) {
          case 'pulse': return 'animate-onepage-pulse'
          case 'bounce': return 'animate-onepage-bounce'
          case 'shake': return 'animate-onepage-shake'
          case 'glow': return 'animate-onepage-glow'
          case 'swipe': return 'animate-onepage-swipe'
          default: return ''
        }
      }

      // Check if this is a Spotify link with modal mode
      const spotifyMode = data.spotify_mode || 'go_to_url'
      const shouldOpenSpotifyModal = isSpotifyUrl(data.url) && (spotifyMode === 'audio_preview' || spotifyMode === 'show_streaming') && spotifyModalContext

      if (shouldOpenSpotifyModal) {
        const spotifyInfo = getSpotifyInfo(data.url)
        return (
          <button
            type="button"
            onClick={() => {
              if (spotifyInfo && spotifyModalContext) {
                spotifyModalContext.openSpotifyModal({
                  title: data.label || 'Listen on Spotify',
                  embedUrl: spotifyInfo.embedUrl,
                  spotifyUrl: data.url,
                  streamingServices: data.streaming_services,
                  spotifyMode
                })
              }
            }}
            className={cn(
              s.button,
              "w-full font-medium flex items-center gap-2",
              hoverEffect,
              hasThumbnailOrIcon ? "justify-start" : "justify-center",
              getDefaultAnimationClass(data.animation_type)
            )}
            style={buttonStyles}
          >
            {data.thumbnail_url ? (
              <img
                src={data.thumbnail_url}
                alt=""
                className={cn(s.buttonThumb, "rounded-lg object-cover shrink-0")}
                style={{ imageRendering: "auto" }}
              />
            ) : iconPath ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill={isFilledIcon ? "currentColor" : "none"}
                stroke={isFilledIcon ? "none" : "currentColor"}
                strokeWidth={isFilledIcon ? "0" : "2"}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
                style={{ color: iconColor }}
              >
                <path d={iconPath} />
              </svg>
            ) : null}
            <div className={cn("flex flex-col min-w-0", hasThumbnailOrIcon ? "flex-1 text-center" : "")}>
              <span className="truncate">{data.label || "My Link"}</span>
              {/* Spotify info display */}
              {data.spotify_show_metadata !== false && (data.spotify_title || data.spotify_artist) && (
                <span
                  className="text-[10px] flex items-center justify-center gap-1 max-w-full"
                  style={{
                    color: theme.button_style === "outline" ? theme.text_color : theme.button_text_color,
                    opacity: 0.7
                  }}
                >
                  <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                  </svg>
                  <span className="truncate">
                    {data.spotify_type === 'track' && `Song · ${data.spotify_artist || data.spotify_title}`}
                    {data.spotify_type === 'album' && `Album · ${data.spotify_title || data.spotify_artist}`}
                    {data.spotify_type === 'artist' && (data.spotify_artist || data.spotify_title)}
                    {data.spotify_type === 'playlist' && `Playlist · ${data.spotify_title || data.spotify_artist}`}
                    {!data.spotify_type && (data.spotify_title || data.spotify_artist)}
                  </span>
                </span>
              )}
            </div>
          </button>
        )
      }

      return (
        <button
          className={cn(
            s.button,
            "w-full font-medium flex items-center gap-2",
            hoverEffect,
            hasThumbnailOrIcon ? "justify-start" : "justify-center",
            getDefaultAnimationClass(data.animation_type)
          )}
          style={buttonStyles}
        >
          {data.thumbnail_url ? (
            <img
              src={data.thumbnail_url}
              alt=""
              className={cn(s.buttonThumb, "rounded-lg object-cover shrink-0")}
              style={{ imageRendering: "auto" }}
            />
          ) : iconPath ? (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill={isFilledIcon ? "currentColor" : "none"}
              stroke={isFilledIcon ? "none" : "currentColor"}
              strokeWidth={isFilledIcon ? "0" : "2"}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              style={{ color: iconColor }}
            >
              <path d={iconPath} />
            </svg>
          ) : null}
          <div className={cn("flex flex-col min-w-0", hasThumbnailOrIcon ? "flex-1 text-center" : "")}>
            <span className="truncate">{data.label || "My Link"}</span>
            {/* Spotify info display */}
            {isSpotifyUrl(data.url) && data.spotify_show_metadata !== false && (data.spotify_title || data.spotify_artist) && (
              <span
                className="text-[10px] flex items-center justify-center gap-1 mt-0.5 max-w-full"
                style={{
                  color: theme.button_style === "outline" ? theme.text_color : theme.button_text_color,
                  opacity: 0.75
                }}
              >
                <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
                <span className="truncate">
                  {data.spotify_type === 'track' && `Song · ${data.spotify_artist || data.spotify_title}`}
                  {data.spotify_type === 'album' && `Album · ${data.spotify_title || data.spotify_artist}`}
                  {data.spotify_type === 'artist' && `Profile · ${data.spotify_artist || data.spotify_title}`}
                  {data.spotify_type === 'playlist' && `Playlist · ${data.spotify_title || data.spotify_artist}`}
                  {!data.spotify_type && (data.spotify_title || data.spotify_artist)}
                </span>
              </span>
            )}
          </div>
        </button>
      )
    }

    case "text": {
      const data = block.data as TextBlockData
      return (
        <div
          className={cn(s.text, "w-full leading-relaxed")}
          style={{ color: theme.text_color, textAlign: data.alignment || "center" }}
        >
          {data.content}
        </div>
      )
    }

    case "image": {
      const data = block.data as ImageBlockData
      if (!data.image_url) return null
      const aspectClass =
        data.aspect_ratio === "square" ? "aspect-square" : data.aspect_ratio === "video" ? "aspect-video" : ""
      return (
        <div className="w-full">
          <img
            src={data.image_url || "/placeholder.svg"}
            alt={data.alt_text || ""}
            className={cn("w-full object-cover", aspectClass)}
            style={{ borderRadius: `${theme.button_border_radius}px`, imageRendering: "auto" }}
          />
        </div>
      )
    }

    case "divider": {
      const data = block.data as DividerBlockData
      const height = data.height || 24
      if (data.style === "space") return <div className="w-full" style={{ height: `${height}px` }} />
      if (data.style === "dotted" || data.style === "dots")
        return (
          <div className="w-full flex justify-center items-center gap-1" style={{ height: `${height}px` }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: `${theme.text_color}40` }} />
            ))}
          </div>
        )
      return (
        <div className="w-full flex items-center" style={{ height: `${height}px` }}>
          <div className="w-full h-px" style={{ backgroundColor: `${theme.text_color}20` }} />
        </div>
      )
    }

    case "email_capture": {
      const data = block.data as EmailCaptureBlockData
      return (
        <div className="w-full space-y-2">
          {data.headline && (
            <h3 className={cn(s.headline, "font-semibold text-center")} style={{ color: theme.text_color }}>
              {data.headline}
            </h3>
          )}
          {data.description && (
            <p
              className={cn(s.description, "text-center")}
              style={{ color: theme.secondary_text_color || `${theme.text_color}aa` }}
            >
              {data.description}
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="email"
              placeholder={data.placeholder || "Enter your email"}
              className={cn(s.input, "flex-1 rounded-lg bg-white/10 border-0 outline-none", emailSubmitted && "opacity-70")}
              style={{ color: theme.text_color, backgroundColor: `${theme.text_color}10` }}
              disabled={emailSubmitted}
            />
            <button
              onClick={() => setEmailSubmitted(true)}
              disabled={emailSubmitted}
              className={cn(s.inputBtn, "font-medium shrink-0", emailSubmitted && "opacity-50 cursor-not-allowed")}
              style={buttonStyles}
            >
              {emailSubmitted ? "Subscribed!" : data.button_text || "Subscribe"}
            </button>
          </div>
          {emailSubmitted && (
            <p className="text-[9px] text-center opacity-70" style={{ color: theme.text_color }}>
              {data.success_message || "Thanks for subscribing!"}
            </p>
          )}
        </div>
      )
    }

    case "social_row": {
      const data = block.data as SocialRowBlockData
      const platforms = data.platforms || []
      if (platforms.length === 0) return null

      const headerLayout = (theme as any).header_layout || "classic"
      const isHeroLayout = headerLayout === "hero"
      // Hero layout: move icons up, Classic: add 2px padding top/bottom
      const layoutStyles = isHeroLayout ? "mt-[-6px] mb-[2px]" : "mt-[2px] mb-[2px]"

      return (
        <div
          className={cn("w-full flex justify-center flex-wrap", s.socialGap, layoutStyles)}
          style={{ marginBottom: isHeroLayout ? "2px" : undefined }}
        >
          {platforms.map((platform, idx) => {
            const IconComponent = SocialIconsSVG[platform.platform]
            return (
              <a
                key={`${platform.platform}-${idx}`}
                href={platform.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  s.social,
                  "rounded-full flex items-center justify-center transition-transform hover:scale-110",
                )}
                style={{
                  backgroundColor: socialStyle === "filled" ? `${socialColor}15` : "transparent",
                  borderWidth: socialStyle === "outline" ? 2 : 0,
                  borderColor: socialColor,
                  borderStyle: "solid",
                }}
              >
                {IconComponent ? (
                  <IconComponent size={s.socialIcon} color={socialColor} />
                ) : (
                  <Globe size={s.socialIcon} color={socialColor} />
                )}
              </a>
            )
          })}
        </div>
      )
    }

    case "group": {
      const data = block.data as GroupBlockData
      if (!data.children || data.children.length === 0) {
        return (
          <div className="w-full border-2 border-dashed border-gray-300 rounded-xl p-4 text-center opacity-60">
            <p className="text-xs" style={{ color: theme.text_color }}>Empty group</p>
          </div>
        )
      }

      return (
        <GroupBlockPreview
          data={data}
          theme={theme}
          profile={profile}
          scale={scale}
          settings={settings}
          BlockRenderer={BlockRenderer}
        />
      )
    }

    default:
      return null
  }
}
