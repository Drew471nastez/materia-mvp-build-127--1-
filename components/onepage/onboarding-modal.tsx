"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useOnePage } from "@/lib/onepage/context"
import { createClient } from "@/lib/supabase/client"
import {
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Instagram,
  Youtube,
  Loader2,
  Pencil
} from "lucide-react"

// Storelib logo SVG component - inlined for instant loading
const StorelibLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="Storelib">
    <path d="M0 0 C1.25598999 -0.00852997 2.51197998 -0.01705994 3.80603027 -0.02584839 C5.19036878 -0.02514942 6.57470719 -0.02422639 7.95904541 -0.02310181 C9.42299746 -0.02908898 10.88694635 -0.03589496 12.35089111 -0.04345703 C16.32216398 -0.06110767 20.29335063 -0.06581209 24.26465893 -0.0670886 C26.7484317 -0.06851159 29.23218266 -0.07278404 31.71595001 -0.07808304 C40.3887928 -0.09658205 49.06157417 -0.10475404 57.73443604 -0.10317993 C65.80571415 -0.1019794 73.87672448 -0.1230646 81.94793487 -0.15466726 C88.88740979 -0.18086566 95.82679746 -0.1915457 102.76632142 -0.19026911 C106.90650235 -0.18976041 111.04644538 -0.19539209 115.18657684 -0.21662521 C119.08386362 -0.23606723 122.98068708 -0.2360918 126.87799072 -0.22159195 C128.3029473 -0.21950992 129.72793332 -0.22416847 131.15283966 -0.23631287 C141.09680252 -0.31552915 147.72066213 0.96939458 156.01470947 6.39242554 C164.00844081 14.7495083 164.48967637 23.75783423 164.39581299 34.77963257 C164.40096022 36.32476622 164.40824753 37.86989399 164.41749573 39.41500854 C164.43591288 43.58446598 164.42313434 47.75327889 164.40340543 51.92270899 C164.38694289 56.29916711 164.39584208 60.67558686 164.40092468 65.05206299 C164.40543622 72.39722923 164.38963191 79.74214002 164.3616333 87.08724976 C164.32956172 95.56596535 164.32960943 104.04422102 164.34684807 112.52296937 C164.36273668 120.69971652 164.35596615 128.87629588 164.33891106 137.05303574 C164.33205827 140.52416353 164.33305464 143.99515609 164.34045601 147.46628189 C164.34814329 151.55574766 164.33591375 155.64469271 164.3086071 159.73406982 C164.30174858 161.23038055 164.30159802 162.72674016 164.30882263 164.22304916 C164.34272151 172.16130636 164.16638678 178.42591425 159.76470947 185.26742554 C159.22845947 186.15430054 158.69220947 187.04117554 158.13970947 187.95492554 C152.43571606 193.50881386 144.75237362 196.38313512 136.89727783 196.41459656 C135.67216995 196.42175186 134.44706207 196.42890717 133.18482971 196.4362793 C131.8247378 196.43911959 130.46464562 196.44183131 129.10455322 196.44442749 C127.67369929 196.45069344 126.24284699 196.45734036 124.81199646 196.46434021 C120.10874564 196.48537739 115.40549454 196.49574619 110.70220947 196.50570679 C109.0806883 196.50975527 107.45916731 196.51387222 105.83764648 196.51805687 C98.21463332 196.53711229 90.59162982 196.55133937 82.96859741 196.55966884 C74.18508474 196.56942573 65.40182511 196.59570309 56.61840153 196.63616973 C49.82077103 196.66640598 43.02321272 196.68114504 36.22551632 196.68444985 C32.17017831 196.68679292 28.1151105 196.69565491 24.05984497 196.72091103 C20.23810795 196.74432693 16.41681639 196.74837134 12.59502602 196.73814964 C11.19992904 196.73765734 9.80480913 196.7438867 8.4097805 196.75770569 C-1.41657181 196.84951715 -9.61649844 195.68755985 -18.11029053 190.51742554 C-27.18735637 180.90641464 -27.53411292 170.57341229 -27.49407959 157.91610718 C-27.49679343 156.4714185 -27.50035657 155.02673121 -27.50469971 153.58204651 C-27.51378005 149.67704699 -27.51029729 145.77215372 -27.50394154 141.86715245 C-27.49885795 137.76875741 -27.50357962 133.67037113 -27.50671387 129.57197571 C-27.51034706 122.68992489 -27.50557183 115.80791708 -27.49603271 108.9258728 C-27.48515374 100.98582544 -27.4886723 93.04588084 -27.49968553 85.10583597 C-27.50878201 78.27246064 -27.51003202 71.43911611 -27.50480819 64.60573667 C-27.5017009 60.53163085 -27.50124478 56.45757321 -27.50788116 52.38347054 C-27.51368829 48.55108556 -27.50959658 44.71883213 -27.49809265 40.88646126 C-27.4954638 39.48569964 -27.49618056 38.08492682 -27.50061798 36.68416977 C-27.53530251 24.61619513 -27.10564593 15.19154067 -18.23529053 6.26742554 C-15.93480906 4.53840125 -13.88377264 3.49357466 -11.23529053 2.26742554 C-10.46928402 1.91071463 -9.70327751 1.55400372 -8.91405869 1.18648338 C-5.79872006 0.11764269 -3.29228243 0.01012495 0 0 Z" fill="#8B56FA" transform="translate(31.235,1.733)"/>
    <path d="M0 0 C0.99749268 0.36665771 0.99749268 0.36665771 2.01513672 0.74072266 C6.62777473 2.59663113 6.62777473 2.59663113 7.68823242 4.86303711 C7.94652165 7.99120666 7.02705902 10.04467511 5.85546875 12.94921875 C5.41009766 14.05974609 4.96472656 15.17027344 4.50585938 16.31445312 C4.02955078 17.46880859 3.55324219 18.62316406 3.0625 19.8125 C2.59779297 20.97845703 2.13308594 22.14441406 1.65429688 23.34570312 C-1.85471661 31.98985831 -1.85471661 31.98985831 -4.125 33.125 C-6.02961204 32.43054915 -7.90085447 31.64344514 -9.75 30.8125 C-19.66422998 26.58368153 -27.26609106 25.85047702 -38.125 26.125 C-38.455 27.115 -38.785 28.105 -39.125 29.125 C-38.14402344 29.36734375 -37.16304687 29.6096875 -36.15234375 29.859375 C-33.31305776 30.56236873 -30.47635159 31.27497918 -27.640625 31.9921875 C-24.80213536 32.70970135 -21.95989766 33.40235421 -19.109375 34.0703125 C-6.69949938 37.1089446 3.02755655 40.84926977 9.875 52.125 C13.29151905 58.95803811 12.61307566 67.23479967 10.625 74.4375 C7.53029491 83.45189328 1.37513276 90.18616729 -7.02734375 94.67578125 C-26.20884362 103.04454374 -49.04415352 101.90170642 -68.5 94.625 C-72.25964144 93.07749587 -75.67848864 91.2806362 -79.125 89.125 C-78.55593823 84.90468545 -77.56543969 81.39586411 -75.83984375 77.5078125 C-75.39189453 76.48945313 -74.94394531 75.47109375 -74.48242188 74.421875 C-73.77956055 72.85179688 -73.77956055 72.85179688 -73.0625 71.25 C-72.59005859 70.18007812 -72.11761719 69.11015625 -71.63085938 68.0078125 C-70.46832699 65.3774362 -69.29955398 62.75002483 -68.125 60.125 C-63.80181734 61.13483216 -60.07150265 62.96083682 -56.07421875 64.87109375 C-49.32009515 67.74271451 -43.48344492 68.41757298 -36.25 68.3125 C-35.38375 68.31185547 -34.5175 68.31121094 -33.625 68.31054688 C-29.55080641 68.64235092 -29.55080641 68.64235092 -26.125 67.125 C-32.43853708 64.84703882 -38.66045093 62.93279428 -45.25 61.625 C-56.73505022 59.25968679 -67.31315991 55.21661495 -74.125 45.125 C-77.1608836 40.09281577 -77.67121961 36.10082917 -77.625 30.375 C-77.62072998 29.57876221 -77.61645996 28.78252441 -77.61206055 27.9621582 C-77.37730644 19.82208022 -74.95520496 14.3797357 -69.625 8.25 C-68.8 7.54875 -67.975 6.8475 -67.125 6.125 C-66.403125 5.465 -65.68125 4.805 -64.9375 4.125 C-46.69751714 -8.84565448 -20.22397968 -7.61423584 0 0 Z" fill="#FDFDFF" transform="translate(134.125,52.875)"/>
  </svg>
)

// Goal icon image URLs
const GOAL_ICON_URLS = {
  general: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20de121sign.svg",
  artist: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/12115.svg",
  digital: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/12551.svg",
  business: "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/53112.svg",
}

