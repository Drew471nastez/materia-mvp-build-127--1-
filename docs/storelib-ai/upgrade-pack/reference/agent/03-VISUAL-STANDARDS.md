# Design quality: avoid generic 'AI-made' sites

**Good design is category-specific, deliberate and cohesive, not just visually busy.** A good page is easy to use first, and memorable second.

## Art direction

Choose one visual concept for the brand and carry it through the entire site: e.g. utilitarian athletics, premium gallery, underground streetwear, friendly craft, playful toy shop, elegant wellness. Translate concept into tangible design choices, not just adjectives. Layout must change with content type. Do not reproduce the same hero, font, icons, cards, blur and gradient for every customer.

## Composition

- Hero must communicate what is sold and the next action within the first visible screen.
- Product-led brands should feature strong product presentation instead of abstract decorative blobs.
- Use intentional contrast in section density: large editorial hero, tight product grids, story-driven image/text split, feature comparison if helpful.
- Maintain alignment, whitespace, consistent spacing, readable measure and hierarchy; avoid stuffing a screen with feature cards.
- A section should have an answer to "Why does this belong here?". Remove filler.
- Mobile needs re-composed layout, thoughtful nav, readable imagery, tappable CTAs and sensible stacking.

## Typography

Select contrasting type roles with supported fonts. Limit families and weights. Use a purposeful headline scale; preserve line length and weight across devices; avoid styling every text block like a billboard. Build on existing design tokens so creators can customize without inconsistent hard-coded values.

## Motion

Motion should reinforce interaction: hover on product cards, add-to-bag state, section entrance, image switch, drawers and sticky header. Favor transform/opacity, limit concurrent motion, support reduced-motion, avoid blocking scroll and layout shifts. No arbitrary animation on every section.

## Images & assets

Use provided real media and catalog product images first; don't render unavailable external images. Store downloaded files only with proper rights/attribution where needed, valid MIME/signature, manifest registration, size budgets and alternative text. Avoid logos of brands unless user provided/authorized. No invented product photos that misrepresent goods.

## Quality checks

- First impression: category and offer obvious without reading small print.
- Visual differentiation: compared with last three generated sites, is this page actually distinct?
- Readability: strong contrast on imagery; deliberate background/text combinations.
- Functional: every visible button either works or clearly explains its unavailable state.
- Responsive: 375, 768 and 1440 CSS px reference widths, plus horizontal overflow scan.
- Accessibility: semantics, keyboard navigation, visible focus, labelled controls, sensible touch targets, no motion dependence.
- Performance: reserved image dimensions, compressed responsive assets, sensible lazy loading, avoid massive CSS/JS payloads.
- SEO: page-specific metadata, semantic headings, descriptive internal links, meaningful content.

## Anti-patterns

Vague "Elevate your journey" copy; random purple gradients; decorative icon tiles above every line; 6 identical bento boxes; testimonials that were never provided; links to `#`; products with imaginary prices; generic placeholders not connected to the catalog; invisible button text; beautiful previews that fail after publish; giant non-editable markup blocks that bypass Storelib settings.
