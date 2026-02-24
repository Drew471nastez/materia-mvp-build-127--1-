"use client"

import { useEffect, useRef } from "react"

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
        .atmosphereAltitude(0.12)
        .width(130)
        .height(130)
        .enablePointerInteraction(false)

      const controls = globe.controls()
      controls.autoRotate = true
      controls.autoRotateSpeed = 0.8
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
      style={{ width: 130, height: 130 }}
    />
  )
}
