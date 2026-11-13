/**
 * ===========================================================================
 *  THE SHOWCASE RAIL'S MOTION, AS NUMBERS
 * ===========================================================================
 * Round 60, the owner: a rail that follows the hand, carries a flick the
 * right distance, answers a reversal at once, and comes to rest quickly and
 * cleanly, the same at 60 and 120Hz. lib/ui/rail-motion holds the pure parts
 * that decide all of that; this runs them against the owner's own tests:
 *
 *   A  a slow drag (150px over a second) settles back to its group
 *   B  a fast flick (350px in 150ms) carries on to the next group, and no
 *      further, and arrives without passing it
 *   C  a reversal: a spring's position and velocity at any instant are what
 *      the next gesture takes over, with no jump
 *   E  repeated flicks never skip more than one group each
 *   G  the motion is a function of time, not of frames: 60Hz, 120Hz and a
 *      jittery 90Hz read the same curve
 *
 * plus the release velocity (a least squares fit, so one stray event cannot
 * fake a flick, and a hand that stopped before letting go has none), the
 * wheel (a trackpad's swipe is followed, a mouse notch steps, vertical is the
 * page's), and the loop (crossing its end moves nothing).
 *
 * scripts/check-showcase-motion.mjs drives the real showcase in a browser.
 */
import {
  SHOWCASE_MOTION,
  capSpringVelocity,
  chooseSwipeTarget,
  chooseTarget,
  launchVelocity,
  readWheel,
  releaseVelocity,
  sineInOut,
  springAt,
  springRested,
  settleDuration,
  stepTarget,
  wrap,
  type Sample,
} from "@/lib/ui/rail-motion"

let passed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}

const C = SHOWCASE_MOTION
const K = C.springStiffness
const D = C.springDamping
/* Three desktop groups 1300px apart (a 1280px wide group and the 20px between), looping. */
const P = 1300
const SNAPS = [0, P, 2 * P]
const L = 3 * P

/** A drag sampled every `stepMs`, from 0 to `distance` px of rail in `ms`. */
function drag(distance: number, ms: number, stepMs = 8): Sample[] {
  const out: Sample[] = []
  for (let t = 0; t <= ms; t += stepMs) out.push({ t, x: (distance * t) / ms })
  return out
}

/** Settle from `x` with `v` the way the controller does, returning the whole path at `hz`. */
function settlePath(x: number, v: number, target: number, hz: number, seconds = 1.5) {
  const x0 = x - target
  const v0 = capSpringVelocity(x0, v, K)
  const path: { t: number; x: number; v: number }[] = []
  for (let t = 0; t <= seconds; t += 1 / hz) {
    const s = springAt({ x0, v0 }, t, K, D)
    path.push({ t, x: target + s.x, v: s.v })
  }
  return path
}

console.log("\nThe tuning")
{
  check("the spring is critically damped: no bounce by construction", Math.abs(D - 2 * Math.sqrt(K)) < 1e-9, { K, D })
  check("stiffness and damping in the owner's ranges (280 to 380, 32 to 40)", K >= 280 && K <= 380 && D >= 32 && D <= 40, { K, D })
  check("the friction a flick is projected with is in the 260 to 380ms range", C.inertiaDecayMs >= 260 && C.inertiaDecayMs <= 380)
  check("a drag starts after 5 to 8px, so a click is a click", C.dragThreshold >= 5 && C.dragThreshold <= 8)
  check("the release velocity reads 60 to 100ms of the drag", C.velocityWindowMs >= 60 && C.velocityWindowMs <= 100)
  const still = settlePath(0, 0, P, 240)
  const near = still.find((p) => Math.abs(p.x - P) < 2)
  const rest = still.find((p) => springRested(p.x - P, p.v))
  check("a whole group from a stand still is within 2px of its place in under half a second", !!near && near.t < 0.5, near?.t)
  check("and fully at rest by 0.65s: quick, not a long glide", !!rest && rest.t < 0.65, rest?.t)
}

