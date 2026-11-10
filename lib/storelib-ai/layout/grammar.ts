/**
 * ===========================================================================
 *  LAYOUT GRAMMAR: COMPOSITIONS, NOT A FIXED TEMPLATE (round O, O5)
 * ===========================================================================
 * Spec: DESIGN_INTELLIGENCE_2026 6.1 (layout grammar), 6.3 (conversion),
 * 6.4 (responsive art direction), 6.5 (copy); implementation brief B layer 2
 * and E.
 *
 * Each composition is a way to arrange a section, written for what an AI
 * component in Storelib can do (a .storelib section: template, scoped CSS,
 * schema). It records when it works and when it does not (content volume,
 * photos, intent), how it is art-directed on a phone (not a stack of the
 * desktop), and which motion primitives suit it. Site stories
 * (./stories.ts) are sequences of these, chosen per business.
 *
 * Pure data and text.
 */
import type { MotionRecipe } from "../motion"

export interface LayoutComposition {
  id: string
  name: string
  /** What it looks like. */
  does: string
  /** When it is the right choice. */
  when: string
  /** When it is not. */
  avoid: string
  /** Real photos it needs to work (0 = type-led). An empty frame means a different composition, never a random landscape. */
  photos: number
  /** How a phone gets it: art-directed, not the desktop stacked. */
  mobile: string
  /** Motion primitives that suit it (MOTION_RECIPES ids). */
  motion: MotionRecipe["id"][]
  /** Working examples to adapt (lib/storelib-ai/library/examples). */
  examples: string[]
}

