#!/usr/bin/env node
/**
 * ===========================================================================
 *  THE EDITOR'S IMAGE BOX IS NEVER EMPTY
 * ===========================================================================
 * Reported with a screenshot: choose an image and the box under the label is
 * a blank grey rectangle for a moment, then the picture appears in one frame.
 *
 * The cause is that `<img src={publicUrl}>` was rendered the instant the
 * upload returned, pointing at an object the browser had never fetched. An
 * <img> with nothing decoded occupies its box and draws nothing in it.
 *
 * Three questions a screenshot cannot answer:
 *
 *   is it ever empty      sample the box from the moment a file is chosen
 *                         until the stored copy has decoded, and count the
 *                         samples holding neither a picture nor a skeleton
 *   does it jump          the box's height at every one of those samples
 *   does it fade          the stored image's opacity and the transition it
 *                         is under, rather than appearing at 1
 *
 *   node scripts/check-image-picker.mjs
 *
 * ---------------------------------------------------------------------------
 *  WHAT THIS CAN AND CANNOT SEE
 * ---------------------------------------------------------------------------
 * --virtual-time-budget fast-forwards the clock and requestAnimationFrame is
 * starved in this headless mode, so a CSS transition does not really play:
 * sampling cannot catch the opacity partway between 0 and 1. What it does
 * catch is every state the DOM passes through, which is where the bug was —
 * the box holding nothing at all — and the transition the stored image is
 * under, which is what makes the last step a fade rather than a cut.
 */
