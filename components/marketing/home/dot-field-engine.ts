/*
  THE DOT FIELDS' ENGINE (landing round 6, performance).

  The closing call's and the purple sheet's DotField (dot-field.tsx) and the
  How it works heading's HowField (how-it-works.tsx) used to draw on the page's
  own thread: about 7,000 dots a frame, two sines each, into canvases the size
  of a whole section at up to two device pixels a CSS pixel. At 4x CPU that was
  the biggest controllable cost on the page (the canvas resource and the rAF
  callbacks). This file is the one engine for all three, with no DOM in it, so
  it runs in a Web Worker on an OffscreenCanvas (dot-field-worker.ts, started
  by dot-field-driver.ts) and, where a browser cannot, on the page's thread
  with the very same code.

  A field is the box (its size, its dots, its light, its pointer). Its picture
  is cut into TILES, canvases TILE_HEIGHT CSS px tall stacked in the box: a
  tile that is not near the screen is neither drawn nor given a loop, and a
  tall box (the purple sheet's 1265px or more) never rasterises more than what
  can be seen. The light and its glide are the field's, not a tile's, so tiles
  that sit one over another agree at the seam.

  Everything that looked a certain way before still does: the numbers below
  are the old ones (DOT_FIELD_TONES, TROUGH, RADIUS, FOLLOW, PART, WANDER and
  LEVELS of dot-field.tsx; HOW_FIELD and LEVELS of how-it-works.tsx), one
  config object for each of the three looks.

  Messages the page sends (see dot-field-driver.ts): field, remove, tile,
  dropTile, tileOn, size, place, aim, hold, hidden. Nothing is read from the
  page in a frame. A worker without requestAnimationFrame (Safari's) is stepped
  by the display's frames the page sends ("ticker" and "frame"), as the globes
  are, not by a timer that drifts against them.
*/

/** The dots' colour per ground, how bright they rest at the crest of the flow and how bright the light makes them (see dot-field.tsx for the history of each number). `r` is a dot's radius in CSS px; `ride` how far a dot rides the flow. */
export const DOT_FIELD_TONES = {
  /* Landing round 11: the closing call's dots a little more visible and standing on their points (ride 0); the purple sheet's brighter, rounder and steadier (its own track). */
  dark: { rgb: "255,255,255", rest: 0.34, lit: 0.68, r: 0.8, ride: 0 },
  purple: { rgb: "255,255,255", rest: 0.17, lit: 0.4, r: 0.95, ride: 0.5 },
} as const

/** Largest device pixel ratio the canvas is drawn at. */
export const DOT_FIELD_MAX_DPR = 2
/** Radius of the light around the pointer, in CSS px. */
const RADIUS = 180
/** How quickly the light follows the pointer, per 60Hz frame (0..1). */
const FOLLOW = 0.075
/** How far the dots part under the light, in CSS px. */
const PART = 6
const LEVELS = 32
/** How strong the light is on its own path, with no mouse over the field. */
const WANDER = 0.6
/** The darkest a dot gets in the trough of the flow, as a share of its crest (landing round 11: the dark tone 0.45, was 0.3; the purple sheet as it was). */
export const DOT_FIELD_TROUGH = { dark: 0.45, purple: 0.3 } as const

/** Distance between dots, the largest device pixel ratio drawn, and how the dots look on white (How it works). */
export const HOW_FIELD = { gap: 20, maxDpr: 1.5, ink: "24,24,27", rest: 0.15, lit: "124,58,237", litAlpha: 0.6, radius: 170, part: 5 } as const
const HOW_LEVELS = 20

/** Height of one tile of a field, in CSS px: a multiple of 4, so a tile is a whole number of device pixels at 1, 1.25, 1.5 and 2. */
export const DOT_FIELD_TILE = 640
/** How far outside the screen (CSS px) a tile starts to be drawn. */
export const DOT_FIELD_TILE_MARGIN = 120

export type FieldKind = "dark" | "purple" | "how"