export const LAYOUT_COMPOSITIONS: LayoutComposition[] = [
  { id: "full-bleed-photo-hero", name: "Edge-to-edge photographic opening", does: "one real photograph fills the first screen, the promise set where the photo is quiet, the action in reach", when: "the creator has a strong real photo of the person, place or work", avoid: "no real photo yet (use type-led-hero); a stock-looking crop", photos: 1, mobile: "a separate tall crop with the subject in the top two thirds, text below the subject or on a solid band, the button in the first screen", motion: ["image-scale-in", "mask-reveal"], examples: ["ai_video_hero", "ai_image_reveal"] },
  { id: "split-editorial", name: "Asymmetric editorial split", does: "a 7/5 or 8/4 split: a cropped photo on one side, a typographic column on the other, bleeding to the viewport edge on the photo side", when: "a person or product plus a clear paragraph of why", avoid: "four splits in a row; 50/50 by habit; a tall image beside two short lines", photos: 1, mobile: "written in phone order: photo first for products and portfolios, words first for services; the photo gets its own ratio (4/5)", motion: ["reveal-stagger", "image-scale-in"], examples: ["ai_image_reveal"] },
  { id: "type-led-hero", name: "Type-led opening", does: "the statement is the image: very large type set on purpose, a supporting line and one action, no photo needed", when: "no strong photo, a sharp promise, or a confident voice", avoid: "a centred headline over three cards; a generic promise", photos: 0, mobile: "line breaks chosen per line (blocks), a smaller clamp() step, the action in the first screen", motion: ["mask-reveal", "stagger-headline"], examples: ["ai_mask_reveal", "ai_split_text"] },
  { id: "manifesto", name: "Manifesto with quiet evidence", does: "an oversized multi-line statement of what the business believes, then two or three plain facts under it", when: "a point of view worth stating: a method, a refusal, a standard", avoid: "fog words; a statement any business could sign", photos: 0, mobile: "the statement keeps its size relative to the screen, the facts become a short list", motion: ["mask-reveal", "reveal-stagger"], examples: ["ai_mask_reveal"] },
  { id: "narrow-reading-column", name: "Narrow reading column", does: "a 60 to 68 character column with real rhythm: a story, a philosophy, a letter, with a pull quote or margin note", when: "the creator wrote something worth reading", avoid: "padding a page with filler paragraphs", photos: 0, mobile: "the same column at full width with a larger body size and generous leading", motion: ["reveal-stagger"], examples: ["ai_scroll_reveal"] },
  { id: "visual-dossier", name: "Visual dossier", does: "alternating full-width and inset photos with captions, like a printed feature", when: "five or more real photos of the work, space or process", avoid: "fewer than four photos; stock imagery", photos: 4, mobile: "one photo per screen, captions under each, insets go full width", motion: ["image-scale-in", "parallax-drift"], examples: ["ai_image_reveal", "ai_parallax_media"] },
  { id: "sticky-narrative", name: "Narrative sticky visual", does: "a picture column stays while two to five steps pass beside it", when: "a method, process or programme with distinct steps and a picture for each", avoid: "steps without pictures; more than one per page on a quiet site", photos: 2, mobile: "plain sequential steps, each with its own picture", motion: ["sticky-story"], examples: ["ai_sticky_story"] },
  { id: "unequal-mosaic", name: "Restrained mosaic", does: "a gallery of unequal proportions on an underlying grid, the hero image larger", when: "a body of visual work in different ratios", avoid: "a uniform grid of identical squares; fewer than five images", photos: 5, mobile: "two columns of unequal height, or a sideways strip", motion: ["image-scale-in"], examples: ["ai_hscroll_gallery"] },
  { id: "index-list", name: "Crisp index", does: "a typographic list of projects, services, programmes or packs, each row a link, a picture on hover", when: "several items a visitor chooses between", avoid: "items without their own page or detail", photos: 0, mobile: "rows with a small picture each; no hover-only content", motion: ["hover-index", "hover-lift"], examples: ["ai_hover_reveal_list", "ai_hover_lift"] },
  { id: "unequal-offers", name: "Unequal offer strip", does: "two or three real offers with deliberately different weights, the recommended one larger, real prices from the store", when: "the creator sells packages, programmes or plans", avoid: "three identical price cards; invented prices", photos: 0, mobile: "the recommended offer first, the others as compact rows", motion: ["hover-lift"], examples: ["ai_hover_lift", "ai_sticky_stack"] },
  { id: "photo-quote", name: "Photographic quote", does: "one real quote with a real name and a photo, set large", when: "the store has a real review or the creator supplied one with permission", avoid: "any invented testimonial; a carousel of five vague ones", photos: 1, mobile: "photo above, the quote at reading size", motion: ["reveal-stagger"], examples: [] },
  { id: "case-study", name: "Full-bleed case study", does: "one project told big: a wide photo, the brief, what was done, real outcomes, annotations", when: "real project detail exists", avoid: "made-up results or metrics", photos: 2, mobile: "photo, then the brief and outcome as a short list", motion: ["image-scale-in", "parallax-drift"], examples: ["ai_image_reveal"] },
  { id: "process-steps", name: "Numbered process", does: "three to five numbered steps of how working together goes", when: "the visitor's question is what happens after I click", avoid: "steps that say nothing (Step 1: Contact us)", photos: 0, mobile: "a vertical list with the numbers large", motion: ["reveal-stagger", "sticky-story"], examples: ["ai_scroll_reveal", "ai_sticky_story"] },
  { id: "anchored-detail", name: "Anchored detail with sticky contents", does: "a sticky table of contents beside long service or programme detail", when: "a lot of real detail (inclusions, schedules, policies)", avoid: "short pages", photos: 0, mobile: "the contents become a short jump list at the top", motion: [], examples: [] },
  { id: "booking-cta", name: "Minimal booking action", does: "one sentence, one real action (the booking form, the calendar link, the store's product), and what happens next", when: "the site's job is a booking or a consultation", avoid: "a button to nowhere; a promise of a booking system that does not exist", photos: 0, mobile: "the action full width at the bottom of the screen", motion: ["hover-lift"], examples: [] },
  { id: "product-editorial", name: "Long-form product editorial", does: "a product told like a feature: big image, what it is, how it is made, specs, the real buy button", when: "a hero product from the store", avoid: "products that are not in the store", photos: 2, mobile: "image, title, price and buy button in the first screen, the story below", motion: ["image-scale-in", "cursor-aware"], examples: ["ai_cursor_tilt", "ai_image_reveal"] },
  { id: "product-led-demo", name: "Product-led demonstration", does: "the real product or a real screenshot with accessible controls that show what it does (tabs, before and after, a player)", when: "the thing sold can be shown working: software, a pack, a preset, a course", avoid: "fake app UI; a demo of features the product does not have", photos: 1, mobile: "controls large enough to tap, one state per screen", motion: ["hover-lift"], examples: ["ai_tabs", "ai_before_after"] },
  { id: "credentials", name: "Real credentials", does: "qualifications, clients, publications or press that actually exist, set plainly", when: "the creator supplied them", avoid: "logo strips of companies that never worked with them", photos: 0, mobile: "a compact list, not a logo wall", motion: [], examples: [] },
  { id: "comparison-table", name: "Comparison table", does: "a real table of what each offer includes", when: "two or more offers with genuinely different contents", avoid: "one offer; invented tiers", photos: 0, mobile: "one offer per row with a toggle between them, or a sideways scroll with the first column fixed", motion: [], examples: ["ai_tabs"] },
  { id: "compact-faq", name: "Compact FAQ", does: "the questions people really ask, strong type, one open at a time", when: "there are real practical questions (equipment, level, delivery, licences)", avoid: "questions nobody asks; the default closer of every page", photos: 0, mobile: "full width rows, large tap targets", motion: [], examples: ["ai_faq_accordion"] },
  { id: "marquee-band", name: "Running band of real words", does: "a slow line of dates, releases or today's list between two sections", when: "real repeating facts (tour dates, class times, drops)", avoid: "slogans; more than one per page", photos: 0, mobile: "same, with the pause switch reachable", motion: ["marquee"], examples: ["ai_marquee"] },
  { id: "media-reel", name: "Work reel", does: "the creator's own video or audio first, with native controls", when: "film, music, performance: the work is moving image or sound", avoid: "autoplaying sound; a stock video", photos: 0, mobile: "a poster frame and a play control, no autoplay on cellular", motion: [], examples: ["ai_video_hero"] },
  { id: "signature-footer", name: "Brand-signature footer", does: "the name set large, real contact options, menus, sign up, language and currency", when: "always: every site ends on its own footer", avoid: "a default theme footer", photos: 0, mobile: "contact first, menus collapsed", motion: [], examples: ["ai_site_footer"] },
]

