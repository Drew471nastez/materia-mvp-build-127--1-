/** Executes the shipped migrations in an isolated Postgres (PGlite), never
 * production. PGLITE_MODULE may point to an externally installed package. */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const { PGlite } = await import(
  process.env.PGLITE_MODULE || "@electric-sql/pglite"
)
const db = new PGlite()
const A = "aaaaaaaa-0000-4000-8000-000000000001",
  B = "bbbbbbbb-0000-4000-8000-000000000002",
  F = "ffffffff-0000-4000-8000-000000000001",
  G = "ffffffff-0000-4000-8000-000000000002",
  L = "eeeeeeee-0000-4000-8000-000000000001"
try {
  await db.exec(
    `create schema auth;create role anon;create role authenticated;create role service_role bypassrls;create table auth.users(id uuid primary key);insert into auth.users values('${A}'),('${B}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`,
  )
  await db.exec(
    readFileSync("supabase/sql/run-now/372_native_forms_leads.sql", "utf8"),
  )
  await db.exec(
    readFileSync("supabase/sql/run-now/372_native_forms_leads.sql", "utf8"),
  )
  const as = async (role, id) =>
    db.exec(
      `reset role;set role ${role};set "request.jwt.claim.sub"='${id || ""}'`,
    )
  await as("authenticated", A)
  await db.query(
    `insert into native_forms(id,owner_id,title,draft,published,status) values($1,$2,'Private draft','{}','{}','published')`,
    [F, A],
  )
  await as("authenticated", B)
  await db.query(
    `insert into native_forms(id,owner_id,title,draft) values($1,$2,'Other form','{}')`,
    [G, B],
  )
  assert.equal(
    (await db.query("select * from native_forms where id=$1", [F])).rows.length,
    0,
    "Another account cannot read drafts, published rows or integration settings",
  )
  await assert.rejects(
    db.query(`insert into native_forms(owner_id,draft) values($1,'{}')`, [A]),
    (e) => e.code === "42501",
  )
  await as("anon")
  await assert.rejects(
    db.query("select * from native_forms"),
    (e) => e.code === "42501",
  )
  await assert.rejects(
    db.query("select * from form_submissions"),
    (e) => e.code === "42501",
  )
  await assert.rejects(
    db.query(
      `insert into form_submissions(form_id,owner_id,form_revision,form_title,answers,consent,dedupe_key) values($1,$2,1,'Form','[]','{}',gen_random_uuid())`,
      [F, A],
    ),
    (e) => e.code === "42501",
  )
  await as("service_role")
  const insert = `insert into form_submissions(id,form_id,owner_id,form_revision,form_title,answers,consent,dedupe_key) values($1,$2,$3,1,'Intake','[{"label":"Email","value":"private@example.com"}]','{"accepted":true}',$4)`
  await db.query(insert, [L, F, A, "dddddddd-0000-4000-8000-000000000001"])
  await assert.rejects(
    db.query(insert, [
      "eeeeeeee-0000-4000-8000-000000000002",
      F,
      A,
      "dddddddd-0000-4000-8000-000000000001",
    ]),
    (e) => e.code === "23505",
  )
  await as("authenticated", B)
  assert.equal(
    (await db.query("select * from form_submissions")).rows.length,
    0,
  )
  await db.query(`update form_submissions set status='converted' where id=$1`, [
    L,
  ])
  await as("authenticated", A)
  assert.equal(
    (await db.query("select status from form_submissions where id=$1", [L]))
      .rows[0].status,
    "new",
  )
  await db.query(`update form_submissions set status='qualified' where id=$1`, [
    L,
  ])
  await assert.rejects(
    db.query("update form_submissions set owner_id=$1 where id=$2", [B, L]),
    (e) => e.code === "42501",
  )
  await assert.rejects(
    db.query("update form_submissions set form_id=$1 where id=$2", [G, L]),
    (e) => e.code === "42501",
  )
  await assert.rejects(
    db.query(`update form_submissions set status='bogus' where id=$1`, [L]),
    (e) => e.code === "23514",
  )
  await assert.rejects(
    db.query("update form_submissions set answers='[]' where id=$1", [L]),
    (e) => e.code === "42501",
  )
  await db.query("delete from form_submissions where id=$1", [L])
  assert.equal(
    (await db.query("select * from form_submissions")).rows.length,
    0,
  )
  await db.exec("reset role")
  await db.exec(
    `create table products(id uuid primary key,status text,price_cents integer,archived boolean default false);create table product_variants(id uuid primary key,product_id uuid references products(id),name text,price_cents integer,compare_at_price_cents integer,pay_what_you_want boolean default false,pwyw_min_price_cents integer,max_purchases integer,active boolean default true);create table orders(id uuid primary key default gen_random_uuid(),variant_id uuid,status text)`,
  )
  await db.exec(
    readFileSync("supabase/sql/run-now/373_variant_catalog_prices.sql", "utf8"),
  )
  await db.query(
    `insert into products(id,status,price_cents) values($1,'published',2500),($2,'draft',7500)`,
    [F, G],
  )
  await db.query(
    `insert into product_variants(id,product_id,name,price_cents,max_purchases) values($1,$2,'Free',0,1),($3,$4,'Private',0,null)`,
    [A, F, B, G],
  )
  await as("anon")
  assert.equal(
    (
      await db.query("select * from variant_catalog_prices($1::uuid[])", [
        [F, G],
      ])
    ).rows.length,
    1,
    "The price RPC exposes published products only",
  )
  assert.equal(
    (await db.query("select * from variant_catalog_prices($1::uuid[])", [[F]]))
      .rows[0].price_cents,
    0,
  )
  await db.exec("reset role")
  await db.query(
    `insert into orders(variant_id,status) values($1,'completed')`,
    [A],
  )
  await as("anon")
  assert.equal(
    (await db.query("select * from variant_catalog_prices($1::uuid[])", [[F]]))
      .rows[0].available,
    false,
    "Sold-out limited variants do not advertise an available Free price",
  )
  await db.exec("reset role")
  assert.equal(
    (await db.query("select price_cents from products where id=$1", [F]))
      .rows[0].price_cents,
    2500,
    "Original base prices are preserved",
  )
  await db.exec(
    `alter table products add column type text default 'digital',add column creator_id uuid,add column track_inventory boolean default true,add column continue_selling boolean default false;alter table product_variants add column track_inventory boolean default true,add column inventory_policy text default 'deny';create table inventory_locations(id uuid primary key,creator_id uuid,active boolean,fulfills_orders boolean);create table inventory_levels(variant_id uuid,location_id uuid,available integer)`,
  )
  await db.query(
    `update products set type='physical',creator_id=$1 where id=$2;`,
    [A, F],
  )
  await db.query(`update product_variants set max_purchases=null where id=$1`, [
    A,
  ])
  await db.query(`insert into inventory_locations values($1,$2,true,true)`, [
    G,
    A,
  ])
  await as("anon")
  assert.equal(
    (await db.query("select * from variant_catalog_prices($1::uuid[])", [[F]]))
      .rows[0].available,
    false,
    "A physical variant without stock is unavailable",
  )
  await db.exec("reset role")
  await db.query("insert into inventory_levels values($1,$2,3)", [A, G])
  await as("anon")
  assert.equal(
    (await db.query("select * from variant_catalog_prices($1::uuid[])", [[F]]))
      .rows[0].available,
    true,
    "Fulfilling inventory makes the same variant available",
  )
  console.log(
    "Postgres/RLS passed: owner isolation, no anonymous table access, lead status/delete, idempotency, private price isolation and variant availability",
  )
} finally {
  await db.close()
}
