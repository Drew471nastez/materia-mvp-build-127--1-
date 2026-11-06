import React from "react"
import { createRoot } from "react-dom/client"
import { CompactInstagramPost } from "@/components/onepage/compact-post"
import { StorelibBlock } from "@/components/onepage/storelib-blocks"
import { defaultTheme } from "@/lib/onepage/types"
const item = {
  kind: "instagram" as const,
  id: "ABC123",
  url: "https://www.instagram.com/p/ABC123/",
  thumb: null,
  title: "Instagram",
}
const look = { theme: defaultTheme, scale: "live" as const, button: {} }
createRoot(document.getElementById("app")!).render(
  <main
    style={{ width: "calc(100% - 32px)", maxWidth: 640, margin: "20px auto" }}
  >
    <a
      data-neighbor
      style={{
        display: "block",
        width: "100%",
        padding: 16,
        background: "#eee",
      }}
    >
      Neighboring block
    </a>
    <CompactInstagramPost src="https://www.instagram.com/p/ABC123/embed/" />
    {(["single", "list", "carousel", "grid"] as const).map((layout) => (
      <section
        key={layout}
        data-social-layout={layout}
        style={{ marginTop: 20 }}
      >
        <StorelibBlock
          block={{
            id: layout,
            type: "social_posts",
            enabled: true,
            sort_order: 0,
            data: {
              network: "instagram",
              layout,
              items: [
                item,
                {
                  ...item,
                  id: "DEF456",
                  url: "https://www.instagram.com/p/DEF456/",
                },
              ],
            },
          }}
          look={look}
        />
      </section>
    ))}
  </main>,
)
