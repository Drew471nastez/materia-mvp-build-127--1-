-- ============================================================================
--  Subscribe bar: sticky on by default, and the bar always visible
-- ============================================================================
--
--  WHAT THIS FIXES
--
--  The store builder wrote the whole subscribe-bar settings object out on
--  every save, whether or not the creator ever touched the sticky switch —
--  and that switch defaulted to OFF for as long as it existed. So nearly
--  every stored config on the platform carries an explicit
--
--      "enableStickyBar": false
--
--  that never represented anybody's decision. Application-side defaults
--  cannot see past it (`false ?? true` is `false`), which is why changing the
--  fallback in code fixed nothing on live pages.
--
--  The code now distinguishes the two cases with a `stickyBarChoiceMade`
--  flag: absent means "no one has chosen, use the platform default", present
--  means "this creator decided, honour the stored value exactly, including
--  off". This migration backfills the flag so the stored data agrees with
--  what the app already renders:
--
--    - configs with no flag get sticky ON and the flag set, and
--    - the `visible` key is forced true, because the "Show Subscribe Bar"
--      toggle has been removed from the builder and the bar always renders.
--
--  Creators who genuinely want it off can turn it off in the builder after
--  this runs; that writes `stickyBarChoiceMade: true` alongside their `false`
--  and is honoured from then on.
--
--  IDEMPOTENT: the WHERE clause skips rows that already carry the flag, so
--  re-running this will not overwrite a creator's later choice.
-- ============================================================================

-- Draft configs
update public.store_builder_configs
set draft_config = jsonb_set(
      jsonb_set(
        jsonb_set(
          draft_config,
          '{headerSettings,subscribeBar,enableStickyBar}', 'true'::jsonb, true
        ),
        '{headerSettings,subscribeBar,enableStickyOnScrollUp}', 'true'::jsonb, true
      ),
      '{headerSettings,subscribeBar,stickyBarChoiceMade}', 'true'::jsonb, true
    )
where page_type = 'shop'
  and draft_config -> 'headerSettings' -> 'subscribeBar' is not null
  and coalesce(
        (draft_config -> 'headerSettings' -> 'subscribeBar' ->> 'stickyBarChoiceMade')::boolean,
        false
      ) = false;

-- Published configs (what the public storefront actually reads)
update public.store_builder_configs
set published_config = jsonb_set(
      jsonb_set(
        jsonb_set(
          published_config,
          '{headerSettings,subscribeBar,enableStickyBar}', 'true'::jsonb, true
        ),
        '{headerSettings,subscribeBar,enableStickyOnScrollUp}', 'true'::jsonb, true
      ),
      '{headerSettings,subscribeBar,stickyBarChoiceMade}', 'true'::jsonb, true
    )
where page_type = 'shop'
  and published_config -> 'headerSettings' -> 'subscribeBar' is not null
  and coalesce(
        (published_config -> 'headerSettings' -> 'subscribeBar' ->> 'stickyBarChoiceMade')::boolean,
        false
      ) = false;

-- The bar is no longer optional — clear any stored `visible: false`.
update public.store_builder_configs
set draft_config = jsonb_set(
      draft_config, '{headerSettings,subscribeBar,visible}', 'true'::jsonb, true
    )
where page_type = 'shop'
  and draft_config -> 'headerSettings' -> 'subscribeBar' is not null
  and coalesce(
        (draft_config -> 'headerSettings' -> 'subscribeBar' ->> 'visible')::boolean,
        true
      ) = false;

update public.store_builder_configs
set published_config = jsonb_set(
      published_config, '{headerSettings,subscribeBar,visible}', 'true'::jsonb, true
    )
where page_type = 'shop'
  and published_config -> 'headerSettings' -> 'subscribeBar' is not null
  and coalesce(
        (published_config -> 'headerSettings' -> 'subscribeBar' ->> 'visible')::boolean,
        true
      ) = false;