export function compositionById(id: string): LayoutComposition | undefined {
  return LAYOUT_COMPOSITIONS.find((c) => c.id === id)
}

/** 6.3: conversion is part of design. */
export const CONVERSION_RULES = [
  "Name the primary action before laying anything out (book, buy, enquire, join, listen) and give it one clear home in the first screen and one at the end.",
  "Every button goes somewhere real: a Storelib booking form, a product's checkout_url, a collection, a page you made, a form. Never href=\"#\", never a button that only looks clickable.",
  "Wire Storelib's own features rather than inventing a substitute: products and digital checkout, communities and memberships, forms and bookings, the subscribe form.",
  "Do not create or publish paid products, take payments or promise an integration that does not exist; where a fact is missing, leave the part out or give the creator a switch to turn it on.",
]

/** 6.4: responsive art direction. */
export const RESPONSIVE_RULES = [
  "Design each key section for the phone on purpose (360 to 390px): the headline wraps where you chose, the photo's subject is visible, the action is in the first screen.",
  "Phones get their own crop and focal point for photos, their own type step and their own order (write the DOM in phone order); never the desktop shrunk and stacked.",
  "Sticky, pinned and scroll-linked effects become plain sequential content under about 600px wide.",
  "Tap targets 44px or more, nothing only on hover, sideways galleries swipeable with visible progress and keyboard access, images with reserved ratios so nothing shifts.",
]

/** 6.5: copy is brand-specific. */
export const COPY_RULES = [
  "Short, concrete sentences about the actual offer and point of view: \"Training built around the hours you actually have\", not \"Unleash your best self\".",
  "No fog: unlock, elevate, transform, seamless, journey, next level, tailored solutions.",
  "No invented numbers, reviews, clients or credentials. Missing information means a section that does not need it, or an honest editable state the creator sees only in the editor.",
  "Write for this business's visitor: what they get, when, where, for how much, and what happens after they click.",
]

/** The grammar as prompt lines: one per composition. */
export function grammarForPrompt(ids?: string[]): string {
  const list = ids ? LAYOUT_COMPOSITIONS.filter((c) => ids.includes(c.id)) : LAYOUT_COMPOSITIONS
  return list.map((c) => `- ${c.id}: ${c.does}. When: ${c.when}. Not: ${c.avoid}. Phone: ${c.mobile}.`).join("\n")
}
