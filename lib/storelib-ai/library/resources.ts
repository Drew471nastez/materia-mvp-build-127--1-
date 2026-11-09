/**
 * ===========================================================================
 *  EXTERNAL COMPONENT LIBRARIES: WHAT THE AGENT MAY LEARN FROM
 * ===========================================================================
 * Pattern references, never imports. A generated Storelib section runs with
 * no npm (the runtime has none, see docs/ai-builder/architecture.md D8), so
 * nothing here is ever installed for a site. What the agent takes from these
 * libraries is how a component behaves and how it is made accessible, and it
 * writes its own markup and CSS. Copying a library's styling verbatim also
 * produces exactly the generic look CLAUDE.md asks us to avoid.
 *
 * LICENCES. Each `license` is an SPDX id only when it was read from the
 * project's own source on `verifiedOn` (the URL is in `verifiedFrom`).
 * Anything not confirmed there is "verify", with what to check in `toVerify`.
 * Do not upgrade one of those to an SPDX id from memory.
 *
 * `adapterSafe` (the contract's flag) is true only when a .storelib
 * re-implementation exists in the library. None does yet, so every entry is
 * false. `appDependency` says whether the Storelib APP (not generated sites)
 * already depends on the library in package.json, which matters only for
 * work on Storelib's own UI.
 *
 * Pure data. Browser safe.
 */
import type { ResourceEntry } from "@/lib/ai-builder/types"

export type IntegrationMode =
  /** Read the docs and examples, re-implement the behaviour originally. */
  | "reference-only"
  /** Do not use at all (unknown identity, or terms forbid what we would do). */
  | "not-allowed"

export interface ResourceRecord extends ResourceEntry {
  /** Who makes it and what it is, in one line. */
  what: string
  /** "verified": the licence was read from the source below. "partial": some parts verified. "unverified" or "unidentified". */
  licenseStatus: "verified" | "partial" | "unverified" | "unidentified"
  verifiedFrom?: string
  verifiedOn?: string
  /** What still needs checking before anything beyond reference use. */
  toVerify?: string
  commercialUse: string
  frameworks: string[]
  deps: string[]
  accessibility: string
  /** Components worth studying for Storelib sites. */
  storelibUses: string[]
  integration: IntegrationMode
  /** Already in the Storelib app's package.json (app UI only; generated sites never import). */
  appDependency: boolean
}

const VERIFIED_ON = "2026-11-09"

