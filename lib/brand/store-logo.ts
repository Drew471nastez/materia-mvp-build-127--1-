/**
 * ===========================================================================
 *  A STORE'S LOGO: ITS CORNER, IN ONE PLACE (round 49)
 * ===========================================================================
 * The owner: a store's logo has "a little bit of rounded corners, just a
 * small radius, NOT much, and NO depth". So wherever a buyer sees a creator's
 * store logo (the checkout's shop bar, the order status page, the receipt,
 * the order help page, every email, the packing slip, the invoice PDF) it is
 * drawn at its own shape with these corners and no shadow.
 *
 * 6px at the 40px an email draws a logo, which is 15% of its height. A logo
 * drawn shorter keeps that proportion (32px is 4.8px), so a small one never
 * reads rounder than a large one, and none goes past 6px.
 *
 * On a wide wordmark the radius is only its four corners; a logo with a
 * transparent background shows no corner at all, which is right. Outlook on
 * Windows ignores border-radius on a picture and draws it square: fine.
 *
 * This is the STORE's logo only. Storelib's own mark has its own corner and
 * depth (lib/brand/logo.ts), and a person's photo stays a circle
 * (components/app/app-avatar).
 */
export const STORE_LOGO_RADIUS = 6
/** The corner as a share of the logo's height. */
export const STORE_LOGO_RADIUS_RATIO = 0.15

/** The corner for a logo drawn `height` px (or pt) tall: 15% of it, at most 6. */
export function storeLogoRadius(height: number): number {
  if (!(height > 0)) return STORE_LOGO_RADIUS
  return Math.min(STORE_LOGO_RADIUS, Math.round(height * STORE_LOGO_RADIUS_RATIO * 10) / 10)
}
