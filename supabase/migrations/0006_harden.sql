-- Lock down the two internal helpers (Supabase auto-grants EXECUTE to anon /
-- authenticated on new functions, so REVOKE FROM public wasn't enough). These
-- are only ever called from inside other SECURITY DEFINER functions.
revoke all on function assert_admin(uuid, uuid) from anon, authenticated, public;
revoke all on function assign_pairings(uuid)    from anon, authenticated, public;

-- Pin server_now's search_path (advisor: function_search_path_mutable).
alter function server_now() set search_path = pg_catalog, pg_temp;
