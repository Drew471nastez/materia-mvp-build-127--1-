"use client"

/**
 * Classic iOS activity indicator — 12 rounded bars radiating from the center
 * with a fading trail, ticking around in 12 steps (the native UIActivityIndicator
 * look). Used for the mobile feed's pull-to-refresh and loading states.
 */
export function IosSpinner({ size = 28, color = "rgba(0,0,0,0.45)" }: { size?: number; color?: string }) {
  const bars = Array.from({ length: 12 })
  return (
    <div className="ios-spin" style={{ width: size, height: size, position: "relative" }} role="progressbar" aria-label="Loading">
      {bars.map((_, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: Math.max(2, size * 0.085),
            height: size * 0.27,
            background: color,
            borderRadius: size,
            transform: `translate(-50%, -50%) rotate(${i * 30}deg) translateY(-${size * 0.33}px)`,
            opacity: (i + 1) / 12,
          }}
        />
      ))}
    </div>
  )
}
