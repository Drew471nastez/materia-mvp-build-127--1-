/**
 * One-time migration script: Force all existing Stripe Connect accounts to manual payouts.
 *
 * Run with:
 *   npx tsx scripts/force-manual-payouts.ts
 *
 * Requires env vars: STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia" as any,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log("Fetching all creators with Stripe accounts...");

  const { data: creators, error } = await supabase
    .from("creators")
    .select("id, stripe_account_id, username")
    .not("stripe_account_id", "is", null);

  if (error) {
    console.error("Failed to fetch creators:", error);
    process.exit(1);
  }

  if (!creators?.length) {
    console.log("No creators with Stripe accounts found.");
    return;
  }

  console.log(`Found ${creators.length} creators with Stripe accounts.\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const creator of creators) {
    try {
      // Check current schedule
      const account = await stripe.accounts.retrieve(creator.stripe_account_id);
      const schedule = (account as any).settings?.payouts?.schedule;

      if (schedule?.interval === "manual") {
        console.log(`  [SKIP] ${creator.username || creator.id} — already manual`);
        skipped++;
        continue;
      }

      // Force to manual
      await stripe.accounts.update(creator.stripe_account_id, {
        settings: {
          payouts: {
            schedule: { interval: "manual" as const },
          },
        },
      });

      console.log(
        `  [OK]   ${creator.username || creator.id} — changed from ${schedule?.interval || "unknown"} to manual`,
      );
      updated++;
    } catch (err: any) {
      console.error(
        `  [FAIL] ${creator.username || creator.id} (${creator.stripe_account_id}): ${err.message}`,
      );
      failed++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`);
}

main().catch(console.error);