export type FieldConfig = {
  /** single: one colour, brighter under the light. light: ink dots, and a second coloured pass where the light is. */
  mode: "single" | "light"
  maxDpr: number
  levels: number
  /** Radius of the light, how fast it follows (per 60Hz frame), how far dots part under it. */
  radius: number
  follow: number
  part: number
  /** The flow's time rates in its two waves, and how far the second bends the first. */
  rate: readonly [number, number]
  bend: number
  /** How far a dot rides the flow (x, y at full ride) and the tone's share of that. */
  rideX: number
  rideY: number
  ride: number
  /** The darkest a dot gets, as a share of its crest. */
  trough: number
  /** single: the resting alpha and the lit alpha of the top level. light: the ink's top alpha and the light's. */
  rest: number
  lit: number
  /** Dot radii: single uses r; light uses r for ink and rLit for the lit pass. turn is the end angle of the arc. */
  r: number
  rLit: number
  turn: number
  rgb: string
  rgbLit: string
  /** The light's own path: x = w * (c + a * sin(t * f)), y = h * (c + a * sin(t * f + p)). */
  pathX: readonly [number, number, number]
  pathY: readonly [number, number, number, number]
  /** How strong the light is on its own path, with a fine pointer and without. */
  alone: readonly [number, number]
  /** The mouse moves the light only within this margin of the box (px); null: wherever it is. */
  within: number | null
  /** The least ms between two draws, with a mouse and without. */
  frameMs: readonly [number, number]
}

const single = (tone: "dark" | "purple"): FieldConfig => ({
  mode: "single",
  maxDpr: DOT_FIELD_MAX_DPR,
  levels: LEVELS,
  radius: RADIUS,
  follow: FOLLOW,
  part: PART,
  rate: [0.00038, 0.00016],
  bend: 1.7,
  rideX: 0.8,
  rideY: 1.4,
  ride: DOT_FIELD_TONES[tone].ride,
  trough: DOT_FIELD_TROUGH[tone],
  rest: DOT_FIELD_TONES[tone].rest,
  lit: DOT_FIELD_TONES[tone].lit,
  r: DOT_FIELD_TONES[tone].r,
  rLit: 0,
  turn: Math.PI * 2,
  rgb: DOT_FIELD_TONES[tone].rgb,
  rgbLit: "",
  pathX: [0.5, 0.32, 0.00011],
  pathY: [0.42, 0.26, 0.000083, 1.3],
  /* The purple sheet keeps a quieter wander (round 7), a little stronger since round 11; the closing call's light is out on its own. */
  alone: tone === "dark" ? [WANDER, WANDER] : [0.45, 0.55],
  within: 40,
  frameMs: [12, 12],
})

/** One config object for each look: the closing call's, the purple sheet's, and How it works'. */
export const DOT_FIELD_CONFIGS: Record<FieldKind, FieldConfig> = {
  dark: single("dark"),
  purple: single("purple"),
  how: {
    mode: "light",
    maxDpr: HOW_FIELD.maxDpr,
    levels: HOW_LEVELS,
    radius: HOW_FIELD.radius,
    follow: 0.08,
    part: HOW_FIELD.part,
    rate: [0.0004, 0.00017],
    bend: 1.7,
    rideX: 1.2,
    rideY: 1.8,
    ride: 1,
    trough: 0.3,
    rest: HOW_FIELD.rest,
    lit: HOW_FIELD.litAlpha,
    r: 0.9,
    rLit: 1.15,
    turn: 6.2832,
    rgb: HOW_FIELD.ink,
    rgbLit: HOW_FIELD.lit,
    pathX: [0.5, 0.34, 0.00013],
    pathY: [0.36, 0.2, 0.000097, 1.3],
    alone: [0.55, 0.55],
    within: null,
    /* 60 a second while a mouse is in the section (a 120Hz screen draws every other frame), 30 otherwise. */
    frameMs: [12, 30],
  },
}

/** A repeatable random number in [0, 1) for a pair of integers. */
function hash(x: number, y: number) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return h - Math.floor(h)
}

/**
 * The dots for a box: x, y (CSS px), a brightness (0..1) and a phase, four
 * numbers per dot. An even grid of `gap` px, centred so the margins match.
 */
export function dotFieldPoints(width: number, height: number, gap: number): Float32Array {
  const cols = Math.floor(width / gap) + 1
  const rows = Math.floor(height / gap) + 1
  const ox = (width - (cols - 1) * gap) / 2
  const oy = (height - (rows - 1) * gap) / 2
  const out = new Float32Array(cols * rows * 4)
  let i = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out[i++] = ox + c * gap
      out[i++] = oy + r * gap
      out[i++] = 1
      out[i++] = hash(c + 9.7, r + 1.3) * Math.PI * 2
    }
  }
  return out
}

