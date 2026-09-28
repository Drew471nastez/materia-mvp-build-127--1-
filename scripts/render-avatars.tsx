/**
 * ===========================================================================
 *  EVERY PUBLIC SURFACE THAT DRAWS A FACE, ON THREE THEMES
 * ===========================================================================
 * For scripts/check-avatars.mjs. `?theme=light|dark|custom` paints the page
 * the way a creator's own storefront does, and the same five people are drawn
 * on every surface that draws one:
 *
 *   PHOTO      an account with a picture
 *   NO PHOTO   an account with a name and none
 *   ONE WORD   a name of one word, which is where two letters come from
 *   NO NAME    nothing at all: the plain person, never a "?"
 *   GONE       a picture whose address 404s, so it falls back while you watch
 *   SLOW       a picture whose host never answers, so the frame must not be
 *              blank while it hangs
 *
 * The surfaces are the real components wherever one can be rendered on its
 * own (the explore card, the subscribe bar, the product page's creator bar),
 * and the shared avatar with the exact props the call site passes where the
 * surface is a whole server page (the product page's creator row, the creator
 * page's header and its cards, the platform header, the library).
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { AppAvatar, AvatarMark } from "@/components/app/app-avatar"
import { CreatorCard } from "@/components/explore/creator-card"
import { SubscribeBar } from "@/components/store-builder/subscribe-bar"
import { ProductCreatorBar } from "@/components/store-builder/product-creator-bar"
import { defaultProductCreatorBarSettings, defaultSubscribeBarSettings } from "@/lib/store-builder/defaults"

const params = new URLSearchParams(location.search)
const theme = params.get("theme") || "light"
const origin = location.origin

/**
 * The three grounds. `dark` and `custom` write the same custom properties
 * lib/store-builder/storefront-chrome writes for a creator's colour scheme,
 * and `text` is what a themed call site passes as its own text colour.
 */
const THEMES = {
  light: {
    page: "#ffffff",
    text: undefined as string | undefined,
    bar: "#1a1a1a",
    tokens: {},
  },
  dark: {
    page: "#17171b",
    text: "#f4f4f6",
    bar: "#101014",
    tokens: {
      "--background": "#17171b",
      "--foreground": "#f4f4f6",
      "--card": "#232329",
      "--card-foreground": "#f4f4f6",
      "--muted": "#22222a",
      "--muted-foreground": "#9b9ba4",
      "--border": "#33333c",
    },
  },
  /* A creator who picked their own colours rather than a light or dark preset. */
  custom: {
    page: "#2e1c14",
    text: "#f6e7db",
    bar: "#7a3b22",
    tokens: {
      "--background": "#2e1c14",
      "--foreground": "#f6e7db",
      "--card": "#3a251a",
      "--card-foreground": "#f6e7db",
      "--muted": "#382419",
      "--muted-foreground": "#c3a898",
      "--border": "#4d3122",
    },
  },
} as const

const T = THEMES[theme as keyof typeof THEMES] ?? THEMES.light

const PEOPLE = [
  { key: "photo", name: "Ghita Nastase", photo: `${origin}/creator.png` },
  { key: "no-photo", name: "Mihai Popescu", photo: null },
  { key: "one-word", name: "Ana", photo: null },
  { key: "no-name", name: "", photo: null },
  { key: "gone", name: "Lena Ionescu", photo: `${origin}/gone.png` },
  { key: "slow", name: "Radu Enescu", photo: `${origin}/slow.png` },
] as const

/** What a themed call site hands the avatar: a tenth of the page's text for the ground, the text for the ink. */
const themed = T.text ? { backgroundColor: `${T.text}1f`, color: T.text } : undefined

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section data-surface={label} className="py-4">
      <p className="mb-2 text-[12px] font-medium opacity-60" style={{ color: T.text || "#6b7280" }}>
        {label}
      </p>
      {children}
    </section>
  )
}

function Page() {
  return (
    <div
      className={theme === "light" ? undefined : "dark"}
      style={{ ...(T.tokens as React.CSSProperties), backgroundColor: T.page, minHeight: "100vh" }}
    >
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
        {/* The explore page's creator card, the real component. */}
        <Row label="explore creator card">
          <div className="grid gap-3 sm:grid-cols-2">
            {PEOPLE.map((p) => (
              <CreatorCard
                key={p.key}
                creator={{
                  id: p.key,
                  slug: p.key,
                  headline: "Notion templates and dashboards",
                  products_count: 7,
                  profile: { display_name: p.name || null, avatar_url: p.photo, username: p.key },
                }}
              />
            ))}
          </div>
        </Row>

        {/* The product page's creator row and the unified renderer's, which pass the page's own text colour. */}
        <Row label="product page creator row">
          <div className="flex flex-wrap items-center gap-6">
            {PEOPLE.map((p) => (
              <span key={p.key} className="inline-flex items-center gap-3">
                <AppAvatar src={p.photo} name={p.name} alt="" size={40} markWhileLoading style={themed} />
                <span className="text-[14px] font-medium" style={{ color: T.text || "#1a1a2e" }}>
                  {p.name || "Creator"}
                </span>
              </span>
            ))}
          </div>
        </Row>

        {/* The creator page's own header, at the size ShopHeaderRenderer draws it. */}
        <Row label="creator page header">
          <div className="flex flex-wrap items-center gap-6">
            {PEOPLE.map((p) => (
              <AppAvatar key={p.key} src={p.photo} name={p.name} alt="" size={96} tone="theme" markWhileLoading />
            ))}
          </div>
        </Row>

        {/* The platform header and the marketing nav: the viewer's own photo, no mark while it loads. */}
        <Row label="platform header">
          <div className="flex flex-wrap items-center gap-4">
            {PEOPLE.map((p) => (
              <AppAvatar key={p.key} src={p.photo} name={p.name} alt="" size={40} className="border border-gray-200" />
            ))}
          </div>
        </Row>

        {/* The bars keep Radix's swap-when-decoded machinery; what they hold is the shared mark. */}
        <Row label="bar fallbacks">
          {/* On the bar's own colour, which is where this circle actually is. */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg p-3" style={{ backgroundColor: T.bar }}>
            {PEOPLE.map((p) => (
              <span
                key={p.key}
                data-bar-avatar=""
                className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full"
                style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "#ffffff" }}
              >
                <AvatarMark name={p.name} size={32} />
              </span>
            ))}
          </div>
        </Row>
      </div>

      {/* The real subscribe bar and the real product page creator bar, once per person. */}
      <div className="space-y-3 px-4 pb-10">
        {PEOPLE.map((p) => (
          <SubscribeBar
            key={`sub-${p.key}`}
            creatorId={p.key}
            settings={{
              ...defaultSubscribeBarSettings,
              visible: true,
              showAvatar: true,
              enableStickyBar: false,
              creatorName: p.name,
              avatarUrl: p.photo,
              backgroundColor: T.bar,
              textColor: "#ffffff",
            } as never}
          />
        ))}
        {PEOPLE.map((p) => (
          <ProductCreatorBar
            key={`bar-${p.key}`}
            settings={{ ...defaultProductCreatorBarSettings, visible: true, backgroundColor: T.bar } as never}
            creatorName={p.name}
            creatorId={p.key}
            creatorUsername={p.key}
            avatarUrl={p.photo ?? undefined}
            isEditorPreview
          />
        ))}
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
