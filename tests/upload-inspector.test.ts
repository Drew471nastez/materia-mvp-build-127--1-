/**
 * ===========================================================================
 *  THE CENTRAL UPLOAD CHECK, ON REAL BYTES
 * ===========================================================================
 * lib/security/uploads: what every upload path asks before a file is kept.
 *
 *   ACCEPTED    PDF, PNG, JPEG, WebP, MP3, WAV, MP4, a ZIP of code, an
 *               encrypted ZIP (with a note), unknown binary product files
 *   REFUSED     a program renamed .pdf, a Linux program, invoice.pdf.exe, a
 *               right to left override hiding .exe, EICAR, a ZIP with ../,
 *               a zip bomb (crafted sizes, overlapping entries, and an
 *               archive whose list UNDERSTATES what it unpacks to), a ZIP
 *               with setup.exe inside
 *   NAMES       the display name, the storage name, Content-Disposition,
 *               the path guard
 *   ENGINES     no malware engine unless SECURITY_MALWARE_PROVIDER names one,
 *               whatever CLAMAV_* holds
 *   WORDS       a creator only ever reads the plain sentences
 *   SPEED       a 10 GB ZIP is judged from two small reads, and what it
 *               declares is tested inside a fixed budget
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"

import { stripComments } from "./_source"
import {
  BLOCKED_EXTENSIONS,
  BLOCKED_IN_ARCHIVE,
  contentDisposition,
  extensionOf,
  findEndRecord,
  inspectHead,
  inspectUpload,
  isContainedPath,
  isSafeStoragePath,
  isTraversalPath,
  MAX_UPLOAD_BYTES,
  precheckUpload,
  readProviderSetting,
  sanitizeDisplayName,
  storageSafeName,
  userMessage,
  type InspectInput,
  type UploadContext,
} from "../lib/security/uploads"
import { buildZip, deflateZeros, eicarBytes, elfHeaderBytes, pdfBytes, peHeaderBytes, SAMPLES } from "../lib/security/uploads/samples"
import { nodeInflateRaw } from "../lib/security/uploads/zip-inflate"
import { readScannerSetup } from "../lib/security/file-scanner-core"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))
const enc = new TextEncoder()

/* Real file starts. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1f, 0x15, 0xc4, 0x89])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9])
const WEBP = enc.encode("RIFF\x24\x00\x00\x00WEBPVP8 \x18\x00\x00\x00")
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0x0a, 0xff, 0xfb, 0x90, 0x64])
const WAV = enc.encode("RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x02\x00")
const MP4 = new Uint8Array([0, 0, 0, 0x18, ...enc.encode("ftypisom"), 0, 0, 2, 0, ...enc.encode("isomiso2mp41")])

function whole(bytes: Uint8Array, fileName: string, context: UploadContext = "product_file", declaredMime?: string): InspectInput {
  return {
    fileName,
    declaredMime,
    size: bytes.length,
    head: bytes.subarray(0, 8192),
    tail: { bytes: bytes.subarray(Math.max(0, bytes.length - 70_000)), start: Math.max(0, bytes.length - 70_000) },
    readRange: async (a, b) => bytes.subarray(a, b + 1),
    inflate: nodeInflateRaw,
    context,
  }
}

async function main() {
  console.log("\nOrdinary files go straight through\n")
  for (const [name, bytes, mime] of [
    ["guide.pdf", pdfBytes(), "application/pdf"],
    ["cover.png", PNG, "image/png"],
    ["photo.jpg", JPEG, "image/jpeg"],
    ["photo.webp", WEBP, "image/webp"],
    ["beat.mp3", MP3, "audio/mpeg"],
    ["stem.wav", WAV, "audio/wav"],
    ["lesson.mp4", MP4, "video/mp4"],
  ] as [string, Uint8Array, string][]) {
    const v = await inspectUpload(whole(bytes, name, "product_file", mime))
    check(`${name} is accepted, and read as ${v.detectedType}`, v.ok && v.code === "accepted" && v.userMessage === "" && v.notes.length === 0, v)
  }
  for (const [name, bytes] of [["a.png", PNG], ["a.jpg", JPEG], ["a.webp", WEBP]] as [string, Uint8Array][]) {
    check(`${name} is a picture where only pictures go`, (await inspectUpload(whole(bytes, name, "public_image"))).ok)
  }
  check("an MP4 is a video where only videos go", (await inspectUpload(whole(MP4, "clip.mp4", "video", "video/mp4"))).ok)

  const code1 = await inspectUpload(whole(SAMPLES.find((s) => s.id === "zip_with_code")!.bytes(), "template.zip"))
  check("a ZIP of .js, .py and .sh source is accepted (selling code is a core use)", code1.ok && code1.archive?.inspected === true && code1.archive.entries === 3, code1)
  const locked = await inspectUpload(whole(SAMPLES.find((s) => s.id === "zip_encrypted")!.bytes(), "locked.zip"))
  check("an encrypted ZIP is accepted, with a note for the log", locked.ok && locked.notes.some((n) => n.code === "zip_encrypted"), locked)

  const unknown = await inspectUpload(whole(new Uint8Array([0x13, 0x37, 0x00, 0x42, 1, 2, 3, 4, 5, 6]), "Bass.fxp"))
  check("an unknown binary product file (a synth preset) is accepted, with a note", unknown.ok && unknown.notes.some((n) => n.code === "unknown_type"), unknown)
  for (const name of ["Kit.als", "Song.flp", "Drums.nki", "Look.cube", "Preset.xmp", "Grade.lrtemplate", "Scene.blend", "Model.fbx", "Mockup.psd", "Logo.ai", "Board.sketch", "Brush.procreate", "Font.otf", "Font.woff2", "Book.epub", "Data.csv", "Notes.md", "Config.json", "Plugin.adg", "Scene.c4d", "App.apk", "Shot.dng", "Art.afdesign", "Track.flac", "Take.aiff", "Voice.m4a", "Ogg.ogg", "Film.mov", "Film.webm", "Film.mkv"]) {
    const pre = precheckUpload({ fileName: name, size: 1024, context: "product_file" })
    if (!pre.ok) check(`${name} can be sold`, false, pre)
  }
  check("thirty kinds creators sell (presets, projects, design files, fonts, documents, media) all pass the name check", true)
  const renamed = await inspectUpload(whole(PNG, "photo.pdf"))
  check("a PNG called .pdf is harmless: accepted, and the mismatch noted", renamed.ok && renamed.notes.some((n) => n.code === "extension_mismatch"), renamed)

  console.log("\nDangerous files are refused\n")
  const mz = await inspectUpload(whole(peHeaderBytes(), "invoice.pdf", "product_file", "application/pdf"))
  check("a Windows program renamed invoice.pdf is refused by its bytes", !mz.ok && mz.code === "executable_signature", mz)
  const elf = await inspectUpload(whole(elfHeaderBytes(), "tool.bin"))
  check("a Linux program is refused", !elf.ok && elf.code === "executable_signature", elf)
  const dbl = await inspectUpload(whole(enc.encode("hello"), "invoice.pdf.exe"))
  check("invoice.pdf.exe is refused by its name", !dbl.ok && dbl.code === "blocked_extension", dbl)
  check("so is a trailing dot or space Windows would drop", !precheckUpload({ fileName: "setup.exe. ", size: 5, context: "product_file" }).ok)
  const rtl = await inspectUpload(whole(enc.encode("x"), "invoice\u202Efdp.exe"))
  check("a right to left override hiding .exe is refused (the real extension is read)", !rtl.ok && rtl.code === "blocked_extension", rtl)
  const eicar = await inspectUpload(whole(eicarBytes(), "notes.txt", "product_file", "text/plain"))
  check("the EICAR test file is refused, whatever it is called", !eicar.ok && eicar.code === "malware_test_signature", eicar)
  const script = inspectHead(whole(enc.encode("#!/bin/bash\nrm -rf /\n"), "invoice.pdf"))
  check("a shell script behind a document's name is refused", !script.ok && script.code === "script_in_document", script)
  const plainText = inspectHead(whole(enc.encode("#!/bin/bash\necho hi\n"), "notes.txt"))
  check("but a .txt whose first line happens to be one is ordinary writing, and accepted", plainText.ok, plainText)
  const picture = inspectHead(whole(enc.encode("#!/bin/sh\n"), "cover.png", "public_image"))
  check("and a picture that is really a script is still refused", !picture.ok, picture)
  const page = inspectHead(whole(enc.encode("<!doctype html><script>alert(1)</script>"), "photo.jpg"))
  check("a web page behind a picture's name is refused", !page.ok, page)
  check("a declared program type is refused", !precheckUpload({ fileName: "a.bin", size: 5, declaredMime: "application/x-msdownload", context: "product_file" }).ok)
  for (const ext of ["exe", "dll", "scr", "com", "pif", "msi", "msp", "bat", "cmd", "vbs", "vbe", "jse", "wsf", "wsh", "hta", "cpl", "lnk", "reg", "ps1", "psm1", "jar", "pkg", "dmg", "app"]) {
    if (!BLOCKED_EXTENSIONS.has(ext)) check(`.${ext} is refused as an upload`, false)
  }
  check("every launcher the owner named, and .pkg/.dmg/.app, is refused as an upload", true)

  const slip = await inspectUpload(whole(SAMPLES.find((s) => s.id === "zip_slip")!.bytes(), "pack.zip"))
  check("a ZIP with ../ in an entry name is refused (zip slip)", !slip.ok && slip.code === "zip_traversal", slip)
  for (const bad of [
    "/etc/passwd",
    "C:\\Windows\\x.dll",
    "..\\..\\x.txt",
    "a/../../b",
    "\\\\server\\share\\x",
    /* Windows drops the space, so each of these makes the folder "..". */
    ".. /.. /evil.txt",
    "a/.. /.. /x.txt",
    "..\u200b/x.txt",
    "..\u202e/x.txt",
  ]) {
    if (!isTraversalPath(bad)) check(`"${bad}" is a traversal`, false)
  }
  check("absolute paths, drive letters, backslash climbs and UNC shares are traversals", !isTraversalPath("folder\\file.wav") && !isTraversalPath("Samples/Kick 01.wav"))
  const bomb = await inspectUpload(whole(SAMPLES.find((s) => s.id === "zip_bomb")!.bytes(), "bomb.zip"))
  check("a zip bomb (a crafted directory claiming huge sizes) is refused", !bomb.ok && (bomb.code === "zip_bomb_ratio" || bomb.code === "zip_bomb_total"), bomb)
  const overlap = await inspectUpload(whole(SAMPLES.find((s) => s.id === "zip_overlap")!.bytes(), "overlap.zip"))
  check("an overlapping zip bomb (entries sharing data) is refused", !overlap.ok && overlap.code === "zip_overlap", overlap)
  const withExe = await inspectUpload(whole(SAMPLES.find((s) => s.id === "zip_with_program")!.bytes(), "installer.zip"))
  check("a ZIP with setup.exe inside is refused", !withExe.ok && withExe.code === "zip_blocked_entry", withExe)
  const withJs = await inspectUpload(whole(buildZip([{ name: "theme/app.js", data: enc.encode("x") }, { name: "theme/index.html", data: enc.encode("<p>") }]), "theme.zip"))
  check("a ZIP with .js and .html inside is accepted", withJs.ok, withJs)
  const withVst = await inspectUpload(whole(buildZip([{ name: "Plugin.dll", data: new Uint8Array(8) }, { name: "Mod.jar", data: new Uint8Array(8) }]), "plugin.zip"))
  check("a ZIP with a VST .dll and a .jar is accepted (loaded by a host, not double clicked)", withVst.ok && !BLOCKED_IN_ARCHIVE.has("dll") && !BLOCKED_IN_ARCHIVE.has("jar"), withVst)
  const nested = await inspectUpload(whole(buildZip([{ name: "inner.zip", data: buildZip([{ name: "setup.exe", data: new Uint8Array(4) }]) }]), "outer.zip"))
  check("an archive inside is counted, never opened", nested.ok && nested.archive?.nestedArchives === 1 && nested.notes.some((n) => n.code === "zip_nested_archive"), nested)
  const theme = await inspectUpload(whole(buildZip([{ name: "assets/run.sh", data: enc.encode("#!/bin/sh") }]), "package.zip", "theme_package"))
  check("a theme package may hold nothing runnable at all", !theme.ok && theme.code === "zip_blocked_entry", theme)

  console.log("\nCode a creator sells as one file\n")
  for (const [name, bytes] of [
    ["Animate Text.jsx", enc.encode("// After Effects script\nvar comp = app.project.activeItem;\n")],
    ["resize.py", enc.encode("import sys\nprint(sys.argv)\n")],
    ["build.sh", enc.encode("#!/bin/sh\nset -e\necho building\n")],
    ["plugin.js", enc.encode("figma.showUI(__html__)\n")],
    ["helper.rb", enc.encode("puts 1\n")],
    ["index.php", enc.encode("<?php echo 1;\n")],
  ] as [string, Uint8Array][]) {
    const v = await inspectUpload(whole(bytes, name))
    check(`${name} can be sold as a product file`, v.ok, { code: v.code, detail: v.detail })
    const asLead = precheckUpload({ fileName: name, size: bytes.length, context: "link_page_file" })
    check(`and ${name} is still refused where a browser could open it`, !asLead.ok, asLead)
  }
  check("a real program is still refused however it is named", !(await inspectUpload(whole(peHeaderBytes(), "script.jsx"))).ok)
  check("and .exe, .bat and .ps1 are still refused as a product file", ["setup.exe", "run.bat", "go.ps1", "x.vbs", "y.msi"].every((n) => !precheckUpload({ fileName: n, size: 10, context: "product_file" }).ok))

  console.log("\nAn archive is whatever has an archive's end, whatever its start says\n")
  {
    const inner = buildZip([{ name: "readme.txt", data: enc.encode("hi") }, { name: "setup.exe", data: peHeaderBytes() }])
    /* "%PDF-1.4" and some padding in front of a real archive: every unpacker
       finds the end record and extracts it, and the first bytes read as a PDF. */
    const glued = new Uint8Array(pdfBytes().length + 4096 + inner.length)
    glued.set(pdfBytes(), 0)
    glued.set(inner, glued.length - inner.length)
    const v = await inspectUpload(whole(glued, "freebie.pdf", "product_file", "application/pdf"))
    check("an archive behind a PDF's first bytes is still opened and refused", !v.ok && v.code === "zip_blocked_entry", { ok: v.ok, code: v.code, detail: v.detail })
    check("and the verdict says it was an archive wearing another format", v.notes.some((n) => n.code === "zip_behind_another_format"), v.notes)

    const slipGlued = new Uint8Array(pdfBytes().length + 4096 + 1)
    const slipInner = buildZip([{ name: "../../evil.exe", data: enc.encode("x") }])
    const both = new Uint8Array(pdfBytes().length + 4096 + slipInner.length)
    both.set(pdfBytes(), 0)
    both.set(slipInner, both.length - slipInner.length)
    const v2 = await inspectUpload(whole(both, "notes.pdf", "product_file", "application/pdf"))
    check("so is one that climbs out of the folder it unpacks into", !v2.ok && (v2.code === "zip_traversal" || v2.code === "zip_blocked_entry"), { ok: v2.ok, code: v2.code })
    void slipGlued
  }

  console.log("\nAn archive whose list cannot be read does not get in\n")
  {
    /* An end record promising a list far past the ceiling: every check inside
       used to be skipped and the file kept. */
    const real = buildZip([{ name: "a.txt", data: enc.encode("hi") }])
    const end = findEndRecord(real, 0)!
    const huge = new Uint8Array(real)
    new DataView(huge.buffer).setUint32(huge.length - 22 + 12, 100 * 1024 * 1024, true)
    const v = await inspectUpload(whole(huge, "pack.zip"))
    check("a list larger than the ceiling is refused, not waved through", !v.ok && (v.code === "zip_directory_unreadable" || v.code === "zip_too_many_entries"), { ok: v.ok, code: v.code, detail: v.detail })
    check("and the creator reads one calm sentence", v.userMessage === "We couldn't accept this file. Try another file.", v.userMessage)

    /* FOUR BYTES THAT HAPPEN TO LOOK LIKE ONE. A big video has tens of
       thousands of places in its last 64 KB where the end record's own four
       bytes can turn up by chance, and refusing those would refuse real
       files. A chance match does not also end exactly at the end of the
       file, which is what tells them apart. */
    const video = new Uint8Array(200_000)
    video.set(MP4, 0)
    /* An end record's signature, claiming a 90 MB list, a long way from the end. */
    video.set([0x50, 0x4b, 0x05, 0x06], 120_000)
    new DataView(video.buffer).setUint32(120_000 + 12, 90 * 1024 * 1024, true)
    const chance = await inspectUpload(whole(video, "lesson-04.mp4", "product_file", "video/mp4"))
    check("a video with those four bytes somewhere inside is still accepted", chance.ok, { ok: chance.ok, code: chance.code, detail: chance.detail })
    const sameInAudio = await inspectUpload(whole(video, "stem.wav"))
    check("and so is any other large file", sameInAudio.ok, { ok: sameInAudio.ok, code: sameInAudio.code })

    /* The same, but storage would not answer at all: kept, and written down. */
    const outage = await inspectUpload({ fileName: "pack.zip", size: 900_000_000, head: real.subarray(0, 64), context: "product_file", readRange: async () => null })
    check("a storage outage still accepts the file, with a note for the admin", outage.ok && outage.notes.some((n) => n.code === "zip_not_inspected"), outage)
    void end
  }

  console.log("\nAn archive that lies about its sizes is opened, a little\n")
  {
    /* Real DEFLATE: 8 MB of zeros from a few kilobytes (lib/security/uploads/samples.ts). */
    const { packed, unpackedSize } = deflateZeros(8 * 1024 * 1024)
    check("the packed run really does unpack far past what it costs", unpackedSize >= 8 * 1024 * 1024 && packed.length < unpackedSize / 100, { packed: packed.length, unpackedSize })

    const liar = buildZip([{ name: "readme.txt", data: enc.encode("hi") }, { name: "data.bin", deflated: packed, claimUncompressed: 4096 }])
    const beforeVerify = await inspectUpload({ ...whole(liar, "pack.zip"), inflate: undefined })
    check("its table of contents alone finds nothing wrong (this was the gap)", beforeVerify.ok, beforeVerify)
    const t0 = Date.now()
    const caught = await inspectUpload(whole(liar, "pack.zip"))
    const tookMs = Date.now() - t0
    check("unpacking a little catches it, and it is refused", !caught.ok && caught.code === "zip_bomb_ratio", caught)
    check("the creator reads one calm sentence, nothing about archives", caught.userMessage === "We couldn't accept this file. Try another file.", caught.userMessage)
    check(`and it took well under a second (${tookMs} ms)`, tookMs < 1000, tookMs)

    /* The same bytes, declared honestly: an ordinary large archive. */
    const honest = buildZip([{ name: "readme.txt", data: enc.encode("hi") }, { name: "data.bin", deflated: packed, claimUncompressed: unpackedSize }])
    const t1 = Date.now()
    const fine = await inspectUpload(whole(honest, "course.zip"))
    const honestMs = Date.now() - t1
    check("an ordinary archive whose sizes are true is accepted", fine.ok && (fine.archive?.verified ?? 0) >= 1, fine)
    check(`and is not slowed down by the check (${honestMs} ms)`, honestMs < 1000, honestMs)

    /* Nothing packed, nothing to unpack. */
    const stored = await inspectUpload(whole(buildZip([{ name: "a.wav", data: new Uint8Array(2048) }]), "kit.zip"))
    check("a stored (uncompressed) archive is accepted with nothing unpacked", stored.ok && (stored.archive?.verified ?? 0) === 0, stored)

    /* Unpacking that cannot run is a note, never a refusal and never a wait. */
    const cannot = await inspectUpload({ ...whole(liar, "pack.zip"), inflate: async () => null })
    check("unpacking that cannot run is a note, not a refusal", cannot.ok && cannot.notes.some((n) => n.code === "zip_sizes_not_verified"), cannot)
  }
  for (const s of SAMPLES) {
    const v = await inspectUpload(whole(s.bytes(), s.fileName))
    if ((s.expect === "accepted") !== v.ok) check(`sample "${s.label}" is ${s.expect}`, false, v)
  }
  check(`the ${SAMPLES.length} admin test samples all give the verdict they promise`, true)

  console.log("\nA large ZIP is judged from small reads, and never left waiting\n")
  {
    const real = buildZip([{ name: "a.wav", data: new Uint8Array(100) }])
    const end = findEndRecord(real, 0)!
    /* The same directory at the end of a 3.9 GB file. */
    const size = 3_900_000_000
    const dirAndEnd = new Uint8Array(real.subarray(end.directoryOffset))
    new DataView(dirAndEnd.buffer).setUint32(dirAndEnd.length - 22 + 16, size - dirAndEnd.length, true)
    const reads: [number, number][] = []
    const v = await inspectUpload({
      fileName: "course.zip",
      size,
      head: real.subarray(0, 64),
      tail: null,
      context: "product_file",
      readRange: async (a, b) => {
        reads.push([a, b])
        if (b !== size - 1) return null
        const out = new Uint8Array(b - a + 1)
        out.set(dirAndEnd, out.length - dirAndEnd.length)
        return out
      },
    })
    check("accepted, with the directory read from the end", v.ok && v.archive?.inspected === true && v.archive.entries === 1, { v, reads })
    check("with one read of under 70 KB, never the whole file", reads.length === 1 && reads[0][1] - reads[0][0] < 70_000, reads)
    const slow = await inspectUpload({ fileName: "slow.zip", size, head: real.subarray(0, 64), context: "product_file", readRange: async () => null })
    check("a directory that cannot be read is accepted on the other checks, with a note (never in limbo)", slow.ok && slow.notes.some((n) => n.code === "zip_not_inspected"), slow)
  }

  console.log("\nSizes, per context\n")
  check("product files up to 10 GB", MAX_UPLOAD_BYTES.product_file === 10 * 1024 ** 3 && precheckUpload({ fileName: "a.zip", size: 10 * 1024 ** 3, context: "product_file" }).ok)
  const big = precheckUpload({ fileName: "a.zip", size: 10 * 1024 ** 3 + 1, context: "product_file" })
  check("one byte over is refused, and the limit is named", !big.ok && big.userMessage === "This file is too large. The limit is 10 GB.", big.userMessage)
  check("pictures up to 25 MB", MAX_UPLOAD_BYTES.public_image === 25 * 1024 * 1024 && !precheckUpload({ fileName: "a.png", size: 26 * 1024 * 1024, context: "public_image" }).ok)
  check("an empty file is refused", !precheckUpload({ fileName: "a.pdf", size: 0, context: "product_file" }).ok)
  check("a picture context takes only pictures, by bytes", !inspectHead(whole(pdfBytes(), "a.png", "public_image")).ok)
  check("an SVG is never a picture", !inspectHead(whole(enc.encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), "a.svg", "public_image")).ok)
  check("a link page file is never a web page", !precheckUpload({ fileName: "page.html", size: 10, context: "link_page_file" }).ok && !inspectHead(whole(enc.encode("<!doctype html><p>"), "x.txt", "link_page_file")).ok)
  check("but a product file may be HTML (a template), delivered as a download", inspectHead(whole(enc.encode("<!doctype html><p>"), "index.html")).ok)

  console.log("\nNames\n")
  check("the right to left override is removed from a shown name", sanitizeDisplayName("photo\u202Egnp.pdf") === "photognp.pdf")
  check("folders are removed", sanitizeDisplayName("../../etc/passwd") === "passwd" && sanitizeDisplayName("C:\\Users\\a\\b.pdf") === "b.pdf")
  check("control characters and Windows-illegal characters are removed", sanitizeDisplayName("a\r\nb<c>:d\".pdf") === "ab_c__d_.pdf")
  check("reserved Windows names are made saveable", sanitizeDisplayName("CON.txt") === "_CON.txt" && sanitizeDisplayName("nul") === "_nul")
  check("trailing dots and spaces go; the extension survives a long name", sanitizeDisplayName("a.pdf. ") === "a.pdf" && sanitizeDisplayName("x".repeat(400) + ".wav").endsWith(".wav") && sanitizeDisplayName("x".repeat(400) + ".wav").length <= 180)
  check("letters in any language are kept", sanitizeDisplayName("Émile – Café Ñ 東京.pdf") === "Émile – Café Ñ 東京.pdf")
  check("a storage name is plain ASCII", storageSafeName("Émile Café 東京.pdf") === "Emile_Cafe_.pdf" || /^[A-Za-z0-9._-]+$/.test(storageSafeName("Émile Café 東京.pdf")))
  const cd = contentDisposition('evil"\r\nSet-Cookie: x=1.pdf')
  check("Content-Disposition cannot be broken by a name, and carries the real name encoded", !/[\r\n]/.test(cd) && /^attachment; filename="[^"]*"; filename\*=UTF-8''/.test(cd), cd)
  check("an alternate data stream cannot hide an extension", extensionOf("a.exe:x") === "exe" && extensionOf("setup.exe:stream") === "exe" && !precheckUpload({ fileName: "setup.exe:notes.txt", size: 10, context: "product_file" }).ok)
  check("and neither can a stream name inside an archive", !(await inspectUpload(whole(buildZip([{ name: "setup.exe:stream", data: peHeaderBytes() }]), "pack.zip"))).ok)
  check("extensionOf reads what Windows would", extensionOf("a.PDF") === "pdf" && extensionOf("a.exe. ") === "exe" && extensionOf("noext") === "" && extensionOf("a\u202Etxt.exe") === "exe")
  check("the storage path guard: owner first, nothing climbs", isSafeStoragePath("c1/digital-products/1-abc.pdf", ["c1"]) && !isSafeStoragePath("c2/x.pdf", ["c1"]) && !isSafeStoragePath("c1/../c2/x", ["c1"]) && !isSafeStoragePath("/c1/x") && !isSafeStoragePath("c1\\x") && !isSafeStoragePath("C:/x"))
  check("an older stored path with spaces still downloads; one that climbs does not", isContainedPath("c1/My Files/a b.pdf") && isContainedPath("c1//a.pdf") && !isContainedPath("c1/../x") && !isContainedPath("/x"))

  console.log("\nMalware engines: none unless the flag names one\n")
  check("nothing set: built-in checks only", readProviderSetting({}).requested === null)
  check("production (the secret set, no URL, no flag): no engine", readProviderSetting({ CLAMAV_SERVICE_SECRET: "s" }).requested === null && !readScannerSetup({ CLAMAV_SERVICE_SECRET: "s" }).configured)
  check("even URL and secret together do nothing without the flag", !readScannerSetup({ CLAMAV_SERVICE_URL: "https://scan.example.com", CLAMAV_SERVICE_SECRET: "s" }).configured)
  check("the flag and both settings switch ClamAV on", readScannerSetup({ SECURITY_MALWARE_PROVIDER: "clamav", CLAMAV_SERVICE_URL: "https://scan.example.com", CLAMAV_SERVICE_SECRET: "s" }).configured)
  check("an unknown name is off, and said", readProviderSetting({ SECURITY_MALWARE_PROVIDER: "virustotal" }).unknown === "virustotal")
  const providers = code("lib/security/uploads/providers.ts")
  check("the provider interface: name, isEnabled, scan", /export interface MalwareProvider \{\s*name: string\s*isEnabled\(\): boolean\s*scan\(input: ProviderScanInput\): Promise<ProviderVerdict>/.test(providers))
  check("ClamAV is enabled only by the flag and its settings", /isEnabled: \(\) => readProviderSetting\(\)\.requested === "clamav" && isScannerConfigured\(\)/.test(providers))
  check("no route reads CLAMAV_* on its own", !/CLAMAV_/.test(["app/api/v2/upload/complete/route.ts", "app/api/v2/upload/server-upload/route.ts", "lib/storage/scan-gate.ts", "lib/storage/upload-guard.ts", "lib/security/uploads/pipeline.ts"].map(code).join("\n")))

  console.log("\nThe log's SQL (part 59)\n")
  {
    const part = read("supabase/sql/run-now/59_file_security_events.sql")
    check("server only: row level security on, no policy, nothing for anon or a signed in user", /ENABLE ROW LEVEL SECURITY/.test(part) && !/CREATE POLICY/i.test(part) && /REVOKE ALL ON public\.file_security_events FROM anon, authenticated/.test(part))
    check("safe to run twice: every statement checks first", part.split("\n").filter((l) => /^CREATE (TABLE|INDEX)/.test(l)).every((l) => /IF NOT EXISTS/.test(l)))
    check("the check after names it, and the README and bundles carry it", /as p59_file_security_events[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")) && /\| `59_file_security_events\.sql` \|/.test(read("supabase/sql/run-now/README.md")) && /-- part 59_file_security_events\.sql/.test(read("supabase/sql/run-four/3_of_4_latest.sql")))
  }

  console.log("\nA person only reads plain sentences\n")
  const words = (["unsupported_type", "too_large", "empty", "not_accepted", "not_an_image", "not_a_video"] as const).map((c) => userMessage(c, "product_file"))
  check("the sentences", words.includes("This file type isn't supported.") && words.includes("We couldn't accept this file. Try another file.") && words.includes("This file is too large. The limit is 10 GB."))
  check("no internals in any of them", words.every((w) => !/clam|scan|virus|malware|quarantin|hash|mime|signature|engine|backend|provider|zip bomb|eicar/i.test(w)), words)
  const refusals = await Promise.all(SAMPLES.filter((s) => s.expect === "refused").map((s) => inspectUpload(whole(s.bytes(), s.fileName))))
  check("every refusal carries one of them, and nothing else", refusals.every((v) => words.includes(v.userMessage)), refusals.map((v) => v.userMessage))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
