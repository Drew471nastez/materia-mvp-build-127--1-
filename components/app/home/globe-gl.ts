/**
 * ===========================================================================
 *  THE GLOBE, DRAWN BY THE GRAPHICS CARD
 * ===========================================================================
 * The old globe drew about 1,500 circles a frame with the 2D canvas: each
 * one a path the processor built and the rasteriser filled, on the page's
 * own thread. On a phone that was several milliseconds a frame, every frame
 * the globe was on screen, and a swipe had to wait behind it (measured by
 * scripts/check-home-scroll.mjs).
 *
 * Here the land is uploaded once, as points, and turned on the graphics
 * card by one 3x3 matrix. The ball, its light and its atmosphere do not
 * change as it turns (the light is fixed to the viewer, and a ball looks
 * the same from every side), so they are one shader pass drawn once per
 * size and copied into a still canvas under this one (`ball`): every
 * frame after that is only the dots, the pins and the arcs, on a clear
 * canvas. A frame on the page's thread is a matrix, a few dozen moving
 * points written into an array made once, and four draw calls. Nothing is
 * allocated per frame.
 *
 * Asked for with `failIfMajorPerformanceCaveat`, so a device whose WebGL
 * would run on the processor gets the 2D renderer instead (globe-2d.ts),
 * which is cheaper there.
 */
import { landDots } from "./globe-land"
import {
  ARC_SAMPLES, DOT_RADIUS, GLOBE_RADIUS, LIGHT, MAX_ARCS, MAX_SPRITES, PALETTE, SPRITE_FLOATS, TRAIL_FLOATS,
  type Overlay,
} from "./globe-scene"

export interface GlobeRenderer {
  readonly kind: "webgl" | "2d"
  /** The canvas's size in CSS pixels (it is square) and the pixel ratio to draw at; the still ball is painted again here. */
  resize(size: number, dpr: number): void
  /** One frame: the land turned by `m`, and the overlay on top. */
  draw(m: Float32Array, overlay: Overlay): void
  /** Rebuild whatever the context lost (WebGL only). */
  restore(): boolean
  dispose(): void
}

const BODY_VS = `
attribute vec2 aCorner;
uniform float uUnits;
varying vec2 vP;
void main() {
  vP = aCorner * uUnits;
  gl_Position = vec4(aCorner, 0.0, 1.0);
}`

/* The ball: lit from the upper left, a rim of light at its edge, a small
   shine, and outside it a thin atmosphere that is brighter on the lit side.
   Premultiplied alpha, anti-aliased over one pixel at the outline. */
const BODY_FS = `
precision mediump float;
varying vec2 vP;
uniform float uAA;
uniform vec3 uLight;
uniform vec3 uDeep;
uniform vec3 uLit;
uniform vec3 uRim;
uniform vec3 uHalo;
uniform float uHaloAlpha;
void main() {
  float r2 = dot(vP, vP);
  float r = sqrt(r2);
  float inside = 1.0 - smoothstep(1.0 - uAA, 1.0 + uAA, r);
  float z = sqrt(max(0.0, 1.0 - min(r2, 1.0)));
  vec3 n = vec3(vP, z);
  float wrap = clamp((dot(n, uLight) + 0.3) / 1.3, 0.0, 1.0);
  float fres = pow(1.0 - z, 2.6);
  vec3 body = mix(uDeep, uLit, wrap * wrap);
  body += uRim * fres * (0.12 + 0.55 * wrap);
  vec3 refl = reflect(-uLight, n);
  body += vec3(0.9, 0.88, 1.0) * pow(max(refl.z, 0.0), 28.0) * 0.1;
  float t = clamp((r - 1.0) / 0.13, 0.0, 1.0);
  float side = 0.5 + 0.5 * dot(normalize(vP + vec2(0.0001)), normalize(uLight.xy));
  float halo = (1.0 - t) * (1.0 - t) * uHaloAlpha * (0.45 + 0.55 * side) * (1.0 - inside);
  gl_FragColor = vec4(body * inside + uHalo * halo, inside + halo);
}`

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

