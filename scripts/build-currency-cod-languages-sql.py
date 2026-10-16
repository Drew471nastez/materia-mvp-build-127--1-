"""Builds supabase/sql/store-currency-cod-languages/1_run.sql from run-now parts 174, 175, 176, 177, 178 and 186, text unchanged, with a check before and the validation after. Run: python3 scripts/build-currency-cod-languages-sql.py"""
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/"
RN = ROOT + "supabase/sql/run-now/"
OUT = ROOT + "supabase/sql/store-currency-cod-languages/"
PARTS = ["174_cash_on_delivery.sql", "175_automatic_translation.sql", "176_store_currency.sql", "177_translation_jobs.sql", "178_translation_memory.sql", "186_translation_queue.sql"]

def body(f):
    lines = open(RN + f).read().rstrip("\n").split("\n")
    return [l for l in lines if l.strip() and l.strip() != "notify pgrst, 'reload schema';"]

out = [
    "-- STORELIB: STORE CURRENCY, CASH ON DELIVERY AND LANGUAGES",
    "-- One file for the overhaul: run-now parts 174 (cash on delivery), 175 (translate",
    "-- changes automatically), 176 (a store's own selling currency), 177 (translating in",
    "-- the background), 178 (translation memory, the permanent cache) and 186 (changes",
    "-- translated within minutes of a publish), text unchanged.",
    "-- HOW: paste into a NEW query tab in the Supabase SQL editor and press Run. The",
    "-- editor runs it as one transaction: an error changes nothing. Safe to run again.",
    "-- Cash on delivery's countries, fee and note, and the Languages list, need no",
    "-- schema of their own: they live in store_settings.checkout and store_localization.",
    "-- Then run 2_check.sql. 3_rollback.sql says how to undo it.",
    "",
    "set local statement_timeout = 0;",
    "",
    "-- BEFORE: what these parts build on (parts 109, 136 and the physical commerce parts).",
    "DO $do$ BEGIN IF to_regclass('public.store_settings') IS NULL THEN RAISE EXCEPTION 'store_settings is missing: run supabase/sql/run-four (or all-in-two) first.'; END IF; IF to_regclass('public.store_localization') IS NULL THEN RAISE NOTICE 'store_localization is missing (part 136): automatic translation is skipped until it runs.'; END IF; IF to_regclass('public.commerce_checkouts') IS NULL THEN RAISE NOTICE 'commerce_checkouts is missing: cash on delivery is skipped until the physical commerce parts run.'; END IF; END $do$;",
    "",
]
for f in PARTS:
    out.append(f"-- part {f}")
    out += body(f)
    out.append("")
out.append("notify pgrst, 'reload schema';")
out.append("select 'Store currency, cash on delivery and languages ran. Now run 2_check.sql.' as done;")
open(OUT + "1_run.sql", "w").write("\n".join(out) + "\n")
print("1_run.sql", sum(len(l) + 1 for l in out))
