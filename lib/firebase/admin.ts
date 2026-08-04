import admin from "firebase-admin"

/**
 * Firebase Admin SDK singleton.
 * Server-only — never import in client components.
 *
 * Env vars required:
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY   (newlines escaped as \n in Vercel, unescaped here)
 *
 * Initialised on FIRST USE rather than on import, and that is the whole point
 * of this file's shape. Credentials read at module scope run during the build's
 * page-data collection, where none of these variables exist — so a missing push
 * key failed the entire build, on routes that merely imported something that
 * imported this. Worse, the failure was `Cannot read properties of undefined
 * (reading 'replace')`, which names neither the variable nor the file.
 *
 * Deferring it means a deploy without push configured builds and runs, and only
 * the code path that actually sends a notification notices — which it reports
 * by name.
 */
let app: admin.app.App | null = null

export function getFirebaseAdmin(): admin.app.App | null {
  if (app) return app
  if (admin.apps.length && admin.apps[0]) {
    app = admin.apps[0]
    return app
  }

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      "[firebase] Push disabled: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY",
    )
    return null
  }

  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      // Vercel stores the key on one line with literal \n sequences.
      privateKey: privateKey.replace(/\\n/g, "\n"),
    }),
  })
  return app
}

export default admin
