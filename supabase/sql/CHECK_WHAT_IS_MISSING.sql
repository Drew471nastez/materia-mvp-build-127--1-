/* ===========================================================================
   MOVED

   This asked whether the tables and columns added since September are in the
   database. It is now part of a larger read-only audit that asks the same
   question about everything the app calls, and names the file that creates
   whatever is absent:

       supabase/sql/run-now/00_check_first.sql

   Paste the second line of that file into the SQL editor and press Run.
   Every table and column this file used to check is in it, along with the
   functions, constraints, indexes, policies, storage buckets and upsert keys
   the app needs. supabase/sql/run-now/README.md explains how to read it.
   =========================================================================== */
