/** The fixture page of tests/motion-islands-p3.test.ts: one of every island, as a section would draw it. */
const svg = (i: number, w = 320, h = 200) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="hsl(${(i * 37) % 360},70%,50%)"/><text x="20" y="60" font-size="48" fill="#fff">${i}</text></svg>`)}`

export function fixture(): string {
  const frames = Array.from({ length: 12 }, (_, i) => `<img data-motion-frame src="${svg(i, 640, 360)}" alt="Frame ${i + 1}">`).join("")
  const panels = Array.from({ length: 6 }, (_, i) => `<article style="flex:none;width:600px;height:380px;background:hsl(${i * 50},60%,60%)">Panel ${i + 1}</article>`).join("")
  const trail = Array.from({ length: 5 }, (_, i) => `<li><img src="${svg(i + 20, 200, 150)}" alt="Trail ${i + 1}"></li>`).join("")
  return `<div id="fixture">
<section id="gradient" data-storelib-motion="webgl-gradient" data-motion-palette="#101020,#ff5a36,#3b82f6" data-motion-speed="2" style="height:360px;padding:40px"><h2>A gradient band</h2></section>
<section id="object" data-storelib-motion="3d-object" data-motion-shape="card" data-motion-rotate="auto" data-motion-speed="2" style="height:420px"><img data-motion-fallback src="${svg(3, 300, 400)}" alt="The product" style="width:300px;height:400px;display:block;margin:auto"></section>
<section id="shape" data-storelib-motion="3d-object" data-motion-shape="torus" style="height:200px"><p>A third WebGL island</p></section>
<div style="height:500px"></div>
<h2 id="scramble" data-storelib-motion="text-scramble" data-motion-trigger="view" data-motion-duration="1600">Signal received</h2>
<div id="tilt" data-storelib-motion="3d-tilt" data-motion-intensity="12" style="width:320px;height:200px;background:#ddd;margin:20px">Card</div>
<div id="trail" data-storelib-motion="image-trail" data-motion-threshold="20" data-motion-lifetime="2000" style="height:300px;background:#eee"><h3>Trail</h3><ul data-motion-images>${trail}</ul></div>
<div id="cursor" data-storelib-motion="cursor-follow" data-motion-label='&lt;img src=x onerror="window.__xss=1"&gt;Play' style="height:200px;background:#f4f4f4"><p>Hover</p></div>
<div id="marquee" data-storelib-motion="marquee" data-motion-speed="300"><ul data-motion-track style="display:flex;gap:40px;margin:0;padding:0;list-style:none;font-size:40px"><li id="mq-1" data-block-id="b1">One</li><li>Two</li><li>Three<script>window.__ran=(window.__ran||0)+1</script></li></ul></div>
<section id="scrub" data-storelib-motion="scroll-scrub" data-motion-length="3"><div data-motion-stage>${frames}</div></section>
<section id="pin" data-storelib-motion="pin-horizontal"><div data-motion-stage><div data-motion-track style="display:flex;gap:20px">${panels}</div></div></section>
<section id="parallax" data-storelib-motion="parallax-depth" data-motion-intensity="100" data-motion-pointer="false" style="height:500px;position:relative;overflow:hidden"><div id="layer" data-motion-depth="1" style="height:100px;background:#cde">Layer</div><div id="still-layer" data-motion-depth="0">Still</div></section>
<ul id="reveal" data-storelib-motion="reveal-stagger" data-motion-stagger="40" data-motion-duration="300" style="margin-top:200px"><li>a</li><li>b</li><li>c</li><li>d</li></ul>
<div id="smooth" data-storelib-motion="smooth-scroll"></div>
<div id="unknown" data-storelib-motion="warp-drive">Unknown</div>
<div style="height:1600px"></div>
</div>`
}

