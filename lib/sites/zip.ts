/**
 * A zip file, written by hand.
 *
 * WHY NOT A LIBRARY. The project is a few dozen small text files and this is
 * ~70 lines; a zip dependency is a supply-chain surface, a bundle cost and an
 * upgrade obligation for something that has not changed since 1993. The format
 * used here is the plainest one that exists — STORED, no compression — which
 * is also the one with no edge cases: no deflate stream, no dictionary, no
 * checksum table beyond CRC-32.
 *
 * A downloaded project is the anti-lock-in promise in docs/storelib-sites.md
 * made real: it is a genuine Vite project, so `npm install && npm run dev`
 * works on a laptop with no Storelib involved.
 */

/** CRC-32, table-free. Slower than a lookup table, and imperceptible here. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff]
}

function u32(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]
}

/**
 * DOS date/time, which is what the format stores.
 *
 * Fixed rather than "now", so the same project always produces byte-identical
 * output — a download somebody diffs against yesterday's should differ only
 * where the files differ.
 */
const DOS_TIME = 0
const DOS_DATE = 33 // 1980-01-01

export function createZip(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder()
  const local: number[] = []
  const central: number[] = []
  let offset = 0

  // Sorted, so the archive is deterministic whatever order the map was built in.
  for (const path of Object.keys(files).sort()) {
    const name = encoder.encode(path)
    const content = encoder.encode(files[path])
    const crc = crc32(content)

    const header = [
      ...u32(0x04034b50), // local file header
      ...u16(20), // version needed
      ...u16(0), // flags
      ...u16(0), // method: stored
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(content.length),
      ...u32(content.length),
      ...u16(name.length),
      ...u16(0), // extra field length
    ]
    local.push(...header, ...name, ...content)

    central.push(
      ...u32(0x02014b50), // central directory header
      ...u16(20), // version made by
      ...u16(20), // version needed
      ...u16(0),
      ...u16(0),
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(content.length),
      ...u32(content.length),
      ...u16(name.length),
      ...u16(0), // extra
      ...u16(0), // comment
      ...u16(0), // disk number
      ...u16(0), // internal attributes
      ...u32(0), // external attributes
      ...u32(offset),
      ...name,
    )

    offset += header.length + name.length + content.length
  }

  const end = [
    ...u32(0x06054b50), // end of central directory
    ...u16(0),
    ...u16(0),
    ...u16(Object.keys(files).length),
    ...u16(Object.keys(files).length),
    ...u32(central.length),
    ...u32(offset),
    ...u16(0), // comment length
  ]

  return Uint8Array.from([...local, ...central, ...end])
}