import { execFileSync } from "node:child_process"
import { writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"

const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

const work = join(root, ".image-picker-probe")
mkdirSync(work, { recursive: true })

try {
  /* The upload succeeds, slowly enough to be seen, and hands back a picture. */
  writeFileSync(join(work, "supabase-client.js"), `
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVR4nGP8z8Dwn4GBgYGJAQ0AAB5vAQVVB2CvAAAAAElFTkSuQmCC"
export const createClient = () => ({
  auth: { getUser: async () => ({ data: { user: { id: "probe-user" } } }) },
  storage: {
    from: () => ({
      upload: async () => { await new Promise(r => setTimeout(r, 120)); return { error: null } },
      getPublicUrl: () => ({ data: { publicUrl: PNG } }),
    }),
  },
})
`)
  writeFileSync(join(work, "sonner.js"), `export const toast = Object.assign(() => {}, { error: () => {}, success: () => {} })\n`)

  execFileSync("npx", [
    "esbuild", join(root, "scripts/render-image-picker.tsx"),
    "--bundle", "--platform=browser", "--format=iife",
    `--outfile=${join(work, "probe.js")}`,
    `--alias:@/lib/supabase/client=${join(work, "supabase-client.js")}`,
    `--alias:sonner=${join(work, "sonner.js")}`,
    `--alias:@=${root}`,
    "--jsx=automatic", "--log-level=error",
    '--define:process.env.NODE_ENV="production"',
  ], { cwd: root, stdio: "inherit" })

  const page = join(work, "picker.html")
  writeFileSync(page, `<!doctype html><meta charset="utf-8">
<style>
  body { margin: 0; background: #fff; font: 13px system-ui; }
  .hidden { display: none; }
  .absolute { position: absolute; }
  .relative { position: relative; }
  .inset-0 { inset: 0; }
  .h-full { height: 100%; } .w-full { width: 100%; }
  .object-contain { object-fit: contain; } .p-2 { padding: 8px; }
  .h-\\[96px\\] { height: 96px; }
  .overflow-hidden { overflow: hidden; }
  .opacity-0 { opacity: 0; } .opacity-100 { opacity: 1; }
  .grid { display: grid; } .grid-cols-2 { grid-template-columns: 1fr 1fr; }
  .flex { display: flex; } .items-center { align-items: center; } .justify-center { justify-content: center; }
  .z-10 { z-index: 10; }
  /* The two rules the product ships for this, copied from app/globals.css.
     tests/image-picker.test.ts asserts they are still there. */
  .wb-image-skeleton { background: #f1f2f4; overflow: hidden; }
  .wb-image-skeleton::after {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.78), transparent);
    animation: wb-image-sweep 1.15s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
  @keyframes wb-image-sweep { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
  .wb-image-fade { transition: opacity 260ms cubic-bezier(0.32, 0.72, 0, 1); }
</style>
<div id="root"></div>
<!-- The waiting layer on its own. A picture that decodes instantly never
     shows it, which is right, so what it produces is measured here. -->
<div style="position: relative; width: 120px; height: 40px">
  <span id="sweep" class="wb-image-skeleton" style="position: absolute; inset: 0"></span>
</div>
<pre id="out">pending</pre>
<script src="./probe.js"></script>
<script>
const tick = () => new Promise((r) => setTimeout(r, 8))

/* What the box is holding right now. */
function look(id) {
  const scope = document.getElementById(id)
  const box = scope.querySelector("[data-wb-image-box]")
  if (!box) return { state: "no-box", height: 0 }
  const local = box.querySelector('[data-wb-image-layer="local"]')
  const waiting = box.querySelector('[data-wb-image-layer="waiting"]')
  const stored = box.querySelector('[data-wb-image-layer="stored"]')
  /*
    WHETHER THE COMPONENT HAS SHOWN IT, not what the pixels are doing.

    The stored layer carries "opacity-0" until the picture has decoded and
    "opacity-100" after, with a transition between them. Reading the
    COMPUTED opacity to decide is wrong here: at the instant the class flips
    the computed value is still 0 because the transition has not advanced,
    and in this headless mode it never advances at all. The first version of
    this probe did exactly that and called a box that had already been
    handed its picture "empty".

    So the class is what is read — it is the component's own decision — and
    the computed opacity and transition are reported beside it for the fade
    assertion, which is about the transition existing rather than about any
    value partway along it.
  */
  const storedVisible = stored && / opacity-100(?: |$)/.test(" " + stored.className)
  return {
    /* Is there anything at all under the stored layer right now. */
    underlay: !!(local || waiting),
    /* Has the component started showing the stored copy. */
    storedOpaque: !!storedVisible,
    state: storedVisible ? "stored" : local ? "local" : waiting ? "waiting" : "EMPTY",
    height: Math.round(box.getBoundingClientRect().height),
    storedOpacity: stored ? getComputedStyle(stored).opacity : null,
    storedTransition: stored ? getComputedStyle(stored).transitionProperty + " " + getComputedStyle(stored).transitionDuration : null,
    sweep: waiting ? getComputedStyle(waiting, "::after").animationName : null,
    waitingBg: waiting ? getComputedStyle(waiting).backgroundColor : null,
    spinner: !!box.querySelector(".animate-spin"),
  }
}

/**
 * Every distinct state a box passes through, from now until it reaches the
 * stored picture. Used for both halves, because both are sequences rather
 * than moments: sampling one instant and asking what it held is how the
 * first version of this probe managed to disagree with itself between runs.
 */
async function sequence(id, limit) {
  const seen = []
  for (let i = 0; i < limit; i++) {
    const s = look(id)
    /* React has not committed yet. Not a state of the box, so not recorded. */
    if (s.state !== "no-box") {
      const last = seen[seen.length - 1]
      if (!last || last.state !== s.state || last.height !== s.height
        || last.underlay !== s.underlay || last.storedOpaque !== s.storedOpaque) seen.push(s)
      /* Not at the first opaque frame: the underlay has to outlive the fade,
         so keep going until it is really gone. */
      if (s.state === "stored" && !s.underlay) break
    }
    await tick()
  }
  return seen
}

async function measure() {
  /*
    The panel that opened on a value it has not fetched, sampled from the
    first frame it exists rather than at some point afterwards — by 400ms a
    small picture has long since decoded and the wait is over.
  */
  const arriving = await sequence("arriving", 90)

  const upload = document.querySelector("#upload input[type=file]")
  if (!upload) { document.getElementById("out").textContent = JSON.stringify({ error: "picker did not mount" }); return }

  /* Before anything is chosen there is no box at all, which is correct: it
     is the dashed "Add Image" dropzone. The samples start at the choice. */
  const before = look("upload")

  const png = atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVR4nGP8z8Dwn4GBgYGJAQ0AAB5vAQVVB2CvAAAAAElFTkSuQmCC")
  const bytes = new Uint8Array(png.length)
  for (let i = 0; i < png.length; i++) bytes[i] = png.charCodeAt(i)
  const file = new File([bytes], "shot.png", { type: "image/png" })
  const dt = new DataTransfer()
  dt.items.add(file)
  upload.files = dt.files
  upload.dispatchEvent(new Event("change", { bubbles: true }))

  /* Every state the box passes through, from the choice to the stored copy. */
  const samples = await sequence("upload", 90)

  const sweepEl = document.getElementById("sweep")
  const sweep = {
    animation: getComputedStyle(sweepEl, "::after").animationName,
    duration: getComputedStyle(sweepEl, "::after").animationDuration,
    background: getComputedStyle(sweepEl).backgroundColor,
    boxBackground: getComputedStyle(document.querySelector("#arriving [data-wb-image-box]")).backgroundColor,
  }

  document.getElementById("out").textContent = JSON.stringify({ before, samples, arriving, sweep })
}
/* Early, because the first half of this measures a box the moment it mounts. */
addEventListener("load", () => setTimeout(measure, 0))
</script>`)

  const dom = execFileSync(CHROMIUM, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--window-size=900,600",
    "--virtual-time-budget=15000", "--dump-dom", `file://${page}`,
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })

  const match = dom.match(/<pre id="out">([^<]*)</)
  if (!match || match[1] === "pending") fail("The picker never reported a measurement.")
  const m = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"))
  if (m.error) fail(m.error)

  let broken = 0
  const expect = (ok, what, got) => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
    if (!ok) broken++
  }

  console.log("\nChoosing a file, then every state the box passes through\n")
  for (const s of m.samples) {
    console.log(`  ${String(s.state).padEnd(8)} ${String(s.height).padStart(3)}px   ${s.spinner ? "spinner" : "       "}   stored opacity ${s.storedOpacity ?? "-"}`)
  }
  console.log("")

  /* ── IS IT EVER EMPTY ────────────────────────────────────────────────── */
  const empties = m.samples.filter((s) => s.state === "EMPTY")
  expect(empties.length === 0, "the box never holds nothing, from the file being chosen to the picture", `${empties.length} of ${m.samples.length} samples were an empty box`)
  expect(m.samples.length > 0 && m.samples[0].state === "local", "the file itself is what shows first, with no upload having happened yet", m.samples[0]?.state)
  expect(m.samples.some((s) => s.spinner), "with the spinner over it while it uploads", "no spinner was ever on screen")
  expect(m.samples[m.samples.length - 1].state === "stored", "and the stored copy is what it ends on", m.samples[m.samples.length - 1].state)

  /* ── DOES IT JUMP ────────────────────────────────────────────────────── */
  const heights = [...new Set(m.samples.map((s) => s.height))]
  expect(heights.length === 1, "the box is the same height the whole way through, so nothing below it moves", `heights seen: ${heights.join(", ")}`)

  /* ── AND IS ANYTHING UNDER IT WHILE IT FADES ─────────────────────────── */
  /*
    THE GLITCH AT THE END OF AN UPLOAD. The first version of this component
    took the local copy away in the same commit that let the stored one start
    appearing — and the stored one starts at zero and takes 260ms to arrive.
    So the empty box this whole component exists to remove came back, a
    quarter of a second later, right as the upload finished.

    What is asserted is the first frame the stored layer is allowed to show:
    something must still be under it. A later frame with no underlay is
    correct and expected, which is why this looks at the first one rather
    than at all of them.
  */
  const firstOpaque = (rows) => rows.find((s) => s.storedOpaque)
  for (const [label, rows] of [["after an upload", m.samples], ["on a panel opening", m.arriving]]) {
    const at = firstOpaque(rows)
    expect(
      !!at && at.underlay,
      `${label}, the picture underneath is still there when the stored copy starts to appear`,
      at ? "the box was emptied in the same frame the fade started" : "the stored copy never appeared",
    )
  }
  const bare = m.samples.concat(m.arriving).filter((s) => s.state === "EMPTY")
  expect(bare.length === 0, "and at no point in either sequence is the box empty", `${bare.length} empty frames`)

  /* ── DOES IT FADE ────────────────────────────────────────────────────── */
  const last = m.samples[m.samples.length - 1]
  expect(
    /opacity/.test(last.storedTransition ?? "") && !/\b0s\b/.test(last.storedTransition ?? ""),
    "and it arrives over a transition rather than in one frame",
    last.storedTransition,
  )

  /* ── AND A PANEL THAT OPENS ON A PICTURE IT HAS NOT FETCHED ──────────── */
  console.log("\nA panel opening on a value it has not fetched yet\n")
  for (const s of m.arriving) {
    console.log(`  ${String(s.state).padEnd(8)} ${String(s.height).padStart(3)}px   ${s.waitingBg ?? ""}`)
  }
  console.log("")

  expect(m.arriving.every((s) => s.state !== "EMPTY"), "it is never a blank box either", `${m.arriving.filter((s) => s.state === "EMPTY").length} empty samples`)
  expect(m.arriving[m.arriving.length - 1].state === "stored", "and it settles on the picture", m.arriving[m.arriving.length - 1].state)

  /*
    The fixture's picture is a 2x2 data URL, so it is decoded before React
    has committed and the box goes straight to it — which is the behaviour
    wanted, and means the waiting layer is never on screen to be sampled. A
    picture that really does take a moment is not something this harness can
    stage: every URL it can reach either decodes at once or fails at once.

    So what the waiting layer PRODUCES is measured on its own below, and
    that it is what gets rendered while a picture has not decoded is pinned
    in tests/image-picker.test.ts against the branch that chooses it.
  */
  console.log("\nThe waiting layer, measured on its own\n")
  expect(/wb-image-sweep/.test(m.sweep.animation ?? ""), "the sweep is a real animation, running", m.sweep.animation)
  expect(!/^0s$/.test(m.sweep.duration ?? ""), "over a duration, not an instant", m.sweep.duration)
  expect(m.sweep.background === "rgb(241, 242, 244)", "on a tone of its own", m.sweep.background)
  expect(
    m.sweep.background !== m.sweep.boxBackground,
    "which is not the colour of the box it fills, or it would read as the empty box it replaces",
    `${m.sweep.background} against ${m.sweep.boxBackground}`,
  )

  console.log(`\n${broken === 0 ? "The box holds the file, then the spinner over it, then the stored copy. It is never empty." : `${broken} failed`}`)
  process.exit(broken === 0 ? 0 : 1)
} finally {
  rmSync(work, { recursive: true, force: true })
}
