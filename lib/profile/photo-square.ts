/**
 * THE MIDDLE SQUARE OF A PICTURE, the part a round photo shows. Settings
 * sends a chosen profile photo straight up, without a crop sheet
 * (components/account/account-photo.tsx): the circle draws the file
 * object-cover while it uploads, which is exactly this square, so what was
 * seen in the circle is what was saved. Pure, so the suite can check it.
 */

/** The side of the square that goes up: well over twice the largest circle it is drawn in (the profile's 142px). */
export const PHOTO_SIDE = 512

export function centreSquare(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.max(1, Math.min(width, height))
  return { sx: Math.round((width - side) / 2), sy: Math.round((height - side) / 2), side }
}
