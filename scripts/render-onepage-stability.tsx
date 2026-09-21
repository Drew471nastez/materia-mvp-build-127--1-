/**
 * The published /links page, mounted for measurement.
 *
 * One header block with an avatar and one image block in carousel mode is
 * enough: the report is about those two things blinking, and a smaller page
 * makes the img churn count readable.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"

const px = (n: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="hsl(${n * 47},60%,60%)"/></svg>`,
  )}`

/* Marked so the probe can tell the avatar from a slide without guessing. */
const AVATAR = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect id="avatarmark" width="400" height="400" fill="#c084fc"/></svg>`,
)}`

const onepage = {
  id: "op_probe",
  title: "Satori Studio",
  bio: "Prints and posters",
  slug: "satori-studio",
  avatar_url: AVATAR,
  avatar_video_url: null,
  avatar_video_crop: null,
  theme: {
    background_type: "solid",
    background_color: "#101014",
    text_color: "#ffffff",
    button_color: "#ffffff",
    button_text_color: "#101014",
    button_style: "rounded",
    font_family: "Inter",
    spacing: "normal",
  } as any,
  blocks: [
    { id: "b_header", type: "header", sort_order: 0, enabled: true, data: { show_avatar: true, show_name: true, show_bio: true } },
    {
      id: "b_images",
      type: "image",
      sort_order: 1,
      enabled: true,
      data: {
        image_url: px(2),
        display_style: "carousel",
        carousel_autoplay: true,
        carousel_view: "1.2",
        aspect_ratio: "square",
        border_radius: "md",
        images: [2, 3, 4, 5, 6].map((n) => ({ id: `img_${n}`, image_url: px(n), alt_text: `Print ${n}` })),
      },
    },
  ] as any,
  social_links: {},
  /* The bell is on, because the subscribe panel is measured too. */
  settings: { show_branding: true, subscribe_enabled: true },
  seller_id: "seller_probe",
}

createRoot(document.getElementById("root")!).render(<PublicOnePage onepage={onepage} />)
