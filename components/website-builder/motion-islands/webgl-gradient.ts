/**
 * The living gradient (round P, P3): a slow domain-warped noise gradient in
 * the section's own colours, drawn by one small fragment shader with plain
 * WebGL (no library), at reduced resolution, behind the section's content.
 *
 * The still state, for reduced motion, low-power devices, no WebGL or a
 * lost context, is the same palette as layered CSS gradients, so the
 * section looks designed either way.
 */
import { resolvePalette, cssRgb, positioned, type IslandFactory, type StaticSetup } from "./runtime"
import type { ParamValue } from "@/lib/storelib-theme/motion-islands"

const palOf = (v: ParamValue | undefined): string[] => (Array.isArray(v) ? v : ["scheme"])
const num = (v: ParamValue | undefined, d: number) => (typeof v === "number" ? v : d)

/** A layer behind the section's children: z-index -1 inside the isolated island, so text stays above it. */
function backdrop(el: HTMLElement, node: HTMLElement): () => void {
  const unpos = positioned(el)
  const hadIso = el.style.isolation
  el.style.isolation = "isolate"
  node.setAttribute("aria-hidden", "true")
  node.style.cssText += ";position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block"
  el.prepend(node)
  return () => {
    node.remove()
    el.style.isolation = hadIso
    unpos()
  }
}

function stillGradient(el: HTMLElement, palette: string[]): string {
  const [a, b, c, d] = resolvePalette(el, palette).map(cssRgb)
  return `radial-gradient(60% 80% at 15% 20%, ${b} 0%, transparent 70%), radial-gradient(55% 70% at 85% 30%, ${c} 0%, transparent 70%), radial-gradient(70% 60% at 50% 100%, ${d} 0%, transparent 75%), ${a}`
}

export const webglGradientStill: StaticSetup = (el, params) => {
  const node = document.createElement("span")
  node.setAttribute("data-storelib-motion-node", "webgl-gradient")
  node.style.background = stillGradient(el, palOf(params.palette))
  return backdrop(el, node)
}

const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`
const FRAG = `precision mediump float;
uniform vec2 r;uniform float t;uniform vec3 c0;uniform vec3 c1;uniform vec3 c2;uniform vec3 c3;uniform float warp;uniform float grain;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),u.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p*=2.03;a*=.5;}return v;}
void main(){vec2 uv=gl_FragCoord.xy/r;vec2 p=uv*vec2(r.x/r.y,1.)*1.7;
vec2 q=vec2(fbm(p+vec2(0.,t*.06)),fbm(p+vec2(5.2,1.3)-t*.05));
vec2 w=p+warp*2.2*q;
float a=fbm(w+t*.035);float b=fbm(w*1.4+vec2(1.7,9.2)-t*.025);
vec3 col=mix(c0,c1,smoothstep(.25,.8,a));
col=mix(col,c2,smoothstep(.4,.95,b)*.85);
col=mix(col,c3,smoothstep(.55,1.,q.x)*.45);
col+=(h(gl_FragCoord.xy+fract(t)*91.)-.5)*grain*.16;
gl_FragColor=vec4(col,1.);}`

export const webglGradient: IslandFactory = (ctx) => {
  const { el, params, mode } = ctx
  const canvas = ctx.own(document.createElement("canvas"))
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "low-power", failIfMajorPerformanceCaveat: true }) as WebGLRenderingContext | null
  if (!gl) throw new Error("no webgl")
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader")
    return s
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link")
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, "p")
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const u = (nm: string) => gl.getUniformLocation(prog, nm)
  const uR = u("r"), uT = u("t")
  const colours = resolvePalette(el, palOf(params.palette))
  colours.forEach((c, i) => gl.uniform3f(u(`c${i}`), c[0], c[1], c[2]))
  gl.uniform1f(u("warp"), num(params.intensity, 60) / 100)
  gl.uniform1f(u("grain"), num(params.grain, 12) / 100)
  const speed = num(params.speed, 0.4) * (mode === "simple" ? 0.6 : 1)
  /* A blur of colour: a third of the pixels on a phone, half elsewhere, is invisible and cheap. */
  const scale = mode === "simple" ? 0.33 : 0.5
  let w = 0, h = 0, time = Math.random() * 50, lost = false
  const undo = backdrop(el, canvas)
  canvas.style.background = stillGradient(el, palOf(params.palette))
  const size = () => {
    const r = el.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    w = Math.max(1, Math.round(r.width * dpr * scale))
    h = Math.max(1, Math.round(r.height * dpr * scale))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
      gl.uniform2f(uR, w, h)
    }
    ctx.wake()
  }
  size()
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(size) : null
  ro?.observe(el)
  const onLost = (e: Event) => {
    e.preventDefault()
    lost = true
  }
  canvas.addEventListener("webglcontextlost", onLost)
  const still = speed === 0
  let drawn = false
  return {
    frame(_t, dt) {
      if (lost) return false
      time += dt * speed
      gl.uniform1f(uT, time)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      drawn = true
      return !still || !drawn
    },
    destroy() {
      ro?.disconnect()
      canvas.removeEventListener("webglcontextlost", onLost)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
      gl.getExtension("WEBGL_lose_context")?.loseContext()
      undo()
    },
  }
}
