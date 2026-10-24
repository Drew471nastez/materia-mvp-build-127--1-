"use client"

import { useEffect, useRef } from "react"

/* City dots — major cities worldwide */
const CITIES = [
  { lat: 40.71, lng: -74.01 },   // New York
  { lat: 51.51, lng: -0.13 },    // London
  { lat: 35.68, lng: 139.69 },   // Tokyo
  { lat: -33.87, lng: 151.21 },  // Sydney
  { lat: 48.86, lng: 2.35 },     // Paris
  { lat: 37.77, lng: -122.42 },  // San Francisco
  { lat: 55.76, lng: 37.62 },    // Moscow
  { lat: -23.55, lng: -46.63 },  // São Paulo
  { lat: 19.43, lng: -99.13 },   // Mexico City
  { lat: 1.35, lng: 103.82 },    // Singapore
  { lat: 28.61, lng: 77.23 },    // New Delhi
  { lat: 31.23, lng: 121.47 },   // Shanghai
  { lat: 25.20, lng: 55.27 },    // Dubai
  { lat: -1.29, lng: 36.82 },    // Nairobi
  { lat: 52.52, lng: 13.41 },    // Berlin
  { lat: 34.05, lng: -118.24 },  // Los Angeles
  { lat: 22.32, lng: 114.17 },   // Hong Kong
  { lat: 59.33, lng: 18.07 },    // Stockholm
  { lat: -34.60, lng: -58.38 },  // Buenos Aires
  { lat: 6.52, lng: 3.38 },      // Lagos
  { lat: 41.90, lng: 12.50 },    // Rome
  { lat: 39.90, lng: 116.40 },   // Beijing
  { lat: 33.87, lng: -84.39 },   // Atlanta
  { lat: 13.76, lng: 100.50 },   // Bangkok
]

/* Arcs — simulated orders flying between cities */
const ARCS = [
  { startLat: 40.71, startLng: -74.01, endLat: 51.51, endLng: -0.13 },
  { startLat: 35.68, startLng: 139.69, endLat: -33.87, endLng: 151.21 },
  { startLat: 37.77, startLng: -122.42, endLat: 48.86, endLng: 2.35 },
  { startLat: 1.35, startLng: 103.82, endLat: 28.61, endLng: 77.23 },
  { startLat: -23.55, startLng: -46.63, endLat: 55.76, endLng: 37.62 },
  { startLat: 25.20, startLng: 55.27, endLat: 31.23, endLng: 121.47 },
  { startLat: 52.52, startLng: 13.41, endLat: -1.29, endLng: 36.82 },
  { startLat: 19.43, startLng: -99.13, endLat: 40.71, endLng: -74.01 },
  { startLat: 34.05, startLng: -118.24, endLat: 22.32, endLng: 114.17 },
  { startLat: 59.33, startLng: 18.07, endLat: -34.60, endLng: -58.38 },
  { startLat: 6.52, startLng: 3.38, endLat: 48.86, endLng: 2.35 },
  { startLat: 22.32, startLng: 114.17, endLat: 35.68, endLng: 139.69 },
  { startLat: 51.51, startLng: -0.13, endLat: 25.20, endLng: 55.27 },
  { startLat: 41.90, startLng: 12.50, endLat: 40.71, endLng: -74.01 },
  { startLat: 39.90, startLng: 116.40, endLat: -33.87, endLng: 151.21 },
  { startLat: 33.87, startLng: -84.39, endLat: 52.52, endLng: 13.41 },
  { startLat: 13.76, startLng: 100.50, endLat: 1.35, endLng: 103.82 },
  { startLat: 28.61, startLng: 77.23, endLat: 6.52, endLng: 3.38 },
]

/** How far outside the screen the globe starts loading: about a screen of a phone. */
/*
  Round AB1: 400, not 800. The hero is shorter now, and with 800 the globe's
  1.8 MB began to parse on a phone's first small scroll, a long task on the
  main thread while the heading above was still typing. With 400 it starts
  once the heading has left the screen (scripts/check-home-hero.mjs measures
  both), still well before the globe itself is in view.
*/
export const GLOBE_AHEAD_PX = 400