// Theme templates - exact copy from design-tab.tsx
const THEME_TEMPLATES = [
  {
    id: "default",
    name: "Default",
    category: "light",
    isDefault: true,
    theme_config: {
      background_type: "solid" as const,
      background_color: "#ffffff",
      background_gradient: "",
      background_image_url: "",
      text_color: "#000000",
      secondary_text_color: "#000000",
      button_color: "#000000",
      button_text_color: "#ffffff",
      button_style: "filled" as const,
      button_border_radius: 8,
      button_border_width: 0,
      button_border_color: "#000000",
      button_shadow: "subtle",
      font_family: "'Inter', sans-serif",
      title_font: "'Inter', sans-serif",
      title_color: "#000000",
      social_icon_color: "#000000",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      background_pattern: "none",
      laser_glow_enabled: false,
    },
    profile_layout: "classic" as const,
    skipLayoutDialog: true,
    share_style: "white",
    subscribe_style: "white",
    light_button_text_color: "#000000",
  },
  {
    id: "air",
    name: "Air",
    category: "light",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#f8fafc",
      background_gradient: "",
      background_image_url: "",
      text_color: "#0f172a",
      secondary_text_color: "#64748b",
      button_color: "#0f172a",
      button_text_color: "#ffffff",
      button_style: "filled" as const,
      button_border_radius: 8,
      button_border_width: 0,
      button_border_color: "#0f172a",
      button_shadow: "subtle",
      font_family: "'Inter', sans-serif",
      title_font: "'Inter', sans-serif",
      title_color: "#0f172a",
      social_icon_color: "#64748b",
      spacing: "normal" as const,
      card_width: "standard" as const,
      laser_glow_enabled: true,
      laser_glow_color: "#dbdbdb",
      laser_glow_intensity: "medium",
    },
    light_button_text_color: "#0f172a",
    share_style: "white",
    subscribe_style: "white",
  },
  {
    id: "astrid",
    name: "Astrid",
    category: "dark",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#0a0a0a",
      background_gradient: "",
      background_image_url: "",
      text_color: "#ffffff",
      secondary_text_color: "#a1a1aa",
      button_color: "#27272a",
      button_text_color: "#ffffff",
      button_style: "filled" as const,
      button_border_radius: 12,
      button_border_width: 1,
      button_border_color: "#3f3f46",
      button_shadow: "none",
      font_family: "'Inter', sans-serif",
      title_font: "'Montserrat', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#a1a1aa",
      spacing: "normal" as const,
      card_width: "standard" as const,
      laser_glow_enabled: true,
      laser_glow_color: "#303030",
      laser_glow_intensity: "medium",
    },
    share_style: "glassmorphism",
    subscribe_style: "glassmorphism",
  },
  {
    id: "blocks",
    name: "Blocks",
    category: "gradient",
    theme_config: {
      background_type: "gradient" as const,
      background_color: "#7c3aed",
      background_gradient: "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%)",
      background_image_url: "",
      text_color: "#ffffff",
      secondary_text_color: "#e9d5ff",
      button_color: "#ffffff",
      button_text_color: "#7c3aed",
      button_style: "filled" as const,
      button_border_radius: 12,
      button_border_width: 0,
      button_border_color: "#ffffff",
      button_shadow: "hard",
      button_shadow_color: "#6a197b",
      font_family: "'Poppins', sans-serif",
      title_font: "'Poppins', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#ffffff",
      social_icon_style: "filled",
      spacing: "normal" as const,
      card_width: "standard" as const,
      laser_glow_enabled: false,
      background_pattern: "grid",
      pattern_opacity: "low",
      pattern_color: "#c9c9c990",
    },
    solid_button_text_color: "#7c3aed",
    outline_button_text_color: "#ffffff",
    glass_button_text_color: "#ffffff",
    share_style: "white",
    subscribe_style: "white",
  },
  {
    id: "ocean",
    name: "Ocean",
    category: "gradient",
    theme_config: {
      background_type: "gradient" as const,
      background_color: "#0ea5e9",
      background_gradient: "linear-gradient(180deg, #0c4a6e 0%, #0369a1 50%, #0ea5e9 100%)",
      background_image_url: "",
      text_color: "#ffffff",
      secondary_text_color: "#bae6fd",
      button_color: "rgba(255, 255, 255, 0.15)",
      button_text_color: "#ffffff",
      button_style: "glass" as const,
      button_border_radius: 24,
      button_border_width: 1,
      button_border_color: "rgba(255, 255, 255, 0.2)",
      button_shadow: "subtle",
      font_family: "'Nunito', sans-serif",
      title_font: "'Nunito', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#bae6fd",
      social_icon_style: "outline",
      spacing: "normal" as const,
      card_width: "standard" as const,
      background_pattern: "waves",
      pattern_opacity: "low",
      pattern_color: "#428ad790",
    },
    share_style: "white",
    subscribe_style: "white",
  },
  {
    id: "sunset",
    name: "Sunset",
    category: "gradient",
    theme_config: {
      background_type: "gradient" as const,
      background_color: "#f97316",
      background_gradient: "linear-gradient(135deg, #f97316 0%, #ef4444 50%, #ec4899 100%)",
      background_image_url: "",
      text_color: "#ffffff",
      secondary_text_color: "#fed7aa",
      button_color: "#ffffff",
      button_text_color: "#ea580c",
      button_style: "filled" as const,
      button_border_radius: 16,
      button_border_width: 0,
      button_border_color: "#ffffff",
      button_shadow: "strong",
      font_family: "'Poppins', sans-serif",
      title_font: "'Playfair Display', serif",
      title_color: "#ffffff",
      social_icon_color: "#ffffff",
      social_icon_style: "filled",
      spacing: "normal" as const,
      card_width: "standard" as const,
      background_pattern: "organic",
      pattern_opacity: "low",
      pattern_color: "#ffcccc90",
    },
    share_style: "white",
    subscribe_style: "white",
    solid_button_text_color: "#ea580c",
    outline_button_text_color: "#ffffff",
    glass_button_text_color: "#ffffff",
  },
  {
    id: "midnight",
    name: "Midnight",
    category: "dark",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#020617",
      background_gradient: "",
      background_image_url: "",
      text_color: "#f8fafc",
      secondary_text_color: "#94a3b8",
      button_color: "rgba(255, 255, 255, 0.1)",
      button_text_color: "#ffffff",
      button_style: "glass" as const,
      button_border_radius: 10,
      button_border_width: 1,
      button_border_color: "#182b49",
      button_shadow: "subtle",
      font_family: "'Inter', sans-serif",
      title_font: "'Oswald', sans-serif",
      title_color: "#f8fafc",
      social_icon_color: "#3b82f6",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "hero",
      laser_glow_enabled: false,
      button_hover_animation: "zoom",
      allowed_patterns: ["none", "stars"],
      background_pattern: "stars",
      pattern_color: "#ffffff",
      pattern_opacity: "medium",
    },
    profile_layout: "hero" as const,
    share_style: "glassmorphism",
    subscribe_style: "glassmorphism",
  },
  {
    id: "cream",
    name: "Cream",
    category: "light",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#fffbeb",
      background_gradient: "",
      background_image_url: "",
      text_color: "#1c1917",
      secondary_text_color: "#78716c",
      button_color: "#1c1917",
      button_text_color: "#fffbeb",
      button_style: "outline" as const,
      button_border_radius: 24,
      button_border_width: 2,
      button_border_color: "#1c1917",
      button_shadow: "none",
      font_family: "'Lora', serif",
      title_font: "'Playfair Display', serif",
      title_color: "#362f2b",
      social_icon_color: "#78716c",
      social_icon_style: "filled",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
      laser_glow_enabled: false,
      background_pattern: "zigzag",
      pattern_color: "#e2dc9c90",
      pattern_opacity: "low",
    },
    profile_layout: "classic" as const,
    share_style: "black",
    subscribe_style: "black",
    outline_button_text_color: "#363221",
    solid_button_text_color: "#fffcf0",
    glass_button_text_color: "#37342a",
  },
  {
    id: "space",
    name: "Space",
    category: "dark",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#000000",
      background_gradient: "",
      background_image_url: "",
      text_color: "#ffffff",
      secondary_text_color: "#a1a1aa",
      button_color: "rgba(255, 255, 255, 0.1)",
      button_text_color: "#ffffff",
      button_style: "glass" as const,
      button_border_radius: 12,
      button_border_width: 1,
      button_border_color: "rgba(255, 255, 255, 0.2)",
      button_shadow: "none",
      font_family: "'Space Grotesk', sans-serif",
      title_font: "'Space Grotesk', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#ffffff",
      social_icon_style: "filled",
      background_pattern: "stars",
      pattern_color: "#ffffff",
      pattern_opacity: "high",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "classic",
    },
    profile_layout: "classic" as const,
    share_style: "black",
    subscribe_style: "black",
  },
  {
    id: "aurora",
    name: "Aurora",
    category: "gradient",
    theme_config: {
      background_type: "gradient" as const,
      background_color: "#0f0f23",
      background_gradient: "linear-gradient(135deg, #0f0f23 0%, #1a1a3e 25%, #2d1b4e 50%, #1e3a5f 75%, #0f0f23 100%)",
      background_image_url: "",
      text_color: "#ffffff",
      secondary_text_color: "#94a3b8",
      button_color: "rgba(139, 92, 246, 0.3)",
      button_text_color: "#ffffff",
      button_style: "glass" as const,
      button_border_radius: 16,
      button_border_width: 1,
      button_border_color: "rgba(139, 92, 246, 0.5)",
      button_shadow: "none",
      font_family: "'Space Grotesk', sans-serif",
      title_font: "'Space Grotesk', sans-serif",
      title_color: "#ffffff",
      social_icon_color: "#a78bfa",
      background_pattern: "morph",
      pattern_color: "#ffffff90",
      spacing: "normal" as const,
      card_width: "standard" as const,
      animated_gradient: false,
    },
  },
  {
    id: "neon",
    name: "Neon",
    category: "dark",
    theme_config: {
      background_type: "solid" as const,
      background_color: "#09090b",
      background_gradient: "",
      background_image_url: "",
      text_color: "#fafafa",
      secondary_text_color: "#a1a1aa",
      button_color: "#18181b",
      button_text_color: "#22d3ee",
      button_style: "glass" as const,
      button_border_radius: 10,
      button_border_width: 1,
      button_border_color: "#22d3ee",
      button_shadow: "strong",
      button_shadow_color: "#ffffff",
      font_family: "'JetBrains Mono', monospace",
      title_font: "'Orbitron', sans-serif",
      title_color: "#22d3ee",
      social_icon_color: "#22d3ee",
      spacing: "normal" as const,
      card_width: "standard" as const,
      header_layout: "hero",
      background_pattern: "none",
    },
    profile_layout: "hero" as const,
    share_style: "glassmorphism",
    subscribe_style: "glassmorphism",
  },
  {
    id: "nature",
    name: "Nature",
    category: "image",
    theme_config: {
      background_type: "image" as const,
      background_color: "#1a2e1a",
      background_gradient: "",
      background_image_url: "https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?w=1920&q=95",
      text_color: "#ffffff",
      secondary_text_color: "#d1fae5",
      button_color: "rgba(255, 255, 255, 0.9)",
      button_text_color: "#065f46",
      button_style: "filled" as const,
      button_border_radius: 24,
      button_border_width: 0,
      button_border_color: "#ffffff",
      button_shadow: "subtle",
      font_family: "'Nunito', sans-serif",
      title_font: "'Lora', serif",
      title_color: "#ffffff",
      social_icon_color: "#d1fae5",
      spacing: "normal" as const,
      card_width: "standard" as const,
      image_brightness: 40,
      image_noise: true,
      noise_strength: 30,
    },
  },
]

// TikTok icon component
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
  </svg>
)

// Confetti animation component - with proper cleanup to prevent random appearances
function Confetti({ show }: { show: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationIdRef = useRef<number | null>(null)
  const hasAnimatedRef = useRef(false)

  useEffect(() => {
    // Only run animation once per show=true transition
    // This prevents re-running on component re-renders
    if (!show) {
      hasAnimatedRef.current = false
      // Clean up canvas if it exists
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d")
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        }
      }
      return
    }

    // Prevent duplicate animations
    if (hasAnimatedRef.current) return
    hasAnimatedRef.current = true

    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const colors = ["#ff6b6b", "#4ecdc4", "#ffe66d", "#a78bfa", "#f472b6", "#34d399", "#60a5fa", "#fbbf24", "#8b5cf6", "#ec4899"]
    const confettiPieces: Array<{
      x: number
      y: number
      rotation: number
      color: string
      size: number
      speedX: number
      speedY: number
      rotationSpeed: number
      shape: "rect" | "circle"
      opacity: number
    }> = []

    // Create confetti from left and right - more pieces for visibility
    for (let i = 0; i < 280; i++) {
      const fromLeft = i % 2 === 0
      confettiPieces.push({
        x: fromLeft ? -20 : canvas.width + 20,
        y: Math.random() * canvas.height * 0.5,
        rotation: Math.random() * 360,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 12 + 6, // Slightly larger pieces
        speedX: (fromLeft ? 1 : -1) * (Math.random() * 10 + 5),
        speedY: Math.random() * 4 - 2,
        rotationSpeed: Math.random() * 10 - 5,
        shape: Math.random() > 0.5 ? "rect" : "circle",
        opacity: 1,
      })
    }

    let frame = 0
    const maxFrames = 390 // 6.5 seconds at 60fps (1 second longer)

    const animate = () => {
      if (frame >= maxFrames) {
        if (animationIdRef.current) {
          cancelAnimationFrame(animationIdRef.current)
          animationIdRef.current = null
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        return
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      confettiPieces.forEach((piece) => {
        // Fade out in last 60 frames
        const fadeStart = maxFrames - 60
        if (frame > fadeStart) {
          piece.opacity = 1 - (frame - fadeStart) / 60
        }

        ctx.save()
        ctx.globalAlpha = piece.opacity
        ctx.translate(piece.x, piece.y)
        ctx.rotate((piece.rotation * Math.PI) / 180)
        ctx.fillStyle = piece.color

        if (piece.shape === "rect") {
          ctx.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2)
        } else {
          ctx.beginPath()
          ctx.arc(0, 0, piece.size / 3, 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.restore()

        // Update position with smoother animation
        piece.x += piece.speedX * (frame < 90 ? 1 : 0.97)
        piece.y += piece.speedY
        piece.speedY += 0.12 // gentler gravity
        piece.speedX *= 0.995 // gentler air resistance
        piece.rotation += piece.rotationSpeed
      })

      frame++
      animationIdRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
        animationIdRef.current = null
      }
      // Clear canvas on cleanup
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }
  }, [show])

  // Don't render anything if not showing
  if (!show) return null

  // Use portal to render at document body level, above all dialogs
  if (typeof document === "undefined") return null

  return createPortal(
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{
        width: "100vw",
        height: "100vh",
        zIndex: 2147483647, // Maximum z-index value
      }}
    />,
    document.body
  )
}

interface OnboardingModalProps {
  open: boolean
  onClose: () => void
  onComplete: (data: OnboardingData) => void
}

interface OnboardingData {
  displayName: string
  bio: string
  slug: string
  goal: "general" | "artist" | "digital" | "business"
  socials: {
    instagram: string
    tiktok: string
    youtube: string
  }
  avatarUrl: string | null
  templateId: string
}

// LocalStorage key for saving onboarding progress
const ONBOARDING_STORAGE_KEY = "onepage_onboarding_progress"

interface OnboardingProgress {
  step: number
  displayName: string
  bio: string
  selectedGoal: "general" | "artist" | "digital" | "business" | null
  socials: { instagram: string; tiktok: string; youtube: string }
  avatarUrl: string | null
  selectedTemplate: string
  onepageId: string
}

