/**
 * The 3D object (round P, P3): a product photo on a real 3D card, or a lit
 * generated shape, turning with the scroll and leaning toward the pointer.
 *
 * THE ONLY MODULE THAT IMPORTS three.js. It is reached through a dynamic
 * import from ./islands.ts object3dLoader, which the runtime calls only for
 * a page that has a 3d-object island able to run (WebGL present, not
 * low-power, motion allowed). Every other page, and every other island,
 * never downloads it. tests/motion-islands-p3.test.ts checks the bundle.
 *
 * The picture's own <img> stays in the page as the still state and for
 * assistive tech (made transparent only once the first frame is drawn);
 * three reads its pixels from a fresh image of the same address, loaded
 * with CORS. If that fails, or the context is lost, the island falls back to
 * the picture.
 */
import * as THREE from "three"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"
import type { ParamValue } from "@/lib/storelib-theme/motion-islands"
import { MOTION_PROGRESS_VAR } from "@/lib/storelib-theme/motion-islands"
import { positioned, progressThrough, resolvePalette, type IslandContext, type Island } from "./runtime"

/*
 * three ships without type declarations here (./three.d.ts declares the
 * module loosely), so the few shapes this file relies on are written out.
 */
interface Texture { image: unknown; dispose(): void }
interface Geometry { boundingSphere: { radius: number } | null; computeBoundingSphere(): void; dispose(): void }

const num = (v: ParamValue | undefined, d: number) => (typeof v === "number" ? v : d)
const str = (v: ParamValue | undefined, d: string) => (typeof v === "string" ? v : d)
const bool = (v: ParamValue | undefined, d: boolean) => (typeof v === "boolean" ? v : d)

const FINISH: Record<string, { roughness: number; metalness: number; clearcoat: number }> = {
  matte: { roughness: 0.85, metalness: 0, clearcoat: 0 },
  satin: { roughness: 0.42, metalness: 0.08, clearcoat: 0.35 },
  gloss: { roughness: 0.14, metalness: 0.02, clearcoat: 1 },
  metal: { roughness: 0.26, metalness: 1, clearcoat: 0.2 },
}
const LIGHT: Record<string, { env: number; key: number; rim: number; ambient: number; exposure: number }> = {
  studio: { env: 1, key: 2.2, rim: 1.4, ambient: 0.35, exposure: 1.05 },
  soft: { env: 1.25, key: 1.1, rim: 0.5, ambient: 0.7, exposure: 1 },
  dramatic: { env: 0.45, key: 3.4, rim: 2.6, ambient: 0.08, exposure: 1.15 },
}

/** A picture's pixels for WebGL: the same address as the <img>, fetched with CORS. Null when the host refuses. */
function loadTexture(src: string): Promise<Texture | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.decoding = "async"
    img.onload = () => {
      const t = new THREE.Texture(img)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      t.needsUpdate = true
      resolve(t)
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function geometryFor(shape: string, aspect: number, detail: number): Geometry {
  switch (shape) {
    case "sphere": return new THREE.SphereGeometry(1, 32 * detail, 24 * detail)
    case "torus": return new THREE.TorusGeometry(0.85, 0.32, 24 * detail, 64 * detail)
    case "knot": return new THREE.TorusKnotGeometry(0.7, 0.24, 96 * detail, 16 * detail)
    case "box": return new RoundedBoxGeometry(1.4, 1.4, 1.4, 4, 0.16)
    case "coin": return new THREE.CylinderGeometry(1, 1, 0.16, 64 * detail, 1).rotateX(Math.PI / 2)
    case "blob": {
      const g = new THREE.IcosahedronGeometry(1, 12 * detail)
      const p = g.attributes.position as { count: number; setXYZ(i: number, x: number, y: number, z: number): void }
      const v = new THREE.Vector3()
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i)
        const k = 1 + 0.14 * Math.sin(v.x * 3.1 + 1.2) * Math.sin(v.y * 2.7) + 0.08 * Math.sin(v.z * 4.3 + v.x * 1.7)
        v.multiplyScalar(k)
        p.setXYZ(i, v.x, v.y, v.z)
      }
      g.computeVertexNormals()
      return g
    }
    default: {
      /* A card: the picture's own proportions, a little depth, rounded edges. */
      const h = 2
      const w = Math.max(0.4, Math.min(4, h * aspect))
      return new RoundedBoxGeometry(w, h, 0.05, 4, 0.04)
    }
  }
}