export default function GlobeWidget() {
  const containerRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current || globeRef.current) return

    let cancelled = false
    let stopWatching = () => {}
    let stopApproach = () => {}

    /**
     * BUILT WHEN IT IS ABOUT TO BE SEEN. globe.gl with three.js is 1.8 MB of
     * script (500 KB over the wire), and on a 390px phone this widget sits
     * about two and a half screens below the top of the front page. It was
     * downloaded, parsed and given a WebGL context as soon as the page
     * hydrated, in the middle of the hero's first seconds. Now it starts a
     * screen before it scrolls into view (GLOBE_AHEAD_PX), which on
     * any phone is long before a finger gets it there, so what is seen is the
     * same globe at the same moment.
     */
    const build = async () => {
      const GlobeGl = (await import("globe.gl")).default
      if (cancelled || !containerRef.current) return

      const globe = new GlobeGl(containerRef.current)
        .globeImageUrl("//unpkg.com/three-globe/example/img/earth-blue-marble.jpg")
        .bumpImageUrl("//unpkg.com/three-globe/example/img/earth-topology.png")
        .backgroundColor("rgba(0,0,0,0)")
        .showAtmosphere(true)
        .atmosphereColor("#60a5fa")
        .atmosphereAltitude(0.22)
        .width(220)
        .height(220)
        .enablePointerInteraction(true)
        // City dots — brighter blue glow
        .pointsData(CITIES)
        .pointLat("lat")
        .pointLng("lng")
        .pointColor(() => "#bfdbfe")
        .pointAltitude(0.015)
        .pointRadius(0.5)
        // Animated arcs — thicker, more vivid blue/purple glow
        .arcsData(ARCS)
        .arcStartLat("startLat")
        .arcStartLng("startLng")
        .arcEndLat("endLat")
        .arcEndLng("endLng")
        .arcColor(() => ["#93c5fdee", "#a78bfaee"])
        .arcDashLength(0.45)
        .arcDashGap(0.12)
        .arcDashAnimateTime(2200)
        .arcStroke(1.0)

      /* High-DPI / Retina sharpness */
      globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 2))

      const controls = globe.controls()
      controls.autoRotate = true
      controls.autoRotateSpeed = 0.5
      controls.enableZoom = false
      controls.enableRotate = true
      controls.enablePan = false
      controls.minPolarAngle = 0
      controls.maxPolarAngle = Math.PI

      globeRef.current = globe

      /**
       * DRAWN ONLY WHILE SEEN. globe.gl renders a WebGL frame on every
       * animation frame for as long as it exists, so on the front page it was
       * drawing a spinning earth under the hero, off screen and in background
       * tabs: about a seventh of the main thread on a throttled phone while
       * the hero's cards were trying to move. It pauses out of view and picks
       * up where it was.
       */
      let onScreen = true
      const sync = () => {
        const g = globeRef.current
        if (!g) return
        if (onScreen && document.visibilityState !== "hidden") g.resumeAnimation?.()
        else g.pauseAnimation?.()
      }
      const io = typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync() })
        : null
      io?.observe(containerRef.current)
      document.addEventListener("visibilitychange", sync)
      stopWatching = () => {
        io?.disconnect()
        document.removeEventListener("visibilitychange", sync)
      }
    }

    if (typeof IntersectionObserver !== "function") {
      void build()
    } else {
      const approach = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return
          approach.disconnect()
          void build()
        },
        { rootMargin: `${GLOBE_AHEAD_PX}px 0px ${GLOBE_AHEAD_PX}px 0px` },
      )
      approach.observe(containerRef.current)
      stopApproach = () => approach.disconnect()
    }

    return () => {
      cancelled = true
      stopApproach()
      stopWatching()
      /* Clearing the container left the render loop and its WebGL context
         running after the page had gone. */
      globeRef.current?._destructor?.()
      if (containerRef.current) {
        containerRef.current.innerHTML = ""
      }
      globeRef.current = null
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="mx-auto overflow-hidden rounded-full"
      style={{ width: 220, height: 220 }}
    />
  )
}
