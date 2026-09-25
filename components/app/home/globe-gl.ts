/**
 * ===========================================================================
 *  THE GLOBE, DRAWN BY THE GRAPHICS CARD
 * ===========================================================================
 * The old globe drew about 1,500 circles a frame with the 2D canvas: each
 * one a path the processor built and the rasteriser filled, on the page's
 * own thread. On a phone that was several milliseconds a frame, every frame
 * the globe was on screen, and a swipe had to wait behind it (measured by
 * scripts/check-home-scroll.mjs and scripts/check-home-globe.mjs).
 *
 * Here the land is uploaded once, as points, and turned on the graphics
 * card by one 3x3 matrix. The ball, its light and its atmosphere do not
 * change as it turns, so they are painted once per size into a still
 * canvas under this one (globe-scene paintBall), and every frame is only
 * the dots, the pins and the arcs on a clear canvas. A frame on the page's
 * thread is a matrix, a few dozen moving points written into arrays made
 * once, and three draw calls. Nothing is allocated per frame.
 *
 * NOTHING WAITS FOR THE SHADERS. Asking whether a shader compiled, right
 * after compiling it, makes the page's thread wait for the compiler: 104ms
 * at mount, measured. The three programs are compiled and linked without a
 * question; where the browser can say when they are done
 * (KHR_parallel_shader_compile) the frame loop asks each frame and draws
 * the land from the first frame they are, with the still ball already on
 * screen; elsewhere the first frame asks once. A program that did not link
 * reports failed(), and the 2D renderer takes over.
 *
 * Asked for with `failIfMajorPerformanceCaveat`, so a device whose WebGL
 * would run on the processor gets the 2D renderer instead (globe-2d.ts).
 */
import { landDots } from "./globe-land"
import {
  ARC_SAMPLES, DOT_RADIUS, GLOBE_RADIUS, LIGHT, MAX_ARCS, MAX_SPRITES, PALETTE, SPRITE_FLOATS, TRAIL_FLOATS,
  paintBall, type Overlay,
} from "./globe-scene"

export interface GlobeRenderer {
  readonly kind: "webgl" | "2d"
  /** The canvas's size in CSS pixels (it is square) and the pixel ratio to draw at; the still ball is painted again here. */
  resize(size: number, dpr: number): void
  /** One frame: the land turned by `m`, and the overlay on top. Draws nothing while pending. */
  draw(m: Float32Array, overlay: Overlay): void
  /** Still getting ready (shaders compiling): keep asking for frames. */
  pending(): boolean
  /** Could not get ready: the 2D renderer should take over. */
  failed(): boolean
  /** Rebuild whatever the context lost (WebGL only). */
  restore(): boolean
  dispose(): void
}

/* The land: every dot on the half facing the viewer, smaller and fainter
   towards the edge, brighter where the light falls. */
const LAND_VS = `
attribute vec3 aPos;
uniform mat3 uRot;
uniform float uScale;
uniform float uDot;
uniform vec3 uLight;
varying float vAlpha;
varying float vLit;
void main() {
  vec3 p = uRot * aPos;
  if (p.z <= 0.02) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 1.0;
    vAlpha = 0.0;
    vLit = 0.0;
    return;
  }
  gl_Position = vec4(p.xy * uScale, 0.0, 1.0);
  vLit = smoothstep(-0.25, 0.85, dot(p, uLight));
  vAlpha = smoothstep(0.02, 0.32, p.z) * mix(0.34, 1.0, vLit);
  gl_PointSize = uDot * (0.58 + 0.42 * p.z);
}`

const LAND_FS = `
precision mediump float;
varying float vAlpha;
varying float vLit;
uniform vec3 uLandLit;
uniform vec3 uLandDark;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float a = (1.0 - smoothstep(0.45, 1.0, dot(c, c))) * vAlpha;
  gl_FragColor = vec4(mix(uLandDark, uLandLit, vLit) * a, a);
}`

/* Pins, pulses, the head of a sale in flight and where it lands: already
   turned (globe-scene.ts), so only placed and shaped here. */
const SPRITE_VS = `
attribute vec2 aXY;
attribute float aRadius;
attribute float aAlpha;
attribute float aKind;
attribute vec3 aColor;
uniform float uScale;
uniform float uRadiusPx;
uniform float uMaxPoint;
varying float vAlpha;
varying float vKind;
varying float vSize;
varying vec3 vColor;
void main() {
  gl_Position = vec4(aXY * uScale, 0.0, 1.0);
  vSize = min(uMaxPoint, max(1.0, aRadius * uRadiusPx * 2.0));
  gl_PointSize = vSize;
  vAlpha = aAlpha;
  vKind = aKind;
  vColor = aColor;
}`

