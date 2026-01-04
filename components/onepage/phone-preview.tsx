"use client"

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
} from "@/lib/onepage/types"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Globe } from "lucide-react"
import { useState } from "react"

const SocialIconsSVG: Record<string, React.FC<{ size?: number; color?: string }>> = {
  instagram: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  ),
  tiktok: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
    </svg>
  ),
  youtube: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  ),
  twitter: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  ),
  spotify: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  ),
  linkedin: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  ),
  facebook: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  ),
  github: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
    </svg>
  ),
  twitch: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
    </svg>
  ),
}

// Background Pattern Component for rendering pattern overlays
function BackgroundPattern({ pattern, color, opacity = "medium" }: { pattern: string; color: string; opacity?: "low" | "medium" | "hard" | "very_hard" }) {
  const opacityValue = opacity === "low" ? 0.4 : opacity === "hard" ? 1 : opacity === "very_hard" ? 1.5 : 0.7
  const patternSVGs: Record<string, React.ReactNode> = {
    grid: (
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1, opacity: opacityValue }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`bg-grid-${pattern}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke={color} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#bg-grid-${pattern})`} />
      </svg>
    ),
    dots: (
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1, opacity: opacityValue }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`bg-dots-${pattern}`} width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="8" cy="8" r="2" fill={color} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#bg-dots-${pattern})`} />
      </svg>
    ),
    waves: (
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1, opacity: opacityValue }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`bg-waves-${pattern}`} width="50" height="25" patternUnits="userSpaceOnUse">
            <path d="M0 12.5 Q12.5 0, 25 12.5 T50 12.5" fill="none" stroke={color} strokeWidth="2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#bg-waves-${pattern})`} />
      </svg>
    ),
    zigzag: (
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1, opacity: opacityValue }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`bg-zigzag-${pattern}`} width="20" height="12" patternUnits="userSpaceOnUse">
            <path d="M0 6 L5 0 L10 6 L15 0 L20 6" fill="none" stroke={color} strokeWidth="1.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#bg-zigzag-${pattern})`} />
      </svg>
    ),
    cross: (
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1, opacity: opacityValue }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`bg-cross-${pattern}`} width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M8 0 L8 16 M0 8 L16 8" fill="none" stroke={color} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#bg-cross-${pattern})`} />
      </svg>
    ),
    diagonal: (
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1, opacity: opacityValue }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`bg-diagonal-${pattern}`} width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M0 10 L10 0" fill="none" stroke={color} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#bg-diagonal-${pattern})`} />
      </svg>
    ),
    morph: (
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1, opacity: opacityValue }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id={`bg-morph-${pattern}`} width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M40 20 Q60 40, 40 60 Q20 80, 40 100 Q60 80, 80 100 Q100 120, 80 140 Q60 120, 40 140 Q20 160, 40 180" fill="none" stroke={color} strokeWidth="2" opacity="0.5" />
            <path d="M120 10 Q140 30, 160 20 Q180 40, 160 60 Q180 80, 160 100 Q140 80, 120 100 Q100 80, 120 60" fill="none" stroke={color} strokeWidth="2" opacity="0.4" />
            <path d="M100 140 Q120 160, 140 150 Q160 170, 140 190 Q120 170, 100 180" fill="none" stroke={color} strokeWidth="2" opacity="0.45" />
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
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1, opacity: opacityValue }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id={`bg-organic-${pattern}`} width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M30 40 Q50 20, 70 40 Q90 60, 70 80 Q50 100, 30 80 Q10 60, 30 40" fill={color} opacity="0.35" />
            <path d="M120 30 Q150 25, 160 50 Q170 80, 140 90 Q110 95, 100 70 Q95 45, 120 30" fill={color} opacity="0.3" />
            <path d="M60 130 Q80 110, 110 125 Q130 140, 115 165 Q95 185, 65 170 Q45 155, 60 130" fill={color} opacity="0.32" />
            <path d="M160 140 Q180 145, 185 165 Q188 185, 170 190 Q150 188, 145 170 Q143 152, 160 140" fill={color} opacity="0.28" />
            <path d="M20 160 Q35 150, 45 165 Q50 180, 35 190 Q20 185, 15 175 Q12 165, 20 160" fill={color} opacity="0.25" />
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

  if (!onepage) {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const { title, bio, avatar_url, theme, draft_blocks, social_links, settings } = onepage
  const avatar_video_url = (onepage as any).avatar_video_url
  const avatar_video_crop = (settings as any)?.avatar_video_crop || null
  const sellerName = title || "Creator"

  // Animated gradient - only when explicitly enabled
  const isAnimatedGradient = theme.background_type === "gradient" && theme.animated_gradient === true
  // Use animation toggle state in key to force re-render and restart animation
  const animationKey = `gradient-${String(theme.animated_gradient)}-${theme.background_gradient || 'none'}`

  return (
    <div className={cn("relative flex-shrink-0", className)} style={{ width: '280px', minWidth: '280px', maxWidth: '280px', height: '580px', minHeight: '580px', maxHeight: '580px' }}>
      {/* Animation keyframes - subtle animation */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes gradientShiftPreview {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}} />
      <div style={{ position: 'absolute', top: 0, left: 0, width: '280px', height: '580px', backgroundColor: '#1a1a1a', borderRadius: '44px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', padding: '10px' }}>
        <div style={{ position: 'absolute', left: '-2px', top: '85px', width: '3px', height: '28px', backgroundColor: '#1a1a1a', borderRadius: '2px 0 0 2px' }} />
        <div style={{ position: 'absolute', left: '-2px', top: '125px', width: '3px', height: '44px', backgroundColor: '#1a1a1a', borderRadius: '2px 0 0 2px' }} />
        <div style={{ position: 'absolute', left: '-2px', top: '180px', width: '3px', height: '44px', backgroundColor: '#1a1a1a', borderRadius: '2px 0 0 2px' }} />
        <div style={{ position: 'absolute', right: '-2px', top: '145px', width: '3px', height: '55px', backgroundColor: '#1a1a1a', borderRadius: '0 2px 2px 0' }} />
        
        <div style={{ width: '100%', height: '100%', borderRadius: '34px', overflow: 'hidden', position: 'relative', backgroundColor: '#000' }}>
          <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', width: '84px', height: '25px', backgroundColor: '#000', borderRadius: '9999px', zIndex: 20 }} />
          
          <div
            key={animationKey}
            className="phone-screen-scroll"
            style={{
              position: 'absolute',
              top: '0',
              left: '0',
              right: '0',
              bottom: '0',
              overflowY: 'auto',
              overflowX: 'hidden',
              background: theme.background_type === "gradient" && theme.background_gradient ? theme.background_gradient : theme.background_color,
              fontFamily: theme.font_family || "Inter",
              scrollbarWidth: 'thin',
              scrollbarColor: `${theme.text_color}40 transparent`,
              backgroundSize: isAnimatedGradient ? "200% 200%" : undefined,
              animation: isAnimatedGradient ? "gradientShiftPreview 10s ease-in-out infinite" : undefined
            }}
          >
            <style>{`.phone-screen-scroll::-webkit-scrollbar { width: 4px; } .phone-screen-scroll::-webkit-scrollbar-track { background: transparent; margin: 10px 0; } .phone-screen-scroll::-webkit-scrollbar-thumb { background: ${theme.text_color}40; border-radius: 4px; }`}</style>
            
            {theme.background_type === "image" && theme.background_image_url && (
              <div
                style={{
                  position: 'absolute',
                  top: '-30px',
                  left: '-30px',
                  right: '-30px',
                  bottom: '-30px',
                  backgroundImage: `url(${theme.background_image_url})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  zIndex: 0,
                  filter: `brightness(${(theme as any).image_brightness || 100}%) blur(${(theme as any).image_blur || 0}px)`
                }}
              />
            )}

            {/* Video background */}
            {theme.background_type === "video" && (theme as any).background_video_url && (
              <video
                src={(theme as any).background_video_url}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  minWidth: '100%',
                  minHeight: '100%',
                  width: 'auto',
                  height: 'auto',
                  objectFit: 'cover',
                  zIndex: 0,
                  filter: `brightness(${(theme as any).video_brightness || 100}%)`
                }}
                autoPlay
                loop
                muted
                playsInline
              />
            )}

            {/* Noise overlay for gradient backgrounds */}
            {theme.background_type === "gradient" && (theme as any).gradient_noise && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ mixBlendMode: 'overlay', zIndex: 1, opacity: ((theme as any).noise_strength || 15) / 100 * 2 }}>
                <filter id="phone-noise-gradient">
                  <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
                </filter>
                <rect width="100%" height="100%" filter="url(#phone-noise-gradient)" />
              </svg>
            )}

            {/* Noise overlay for image backgrounds */}
            {theme.background_type === "image" && (theme as any).image_noise && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ mixBlendMode: 'overlay', zIndex: 1, opacity: ((theme as any).noise_strength || 15) / 100 * 2 }}>
                <filter id="phone-noise-image">
                  <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
                </filter>
                <rect width="100%" height="100%" filter="url(#phone-noise-image)" />
              </svg>
            )}

            {/* Pattern overlay */}
            {(theme.background_type === "solid" || theme.background_type === "gradient") && (theme as any).background_pattern && (theme as any).background_pattern !== "none" && (
              <BackgroundPattern pattern={(theme as any).background_pattern} color={(theme as any).pattern_color || "#00000090"} opacity={(theme as any).pattern_opacity || "medium"} />
            )}

            <div style={{ position: 'relative', zIndex: 1, paddingTop: '45px', paddingBottom: '24px', paddingLeft: '16px', paddingRight: '16px', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
              <div className={cn("flex flex-col items-center flex-1", theme.spacing === "compact" ? "gap-[10px]" : theme.spacing === "comfortable" ? "gap-[14px]" : "gap-[12px]")}>
                {draft_blocks.filter((b) => b.enabled).sort((a, b) => a.sort_order - b.sort_order).map((block) => (
                  <BlockRenderer key={block.id} block={block} theme={theme} profile={{ title, bio, avatar_url, avatar_video_url, avatar_video_crop, social_links }} scale="small" />
                ))}
              </div>
              {settings.show_branding && (
                <div className="mt-6 text-center">
                  <span className="inline-flex items-center justify-center px-3 py-1.5 rounded-full text-[9px] font-medium bg-white text-gray-900">{sellerName} on Storelib</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function MobilePreviewContent() {
  const { onepage } = useOnePage()

  if (!onepage) {
    return <div className="flex-1 flex items-center justify-center"><div className="text-muted-foreground">Loading...</div></div>
  }

  const { title, bio, avatar_url, theme, draft_blocks, social_links, settings } = onepage
  const avatar_video_url = (onepage as any).avatar_video_url
  const avatar_video_crop = (settings as any)?.avatar_video_crop || null
  const sellerName = title || "Creator"

  // Animated gradient - only when explicitly enabled
  const isAnimatedGradient = theme.background_type === "gradient" && theme.animated_gradient === true
  // Use animation toggle state in key to force re-render and restart animation
  const animationKey = `gradient-${String(theme.animated_gradient)}-${theme.background_gradient || 'none'}`

  return (
    <>
      {/* Animation keyframes */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes gradientShiftFrame {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}} />
      <div
        key={animationKey}
        className="flex-1 overflow-y-auto overflow-x-hidden relative"
        style={{
          background: theme.background_type === "gradient" && theme.background_gradient ? theme.background_gradient : theme.background_color,
          fontFamily: theme.font_family || "Inter",
          backgroundSize: isAnimatedGradient ? "200% 200%" : undefined,
          animation: isAnimatedGradient ? "gradientShiftFrame 10s ease-in-out infinite" : undefined
        }}
      >
        {theme.background_type === "image" && theme.background_image_url && (
          <div
            style={{
              position: 'fixed',
              top: '-50px',
              left: '-50px',
              right: '-50px',
              bottom: '-50px',
              backgroundImage: `url(${theme.background_image_url})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              zIndex: 0,
              pointerEvents: 'none',
              filter: `brightness(${(theme as any).image_brightness || 100}%) blur(${(theme as any).image_blur || 0}px)`
            }}
          />
        )}

        {/* Video background */}
        {theme.background_type === "video" && (theme as any).background_video_url && (
          <video
            src={(theme as any).background_video_url}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              minWidth: '100%',
              minHeight: '100%',
              width: 'auto',
              height: 'auto',
              objectFit: 'cover',
              zIndex: 0,
              pointerEvents: 'none',
              filter: `brightness(${(theme as any).video_brightness || 100}%)`
            }}
            autoPlay
            loop
            muted
            playsInline
          />
        )}

        {/* Noise overlay for gradient backgrounds */}
        {theme.background_type === "gradient" && (theme as any).gradient_noise && (
          <svg className="fixed inset-0 w-full h-full pointer-events-none" style={{ mixBlendMode: 'overlay', zIndex: 1, opacity: ((theme as any).noise_strength || 15) / 100 * 2 }}>
            <filter id="mobile-noise-gradient">
              <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
            </filter>
            <rect width="100%" height="100%" filter="url(#mobile-noise-gradient)" />
          </svg>
        )}

        {/* Noise overlay for image backgrounds */}
        {theme.background_type === "image" && (theme as any).image_noise && (
          <svg className="fixed inset-0 w-full h-full pointer-events-none" style={{ mixBlendMode: 'overlay', zIndex: 1, opacity: ((theme as any).noise_strength || 15) / 100 * 2 }}>
            <filter id="mobile-noise-image">
              <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
            </filter>
            <rect width="100%" height="100%" filter="url(#mobile-noise-image)" />
          </svg>
        )}

        {/* Pattern overlay for mobile */}
        {(theme.background_type === "solid" || theme.background_type === "gradient") && (theme as any).background_pattern && (theme as any).background_pattern !== "none" && (
          <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }}>
            <BackgroundPattern pattern={(theme as any).background_pattern} color={(theme as any).pattern_color || "#00000090"} opacity={(theme as any).pattern_opacity || "medium"} />
          </div>
        )}

        <div className="relative z-10 w-full max-w-md mx-auto px-5 py-8 pb-12 flex flex-col" style={{ minHeight: '100%' }}>
          <div className={cn("flex flex-col items-center flex-1", theme.spacing === "compact" ? "gap-3" : theme.spacing === "comfortable" ? "gap-5" : "gap-4")}>
            {draft_blocks.filter((b) => b.enabled).sort((a, b) => a.sort_order - b.sort_order).map((block) => (
              <BlockRenderer key={block.id} block={block} theme={theme} profile={{ title, bio, avatar_url, avatar_video_url, avatar_video_crop, social_links }} scale="normal" />
            ))}
          </div>
          {settings.show_branding && (
            <div className="mt-8 text-center">
              <span className="inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-medium bg-white text-gray-900">{sellerName} on Storelib</span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

interface BlockRendererProps {
  block: OnePageBlock
  theme: OnePageTheme
  profile: { title: string; bio: string; avatar_url: string | null | undefined; avatar_video_url?: string | null; avatar_video_crop?: { x: number; y: number; width: number; height: number } | null; social_links: any }
  scale?: "small" | "normal"
}

function BlockRenderer({ block, theme, profile, scale = "small" }: BlockRendererProps) {
  const [emailSubmitted, setEmailSubmitted] = useState(false)

  const s = scale === "small" ? {
    avatar: "h-[56px] w-[56px]",
    avatarFallback: "text-[16px]",
    title: "text-[16px]",
    bio: "text-[11px] max-w-[180px]",
    button: "py-[10px] px-[12px] text-[13px]",
    buttonThumb: "w-[22px] h-[22px]",
    text: "text-[11px]",
    input: "px-[10px] py-[8px] text-[11px]",
    inputBtn: "px-[12px] py-[8px] text-[11px]",
    headline: "text-[13px]",
    description: "text-[10px]",
    social: "w-[36px] h-[36px]",
    socialIcon: 16,
    socialGap: "gap-[8px]",
    socialMarginBottom: "mb-[8px]",
  } : {
    avatar: "h-20 w-20",
    avatarFallback: "text-2xl",
    title: "text-xl",
    bio: "text-sm max-w-xs",
    button: "py-3 px-4 text-base",
    buttonThumb: "w-7 h-7",
    text: "text-sm",
    input: "px-4 py-3 text-base",
    inputBtn: "px-5 py-3 text-base",
    headline: "text-lg",
    description: "text-sm",
    social: "w-10 h-10",
    socialIcon: 20,
    socialGap: "gap-3",
    socialMarginBottom: "mb-4",
  }

  const buttonShadow = (theme as any).button_shadow || "none"
  const shadowColor = (theme as any).button_shadow_color || "#000000"
  // Convert hex to rgba for shadow
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }
  const shadowStyles: Record<string, string> = {
    none: "none",
    subtle: `0 2px 4px ${hexToRgba(shadowColor, 0.15)}`,
    strong: `0 4px 12px ${hexToRgba(shadowColor, 0.3)}`,
    hard: `4px 4px 0px ${hexToRgba(shadowColor, 0.9)}`,
  }

  const buttonStyles = {
    backgroundColor: theme.button_style === "outline" ? "transparent" : theme.button_style === "glass" ? "rgba(255, 255, 255, 0.15)" : theme.button_color,
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
          const colorMatches = theme.background_gradient.match(/#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3}|rgb\([^)]+\)|rgba\([^)]+\)/g)
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
        const heroAspect = scale === "small" ? '11/10' : '4/3'
        
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
                  src={profile.avatar_url!}
                  alt=""
                  className="w-full h-full object-cover"
                  style={{ imageRendering: 'auto', objectPosition: `50% ${(theme as any).hero_position_y ?? 50}%` }}
                />
              )}
              {/* Smooth gradient fade overlay using CSS mask for gradient backgrounds */}
              <div 
                className="absolute inset-0 pointer-events-none"
                style={{ 
                  background: isGradientBg 
                    ? theme.background_gradient
                    : fadeColor,
                  maskImage: 'linear-gradient(to bottom, transparent 0%, transparent 40%, black 100%)',
                  WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, transparent 40%, black 100%)',
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
                    )`
                  }} 
                />
              )}
            </div>
            <div
              className="absolute bottom-3 left-0 right-0 text-center px-4"
            >
              {data.show_name && ((theme as any).title_style === "logo" && (theme as any).title_logo_url ? (
                <img
                  src={(theme as any).title_logo_url}
                  alt={profile.title || "Logo"}
                  className="mx-auto w-auto"
                  style={{
                    maxHeight: (theme as any).title_size === "large" ? (scale === "small" ? '54px' : '62px') : (scale === "small" ? '46px' : '54px'),
                    maxWidth: (theme as any).title_size === "large" ? (scale === "small" ? '180px' : '220px') : (scale === "small" ? '160px' : '200px'),
                    objectFit: 'contain',
                    filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.3))",
                    marginTop: (theme as any).logo_position === "more_up" ? '-10px' : undefined
                  }}
                />
              ) : profile.title && (
                <h1 className={cn(s.title, "font-bold", (theme as any).title_size === "large" && (scale === "small" ? "text-[19px]" : "text-2xl"))} style={{ color: (theme as any).title_color || theme.text_color, fontFamily: (theme as any).title_font || theme.font_family, textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>{profile.title}</h1>
              ))}
              {data.show_bio && profile.bio && (
                <p className={cn(s.bio, "text-center mt-1 mx-auto")} style={{ color: theme.secondary_text_color || theme.text_color, textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>{profile.bio}</p>
              )}
            </div>
          </div>
        )
      }
      
      // Classic layout
      // Laser glow settings
      const laserGlowEnabled = (theme as any).laser_glow_enabled
      const laserGlowColor = (theme as any).laser_glow_color || "#3b82f6"
      const laserGlowIntensity = (theme as any).laser_glow_intensity || "medium"
      const glowSize = laserGlowIntensity === "low" ? 8 : laserGlowIntensity === "hard" ? 16 : 12
      const glowBlur = laserGlowIntensity === "low" ? 6 : laserGlowIntensity === "hard" ? 14 : 10
      const avatarSize = scale === "small" ? 72 : 88

      return (
        <div className="flex flex-col items-center gap-2 w-full text-center">
          {data.show_avatar && (
            <div className="relative" style={{ width: avatarSize + 20, height: avatarSize + 20 }}>
              {/* Laser Glow Effect */}
              {laserGlowEnabled && (
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    animation: 'laserGlowRotate 3s linear infinite',
                  }}
                >
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: glowSize,
                      height: glowSize,
                      background: laserGlowColor,
                      boxShadow: `0 0 ${glowBlur}px ${glowBlur/2}px ${laserGlowColor}, 0 0 ${glowBlur*2}px ${glowBlur}px ${laserGlowColor}`,
                      top: '50%',
                      left: '50%',
                      transform: `translate(-50%, -50%) translateY(-${(avatarSize + 20) / 2}px)`,
                    }}
                  />
                </div>
              )}
              {/* Avatar container */}
              <div className="absolute inset-[10px]">
                {hasVideo ? (
                  <div
                    className={cn(s.avatar, "rounded-full overflow-hidden border-2 shadow-lg")}
                    style={{
                      borderColor: `${theme.text_color}20`,
                      transform: `scale(${((theme as any).avatar_scale || 100) / 100})`,
                      width: avatarSize,
                      height: avatarSize,
                    }}
                  >
                    <video
                      src={profile.avatar_video_url!}
                      className="object-cover"
                      style={profile.avatar_video_crop ? {
                        width: `${100 / (profile.avatar_video_crop.width / 100)}%`,
                        height: `${100 / (profile.avatar_video_crop.height / 100)}%`,
                        marginLeft: `-${profile.avatar_video_crop.x / (profile.avatar_video_crop.width / 100)}%`,
                        marginTop: `-${profile.avatar_video_crop.y / (profile.avatar_video_crop.height / 100)}%`,
                        transform: `translateY(${(theme as any).avatar_offset_y || 0}px)`,
                      } : {
                        width: '100%',
                        height: '100%',
                        transform: `translateY(${(theme as any).avatar_offset_y || 0}px)`,
                      }}
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                  </div>
                ) : (
                  <Avatar
                    className={cn(s.avatar, "border-2 shadow-lg")}
                    style={{
                      borderColor: `${theme.text_color}20`,
                      transform: `scale(${((theme as any).avatar_scale || 100) / 100})`,
                      width: avatarSize,
                      height: avatarSize,
                    }}
                  >
                    <AvatarImage
                      src={profile.avatar_url || undefined}
                      className="object-cover"
                      style={{
                        imageRendering: 'auto',
                        transform: `translateY(${(theme as any).avatar_offset_y || 0}px)`,
                      }}
                    />
                    <AvatarFallback className={cn(s.avatarFallback, "font-semibold")} style={{ backgroundColor: theme.button_color, color: theme.button_text_color }}>{profile.title?.charAt(0)?.toUpperCase() || "?"}</AvatarFallback>
                  </Avatar>
                )}
              </div>
            </div>
          )}
          {data.show_name && ((theme as any).title_style === "logo" && (theme as any).title_logo_url ? (
            <img
              src={(theme as any).title_logo_url}
              alt={profile.title || "Logo"}
              className="mx-auto w-auto my-1"
              style={{
                maxHeight: (theme as any).title_size === "large" ? (scale === "small" ? '54px' : '62px') : (scale === "small" ? '46px' : '54px'),
                maxWidth: (theme as any).title_size === "large" ? (scale === "small" ? '180px' : '220px') : (scale === "small" ? '160px' : '200px'),
                objectFit: 'contain',
                marginTop: (theme as any).logo_position === "more_up" ? '-5px' : undefined
              }}
            />
          ) : profile.title && (
            <h1 className={cn(s.title, "font-bold text-center", (theme as any).title_size === "large" && (scale === "small" ? "text-[19px]" : "text-2xl"))} style={{ color: (theme as any).title_color || theme.text_color, fontFamily: (theme as any).title_font || theme.font_family }}>{profile.title}</h1>
          ))}
          {data.show_bio && profile.bio && (
            <p className={cn(s.bio, "text-center leading-relaxed mx-auto")} style={{ color: theme.secondary_text_color || `${theme.text_color}cc` }}>{profile.bio}</p>
          )}
        </div>
      )
    }

    case "link_button": {
      const data = block.data as LinkButtonBlockData
      return (
        <button className={cn(s.button, "w-full font-medium transition-transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2")} style={buttonStyles}>
          {data.thumbnail_url && <img src={data.thumbnail_url} alt="" className={cn(s.buttonThumb, "rounded object-cover shrink-0")} style={{ imageRendering: 'auto' }} />}
          <span className="truncate">{data.label || "My Link"}</span>
        </button>
      )
    }

    case "text": {
      const data = block.data as TextBlockData
      return (
        <div className={cn(s.text, "w-full leading-relaxed")} style={{ color: theme.text_color, textAlign: data.alignment || "center" }}>{data.content}</div>
      )
    }

    case "image": {
      const data = block.data as ImageBlockData
      if (!data.image_url) return null
      const aspectClass = data.aspect_ratio === "square" ? "aspect-square" : data.aspect_ratio === "video" ? "aspect-video" : ""
      return (
        <div className="w-full">
          <img 
            src={data.image_url} 
            alt={data.alt_text || ""} 
            className={cn("w-full object-cover", aspectClass)} 
            style={{ borderRadius: `${theme.button_border_radius}px`, imageRendering: 'auto' }}
          />
        </div>
      )
    }

    case "divider": {
      const data = block.data as DividerBlockData
      if (data.style === "space") return <div className="w-full h-4" />
      if (data.style === "dotted") return <div className="w-full flex justify-center gap-1">{[...Array(3)].map((_, i) => <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: `${theme.text_color}40` }} />)}</div>
      return <div className="w-full h-px" style={{ backgroundColor: `${theme.text_color}20` }} />
    }

    case "email_capture": {
      const data = block.data as EmailCaptureBlockData
      if (emailSubmitted) {
        return (
          <div className="w-full text-center p-4 rounded-lg" style={{ backgroundColor: `${theme.button_color}20`, borderRadius: `${theme.button_border_radius}px` }}>
            <span className={s.text} style={{ color: theme.text_color }}>Thanks for subscribing!</span>
          </div>
        )
      }
      return (
        <div className="w-full space-y-2">
          {data.headline && <h3 className={cn(s.headline, "font-semibold text-center")} style={{ color: theme.text_color }}>{data.headline}</h3>}
          {data.description && <p className={cn(s.description, "text-center")} style={{ color: theme.secondary_text_color || `${theme.text_color}aa` }}>{data.description}</p>}
          <div className="flex gap-2">
            <input type="email" placeholder={data.placeholder || "Enter your email"} className={cn(s.input, "flex-1 rounded-lg bg-white/10 border-0 outline-none")} style={{ color: theme.text_color, backgroundColor: `${theme.text_color}10` }} />
            <button onClick={() => setEmailSubmitted(true)} className={cn(s.inputBtn, "font-medium shrink-0")} style={buttonStyles}>{data.button_text || "Subscribe"}</button>
          </div>
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
        <div className={cn("w-full flex justify-center flex-wrap", s.socialGap, layoutStyles)} style={{ marginBottom: isHeroLayout ? '2px' : undefined }}>
          {platforms.map((platform, idx) => {
            const IconComponent = SocialIconsSVG[platform.platform]
            return (
              <a key={`${platform.platform}-${idx}`} href={platform.url} target="_blank" rel="noopener noreferrer" className={cn(s.social, "rounded-full flex items-center justify-center transition-transform hover:scale-110")} style={{ backgroundColor: socialStyle === "filled" ? `${socialColor}15` : "transparent", borderWidth: socialStyle === "outline" ? 2 : 0, borderColor: socialColor, borderStyle: "solid" }}>
                {IconComponent ? <IconComponent size={s.socialIcon} color={socialColor} /> : <Globe size={s.socialIcon} color={socialColor} />}
              </a>
            )
          })}
        </div>
      )
    }

    default:
      return null
  }
}