/** A small seeded random number generator (mulberry32): the same seed, the same numbers, on every machine. */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The seed the scattered field is drawn from: fixed, so a box of a given size always gets the same dots. */
export const DOT_FIELD_SEED = 1207

/**
 * The dots for a box, scattered (landing round 12, the owner, of the closing
 * call: the dots "too regular, straight rows and columns"). Poisson disc
 * sampling (Bridson): every dot at least 0.8 of `gap` from every other, so
 * the field reads as evenly spread, about as dense as the grid, but with no
 * rows, no columns and no clumps. Each dot also gets its own brightness
 * (0.55 to 1), so it does not read as a stamped pattern. Seeded
 * (DOT_FIELD_SEED): the same box always gets the same dots. Same four numbers
 * per dot as dotFieldPoints.
 */
export function dotFieldScatter(width: number, height: number, gap: number, seed = DOT_FIELD_SEED): Float32Array {
  const rand = seeded(seed)
  const r = gap * 0.8
  const r2 = r * r
  const cell = r / Math.SQRT2
  const cols = Math.ceil(width / cell)
  const rows = Math.ceil(height / cell)
  const grid = new Int32Array(cols * rows).fill(-1)
  const xs: number[] = []
  const ys: number[] = []
  const active: number[] = []
  const add = (x: number, y: number) => {
    const i = xs.length
    xs.push(x)
    ys.push(y)
    active.push(i)
    grid[Math.floor(y / cell) * cols + Math.floor(x / cell)] = i
  }
  const free = (x: number, y: number) => {
    const cx = Math.floor(x / cell)
    const cy = Math.floor(y / cell)
    for (let gy = Math.max(0, cy - 2); gy <= Math.min(rows - 1, cy + 2); gy++) {
      for (let gx = Math.max(0, cx - 2); gx <= Math.min(cols - 1, cx + 2); gx++) {
        const j = grid[gy * cols + gx]
        if (j < 0) continue
        const dx = xs[j] - x
        const dy = ys[j] - y
        if (dx * dx + dy * dy < r2) return false
      }
    }
    return true
  }
  if (width > 0 && height > 0) add(rand() * width, rand() * height)
  while (active.length) {
    const k = Math.floor(rand() * active.length)
    const p = active[k]
    let placed = false
    for (let n = 0; n < 24; n++) {
      const a = rand() * Math.PI * 2
      const d = r * (1 + rand())
      const x = xs[p] + Math.cos(a) * d
      const y = ys[p] + Math.sin(a) * d
      if (x < 0 || y < 0 || x >= width || y >= height || !free(x, y)) continue
      add(x, y)
      placed = true
      break
    }
    if (!placed) {
      active[k] = active[active.length - 1]
      active.pop()
    }
  }
  const out = new Float32Array(xs.length * 4)
  for (let i = 0, o = 0; i < xs.length; i++) {
    out[o++] = xs[i]
    out[o++] = ys[i]
    out[o++] = 0.55 + 0.45 * rand()
    out[o++] = rand() * Math.PI * 2
  }
  return out
}

/**
 * The flow at a point and time, 0..1: two long waves, the second bending the
 * first, so the bright bands drift diagonally and curl slowly.
 */
export function dotFieldFlow(x: number, y: number, t: number): number {
  return flowAt(x * 0.0052 + y * 0.0033, y * 0.0041 - x * 0.0017, t)
}
/** The flow from a dot's two precomputed wave phases (the dark and purple fields' rates). */
function flowAt(a: number, b: number, t: number): number {
  return 0.5 + 0.5 * Math.sin(a - t * 0.00038 + 1.7 * Math.sin(b + t * 0.00016))
}

/** How it works' per-dot fade: full for the top half, gone by the bottom; soft at the sides and the very top. */
export function howFieldFade(x: number, y: number, w: number, h: number): number {
  const down = Math.min(1, Math.max(0, (1 - y / h) / 0.5))
  const side = Math.min(1, Math.min(x, w - x) / Math.min(160, w * 0.16))
  const up = Math.min(1, y / 40 + 0.35)
  return down * down * (0.4 + 0.6 * side) * up
}

/** The tiles a box of this height is cut into: top and height of each, in CSS px. */
export function dotFieldTiles(height: number): { top: number; height: number }[] {
  const out: { top: number; height: number }[] = []
  for (let top = 0; top < height; top += DOT_FIELD_TILE) out.push({ top, height: Math.min(DOT_FIELD_TILE, height - top) })
  return out
}

