/* Superseded by part 451 (round 54; run any time, or skip). Part 445 first added an index for Explore's newest products; part 451 (Explore's catalogue index) covers the same read more exactly, so two would only slow every write to products. This part now removes 445's index if it was ever created, and does nothing otherwise. Run 451 for Explore's speed. Safe to run again. */
DROP INDEX IF EXISTS public.products_explore_newest_idx;
notify pgrst, 'reload schema';
