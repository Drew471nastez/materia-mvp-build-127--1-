/**
 * The real Avatar primitive with the profile page's own style object, at both
 * sizes a creator can pick. The thing worth checking is that the inline radius
 * actually beats the `rounded-full` baked into components/ui/avatar, and that
 * the photo is clipped to the new shape rather than to the old one.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

/* A 2x2 PNG, so the image really decodes and really gets clipped. */
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz8DAwMgABYwMDAAmLwH/PVxMDAAAAABJRU5ErkJggg=="

function One({ size }: { size: number }) {
  return (
    <Avatar
      data-size={size}
      className="shrink-0 bg-gray-200"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${Math.round(size * 0.24)}px`,
        borderWidth: "2.5px",
        borderStyle: "solid",
        borderColor: "#e5e7eb",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06), 0 10px 28px -8px rgba(15, 23, 42, 0.20)",
      }}
    >
      <AvatarImage src={PNG} alt="" />
      <AvatarFallback>AR</AvatarFallback>
    </Avatar>
  )
}

createRoot(document.getElementById("app")!).render(
  <div style={{ display: "flex", gap: 40, padding: 40, background: "#f5f5f5" }}>
    <One size={110} />
    <One size={137} />
  </div>,
)
