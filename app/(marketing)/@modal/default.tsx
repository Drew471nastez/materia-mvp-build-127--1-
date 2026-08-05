/**
 * Nothing, on every route that is not showing a modal.
 *
 * A parallel slot has to render SOMETHING for every route in its layout, and a
 * slot with no match and no default is a 404 for the whole page rather than an
 * empty slot. This file is what makes `@modal` safe to add to a layout that
 * hundreds of routes pass through: everywhere except an intercepted one, it is
 * this, and this is nothing.
 */
export default function NoModal() {
  return null
}
