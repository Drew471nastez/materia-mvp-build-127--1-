# CLAUDE.md

Permanent instructions for working on **Storelib**.

**Read this file before every frontend or UI task, and follow it.**

These are persistent project rules, not suggestions. Do not overwrite, weaken,
summarise away, or remove anything in the section below unless the repository
owner explicitly asks for that change.

---

## Storelib design, UX, copywriting, and anti-AI-slop rules

> The section below is the owner's own wording. Keep it verbatim.

You are building Storelib, not a generic SaaS template.

Before changing UI, inspect the existing product, surrounding screens, components, spacing, typography, and interaction patterns. Preserve its visual language. If references or internet access are available, study real shipped products before inventing a solution.

Never choose a design because it is the easiest AI default.

Avoid generic shadcn styling, default Tailwind aesthetics, purple gradients, glassmorphism, bento grids, identical cards, giant heroes, excessive rounding, fake metrics, decorative whitespace, random pills, icons beside every label, generic dashboards, predictable left sidebars, and card inside card layouts.

Libraries provide behavior, accessibility, and primitives. They do not define Storelib's appearance. Restyle components deeply or build custom ones when necessary.

Start with user intent and hierarchy, not components. Remove UI before adding UI. Avoid unnecessary steps, modals, settings, explanations, and navigation.

Never write AI sounding copy such as unlock, elevate, seamless, powerful, effortlessly, supercharge, or transform. Avoid em dashes and unnecessary hyphens.

Prefer specific, compact, natural language.

After building, visually review the result. If it could belong to any SaaS product, redesign it.

---

## How to apply the rules in this repository

Everything below is observed from this codebase. It exists to make the rules
above actionable here, and it never overrides them. Where this section and the
rules above disagree, the rules above win.

### Look at the surrounding screens first

The rules say to inspect the existing product before changing UI. In practice
that means opening two or three neighbouring files under `app/app/` and
matching what they already do, rather than reaching for a component library
default.

`app/app/products/page.tsx` with its `products-client.tsx` and `loading.tsx` is
the reference shape for an `/app` page: a server component that reads its data,
a client component that renders it, and a deferred skeleton that only appears
on a slow load.

### The visual language already in use

Measured across `app/app/` and `components/app/`, so match it rather than
inventing a parallel one:

| Thing | Value |
| --- | --- |
| Page background | `#f8f9fa` |
| Card | `bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]` |
| Page container | `max-w-[1200px] mx-auto px-4 py-6 sm:px-6 lg:px-8` |
| Heading | `text-[24px] sm:text-[28px] font-bold text-[#1a1a2e]` |
| Body and muted text | `text-[14px] text-[#6b7280]` |
| Typeface | Inter |

Two action colours are both in service: the violet `#8b5cf6` accent used widely
across `/app`, and the near-black `#1a1a2e` used for primary actions on the
website builder surface. Neither is a gradient. Check the screen you are
working on and stay consistent with it instead of introducing a third.

Shared primitives live in `components/ui/`. Use them for behaviour and
accessibility, and restyle them, as the rules require. `ResponsiveActionMenu`
is the established pattern for a row of actions: a dropdown on desktop and a
bottom sheet on a phone.

### Native shell constraints

The iOS and Android apps are Capacitor shells that load `storelib.com` through
`server.url`. A fix written in Swift or Gradle needs an App Store release; a
fix written in the web layer ships with the next deploy. Solve native layout
problems in CSS and TypeScript.

Safe area insets are real on iOS and zero in a browser, so read them with
`env(safe-area-inset-*)` and never branch on a user agent. WKWebView ignores
`overscroll-behavior`, because its scroll is a native scroll view;
`components/platform/capacitor-bounce-guard.tsx` is what handles that.

When two parts of a layout need the same number, measure it once and share it.
Computing the same value twice, once in CSS and once in JavaScript, is where
the editor's black bands and collapsed sheets came from.

### Verify before claiming it works

The rules end with "visually review the result". Concretely:

```bash
pnpm build          # needs placeholder env vars, see below
npm run test:push   # the whole suite
pnpm exec eslint <files>
```

`pnpm` only. An `npm install` here writes a second lockfile and the suite fails
on it. A production build needs placeholders:

```bash
STRIPE_SECRET_KEY=sk_test_placeholder RESEND_API_KEY=re_placeholder \
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder SUPABASE_SERVICE_ROLE_KEY=placeholder \
NODE_OPTIONS=--max-old-space-size=6144 pnpm build
```

`scripts/check-*.mjs` render real markup in headless Chromium and measure it.
Add one when a claim is about geometry, colour, or motion, so the review is a
measurement rather than an opinion. Report what the numbers actually said,
including when they say the work is not done.

### Copy

The banned words in the rules above are not the whole list, they are the shape
of the problem. Name the thing that happens. "Edit website" rather than
"Launch your experience". A card with a picture, a name and a status does not
need a sentence underneath explaining that it is a card with a picture, a name
and a status.
