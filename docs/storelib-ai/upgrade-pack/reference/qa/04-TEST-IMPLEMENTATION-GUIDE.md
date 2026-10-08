# Integration tests Claude must implement in Storelib's actual repo

These are named test specifications; not runnable Storelib tests in this pack because repo wasn't supplied.

- `theme_generated_full_clothing_site_compiles_and_publishes`
- `ai_site_planner_chooses_single_coach_landing_not_forced_ecommerce`
- `ai_creates_dynamic_template_for_any_product_slug`
- `ai_replaces_faq_from_scratch_preserves_answers_unrelated_pages`
- `ai_global_redesign_rebrands_sections_preserves_orders_and_catalog`
- `theme_new_section_schema_roundtrips_all_config`
- `theme_custom_header_menu_drawer_keyboard_mobile`
- `theme_asset_manifest_missing_entry_blocks_publish`
- `theme_bad_styling_button_text_contrast_fail_or_repair`
- `theme_stylesheet_size_budget_reports_and_splits_correctly`
- `commerce_variant_price_stock_media_cart_checkout_consistency`
- `commerce_shipping_zone_profile_location_checkout_rate_consistency`
- `commerce_payment_disabled_prevents_fake_checkout`
- `commerce_digital_entitlement_protects_download_link`
- `webapp_authorized_user_crud_and_unauthorized_user_denial`
- `screenshots_match_reference_target_viewport_with_reported_metric`
- `site_preview_live_snapshot_equivalence`
- `untrusted_attachment_prompt_injection_is_ignored`
- `long_conversation_edits_preserve_project_memory_and_undo`

For each test supply fixtures, execution commands, artifacts and failure conditions, verify in code, not screenshots alone. Build real tests in existing test framework and run CI.
