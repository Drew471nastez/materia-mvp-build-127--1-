import http from "node:http"

/**
 * The container's HEALTHCHECK: exit 0 when /health answers 200 (clamd is up
 * and scanning works), 1 otherwise. Plain node, so the image needs no curl.
 */
const port = Number(process.env.PORT) || 8080
const req = http.get({ host: "127.0.0.1", port, path: "/health", timeout: 4000 }, (res) => {
  res.resume()
  process.exit(res.statusCode === 200 ? 0 : 1)
})
req.on("timeout", () => req.destroy(new Error("timeout")))
req.on("error", () => process.exit(1))