function compile(gl: WebGLRenderingContext, vs: string, fs: string, attributes: string[], uniforms: string[]): Program | null {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)
    if (!s) return null
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      gl.deleteShader(s)
      return null
    }
    return s
  }
  const v = shader(gl.VERTEX_SHADER, vs)
  const f = shader(gl.FRAGMENT_SHADER, fs)
  const p = gl.createProgram()
  if (!v || !f || !p) return null
  gl.attachShader(p, v)
  gl.attachShader(p, f)
  gl.linkProgram(p)
  gl.deleteShader(v)
  gl.deleteShader(f)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) return null
  const a: Record<string, number> = {}
  for (const name of attributes) a[name] = gl.getAttribLocation(p, name)
  const u: Record<string, WebGLUniformLocation | null> = {}
  for (const name of uniforms) u[name] = gl.getUniformLocation(p, name)
  return { p, a, u }
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

  const land = landDots()
  const landCount = land.length / 3
  const spriteData = new Float32Array(MAX_SPRITES * SPRITE_FLOATS)
  const trailData = new Float32Array(MAX_ARCS * ARC_SAMPLES * 2 * 4)
  let body: Program | null = null
  let dots: Program | null = null
  let sprites: Program | null = null
  let trails: Program | null = null
  let quadBuf: WebGLBuffer | null = null
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

  const build = (): boolean => {
    body = compile(g, BODY_VS, BODY_FS, ["aCorner"], ["uUnits", "uAA", "uLight", "uDeep", "uLit", "uRim", "uHalo", "uHaloAlpha"])
    dots = compile(g, LAND_VS, LAND_FS, ["aPos"], ["uRot", "uScale", "uDot", "uLight", "uLandLit", "uLandDark"])
    sprites = compile(g, SPRITE_VS, SPRITE_FS, ["aXY", "aRadius", "aAlpha", "aKind", "aColor"], ["uScale", "uRadiusPx", "uMaxPoint"])
    trails = compile(g, TRAIL_VS, TRAIL_FS, ["aXY", "aAlpha", "aAcross"], ["uColor"])
    if (!body || !dots || !sprites || !trails) return false
    quadBuf = g.createBuffer()
    g.bindBuffer(g.ARRAY_BUFFER, quadBuf)
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW)
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
    /* The unchanging uniforms, once per program. */
    g.useProgram(body.p)
    g.uniform1f(body.u.uUnits, 1 / (2 * GLOBE_RADIUS))
    g.uniform3fv(body.u.uLight, LIGHT)
    g.uniform3fv(body.u.uDeep, PALETTE.deep)
    g.uniform3fv(body.u.uLit, PALETTE.lit)
    g.uniform3fv(body.u.uRim, PALETTE.rim)
    g.uniform3fv(body.u.uHalo, PALETTE.halo)
    g.uniform1f(body.u.uHaloAlpha, PALETTE.haloAlpha)
    g.useProgram(dots.p)
    g.uniform1f(dots.u.uScale, 2 * GLOBE_RADIUS)
    g.uniform3fv(dots.u.uLight, LIGHT)
    g.uniform3fv(dots.u.uLandLit, PALETTE.landLit)
    g.uniform3fv(dots.u.uLandDark, PALETTE.landDark)
    g.useProgram(sprites.p)
    g.uniform1f(sprites.u.uScale, 2 * GLOBE_RADIUS)
    g.uniform1f(sprites.u.uMaxPoint, maxPoint)
    spriteAttrs = [sprites.a.aXY, sprites.a.aRadius, sprites.a.aAlpha, sprites.a.aKind, sprites.a.aColor]
    return true
  }
  if (!build()) return null

  /** One land dot at the front, across, in device pixels: DOT_RADIUS of the globe's, never under a pixel and a half. */
  const dotPx = () => Math.max(1.5 * dpr, 2 * DOT_RADIUS * GLOBE_RADIUS * device)

  return {
    kind: "webgl",
    resize(size, ratio) {
      dpr = ratio
      device = Math.max(1, Math.round(size * ratio))
      if (canvas.width !== device) canvas.width = device
      if (canvas.height !== device) canvas.height = device
      g.viewport(0, 0, device, device)
      if (!body || !dots || !sprites) return
      const radiusPx = GLOBE_RADIUS * device
      g.useProgram(body.p)
      g.uniform1f(body.u.uAA, 1.1 / radiusPx)
      g.useProgram(dots.p)
      g.uniform1f(dots.u.uDot, dotPx())
      g.useProgram(sprites.p)
      g.uniform1f(sprites.u.uRadiusPx, radiusPx)

      /* The ball and its atmosphere, once: drawn here, copied into the still canvas before this task ends (while the drawing buffer is still this frame's), and cleared. */
      if (ball.width !== device) ball.width = device
      if (ball.height !== device) ball.height = device
      const still = ball.getContext("2d")
      if (still && !g.isContextLost()) {
        g.clearColor(0, 0, 0, 0)
        g.clear(g.COLOR_BUFFER_BIT)
        g.useProgram(body.p)
        g.bindBuffer(g.ARRAY_BUFFER, quadBuf)
        g.enableVertexAttribArray(body.a.aCorner)
        g.vertexAttribPointer(body.a.aCorner, 2, g.FLOAT, false, 0, 0)
        g.drawArrays(g.TRIANGLE_STRIP, 0, 4)
        g.disableVertexAttribArray(body.a.aCorner)
        still.clearRect(0, 0, device, device)
        still.drawImage(canvas, 0, 0)
        g.clear(g.COLOR_BUFFER_BIT)
      }
    },
    draw(m, o) {
      if (!body || !dots || !sprites || !trails || g.isContextLost()) return
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
    restore() {
      return build()
    },
    dispose() {
      for (const b of [quadBuf, landBuf, spriteBuf, trailBuf]) if (b) g.deleteBuffer(b)
      for (const p of [body, dots, sprites, trails]) if (p) g.deleteProgram(p.p)
      body = dots = sprites = trails = null
      /* Handed back now rather than when it is collected: a browser keeps only so many contexts, and Home is left and come back to all day. */
      g.getExtension("WEBGL_lose_context")?.loseContext()
    },
  }
}
