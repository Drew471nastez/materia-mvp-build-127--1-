import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
const require = createRequire(import.meta.url)
const WT = process.env.WT || "/home/user/wt-n23nav"
const SHIM = fileURLToPath(new URL("./fix/crypto-shim.js", import.meta.url))
export default {
  distDir: process.env.DIST || ".next",
  typescript: { ignoreBuildErrors: true },
  images: { formats: ['image/avif', 'image/webp'], minimumCacheTTL: 31536000, qualities: [75, 88] },
  experimental: { externalDir: true, staleTimes: { dynamic: 300, static: 300 } },
  webpack(config, { isServer, webpack }) {
    config.resolve.alias = { ...(config.resolve.alias || {}), "@": WT, "@supabase/supabase-js$": require.resolve("@supabase/supabase-js") }
    if (!isServer) config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^node:crypto$/, SHIM))
    return config
  },
}
