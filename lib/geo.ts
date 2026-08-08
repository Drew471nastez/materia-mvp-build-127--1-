/**
 * Distance between two points on the Earth, in kilometres.
 *
 * Haversine. Treats the planet as a sphere, which is wrong by about 0.5% at
 * worst — utterly irrelevant when the question is "which of these parcel
 * lockers is nearest", where the answer is dominated by which side of town you
 * are on and the walk from the car park.
 *
 * No dependency for this. It is eight lines of arithmetic, and a geo library
 * would be tens of kilobytes shipped to every buyer for one function.
 */

export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_KM = 6371

const toRad = (deg: number) => (deg * Math.PI) / 180

export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2)

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Is this a real coordinate, and not the null island a bad feed produces? */
export function isUsableCoord(v: { lat?: unknown; lng?: unknown } | null | undefined): v is LatLng {
  if (!v) return false
  const { lat, lng } = v as { lat: unknown; lng: unknown }
  if (typeof lat !== "number" || typeof lng !== "number") return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat === 0 && lng === 0) return false
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

/** "350 m" / "2,4 km" / "18 km" — precision that matches how far away it is. */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return ""
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`
  return `${Math.round(km)} km`
}
