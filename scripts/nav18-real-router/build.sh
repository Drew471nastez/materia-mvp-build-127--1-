#!/bin/bash
# build.sh <checkout> <distdir>: builds this harness (a real Next 16 app router) against a checkout's components and CSS.
#   scripts/nav18-real-router/build.sh "$PWD" .next-after      this checkout
#   scripts/nav18-real-router/build.sh /path/to/base .next-before   another commit's sources (git archive <sha> | tar -x)
# A webpack build: turbopack refuses a symlinked node_modules. Then serve.sh <distdir> <port> and nav-probe.mjs / timing.mjs.
set -e
H=$(cd "$(dirname "$0")" && pwd)
WT=$(cd "${1:-$H/../..}" && pwd); DIST=${2:-.next-after}
cd "$H"
ln -sfn "$(readlink -f "$WT/node_modules")" node_modules
mkdir -p public
cp "$WT/public/images/design-mode/banner-login-desktop-D8selsDi.webp" public/cover.webp 2>/dev/null || cp "$H/../../public/images/design-mode/banner-login-desktop-D8selsDi.webp" public/cover.webp
cat > tsconfig.json <<JSON
{ "compilerOptions": { "target": "ES2017", "lib": ["dom", "esnext"], "jsx": "react-jsx", "module": "esnext", "moduleResolution": "bundler", "strict": false, "skipLibCheck": true, "noEmit": true, "esModuleInterop": true, "isolatedModules": true, "allowJs": true, "resolveJsonModule": true, "baseUrl": ".", "paths": { "@/*": ["$WT/*"] }, "plugins": [{ "name": "next" }] }, "include": ["**/*.ts", "**/*.tsx"], "exclude": ["node_modules"] }
JSON
(cd "$WT" && PROBE_CSS=source node -e 'import("./scripts/probe-css.mjs").then(async m=>{process.stdout.write(await m.appCss(process.cwd()))})') > "$H/public/probe-$(basename $DIST).css"
cp "$H/public/probe-$(basename $DIST).css" "$H/public/probe.css"
rm -rf "$H/$DIST"
NEXT_PUBLIC_SUPABASE_URL=http://localhost:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder WT=$WT DIST=$DIST NODE_OPTIONS=--max-old-space-size=6144 node node_modules/next/dist/bin/next build --webpack ${MANGLE:-}
