"use client"

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
import { useState, useRef, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

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

// QR Code component - generates actual scannable QR codes
function QRCode({ url, size = 120, darkColor = "#000000" }: { url: string; size?: number; darkColor?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !url) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // QR Code Version 2 (25x25 modules)
    const moduleCount = 25
    const moduleSize = Math.floor(size / (moduleCount + 8)) // Add quiet zone
    const quietZone = moduleSize * 4
    const qrSize = moduleSize * moduleCount
    const totalSize = qrSize + quietZone * 2
    
    canvas.width = totalSize
    canvas.height = totalSize
    
    // White background with quiet zone
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, totalSize, totalSize)
    
    // Create QR matrix
    const matrix: boolean[][] = Array(moduleCount).fill(null).map(() => Array(moduleCount).fill(false))
    
    // Draw finder pattern (7x7 with inner 5x5 white, inner 3x3 black)
    const drawFinderPattern = (startX: number, startY: number) => {
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 7; x++) {
          const isOuter = y === 0 || y === 6 || x === 0 || x === 6
          const isInner = y >= 2 && y <= 4 && x >= 2 && x <= 4
          matrix[startY + y][startX + x] = isOuter || isInner
        }
      }
    }
    
    // Add finder patterns
    drawFinderPattern(0, 0)
    drawFinderPattern(moduleCount - 7, 0)
    drawFinderPattern(0, moduleCount - 7)
    
    // Add timing patterns
    for (let i = 8; i < moduleCount - 8; i++) {
      matrix[6][i] = i % 2 === 0
      matrix[i][6] = i % 2 === 0
    }
    
    // Add alignment pattern for Version 2 (at position 18)
    const alignPos = 18
    for (let y = -2; y <= 2; y++) {
      for (let x = -2; x <= 2; x++) {
        const isOuter = Math.abs(y) === 2 || Math.abs(x) === 2
        const isCenter = y === 0 && x === 0
        matrix[alignPos + y][alignPos + x] = isOuter || isCenter
      }
    }
    
    // Encode URL data into QR code data area
    const urlData = new TextEncoder().encode(url)
    let bitIndex = 0
    
    // Fill data modules (simplified encoding)
    for (let col = moduleCount - 1; col >= 0; col -= 2) {
      if (col === 6) col = 5 // Skip timing column
      
      for (let row = 0; row < moduleCount; row++) {
        for (let c = 0; c < 2; c++) {
          const x = col - c
          if (x < 0) continue
          
          // Skip reserved areas
          const inFinderTL = row < 9 && x < 9
          const inFinderTR = row < 9 && x >= moduleCount - 8
          const inFinderBL = row >= moduleCount - 8 && x < 9
          const inTiming = row === 6 || x === 6
          const inAlign = row >= alignPos - 2 && row <= alignPos + 2 && x >= alignPos - 2 && x <= alignPos + 2
          
          if (inFinderTL || inFinderTR || inFinderBL || inTiming || inAlign) continue
          
          // Get bit from URL data
          const byteIdx = Math.floor(bitIndex / 8) % urlData.length
          const bitIdx = 7 - (bitIndex % 8)
          const bit = (urlData[byteIdx] >> bitIdx) & 1
          
          // Apply mask pattern 0: (row + col) % 2 === 0
          const masked = bit ^ (((row + x) % 2 === 0) ? 1 : 0)
          matrix[row][x] = masked === 1
          
          bitIndex++
        }
      }
    }
    
    // Draw the QR code
    ctx.fillStyle = darkColor
    for (let y = 0; y < moduleCount; y++) {
      for (let x = 0; x < moduleCount; x++) {
        if (matrix[y][x]) {
          ctx.fillRect(
            quietZone + x * moduleSize,
            quietZone + y * moduleSize,
            moduleSize,
            moduleSize
          )
        }
      }
    }
  }, [url, size, darkColor])
  
  return (
    <a 
      href={url} 
      target="_blank" 
      rel="noopener noreferrer"
      className="block cursor-pointer hover:opacity-90 transition-opacity bg-white rounded-lg p-1"
      title="Scan to open page"
    >
      <canvas 
        ref={canvasRef} 
        style={{ display: 'block', width: size, height: size }}
      />
    </a>
  )
}

