---
id: typography-type-library
title: The type library: complete type systems that load
category: typography
summary: Curated display, text and label pairings by voice and mood, all loadable on Storelib, with weights, tracking, leading and a fluid clamp() scale; Inter, Roboto, Poppins and friends never as the display face.
intents: [choose-fonts, choose-style, build-site, redesign]
tags: [fonts, type, typography, pairing, type-library, type-scale, clamp, tracking, serif, grotesk, mono, condensed, display, inter, poppins, montserrat]
components: [typography]
phases: [concept, plan, build, review]
priority: 5
related: [typography-pairings, typography-scale, typography-tracking-measure, anti-slop-typography-chaos, anti-slop-default-fonts]
version: 1
---
**Rule**: the display face carries the personality. Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Plus Jakarta Sans, Raleway, Arial, Helvetica and system-ui as the display face read as "nobody chose this" and are refused by the concept check and the anti-slop check, unless the creator named one (then the concept says allow "default-fonts"). They are fine as body text. Every family below is in the Typography list, so set_tokens fonts loads it for real.

**Not the default.** A huge italic display serif with mono all-caps labels on a cream page with a terracotta accent is the 2025-26 machine look (the editorial-serif cliché). The anti-slop check refuses that combination unless the creator asked for an editorial, literary or magazine feel. Pick the voice from the business: a coach, a gym, a trade or a shop is rarely a literary magazine. A serif below is one choice among the groups, never the starting point.

**Serif**
- Editorial italic (only when the creator asked for an editorial or literary feel): Instrument Serif 400 italic display (tracking -0.02em, leading 0.95), Instrument Sans text, labels in sentence case; ratio 1.5. Headlines huge, one or two words a line; never bold the serif. Never with a cream page and a terracotta accent together.
- Newsprint: Source Serif 4 600 for display and 400 for text, IBM Plex Mono for bylines; ratio 1.333.
- Soft serif: Fraunces 400 display, Karla text at 17px; ratio 1.333. Warm services, food, wellness.
- High contrast fashion: Bodoni Moda 500 caps display (only above 40px), Jost text, Jost caps labels tracked 0.18em; ratio 1.618.
- Heritage press: Young Serif display, Libre Franklin text and tracked caps labels; ratio 1.333.
- Luxe whisper: Cormorant Garamond italic display, Jost 300 text, tiny caps tracked 0.22em; ratio 1.5.
- Modern classic: DM Serif Display, DM Sans text; ratio 1.414. A personal brand pairing.

**Grotesk**
- Swiss grotesk: Inter Tight 600 display at -0.045em, leading 0.9, JetBrains Mono labels; ratio 1.618. Flush left, numbered sections.
- Characterful grotesk: Bricolage Grotesque 700 display at -0.035em, Hanken Grotesk text; ratio 1.5.
- News gothic: Schibsted Grotesk 800 headlines, 400 text, IBM Plex Mono dates; ratio 1.5.
- Wide display: Unbounded 700 caps for two or three words, Work Sans text, Space Mono labels.
- Art school: Syne 700 display, Familjen Grotesk text; ratio 1.618.
- Gallery label: Instrument Sans 500 small and exact beside big images, DM Mono captions; ratio 1.25.

**Condensed**
- Poster condensed: Anton caps (leading 0.88) filling the width, Archivo text, Archivo Narrow caps labels; ratio 1.618.
- Athletic numerals: Barlow Condensed 700 caps for times and prices, IBM Plex Sans text; ratio 1.5.
- Gothic poster: League Gothic caps stacked tall, Karla text, Space Mono dates; ratio 1.75.

**Mono, humanist, rounded**
- Terminal: JetBrains Mono 700 display at -0.04em, IBM Plex Sans text. Spec tables in mono.
- Typewriter zine: Space Mono for everything, hierarchy from size and one colour.
- Humanist clear: Literata 500 display, Atkinson Hyperlegible text; for services where clarity is the point.
- Soft rounded: Fredoka 600 display, Nunito Sans text; flat colour and hard shadows, not gradients.

**The scale**: fluid steps with clamp(), so a 96px headline is about 44px on a phone without a breakpoint. For ratio 1.333 between 360px and 1440px wide:
`--step-0: 1rem; --step-1: clamp(1.2rem, 1.155rem + 0.197vi, 1.333rem); --step-2: clamp(1.44rem, 1.327rem + 0.5vi, 1.777rem); --step-3: clamp(1.727rem, 1.513rem + 0.95vi, 2.369rem); --step-4: clamp(2.072rem, 1.711rem + 1.608vi, 3.157rem); --step-5: clamp(2.486rem, 1.912rem + 2.552vi, 4.209rem); --step-6: clamp(2.983rem, 2.107rem + 3.892vi, 5.61rem);`
Display gets its own tracking (negative for large lowercase, positive for caps and small labels), its own leading (0.86 to 1.05) and a chosen weight. Text stays 16 to 18px at 1.5 to 1.7. Numbers in prices, times and tables use font-variant-numeric: tabular-nums.

**How to apply**: set_tokens fonts { heading, body, accent } with the system's families; in components read var(--theme-font-heading) and var(--theme-font-body) with a real stack behind (serif, sans-serif or monospace), set the steps on the section root, and never hard code a family the tokens did not set.