type Ctx2D = {
  setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => void
  clearRect: (x: number, y: number, w: number, h: number) => void
  beginPath: () => void
  moveTo: (x: number, y: number) => void
  arc: (x: number, y: number, r: number, a0: number, a1: number) => void
  fill: () => void
  fillStyle: string | CanvasGradient | CanvasPattern
}
/** A canvas, on the page (HTMLCanvasElement) or in a worker (OffscreenCanvas). */
export type TileCanvas = { width: number; height: number; getContext: (type: "2d", options?: { alpha?: boolean }) => unknown }

type Tile = { n: number; canvas: TileCanvas; ctx: Ctx2D; top: number; th: number; on: boolean; dirty: boolean; i0: number; i1: number }

type Field = {
  id: number
  cfg: FieldConfig
  gap: number
  /* Scattered dots (seeded Poisson disc) in place of the even grid: the closing call, since landing round 12. */
  scatter: boolean
  fine: boolean
  reduced: boolean
  w: number
  h: number
  dpr: number
  /* x, y, brightness, wave a, wave b: five numbers a dot. */
  dots: Float32Array
  pageX: number
  pageY: number
  aimX: number
  aimY: number
  hasAim: boolean
  lightX: number
  lightY: number
  strength: number
  started: boolean
  covered: boolean
  last: number
  tiles: Map<number, Tile>
  ink: number[][]
  lit: number[][]
}

export type DotEngineHost = {
  raf: (cb: (t: number) => void) => number
  caf: (id: number) => void
  now: () => number
  /** A tile has been drawn for the first time. */
  onDrawn: (id: number, n: number) => void
}

export type DotEngine = ReturnType<typeof createDotEngine>