export async function object3d(ctx: IslandContext): Promise<Island> {
  const { el, params, mode } = ctx
  const picture = el.querySelector<HTMLImageElement>("img[data-motion-fallback]") ?? el.querySelector<HTMLImageElement>("img")
  const shapeAsked = str(params.shape, "card")
  const shape = shapeAsked === "card" && !picture ? "blob" : shapeAsked
  const finish = FINISH[str(params.finish, "satin")] ?? FINISH.satin
  const light = LIGHT[str(params.light, "studio")] ?? LIGHT.studio
  const rotate = mode === "simple" ? "scroll" : str(params.rotate, "both")
  const speed = num(params.speed, 0.6)
  const turn = num(params.intensity, 50) / 100
  const float = bool(params.float, true)
  const [, accent] = resolvePalette(el, Array.isArray(params.color) ? params.color : ["accent"])
  const tint = Array.isArray(params.color) && params.color[0].startsWith("#") ? resolvePalette(el, params.color)[0] : accent

  const texture = picture && (shape === "card" || shape === "box" || shape === "coin") ? await loadTexture(picture.currentSrc || picture.src) : null
  if (shape === "card" && !texture) throw new Error("the picture cannot be read by WebGL: the still picture stays")

  const canvas = ctx.own(document.createElement("canvas"))
  canvas.setAttribute("aria-hidden", "true")
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:1"
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: mode === "full", powerPreference: "default", failIfMajorPerformanceCaveat: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mode === "full" ? 1.75 : 1.25))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = light.exposure

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const envMap = pmrem.fromScene(room, 0.04).texture
  scene.environment = envMap
  scene.environmentIntensity = light.env

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50)
  camera.position.set(0, 0, 6)

  const key = new THREE.DirectionalLight(0xffffff, light.key)
  key.position.set(3, 4, 5)
  const rim = new THREE.DirectionalLight(new THREE.Color(accent[0], accent[1], accent[2]), light.rim)
  rim.position.set(-4, 1, -3)
  scene.add(key, rim, new THREE.AmbientLight(0xffffff, light.ambient))

  const aspect = picture && picture.naturalWidth && picture.naturalHeight ? picture.naturalWidth / picture.naturalHeight : texture ? (texture.image as HTMLImageElement).width / Math.max(1, (texture.image as HTMLImageElement).height) : 0.75
  const geometry = geometryFor(shape, aspect, mode === "full" ? 2 : 1)
  const base = { roughness: finish.roughness, metalness: finish.metalness, clearcoat: finish.clearcoat, clearcoatRoughness: 0.2 }
  const body = new THREE.MeshPhysicalMaterial({ ...base, color: new THREE.Color(tint[0], tint[1], tint[2]) })
  const face = texture ? new THREE.MeshPhysicalMaterial({ ...base, map: texture, metalness: Math.min(base.metalness, 0.1) }) : null
  /* A rounded box has six faces: +x, -x, +y, -y, +z (the picture), -z. */
  const materials = face && (shape === "card" || shape === "box") ? [body, body, body, body, face, shape === "box" ? face : body] : face && shape === "coin" ? [body, face, face] : body
  const mesh = new THREE.Mesh(geometry, materials)
  scene.add(mesh)

  /* Fit the object to the frame: the camera backs off until its bounding sphere fits the shorter side. */
  geometry.computeBoundingSphere()
  const radius = geometry.boundingSphere?.radius ?? 1.5
  const fit = (w: number, h: number) => {
    camera.aspect = w / Math.max(1, h)
    const vFov = (camera.fov * Math.PI) / 180
    const fitH = radius / Math.sin(vFov / 2)
    const fitW = radius / Math.sin(Math.atan(Math.tan(vFov / 2) * camera.aspect))
    camera.position.z = Math.max(fitH, fitW) * 1.08
    camera.updateProjectionMatrix()
  }

  const unpos = positioned(el)
  el.prepend(canvas)
  let lost = false
  const onLost = (e: Event) => {
    e.preventDefault()
    lost = true
    if (picture) picture.style.opacity = ""
    canvas.style.display = "none"
  }
  canvas.addEventListener("webglcontextlost", onLost)

  const size = () => {
    const r = el.getBoundingClientRect()
    const w = Math.max(1, Math.round(r.width))
    const h = Math.max(1, Math.round(r.height))
    renderer.setSize(w, h, false)
    fit(w, h)
    ctx.wake()
  }
  size()
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(size) : null
  ro?.observe(el)

  let progress = 0.5
  let px = 0, py = 0
  let rx = 0, ry = 0, spin = 0
  let first = true
  const pictureOpacity = picture?.style.opacity ?? ""
  return {
    measure() {
      const r = el.getBoundingClientRect()
      progress = progressThrough(r, ctx.viewport())
      const p = ctx.pointer()
      if (p && (rotate === "pointer" || rotate === "both")) {
        px = Math.max(-1, Math.min(1, (p.x - (r.left + r.width / 2)) / Math.max(1, r.width / 2)))
        py = Math.max(-1, Math.min(1, (p.y - (r.top + r.height / 2)) / Math.max(1, r.height / 2)))
      }
    },
    frame(t, dt) {
      if (lost) return false
      const k = 1 - Math.pow(1 - 0.09, dt * 60)
      const scrollTurn = rotate === "scroll" || rotate === "both" ? (progress - 0.5) * Math.PI * 1.6 * turn : 0
      const pointerY = rotate === "pointer" || rotate === "both" ? px * 0.55 * turn : 0
      const pointerX = rotate === "pointer" || rotate === "both" ? py * 0.4 * turn : 0
      if (rotate === "auto" || speed > 0) spin += dt * speed * (rotate === "auto" ? 0.9 : 0.15)
      const targetY = scrollTurn + pointerY + (rotate === "auto" || shape !== "card" ? spin : Math.sin(spin) * 0.15)
      const targetX = -pointerX + (shape === "card" ? 0.08 : 0.25) * Math.sin(spin * 0.7)
      ry += (targetY - ry) * k
      rx += (targetX - rx) * k
      mesh.rotation.set(rx, ry, shape === "card" ? -0.04 : 0)
      mesh.position.y = float ? Math.sin(t * 1.1) * 0.06 : 0
      renderer.render(scene, camera)
      el.style.setProperty(MOTION_PROGRESS_VAR, progress.toFixed(4))
      if (first) {
        first = false
        /* The first frame is drawn: the picture steps back (still in the page for screen readers). */
        if (picture) picture.style.opacity = "0"
      }
      return true
    },
    destroy() {
      ro?.disconnect()
      canvas.removeEventListener("webglcontextlost", onLost)
      if (picture) picture.style.opacity = pictureOpacity
      geometry.dispose()
      body.dispose()
      face?.dispose()
      texture?.dispose()
      envMap.dispose()
      pmrem.dispose()
      room.dispose?.()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
      unpos()
    },
  }
}