export const RESOURCES: ResourceRecord[] = [
  {
    id: "shadcn-ui",
    name: "shadcn/ui",
    what: "Copy into your project React components built on Radix primitives (and Base UI options) styled with Tailwind; distributed by a CLI, not a package.",
    url: "https://ui.shadcn.com",
    license: "MIT",
    licenseStatus: "verified",
    verifiedFrom: "https://github.com/shadcn-ui/ui/blob/main/LICENSE.md (MIT, copyright shadcn, 2023)",
    verifiedOn: VERIFIED_ON,
    commercialUse: "Allowed under MIT with the copyright notice kept in copied files.",
    frameworks: ["React", "Next.js", "Tailwind CSS"],
    deps: ["@radix-ui/*", "class-variance-authority", "clsx", "tailwind-merge", "lucide-react"],
    accessibility: "Inherits Radix behaviour (focus management, keyboard, ARIA). Styling defaults are generic; contrast and focus styles still need checking per design.",
    storelibUses: ["dialog and sheet behaviour", "form field anatomy with labels and errors", "tabs", "accordion", "dropdown menu", "toast", "command palette pattern"],
    integration: "reference-only",
    appDependency: true,
    adapterSafe: false,
    patterns: ["dialog", "sheet", "drawer", "tabs", "accordion", "dropdown-menu", "toast", "form", "input", "select", "tooltip", "popover", "carousel", "table"],
    notes: "Storelib's own components/ui already follows this model; CLAUDE.md requires deep restyling. Its default look is one of the most recognisable machine defaults, so learn behaviour, not appearance.",
  },
  {
    id: "radix-ui",
    name: "Radix UI Primitives",
    what: "Unstyled, accessible React primitives (dialog, popover, menus, tabs, accordion, slider...) by WorkOS.",
    url: "https://www.radix-ui.com/primitives",
    license: "MIT",
    licenseStatus: "verified",
    verifiedFrom: "https://github.com/radix-ui/primitives/blob/main/LICENSE (MIT, copyright WorkOS, 2022)",
    verifiedOn: VERIFIED_ON,
    commercialUse: "Allowed under MIT.",
    frameworks: ["React"],
    deps: ["react", "react-dom"],
    accessibility: "The reference for WAI-ARIA patterns in React: focus trapping, roving tabindex, typeahead, dismissable layers, collision aware positioning. Its docs list keyboard interactions per component; use them as the checklist for hand written equivalents.",
    storelibUses: ["keyboard maps for tabs, menus, radio groups", "dialog focus and scroll lock rules", "accordion semantics", "slider semantics for audio scrubbers"],
    integration: "reference-only",
    appDependency: true,
    adapterSafe: false,
    patterns: ["dialog", "alert-dialog", "popover", "dropdown-menu", "navigation-menu", "tabs", "accordion", "collapsible", "slider", "switch", "radio-group", "tooltip", "toast", "scroll-area"],
    notes: "Generated sections cannot import React packages; in sections prefer native <dialog>, popover, <details> and write the Radix keyboard behaviour by hand where native elements fall short.",
  },
  {
    id: "coss-ui",
    name: "coss ui (formerly Origin UI)",
    what: "Cal.com's design system. coss ui is built on Base UI with Tailwind; the legacy Origin UI collection (copy and paste Radix and shadcn style components) lives in the same repository under apps/origin and is served at coss.com/origin.",
    url: "https://coss.com/ui",
    license: "MIT",
    licenseStatus: "verified",
    verifiedFrom: "https://github.com/cosscom/ui README: \"This entire repository is licensed under the MIT License.\" Origin UI page: https://coss.com/origin",
    verifiedOn: VERIFIED_ON,
    toVerify: "Do not confuse with github.com/cosscom/coss (coss.com's email and SDK platform), which is AGPL-3.0-only by default. Only the cosscom/ui repository is MIT.",
    commercialUse: "Allowed under MIT for the cosscom/ui repository.",
    frameworks: ["React", "Tailwind CSS", "Base UI (coss ui)", "Radix (legacy Origin UI)"],
    deps: ["@base-ui-components/react (coss ui)", "@radix-ui/* (Origin UI)", "tailwindcss"],
    accessibility: "Inherits Base UI or Radix behaviour. Variants are many; check focus visibility and contrast of each copied variant.",
    storelibUses: ["input variants (with addons, character counts, validation)", "date and time pickers for booking-like forms", "file upload drop zones", "steppers and timelines", "pagination", "notification and banner variants"],
    integration: "reference-only",
    appDependency: false,
    adapterSafe: false,
    patterns: ["input", "textarea", "select", "checkbox", "radio", "switch", "slider", "file-upload", "stepper", "timeline", "pagination", "banner", "notification", "avatar", "badge", "table", "dialog"],
    notes: "Base UI is not in Storelib's package.json; do not add it in this workstream.",
  },
  {
    id: "tremor",
    name: "Tremor",
    what: "React components for dashboards and charts built on Recharts and Radix UI, with Tailwind styling, plus a paid blocks catalogue. Its site announces it is joining Vercel.",
    url: "https://www.tremor.so",
    license: "Apache-2.0",
    licenseStatus: "partial",
    verifiedFrom: "https://github.com/tremorlabs/tremor/blob/main/LICENSE (Apache License 2.0; notes MIT subcomponents from Radix, shadcn, radix-ui/themes, Medusa)",
    verifiedOn: VERIFIED_ON,
    toVerify: "The open source components are Apache-2.0 (NOTICE and licence must travel with copied code). The premium blocks and templates advertised on tremor.so are a separate offering whose terms were not read; treat them as not allowed.",
    commercialUse: "Open source components: allowed under Apache-2.0. Premium blocks: unverified, assume restricted.",
    frameworks: ["React", "Tailwind CSS"],
    deps: ["recharts", "@radix-ui/*", "tailwindcss", "date-fns or similar for date pickers"],
    accessibility: "Charts are SVG from Recharts; add text summaries and data tables yourself. Inputs inherit Radix.",
    storelibUses: ["chart conventions (direct labels, muted gridlines) for real store numbers in the app", "KPI cards for Storelib's own dashboards", "bar list and tracker patterns"],
    integration: "reference-only",
    appDependency: false,
    adapterSafe: false,
    patterns: ["area-chart", "bar-chart", "line-chart", "donut-chart", "bar-list", "tracker", "kpi-card", "date-range-picker", "table"],
    notes: "Recharts is already an app dependency, so Storelib's dashboards can follow Tremor's chart choices without installing Tremor. Generated marketing sites rarely need charts (see component-charts).",
  },
  {
    id: "aceternity-ui",
    name: "Aceternity UI",
    what: "Animated React and Tailwind components (spotlights, beams, 3D cards, parallax, text effects) with free components and a paid Pro tier of blocks and templates.",
    url: "https://ui.aceternity.com",
    license: "LicenseRef-Aceternity",
    licenseStatus: "partial",
    verifiedFrom: "https://ui.aceternity.com/licence (the Aceternity License)",
    verifiedOn: VERIFIED_ON,
    toVerify: "The licence page does not separate free from paid items. It allows end products for yourself or clients, but forbids redistributing items or derivatives as source, on any marketplace, or as themes or templates for sale. A website builder that hands generated code to many customers may be close to redistribution: get a written answer before using any Aceternity code. Pro components are paid and must never be copied.",
    commercialUse: "End products allowed; redistribution of source, templates or derivatives forbidden. Treat as reference-only for ideas, never code.",
    frameworks: ["React", "Next.js", "Tailwind CSS"],
    deps: ["framer-motion / motion", "tailwindcss", "clsx", "tailwind-merge", "sometimes three.js or @tsparticles"],
    accessibility: "Many effects are decorative and motion heavy; most do not handle prefers-reduced-motion or keyboard focus by default. Any idea taken from here needs reduced motion fallbacks and contrast checks.",
    storelibUses: ["inspiration for one signature motion in expressive or cinematic concepts (image reveals, card tilt, text reveal), re-implemented in CSS"],
    integration: "reference-only",
    appDependency: false,
    adapterSafe: false,
    patterns: ["spotlight", "card-hover-effect", "parallax-scroll", "text-generate-effect", "infinite-moving-cards", "background-beams", "3d-card"],
    notes: "These effects are the visual vocabulary the anti-slop layer flags (glow, beams, floating cards). Use only when the concept allows rich motion or glow, and never copy code.",
  },
  {
    id: "magic-ui",
    name: "Magic UI",
    what: "Animated React components (marquee, number ticker, animated beams, shimmer buttons, bento grid) built with Tailwind and Motion, positioned as a companion to shadcn/ui; also sells Pro templates.",
    url: "https://magicui.design",
    license: "MIT",
    licenseStatus: "partial",
    verifiedFrom: "https://github.com/magicuidesign/magicui/blob/main/LICENSE.md (MIT, copyright Magic UI)",
    verifiedOn: VERIFIED_ON,
    toVerify: "The open source repository is MIT. Magic UI Pro templates are a paid product whose licence was not read: never copy Pro code.",
    commercialUse: "Open source components: allowed under MIT. Pro: unverified, assume restricted.",
    frameworks: ["React", "Next.js", "Tailwind CSS"],
    deps: ["motion (framer-motion)", "tailwindcss", "clsx", "tailwind-merge"],
    accessibility: "Motion components need reduced motion handling added; marquees need pause controls (WCAG 2.2.2).",
    storelibUses: ["marquee mechanics for dates or real client names", "number ticker for real store numbers", "dock and orbiting patterns only for experimental concepts"],
    integration: "reference-only",
    appDependency: false,
    adapterSafe: false,
    patterns: ["marquee", "number-ticker", "animated-list", "bento-grid", "shimmer-button", "text-reveal", "blur-fade"],
    notes: "framer-motion is an app dependency, but generated sections use CSS motion. Several patterns (bento grid, shimmer buttons, animated beams) are anti-slop defaults; use only when the concept chooses them.",
  },
  {
    id: "21st-dev",
    name: "21st.dev",
    what: "A marketplace and registry of community published React and Tailwind components (shadcn compatible), plus AI tooling to generate components.",
    url: "https://21st.dev",
    license: "verify",
    licenseStatus: "unverified",
    verifiedFrom: "https://21st.dev/terms (read): marketplace content is owned by its authors and 21st Labs; components keep their own licence terms; redistributing, selling or copying content to other platforms without authorization or attribution is prohibited.",
    verifiedOn: VERIFIED_ON,
    toVerify: "There is no single licence. Each component must be checked for its author's licence (often MIT from an upstream project, sometimes none). Without a clear licence on the component's source, treat it as all rights reserved.",
    commercialUse: "Per component. Unknown until each component's licence is read.",
    frameworks: ["React", "Tailwind CSS"],
    deps: ["varies per component", "often shadcn/ui and motion"],
    accessibility: "Varies per author; no shared guarantee.",
    storelibUses: ["browsing how others solve a hero, pricing table or testimonial layout, then designing an original one"],
    integration: "reference-only",
    appDependency: false,
    adapterSafe: false,
    patterns: ["hero", "pricing", "testimonials", "navbar", "footer", "features"],
    notes: "Highest risk of copying someone's work without a licence, and of importing generic layouts. Ideas only.",
  },
  {
    id: "code-ui",
    name: "\"Code UI\" (unidentified)",
    what: "Named in the brief, but no component library called Code UI could be identified (searched 2026-11-09: only unrelated or tiny packages such as @codefast/ui and cui-react). It may be a mishearing of coss ui.",
    url: "https://coss.com/ui",
    license: "verify",
    licenseStatus: "unidentified",
    toVerify: "Ask which project was meant (a URL or npm name). If it means coss ui, use the coss-ui entry.",
    commercialUse: "Unknown.",
    frameworks: [],
    deps: [],
    accessibility: "Unknown.",
    storelibUses: [],
    integration: "not-allowed",
    appDependency: false,
    adapterSafe: false,
    patterns: [],
    notes: "Not guessed. The url points at coss ui only as the most likely intended project; nothing here is used until identified.",
  },
  {
    id: "shadow-ui",
    name: "\"Shadow UI\" (unidentified)",
    what: "Named in the brief, but no established library called Shadow UI could be identified (searched 2026-11-09: a small shadow-ui-react npm package with about 9 weekly downloads, an early React Native kit, and a Lit web components collection). It may be a mishearing of shadcn/ui.",
    url: "https://ui.shadcn.com",
    license: "verify",
    licenseStatus: "unidentified",
    toVerify: "Ask which project was meant. If it means shadcn/ui, use the shadcn-ui entry.",
    commercialUse: "Unknown.",
    frameworks: [],
    deps: [],
    accessibility: "Unknown.",
    storelibUses: [],
    integration: "not-allowed",
    appDependency: false,
    adapterSafe: false,
    patterns: [],
    notes: "Not guessed. The url points at shadcn/ui only as the most likely intended project; nothing here is used until identified.",
  },
]

export function resourceById(id: string): ResourceRecord | undefined {
  return RESOURCES.find((r) => r.id === id)
}

/** Libraries that document a pattern (e.g. "dialog", "marquee"), usable ones first. */
export function resourcesForPattern(pattern: string): ResourceRecord[] {
  const p = pattern.toLowerCase()
  return RESOURCES.filter((r) => r.integration !== "not-allowed" && r.patterns.some((x) => x === p || x.includes(p) || p.includes(x)))
}

/** One line per library, for a prompt. */
export function describeResources(): string {
  return RESOURCES.map(
    (r) => `${r.name} (${r.url}): licence ${r.license}${r.licenseStatus === "verified" ? "" : ` [${r.licenseStatus}]`}; ${r.integration}. Learn: ${r.storelibUses.join(", ") || "nothing until identified"}.`,
  ).join("\n")
}