interface PublicOnePageProps {
  onepage: {
    id: string
    title: string
    bio: string
    slug: string
    avatar_url: string | null
    avatar_video_url?: string | null
    avatar_video_crop?: { x: number; y: number; width: number; height: number } | null
    theme: OnePageTheme
    blocks: OnePageBlock[]
    social_links: any
    settings: any
    seller_id: string
  }
}

export function PublicOnePage({ onepage }: PublicOnePageProps) {
  const { title, bio, avatar_url, avatar_video_url, avatar_video_crop, theme, blocks, social_links, settings, seller_id } = onepage
  const sellerName = title || "Creator"

  // Safe defaults
  const safeTheme = theme || {
    background_type: "solid" as const,
    background_color: "#ffffff",
    background_gradient: "",
    background_image_url: "",
    text_color: "#000000",
    secondary_text_color: "#666666",
    button_color: "#000000",
    button_text_color: "#ffffff",
    button_style: "filled" as const,
    button_border_radius: 8,
    button_border_width: 0,
    button_border_color: "#000000",
    font_family: "Inter",
    spacing: "normal" as const,
    card_width: "standard" as const,
  }
  
  const safeBlocks = blocks || []
  const safeSettings = settings || { show_branding: true, analytics_enabled: true }

  // Animated gradient - only when explicitly enabled
  const isAnimatedGradient = safeTheme.background_type === "gradient" && safeTheme.animated_gradient === true

  // Get background style
  const getBackgroundStyle = () => {
    if (safeTheme.background_type === "gradient" && safeTheme.background_gradient) {
      return safeTheme.background_gradient
    }
    return safeTheme.background_color
  }

  // Noise overlay SVG for gradient/image backgrounds - 40% MORE VISIBLE (opacity 0.21 instead of 0.15)
  const NoiseOverlay = () => (
    <svg className="absolute inset-0 w-full h-full opacity-[0.36] pointer-events-none" style={{ mixBlendMode: 'overlay' }}>
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#noise)" />
    </svg>
  )

  const pageUrl = typeof window !== "undefined" ? `${window.location.origin}/l/${onepage.slug}` : `/l/${onepage.slug}`

  // Page content component
  const PageContent = ({ isDesktop = false }: { isDesktop?: boolean }) => (
    <div 
      className={cn(
        "relative z-10 w-full flex flex-col",
        isDesktop ? "max-w-full" : "max-w-lg mx-auto"
      )}
      style={{ 
        paddingLeft: isDesktop ? '28px' : '20px',
        paddingRight: isDesktop ? '28px' : '20px',
        paddingTop: isDesktop ? '0' : '32px',
        paddingBottom: isDesktop ? '40px' : '80px',
      }}
    >
      <div className={cn("flex flex-col items-center flex-1", safeTheme.spacing === "compact" ? "gap-3 sm:gap-4" : safeTheme.spacing === "comfortable" ? "gap-5 sm:gap-6" : "gap-4 sm:gap-5")}>
        {safeBlocks.filter((b) => b?.enabled).sort((a, b) => (a?.sort_order || 0) - (b?.sort_order || 0)).map((block) => (
          <PublicBlockRenderer 
            key={block.id} 
            block={block} 
            theme={safeTheme} 
            profile={{ title, bio, avatar_url, avatar_video_url, avatar_video_crop, social_links }} 
            onepageId={onepage.id} 
            sellerId={seller_id}
            isDesktop={isDesktop}
          />
        ))}
      </div>
      {safeSettings.show_branding && (
        <div className="mt-10 sm:mt-12 text-center">
          <a href="https://materia.so" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-medium bg-white text-gray-900 hover:bg-gray-100 transition-colors shadow-sm">{sellerName} on Storelib</a>
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Animation keyframes for gradient */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes gradientShiftLive {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}} />

      {/* Desktop layout - NO internal scrollbar, page scrolls naturally */}
      <div
        className="hidden md:block min-h-screen w-full relative overflow-hidden"
        style={{
          background: getBackgroundStyle(),
          fontFamily: safeTheme.font_family || "Inter",
          backgroundSize: isAnimatedGradient ? "200% 200%" : undefined,
          animation: isAnimatedGradient ? "gradientShiftLive 10s ease-in-out infinite" : undefined
        }}
      >
        {safeTheme.background_type === "image" && safeTheme.background_image_url && (
          <div 
            style={{ 
              position: 'fixed', 
              top: '-50px', 
              left: '-50px', 
              right: '-50px', 
              bottom: '-50px', 
              backgroundImage: `url(${safeTheme.background_image_url})`, 
              backgroundSize: 'cover', 
              backgroundPosition: 'center', 
              zIndex: 0,
              filter: `brightness(${(safeTheme as any).image_brightness || 100}%) blur(${(safeTheme as any).image_blur || 0}px)`
            }} 
          />
        )}
        
        {/* Noise overlay for gradient backgrounds */}
        {safeTheme.background_type === "gradient" && (safeTheme as any).gradient_noise && <NoiseOverlay />}
        {/* Noise overlay for image backgrounds */}
        {safeTheme.background_type === "image" && (safeTheme as any).image_noise && <NoiseOverlay />}
        
        {/* Centered card container */}
        <div className="relative z-10 flex justify-center py-8 min-h-screen">
          {/* Phone-like card - wider than before (500px instead of 420px) */}
          <div
            className="w-full max-w-[500px] mx-4 rounded-[40px] overflow-hidden relative"
            style={{
              background: getBackgroundStyle(),
              boxShadow: '0 25px 80px -12px rgba(0, 0, 0, 0.35)',
              backgroundSize: isAnimatedGradient ? "200% 200%" : undefined,
              animation: isAnimatedGradient ? "gradientShiftLive 12s ease-in-out infinite" : undefined
            }}
          >
            {safeTheme.background_type === "image" && safeTheme.background_image_url && (
              <div 
                style={{ 
                  position: 'absolute', 
                  top: '-30px', 
                  left: '-30px', 
                  right: '-30px', 
                  bottom: '-30px', 
                  backgroundImage: `url(${safeTheme.background_image_url})`, 
                  backgroundSize: 'cover', 
                  backgroundPosition: 'center', 
                  zIndex: 0,
                  filter: `brightness(${(safeTheme as any).image_brightness || 100}%) blur(${(safeTheme as any).image_blur || 0}px)`
                }} 
              />
            )}
            {/* Noise overlay inside card */}
            {safeTheme.background_type === "gradient" && (safeTheme as any).gradient_noise && (
              <svg className="absolute inset-0 w-full h-full opacity-[0.36] pointer-events-none rounded-[40px]" style={{ mixBlendMode: 'overlay' }}>
                <filter id="card-noise"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" /></filter>
                <rect width="100%" height="100%" filter="url(#card-noise)" />
              </svg>
            )}
            {safeTheme.background_type === "image" && (safeTheme as any).image_noise && (
              <svg className="absolute inset-0 w-full h-full opacity-[0.36] pointer-events-none rounded-[40px]" style={{ mixBlendMode: 'overlay' }}>
                <filter id="card-noise-img"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" /></filter>
                <rect width="100%" height="100%" filter="url(#card-noise-img)" />
              </svg>
            )}
            <PageContent isDesktop={true} />
          </div>
        </div>

        {/* QR Code in bottom right corner - desktop only */}
        <div className="fixed bottom-6 right-6 z-20 flex flex-col items-center gap-2">
          <span className="text-sm font-medium px-2 py-1 bg-black/20 rounded" style={{ color: '#ffffff' }}>Scan to view</span>
          <QRCode url={pageUrl} size={100} darkColor="#000000" />
        </div>
      </div>

      {/* Mobile layout (full screen) */}
      <div
        className="md:hidden min-h-screen w-full overflow-hidden relative"
        style={{
          background: getBackgroundStyle(),
          fontFamily: safeTheme.font_family || "Inter",
          backgroundSize: isAnimatedGradient ? "200% 200%" : undefined,
          animation: isAnimatedGradient ? "gradientShiftLive 10s ease-in-out infinite" : undefined
        }}
      >
        {safeTheme.background_type === "image" && safeTheme.background_image_url && (
          <div 
            style={{ 
              position: 'fixed', 
              top: '-50px', 
              left: '-50px', 
              right: '-50px', 
              bottom: '-50px', 
              backgroundImage: `url(${safeTheme.background_image_url})`, 
              backgroundSize: 'cover', 
              backgroundPosition: 'center', 
              zIndex: 0,
              filter: `brightness(${(safeTheme as any).image_brightness || 100}%) blur(${(safeTheme as any).image_blur || 0}px)`
            }} 
          />
        )}
        {/* Noise overlays for mobile */}
        {safeTheme.background_type === "gradient" && (safeTheme as any).gradient_noise && <NoiseOverlay />}
        {safeTheme.background_type === "image" && (safeTheme as any).image_noise && <NoiseOverlay />}
        <PageContent />
      </div>
    </>
  )
}

interface PublicBlockRendererProps {
  block: OnePageBlock
  theme: OnePageTheme
  profile: { title: string; bio: string; avatar_url: string | null; avatar_video_url?: string | null; avatar_video_crop?: { x: number; y: number; width: number; height: number } | null; social_links: any }
  onepageId: string
  sellerId: string
  isDesktop?: boolean
}

function PublicBlockRenderer({ block, theme, profile, onepageId, sellerId, isDesktop = false }: PublicBlockRendererProps) {
  const [emailSubmitted, setEmailSubmitted] = useState(false)
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const socialStyle = (theme as any).social_icon_style || "filled"
  const socialColor = (theme as any).social_icon_color || theme.text_color

  const trackClick = async (blockId: string, url: string) => {
    try {
      await fetch("/api/onepage/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ onepage_id: onepageId, block_id: blockId, event_type: "click", url }) })
    } catch (e) { console.error("Track error:", e) }
  }

  // Parse gradient to get colors for fade
  const getGradientBottomColor = () => {
    if (theme.background_type === "gradient" && theme.background_gradient) {
      const colorMatches = theme.background_gradient.match(/#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3}|rgb\([^)]+\)|rgba\([^)]+\)/g)
      if (colorMatches && colorMatches.length > 0) {
        return colorMatches[colorMatches.length - 1]
      }
    }
    return theme.background_color
  }

  if (!block || !block.type) return null

  switch (block.type) {
    case "header": {
      const data = (block.data || {}) as HeaderBlockData
      const headerLayout = (theme as any).header_layout || "classic"
      const hasVideo = !!profile.avatar_video_url
      
      // Hero layout with SMOOTH fade using mask
      if (headerLayout === "hero" && (profile.avatar_url || hasVideo)) {
        // For gradient backgrounds, use mask-image for seamless fade
        const isGradientBg = theme.background_type === "gradient"
        const fadeColor = getGradientBottomColor()
        
        // MOBILE: 30% taller hero (aspect ratio 4/3 instead of 16/9)
        // DESKTOP: 15% shorter than before (aspect ratio 7/5 instead of 6/5)
        const aspectRatio = isDesktop ? '7/5' : '4/3'
        const heroMargin = isDesktop ? '-mx-7 -mt-0' : '-mx-5 -mt-8'
        const heroWidth = isDesktop ? 'w-[calc(100%+56px)]' : 'w-[calc(100%+40px)]'
        
        return (
          <div className={cn(heroWidth, "relative mb-4", heroMargin)}>
            <div className="relative w-full" style={{ aspectRatio }}>
              {hasVideo ? (
                <div className="w-full h-full overflow-hidden">
                  <video
                    ref={videoRef}
                    src={profile.avatar_video_url!}
                    className="object-cover"
                    style={profile.avatar_video_crop ? {
                      width: `${100 / (profile.avatar_video_crop.width / 100)}%`,
                      height: `${100 / (profile.avatar_video_crop.height / 100)}%`,
                      marginLeft: `-${profile.avatar_video_crop.x / (profile.avatar_video_crop.width / 100)}%`,
                      marginTop: `-${profile.avatar_video_crop.y / (profile.avatar_video_crop.height / 100)}%`,
                    } : { width: '100%', height: '100%' }}
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                </div>
              ) : (
                <img 
                  src={profile.avatar_url!} 
                  alt="" 
                  className="w-full h-full object-cover object-top"
                  style={{ imageRendering: 'auto' }}
                  loading="eager"
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
            <div className={cn("absolute left-0 right-0 text-center px-6", isDesktop ? "bottom-8" : "bottom-4 sm:bottom-6")}>
              {data.show_name !== false && profile.title && (
                <h1 className={cn("font-bold", isDesktop ? "text-[31px]" : "text-[27px] sm:text-[31px]")} style={{ color: theme.text_color, textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>{profile.title}</h1>
              )}
              {data.show_bio !== false && profile.bio && (
                <p className={cn("mt-2 max-w-sm mx-auto", isDesktop ? "text-base" : "text-sm sm:text-base")} style={{ color: theme.secondary_text_color || theme.text_color, textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>{profile.bio}</p>
              )}
            </div>
          </div>
        )
      }
      
      // Classic layout - AVATAR 10px BIGGER mobile, 5px BIGGER desktop, TITLE 5px BIGGER
      return (
        <div className={cn("flex flex-col items-center gap-3 sm:gap-4 w-full text-center", isDesktop && "pt-1")}>
          {data.show_avatar !== false && (
            hasVideo ? (
              <div className={cn("rounded-full overflow-hidden border-2 shadow-lg", isDesktop ? "h-[107px] w-[107px] mt-1" : "h-[96px] w-[96px] sm:h-[107px] sm:w-[107px]")} style={{ borderColor: `${theme.text_color}20` }}>
                <video
                  ref={videoRef}
                  src={profile.avatar_video_url!}
                  className="object-cover"
                  style={profile.avatar_video_crop ? {
                    width: `${100 / (profile.avatar_video_crop.width / 100)}%`,
                    height: `${100 / (profile.avatar_video_crop.height / 100)}%`,
                    marginLeft: `-${profile.avatar_video_crop.x / (profile.avatar_video_crop.width / 100)}%`,
                    marginTop: `-${profile.avatar_video_crop.y / (profile.avatar_video_crop.height / 100)}%`,
                  } : { width: '100%', height: '100%' }}
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              </div>
            ) : (
              <Avatar className={cn("border-2 shadow-lg", isDesktop ? "h-[107px] w-[107px] mt-1" : "h-[96px] w-[96px] sm:h-[107px] sm:w-[107px]")} style={{ borderColor: `${theme.text_color}20` }}>
                <AvatarImage 
                  src={profile.avatar_url || undefined} 
                  className="object-cover"
                  style={{ imageRendering: 'auto' }}
                />
                <AvatarFallback className="text-2xl sm:text-3xl font-semibold" style={{ backgroundColor: theme.button_color, color: theme.button_text_color }}>{profile.title?.charAt(0)?.toUpperCase() || "?"}</AvatarFallback>
              </Avatar>
            )
          )}
          {data.show_name !== false && profile.title && (
            <h1 className={cn("font-bold text-center", isDesktop ? "text-[31px]" : "text-[27px] sm:text-[31px]")} style={{ color: theme.text_color }}>{profile.title}</h1>
          )}
          {data.show_bio !== false && profile.bio && (
            <p className="text-sm sm:text-base text-center leading-relaxed max-w-sm mx-auto" style={{ color: theme.secondary_text_color || `${theme.text_color}cc` }}>{profile.bio}</p>
          )}
        </div>
      )
    }

    case "social_row": {
      const data = (block.data || { platforms: [], style: "icons" }) as SocialRowBlockData
      const headerLayout = (theme as any).header_layout || "classic"
      const isHeroLayout = headerLayout === "hero"
      
      if (!data.platforms || data.platforms.length === 0) {
        const defaultLinks = []
        if (profile.social_links?.instagram) defaultLinks.push({ platform: "instagram" as const, url: profile.social_links.instagram })
        if (profile.social_links?.tiktok) defaultLinks.push({ platform: "tiktok" as const, url: profile.social_links.tiktok })
        if (profile.social_links?.youtube) defaultLinks.push({ platform: "youtube" as const, url: profile.social_links.youtube })
        if (profile.social_links?.twitter) defaultLinks.push({ platform: "twitter" as const, url: profile.social_links.twitter })
        if (profile.social_links?.spotify) defaultLinks.push({ platform: "spotify" as const, url: profile.social_links.spotify })
        if (defaultLinks.length === 0) return null
        data.platforms = defaultLinks
      }
      
      // Hero layout: move icons up more, Classic: add 2px padding top/bottom
      const layoutStyles = isHeroLayout ? "mt-[-100px] mb-[4px]" : "mt-[2px] mb-[2px]"

      return (
        <div className={cn("flex items-center justify-center gap-2 flex-wrap", layoutStyles)}>
          {data.platforms.map(({ platform, url }) => {
            const Icon = SocialIconsSVG[platform]
            if (!Icon || !url) return null
            return (
              <a
                key={platform}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackClick(block.id, url)}
                className={cn(
                  "flex items-center justify-center transition-all hover:scale-110",
                  socialStyle === "filled" && "w-10 h-10 sm:w-11 sm:h-11 rounded-full",
                  socialStyle === "outline" && "w-10 h-10 sm:w-11 sm:h-11 rounded-full border-2",
                  socialStyle === "minimal" && "p-2"
                )}
                style={{
                  backgroundColor: socialStyle === "filled" ? `${socialColor}20` : "transparent",
                  borderColor: socialStyle === "outline" ? `${socialColor}40` : "transparent",
                }}
              >
                <Icon size={20} color={socialColor} />
              </a>
            )
          })}
        </div>
      )
    }

    case "link_button": {
      const data = (block.data || { label: "", url: "" }) as LinkButtonBlockData
      if (!data.url) return null
      
      const buttonStyles: React.CSSProperties = {
        backgroundColor: theme.button_style === "filled" ? theme.button_color : theme.button_style === "glass" ? `${theme.button_color}` : "transparent",
        color: theme.button_text_color,
        borderRadius: `${theme.button_border_radius}px`,
        borderWidth: theme.button_style === "outline" ? `${theme.button_border_width || 2}px` : theme.button_style === "glass" ? "1px" : "0",
        borderColor: theme.button_style === "outline" ? theme.button_border_color : theme.button_style === "glass" ? `${theme.button_text_color}30` : "transparent",
        borderStyle: "solid",
        backdropFilter: theme.button_style === "glass" ? "blur(10px)" : "none",
      }

      return (
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackClick(block.id, data.url)}
          className="w-full flex items-center justify-center gap-3 py-3.5 sm:py-4 px-5 sm:px-6 font-medium text-sm sm:text-base transition-all hover:opacity-90 hover:scale-[1.02]"
          style={buttonStyles}
        >
          {data.thumbnail_url && (
            <img src={data.thumbnail_url} alt="" className="w-6 h-6 sm:w-7 sm:h-7 rounded object-cover" />
          )}
          {data.label || "Link"}
        </a>
      )
    }

    case "text": {
      const data = (block.data || { content: "", alignment: "center" }) as TextBlockData
      return (
        <p 
          className={cn("text-sm sm:text-base leading-relaxed w-full", data.alignment === "left" ? "text-left" : data.alignment === "right" ? "text-right" : "text-center")} 
          style={{ color: theme.secondary_text_color || theme.text_color }}
        >
          {data.content}
        </p>
      )
    }

    case "divider": {
      const data = (block.data || { style: "space", height: 24 }) as DividerBlockData
      if (data.style === "line") {
        return <div className="w-full" style={{ height: "1px", backgroundColor: `${theme.text_color}20` }} />
      }
      if (data.style === "dots") {
        return (
          <div className="flex items-center justify-center gap-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: `${theme.text_color}40` }} />
            ))}
          </div>
        )
      }
      return <div style={{ height: `${data.height}px` }} />
    }

    case "image": {
      const data = (block.data || { image_url: "" }) as ImageBlockData
      if (!data.image_url) return null
      
      const aspectRatioClass = data.aspect_ratio === "square" ? "aspect-square" : data.aspect_ratio === "video" ? "aspect-video" : data.aspect_ratio === "wide" ? "aspect-[2/1]" : ""
      
      const imageContent = (
        <div className={cn("w-full overflow-hidden rounded-xl sm:rounded-2xl", aspectRatioClass)}>
          <img 
            src={data.image_url} 
            alt={data.alt_text || ""} 
            className={cn("w-full", aspectRatioClass ? "h-full object-cover" : "h-auto")}
            loading="lazy"
          />
        </div>
      )

      if (data.link_url) {
        return (
          <a href={data.link_url} target="_blank" rel="noopener noreferrer" onClick={() => trackClick(block.id, data.link_url!)} className="w-full block hover:opacity-90 transition-opacity">
            {imageContent}
          </a>
        )
      }
      return imageContent
    }

    case "email_capture": {
      const data = (block.data || { headline: "Subscribe", placeholder: "Email", button_text: "Join", success_message: "Thanks!" }) as EmailCaptureBlockData
      
      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email || isSubmitting) return
        setIsSubmitting(true)
        
        try {
          const response = await fetch("/api/onepage/leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ onepage_id: onepageId, email, block_id: block.id, lead_magnet_id: data.lead_magnet_id })
          })
          if (response.ok) setEmailSubmitted(true)
        } catch (error) {
          console.error("Submit error:", error)
        } finally {
          setIsSubmitting(false)
        }
      }

      if (emailSubmitted) {
        return (
          <div className="w-full p-5 sm:p-6 rounded-xl sm:rounded-2xl text-center" style={{ backgroundColor: `${theme.button_color}15` }}>
            <p className="font-medium" style={{ color: theme.text_color }}>{data.success_message || "Thanks for subscribing!"}</p>
          </div>
        )
      }

      return (
        <div className="w-full p-5 sm:p-6 rounded-xl sm:rounded-2xl" style={{ backgroundColor: `${theme.button_color}10` }}>
          <h3 className="text-base sm:text-lg font-semibold text-center mb-1" style={{ color: theme.text_color }}>{data.headline}</h3>
          {data.description && (
            <p className="text-xs sm:text-sm text-center mb-4" style={{ color: theme.secondary_text_color || theme.text_color }}>{data.description}</p>
          )}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={data.placeholder || "Enter your email"}
              required
              className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-sm bg-white/90 border-0 outline-none focus:ring-2 focus:ring-offset-1"
              style={{ color: "#000" }}
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: theme.button_color, color: theme.button_text_color }}
            >
              {isSubmitting ? "..." : data.button_text || "Subscribe"}
            </button>
          </form>
        </div>
      )
    }

    default:
      return null
  }
}
