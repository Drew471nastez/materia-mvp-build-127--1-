/**
 * ===========================================================================
 *  KNOWN FILES FOR TRYING THE CHECKS
 * ===========================================================================
 * Small files built in memory, good and bad, so the admin test tool
 * (/admin/security) and the test suite can run the real check on real bytes
 * without anybody keeping a program or a zip bomb on disk. Nothing here is
 * harmful: the "program" is a header with no code, the "zip bomb" is a table
 * of contents that claims sizes its data does not have, and the EICAR string
 * is the industry's harmless test file.
 *
 * One of them does hold real packed data: the archive that LIES about its
 * sizes, which is the only way to try the check that unpacks a little
 * (zip.ts verifyZipEntries). Its entry is a few kilobytes of DEFLATE written
 * by hand here, which unpacks to eight megabytes of zeros while the table of
 * contents claims four kilobytes. Zeros, so nothing runs and nothing is
 * stored: it exists to be counted.
 *
 * Pure: no node:zlib, no network, nothing on disk.
 */

const enc = new TextEncoder()

/** The EICAR test file, built from two pieces so this source is never flagged itself. */
export function eicarBytes(): Uint8Array {
  return enc.encode(["X5O!P%@AP[4\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"].join(""))
}

/** A Windows program's header (MZ, a PE signature at 0x80), no code. */
export function peHeaderBytes(): Uint8Array {
  const b = new Uint8Array(512)
  b[0] = 0x4d
  b[1] = 0x5a
  b[0x3c] = 0x80
  b.set([0x50, 0x45, 0x00, 0x00], 0x80)
  return b
}

/** A Linux program's header (ELF), no code. */
export function elfHeaderBytes(): Uint8Array {
  const b = new Uint8Array(256)
  b.set([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01], 0)
  return b
}

export function pdfBytes(): Uint8Array {
  return enc.encode("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n")
}

export interface ZipSpec {
  name: string
  data?: Uint8Array
  /** Real DEFLATE bytes for this entry, so unpacking it produces something. */
  deflated?: Uint8Array
  /** Claimed in the directory instead of the real sizes (a crafted zip bomb). */
  claimUncompressed?: number
  claimCompressed?: number
  encrypted?: boolean
  /** Point this entry's directory record at an earlier entry's data (an overlapping bomb). */
  sameDataAs?: number
}

/* ── A run of zeros, packed by hand ──────────────────────────────────── */

/**
 * Bits into bytes, both ways round: DEFLATE writes its own fields from the
 * low bit up and its Huffman codes from the high bit down.
 */
class BitWriter {
  private readonly bytes: number[] = []
  private cur = 0
  private nbits = 0
  private bit(b: number) {
    this.cur |= (b & 1) << this.nbits
    if (++this.nbits === 8) {
      this.bytes.push(this.cur)
      this.cur = 0
      this.nbits = 0
    }
  }
  /** A plain field: lowest bit first. */
  field(value: number, count: number) {
    for (let i = 0; i < count; i++) this.bit(value >> i)
  }
  /** A Huffman code: highest bit first. */
  code(value: number, count: number) {
    for (let i = count - 1; i >= 0; i--) this.bit(value >> i)
  }
  finish(): Uint8Array {
    if (this.nbits > 0) this.bytes.push(this.cur)
    return new Uint8Array(this.bytes)
  }
}

/**
 * Raw DEFLATE (no zlib wrapper) for a run of zero bytes: one fixed Huffman
 * block, a single literal, then "copy 258 bytes from one byte back" over and
 * over. Thirteen bits buy 258 bytes, so the result is about 1 to 158, which
 * is what makes an archive able to lie about its sizes at all.
 *
 * Returns the packed bytes; `unpackedSize` says exactly what they unpack to.
 */
export function deflateZeros(atLeastBytes: number): { packed: Uint8Array; unpackedSize: number } {
  const matches = Math.max(1, Math.ceil((atLeastBytes - 1) / 258))
  const w = new BitWriter()
  w.field(1, 1) /* last block */
  w.field(1, 2) /* fixed Huffman */
  w.code(0x30, 8) /* literal 0x00 */
  for (let i = 0; i < matches; i++) {
    w.code(0xc5, 8) /* length 258 */
    w.code(0x00, 5) /* distance 1 */
  }
  w.code(0x00, 7) /* end of block */
  return { packed: w.finish(), unpackedSize: 1 + matches * 258 }
}

function le16(n: number) {
  return [n & 0xff, (n >>> 8) & 0xff]
}
function le32(n: number) {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
}

/** The method an entry is written with: DEFLATE when it holds packed data or claims to. */
function methodOf(e: ZipSpec): number {
  return e.deflated || e.claimUncompressed ? 8 : 0
}

/**
 * A ZIP whose entries are stored as they are given (or packed, when `deflated`
 * is), and whose directory says whatever `spec` says, true or not.
 */