/* Changed on purpose (wave 13): chooseTarget (the wheel, a stopped press) still settles a slow drag back; a released drag is decided by chooseSwipeTarget below, where 150px is a whole swipe. */
console.log("\nA: a slow drag settles back")
{
  const s = drag(150, 1000)
  const v = releaseVelocity(s, 1000, C.velocityWindowMs, C.velocityStaleMs)
  check("150px over a second reads about 150px/s", Math.abs(v - 150) < 2, v)
  const target = chooseTarget(150, v, SNAPS, L, C)
  check("and settles back to the group it left", target === 0, target)
  const path = settlePath(150, v, target, 120)
  check("without going past it", path.every((p) => p.x >= -0.5), Math.min(...path.map((p) => p.x)))
}

console.log("\nB: a fast flick carries on, one group, and stops on it")
{
  const s = drag(350, 150)
  const v = releaseVelocity(s, 150, C.velocityWindowMs, C.velocityStaleMs)
  check("350px in 150ms reads about 2333px/s", Math.abs(v - 2333) < 30, v)
  const target = chooseTarget(350, v, SNAPS, L, C)
  check("it goes on to the next group", target === P, target)
  const path = settlePath(350, v, target, 120)
  check("never past it: no overshoot, no bounce", path.every((p) => p.x <= P + 0.5), Math.max(...path.map((p) => p.x)))
  check("and keeps moving forward the whole way: momentum and snap are one motion", path.every((p, i) => i === 0 || p.x >= path[i - 1].x - 0.01))
  const near = path.find((p) => Math.abs(p.x - P) < 2)
  check("within 2px of it in under 0.45s", !!near && near.t < 0.45, near?.t)
  const huge = chooseTarget(350, 6000, SNAPS, L, C)
  check("even the fastest flick goes one group, not several", huge === P, huge)
}

console.log("\nC: a reversal takes over in place")
{
  const path = settlePath(350, 2333, P, 120)
  const mid = path[12]
  /* A new drag starts from the drawn position: nothing is recomputed from the old target. */
  check("the position at the moment of the press is a real, finite place", Number.isFinite(mid.x) && mid.x > 350 && mid.x < P, mid.x)
  const back = chooseTarget(mid.x - 300, -2400, SNAPS, L, C)
  check("and a flick back from there goes back, to the group it came from", back === 0, back)
}

console.log("\nE: five quick flicks in turn")
{
  let x = 0
  const seen: number[] = []
  for (const dir of [1, -1, 1, 1, -1]) {
    const target = chooseTarget(x + dir * 300, dir * 2500, SNAPS, L, C)
    seen.push(target - x)
    x = target
  }
  check("each moves exactly one group, in its own direction", seen.every((d, i) => d === [1, -1, 1, 1, -1][i] * P), seen)
}

console.log("\nG: the same motion at any frame rate")
{
  const at = (hz: number, jitter = 0) => {
    let t = 0
    let last = 0
    while (t < 0.2) {
      t += 1 / hz + (jitter ? (Math.sin(t * 977) * jitter) / 1000 : 0)
      last = springAt({ x0: -950, v0: 2333 }, Math.min(t, 0.2), K, D).x
    }
    return springAt({ x0: -950, v0: 2333 }, 0.2, K, D).x
  }
  const a = at(60)
  const b = at(120)
  const c = at(90, 3)
  check("60Hz, 120Hz and a jittery 90Hz are at the same place at 200ms", Math.abs(a - b) < 1e-9 && Math.abs(a - c) < 1e-9, { a, b, c })
  const steps = [1 / 60, 1 / 120, 1 / 144].map((dt) => {
    let t = 0
    while (t + dt <= 0.5) t += dt
    return springAt({ x0: -1300, v0: 0 }, 0.5, K, D).x
  })
  check("and land at the same place", new Set(steps.map((x) => x.toFixed(9))).size === 1)
  check("autoplay's ease is a curve over time: it starts and ends still, halfway is halfway", sineInOut(0) === 0 && Math.abs(sineInOut(1) - 1) < 1e-12 && Math.abs(sineInOut(0.5) - 0.5) < 1e-12)
}

