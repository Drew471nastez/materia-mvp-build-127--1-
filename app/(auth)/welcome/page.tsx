"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useHideNativeSplash } from "@/hooks/use-hide-native-splash"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { HtmlClass } from "@/components/platform/html-class"
import { readCarry, withCarry } from "@/lib/auth/continue"
import { getMainDomain } from "@/lib/url-helpers"

// ── Typing effect ────────────────────────────────────────────────────────────
const PHRASES = [
  "Start monetizing your passion...",
  "Build link in bio pages...",
  "Sell digital products...",
  "Share your passion...",
  "Build your online store...",
]
const TYPING_SPEED   = 70
const DELETING_SPEED = 35
const PAUSE_MS       = 2000

// ── Page ─────────────────────────────────────────────────────────────────────
export default function WelcomePage() {
  const router = useRouter()
  const [typedText, setTypedText] = useState("")
  const phraseIndex = useRef(0)
  const charIndex   = useRef(0)
  const isDeleting  = useRef(false)

  // /welcome is the final destination for logged-out native users — hide splash here.
  useHideNativeSplash()

  // Safety-net: /native-start routes logged-in users away before reaching here.
  // If somehow a logged-in user arrives at /welcome, redirect them silently.
  useEffect(() => {
    async function checkSession() {
      const isNative =
        typeof (window as any).Capacitor?.isNativePlatform === "function" &&
        (window as any).Capacitor.isNativePlatform() === true
      if (!isNative) return

      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        if (supabaseUrl) {
          const ref = new URL(supabaseUrl).hostname.split(".")[0]
          const session = localStorage.getItem(`sb-${ref}-auth-token`)
          if (session) {
            window.location.replace(localStorage.getItem("sb-native-home") || "/app")
            return
          }
        }
      } catch { /* ignore */ }

      try {
        const { createClient } = await import("@/lib/supabase/client")
        const { getCachedNativeHome } = await import("@/lib/native-bridge")
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          window.location.replace((await getCachedNativeHome()) || "/app")
        }
      } catch { /* ignore */ }
    }
    checkSession()
  }, [])

  // ── Typing animation ──────────────────────────────────────────────────────
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    function tick() {
      const phrase = PHRASES[phraseIndex.current]
      if (!isDeleting.current) {
        charIndex.current++
        setTypedText(phrase.substring(0, charIndex.current))
        if (charIndex.current === phrase.length) {
          isDeleting.current = true
          timeout = setTimeout(tick, PAUSE_MS)
          return
        }
        timeout = setTimeout(tick, TYPING_SPEED)
      } else {
        charIndex.current--
        setTypedText(phrase.substring(0, charIndex.current))
        if (charIndex.current === 0) {
          isDeleting.current = false
          phraseIndex.current = (phraseIndex.current + 1) % PHRASES.length
          timeout = setTimeout(tick, 300)
          return
        }
        timeout = setTimeout(tick, DELETING_SPEED)
      }
    }
    timeout = setTimeout(tick, 600)
    return () => clearTimeout(timeout)
  }, [])

  // Client-side navigation — stays in WebView, never opens Safari
  /*
    Sell on Storelib, and the page to go back to, when the app opened here
    with them (a password reset finished in the app ends here): carried on
    to Sign up and Log in like every other hop (lib/auth/continue.ts).
  */
  const carry = () => {
    try {
      return readCarry(new URLSearchParams(window.location.search), getMainDomain())
    } catch {
      return { intent: null, next: null }
    }
  }
  const goToSignup = () => router.push(withCarry("/signup", carry()))
  const goToLogin  = () => router.push(withCarry("/login", carry()))

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes cursorPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        .wlc-fade-down    { animation: fadeInDown  0.65s cubic-bezier(.22,1,.36,1) 0.10s both; }
        .wlc-fade-scale   { animation: fadeInScale 0.85s cubic-bezier(.22,1,.36,1) 0.28s both; }
        .wlc-fade-up      { animation: fadeInUp    0.65s cubic-bezier(.22,1,.36,1) 0.48s both; }
        .wlc-fade-up-late { animation: fadeInUp    0.65s cubic-bezier(.22,1,.36,1) 0.58s both; }
        .wlc-cursor       { animation: cursorPulse 1s ease-in-out infinite; }
        .wlc-shimmer {
          background: linear-gradient(90deg,#e8e8e8 0%,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%,#e8e8e8 100%);
          background-size: 200% 100%;
          animation: shimmer 1.6s ease-in-out infinite;
        }
      `}} />

      <div
        data-page="welcome"
        className="fixed inset-0 flex flex-col items-center overflow-hidden select-none"
        style={{
          background:    "#f2f2f2",
          paddingTop:    "env(safe-area-inset-top,    0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingLeft:   "env(safe-area-inset-left,   0px)",
          paddingRight:  "env(safe-area-inset-right,  0px)",
        }}
      >
        <HtmlClass name="with-page-welcome" />
        {/* Logo */}
        <div
          className="wlc-fade-down flex items-center justify-center gap-3 shrink-0"
          style={{ paddingTop: "clamp(18px, 4vh, 40px)" }}
        >
          <StorelibLogo size={34} priority />
          <span className="text-[23px] font-bold tracking-tight text-[#0a0a0a]">
            Storelib
          </span>
        </div>

        {/* Carousel */}
        <div
          className="wlc-fade-scale flex-1 w-full relative overflow-hidden min-h-0"
          style={{ marginTop: "clamp(12px, 2.5vh, 24px)" }}
        >
          <CollageCarousel />
        </div>

        {/* Typing text */}
        <div
          className="wlc-fade-up shrink-0 text-center"
          style={{ padding: "clamp(14px,3vh,24px) 24px clamp(8px,1.5vh,14px)" }}
        >
          <p
            className="font-bold text-[#0a0a0a] leading-tight"
            style={{ fontSize: "clamp(19px, 6vw, 30px)", minHeight: "2.8em" }}
          >
            {typedText}
            <span
              className="wlc-cursor inline-block bg-[#7c3aed] ml-[2px] rounded-sm align-middle"
              style={{ width: "2.5px", height: "0.82em" }}
            />
          </p>
        </div>

        {/* Buttons */}
        <div className="wlc-fade-up-late shrink-0 w-full px-5 pb-4 flex flex-col items-center">
          <div className="w-full max-w-[400px] flex flex-col gap-[16px]">
            <button
              onClick={goToSignup}
              className="w-full rounded-[10px] bg-[#7c3aed] text-white font-semibold text-base py-[15px] active:scale-[0.97] active:opacity-85 transition-transform border-none cursor-pointer"
            >
              Sign up
            </button>
            <button
              onClick={goToLogin}
              className="w-full rounded-[10px] bg-[#0a0a0a] text-white/90 font-semibold text-base py-[14px] active:scale-[0.97] active:opacity-85 transition-transform border-none cursor-pointer"
            >
              Log in
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Collage Carousel (vanilla DOM animation for 60fps on iOS) ─────────────────
const BASE_URL =
  "https://storelib.com/media/platform%20images/collage%20imags"
const IMAGES = [
  "Monetize%20(5)%20(2).webp",
  "Monetize%20(6)%20(1).webp",
  "Monetize%20(7)%20(1).webp",
  "Monetize%20(21).webp",
  "Monetize%20(9).webp",
]

function CollageCarousel() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = containerRef.current
    if (!root) return

    const cardEls: HTMLDivElement[] = []
    let order    = [0, 1, 2, 3, 4]
    let animating = false
    let cachedSlots: ReturnType<typeof getSlots> | null = null
    let cVW = 0, cVH = 0

    const dpr  = Math.min(window.devicePixelRatio || 1, 2)
    const imgW = Math.round(280 * dpr)
    const imgH = Math.round(386 * dpr)
    const imgQ = dpr > 1.5 ? 55 : 65

    function getSlots() {
      const vw = window.innerWidth
      const vh = root!.offsetHeight || Math.min(window.innerHeight * 0.48, window.innerHeight - 200)
      if (cachedSlots && cVW === vw && cVH === vh) return cachedSlots
      cVW = vw; cVH = vh
      const cx = vw / 2
      const cy = vh * 0.5
      let   cw = Math.min(vw * 0.54, vw >= 768 ? 320 : 250)
      const ch = Math.min(cw * 1.38, vh * 0.92)
      cw = ch / 1.38
      const sw = cw * 0.76, sh = sw * 1.38
      const fw = cw * 0.60, fh = fw * 1.38
      const gap = cw * 0.02
      cachedSlots = [
        { x: -fw * 0.3,                    y: cy, w: fw, h: fh, z: 1, o: 0,   s: 0.85 },
        { x: cx - cw / 2 - gap - sw / 2,   y: cy, w: sw, h: sh, z: 3, o: 0.9, s: 1    },
        { x: cx,                            y: cy, w: cw, h: ch, z: 5, o: 1,   s: 1    },
        { x: cx + cw / 2 + gap + sw / 2,   y: cy, w: sw, h: sh, z: 3, o: 0.9, s: 1    },
        { x: vw + fw * 0.3,                y: cy, w: fw, h: fh, z: 1, o: 0,   s: 0.85 },
      ]
      return cachedSlots
    }

    function applyCard(
      el: HTMLDivElement,
      x: number, y: number, w: number, h: number,
      o: number, z: number, s: number,
    ) {
      el.style.cssText =
        `position:absolute;top:0;left:0;border-radius:18px;overflow:hidden;` +
        `will-change:transform,opacity;-webkit-backface-visibility:hidden;backface-visibility:hidden;` +
        `box-shadow:0 8px 32px rgba(0,0,0,.12);` +
        `transform:translate3d(${x - w / 2}px,${y - h / 2}px,0) scale(${s});` +
        `opacity:${o};z-index:${z};width:${w}px;height:${h}px;`
    }

    // Build card DOM elements
    for (let i = 0; i < 5; i++) {
      const card = document.createElement("div")
      card.className = "wlc-shimmer"
      card.style.cssText = "position:absolute;top:0;left:0;border-radius:18px;overflow:hidden;"
      const img = document.createElement("img")
      img.src      = `${BASE_URL}/${IMAGES[i]}?width=${imgW}&height=${imgH}&resize=cover&quality=${imgQ}`
      img.alt      = ""
      img.loading  = i >= 1 && i <= 3 ? "eager" : "lazy"
      img.decoding = "async"
      img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .4s"
      img.onload = () => {
        img.style.opacity   = "1"
        card.style.background = "none"
        card.style.animation  = "none"
      }
      card.appendChild(img)
      root.appendChild(card)
      cardEls.push(card)
    }

    function layoutCards() {
      cachedSlots = null
      const slots = getSlots()
      for (let j = 0; j < 5; j++) {
        const s = slots[j]
        applyCard(cardEls[order[j]], s.x, s.y, s.w, s.h, s.o, s.z, s.s)
      }
    }
    requestAnimationFrame(() => requestAnimationFrame(layoutCards))

    let resizeT: ReturnType<typeof setTimeout>
    const onResize = () => {
      clearTimeout(resizeT)
      resizeT = setTimeout(() => { if (!animating) layoutCards() }, 120)
    }
    window.addEventListener("resize", onResize, { passive: true })

    function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
    function ease(t: number) {
      if (t <= 0) return 0; if (t >= 1) return 1
      return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2
    }

    function interpCards(from: number[], to: number[], p: number) {
      const slots = getSlots()
      for (let i = 0; i < 5; i++) {
        const ci = from[i]
        const el = cardEls[ci]
        const fi = from.indexOf(ci), ti = to.indexOf(ci)
        const a = slots[fi], b = slots[ti]
        const z = b.z > a.z ? (p > 0.3 ? b.z : a.z) : b.z < a.z ? (p > 0.7 ? b.z : a.z) : a.z
        const w = lerp(a.w, b.w, p), h = lerp(a.h, b.h, p)
        const x = lerp(a.x, b.x, p), y = lerp(a.y, b.y, p)
        const s = lerp(a.s, b.s, p)
        let op: number
        if (a.o === 0 && b.o > 0)       { const f = Math.min(1, p * 1.8);        op = b.o * f * f }
        else if (b.o === 0 && a.o > 0)  { const f = Math.max(0, (p - 0.4) / 0.6); op = a.o * (1 - f * f) }
        else                             { op = lerp(a.o, b.o, p) }
        applyCard(el, x, y, w, h, Math.max(0, Math.min(1, op)), z, s)
      }
    }

    function rotateOrder(arr: number[]) { return [arr[arr.length - 1], ...arr.slice(0, -1)] }

    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion:reduce)").matches

    function startRotation() {
      if (animating || prefersReduced) return
      animating = true
      const from = order.slice(), to = rotateOrder(order)
      let start = 0
      function tick(now: number) {
        if (!start) start = now
        const raw = Math.min(1, (now - start) / 2000)
        interpCards(from, to, ease(raw))
        if (raw < 1) requestAnimationFrame(tick)
        else { order = to; animating = false }
      }
      requestAnimationFrame(tick)
    }

    const interval = setInterval(startRotation, 3800)

    let touchStartX = 0
    const onTouchStart = (e: TouchEvent) => { touchStartX = e.touches[0].clientX }
    const onTouchEnd   = (e: TouchEvent) => {
      if (Math.abs(e.changedTouches[0].clientX - touchStartX) > 40) startRotation()
    }
    root.addEventListener("touchstart", onTouchStart, { passive: true })
    root.addEventListener("touchend",   onTouchEnd,   { passive: true })

    return () => {
      clearInterval(interval)
      window.removeEventListener("resize", onResize)
      root.removeEventListener("touchstart", onTouchStart)
      root.removeEventListener("touchend",   onTouchEnd)
    }
  }, [])

  return (
    <>
      <div ref={containerRef} className="relative w-full h-full" />
      {/* Edge fade-out gradients */}
      <div
        className="absolute inset-y-0 left-0 z-[8] pointer-events-none"
        style={{ width: "clamp(24px,7vw,56px)", background: "linear-gradient(to right,#f2f2f2,transparent)" }}
      />
      <div
        className="absolute inset-y-0 right-0 z-[8] pointer-events-none"
        style={{ width: "clamp(24px,7vw,56px)", background: "linear-gradient(to left,#f2f2f2,transparent)" }}
      />
    </>
  )
}
