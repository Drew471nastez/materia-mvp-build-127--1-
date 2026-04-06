/**
 * Minimal pure-JS ZIP writer / reader for the storelib theme exporter.
 *
 * Implements only the parts of the ZIP format we actually need:
 *   - STORE method (no compression — fast, deterministic, deps-free)
 *   - Local file headers + central directory + end-of-central-directory record
 *
 * Why hand-rolled? Adding `jszip` would balloon the API bundle by ~100 KB
 * for one feature. The STORE format is ~120 lines and runs identically
 * in Node, Edge runtimes, and browsers — no native deps, no buffers.
 */

// CRC-32 table (precomputed for speed). Standard IEEE polynomial.
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

interface ZipFile {
  name: string
  bytes: Uint8Array
  crc: number
  size: number
  // offset of the local file header in the final archive
  offset: number
}

/**
 * Build a STORE-method ZIP archive in memory and return its bytes.
 *
 * Each entry is `{ name, data }` where `data` is either a string (encoded
 * as UTF-8) or raw bytes (Uint8Array / ArrayBuffer).
 */
export function buildZip(entries: { name: string; data: string | Uint8Array | ArrayBuffer }[]): Uint8Array {
  const files: ZipFile[] = []
  let offset = 0
  const localChunks: Uint8Array[] = []

  for (const entry of entries) {
    const bytes =
      typeof entry.data === "string"
        ? textEncoder.encode(entry.data)
        : entry.data instanceof Uint8Array
          ? entry.data
          : new Uint8Array(entry.data)
    const nameBytes = textEncoder.encode(entry.name)
    const crc = crc32(bytes)

    // Local file header (30 bytes + name + data)
    const header = new Uint8Array(30 + nameBytes.length)
    const dv = new DataView(header.buffer)
    dv.setUint32(0, 0x04034b50, true)              // local file header signature
    dv.setUint16(4, 20, true)                       // version needed to extract
    dv.setUint16(6, 0x0800, true)                   // general purpose bit flag (UTF-8)
    dv.setUint16(8, 0, true)                        // compression method = STORE
    dv.setUint16(10, 0, true)                       // last mod file time
    dv.setUint16(12, 0, true)                       // last mod file date
    dv.setUint32(14, crc, true)                     // crc-32
    dv.setUint32(18, bytes.length, true)            // compressed size
    dv.setUint32(22, bytes.length, true)            // uncompressed size
    dv.setUint16(26, nameBytes.length, true)        // file name length
    dv.setUint16(28, 0, true)                       // extra field length
    header.set(nameBytes, 30)

    localChunks.push(header)
    localChunks.push(bytes)

    files.push({ name: entry.name, bytes, crc, size: bytes.length, offset })
    offset += header.length + bytes.length
  }

  // Central directory
  const centralChunks: Uint8Array[] = []
  let centralSize = 0
  for (const f of files) {
    const nameBytes = textEncoder.encode(f.name)
    const cdh = new Uint8Array(46 + nameBytes.length)
    const dv = new DataView(cdh.buffer)
    dv.setUint32(0, 0x02014b50, true)               // central dir signature
    dv.setUint16(4, 20, true)                        // version made by
    dv.setUint16(6, 20, true)                        // version needed to extract
    dv.setUint16(8, 0x0800, true)                    // general purpose bit flag (UTF-8)
    dv.setUint16(10, 0, true)                        // compression method
    dv.setUint16(12, 0, true)                        // last mod file time
    dv.setUint16(14, 0, true)                        // last mod file date
    dv.setUint32(16, f.crc, true)                    // crc-32
    dv.setUint32(20, f.size, true)                   // compressed size
    dv.setUint32(24, f.size, true)                   // uncompressed size
    dv.setUint16(28, nameBytes.length, true)         // file name length
    dv.setUint16(30, 0, true)                        // extra field length
    dv.setUint16(32, 0, true)                        // file comment length
    dv.setUint16(34, 0, true)                        // disk number start
    dv.setUint16(36, 0, true)                        // internal file attributes
    dv.setUint32(38, 0, true)                        // external file attributes
    dv.setUint32(42, f.offset, true)                 // relative offset of local header
    cdh.set(nameBytes, 46)
    centralChunks.push(cdh)
    centralSize += cdh.length
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22)
  const dvE = new DataView(eocd.buffer)
  dvE.setUint32(0, 0x06054b50, true)                // EOCD signature
  dvE.setUint16(4, 0, true)                          // disk number
  dvE.setUint16(6, 0, true)                          // disk where central dir starts
  dvE.setUint16(8, files.length, true)               // number of central dir records on this disk
  dvE.setUint16(10, files.length, true)              // total number of central dir records
  dvE.setUint32(12, centralSize, true)               // size of central directory
  dvE.setUint32(16, offset, true)                    // offset of central directory
  dvE.setUint16(20, 0, true)                         // comment length

  // Concatenate everything in order: local files + central dir + EOCD
  const totalLen = offset + centralSize + 22
  const out = new Uint8Array(totalLen)
  let pos = 0
  for (const c of localChunks) {
    out.set(c, pos)
    pos += c.length
  }
  for (const c of centralChunks) {
    out.set(c, pos)
    pos += c.length
  }
  out.set(eocd, pos)

  return out
}

// ─── Reader ─────────────────────────────────────────────────────────────────

export interface ZipEntry {
  name: string
  bytes: Uint8Array
}

/**
 * Parse a STORE-method ZIP archive and return its entries as raw bytes.
 *
 * Walks the End-Of-Central-Directory record backwards from the end of the
 * buffer, then iterates the central directory to extract local file data.
 * Only STORE (method 0) entries are supported — exports we generate are
 * always STORE so this matches.
 */
export function parseZip(input: Uint8Array | ArrayBuffer): ZipEntry[] {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input)
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)

  // Locate EOCD (signature 0x06054b50). It is in the last ~64 KiB.
  let eocdOffset = -1
  const minStart = Math.max(0, buf.length - 0xffff - 22)
  for (let i = buf.length - 22; i >= minStart; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset < 0) throw new Error("Invalid zip: EOCD not found")

  const totalRecords = dv.getUint16(eocdOffset + 10, true)
  const cdOffset = dv.getUint32(eocdOffset + 16, true)

  const entries: ZipEntry[] = []
  let cursor = cdOffset
  for (let i = 0; i < totalRecords; i++) {
    if (dv.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("Invalid zip: bad central directory entry")
    }
    const compressedSize = dv.getUint32(cursor + 20, true)
    const nameLen = dv.getUint16(cursor + 28, true)
    const extraLen = dv.getUint16(cursor + 30, true)
    const commentLen = dv.getUint16(cursor + 32, true)
    const localHeaderOffset = dv.getUint32(cursor + 42, true)
    const name = textDecoder.decode(buf.subarray(cursor + 46, cursor + 46 + nameLen))

    // Find the file data inside the local header
    if (dv.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error("Invalid zip: bad local file header")
    }
    const localNameLen = dv.getUint16(localHeaderOffset + 26, true)
    const localExtraLen = dv.getUint16(localHeaderOffset + 28, true)
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen
    const bytes = buf.subarray(dataStart, dataStart + compressedSize)

    // Skip directories (entries whose name ends with "/")
    if (!name.endsWith("/")) {
      entries.push({ name, bytes: new Uint8Array(bytes) })
    }

    cursor += 46 + nameLen + extraLen + commentLen
  }
  return entries
}
