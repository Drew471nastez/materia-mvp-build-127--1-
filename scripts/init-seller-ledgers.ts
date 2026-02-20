/**
 * One-time migration script: Initialize seller_ledger rows for all existing creators.
 *
 * Computes lifetime_earnings, lifetime_fees, lifetime_refunds from existing orders,
 * and sets available_amount = net earnings (since existing funds have already cleared holds).
 *
 * Run with:
 *   npx tsx scripts/init-seller-ledgers.ts
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log("Fetching all creators...");

  const { data: creators, error } = await supabase
    .from("creators")
    .select("id, username, stripe_account_id");

  if (error) {
    console.error("Failed to fetch creators:", error);
    process.exit(1);
  }

  if (!creators?.length) {
    console.log("No creators found.");
    return;
  }

  console.log(`Found ${creators.length} creators.\n`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const creator of creators) {
    try {
      // Check if ledger already exists
      const { data: existing } = await supabase
        .from("seller_ledger")
        .select("creator_id")
        .eq("creator_id", creator.id)
        .single();

      if (existing) {
        console.log(`  [SKIP] ${creator.username || creator.id} — ledger exists`);
        skipped++;
        continue;
      }

      // Get all products for this creator
      const { data: products } = await supabase
        .from("products")
        .select("id")
        .eq("creator_id", creator.id);

      const productIds = (products || []).map((p) => p.id);

      let lifetimeEarnings = 0;
      let lifetimeFees = 0;
      let lifetimeRefunds = 0;

      if (productIds.length > 0) {
        // Completed orders
        const { data: completedOrders } = await supabase
          .from("orders")
          .select("amount_cents, fee_cents")
          .in("product_id", productIds)
          .eq("status", "completed");

        if (completedOrders) {
          lifetimeEarnings = completedOrders.reduce(
            (sum, o) => sum + (o.amount_cents || 0),
            0,
          );
          lifetimeFees = completedOrders.reduce(
            (sum, o) => sum + (o.fee_cents || 0),
            0,
          );
        }

        // Refunded orders
        const { data: refundedOrders } = await supabase
          .from("orders")
          .select("refund_amount_cents, amount_cents")
          .in("product_id", productIds)
          .eq("status", "refunded");

        if (refundedOrders) {
          lifetimeRefunds = refundedOrders.reduce(
            (sum, o) => sum + (o.refund_amount_cents || o.amount_cents || 0),
            0,
          );
        }
      }

      // Net available = earnings - fees - refunds (all existing funds have cleared)
      const netAvailable = Math.max(0, lifetimeEarnings - lifetimeFees - lifetimeRefunds);

      // Insert ledger
      const { error: insertError } = await supabase.from("seller_ledger").insert({
        creator_id: creator.id,
        pending_amount: 0, // existing funds already cleared holds
        available_amount: netAvailable,
        in_transit_amount: 0,
        lifetime_earnings: lifetimeEarnings,
        lifetime_fees: lifetimeFees,
        lifetime_refunds: lifetimeRefunds,
        lifetime_paid_out: 0, // we don't have historic payout data here
        negative_balance: 0,
      });

      if (insertError) throw insertError;

      console.log(
        `  [OK]   ${creator.username || creator.id} — available: $${(netAvailable / 100).toFixed(2)} (earnings: $${(lifetimeEarnings / 100).toFixed(2)}, fees: $${(lifetimeFees / 100).toFixed(2)}, refunds: $${(lifetimeRefunds / 100).toFixed(2)})`,
      );
      created++;
    } catch (err: any) {
      console.error(
        `  [FAIL] ${creator.username || creator.id}: ${err.message}`,
      );
      failed++;
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}, Failed: ${failed}`);
}

main().catch(console.error);
