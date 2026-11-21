/*
  WHERE A MOVING CANVAS IS DRAWN (landing round 20). The dot fields and the
  globes hand their canvases to a worker (transferControlToOffscreen) so the
  page's thread stays free, everywhere but WebKit, which draws them on the
  page's own thread.

  Why. In the Safari engine (Playwright WebKit 26.6 at 390x844), flicking
  down the home page and back up brought the page's web process down in
  about one run in three. With the canvases handed over and never drawn on,
  none in 12; with the dot fields on the page's thread, 1 in 16, there by the
  globe a worker still drew; and none in 20 with no dot field worker. WebKit
  is every browser on an iPhone and the iOS app's web view.

  How it is read. GestureEvent is an interface only WebKit has, so this reads
  what the engine is, not what it says it is (never the user agent).
*/
export function canvasOnPageThread(): boolean {
  return typeof window !== "undefined" && typeof (window as unknown as { GestureEvent?: unknown }).GestureEvent === "function"
}