const SPRITE_FS = `
precision mediump float;
varying float vAlpha;
varying float vKind;
varying float vSize;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  float px = 2.0 / vSize;
  float a;
  if (vKind < 0.5) {
    a = 1.0 - smoothstep(1.0 - 1.5 * px, 1.0, d);
  } else if (vKind < 1.5) {
    float w = max(1.2 * px, 0.05);
    a = 1.0 - smoothstep(w, w + 1.5 * px, abs(d - (1.0 - w - px)));
  } else {
    a = pow(max(0.0, 1.0 - d), 2.0);
  }
  a *= vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}`

/* A sale's curve, as a ribbon: two vertices per point, either side of the
   line, faded at the sides so it is smooth at any width. */
const TRAIL_VS = `
attribute vec2 aXY;
attribute float aAlpha;
attribute float aAcross;
varying float vAlpha;
varying float vAcross;
void main() {
  gl_Position = vec4(aXY, 0.0, 1.0);
  vAlpha = aAlpha;
  vAcross = aAcross;
}`

const TRAIL_FS = `
precision mediump float;
varying float vAlpha;
varying float vAcross;
uniform vec3 uColor;
void main() {
  float a = (1.0 - smoothstep(0.35, 1.0, abs(vAcross))) * vAlpha;
  gl_FragColor = vec4(uColor * a, a);
}`

type Program = { p: WebGLProgram; a: Record<string, number>; u: Record<string, WebGLUniformLocation | null> }
type Linking = { p: WebGLProgram; attributes: string[]; uniforms: string[] }

/** Compile and link, and ask nothing: the answer is read once the compiler is done (`finish`). */
function start(gl: WebGLRenderingContext, vs: string, fs: string, attributes: string[], uniforms: string[]): Linking | null {
  const v = gl.createShader(gl.VERTEX_SHADER)
  const f = gl.createShader(gl.FRAGMENT_SHADER)
  const p = gl.createProgram()
  if (!v || !f || !p) return null
  gl.shaderSource(v, vs)
  gl.shaderSource(f, fs)
  gl.compileShader(v)
  gl.compileShader(f)
  gl.attachShader(p, v)
  gl.attachShader(p, f)
  gl.linkProgram(p)
  /* Flagged now, freed with the program. */
  gl.deleteShader(v)
  gl.deleteShader(f)
  return { p, attributes, uniforms }
}

/** Once linked: whether it worked, and where its inputs are. */
function finish(gl: WebGLRenderingContext, l: Linking): Program | null {
  if (!gl.getProgramParameter(l.p, gl.LINK_STATUS)) return null
  const a: Record<string, number> = {}
  for (const name of l.attributes) a[name] = gl.getAttribLocation(l.p, name)
  const u: Record<string, WebGLUniformLocation | null> = {}
  for (const name of l.uniforms) u[name] = gl.getUniformLocation(l.p, name)
  return { p: l.p, a, u }
}