console.log("\nNo spring passes its target")
{
  let worst = 0
  for (const x0 of [-2600, -1300, -400, -40, -4, 4, 40, 400, 1300]) {
    for (const v of [-9000, -3000, -800, 0, 800, 3000, 9000]) {
      const v0 = capSpringVelocity(x0, v, K)
      for (let t = 0; t < 2; t += 1 / 240) {
        const x = springAt({ x0, v0 }, t, K, D).x
        if (Math.sign(x) === -Math.sign(x0) && Math.abs(x) > worst) worst = Math.abs(x)
      }
    }
  }
  check("63 starts, every distance and speed: the furthest any of them goes past is under half a pixel", worst < 0.5, worst)
  check("a velocity away from the target is left alone (the spring turns it round)", capSpringVelocity(-100, -5000, K) === -5000)
  check("an underdamped spring is solved too, and does pass its target (which is why this one is not)", springAt({ x0: -100, v0: 0 }, 0.15, 320, 10).x > 0)
}

console.log("\nThe release velocity")
{
  const s = drag(400, 200)
  check("a straight drag reads its own speed", Math.abs(releaseVelocity(s, 200, 80, 60) - 2000) < 1, releaseVelocity(s, 200, 80, 60))
  const noisy = s.map((p, i) => ({ ...p, x: p.x + (i === s.length - 2 ? 6 : 0) }))
  const vn = releaseVelocity(noisy, 200, 80, 60)
  check("one stray 6px event near the end moves it by under 10%", Math.abs(vn - 2000) < 200, vn)
  const held = [...s, { t: 300, x: 400 }]
  check("a hand that stopped for 100ms before letting go has no flick", releaseVelocity(held, 300, 80, 60) === 0, releaseVelocity(held, 300, 80, 60))
  check("let go long after the last move: no flick", releaseVelocity(s, 400, 80, 60) === 0)
  check("one sample is no velocity", releaseVelocity([{ t: 0, x: 0 }], 0, 80, 60) === 0)
  check("only the end of the drag counts: a slow start then a fast finish reads fast", releaseVelocity([...drag(100, 900).map((p) => p), ...drag(300, 100).map((p) => ({ t: 900 + p.t, x: 100 + p.x }))], 1000, 80, 60) > 2500)
}

console.log("\nThe wheel")
{
  const w = (deltaX: number, deltaY: number, deltaMode = 0, shiftKey = false) => readWheel({ deltaX, deltaY, deltaMode, shiftKey }, 1280)
  check("a vertical wheel is the page's: never taken", w(0, 120).kind === "vertical" && w(3, 40).kind === "vertical")
  check("a trackpad's sideways swipe is followed pixel for pixel", w(7.5, 1).kind === "continuous" && w(7.5, 1).dx === 7.5)
  check("a mouse notch (lines) is a step, 16px a line", w(3, 0, 1).kind === "notch" && w(3, 0, 1).dx === 48)
  check("Shift turns a mouse wheel sideways, as browsers do", w(0, 100, 0, true).kind === "notch" && w(0, 100, 0, true).dx === 100)
  check("a page unit is a page", w(1, 0, 2).dx === 1280)
}

console.log("\nThe loop")
{
  check("wrap is continuous across its ends", wrap(-1, L) === L - 1 && wrap(L, L) === 0 && wrap(L + 5, L) === 5 && wrap(-L - 5, L, -L / 2) === -5)
  const t = chooseTarget(2 * P + 300, 2500, SNAPS, L, C)
  check("a flick on from the last group goes on round to the first, the short way (not back two groups)", t === 3 * P, t)
  check("and that is the first group again", wrap(t, L) === 0)
  check("a step back from the first group goes round to the last", wrap(stepTarget(0, -1, SNAPS, L), L) === 2 * P)
  const finite = chooseTarget(2 * P + 300, 2500, SNAPS, 0, C)
  check("a finite rail stops at its last group", finite === 2 * P, finite)
}

