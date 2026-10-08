# Imagery, animation and performance

## Assets
Choose relevant genuine product/user assets before placeholders. If generated images are requested and an image tool exists, use it and store license/asset provenance; else source legitimate licensed media or deliberate editable placeholder with clear labeling. Product photo must bind real catalog image where available. Keep crop/focal point/mobile variants, alt text, dimensions, lazy loading, LQIP if supported. No broken placeholder URL, no repeated unrelated stock images, no fake branded logo claims.

## Motion
Set motion language by brand (editorial reveal, tactile hover, subtle marquee, scroll parallax only where performant). Use GPU-friendly transform/opacity first; avoid huge JS animated layout thrash. Respect `prefers-reduced-motion`; no major content delayed invisibly; avoid generic fade-up on every block or carousel everywhere. Make overlays/nav/cart sheets smooth with correctly managed focus and scroll lock.

## Typography
Real fonts only if permitted/loaded. Distinct but readable hierarchy, consistency across headings/nav/product cards/CTA/body. No clipped glyphs, orphaned words due to narrow widths, unreadable contrast, accidental overflow or inconsistent button labels.

## Performance acceptance
Run actual Web Vitals or Lighthouse where possible and record measurements for mobile/desktop (not invented scores). Image sizes/responsive variants, lazy hydration, critical CSS, route code splitting where appropriate, caching/CDN; keep bundle and theme CSS within actual Storelib limits. Visual quality must not be bought with unusable mobile performance.

## Interaction checklist
Hover and tap don't require double-touch; touch targets adequate; popups and sticky header stable; anchor targets visible; no flash during modal/gallery load; scroll unblocks after close; reduced-motion paths verified; keyboard focus visible and restored.