export function createDotEngine(host: DotEngineHost) {
  const fields = new Map<number, Field>()
  let hidden = false
  let frame = 0

  const running = (f: Field) => {
    if (hidden || f.covered || f.reduced) return false
    for (const t of f.tiles.values()) if (t.on) return true
    return false
  }

  /* Where the light is: the mouse (followed), or a slow wander of its own. */
  const moveLight = (f: Field, t: number, dt: number) => {
    const c = f.cfg
    let tx: number
    let ty: number
    let goal: number
    const mx = f.aimX - f.pageX
    const my = f.aimY - f.pageY
    if (f.hasAim && (c.within === null || (mx > -c.within && my > -c.within && mx < f.w + c.within && my < f.h + c.within))) {
      tx = mx
      ty = my
      goal = 1
    } else {
      tx = f.w * (c.pathX[0] + c.pathX[1] * Math.sin(t * c.pathX[2]))
      ty = f.h * (c.pathY[0] + c.pathY[1] * Math.sin(t * c.pathY[2] + c.pathY[3]))
      goal = f.fine ? c.alone[0] : c.alone[1]
    }
    const k = 1 - Math.pow(1 - c.follow, dt / 16.67)
    if (!f.started) {
      f.lightX = tx
      f.lightY = ty
      f.started = true
    } else {
      f.lightX += (tx - f.lightX) * k
      f.lightY += (ty - f.lightY) * k
    }
    f.strength += (goal - f.strength) * k * 0.6
  }

  const drawTile = (f: Field, tile: Tile, t: number) => {
    const c = f.cfg
    const d = f.dots
    const levels = c.levels
    const ink = f.ink
    const lit = f.lit
    for (let l = 0; l < levels; l++) {
      ink[l].length = 0
      lit[l].length = 0
    }
    const r2 = c.radius * c.radius
    const lo = tile.top - 2
    const hi = tile.top + tile.th + 2
    const lightOn = f.strength > 0.01
    const isSingle = c.mode === "single"
    const [ra, rb] = c.rate
    const rideX = c.rideX
    const rideY = c.rideY
    const ride = c.ride
    for (let i = tile.i0; i < tile.i1; i += 5) {
      const flow = 0.5 + 0.5 * Math.sin(d[i + 3] - t * ra + c.bend * Math.sin(d[i + 4] + t * rb))
      /* Each dot rides the current by under a pixel; on the closing call it stands on its point (ride 0) and the flow is its brightness only. */
      let x = d[i] + (flow - 0.5) * rideX * ride
      let y = d[i + 1] + (flow - 0.5) * rideY * ride
      const fade = d[i + 2]
      let a = isSingle ? c.rest * fade * (c.trough + (1 - c.trough) * flow * flow) : fade * (c.trough + (1 - c.trough) * flow * flow)
      let glow = 0
      const dx = x - f.lightX
      const dy = y - f.lightY
      const d2 = dx * dx + dy * dy
      if (d2 < r2 && lightOn) {
        const dd = Math.sqrt(d2) || 1
        const k = (1 - dd / c.radius) * (1 - dd / c.radius) * f.strength
        if (isSingle) a += (c.lit - c.rest * c.trough) * k
        else glow = k * fade
        x += (dx / dd) * c.part * k
        y += (dy / dd) * c.part * k
      }
      if (y < lo || y > hi) continue
      if (isSingle) {
        if (x < -2 || x > f.w + 2) continue
        const level = Math.min(levels - 1, Math.round((a / c.lit) * (levels - 1)))
        if (level <= 0) continue
        ink[level].push(x, y)
      } else {
        const level = Math.round(a * (1 - glow) * (levels - 1))
        if (level > 0) ink[level].push(x, y)
        const g = Math.round(glow * (levels - 1))
        if (g > 0) lit[g].push(x, y)
      }
    }
    const ctx = tile.ctx
    ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, -tile.top * f.dpr)
    ctx.clearRect(0, tile.top, f.w, tile.th)
    for (let pass = 0; pass < (isSingle ? 1 : 2); pass++) {
      const set = pass ? lit : ink
      const rgb = pass ? c.rgbLit : c.rgb
      const top = isSingle ? c.lit : pass ? c.lit : c.rest
      const rad = pass ? c.rLit : c.r
      for (let l = 1; l < levels; l++) {
        const b = set[l]
        if (!b.length) continue
        ctx.fillStyle = `rgba(${rgb},${((l / (levels - 1)) * top).toFixed(3)})`
        ctx.beginPath()
        for (let j = 0; j < b.length; j += 2) {
          ctx.moveTo(b[j] + rad, b[j + 1])
          ctx.arc(b[j], b[j + 1], rad, 0, c.turn)
        }
        ctx.fill()
      }
    }
    if (tile.dirty) {
      tile.dirty = false
      host.onDrawn(f.id, tile.n)
    }
  }

  /* A still frame for a field that is not in the loop (reduced motion, a tile that has just come near, a resize), once. */
  const settle = () => {
    if (hidden) return
    for (const f of fields.values()) {
      if (f.covered || running(f)) continue
      let any = false
      for (const tile of f.tiles.values()) if (tile.on && tile.dirty) any = true
      if (!any) continue
      moveLight(f, host.now(), 16.67)
      for (const tile of f.tiles.values()) if (tile.on && tile.dirty) drawTile(f, tile, host.now())
    }
  }

  const tick = (t: number) => {
    frame = 0
    let again = false
    for (const f of fields.values()) {
      if (!running(f)) {
        f.last = 0
        continue
      }
      again = true
      /* At most 60 a second (a 120Hz screen draws every other frame, evenly). The first frame after a start always draws. */
      if (f.last && t - f.last < f.cfg.frameMs[f.hasAim ? 0 : 1]) continue
      const dt = f.last ? Math.min(64, t - f.last) : 16.67
      f.last = t
      moveLight(f, t, dt)
      for (const tile of f.tiles.values()) if (tile.on) drawTile(f, tile, t)
    }
    if (again) frame = host.raf(tick)
  }

  /** Start or stop the loop, and give a still frame to what is not in it. */
  const sync = () => {
    settle()
    let any = false
    for (const f of fields.values()) if (running(f)) any = true
    if (any && !frame) frame = host.raf(tick)
    else if (!any && frame) {
      host.caf(frame)
      frame = 0
      for (const f of fields.values()) f.last = 0
    }
  }

  const layout = (f: Field) => {
    const pts = f.scatter ? dotFieldScatter(f.w, f.h, f.gap) : dotFieldPoints(f.w, f.h, f.gap)
    const n = pts.length / 4
    const dots = new Float32Array(n * 5)
    const light = f.cfg.mode === "light"
    /* Tiles read their stretch of dots by row (fit), so the dots must run top to bottom: a grid already does, a scatter is sorted by y. */
    let order: number[] | null = null
    if (f.scatter) {
      order = Array.from({ length: n }, (_, k) => k)
      order.sort((a, b) => pts[a * 4 + 1] - pts[b * 4 + 1])
    }
    for (let j = 0, k = 0; k < n; k++) {
      const i = (order ? order[k] : k) * 4
      const x = pts[i]
      const y = pts[i + 1]
      dots[j++] = x
      dots[j++] = y
      dots[j++] = light ? howFieldFade(x, y, f.w, f.h) : pts[i + 2]
      dots[j++] = x * 0.0052 + y * 0.0033
      dots[j++] = y * 0.0041 - x * 0.0017
    }
    f.dots = dots
    for (const tile of f.tiles.values()) fit(f, tile)
  }

  /* The tile's canvas size, and the stretch of the grid (rows run top to bottom) it can show. */
  const fit = (f: Field, tile: Tile) => {
    if (!f.w || !f.h) return
    tile.top = tile.n * DOT_FIELD_TILE
    tile.th = Math.max(0, Math.min(DOT_FIELD_TILE, f.h - tile.top))
    tile.canvas.width = Math.round(f.w * f.dpr)
    tile.canvas.height = Math.round(tile.th * f.dpr)
    const lo = tile.top - 12
    const hi = tile.top + tile.th + 12
    const d = f.dots
    let i0 = 0
    while (i0 < d.length && d[i0 + 1] < lo) i0 += 5
    let i1 = i0
    while (i1 < d.length && d[i1 + 1] <= hi) i1 += 5
    tile.i0 = i0
    tile.i1 = i1
    tile.dirty = true
  }

  return {
    field(id: number, kind: FieldKind, gap: number, fine: boolean, reduced: boolean, scatter = false) {
      const cfg = DOT_FIELD_CONFIGS[kind]
      fields.set(id, {
        id,
        cfg,
        gap: gap || HOW_FIELD.gap,
        scatter,
        fine,
        reduced,
        w: 0,
        h: 0,
        dpr: 1,
        dots: new Float32Array(0),
        pageX: 0,
        pageY: 0,
        aimX: 0,
        aimY: 0,
        hasAim: false,
        lightX: 0,
        lightY: 0,
        strength: 0,
        started: false,
        covered: false,
        last: 0,
        tiles: new Map(),
        ink: Array.from({ length: cfg.levels }, () => []),
        lit: Array.from({ length: cfg.levels }, () => []),
      })
    },
    remove(id: number) {
      fields.delete(id)
      sync()
    },
    tile(id: number, n: number, canvas: TileCanvas) {
      const f = fields.get(id)
      const ctx = canvas.getContext("2d", { alpha: true }) as Ctx2D | null
      if (!f || !ctx) return
      const tile: Tile = { n, canvas, ctx, top: n * DOT_FIELD_TILE, th: 0, on: false, dirty: true, i0: 0, i1: 0 }
      f.tiles.set(n, tile)
      fit(f, tile)
    },
    dropTile(id: number, n: number) {
      fields.get(id)?.tiles.delete(n)
      sync()
    },
    tileOn(id: number, n: number, on: boolean) {
      const tile = fields.get(id)?.tiles.get(n)
      if (!tile || tile.on === on) return
      tile.on = on
      sync()
    },
    size(id: number, w: number, h: number, dpr: number) {
      const f = fields.get(id)
      if (!f) return
      f.w = w
      f.h = h
      f.dpr = Math.min(f.cfg.maxDpr, dpr || 1)
      layout(f)
      sync()
    },
    /** The box's top left on the page (CSS px). */
    place(id: number, x: number, y: number) {
      const f = fields.get(id)
      if (f) {
        f.pageX = x
        f.pageY = y
      }
    },
    /** The mouse, in page coordinates, or gone. */
    aim(id: number, x: number, y: number, on: boolean) {
      const f = fields.get(id)
      if (!f) return
      f.aimX = x
      f.aimY = y
      f.hasAim = on
    },
    /** The field is under a sheet that covers it: no loop. */
    cover(id: number, on: boolean) {
      const f = fields.get(id)
      if (f && f.covered !== on) {
        f.covered = on
        sync()
      }
    },
    /** The tab is hidden: no loop for any field. */
    hide(on: boolean) {
      if (hidden === on) return
      hidden = on
      sync()
    },
    stop() {
      if (frame) host.caf(frame)
      frame = 0
      fields.clear()
    },
  }
}
