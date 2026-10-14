-- Restore authenticated-only browser execution after dashboard exposure changes.
-- Apply manually after review. Idempotent; no domain data or function changes.
-- Existing service_role/owner privileges are intentionally left untouched.
begin;

revoke execute on function
  public.cosmifold_list_universes(),
  public.cosmifold_create_universe(uuid),
  public.cosmifold_read_universe(jsonb),
  public.cosmifold_commit_metadata(jsonb),
  public.cosmifold_operation_receipt(jsonb,uuid)
  from public, anon;

grant execute on function
  public.cosmifold_list_universes(),
  public.cosmifold_create_universe(uuid),
  public.cosmifold_read_universe(jsonb),
  public.cosmifold_commit_metadata(jsonb),
  public.cosmifold_operation_receipt(jsonb,uuid)
  to authenticated;

-- Delivered at commit; refresh PostgREST's cached schema/privilege information.
notify pgrst, 'reload schema';
commit;