export function OnboardingModal({ open, onClose, onComplete }: OnboardingModalProps) {
  const { onepage, updateProfile, updateTheme, updateSocialLinks, addBlock, updateBlock, removeBlock, save } = useOnePage()

  // Load saved progress from localStorage
  const getSavedProgress = useCallback((): OnboardingProgress | null => {
    if (typeof window === "undefined") return null
    try {
      const saved = localStorage.getItem(ONBOARDING_STORAGE_KEY)
      if (!saved) return null
      const progress = JSON.parse(saved) as OnboardingProgress
      // Only use saved progress if it's for the same onepage
      if (progress.onepageId !== onepage?.id) return null
      return progress
    } catch {
      return null
    }
  }, [onepage?.id])

  // Initialize step from saved progress or default to 1
  const [currentStep, setCurrentStep] = useState(() => {
    if (typeof window === "undefined") return 1
    try {
      const saved = localStorage.getItem(ONBOARDING_STORAGE_KEY)
      if (!saved) return 1
      const progress = JSON.parse(saved) as OnboardingProgress
      return progress?.step || 1
    } catch {
      return 1
    }
  })
  const [isAnimating, setIsAnimating] = useState(false)
  const [slideDirection, setSlideDirection] = useState<"left" | "right">("right")

  // Step 1 state - initialize from saved progress
  const [displayName, setDisplayName] = useState(() => {
    if (typeof window === "undefined") return ""
    try {
      const saved = localStorage.getItem(ONBOARDING_STORAGE_KEY)
      if (!saved) return ""
      const progress = JSON.parse(saved) as OnboardingProgress
      return progress?.displayName || ""
    } catch {
      return ""
    }
  })
  const [bio, setBio] = useState(() => {
    if (typeof window === "undefined") return ""
    try {
      const saved = localStorage.getItem(ONBOARDING_STORAGE_KEY)
      if (!saved) return ""
      const progress = JSON.parse(saved) as OnboardingProgress
      return progress?.bio || ""
    } catch {
      return ""
    }
  })
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [usernameFocused, setUsernameFocused] = useState(false)

  // Step 2 state - initialize from saved progress
  const [selectedGoal, setSelectedGoal] = useState<"general" | "artist" | "digital" | "business" | null>(() => {
    const saved = getSavedProgress()
    return saved?.selectedGoal || null
  })
  const [loadedGoalIcons, setLoadedGoalIcons] = useState<Set<string>>(new Set())

  // Step 3 state - initialize from saved progress
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    const saved = getSavedProgress()
    return saved?.avatarUrl || null
  })
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [showCropModal, setShowCropModal] = useState(false)
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null)
  const [socials, setSocials] = useState(() => {
    const saved = getSavedProgress()
    return saved?.socials || { instagram: "", tiktok: "", youtube: "" }
  })
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Step 4 state - initialize from saved progress
  const [selectedTemplate, setSelectedTemplate] = useState(() => {
    const saved = getSavedProgress()
    return saved?.selectedTemplate || "default"
  })
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [carouselAnimating, setCarouselAnimating] = useState(false)
  const [carouselDirection, setCarouselDirection] = useState<"left" | "right">("right")

  // Step 5 state
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [setupPhase, setSetupPhase] = useState<"setting-up" | "just-a-moment" | null>(null)
  const [setupComplete, setSetupComplete] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)

  // Track if setup has already run (prevents double execution)
  const hasCompletedRef = useRef(false)

  // Save progress to localStorage whenever relevant state changes
  const saveProgress = useCallback(() => {
    if (typeof window === "undefined" || !onepage?.id || currentStep >= 5) return
    try {
      const progress: OnboardingProgress = {
        step: currentStep,
        displayName,
        bio,
        selectedGoal,
        socials,
        avatarUrl,
        selectedTemplate,
        onepageId: onepage.id,
      }
      localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(progress))
    } catch (e) {
      console.error("Failed to save onboarding progress:", e)
    }
  }, [currentStep, displayName, bio, selectedGoal, socials, avatarUrl, selectedTemplate, onepage?.id])

  // Clear saved progress from localStorage
  const clearSavedProgress = useCallback(() => {
    if (typeof window === "undefined") return
    try {
      localStorage.removeItem(ONBOARDING_STORAGE_KEY)
    } catch (e) {
      console.error("Failed to clear onboarding progress:", e)
    }
  }, [])

  // Save progress when modal is open and state changes
  useEffect(() => {
    if (open && currentStep < 5) {
      saveProgress()
    }
  }, [open, currentStep, displayName, bio, selectedGoal, socials, avatarUrl, selectedTemplate, saveProgress])

  // Reset confetti when modal closes
  useEffect(() => {
    if (!open) {
      setShowConfetti(false)
    }
  }, [open])

  // Reset setup states when modal opens fresh
  useEffect(() => {
    if (open && !hasCompletedRef.current) {
      setSetupComplete(false)
      setIsSettingUp(false)
      setSetupPhase(null)
      setShowConfetti(false)
    }
  }, [open])

  // Crop state - square style like Links tab
  const [cropBox, setCropBox] = useState({ x: 50, y: 50, size: 200 })
  const [isDraggingCrop, setIsDraggingCrop] = useState(false)
  const [isResizingCrop, setIsResizingCrop] = useState(false)
  const [dragStartCrop, setDragStartCrop] = useState({ x: 0, y: 0 })
  const [imageSizeCrop, setImageSizeCrop] = useState({ width: 0, height: 0 })
  const cropContainerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const supabase = createClient()

  // Initialize with existing data from main onboarding
  // IMPORTANT: Fetch fresh data from database to ensure we have the latest info
  // from the main platform onboarding (which may have just completed)
  useEffect(() => {
    if (open && onepage) {
      const fetchAndPopulateData = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) return

          // Check if we have saved progress (for resuming onboarding)
          const savedProgress = getSavedProgress()
          
          // Fetch fresh onepage data from database to get latest social links
          // The context onepage may be stale if main onboarding just completed
          const { data: freshOnepage } = await supabase
            .from("onepages")
            .select("*, instagram, tiktok, youtube")
            .eq("owner_id", user.id)
            .single()

          // Fetch profile data for username and display_name
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name, username, avatar_url")
            .eq("id", user.id)
            .single()

          // Fetch creator data for bio
          const { data: creator } = await supabase
            .from("creators")
            .select("slug, bio")
            .eq("user_id", user.id)
            .maybeSingle()

          // If saved progress exists, use it for most fields BUT always use fresh DB data for socials
          if (savedProgress) {
            // Use saved progress for display name, bio, goal, template
            if (savedProgress.displayName) setDisplayName(savedProgress.displayName)
            if (savedProgress.bio) setBio(savedProgress.bio)
            if (savedProgress.selectedGoal) setSelectedGoal(savedProgress.selectedGoal)
            if (savedProgress.selectedTemplate) setSelectedTemplate(savedProgress.selectedTemplate)
            if (savedProgress.avatarUrl) setAvatarUrl(savedProgress.avatarUrl)
          } else {
            // No saved progress - use fresh database data
            // Determine the best display name to use
            // Priority: onepage.title > profile.display_name > profile.username > creator.slug
            let nameToUse = ""
            if (freshOnepage?.title) {
              nameToUse = freshOnepage.title
            } else if (profile?.display_name) {
              nameToUse = profile.display_name
            } else if (profile?.username) {
              nameToUse = profile.username
            } else if (creator?.slug) {
              nameToUse = creator.slug
            } else if (onepage.title) {
              nameToUse = onepage.title
            }
            setDisplayName(nameToUse)

            // Bio - prefer fresh onepage, then creator bio
            const bioToUse = freshOnepage?.bio || creator?.bio || onepage.bio || ""
            setBio(bioToUse)

            // Avatar - prefer fresh onepage, then profile avatar
            const avatarToUse = freshOnepage?.avatar_url || profile?.avatar_url || onepage.avatar_url || null
            setAvatarUrl(avatarToUse)
          }

          // ALWAYS fetch and populate social links from FRESH database data
          // This ensures socials from main platform onboarding are always loaded
          // Check BOTH direct database columns (instagram, tiktok, youtube) AND social_links object
          const rawFreshOnepage = freshOnepage as any
          const instagramRaw = rawFreshOnepage?.instagram || freshOnepage?.social_links?.instagram ||
                              (onepage as any).instagram || onepage.social_links?.instagram || ""
          const tiktokRaw = rawFreshOnepage?.tiktok || freshOnepage?.social_links?.tiktok ||
                           (onepage as any).tiktok || onepage.social_links?.tiktok || ""
          const youtubeRaw = rawFreshOnepage?.youtube || freshOnepage?.social_links?.youtube ||
                            (onepage as any).youtube || onepage.social_links?.youtube || ""

          // Extract Instagram username from URL like https://instagram.com/username
          let instagramValue = instagramRaw
          if (instagramValue && instagramValue.includes("instagram.com/")) {
            const match = instagramValue.match(/instagram\.com\/([^\/\?]+)/)
            if (match && match[1]) {
              instagramValue = `@${match[1].replace('@', '')}`
            }
          } else if (instagramValue && !instagramValue.startsWith("@") && !instagramValue.includes("://")) {
            // If it's just a username without @ prefix, add it
            instagramValue = `@${instagramValue}`
          }

          // Extract TikTok username from URL like https://tiktok.com/@username
          let tiktokValue = tiktokRaw
          if (tiktokValue && tiktokValue.includes("tiktok.com/")) {
            const match = tiktokValue.match(/tiktok\.com\/@?([^\/\?]+)/)
            if (match && match[1]) {
              tiktokValue = `@${match[1].replace('@', '')}`
            }
          } else if (tiktokValue && !tiktokValue.startsWith("@") && !tiktokValue.includes("://")) {
            // If it's just a username without @ prefix, add it
            tiktokValue = `@${tiktokValue}`
          }

          // YouTube can stay as full URL or channel name
          let youtubeValue = youtubeRaw

          // Only update socials if we got data from DB (don't overwrite with empty)
          if (instagramValue || tiktokValue || youtubeValue) {
            setSocials({
              instagram: instagramValue || "",
              tiktok: tiktokValue || "",
              youtube: youtubeValue || "",
            })
          }
        } catch (e) {
          console.error("Error fetching initial data:", e)
          // Fallback to context data if database fetch fails
          setDisplayName(onepage.title || "")
          setBio(onepage.bio || "")
          setAvatarUrl(onepage.avatar_url || null)
        }
      }

      fetchAndPopulateData()
    }
  }, [open, onepage])

  // Check username availability
  useEffect(() => {
    if (!displayName.trim()) {
      setUsernameAvailable(null)
      return
    }

    const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    if (!slug) {
      setUsernameAvailable(null)
      return
    }

    const checkAvailability = async () => {
      setCheckingUsername(true)
      try {
        const { data: existing } = await supabase
          .from("onepages")
          .select("id")
          .eq("slug", slug)
          .neq("id", onepage?.id || "")
          .single()

        setUsernameAvailable(!existing)
      } catch {
        setUsernameAvailable(true)
      } finally {
        setCheckingUsername(false)
      }
    }

    const timer = setTimeout(checkAvailability, 500)
    return () => clearTimeout(timer)
  }, [displayName, onepage?.id])

  // Handle avatar file selection
  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const url = URL.createObjectURL(file)
    setTempImageUrl(url)
    setAvatarFile(file)
    setShowCropModal(true)
  }

  // Handle crop completion - same as Links tab
  const handleCropComplete = async () => {
    if (!tempImageUrl || !canvasRef.current) return

    setUploadingAvatar(true)

    try {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No canvas context')

      // Output size (512x512 for crisp profile pictures)
      const outputSize = 512
      canvas.width = outputSize
      canvas.height = outputSize

      const img = new Image()
      img.crossOrigin = 'anonymous'

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = tempImageUrl
      })

      // Calculate source rectangle from crop box
      const nw = img.naturalWidth
      const nh = img.naturalHeight
      const scale = Math.min(300 / nw, 300 / nh)

      // Convert crop box coordinates back to original image coordinates
      const srcX = cropBox.x / scale
      const srcY = cropBox.y / scale
      const srcSize = cropBox.size / scale

      ctx.clearRect(0, 0, outputSize, outputSize)
      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, outputSize, outputSize)

      // Convert to blob and upload
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => b ? resolve(b) : reject(new Error('Failed to create blob')),
          'image/png',
          0.95
        )
      })

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const fileName = `onepage-avatar-${user.id}-${Date.now()}.png`
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, blob, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName)

      setAvatarUrl(publicUrl)
      setShowCropModal(false)
      if (tempImageUrl) URL.revokeObjectURL(tempImageUrl)
      setTempImageUrl(null)
      setAvatarFile(null)
      setCropBox({ x: 50, y: 50, size: 200 })
    } catch (e) {
      console.error("Error uploading avatar:", e)
      alert('Failed to upload image')
    } finally {
      setUploadingAvatar(false)
    }
  }

  // Get slug from display name
  const getSlug = () => {
    return displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  }

  // Check if can proceed to next step
  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return displayName.trim().length > 0 && usernameAvailable === true
      case 2:
        return selectedGoal !== null
      case 3:
        return true // Can skip
      case 4:
        return true // Template is always selected
      default:
        return false
    }
  }

  // Check if can skip
  const canSkip = () => {
    switch (currentStep) {
      case 1:
        return displayName.trim().length > 0 && usernameAvailable === true
      case 2:
        return false // Must select a goal
      case 3:
        return true // Can skip socials
      case 4:
        return false // Must select template (but always has default)
      default:
        return false
    }
  }

  // Handle next step
  const handleNext = () => {
    if (!canProceed()) return

    setSlideDirection("right")
    setIsAnimating(true)
    setTimeout(() => {
      if (currentStep < 4) {
        setCurrentStep(currentStep + 1)
      } else {
        startSetup()
      }
      setIsAnimating(false)
    }, 200)
  }

  // Handle back step
  const handleBack = () => {
    if (currentStep <= 1) return

    setSlideDirection("left")
    setIsAnimating(true)
    setTimeout(() => {
      setCurrentStep(currentStep - 1)
      setIsAnimating(false)
    }, 200)
  }

  // Handle skip
  const handleSkip = () => {
    if (!canSkip()) return
    handleNext()
  }

  // Start setup process
  const startSetup = async () => {
    // Prevent double execution
    if (hasCompletedRef.current) return

    setCurrentStep(5)
    setIsSettingUp(true)
    setSetupPhase("setting-up")

    // Clear saved progress since we're completing the onboarding
    clearSavedProgress()

    // Wait 6 seconds - "We're setting things up..."
    await new Promise((resolve) => setTimeout(resolve, 6000))

    // Change to "Just a moment..." phase
    setSetupPhase("just-a-moment")

    // Apply all changes
    try {
      // Update profile in context
      await updateProfile({
        title: displayName,
        bio: bio,
        avatar_url: avatarUrl,
      })

      // Build social links - convert @username to full URLs
      let instagramUrl = socials.instagram || null
      if (instagramUrl && instagramUrl.startsWith("@")) {
        instagramUrl = `https://instagram.com/${instagramUrl.replace("@", "")}`
      }
      let tiktokUrl = socials.tiktok || null
      if (tiktokUrl && tiktokUrl.startsWith("@")) {
        tiktokUrl = `https://tiktok.com/@${tiktokUrl.replace("@", "")}`
      }
      let youtubeUrl = socials.youtube || null
      if (youtubeUrl && !youtubeUrl.includes("://")) {
        youtubeUrl = `https://youtube.com/@${youtubeUrl.replace("@", "")}`
      }

      // Update social links in context
      const socialUpdates: Record<string, string | null> = {}
      if (instagramUrl) socialUpdates.instagram = instagramUrl
      if (tiktokUrl) socialUpdates.tiktok = tiktokUrl
      if (youtubeUrl) socialUpdates.youtube = youtubeUrl
      if (Object.keys(socialUpdates).length > 0) {
        await updateSocialLinks(socialUpdates)
      }

      // Apply theme with template_id so design tab shows correct selection
      const template = THEME_TEMPLATES.find((t) => t.id === selectedTemplate)
      if (template) {
        await updateTheme({
          ...template.theme_config,
          template_id: template.id,
        } as any)
      }

      // Create blocks based on goal
      await createBlocksForGoal(selectedGoal || "general")

      // IMPORTANT: Save everything directly to database (not just context)
      // This ensures the data is persisted immediately after onboarding
      if (onepage?.id) {
        // Build the social_links JSONB object
        const socialLinksJsonb = {
          ...onepage.social_links,
          instagram: instagramUrl,
          tiktok: tiktokUrl,
          youtube: youtubeUrl,
        }

        console.log("[OnePage Onboarding] Saving onboarding completion to database...")
        console.log("[OnePage Onboarding] onepage.id:", onepage.id)

        // Save to onepages table - update profile, social links, and mark onboarding completed
        const { data: updateData, error: updateError } = await supabase
          .from("onepages")
          .update({
            title: displayName,
            bio: bio,
            avatar_url: avatarUrl,
            // Direct columns for backward compatibility
            instagram: instagramUrl,
            tiktok: tiktokUrl,
            youtube: youtubeUrl,
            // JSONB column
            social_links: socialLinksJsonb,
            // CRITICAL: Mark onboarding as completed - this prevents the modal from showing again
            onboarding_completed: true,
          })
          .eq("id", onepage.id)
          .select()

        if (updateError) {
          console.error("[OnePage Onboarding] FAILED to save onboarding completion:", updateError)
          console.error("[OnePage Onboarding] Error details:", JSON.stringify(updateError, null, 2))
        } else {
          console.log("[OnePage Onboarding] SUCCESS - onboarding_completed saved to database")
          console.log("[OnePage Onboarding] Updated data:", updateData)
        }

        // Also update store_builder_configs to ensure social links appear in Store Builder
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: creator } = await supabase
            .from("creators")
            .select("id")
            .eq("user_id", user.id)
            .single()

          if (creator) {
            const { data: existingConfig } = await supabase
              .from("store_builder_configs")
              .select("id, draft_config")
              .eq("creator_id", creator.id)
              .eq("page_type", "shop")
              .maybeSingle()

            if (existingConfig) {
              // Build social links for Store Builder format
              const storeBuilderSocialLinks = {
                instagram: { enabled: !!instagramUrl, url: instagramUrl || "" },
                tiktok: { enabled: !!tiktokUrl, url: tiktokUrl || "" },
                youtube: { enabled: !!youtubeUrl, url: youtubeUrl || "" },
                twitter: existingConfig.draft_config?.headerSettings?.socialLinks?.twitter || { enabled: false, url: "" },
                spotify: existingConfig.draft_config?.headerSettings?.socialLinks?.spotify || { enabled: false, url: "" },
              }

              // Update store_builder_configs with social links
              await supabase
                .from("store_builder_configs")
                .update({
                  draft_config: {
                    ...existingConfig.draft_config,
                    headerSettings: {
                      ...existingConfig.draft_config?.headerSettings,
                      showSocialMedia: true,
                      showSocialIconsOnMobile: true,
                      socialLinks: storeBuilderSocialLinks,
                    }
                  }
                })
                .eq("id", existingConfig.id)
            }
          }
        }
      }

    } catch (e) {
      console.error("Error during setup:", e)
    }

    // Wait 3 more seconds - "Just a moment..."
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Mark as completed to prevent duplicate execution
    hasCompletedRef.current = true

    // Clear saved progress from localStorage since onboarding is complete
    clearSavedProgress()
    
    // CRITICAL: Also save completion to localStorage as backup
    // This ensures onboarding won't show again even if database update fails
    if (onepage?.id && typeof window !== "undefined") {
      try {
        localStorage.setItem(`onepage_onboarding_done_${onepage.id}`, "true")
        console.log("[OnePage Onboarding] Saved completion to localStorage")
      } catch (e) {
        console.error("[OnePage Onboarding] Failed to save to localStorage:", e)
      }
    }

    setIsSettingUp(false)
    setSetupPhase(null)
    setSetupComplete(true)
    setShowConfetti(true)

    // Auto-save the OnePage editor after onboarding completion
    // This ensures all changes are persisted immediately
    try {
      await save()
      console.log("[OnePage Onboarding] Editor auto-saved successfully")
    } catch (e) {
      console.error("Failed to auto-save after onboarding:", e)
    }

    // Auto close after confetti animation and call onComplete
    setTimeout(() => {
      // Hide confetti before closing
      setShowConfetti(false)

      // Call onComplete to close the modal and update parent state
      onComplete({
        displayName,
        bio,
        slug: getSlug(),
        goal: selectedGoal || "general",
        socials,
        avatarUrl,
        templateId: selectedTemplate,
      })
    }, 4000)
  }

  // Create blocks based on goal selection
  // Blocks are added in REVERSE order (bottom to top) because smart positioning
  // always inserts after header when no social_row exists. Social_row is added LAST.
  const createBlocksForGoal = async (goal: "general" | "artist" | "digital" | "business") => {
    // Remove existing blocks except header
    const existingBlocks = onepage?.draft_blocks || []
    for (const block of existingBlocks) {
      if (block.type !== "header") {
        removeBlock(block.id)
      }
    }

    // Delay to ensure removeBlock operations complete
    await new Promise(resolve => setTimeout(resolve, 200))

    switch (goal) {
      case "general": {
        // Final order: header → social_row → My Link → My Link → divider (line) → email_capture
        addBlock("email_capture")
        addBlock("divider", undefined, { style: "line", height: 24 })
        addBlock("link_button")
        addBlock("link_button")
        addBlock("social_row")
        break
      }

      case "artist": {
        // Final order: header → social_row → Spotify block → YouTube block → divider (line) → email_capture
        addBlock("email_capture")
        addBlock("divider", undefined, { style: "line", height: 24 })
        addBlock("link_button", undefined, {
          label: "Subscribe on YouTube",
          url: "https://youtube.com",
          icon: "youtube",
          thumbnail_url: null
        })
        addBlock("link_button", undefined, {
          label: "Listen on Spotify",
          url: "https://open.spotify.com/",
          icon: "spotify",
          thumbnail_url: null,
          animation_type: "swipe"
        })
        addBlock("social_row")
        break
      }

      case "digital": {
        // Final order: header → social_row → product → My Link → Instagram block → divider (line) → email_capture
        addBlock("email_capture")
        addBlock("divider", undefined, { style: "line", height: 24 })
        addBlock("link_button", undefined, {
          label: "Follow on Instagram",
          url: "https://instagram.com/",
          icon: "instagram",
          thumbnail_url: null
        })
        addBlock("link_button")
        addBlock("product")
        addBlock("social_row")
        break
      }

      case "business": {
        // Final order: header → social_row → My Link → Instagram block → LinkedIn block → divider (line) → email_capture
        addBlock("email_capture")
        addBlock("divider", undefined, { style: "line", height: 24 })
        addBlock("link_button", undefined, {
          label: "Connect on LinkedIn",
          url: "https://linkedin.com/in/",
          icon: "linkedin",
          thumbnail_url: null
        })
        addBlock("link_button", undefined, {
          label: "Follow on Instagram",
          url: "https://instagram.com/",
          icon: "instagram",
          thumbnail_url: null
        })
        addBlock("link_button")
        addBlock("social_row")
        break
      }
    }
  }

  // Progress bar width
  const progressWidth = (currentStep / 5) * 100

  // Template carousel - show 4 per page
  const templatesPerPage = 4
  const maxCarouselIndex = Math.ceil(THEME_TEMPLATES.length / templatesPerPage) - 1

  const visibleTemplates = THEME_TEMPLATES.slice(
    carouselIndex * templatesPerPage,
    (carouselIndex + 1) * templatesPerPage
  )

  // Carousel navigation with smooth animation
  const handleCarouselPrev = () => {
    if (carouselIndex > 0 && !carouselAnimating) {
      setCarouselAnimating(true)
      setCarouselDirection("left")
      setTimeout(() => {
        setCarouselIndex(carouselIndex - 1)
        setTimeout(() => setCarouselAnimating(false), 50)
      }, 150)
    }
  }

  const handleCarouselNext = () => {
    if (carouselIndex < maxCarouselIndex && !carouselAnimating) {
      setCarouselAnimating(true)
      setCarouselDirection("right")
      setTimeout(() => {
        setCarouselIndex(carouselIndex + 1)
        setTimeout(() => setCarouselAnimating(false), 50)
      }, 150)
    }
  }

  // CRITICAL: Check completion AFTER all hooks but BEFORE rendering
  // Check both database AND localStorage
  const isCompletedInDb = onepage?.onboarding_completed === true
  const isCompletedInLocalStorage = typeof window !== "undefined" && onepage?.id 
    ? localStorage.getItem(`onepage_onboarding_done_${onepage.id}`) === "true"
    : false
  
  if (isCompletedInDb || isCompletedInLocalStorage) {
    return null
  }

  return (
    <>
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent
          className={cn(
            "p-0 gap-0 overflow-hidden border-0",
            // Desktop: centered modal with exact specs - 948px width, 550px height
            "sm:w-[930px] sm:max-w-[930px] sm:h-[540px] sm:rounded-[44px]",
            // Mobile: auto height modal that fits content, max height to viewport
            "w-[calc(100%-24px)] max-w-none max-sm:rounded-[24px]",
            // Shadow
            "shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]",
            // Hide the close button
            "[&>button]:hidden"
          )}
          style={{
            // @ts-ignore
            "--tw-backdrop-blur": "blur(8px)",
          }}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex flex-col h-full sm:max-h-[540px] max-sm:max-h-[calc(100dvh-24px)] bg-white">
            {/* Progress bar - centered, 8px height, more border radius */}
            <div className="flex justify-center pt-4 sm:pt-8 shrink-0">
              <div className="w-[160px] sm:w-[200px] h-[6px] sm:h-[8px] bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-600 transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${progressWidth}%` }}
                />
              </div>
            </div>

            <div className={cn(
              "flex-1 min-h-0 overflow-y-auto transition-all duration-200 px-4 sm:px-12 pt-3 sm:pt-6",
              // Add bottom padding on mobile for steps with inputs to prevent clipping
              (currentStep === 1 || currentStep === 3) && "max-sm:pb-4",
              currentStep === 2 && "max-sm:pb-2",
              isAnimating && slideDirection === "right" && "opacity-0 translate-x-4",
              isAnimating && slideDirection === "left" && "opacity-0 -translate-x-4"
            )}>
              {/* Step 1: Let's get started */}
              {currentStep === 1 && (
                <div className="flex flex-col items-center">
                  <div className="text-center mb-4 sm:mb-8">
                    <h1 className="text-[24px] sm:text-[42px] font-bold leading-tight">
                      Let's get started <span className="inline-block">👋</span>
                    </h1>
                    <p className="text-gray-500 text-xs sm:text-base mt-1.5 sm:mt-2">
                      Start with your name — everything can be changed later
                    </p>
                  </div>

                  {/* Input fields - centered, max width 600px */}
                  <div className="w-full max-w-[600px] space-y-3 sm:space-y-4">
                    {/* Username input */}
                    <div className="relative">
                      <div className={cn(
                        "flex items-center gap-3 px-5 h-[56px] rounded-[14px] transition-all",
                        usernameFocused
                          ? "bg-white ring-2 ring-black"
                          : "bg-[#F3F3F3]"
                      )}>
                        <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          onFocus={() => setUsernameFocused(true)}
                          onBlur={() => setUsernameFocused(false)}
                          placeholder="Your name"
                          className="flex-1 text-base outline-none bg-transparent"
                          autoFocus={false}
                          autoComplete="off"
                        />
                        {checkingUsername && (
                          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                        )}
                        {!checkingUsername && usernameAvailable === true && displayName && (
                          <Check className="w-5 h-5 text-green-500" />
                        )}
                        {!checkingUsername && usernameAvailable === false && displayName && (
                          <X className="w-5 h-5 text-red-500" />
                        )}
                      </div>
                      {usernameAvailable === false && (
                        <p className="text-red-500 text-xs mt-1.5 ml-1">This name is not available</p>
                      )}
                    </div>

                    {/* URL preview */}
                    <div className="flex items-center gap-3 px-5 h-[56px] rounded-[14px] bg-[#F3F3F3]">
                      <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      <span className="text-base">
                        <span className="text-black font-medium">{getSlug() || "username"}</span>
                        <span className="text-gray-400">.storelib.com/links</span>
                      </span>
                    </div>

                    {/* Bio input */}
                    <div className="flex items-start gap-3 px-5 py-4 min-h-[56px] rounded-[14px] bg-[#F3F3F3] border-2 border-transparent focus-within:bg-white focus-within:border-black transition-all">
                      <svg className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Tell us a few words about yourself"
                        rows={2}
                        className="flex-1 text-base outline-none bg-transparent resize-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Goal Selection */}
              {currentStep === 2 && (
                <div className="flex flex-col items-center h-full">
                  <div className="text-center mb-3 sm:mb-6 shrink-0">
                    <h1 className="text-[24px] sm:text-[42px] font-bold leading-tight">
                      What's the goal here?
                    </h1>
                    <p className="text-gray-500 text-xs sm:text-base mt-1.5 sm:mt-2">
                      We'll build your OnePage around this
                    </p>
                  </div>

                  <div className="w-full max-w-[600px] grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4 overflow-y-auto max-sm:flex-1 max-sm:pb-2">
                    {/* General */}
                    <button
                      onClick={() => setSelectedGoal("general")}
                      className={cn(
                        "p-3.5 sm:p-5 rounded-2xl border-2 text-left transition-all",
                        selectedGoal === "general"
                          ? "border-black bg-gray-50"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 pr-3">
                          <h3 className="font-semibold text-base">General</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            Covers all goals - links, business, and socials.
                          </p>
                        </div>
                        <div className="w-12 h-12 rounded-[9px] shrink-0 overflow-hidden">
                          {!loadedGoalIcons.has("general") && (
                            <div className="w-full h-full bg-gray-200 animate-pulse" />
                          )}
                          <img
                            src={GOAL_ICON_URLS.general}
                            alt="General"
                            className={cn(
                              "w-full h-full object-cover",
                              !loadedGoalIcons.has("general") && "hidden"
                            )}
                            onLoad={() => setLoadedGoalIcons(prev => new Set(prev).add("general"))}
                          />
                        </div>
                      </div>
                    </button>

                    {/* Artist & Creator */}
                    <button
                      onClick={() => setSelectedGoal("artist")}
                      className={cn(
                        "p-3.5 sm:p-5 rounded-2xl border-2 text-left transition-all",
                        selectedGoal === "artist"
                          ? "border-black bg-gray-50"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 pr-3">
                          <h3 className="font-semibold text-base">Artist & Creator</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            Share my creative work with the world.
                          </p>
                        </div>
                        <div className="w-12 h-12 rounded-[9px] shrink-0 overflow-hidden">
                          {!loadedGoalIcons.has("artist") && (
                            <div className="w-full h-full bg-gray-200 animate-pulse" />
                          )}
                          <img
                            src={GOAL_ICON_URLS.artist}
                            alt="Artist"
                            className={cn(
                              "w-full h-full object-cover",
                              !loadedGoalIcons.has("artist") && "hidden"
                            )}
                            onLoad={() => setLoadedGoalIcons(prev => new Set(prev).add("artist"))}
                          />
                        </div>
                      </div>
                    </button>

                    {/* Digital Products */}
                    <button
                      onClick={() => setSelectedGoal("digital")}
                      className={cn(
                        "p-3.5 sm:p-5 rounded-2xl border-2 text-left transition-all",
                        selectedGoal === "digital"
                          ? "border-black bg-gray-50"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 pr-3">
                          <h3 className="font-semibold text-base">Digital Products</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            Sell my digital products to anyone.
                          </p>
                        </div>
                        <div className="w-12 h-12 rounded-[9px] shrink-0 overflow-hidden">
                          {!loadedGoalIcons.has("digital") && (
                            <div className="w-full h-full bg-gray-200 animate-pulse" />
                          )}
                          <img
                            src={GOAL_ICON_URLS.digital}
                            alt="Digital"
                            className={cn(
                              "w-full h-full object-cover",
                              !loadedGoalIcons.has("digital") && "hidden"
                            )}
                            onLoad={() => setLoadedGoalIcons(prev => new Set(prev).add("digital"))}
                          />
                        </div>
                      </div>
                    </button>

                    {/* Business */}
                    <button
                      onClick={() => setSelectedGoal("business")}
                      className={cn(
                        "p-3.5 sm:p-5 rounded-2xl border-2 text-left transition-all",
                        selectedGoal === "business"
                          ? "border-black bg-gray-50"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 pr-3">
                          <h3 className="font-semibold text-base">Business</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            Grow my business & convert customers.
                          </p>
                        </div>
                        <div className="w-12 h-12 rounded-[9px] shrink-0 overflow-hidden">
                          {!loadedGoalIcons.has("business") && (
                            <div className="w-full h-full bg-gray-200 animate-pulse" />
                          )}
                          <img
                            src={GOAL_ICON_URLS.business}
                            alt="Business"
                            className={cn(
                              "w-full h-full object-cover",
                              !loadedGoalIcons.has("business") && "hidden"
                            )}
                            onLoad={() => setLoadedGoalIcons(prev => new Set(prev).add("business"))}
                          />
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Socials & Profile */}
              {currentStep === 3 && (
                <div className="flex flex-col items-center">
                  <div className="text-center mb-3 sm:mb-8">
                    <h1 className="text-[24px] sm:text-[42px] font-bold leading-tight">
                      Add your socials
                    </h1>
                    <p className="text-gray-500 text-xs sm:text-base mt-1.5 sm:mt-2">
                      These will appear on your OnePage
                    </p>
                  </div>

                  <div className="w-full max-w-[600px] flex flex-col sm:flex-row gap-4 sm:gap-8">
                    {/* Avatar section - centered on mobile, left on desktop */}
                    <div className="flex flex-col items-center shrink-0">
                      <div
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-[#F3F3F3] flex items-center justify-center overflow-hidden border-2 border-gray-200"
                      >
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-2xl sm:text-3xl font-bold text-gray-400">
                            {displayName.charAt(0).toUpperCase() || "A"}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => avatarInputRef.current?.click()}
                        className="mt-2 sm:mt-3 flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
                      >
                        <Pencil className="w-4 h-4" />
                        Edit
                      </button>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarSelect}
                        className="hidden"
                      />
                    </div>

                    {/* Social inputs */}
                    <div className="flex-1 space-y-3">
                      {/* Instagram */}
                      <div className="flex items-center gap-3 px-4 sm:px-5 h-[50px] sm:h-[56px] rounded-[14px] bg-[#F3F3F3] border-2 border-transparent focus-within:bg-white focus-within:border-black transition-all">
                        <Instagram className="w-5 h-5 text-pink-500 shrink-0" />
                        <input
                          type="text"
                          value={socials.instagram}
                          onChange={(e) => setSocials({ ...socials, instagram: e.target.value })}
                          placeholder="@username"
                          className="flex-1 text-sm sm:text-base outline-none bg-transparent"
                        />
                      </div>

                      {/* TikTok */}
                      <div className="flex items-center gap-3 px-4 sm:px-5 h-[50px] sm:h-[56px] rounded-[14px] bg-[#F3F3F3] border-2 border-transparent focus-within:bg-white focus-within:border-black transition-all">
                        <TikTokIcon className="w-5 h-5 shrink-0" />
                        <input
                          type="text"
                          value={socials.tiktok}
                          onChange={(e) => setSocials({ ...socials, tiktok: e.target.value })}
                          placeholder="@username"
                          className="flex-1 text-sm sm:text-base outline-none bg-transparent"
                        />
                      </div>

                      {/* YouTube */}
                      <div className="flex items-center gap-3 px-4 sm:px-5 h-[50px] sm:h-[56px] rounded-[14px] bg-[#F3F3F3] border-2 border-transparent focus-within:bg-white focus-within:border-black transition-all">
                        <Youtube className="w-5 h-5 text-red-500 shrink-0" />
                        <input
                          type="text"
                          value={socials.youtube}
                          onChange={(e) => setSocials({ ...socials, youtube: e.target.value })}
                          placeholder="youtube.com/@username"
                          className="flex-1 text-sm sm:text-base outline-none bg-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Template Selection */}
              {currentStep === 4 && (
                <div className="flex flex-col items-center h-full">
                  <div className="text-center mb-3 sm:mb-6 shrink-0">
                    <h1 className="text-[24px] sm:text-[42px] font-bold leading-tight">
                      Select a template
                    </h1>
                    <p className="text-gray-500 text-xs sm:text-base mt-1.5 sm:mt-2">
                      Pick the style you want - you can change it later
                    </p>
                  </div>

                  {/* Mobile: Grid layout with scroll */}
                  <div className="sm:hidden w-full flex-1 min-h-0 overflow-y-auto px-2 py-2">
                    <div className="grid grid-cols-2 gap-3 pb-4 px-1">
                      {THEME_TEMPLATES.map((template) => {
                        const isSelected = selectedTemplate === template.id
                        const bgStyle = template.theme_config.background_type === "gradient"
                          ? { background: template.theme_config.background_gradient }
                          : template.theme_config.background_type === "image"
                          ? {
                              backgroundImage: `url(${template.theme_config.background_image_url})`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                            }
                          : { background: template.theme_config.background_color }
                        const isImageBg = template.theme_config.background_type === "image"
                        const isHeroLayout = (template as any).profile_layout === "hero" || (template.theme_config as any).header_layout === "hero"
                        const hasPattern = template.theme_config.background_pattern && template.theme_config.background_pattern !== "none"
                        const patternColor = template.theme_config.pattern_color || "#ffffff"
                        // Increased opacity for better visibility in thumbnails
                        const patternOpacity = template.theme_config.pattern_opacity === "high" ? 0.7 : template.theme_config.pattern_opacity === "medium" ? 0.5 : 0.35

                        return (
                          <button
                            key={template.id}
                            onClick={() => setSelectedTemplate(template.id)}
                            className={cn(
                              "aspect-[3/4] rounded-xl overflow-hidden relative transition-all duration-300",
                              isSelected ? "ring-2 ring-purple-600 ring-offset-2" : ""
                            )}
                          >
                            {isImageBg && (
                              <div
                                className="absolute inset-0 z-0"
                                style={{
                                  backgroundImage: `url(${template.theme_config.background_image_url})`,
                                  backgroundSize: "cover",
                                  backgroundPosition: "center",
                                }}
                              />
                            )}
                            <div
                              className="w-full h-full p-2 flex flex-col items-center justify-center gap-1.5 relative"
                              style={isImageBg ? {} : bgStyle}
                            >
                              {isImageBg && (
                                <div className="absolute inset-0 bg-black/50 z-[1]" />
                              )}
                              {/* Pattern overlay for mobile - all pattern types */}
                              {hasPattern && template.theme_config.background_pattern === "grid" && (
                                <div
                                  className="absolute inset-0 pointer-events-none z-[2]"
                                  style={{
                                    backgroundImage: `linear-gradient(${patternColor} 1px, transparent 1px), linear-gradient(90deg, ${patternColor} 1px, transparent 1px)`,
                                    backgroundSize: "16px 16px",
                                    opacity: patternOpacity
                                  }}
                                />
                              )}
                              {hasPattern && template.theme_config.background_pattern === "stars" && (
                                <div
                                  className="absolute inset-0 pointer-events-none z-[2] overflow-hidden"
                                  style={{ opacity: patternOpacity }}
                                >
                                  <style>{`
                                    @keyframes starTwinkle1m${template.id} {
                                      0%, 100% { opacity: 0.2; }
                                      50% { opacity: 0.8; }
                                    }
                                    @keyframes starTwinkle2m${template.id} {
                                      0%, 100% { opacity: 0.4; }
                                      50% { opacity: 1; }
                                    }
                                    @keyframes starTwinkle3m${template.id} {
                                      0%, 100% { opacity: 0.3; }
                                      50% { opacity: 0.7; }
                                    }
                                    .star-m-${template.id} {
                                      position: absolute;
                                      border-radius: 50%;
                                      background: ${patternColor};
                                    }
                                    .star-m1-${template.id} { animation: starTwinkle1m${template.id} 3s ease-in-out infinite; }
                                    .star-m2-${template.id} { animation: starTwinkle2m${template.id} 4s ease-in-out infinite; animation-delay: 0.5s; }
                                    .star-m3-${template.id} { animation: starTwinkle3m${template.id} 5s ease-in-out infinite; animation-delay: 1s; }
                                  `}</style>
                                  <div className={`star-m-${template.id} star-m1-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '8%', left: '15%' }} />
                                  <div className={`star-m-${template.id} star-m2-${template.id}`} style={{ width: '1px', height: '1px', top: '15%', left: '45%' }} />
                                  <div className={`star-m-${template.id} star-m3-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '10%', left: '75%' }} />
                                  <div className={`star-m-${template.id} star-m1-${template.id}`} style={{ width: '1px', height: '1px', top: '25%', left: '25%' }} />
                                  <div className={`star-m-${template.id} star-m2-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '30%', left: '60%' }} />
                                  <div className={`star-m-${template.id} star-m3-${template.id}`} style={{ width: '1px', height: '1px', top: '22%', left: '85%' }} />
                                  <div className={`star-m-${template.id} star-m1-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '40%', left: '10%' }} />
                                  <div className={`star-m-${template.id} star-m2-${template.id}`} style={{ width: '1px', height: '1px', top: '45%', left: '50%' }} />
                                  <div className={`star-m-${template.id} star-m3-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '38%', left: '80%' }} />
                                  <div className={`star-m-${template.id} star-m1-${template.id}`} style={{ width: '1px', height: '1px', top: '55%', left: '20%' }} />
                                  <div className={`star-m-${template.id} star-m2-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '60%', left: '55%' }} />
                                  <div className={`star-m-${template.id} star-m3-${template.id}`} style={{ width: '1px', height: '1px', top: '52%', left: '90%' }} />
                                  <div className={`star-m-${template.id} star-m1-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '70%', left: '35%' }} />
                                  <div className={`star-m-${template.id} star-m2-${template.id}`} style={{ width: '1px', height: '1px', top: '75%', left: '70%' }} />
                                  <div className={`star-m-${template.id} star-m3-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '68%', left: '5%' }} />
                                  <div className={`star-m-${template.id} star-m1-${template.id}`} style={{ width: '1px', height: '1px', top: '85%', left: '40%' }} />
                                  <div className={`star-m-${template.id} star-m2-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '90%', left: '65%' }} />
                                </div>
                              )}
                              {hasPattern && template.theme_config.background_pattern === "waves" && (
                                <svg className="absolute inset-0 w-full h-full pointer-events-none z-[2]" xmlns="http://www.w3.org/2000/svg" style={{ opacity: patternOpacity }}>
                                  <defs>
                                    <pattern id={`waves-mobile-${template.id}`} width="40" height="20" patternUnits="userSpaceOnUse">
                                      <path d="M0 10 Q10 0, 20 10 T40 10" fill="none" stroke={patternColor} strokeWidth="1.5" />
                                    </pattern>
                                  </defs>
                                  <rect width="100%" height="100%" fill={`url(#waves-mobile-${template.id})`} />
                                </svg>
                              )}
                              {hasPattern && template.theme_config.background_pattern === "zigzag" && (
                                <svg className="absolute inset-0 w-full h-full pointer-events-none z-[2]" xmlns="http://www.w3.org/2000/svg" style={{ opacity: patternOpacity }}>
                                  <defs>
                                    <pattern id={`zigzag-mobile-${template.id}`} width="20" height="12" patternUnits="userSpaceOnUse">
                                      <path d="M0 6 L5 0 L10 6 L15 0 L20 6" fill="none" stroke={patternColor} strokeWidth="1.5" />
                                    </pattern>
                                  </defs>
                                  <rect width="100%" height="100%" fill={`url(#zigzag-mobile-${template.id})`} />
                                </svg>
                              )}
                              {hasPattern && template.theme_config.background_pattern === "organic" && (
                                <svg className="absolute inset-0 w-full h-full pointer-events-none z-[2]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" style={{ opacity: patternOpacity }}>
                                  <defs>
                                    <pattern id={`organic-mobile-${template.id}`} width="200" height="200" patternUnits="userSpaceOnUse">
                                      <path d="M30 40 Q50 20, 70 40 Q90 60, 70 80 Q50 100, 30 80 Q10 60, 30 40" fill={patternColor} opacity="0.5" />
                                      <path d="M120 30 Q150 25, 160 50 Q170 80, 140 90 Q110 95, 100 70 Q95 45, 120 30" fill={patternColor} opacity="0.45" />
                                      <path d="M60 130 Q80 110, 110 125 Q130 140, 115 165 Q95 185, 65 170 Q45 155, 60 130" fill={patternColor} opacity="0.48" />
                                      <path d="M160 140 Q180 145, 185 165 Q188 185, 170 190 Q150 188, 145 170 Q143 152, 160 140" fill={patternColor} opacity="0.4" />
                                    </pattern>
                                  </defs>
                                  <rect width="100%" height="100%" fill={`url(#organic-mobile-${template.id})`} />
                                </svg>
                              )}
                              {hasPattern && template.theme_config.background_pattern === "morph" && (
                                <div
                                  className="absolute inset-0 pointer-events-none z-[2]"
                                  style={{
                                    backgroundImage: `radial-gradient(ellipse at 20% 30%, ${patternColor} 0%, transparent 50%), radial-gradient(ellipse at 80% 70%, ${patternColor} 0%, transparent 50%)`,
                                    opacity: patternOpacity
                                  }}
                                />
                              )}
                              {/* Neon glow effect */}
                              {template.id === "neon" && (
                                <div className="absolute inset-0 pointer-events-none overflow-hidden z-[2]">
                                  <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 0%, rgba(34, 211, 238, 0.15) 0%, transparent 50%)" }} />
                                </div>
                              )}
                              {isHeroLayout ? (
                                /* Hero layout for mobile: full height like phone preview */
                                <>
                                  <div className="absolute top-0 left-0 right-0 h-[55%] z-10 overflow-hidden">
                                    {avatarUrl ? (
                                      <>
                                        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                        {/* Fade gradient overlay */}
                                        <div
                                          className="absolute inset-0 pointer-events-none"
                                          style={{
                                            background: `linear-gradient(to bottom, transparent 40%, ${template.theme_config.background_type === 'gradient' ? template.theme_config.background_color : template.theme_config.background_color} 100%)`
                                          }}
                                        />
                                      </>
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: `${template.theme_config.text_color}20` }}>
                                        <span className="text-sm font-bold" style={{ color: template.theme_config.text_color }}>
                                          {displayName.charAt(0).toUpperCase() || "A"}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="mt-auto mb-2 flex flex-col items-center gap-0.5 relative z-10">
                                    <div className="w-10 h-1.5 rounded" style={{ backgroundColor: `${template.theme_config.text_color}50` }} />
                                    <div className="w-8 h-1 rounded" style={{ backgroundColor: `${template.theme_config.text_color}30` }} />
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="w-7 h-7 rounded-full relative z-10 overflow-hidden flex items-center justify-center" style={{ backgroundColor: `${template.theme_config.text_color}30` }}>
                                    {avatarUrl ? (
                                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <span className="text-[8px] font-bold" style={{ color: template.theme_config.text_color }}>
                                        {displayName.charAt(0).toUpperCase() || "A"}
                                      </span>
                                    )}
                                  </div>
                                  <div className="w-10 h-1.5 rounded relative z-10" style={{ backgroundColor: `${template.theme_config.text_color}50` }} />
                                  <div className="w-8 h-1 rounded relative z-10" style={{ backgroundColor: `${template.theme_config.text_color}30` }} />
                                </>
                              )}
                              <div
                                className="mt-1 w-full max-w-[50px] h-4 relative z-10"
                                style={{
                                  background: template.theme_config.button_color,
                                  borderWidth: template.theme_config.button_border_width || 0,
                                  borderColor: template.theme_config.button_border_color,
                                  borderRadius: `${template.theme_config.button_border_radius || 8}px`
                                }}
                              />
                            </div>
                            {isSelected && (
                              <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center z-20">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            )}
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent p-1.5 z-10">
                              <p
                                className="text-white text-[10px] font-medium text-center"
                                style={{ fontFamily: template.theme_config.font_family }}
                              >
                                {template.name}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Desktop: Carousel - with padding to prevent overflow */}
                  <div className="hidden sm:block relative w-full max-w-[700px] px-8">
                    {/* Left arrow */}
                    <button
                      onClick={handleCarouselPrev}
                      disabled={carouselIndex === 0}
                      className={cn(
                        "absolute -left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center border border-gray-200 transition-all duration-200",
                        carouselIndex === 0 ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50 hover:shadow-xl"
                      )}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>

                    {/* Templates container with overflow hidden and padding for ring-offset */}
                    <div className="overflow-hidden px-1 py-4">
                      <div
                        className={cn(
                          "flex gap-3 transition-all duration-300 ease-out",
                          carouselAnimating && carouselDirection === "right" && "opacity-0 translate-x-8",
                          carouselAnimating && carouselDirection === "left" && "opacity-0 -translate-x-8"
                        )}
                      >
                        {visibleTemplates.map((template) => {
                          const isSelected = selectedTemplate === template.id

                          // Get pattern SVG based on theme
                          const getPatternOverlay = () => {
                            const pattern = template.theme_config.background_pattern
                            const patternColor = template.theme_config.pattern_color || "#ffffff"
                            // Increased opacity for better visibility in thumbnails
                            const opacity = template.theme_config.pattern_opacity === "high" ? 0.7 :
                                           template.theme_config.pattern_opacity === "medium" ? 0.5 : 0.35

                            // Special handling for Neon theme - show cyan glow effect
                            if (template.id === "neon") {
                              return (
                                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                                  <div
                                    className="absolute inset-0"
                                    style={{
                                      background: "radial-gradient(circle at 50% 0%, rgba(34, 211, 238, 0.15) 0%, transparent 50%)"
                                    }}
                                  />
                                  <div
                                    className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-[2px]"
                                    style={{
                                      background: "linear-gradient(90deg, transparent, #22d3ee, transparent)",
                                      boxShadow: "0 0 20px 2px rgba(34, 211, 238, 0.5)"
                                    }}
                                  />
                                </div>
                              )
                            }

                            if (!pattern || pattern === "none") return null

                            if (pattern === "grid") {
                              return (
                                <div
                                  className="absolute inset-0 pointer-events-none"
                                  style={{
                                    backgroundImage: `linear-gradient(${patternColor} 1px, transparent 1px), linear-gradient(90deg, ${patternColor} 1px, transparent 1px)`,
                                    backgroundSize: "20px 20px",
                                    opacity
                                  }}
                                />
                              )
                            }
                            if (pattern === "stars") {
                              return (
                                <div
                                  className="absolute inset-0 pointer-events-none overflow-hidden"
                                  style={{ opacity }}
                                >
                                  <style>{`
                                    @keyframes starTwinkle1d${template.id} {
                                      0%, 100% { opacity: 0.2; }
                                      50% { opacity: 0.8; }
                                    }
                                    @keyframes starTwinkle2d${template.id} {
                                      0%, 100% { opacity: 0.4; }
                                      50% { opacity: 1; }
                                    }
                                    @keyframes starTwinkle3d${template.id} {
                                      0%, 100% { opacity: 0.3; }
                                      50% { opacity: 0.7; }
                                    }
                                    .star-d-${template.id} {
                                      position: absolute;
                                      border-radius: 50%;
                                      background: ${patternColor};
                                    }
                                    .star-d1-${template.id} { animation: starTwinkle1d${template.id} 3s ease-in-out infinite; }
                                    .star-d2-${template.id} { animation: starTwinkle2d${template.id} 4s ease-in-out infinite; animation-delay: 0.5s; }
                                    .star-d3-${template.id} { animation: starTwinkle3d${template.id} 5s ease-in-out infinite; animation-delay: 1s; }
                                  `}</style>
                                  <div className={`star-d-${template.id} star-d1-${template.id}`} style={{ width: '2px', height: '2px', top: '5%', left: '10%' }} />
                                  <div className={`star-d-${template.id} star-d2-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '12%', left: '30%' }} />
                                  <div className={`star-d-${template.id} star-d3-${template.id}`} style={{ width: '2px', height: '2px', top: '8%', left: '55%' }} />
                                  <div className={`star-d-${template.id} star-d1-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '15%', left: '75%' }} />
                                  <div className={`star-d-${template.id} star-d2-${template.id}`} style={{ width: '2px', height: '2px', top: '10%', left: '90%' }} />
                                  <div className={`star-d-${template.id} star-d3-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '25%', left: '15%' }} />
                                  <div className={`star-d-${template.id} star-d1-${template.id}`} style={{ width: '2px', height: '2px', top: '30%', left: '45%' }} />
                                  <div className={`star-d-${template.id} star-d2-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '22%', left: '65%' }} />
                                  <div className={`star-d-${template.id} star-d3-${template.id}`} style={{ width: '2px', height: '2px', top: '35%', left: '85%' }} />
                                  <div className={`star-d-${template.id} star-d1-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '40%', left: '5%' }} />
                                  <div className={`star-d-${template.id} star-d2-${template.id}`} style={{ width: '2px', height: '2px', top: '45%', left: '35%' }} />
                                  <div className={`star-d-${template.id} star-d3-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '42%', left: '60%' }} />
                                  <div className={`star-d-${template.id} star-d1-${template.id}`} style={{ width: '2px', height: '2px', top: '50%', left: '80%' }} />
                                  <div className={`star-d-${template.id} star-d2-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '55%', left: '20%' }} />
                                  <div className={`star-d-${template.id} star-d3-${template.id}`} style={{ width: '2px', height: '2px', top: '58%', left: '50%' }} />
                                  <div className={`star-d-${template.id} star-d1-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '62%', left: '70%' }} />
                                  <div className={`star-d-${template.id} star-d2-${template.id}`} style={{ width: '2px', height: '2px', top: '65%', left: '92%' }} />
                                  <div className={`star-d-${template.id} star-d3-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '70%', left: '8%' }} />
                                  <div className={`star-d-${template.id} star-d1-${template.id}`} style={{ width: '2px', height: '2px', top: '75%', left: '40%' }} />
                                  <div className={`star-d-${template.id} star-d2-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '78%', left: '58%' }} />
                                  <div className={`star-d-${template.id} star-d3-${template.id}`} style={{ width: '2px', height: '2px', top: '82%', left: '78%' }} />
                                  <div className={`star-d-${template.id} star-d1-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '88%', left: '25%' }} />
                                  <div className={`star-d-${template.id} star-d2-${template.id}`} style={{ width: '2px', height: '2px', top: '92%', left: '55%' }} />
                                  <div className={`star-d-${template.id} star-d3-${template.id}`} style={{ width: '1.5px', height: '1.5px', top: '95%', left: '88%' }} />
                                </div>
                              )
                            }
                            if (pattern === "waves") {
                              return (
                                <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
                                  <defs>
                                    <pattern id={`waves-desktop-${template.id}`} width="40" height="20" patternUnits="userSpaceOnUse">
                                      <path d="M0 10 Q10 0, 20 10 T40 10" fill="none" stroke={patternColor} strokeWidth="1.5" />
                                    </pattern>
                                  </defs>
                                  <rect width="100%" height="100%" fill={`url(#waves-desktop-${template.id})`} />
                                </svg>
                              )
                            }
                            if (pattern === "zigzag") {
                              return (
                                <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
                                  <defs>
                                    <pattern id={`zigzag-desktop-${template.id}`} width="20" height="12" patternUnits="userSpaceOnUse">
                                      <path d="M0 6 L5 0 L10 6 L15 0 L20 6" fill="none" stroke={patternColor} strokeWidth="1.5" />
                                    </pattern>
                                  </defs>
                                  <rect width="100%" height="100%" fill={`url(#zigzag-desktop-${template.id})`} />
                                </svg>
                              )
                            }
                            if (pattern === "organic") {
                              return (
                                <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" style={{ opacity }}>
                                  <defs>
                                    <pattern id={`organic-desktop-${template.id}`} width="200" height="200" patternUnits="userSpaceOnUse">
                                      <path d="M30 40 Q50 20, 70 40 Q90 60, 70 80 Q50 100, 30 80 Q10 60, 30 40" fill={patternColor} opacity="0.5" />
                                      <path d="M120 30 Q150 25, 160 50 Q170 80, 140 90 Q110 95, 100 70 Q95 45, 120 30" fill={patternColor} opacity="0.45" />
                                      <path d="M60 130 Q80 110, 110 125 Q130 140, 115 165 Q95 185, 65 170 Q45 155, 60 130" fill={patternColor} opacity="0.48" />
                                      <path d="M160 140 Q180 145, 185 165 Q188 185, 170 190 Q150 188, 145 170 Q143 152, 160 140" fill={patternColor} opacity="0.4" />
                                    </pattern>
                                  </defs>
                                  <rect width="100%" height="100%" fill={`url(#organic-desktop-${template.id})`} />
                                </svg>
                              )
                            }
                            if (pattern === "morph") {
                              return (
                                <div
                                  className="absolute inset-0 pointer-events-none"
                                  style={{
                                    backgroundImage: `radial-gradient(ellipse at 20% 30%, ${patternColor} 0%, transparent 50%), radial-gradient(ellipse at 80% 70%, ${patternColor} 0%, transparent 50%)`,
                                    opacity
                                  }}
                                />
                              )
                            }
                            return null
                          }

                          const bgStyle = template.theme_config.background_type === "gradient"
                            ? { background: template.theme_config.background_gradient }
                            : template.theme_config.background_type === "image"
                            ? {
                                backgroundImage: `url(${template.theme_config.background_image_url})`,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                              }
                            : { background: template.theme_config.background_color }

                          // Check if this is an image-type background
                          const isImageBg = template.theme_config.background_type === "image"

                          return (
                            <button
                              key={template.id}
                              onClick={() => setSelectedTemplate(template.id)}
                              className={cn(
                                "flex-1 min-w-[140px] aspect-[3/4] rounded-2xl overflow-hidden relative transition-all duration-300",
                                isSelected ? "ring-2 ring-purple-600 ring-offset-2" : ""
                              )}
                            >
                              {/* Background layer for image themes */}
                              {isImageBg && (
                                <div
                                  className="absolute inset-0 z-0"
                                  style={{
                                    backgroundImage: `url(${template.theme_config.background_image_url})`,
                                    backgroundSize: "cover",
                                    backgroundPosition: "center",
                                  }}
                                />
                              )}

                              {/* Template preview */}
                              <div
                                className="w-full h-full p-3 flex flex-col items-center justify-center gap-2 relative"
                                style={isImageBg ? {} : bgStyle}
                              >
                                {/* Dark overlay for image backgrounds so content is visible */}
                                {isImageBg && (
                                  <div className="absolute inset-0 bg-black/50 z-[1]" />
                                )}

                                {/* Pattern overlay */}
                                {getPatternOverlay()}

                                {/* Check if hero layout */}
                                {((template as any).profile_layout === "hero" || (template.theme_config as any).header_layout === "hero") ? (
                                  /* Hero layout: full height header like phone preview with fade */
                                  <>
                                    <div className="absolute top-0 left-0 right-0 h-[55%] z-10 overflow-hidden">
                                      {avatarUrl ? (
                                        <>
                                          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                          {/* Fade gradient overlay like phone preview */}
                                          <div
                                            className="absolute inset-0 pointer-events-none"
                                            style={{
                                              background: `linear-gradient(to bottom, transparent 40%, ${template.theme_config.background_type === 'gradient' ? template.theme_config.background_color : template.theme_config.background_color} 100%)`
                                            }}
                                          />
                                        </>
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: `${template.theme_config.text_color}20` }}>
                                          <span className="text-lg font-bold" style={{ color: template.theme_config.text_color }}>
                                            {displayName.charAt(0).toUpperCase() || "A"}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="mt-auto mb-4 flex flex-col items-center gap-1 relative z-10">
                                      <div className="w-16 h-2 rounded" style={{ backgroundColor: `${template.theme_config.text_color}50` }} />
                                      <div className="w-12 h-1 rounded" style={{ backgroundColor: `${template.theme_config.text_color}30` }} />
                                    </div>
                                  </>
                                ) : (
                                  /* Classic layout: circle avatar with user photo/initial */
                                  <>
                                    <div className="w-10 h-10 rounded-full relative z-10 overflow-hidden flex items-center justify-center" style={{ backgroundColor: `${template.theme_config.text_color}30` }}>
                                      {avatarUrl ? (
                                        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        <span className="text-xs font-bold" style={{ color: template.theme_config.text_color }}>
                                          {displayName.charAt(0).toUpperCase() || "A"}
                                        </span>
                                      )}
                                    </div>
                                    <div className="w-16 h-2 rounded relative z-10" style={{ backgroundColor: `${template.theme_config.text_color}50` }} />
                                    <div className="w-12 h-1 rounded relative z-10" style={{ backgroundColor: `${template.theme_config.text_color}30` }} />
                                  </>
                                )}

                                {/* Button preview */}
                                <div
                                  className="w-full max-w-[80px] h-6 mt-2 relative z-10"
                                  style={{
                                    background: template.theme_config.button_color,
                                    borderWidth: template.theme_config.button_border_width || 0,
                                    borderColor: template.theme_config.button_border_color,
                                    borderRadius: `${template.theme_config.button_border_radius || 8}px`
                                  }}
                                />
                              </div>

                              {/* Selected checkmark */}
                              {isSelected && (
                                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center z-20">
                                  <Check className="w-3 h-3 text-white" />
                                </div>
                              )}

                              {/* Template name with font preview */}
                              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent p-2 z-10">
                                <p
                                  className="text-white text-[10px] font-medium text-center"
                                  style={{ fontFamily: template.theme_config.font_family }}
                                >
                                  {template.name}
                                </p>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Right arrow */}
                    <button
                      onClick={handleCarouselNext}
                      disabled={carouselIndex >= maxCarouselIndex}
                      className={cn(
                        "absolute -right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center border border-gray-200 transition-all duration-200",
                        carouselIndex >= maxCarouselIndex ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50 hover:shadow-xl"
                      )}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Pagination dots - desktop only */}
                  <div className="hidden sm:flex justify-center gap-1.5 mt-4">
                    {Array.from({ length: maxCarouselIndex + 1 }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCarouselIndex(i)}
                        className={cn(
                          "w-2 h-2 rounded-full transition-colors",
                          i === carouselIndex ? "bg-purple-600" : "bg-gray-300 hover:bg-gray-400"
                        )}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Step 5: Setup - centered content */}
              {currentStep === 5 && (
                <div className="flex flex-col items-center justify-center h-full min-h-[250px] sm:min-h-[350px] px-4 pt-6 sm:pt-0">
                  {/* Logo with pulse effect */}
                  <div className="relative mb-4 sm:mb-6 mt-4 sm:mt-0">
                    {isSettingUp && (
                      <>
                        <div className="absolute inset-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-purple-400/30 animate-ping" />
                        <div className="absolute inset-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-purple-400/20 animate-pulse" />
                      </>
                    )}
                    <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden shadow-lg bg-white flex items-center justify-center">
                      <StorelibLogo className="w-full h-full" />
                    </div>
                  </div>

                  {/* Title - centered */}
                  <div className="text-center">
                    {isSettingUp && setupPhase === "setting-up" ? (
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
                        <h1 className="text-lg sm:text-2xl font-bold">
                          We're setting things up...
                        </h1>
                        <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 animate-spin" />
                      </div>
                    ) : isSettingUp && setupPhase === "just-a-moment" ? (
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 animate-in fade-in duration-300">
                        <h1 className="text-lg sm:text-2xl font-bold">
                          Just a moment...
                        </h1>
                        <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 animate-spin" />
                      </div>
                    ) : setupComplete ? (
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 animate-in fade-in zoom-in duration-500">
                        <h1 className="text-lg sm:text-2xl font-bold">
                          Your OnePage is ready.
                        </h1>
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-green-500 flex items-center justify-center animate-in zoom-in duration-300">
                          <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-gray-200 mt-6 sm:mt-8" style={{ width: '210px' }} />

                  {/* Quote - centered with purple accolades */}
                  <div className="mt-4 sm:mt-5 text-center max-w-sm px-4">
                    <p className="text-gray-500 text-xs sm:text-sm italic">
                      <span className="text-purple-600 font-medium not-italic">"</span>
                      Logic will get you from A to B. Imagination will take you everywhere.
                      <span className="text-purple-600 font-medium not-italic">"</span>
                    </p>
                    <p className="text-gray-400 text-[10px] sm:text-xs mt-1">- Albert Einstein</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer with buttons - Back on left, Skip/Next on right */}
            {currentStep < 5 && (
              <div className={cn(
                "px-4 sm:px-12 pt-2 flex items-center justify-between shrink-0",
                // Mobile: consistent padding, Desktop: base padding
                "pb-5 sm:pb-4",
                // Extra padding for goal step to move buttons up on desktop
                currentStep === 2 && "sm:pb-7"
              )}>
                {/* Back button and None of these - left side */}
                <div className="flex items-center gap-3">
                  {currentStep > 1 && (
                    <button
                      onClick={handleBack}
                      className="px-5 sm:px-6 py-3 sm:py-3 text-sm sm:text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                    >
                      Back
                    </button>
                  )}
                  {/* None of these button - desktop only, step 2 only */}
                  {currentStep === 2 && (
                    <button
                      onClick={() => {
                        setSelectedGoal("general")
                        handleNext()
                      }}
                      className="hidden sm:block px-5 py-3 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      None of these
                    </button>
                  )}
                </div>

                {/* Skip and Next buttons - right side */}
                <div className="flex items-center gap-3 sm:gap-4">
                  {canSkip() && (
                    <button
                      onClick={handleSkip}
                      className="px-4 sm:px-6 py-3 sm:py-3 text-sm sm:text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      Skip
                    </button>
                  )}

                  <button
                    onClick={handleNext}
                    disabled={!canProceed()}
                    className={cn(
                      "px-7 sm:px-8 py-3 sm:py-3 rounded-xl font-semibold text-sm sm:text-sm transition-all min-w-[110px] sm:min-w-[140px]",
                      canProceed()
                        ? "bg-purple-600 text-white hover:bg-purple-700 shadow-md hover:shadow-lg"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    )}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Step 5 footer (no buttons, just padding) */}
            {currentStep === 5 && (
              <div className="h-16" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Crop Modal - Square style like Links tab */}
      <Dialog open={showCropModal} onOpenChange={(open) => {
        setShowCropModal(open)
        if (!open && tempImageUrl) {
          URL.revokeObjectURL(tempImageUrl)
          setTempImageUrl(null)
          setAvatarFile(null)
          setCropBox({ x: 50, y: 50, size: 200 })
        }
      }}>
        <DialogContent className="w-[calc(100%-32px)] max-w-md p-0 gap-0 overflow-hidden rounded-2xl mx-auto">
          <div className="p-5 border-b flex flex-row items-center gap-3">
            <button onClick={() => { setShowCropModal(false); setTempImageUrl(null); setAvatarFile(null) }} className="hover:bg-gray-100 p-1 rounded-lg transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold flex-1 text-center pr-8">Crop Image</h2>
          </div>
          <div className="p-5 space-y-4">
            {tempImageUrl && (
              <>
                {/* Square crop preview with draggable crop box */}
                <div
                  ref={cropContainerRef}
                  className="relative mx-auto bg-[repeating-conic-gradient(#e5e7eb_0_90deg,#fff_90deg_180deg)_0_0/20px_20px] rounded-xl overflow-hidden touch-none"
                  style={{ width: '300px', height: '300px' }}
                  onMouseMove={(e) => {
                    if (!isDraggingCrop && !isResizingCrop) return
                    const rect = cropContainerRef.current?.getBoundingClientRect()
                    if (!rect) return

                    if (isDraggingCrop) {
                      const newX = e.clientX - rect.left - dragStartCrop.x
                      const newY = e.clientY - rect.top - dragStartCrop.y
                      // Constrain to image bounds
                      const maxX = imageSizeCrop.width - cropBox.size
                      const maxY = imageSizeCrop.height - cropBox.size
                      const offsetX = (300 - imageSizeCrop.width) / 2
                      const offsetY = (300 - imageSizeCrop.height) / 2
                      setCropBox(prev => ({
                        ...prev,
                        x: Math.max(0, Math.min(maxX, newX - offsetX)),
                        y: Math.max(0, Math.min(maxY, newY - offsetY))
                      }))
                    } else if (isResizingCrop) {
                      const dx = e.clientX - dragStartCrop.x
                      const dy = e.clientY - dragStartCrop.y
                      const delta = Math.max(dx, dy)
                      const newSize = Math.max(50, Math.min(300, cropBox.size + delta))
                      // Constrain to not exceed image bounds
                      const maxSize = Math.min(imageSizeCrop.width - cropBox.x, imageSizeCrop.height - cropBox.y)
                      setCropBox(prev => ({ ...prev, size: Math.min(newSize, maxSize) }))
                      setDragStartCrop({ x: e.clientX, y: e.clientY })
                    }
                  }}
                  onMouseUp={() => { setIsDraggingCrop(false); setIsResizingCrop(false) }}
                  onMouseLeave={() => { setIsDraggingCrop(false); setIsResizingCrop(false) }}
                  onTouchMove={(e) => {
                    if (!isDraggingCrop && !isResizingCrop) return
                    e.preventDefault()
                    const touch = e.touches[0]
                    const rect = cropContainerRef.current?.getBoundingClientRect()
                    if (!rect || !touch) return

                    if (isDraggingCrop) {
                      const newX = touch.clientX - rect.left - dragStartCrop.x
                      const newY = touch.clientY - rect.top - dragStartCrop.y
                      const maxX = imageSizeCrop.width - cropBox.size
                      const maxY = imageSizeCrop.height - cropBox.size
                      const offsetX = (300 - imageSizeCrop.width) / 2
                      const offsetY = (300 - imageSizeCrop.height) / 2
                      setCropBox(prev => ({
                        ...prev,
                        x: Math.max(0, Math.min(maxX, newX - offsetX)),
                        y: Math.max(0, Math.min(maxY, newY - offsetY))
                      }))
                    } else if (isResizingCrop) {
                      const dx = touch.clientX - dragStartCrop.x
                      const dy = touch.clientY - dragStartCrop.y
                      const delta = Math.max(dx, dy)
                      const newSize = Math.max(50, Math.min(300, cropBox.size + delta))
                      const maxSize = Math.min(imageSizeCrop.width - cropBox.x, imageSizeCrop.height - cropBox.y)
                      setCropBox(prev => ({ ...prev, size: Math.min(newSize, maxSize) }))
                      setDragStartCrop({ x: touch.clientX, y: touch.clientY })
                    }
                  }}
                  onTouchEnd={() => { setIsDraggingCrop(false); setIsResizingCrop(false) }}
                >
                  {/* Image */}
                  <img
                    src={tempImageUrl}
                    alt="Preview"
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none"
                    style={{
                      width: imageSizeCrop.width,
                      height: imageSizeCrop.height,
                      maxWidth: '300px',
                      maxHeight: '300px',
                      objectFit: 'contain'
                    }}
                    draggable={false}
                    onLoad={(e) => {
                      const img = e.target as HTMLImageElement
                      const nw = img.naturalWidth
                      const nh = img.naturalHeight
                      // Scale to fit container
                      const scale = Math.min(300 / nw, 300 / nh)
                      const displayW = nw * scale
                      const displayH = nh * scale
                      setImageSizeCrop({ width: displayW, height: displayH })
                      // Center crop box
                      const size = Math.min(displayW, displayH) * 0.8
                      setCropBox({
                        x: (displayW - size) / 2,
                        y: (displayH - size) / 2,
                        size
                      })
                    }}
                  />

                  {/* Crop box with shadow overlay */}
                  <div
                    className="absolute cursor-move touch-none"
                    style={{
                      left: `${150 - imageSizeCrop.width/2 + cropBox.x}px`,
                      top: `${150 - imageSizeCrop.height/2 + cropBox.y}px`,
                      width: `${cropBox.size}px`,
                      height: `${cropBox.size}px`,
                      border: '2px solid #3b82f6',
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)'
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setIsDraggingCrop(true)
                      const rect = (e.target as HTMLElement).getBoundingClientRect()
                      setDragStartCrop({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                    }}
                    onTouchStart={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const touch = e.touches[0]
                      setIsDraggingCrop(true)
                      const rect = (e.target as HTMLElement).getBoundingClientRect()
                      setDragStartCrop({ x: touch.clientX - rect.left, y: touch.clientY - rect.top })
                    }}
                  >
                    {/* Grid overlay */}
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                      {[...Array(9)].map((_, i) => (
                        <div key={i} className="border border-white/30" />
                      ))}
                    </div>

                    {/* Corner handles - larger for mobile touch */}
                    <div className="absolute -top-2 -left-2 w-5 h-5 bg-white border-2 border-blue-500 rounded-sm" />
                    <div className="absolute -top-2 -right-2 w-5 h-5 bg-white border-2 border-blue-500 rounded-sm" />
                    <div className="absolute -bottom-2 -left-2 w-5 h-5 bg-white border-2 border-blue-500 rounded-sm" />
                    <div
                      className="absolute -bottom-2 -right-2 w-6 h-6 bg-blue-500 border-2 border-blue-500 rounded-sm cursor-se-resize touch-none"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setIsResizingCrop(true)
                        setDragStartCrop({ x: e.clientX, y: e.clientY })
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        const touch = e.touches[0]
                        setIsResizingCrop(true)
                        setDragStartCrop({ x: touch.clientX, y: touch.clientY })
                      }}
                    />
                  </div>
                </div>

                <p className="text-xs text-center text-gray-500">
                  Drag to move, drag bottom-right corner to resize
                </p>

                <canvas ref={canvasRef} className="hidden" />

                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowCropModal(false); setTempImageUrl(null); setAvatarFile(null); setCropBox({ x: 50, y: 50, size: 200 }) }}
                    className="flex-1 py-3 rounded-xl font-medium text-sm border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCropComplete}
                    disabled={uploadingAvatar}
                    className="flex-1 py-3 rounded-xl font-medium text-sm bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {uploadingAvatar ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : "Save"}
                  </button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confetti rendered last to be on top of everything */}
      <Confetti show={showConfetti} />
    </>
  )
}
