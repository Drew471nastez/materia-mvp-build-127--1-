import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const WT = process.env.WT || "/home/user/wt-n18nav"
export default {
  distDir: process.env.DIST || ".next",
  typescript: { ignoreBuildErrors: true },
  images: { formats: ['image/avif', 'image/webp'], minimumCacheTTL: 31536000, qualities: [75, 88] },
  experimental: { externalDir: true, staleTimes: { dynamic: 300, static: 300 } },
  webpack(config) {
    config.resolve.alias = { ...(config.resolve.alias || {}), "@": WT, "@supabase/supabase-js$": require.resolve("@supabase/supabase-js") }
    return config
  },
}
