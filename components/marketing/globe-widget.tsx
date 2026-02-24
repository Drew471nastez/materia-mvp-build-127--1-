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
]

export default function GlobeWidget() {
  const containerRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current || globeRef.current) return

    let cancelled = false

    ;(async () => {
      const GlobeGl = (await import("globe.gl")).default
      if (cancelled || !containerRef.current) return

      const globe = new GlobeGl(containerRef.current)
        .globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
        .bumpImageUrl("//unpkg.com/three-globe/example/img/earth-topology.png")
        .backgroundColor("rgba(0,0,0,0)")
        .showAtmosphere(true)
        .atmosphereColor("#fbbf24")
        .atmosphereAltitude(0.18)
        .width(170)
        .height(170)
        .enablePointerInteraction(false)
        // City dots
        .pointsData(CITIES)
        .pointLat("lat")
        .pointLng("lng")
        .pointColor(() => "#fbbf24")
        .pointAltitude(0.01)
        .pointRadius(0.35)
        // Animated arcs
        .arcsData(ARCS)
        .arcStartLat("startLat")
        .arcStartLng("startLng")
        .arcEndLat("endLat")
        .arcEndLng("endLng")
        .arcColor(() => ["#fbbf2480", "#fb923c80"])
        .arcDashLength(0.4)
        .arcDashGap(0.2)
        .arcDashAnimateTime(3000)
        .arcStroke(0.5)

      const controls = globe.controls()
      controls.autoRotate = true
      controls.autoRotateSpeed = 0.6
      controls.enableZoom = false
      controls.enableRotate = false
      controls.enablePan = false

      globeRef.current = globe
    })()

    return () => {
      cancelled = true
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
      style={{ width: 170, height: 170 }}
    />
  )
}