/*
  Added on purpose (wave 13). The owner: "a short drag or a flick should
  complete a full swipe to the next card ... right now you have to drag much
  too far". chooseTarget above still decides a wheel or a press that stopped
  the rail; a released drag is decided by chooseSwipeTarget, like a pager.
*/
console.log("\nWave 13: a short drag or a flick is a whole swipe")
{
  const t = (x: number, v: number, start = 0) => chooseSwipeTarget(start, x, v, SNAPS, L, C)
  check("150px over a second (the slow drag of A) now goes on to the next group", t(150, 150) === P, t(150, 150))
  check("40px is enough on a desktop group, slowly", t(40, 0) === P && t(-40, 0) === -P)
  check("a 32px drag with no speed goes back", t(32, 0) === 0, t(32, 0))
  check("a 20px flick goes on", t(20, 900) === P, t(20, 900))
  check("a flick against a drag that had moved cancels it: back to the start, not past it", t(200, -900) === 0, t(200, -900))
  check("a flick from rest the other way goes back a group", t(-10, -900) === -P, t(-10, -900))
  check("never more than one group, however far or fast", t(1250, 9000) === P && t(-1250, -9000) === -P)
  check("a press that caught the rail between groups and drags on goes to the group ahead", t(P * 0.62 + 60, 0, P * 0.62) === P, t(P * 0.62 + 60, 0, P * 0.62))
  check("and one that drags back goes to the group behind", t(P * 0.62 - 60, 0, P * 0.62) === 0, t(P * 0.62 - 60, 0, P * 0.62))
  check("a slow drag that ends just short of the threshold returns", t(39, 100) === 0)
  /* A phone: cards 292 and 103 wide, 8px apart. */
  const phone = [0, 300, 411, 711]
  const tp = (x: number, v: number, start = 0) => chooseSwipeTarget(start, x, v, phone, 0, C)
  check("on a phone 40px is a swipe of a wide card, 32px is not", tp(40, 0) === 300 && tp(32, 0) === 0, [tp(40, 0), tp(32, 0)])
  check("and a narrow OnePage card a fifth of its step, 23px, not 20", tp(300 + 23, 0, 300) === 411 && tp(300 + 20, 0, 300) === 300)
  check("a finite rail stops at its ends", tp(-80, -900) === 0 && tp(711 + 80, 900, 711) === 711)
  check("the swipe thresholds are short and the flick speed low", C.swipeDistanceMax <= 40 && C.swipeVelocity <= 200)
}

console.log("\nWave 13: the settle leaves at speed and never passes its place")
{
  let worst = 0
  for (const x0 of [-1316, -600, -60, 60, 600, 1316])
    for (const v of [-3000, -200, 0, 200, 3000]) {
      const v0 = launchVelocity(x0, v, K, C.swipeLaunch)
      for (let t = 0; t < 2; t += 1 / 240) {
        const x = springAt({ x0, v0 }, t, K, D).x
        if (Math.sign(x) === -Math.sign(x0) && Math.abs(x) > worst) worst = Math.abs(x)
      }
    }
  check("30 swipe starts: none passes its target by half a pixel", worst < 0.5, worst)
  const v0 = launchVelocity(-1316, 0, K, C.swipeLaunch)
  check("a whole group from a short slow drag still leaves at speed (an ease out, not an ease in)", v0 > 5000, v0)
  const path: number[] = []
  for (let t = 0; t <= 0.6; t += 1 / 120) path.push(springAt({ x0: -1316, v0 }, t, K, D).x)
  const near = path.findIndex((x) => Math.abs(x) < 2) / 120
  check("and is within 2px of its place in under 0.45s", near > 0 && near < 0.45, near)
  const most = path.findIndex((x) => Math.abs(x) < 1316 * 0.02) / 120
  check("98% of the way there in under 0.3s", most > 0 && most < 0.3, most)
  check("the first frame already moves it (no slow start)", Math.abs(path[1] - path[0]) > 40, path[1] - path[0])
  const d = settleDuration({ x0: -1316, v0 }, K, D)
  check("the settle's length is known before it starts, under 0.7s", d > 0.2 && d < 0.7, d)
}

console.log("\nWave 13: timed motion runs on the compositor")
{
  const src = (await import("node:fs")).readFileSync("lib/ui/rail-motion.ts", "utf8")
  check("settles, steps and autoplay are Web Animations sampled from the curve", /el\.animate\(frames/.test(src) && /this\.play\(\(t\) => from \+ \(to - from\) \* sineInOut/.test(src) && /this\.play\(\(t\) => to \+ springAt/.test(src))
  check("a press reads the compositor's own clock to take hold where the boxes are drawn", /currentTime/.test(src) && /a\.cancel\(\)/.test(src))
  check("a released drag is decided by chooseSwipeTarget and settles as a swipe", /this\.settle\(v, chooseSwipeTarget\(p\.railAt, this\.x, v/.test(src))
  check("the frame loop is only the fallback for timed motion", /if \(ph\.anims\) return/.test(src))
}

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