export function buildZip(entries: ZipSpec[]): Uint8Array {
  const parts: number[] = []
  const offsets: number[] = []
  const names = entries.map((e) => enc.encode(e.name))
  entries.forEach((e, i) => {
    offsets.push(parts.length)
    const data = e.deflated ?? e.data ?? new Uint8Array(0)
    const flags = (e.encrypted ? 1 : 0) | 0x800
    parts.push(...le32(0x04034b50), ...le16(20), ...le16(flags), ...le16(methodOf(e)), ...le16(0), ...le16(0), ...le32(0))
    parts.push(...le32(data.length), ...le32(e.claimUncompressed ?? data.length), ...le16(names[i].length), ...le16(0))
    parts.push(...names[i], ...data)
  })
  const cdStart = parts.length
  entries.forEach((e, i) => {
    const data = e.deflated ?? e.data ?? new Uint8Array(0)
    const flags = (e.encrypted ? 1 : 0) | 0x800
    const method = methodOf(e)
    const at = e.sameDataAs !== undefined ? offsets[e.sameDataAs] : offsets[i]
    parts.push(...le32(0x02014b50), ...le16(20), ...le16(20), ...le16(flags), ...le16(method), ...le16(0), ...le16(0), ...le32(0))
    parts.push(...le32(e.claimCompressed ?? data.length), ...le32(e.claimUncompressed ?? data.length))
    parts.push(...le16(names[i].length), ...le16(0), ...le16(0), ...le16(0), ...le16(0), ...le32(0), ...le32(at))
    parts.push(...names[i])
  })
  const cdSize = parts.length - cdStart
  parts.push(...le32(0x06054b50), ...le16(0), ...le16(0), ...le16(entries.length), ...le16(entries.length), ...le32(cdSize), ...le32(cdStart), ...le16(0))
  return new Uint8Array(parts)
}

export type SampleId =
  | "pdf"
  | "zip_with_code"
  | "zip_encrypted"
  | "eicar"
  | "program_named_pdf"
  | "linux_program"
  | "double_extension"
  | "direction_mark_name"
  | "zip_slip"
  | "zip_bomb"
  | "zip_overlap"
  | "zip_with_program"
  | "zip_lying_sizes"

export interface Sample {
  id: SampleId
  label: string
  fileName: string
  expect: "accepted" | "refused"
  bytes: () => Uint8Array
}

const text = (s: string) => () => enc.encode(s)

export const SAMPLES: readonly Sample[] = [
  { id: "pdf", label: "An ordinary PDF", fileName: "guide.pdf", expect: "accepted", bytes: pdfBytes },
  {
    id: "zip_with_code",
    label: "A ZIP of source code (.js, .py, .sh)",
    fileName: "template.zip",
    expect: "accepted",
    bytes: () => buildZip([{ name: "src/app.js", data: enc.encode("console.log(1)\n") }, { name: "tools/build.py", data: enc.encode("print(1)\n") }, { name: "run.sh", data: enc.encode("#!/bin/sh\necho hi\n") }]),
  },
  { id: "zip_encrypted", label: "An encrypted ZIP", fileName: "locked.zip", expect: "accepted", bytes: () => buildZip([{ name: "secret.wav", data: new Uint8Array(64), encrypted: true }]) },
  { id: "eicar", label: "The EICAR test file", fileName: "eicar.txt", expect: "refused", bytes: eicarBytes },
  { id: "program_named_pdf", label: "A Windows program renamed .pdf", fileName: "invoice.pdf", expect: "refused", bytes: peHeaderBytes },
  { id: "linux_program", label: "A Linux program", fileName: "tool.bin", expect: "refused", bytes: elfHeaderBytes },
  { id: "double_extension", label: "invoice.pdf.exe", fileName: "invoice.pdf.exe", expect: "refused", bytes: text("not really a program") },
  { id: "direction_mark_name", label: "A name with a right to left override", fileName: "invoice‮fdp.exe", expect: "refused", bytes: text("x") },
  { id: "zip_slip", label: "A ZIP with ../ in a name", fileName: "pack.zip", expect: "refused", bytes: () => buildZip([{ name: "../../outside.txt", data: enc.encode("x") }]) },
  {
    id: "zip_bomb",
    label: "A zip bomb (claims 50 GB from 1 MB)",
    fileName: "bomb.zip",
    expect: "refused",
    bytes: () => buildZip([{ name: "zeros.bin", data: new Uint8Array(16), claimCompressed: 1024 * 1024, claimUncompressed: 0xfffffff0 }, ...Array.from({ length: 12 }, (_, i) => ({ name: `zeros${i}.bin`, data: new Uint8Array(16), claimCompressed: 1024 * 1024, claimUncompressed: 0xfffffff0 }))]),
  },
  {
    id: "zip_overlap",
    label: "An overlapping zip bomb",
    fileName: "overlap.zip",
    expect: "refused",
    bytes: () => buildZip([{ name: "a.txt", data: enc.encode("aaaa") }, { name: "b.txt", data: enc.encode("aaaa"), sameDataAs: 0 }]),
  },
  { id: "zip_with_program", label: "A ZIP with setup.exe inside", fileName: "installer.zip", expect: "refused", bytes: () => buildZip([{ name: "readme.txt", data: enc.encode("hi") }, { name: "setup.exe", data: peHeaderBytes() }]) },
  {
    id: "zip_lying_sizes",
    label: "An archive whose list claims 4 KB and whose entry unpacks to 8 MB",
    fileName: "pack.zip",
    expect: "refused",
    bytes: () => buildZip([{ name: "readme.txt", data: enc.encode("hi") }, { name: "data.bin", deflated: deflateZeros(8 * 1024 * 1024).packed, claimUncompressed: 4096 }]),
  },
]