/** `canvas` is drawn every frame; `ball`, a 2D canvas under it, holds the still ball, painted once per size. */
export function createGlRenderer(canvas: HTMLCanvasElement, ball: HTMLCanvasElement): GlobeRenderer | null {
  let gl: WebGLRenderingContext | null = null
  try {
    gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
      failIfMajorPerformanceCaveat: true,
    }) as WebGLRenderingContext | null
  } catch {
    gl = null
  }
  if (!gl) return null
  const g = gl
  const parallel = g.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number } | null

  const land = landDots()
  const landCount = land.length / 3
  const spriteData = new Float32Array(MAX_SPRITES * SPRITE_FLOATS)
  const trailData = new Float32Array(MAX_ARCS * ARC_SAMPLES * 2 * 4)
  let linking: Linking[] = []
  let phase: "compiling" | "ready" | "failed" = "compiling"
  let dots: Program | null = null
  let sprites: Program | null = null
  let trails: Program | null = null
  let landBuf: WebGLBuffer | null = null
  let spriteBuf: WebGLBuffer | null = null
  let trailBuf: WebGLBuffer | null = null
  let maxPoint = 64
  let device = 1
  let dpr = 1
  /* Where each arc's ribbon starts in the buffer and how many vertices it has: kept, not made per frame. */
  const starts = new Int32Array(MAX_ARCS)
  const counts = new Int32Array(MAX_ARCS)
  let spriteAttrs: number[] = []

  /** One land dot at the front, across, in device pixels: DOT_RADIUS of the globe's, never under a pixel and a half. */
  const dotPx = () => Math.max(1.5 * dpr, 2 * DOT_RADIUS * GLOBE_RADIUS * device)

  /** Everything that does not wait on the compiler: the programs started, the buffers filled, the blending set. */
  const begin = () => {
    const programs = [
      start(g, LAND_VS, LAND_FS, ["aPos"], ["uRot", "uScale", "uDot", "uLight", "uLandLit", "uLandDark"]),
      start(g, SPRITE_VS, SPRITE_FS, ["aXY", "aRadius", "aAlpha", "aKind", "aColor"], ["uScale", "uRadiusPx", "uMaxPoint"]),
      start(g, TRAIL_VS, TRAIL_FS, ["aXY", "aAlpha", "aAcross"], ["uColor"]),
    ]
    dots = sprites = trails = null
    if (programs.some((l) => !l)) {
      phase = "failed"
      return
    }
    linking = programs as Linking[]
    phase = "compiling"
    landBuf = g.createBuffer()
    g.bindBuffer(g.ARRAY_BUFFER, landBuf)
    g.bufferData(g.ARRAY_BUFFER, land, g.STATIC_DRAW)
    spriteBuf = g.createBuffer()
    g.bindBuffer(g.ARRAY_BUFFER, spriteBuf)
    g.bufferData(g.ARRAY_BUFFER, spriteData.byteLength, g.DYNAMIC_DRAW)
    trailBuf = g.createBuffer()
    g.bindBuffer(g.ARRAY_BUFFER, trailBuf)
    g.bufferData(g.ARRAY_BUFFER, trailData.byteLength, g.DYNAMIC_DRAW)
    const range = g.getParameter(g.ALIASED_POINT_SIZE_RANGE) as Float32Array | null
    maxPoint = range ? Math.max(1, range[1]) : 64
    g.enable(g.BLEND)
    g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA)
    g.disable(g.DEPTH_TEST)
  }

  /** The sizes the programs are told, whenever the size or the programs change. */
  const sized = () => {
    if (!dots || !sprites) return
    g.useProgram(dots.p)
    g.uniform1f(dots.u.uDot, dotPx())
    g.useProgram(sprites.p)
    g.uniform1f(sprites.u.uRadiusPx, GLOBE_RADIUS * device)
  }

  /** Ready yet? Asks the compiler without waiting where it can, and finishes the setup the first time the answer is yes. */
  const settle = (): boolean => {
    if (phase !== "compiling") return phase === "ready"
    if (g.isContextLost()) return false
    if (parallel) for (const l of linking) if (!g.getProgramParameter(l.p, parallel.COMPLETION_STATUS_KHR)) return false
    const [d, s, t] = linking.map((l) => finish(g, l))
    if (!d || !s || !t) {
      phase = g.isContextLost() ? "compiling" : "failed"
      return false
    }
    dots = d
    sprites = s
    trails = t
    /* The unchanging uniforms, once per program. */
    g.useProgram(dots.p)
    g.uniform1f(dots.u.uScale, 2 * GLOBE_RADIUS)
    g.uniform3fv(dots.u.uLight, LIGHT)
    g.uniform3fv(dots.u.uLandLit, PALETTE.landLit)
    g.uniform3fv(dots.u.uLandDark, PALETTE.landDark)
    g.useProgram(sprites.p)
    g.uniform1f(sprites.u.uScale, 2 * GLOBE_RADIUS)
    g.uniform1f(sprites.u.uMaxPoint, maxPoint)
    spriteAttrs = [sprites.a.aXY, sprites.a.aRadius, sprites.a.aAlpha, sprites.a.aKind, sprites.a.aColor]
    sized()
    phase = "ready"
    return true
  }

  begin()
  if ((phase as string) === "failed") return null

  return {
    kind: "webgl",
    resize(size, ratio) {
      dpr = ratio
      device = Math.max(1, Math.round(size * ratio))
      if (canvas.width !== device) canvas.width = device
      if (canvas.height !== device) canvas.height = device
      if (ball.width !== device) ball.width = device
      if (ball.height !== device) ball.height = device
      g.viewport(0, 0, device, device)
      const still = ball.getContext("2d")
      if (still) paintBall(still, device, dpr)
      sized()
    },
    draw(m, o) {
      if (!settle() || !dots || !sprites || !trails || g.isContextLost()) return
      g.clearColor(0, 0, 0, 0)
      g.clear(g.COLOR_BUFFER_BIT)

      /* The land. */
      g.useProgram(dots.p)
      g.uniformMatrix3fv(dots.u.uRot, false, m)
      g.bindBuffer(g.ARRAY_BUFFER, landBuf)
      g.enableVertexAttribArray(dots.a.aPos)
      g.vertexAttribPointer(dots.a.aPos, 3, g.FLOAT, false, 0, 0)
      g.drawArrays(g.POINTS, 0, landCount)
      g.disableVertexAttribArray(dots.a.aPos)

      /* Sales in flight, as ribbons: the line's two edges, a dot's width apart. */
      const half = (dotPx() * 0.5) / (device * 0.5)
      const scale = 2 * GLOBE_RADIUS
      let written = 0
      for (let a = 0; a < MAX_ARCS; a++) {
        const n = o.trailCounts[a]
        starts[a] = written
        counts[a] = 0
        if (n < 2) continue
        const base = a * ARC_SAMPLES * TRAIL_FLOATS
        for (let k = 0; k < n; k++) {
          const i = base + k * TRAIL_FLOATS
          const x = o.trails[i] * scale
          const y = o.trails[i + 1] * scale
          const j0 = base + Math.max(0, k - 1) * TRAIL_FLOATS
          const j1 = base + Math.min(n - 1, k + 1) * TRAIL_FLOATS
          let dx = (o.trails[j1] - o.trails[j0]) * scale
          let dy = (o.trails[j1 + 1] - o.trails[j0 + 1]) * scale
          const len = Math.hypot(dx, dy) || 1
          dx /= len
          dy /= len
          /* Thinner towards the tail. */
          const w = half * (0.55 + 0.45 * (k / (n - 1)))
          const alpha = o.trails[i + 2]
          const v = written * 4
          trailData[v] = x - dy * w; trailData[v + 1] = y + dx * w; trailData[v + 2] = alpha; trailData[v + 3] = -1
          trailData[v + 4] = x + dy * w; trailData[v + 5] = y - dx * w; trailData[v + 6] = alpha; trailData[v + 7] = 1
          written += 2
        }
        counts[a] = written - starts[a]
      }
      if (written > 0) {
        g.useProgram(trails.p)
        g.uniform3fv(trails.u.uColor, PALETTE.arc)
        g.bindBuffer(g.ARRAY_BUFFER, trailBuf)
        /* The whole array, a few kilobytes: a subarray would be a new object every frame. */
        g.bufferSubData(g.ARRAY_BUFFER, 0, trailData)
        g.enableVertexAttribArray(trails.a.aXY)
        g.enableVertexAttribArray(trails.a.aAlpha)
        g.enableVertexAttribArray(trails.a.aAcross)
        g.vertexAttribPointer(trails.a.aXY, 2, g.FLOAT, false, 16, 0)
        g.vertexAttribPointer(trails.a.aAlpha, 1, g.FLOAT, false, 16, 8)
        g.vertexAttribPointer(trails.a.aAcross, 1, g.FLOAT, false, 16, 12)
        for (let a = 0; a < MAX_ARCS; a++) if (counts[a] >= 4) g.drawArrays(g.TRIANGLE_STRIP, starts[a], counts[a])
        g.disableVertexAttribArray(trails.a.aXY)
        g.disableVertexAttribArray(trails.a.aAlpha)
        g.disableVertexAttribArray(trails.a.aAcross)
      }

      /* Pins, pulses, heads and landings. */
      if (o.spriteCount > 0) {
        g.useProgram(sprites.p)
        g.bindBuffer(g.ARRAY_BUFFER, spriteBuf)
        g.bufferSubData(g.ARRAY_BUFFER, 0, o.sprites)
        const stride = SPRITE_FLOATS * 4
        for (let i = 0; i < spriteAttrs.length; i++) g.enableVertexAttribArray(spriteAttrs[i])
        g.vertexAttribPointer(sprites.a.aXY, 2, g.FLOAT, false, stride, 0)
        g.vertexAttribPointer(sprites.a.aRadius, 1, g.FLOAT, false, stride, 8)
        g.vertexAttribPointer(sprites.a.aAlpha, 1, g.FLOAT, false, stride, 12)
        g.vertexAttribPointer(sprites.a.aKind, 1, g.FLOAT, false, stride, 16)
        g.vertexAttribPointer(sprites.a.aColor, 3, g.FLOAT, false, stride, 20)
        g.drawArrays(g.POINTS, 0, o.spriteCount)
        for (let i = 0; i < spriteAttrs.length; i++) g.disableVertexAttribArray(spriteAttrs[i])
      }
    },
    pending() {
      return phase === "compiling"
    },
    failed() {
      return phase === "failed"
    },
    restore() {
      begin()
      return phase !== "failed"
    },
    dispose() {
      for (const b of [landBuf, spriteBuf, trailBuf]) if (b) g.deleteBuffer(b)
      for (const l of linking) g.deleteProgram(l.p)
      dots = sprites = trails = null
      linking = []
      /* Handed back now rather than when it is collected: a browser keeps only so many contexts, and Home is left and come back to all day. */
      g.getExtension("WEBGL_lose_context")?.loseContext()
    },
  }
}
