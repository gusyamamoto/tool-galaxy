-- GENERATED SQL EDITOR VALIDATION (runnable artifact, not the template).
-- Paste this ENTIRE file: tests/database/cloud-metadata-sql-editor.sql
-- Generated locally by scripts/build-cloud-validation.js; no SQL was executed.
-- Migration SHA256 (normalized LF): 57f1e55257f3a742334c463836d565b8336c7e1b88f9b20eb1f61692fd8b074d
-- Database suite SHA256 (normalized LF): c03a3008571d6708e46631ad3ba0e8fa31611ed88b59744ffda2d19484d76874
-- No COMMIT, schema exposure changes, HTTP requests or secrets are used.
-- A failed assertion is an ERROR, never a swallowed "success". The inner
-- subtransaction discards scratch DDL/data on success AND failure. Final ROLLBACK
-- clears the outer transaction. If execution aborts, issue ROLLBACK as cleanup.
begin;
set local statement_timeout = '120s';
set local lock_timeout = '5s';
set local check_function_bodies = on;

do $cm_validation_runner$
declare
  stage text := 'preflight'; actor text := current_user;
  config_row record; config_value text; settings jsonb := '[]'::jsonb;
  failure_state text; failure_message text; failure_context text;
begin
  -- Refuse to overwrite any previously installed migration/checkpoint objects.
  if to_regnamespace('cosmifold_private') is not null or exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('cosmifold_read_universe','cosmifold_list_universes',
      'cosmifold_create_universe','cosmifold_operation_receipt','cosmifold_commit_metadata')
  ) then raise exception 'Refusing validation: Cosmifold schema/RPC objects already exist. Nothing was changed.'; end if;
  if current_setting('server_version_num')::integer<150000 or current_setting('server_encoding')<>'UTF8' then
    raise exception 'PostgreSQL 15+ / UTF8 required.';
  end if;
  if actor in ('authenticated','anon') or to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null then
    raise exception 'Use the normal SQL Editor administrative role with Supabase Auth available.';
  end if;
  if (select count(*) from pg_roles where rolname in ('authenticated','anon'))<>2 or
    exists(select 1 from pg_roles where rolname in ('authenticated','anon') and (rolsuper or rolbypassrls)) then
    raise exception 'Missing/unsafe application roles: authenticated and anon must not be superuser/BYPASSRLS.';
  end if;
  if exists(select 1 from auth.users where id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002')) then
    raise exception 'Fixture IDs already exist. Refusing to touch existing Auth users.';
  end if;
  -- Unknown Auth hooks could call external services, which ROLLBACK cannot undo.
  if exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal) then
    raise exception 'Custom auth.users triggers require review first. Validation refused; do not disable them just to pass.';
  end if;
  -- Settings visible in this connection/catalog are NOT an HTTP exposure proof.
  -- Abort on any explicit private exposure/search-path setting we can observe.
  for config_row in
    select r.rolname,d.datname,setting from pg_db_role_setting s
    left join pg_roles r on r.oid=s.setrole left join pg_database d on d.oid=s.setdatabase
    cross join lateral unnest(s.setconfig) as entries(setting)
    where s.setdatabase in (0,(select oid from pg_database where datname=current_database())) and
      (s.setrole=0 or r.rolname in ('authenticator','authenticated','anon')) and
      (setting like 'pgrst.db_schemas=%' or setting like 'pgrst.db_extra_search_path=%' or setting like 'search_path=%' or setting like 'pgrst.db_pre_config=%')
  loop
    settings:=settings||jsonb_build_array(jsonb_build_object('role',config_row.rolname,'database',config_row.datname,'setting',config_row.setting));
    if config_row.setting like '%cosmifold_private%' then
      raise exception 'Private schema is present in a visible API/role configuration. Review configuration before running validation.';
    end if;
  end loop;
  foreach config_value in array array[current_setting('pgrst.db_schemas',true),current_setting('pgrst.db_extra_search_path',true)] loop
    if config_value like '%cosmifold_private%' then raise exception 'Private schema present in visible PostgREST configuration.'; end if;
  end loop;
  for config_row in
    select p.oid::regprocedure::text as function_name,setting from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral unnest(p.proconfig) as entries(setting)
    where n.nspname in ('graphql','graphql_public') and setting like 'search_path=%'
  loop
    settings:=settings||jsonb_build_array(jsonb_build_object('function',config_row.function_name,'setting',config_row.setting));
    if config_row.setting like '%cosmifold_private%' then raise exception 'Private schema in GraphQL function search_path. Review API boundary first.'; end if;
  end loop;
  raise notice 'Visible API configuration (not HTTP proof): %',settings;
  raise notice 'Enabled DDL event triggers need prior manual review: %',
    (select coalesce(jsonb_agg(jsonb_build_object('name',evtname,'function',evtfoid::regprocedure::text)),'[]'::jsonb) from pg_event_trigger where evtenabled<>'D');

  begin
    stage := 'migration compilation';
    -- Exact migration body, with ONLY its outer BEGIN/COMMIT removed.
    execute $cm_migration_body$

create schema cosmifold_private;
revoke all on schema cosmifold_private from public, anon, authenticated;
grant usage on schema cosmifold_private to authenticated;

-- Helpers never elevate privileges. They are inaccessible through PostgREST.
create function cosmifold_private.utf16_length(value text) returns integer
language sql immutable strict security invoker set search_path = '' as $$
  select coalesce(sum(case when ascii(substr(value,i,1)) > 65535 then 2 else 1 end),0)::integer
  from generate_series(1,char_length(value)) as n(i)
$$;

create function cosmifold_private.js_trim(value text) returns text
language sql immutable strict security invoker set search_path = '' as $$
  select btrim(value, ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(160) || chr(5760) ||
    chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||
    chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))
$$;

create function cosmifold_private.valid_id(value text, maximum integer) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select coalesce(cosmifold_private.js_trim(value) <> '' and cosmifold_private.utf16_length(value) <= maximum,false)
$$;

create function cosmifold_private.exact_keys(value jsonb, allowed text[], required text[] default '{}'::text[]) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select case when jsonb_typeof(value) = 'object' then
    value ?& required and not exists(select 1 from jsonb_object_keys(value) k where not k = any(allowed))
    else false end
$$;

create function cosmifold_private.valid_timestamp(value text) returns boolean
language plpgsql stable security invoker set search_path = '' as $$
begin
  if value is null or value = '' or lower(value) in ('infinity','-infinity','now','today','tomorrow','yesterday') then return false; end if;
  perform value::timestamptz;
  return true;
exception when others then return false;
end;
$$;

create function cosmifold_private.valid_ordinal(value jsonb) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select case when jsonb_typeof(value) = 'number' then
    (value::text)::numeric = trunc((value::text)::numeric) and
    (value::text)::numeric between 0 and 9007199254740991
    else false end
$$;

create function cosmifold_private.valid_json(value jsonb) returns boolean
language sql immutable security invoker set search_path = '' as $$
  with recursive nodes(value,depth,key) as (
    select value,0,null::text
    union all
    select child.value,parent.depth+1,child.key from nodes parent
    cross join lateral (
      select o.value,o.key from jsonb_each(case when jsonb_typeof(parent.value)='object' then parent.value else '{}'::jsonb end) o
      union all
      select a.value,null::text from jsonb_array_elements(case when jsonb_typeof(parent.value)='array' then parent.value else '[]'::jsonb end) a
    ) child where parent.depth <= 100
  )
  select $1 is not null and count(*) <= 1000000 and not coalesce(bool_or(
    depth>100 or key in ('__proto__','prototype','constructor') or
    case when jsonb_typeof(nodes.value)='number' then abs((nodes.value::text)::numeric)>1.7976931348623157e308 else false end),false)
  from nodes
$$;

-- PostgreSQL has no WHATWG URL parser. This conservative structural HTTP(S)
-- check must also be followed by the Step-2 client validator (see review notes).
create function cosmifold_private.valid_web_url(value text) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare authority text; host text; port text;
begin
  if value is null or cosmifold_private.utf16_length(value)>2048 or value ~ ('['||chr(1)||'-'||chr(31)||chr(127)||']') then return false; end if;
  authority := substring(btrim(value) from '(?i)^https?://([^/?#]*)');
  if authority is null or authority='' or authority ~ '[[:space:]\\]' then return false; end if;
  host := regexp_replace(authority,'^.*@','');
  if host ~ '^\[' then
    if host !~ '^\[[0-9A-Fa-f:.]+\](:[0-9]*)?$' then return false; end if;
    perform substring(host from '^\[([^]]+)\]')::inet;
    port := substring(host from '\]:([0-9]*)$');
  else
    port := substring(host from ':([0-9]*)$');
    host := regexp_replace(host,':[0-9]*$','');
    if host='' or host ~ '[:%<>\[\]|^]' then return false; end if;
    if host ~ '^[0-9.]+$' then perform host::inet; end if;
  end if;
  return port is null or port='' or port::numeric <= 65535;
exception when others then return false;
end;
$$;

create function cosmifold_private.valid_attributes(value jsonb) returns boolean
language plpgsql stable security invoker set search_path = '' as $$
declare content jsonb; link jsonb; bookmark_ids text[] := '{}'; key text;
begin
  if not cosmifold_private.exact_keys(value,array['description','category','appearance','content','location','createdAt','updatedAt']) or
     not cosmifold_private.valid_json(value) then return false; end if;
  if value ? 'description' and (jsonb_typeof(value->'description')<>'string' or cosmifold_private.utf16_length(value->>'description')>1000) then return false; end if;
  if value ? 'category' and jsonb_typeof(value->'category')<>'string' then return false; end if;
  if value ? 'appearance' and jsonb_typeof(value->'appearance')<>'object' then return false; end if;
  foreach key in array array['createdAt','updatedAt'] loop
    if value ? key and (jsonb_typeof(value->key)<>'string' or not cosmifold_private.valid_timestamp(value->>key)) then return false; end if;
  end loop;
  if value ? 'location' then
    if not cosmifold_private.exact_keys(value->'location',array['text'],array['text']) or jsonb_typeof(value#>'{location,text}')<>'string' or
      not cosmifold_private.valid_id(value#>>'{location,text}',1000) or
      value#>>'{location,text}' <> cosmifold_private.js_trim(value#>>'{location,text}') or value#>>'{location,text}' ~ ('['||chr(1)||'-'||chr(31)||chr(127)||']') then return false; end if;
  end if;
  if value ? 'content' then
    content := value->'content';
    if not cosmifold_private.exact_keys(content,array['version','notes','links','attachments'],array['version','notes','links','attachments']) or
      content->'version'<>'1'::jsonb or content->'attachments'<>'[]'::jsonb or jsonb_typeof(content->'links')<>'array' or
      not cosmifold_private.exact_keys(content->'notes',array['format','text'],array['format','text']) or
      content#>'{notes,format}'<>'"plain"'::jsonb or jsonb_typeof(content#>'{notes,text}')<>'string' or
      cosmifold_private.utf16_length(content#>>'{notes,text}')>100000 then return false; end if;
    for link in select * from jsonb_array_elements(content->'links') loop
      if not cosmifold_private.exact_keys(link,array['id','url','title'],array['id','url']) or
        jsonb_typeof(link->'id')<>'string' or not cosmifold_private.valid_id(link->>'id',150) or (link->>'id')=any(bookmark_ids) or
        jsonb_typeof(link->'url')<>'string' or not cosmifold_private.valid_web_url(link->>'url') or
        link ? 'title' and (jsonb_typeof(link->'title')<>'string' or cosmifold_private.utf16_length(link->>'title')>200) then return false; end if;
      bookmark_ids := array_append(bookmark_ids,link->>'id');
    end loop;
  end if;
  return true;
end;
$$;

create function cosmifold_private.valid_archive(value jsonb) returns boolean
language plpgsql stable security invoker set search_path = '' as $$
begin
  if value is null then return true; end if;
  if not cosmifold_private.exact_keys(value,array['ordinal','archivedAt','expandedIds'],array['ordinal','archivedAt']) or
    not cosmifold_private.valid_ordinal(value->'ordinal') or jsonb_typeof(value->'archivedAt')<>'string' or
    not cosmifold_private.valid_timestamp(value->>'archivedAt') then return false; end if;
  if value ? 'expandedIds' then
    if jsonb_typeof(value->'expandedIds')<>'array' then return false; end if;
    if exists(select 1 from jsonb_array_elements(value->'expandedIds') x where jsonb_typeof(x)<>'string') or
      (select count(*)<>count(distinct x) from jsonb_array_elements(value->'expandedIds') x) then return false; end if;
  end if;
  return cosmifold_private.valid_json(value);
end;
$$;

create function cosmifold_private.valid_snapshot_fields(value jsonb) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select case when jsonb_typeof(value)='object' then
    cosmifold_private.exact_keys(value,array['connections','portals','constellations','archivedGalaxies'],array['connections','portals','constellations','archivedGalaxies']) and
    not exists(select 1 from jsonb_each(value) x where jsonb_typeof(x.value)<>'boolean') else false end
$$;

create table cosmifold_private.universes (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete no action,
  revision bigint not null default 0 check (revision >= 0),
  snapshot_fields jsonb not null default '{"connections":true,"portals":true,"constellations":true,"archivedGalaxies":true}',
  constraint universes_snapshot_fields_check check (cosmifold_private.valid_snapshot_fields(snapshot_fields))
);
-- Deliberately NON-UNIQUE: one owner can have multiple Universes.
create index universes_owner_idx on cosmifold_private.universes(owner_id,id);

create table cosmifold_private.entries (
  universe_id uuid not null references cosmifold_private.universes(id) on delete no action,
  id text not null check (cosmifold_private.valid_id(id,100)),
  parent_id text check (parent_id is null or cosmifold_private.valid_id(parent_id,100)),
  parent_id_present boolean not null,
  name text not null check (cosmifold_private.valid_id(name,60)),
  ordinal bigint not null check (ordinal between 0 and 9007199254740991),
  attributes_json jsonb not null default '{}' check (cosmifold_private.valid_attributes(attributes_json)),
  archive_json jsonb check (cosmifold_private.valid_archive(archive_json)),
  primary key (universe_id,id),
  constraint entries_parent_fk foreign key (universe_id,parent_id) references cosmifold_private.entries(universe_id,id) on delete no action deferrable initially deferred,
  constraint entries_order_key unique (universe_id,ordinal) deferrable initially deferred,
  check (parent_id_present or parent_id is null),
  check (parent_id is null or parent_id<>id),
  check (archive_json is null or parent_id is null)
);
create index entries_parent_idx on cosmifold_private.entries(universe_id,parent_id);

create table cosmifold_private.constellations (
  universe_id uuid not null references cosmifold_private.universes(id) on delete no action,
  id text not null check (cosmifold_private.valid_id(id,150)),
  name text not null check (cosmifold_private.valid_id(name,60) and name=cosmifold_private.js_trim(name)),
  created_at text not null check (cosmifold_private.valid_timestamp(created_at)),
  updated_at text check (updated_at is null or cosmifold_private.valid_timestamp(updated_at)),
  ordinal bigint not null check (ordinal between 0 and 9007199254740991),
  primary key (universe_id,id),
  constraint constellations_order_key unique (universe_id,ordinal) deferrable initially deferred
);

create table cosmifold_private.constellation_members (
  universe_id uuid not null,
  constellation_id text not null,
  entry_id text not null,
  ordinal bigint not null check (ordinal between 0 and 9007199254740991),
  primary key (universe_id,constellation_id,entry_id),
  constraint members_collection_fk foreign key (universe_id,constellation_id) references cosmifold_private.constellations(universe_id,id) on delete no action deferrable initially deferred,
  constraint members_entry_fk foreign key (universe_id,entry_id) references cosmifold_private.entries(universe_id,id) on delete no action deferrable initially deferred,
  constraint members_order_key unique (universe_id,constellation_id,ordinal) deferrable initially deferred
);
create index members_entry_idx on cosmifold_private.constellation_members(universe_id,entry_id);

create table cosmifold_private.linked_placements (
  universe_id uuid not null,
  id text not null check (cosmifold_private.valid_id(id,150)),
  target_entry_id text not null,
  parent_entry_id text not null,
  created_at text not null check (cosmifold_private.valid_timestamp(created_at)),
  ordinal bigint not null check (ordinal between 0 and 9007199254740991),
  primary key (universe_id,id),
  constraint placements_target_fk foreign key (universe_id,target_entry_id) references cosmifold_private.entries(universe_id,id) on delete no action deferrable initially deferred,
  constraint placements_parent_fk foreign key (universe_id,parent_entry_id) references cosmifold_private.entries(universe_id,id) on delete no action deferrable initially deferred,
  constraint placements_pair_key unique (universe_id,parent_entry_id,target_entry_id) deferrable initially deferred,
  constraint placements_order_key unique (universe_id,ordinal) deferrable initially deferred
);
create index placements_target_idx on cosmifold_private.linked_placements(universe_id,target_entry_id);

create table cosmifold_private.operation_receipts (
  universe_id uuid not null references cosmifold_private.universes(id) on delete no action,
  operation_id uuid not null,
  request_digest text not null check (request_digest ~ '^[a-f0-9]{64}$'),
  base_revision bigint not null check (base_revision >= 0),
  resulting_revision bigint not null check (resulting_revision >= base_revision),
  acknowledgement jsonb not null check (jsonb_typeof(acknowledgement)='object'),
  primary key (universe_id,operation_id),
  check (resulting_revision::numeric between base_revision::numeric and base_revision::numeric+1),
  check (cosmifold_private.exact_keys(acknowledgement,array['scope','operationId','baseRevision','revision','status','replayed','result'],
    array['scope','operationId','baseRevision','revision','status','replayed','result'])),
  check (cosmifold_private.exact_keys(acknowledgement->'scope',array['ownerUserId','universeId'],array['ownerUserId','universeId'])),
  check (coalesce(acknowledgement->'scope'->>'universeId'=universe_id::text and acknowledgement->>'operationId'=operation_id::text and
    acknowledgement->'baseRevision'=to_jsonb(base_revision::text) and acknowledgement->'revision'=to_jsonb(resulting_revision::text) and
    acknowledgement->'replayed'='false'::jsonb and acknowledgement->'status'=to_jsonb(case when resulting_revision=base_revision then 'unchanged'::text else 'committed'::text end),false))
);

-- Authenticated SQL privileges are necessary for INVOKER RPCs. They do NOT
-- expose these relations through PostgREST. No ownership/id UPDATE privilege.
revoke all on all tables in schema cosmifold_private from public, anon, authenticated;
grant select on cosmifold_private.universes to authenticated;
grant insert (id,owner_id) on cosmifold_private.universes to authenticated;
grant update (revision,snapshot_fields) on cosmifold_private.universes to authenticated;
grant select, insert, delete on cosmifold_private.entries, cosmifold_private.constellations,
  cosmifold_private.constellation_members, cosmifold_private.linked_placements to authenticated;
grant update (parent_id,parent_id_present,name,ordinal,attributes_json,archive_json) on cosmifold_private.entries to authenticated;
grant update (name,created_at,updated_at,ordinal) on cosmifold_private.constellations to authenticated;
grant update (ordinal) on cosmifold_private.constellation_members to authenticated;
grant update (target_entry_id,parent_entry_id,created_at,ordinal) on cosmifold_private.linked_placements to authenticated;
grant select, insert on cosmifold_private.operation_receipts to authenticated;

create function cosmifold_private.owns_universe(target uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from cosmifold_private.universes u where u.id=target and u.owner_id=(select auth.uid()))
$$;

alter table cosmifold_private.universes enable row level security;
alter table cosmifold_private.universes force row level security;
create policy universe_owner on cosmifold_private.universes to authenticated
  using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));
-- No DELETE grant on universes; no UPDATE grant on owner_id/id.
do $$
declare relation text;
begin
  foreach relation in array array['entries','constellations','constellation_members','linked_placements','operation_receipts'] loop
    execute format('alter table cosmifold_private.%I enable row level security',relation);
    execute format('alter table cosmifold_private.%I force row level security',relation);
    execute format('create policy row_owner on cosmifold_private.%I to authenticated using (cosmifold_private.owns_universe(universe_id)) with check (cosmifold_private.owns_universe(universe_id))',relation);
  end loop;
end;
$$;
-- Receipts are immutable through ordinary grants; their claimed owner must also
-- match the verified caller. This adds a restrictive INSERT check to owner RLS.
create policy receipt_identity on cosmifold_private.operation_receipts as restrictive for insert to authenticated
  with check (acknowledgement#>>'{scope,ownerUserId}'=(select auth.uid())::text);

create function cosmifold_private.checked_scope(value jsonb) returns uuid
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception using errcode='28000',message='UNAUTHENTICATED'; end if;
  if not cosmifold_private.exact_keys(value,array['ownerUserId','universeId'],array['ownerUserId','universeId']) or
    jsonb_typeof(value->'ownerUserId')<>'string' or jsonb_typeof(value->'universeId')<>'string' or
    value->>'ownerUserId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or
    value->>'universeId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode='22023',message='INVALID_COMMAND';
  end if;
  if (value->>'ownerUserId')::uuid <> auth.uid() then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  return (value->>'universeId')::uuid;
end;
$$;

create function cosmifold_private.project_universe(target uuid) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select jsonb_build_object('format','cosmifold-cloud-metadata','projectionVersion',1,'storageVersion',5,
    'universe',jsonb_build_object('id',u.id,'owner_id',u.owner_id,'revision',u.revision::text),'snapshot_fields',u.snapshot_fields,
    'entries',coalesce((select jsonb_agg(jsonb_build_object('universe_id',e.universe_id,'id',e.id,'parent_id',e.parent_id,
      'parent_id_present',e.parent_id_present,'name',e.name,'ordinal',e.ordinal,'attributes_json',e.attributes_json) ||
      case when e.archive_json is null then '{}'::jsonb else jsonb_build_object('archive_json',e.archive_json) end order by e.ordinal)
      from cosmifold_private.entries e where e.universe_id=u.id),'[]'::jsonb),
    'constellations',coalesce((select jsonb_agg(jsonb_build_object('universe_id',c.universe_id,'id',c.id,'name',c.name,
      'created_at',c.created_at,'ordinal',c.ordinal) || case when c.updated_at is null then '{}'::jsonb else jsonb_build_object('updated_at',c.updated_at) end order by c.ordinal)
      from cosmifold_private.constellations c where c.universe_id=u.id),'[]'::jsonb),
    'constellation_members',coalesce((select jsonb_agg(jsonb_build_object('universe_id',m.universe_id,'constellation_id',m.constellation_id,
      'entry_id',m.entry_id,'ordinal',m.ordinal) order by c.ordinal,m.ordinal)
      from cosmifold_private.constellation_members m join cosmifold_private.constellations c on (c.universe_id,c.id)=(m.universe_id,m.constellation_id)
      where m.universe_id=u.id),'[]'::jsonb),
    'linked_placements',coalesce((select jsonb_agg(jsonb_build_object('universe_id',p.universe_id,'id',p.id,
      'target_entry_id',p.target_entry_id,'parent_entry_id',p.parent_entry_id,'created_at',p.created_at,'ordinal',p.ordinal) order by p.ordinal)
      from cosmifold_private.linked_placements p where p.universe_id=u.id),'[]'::jsonb))
  from cosmifold_private.universes u where u.id=target
$$;

-- Read locks conflict with every writer's FOR UPDATE Universe lock. Under
-- READ COMMITTED, subsequent VOLATILE helper reads see the state after lock wait.
create function public.cosmifold_read_universe(p_scope jsonb) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare target uuid := cosmifold_private.checked_scope(p_scope);
begin
  perform 1 from cosmifold_private.universes where id=target for share;
  if not found then return jsonb_build_object('status','absent','metadata',null); end if;
  return jsonb_build_object('status','found','metadata',cosmifold_private.project_universe(target));
end;
$$;

create function public.cosmifold_list_universes() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception using errcode='28000',message='UNAUTHENTICATED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'owner_id',owner_id,'revision',revision::text) order by id)
    from cosmifold_private.universes where owner_id=auth.uid()),'[]'::jsonb);
end;
$$;

create function public.cosmifold_create_universe(p_universe_id uuid) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception using errcode='28000',message='UNAUTHENTICATED'; end if;
  if p_universe_id is null then raise exception using errcode='22023',message='INVALID_COMMAND'; end if;
  insert into cosmifold_private.universes(id,owner_id) values(p_universe_id,auth.uid()) on conflict(id) do nothing;
  perform 1 from cosmifold_private.universes where id=p_universe_id for share;
  if not found then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  return cosmifold_private.project_universe(p_universe_id);
end;
$$;

create function public.cosmifold_operation_receipt(p_scope jsonb,p_operation_id uuid) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare target uuid := cosmifold_private.checked_scope(p_scope); receipt jsonb;
begin
  if p_operation_id is null then raise exception using errcode='22023',message='INVALID_COMMAND'; end if;
  -- FOR SHARE waits for an in-flight writer: a "missing" receipt cannot race
  -- that writer's uncommitted success. Retrying the same operation remains safe.
  perform 1 from cosmifold_private.universes where id=target for share;
  if not found then return jsonb_build_object('status','absent','acknowledgement',null); end if;
  select acknowledgement into receipt from cosmifold_private.operation_receipts where universe_id=target and operation_id=p_operation_id;
  if not found then return jsonb_build_object('status','missing','acknowledgement',null); end if;
  return jsonb_build_object('status','found','request_digest',
    (select request_digest from cosmifold_private.operation_receipts where universe_id=target and operation_id=p_operation_id),
    'acknowledgement',receipt || '{"replayed":true}'::jsonb);
end;
$$;

-- Final graph checks operate on the WHOLE affected Universe, including archives.
-- They supplement the deferred composite FKs; they never repair/drop rows.
create function cosmifold_private.assert_integrity(target uuid) returns void
language plpgsql volatile security invoker set search_path = '' as $$
declare flags jsonb; root_count bigint; total bigint;
begin
  select snapshot_fields into flags from cosmifold_private.universes where id=target;
  if not found then raise exception using errcode='CM007',message='UNIVERSE_ABSENT'; end if;
  if exists(select 1 from cosmifold_private.entries where universe_id=target having count(*)>0 and (min(ordinal)<>0 or max(ordinal)<>count(*)-1)) or
     exists(select 1 from cosmifold_private.constellations where universe_id=target having count(*)>0 and (min(ordinal)<>0 or max(ordinal)<>count(*)-1)) or
     exists(select 1 from cosmifold_private.linked_placements where universe_id=target having count(*)>0 and (min(ordinal)<>0 or max(ordinal)<>count(*)-1)) or
     exists(select 1 from cosmifold_private.constellation_members where universe_id=target group by constellation_id having min(ordinal)<>0 or max(ordinal)<>count(*)-1) then
    raise exception using errcode='CM005',message='INVALID_METADATA';
  end if;
  if exists(select id from (
    select id from cosmifold_private.entries where universe_id=target union all
    select id from cosmifold_private.constellations where universe_id=target union all
    select id from cosmifold_private.linked_placements where universe_id=target
  ) ids group by id having count(*)>1) then raise exception using errcode='CM005',message='INVALID_METADATA'; end if;
  with recursive tree(id) as (
    select id from cosmifold_private.entries where universe_id=target and parent_id is null
    union
    select e.id from cosmifold_private.entries e join tree t on e.parent_id=t.id where e.universe_id=target
  ) select count(*) into root_count from tree;
  select count(*) into total from cosmifold_private.entries where universe_id=target;
  if root_count<>total then raise exception using errcode='CM005',message='INVALID_METADATA'; end if;
  if exists(select 1 from cosmifold_private.entries where universe_id=target and archive_json is not null
    having count(*)>0 and (min(((archive_json->>'ordinal')::numeric)::bigint)<>0 or max(((archive_json->>'ordinal')::numeric)::bigint)<>count(*)-1 or
      count(distinct ((archive_json->>'ordinal')::numeric)::bigint)<>count(*))) then raise exception using errcode='CM005',message='INVALID_METADATA'; end if;
  if exists(
    with recursive tree(id,root_id) as (
      select id,id from cosmifold_private.entries where universe_id=target and parent_id is null
      union all
      select e.id,t.root_id from cosmifold_private.entries e join tree t on e.parent_id=t.id where e.universe_id=target
    )
    select 1 from cosmifold_private.entries e
    cross join lateral jsonb_array_elements_text(coalesce(e.archive_json->'expandedIds','[]'::jsonb)) expanded(id)
    left join tree t on t.id=expanded.id
    where e.universe_id=target and e.archive_json is not null and t.root_id is distinct from e.id
  ) then raise exception using errcode='CM005',message='INVALID_METADATA'; end if;
  if (not (flags->>'portals')::boolean and exists(select 1 from cosmifold_private.linked_placements where universe_id=target)) or
     (not (flags->>'constellations')::boolean and exists(select 1 from cosmifold_private.constellations where universe_id=target)) or
     (not (flags->>'archivedGalaxies')::boolean and exists(select 1 from cosmifold_private.entries where universe_id=target and archive_json is not null)) then
    raise exception using errcode='CM005',message='INVALID_METADATA';
  end if;
  -- Step-2's JSON depth/node/number guard also applies to the aggregate result.
  if not cosmifold_private.valid_json(cosmifold_private.project_universe(target)) then raise exception using errcode='CM005',message='INVALID_METADATA'; end if;
end;
$$;

create function cosmifold_private.valid_scoped_row(value jsonb,target uuid,relation text) returns boolean
language plpgsql stable security invoker set search_path = '' as $$
declare allowed text[]; required text[];
begin
  case relation
    when 'entries' then
      allowed:=array['universe_id','id','parent_id','parent_id_present','name','ordinal','attributes_json','archive_json'];
      required:=array['universe_id','id','parent_id','parent_id_present','name','ordinal','attributes_json'];
    when 'constellations' then
      allowed:=array['universe_id','id','name','created_at','updated_at','ordinal'];
      required:=array['universe_id','id','name','created_at','ordinal'];
    when 'constellation_members' then
      allowed:=array['universe_id','constellation_id','entry_id','ordinal']; required:=allowed;
    when 'linked_placements' then
      allowed:=array['universe_id','id','target_entry_id','parent_entry_id','created_at','ordinal']; required:=allowed;
    else return false;
  end case;
  if not cosmifold_private.exact_keys(value,allowed,required) or jsonb_typeof(value->'universe_id')<>'string' or
    value->>'universe_id'<>target::text or not cosmifold_private.valid_ordinal(value->'ordinal') then return false; end if;
  if relation='entries' then
    return jsonb_typeof(value->'id')='string' and jsonb_typeof(value->'name')='string' and
      jsonb_typeof(value->'parent_id_present')='boolean' and
      (value->'parent_id'='null'::jsonb or jsonb_typeof(value->'parent_id')='string') and
      (not value ? 'archive_json' or jsonb_typeof(value->'archive_json')='object');
  elsif relation='constellations' then
    return jsonb_typeof(value->'id')='string' and jsonb_typeof(value->'name')='string' and jsonb_typeof(value->'created_at')='string' and
      (not value ? 'updated_at' or jsonb_typeof(value->'updated_at')='string');
  elsif relation='constellation_members' then
    return jsonb_typeof(value->'constellation_id')='string' and jsonb_typeof(value->'entry_id')='string';
  end if;
  return jsonb_typeof(value->'id')='string' and jsonb_typeof(value->'target_entry_id')='string' and
    jsonb_typeof(value->'parent_entry_id')='string' and jsonb_typeof(value->'created_at')='string';
end;
$$;

-- Payload is a bounded explicit row-change set, NOT another metadata format:
-- {upsert:{entries:[Step-2 rows],constellations:[],constellation_members:[],linked_placements:[]},
--  delete:{entries:[text IDs],constellations:[],constellation_members:[{constellation_id,entry_id}],linked_placements:[]},
--  snapshot_fields?:<Step-2 flags>}. All change-set sections are optional.
create function public.cosmifold_commit_metadata(p_command jsonb) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare target uuid; operation uuid; base bigint; current_revision bigint; digest text; previous cosmifold_private.operation_receipts%rowtype;
  payload jsonb; additions jsonb; removals jsonb; relation text; row_data jsonb; removed jsonb;
  row_key text; touched text[]; affected bigint; changes bigint:=0; result jsonb; flags jsonb;
begin
  if not cosmifold_private.exact_keys(p_command,array['scope','operationId','baseRevision','type','payload'],array['scope','operationId','baseRevision','type','payload']) or
    not cosmifold_private.valid_json(p_command) then raise exception using errcode='22023',message='INVALID_COMMAND'; end if;
  target:=cosmifold_private.checked_scope(p_command->'scope');
  if jsonb_typeof(p_command->'operationId')<>'string' or
    p_command->>'operationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or jsonb_typeof(p_command->'baseRevision')<>'string' or
    p_command->>'baseRevision' !~ '^(0|[1-9][0-9]{0,18})$' or
    (p_command->>'baseRevision')::numeric>9223372036854775807 or jsonb_typeof(p_command->'type')<>'string' or
    not (p_command->>'type')=any(array['items.changed','items.created','items.renamed','items.moved','items.copied','items.structure-duplicated',
      'items.deleted','content.changed','location.changed','constellations.changed','placements.changed','galaxy.archived','galaxy.restored']) then
    raise exception using errcode='22023',message='INVALID_COMMAND';
  end if;
  operation:=(p_command->>'operationId')::uuid; base:=(p_command->>'baseRevision')::bigint;
  -- Computed on the server: JSONB canonicalizes object key order/whitespace.
  digest:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
  select revision into current_revision from cosmifold_private.universes where id=target for update;
  if not found then raise exception using errcode='CM007',message='UNIVERSE_ABSENT'; end if;
  select * into previous from cosmifold_private.operation_receipts where universe_id=target and operation_id=operation;
  if found then
    if previous.request_digest<>digest then raise exception using errcode='CM004',message='OPERATION_ID_REUSED'; end if;
    return previous.acknowledgement || '{"replayed":true}'::jsonb;
  end if;
  if current_revision<>base then raise exception using errcode='CM003',message='REVISION_CONFLICT'; end if;
  payload:=p_command->'payload';
  if not cosmifold_private.exact_keys(payload,array['upsert','delete','snapshot_fields']) then raise exception using errcode='22023',message='INVALID_COMMAND'; end if;
  additions:=coalesce(payload->'upsert','{}'::jsonb); removals:=coalesce(payload->'delete','{}'::jsonb);
  if not cosmifold_private.exact_keys(additions,array['entries','constellations','constellation_members','linked_placements']) or
    not cosmifold_private.exact_keys(removals,array['entries','constellations','constellation_members','linked_placements']) then
    raise exception using errcode='22023',message='INVALID_COMMAND';
  end if;
  -- Validate shape and single-touch row identities before changing any table.
  foreach relation in array array['entries','constellations','constellation_members','linked_placements'] loop
    if (additions ? relation and jsonb_typeof(additions->relation)<>'array') or
       (removals ? relation and jsonb_typeof(removals->relation)<>'array') then raise exception using errcode='CM005',message='INVALID_METADATA'; end if;
    touched:='{}';
    for row_data in select * from jsonb_array_elements(coalesce(additions->relation,'[]'::jsonb)) loop
      if not cosmifold_private.valid_scoped_row(row_data,target,relation) then raise exception using errcode='CM005',message='INVALID_METADATA'; end if;
      if relation='entries' and jsonb_typeof(row_data#>'{attributes_json,content,attachments}')='array' and
        jsonb_array_length(row_data#>'{attributes_json,content,attachments}')>0 then raise exception using errcode='CM006',message='UNSUPPORTED_ATTACHMENTS'; end if;
      row_key:=case when relation='constellation_members' then jsonb_build_array(row_data->>'constellation_id',row_data->>'entry_id')::text else row_data->>'id' end;
      if row_key=any(touched) then raise exception using errcode='CM005',message='INVALID_METADATA'; end if;
      touched:=array_append(touched,row_key);
    end loop;
    for removed in select * from jsonb_array_elements(coalesce(removals->relation,'[]'::jsonb)) loop
      if relation='constellation_members' then
        if not cosmifold_private.exact_keys(removed,array['constellation_id','entry_id'],array['constellation_id','entry_id']) or
          jsonb_typeof(removed->'constellation_id')<>'string' or jsonb_typeof(removed->'entry_id')<>'string' then raise exception using errcode='CM005',message='INVALID_METADATA'; end if;
        row_key:=jsonb_build_array(removed->>'constellation_id',removed->>'entry_id')::text;
      else
        if jsonb_typeof(removed)<>'string' then raise exception using errcode='CM005',message='INVALID_METADATA'; end if;
        row_key:=removed#>>'{}';
      end if;
      if row_key=any(touched) then raise exception using errcode='CM005',message='INVALID_METADATA'; end if;
      touched:=array_append(touched,row_key);
    end loop;
  end loop;
  -- Explicit child/reference removal: no hidden cascades, no silent repair.
  delete from cosmifold_private.constellation_members where universe_id=target and exists(
    select 1 from jsonb_array_elements(coalesce(removals->'constellation_members','[]'::jsonb)) x where (constellation_id,entry_id)=(x->>'constellation_id',x->>'entry_id'));
  get diagnostics affected=row_count; changes:=changes+affected;
  delete from cosmifold_private.linked_placements where universe_id=target and id in (select jsonb_array_elements_text(coalesce(removals->'linked_placements','[]'::jsonb)));
  get diagnostics affected=row_count; changes:=changes+affected;
  delete from cosmifold_private.constellations where universe_id=target and id in (select jsonb_array_elements_text(coalesce(removals->'constellations','[]'::jsonb)));
  get diagnostics affected=row_count; changes:=changes+affected;
  delete from cosmifold_private.entries where universe_id=target and id in (select jsonb_array_elements_text(coalesce(removals->'entries','[]'::jsonb)));
  get diagnostics affected=row_count; changes:=changes+affected;
  for row_data in select * from jsonb_array_elements(coalesce(additions->'entries','[]'::jsonb)) loop
    insert into cosmifold_private.entries as existing(universe_id,id,parent_id,parent_id_present,name,ordinal,attributes_json,archive_json)
      values(target,row_data->>'id',row_data->>'parent_id',(row_data->>'parent_id_present')::boolean,row_data->>'name',((row_data->>'ordinal')::numeric)::bigint,row_data->'attributes_json',row_data->'archive_json')
    on conflict(universe_id,id) do update set parent_id=excluded.parent_id,parent_id_present=excluded.parent_id_present,name=excluded.name,
      ordinal=excluded.ordinal,attributes_json=excluded.attributes_json,archive_json=excluded.archive_json
    where (existing.parent_id,existing.parent_id_present,existing.name,existing.ordinal,existing.attributes_json,existing.archive_json)
      is distinct from (excluded.parent_id,excluded.parent_id_present,excluded.name,excluded.ordinal,excluded.attributes_json,excluded.archive_json);
    get diagnostics affected=row_count; changes:=changes+affected;
  end loop;
  for row_data in select * from jsonb_array_elements(coalesce(additions->'constellations','[]'::jsonb)) loop
    insert into cosmifold_private.constellations as existing(universe_id,id,name,created_at,updated_at,ordinal)
      values(target,row_data->>'id',row_data->>'name',row_data->>'created_at',row_data->>'updated_at',((row_data->>'ordinal')::numeric)::bigint)
    on conflict(universe_id,id) do update set name=excluded.name,created_at=excluded.created_at,updated_at=excluded.updated_at,ordinal=excluded.ordinal
    where (existing.name,existing.created_at,existing.updated_at,existing.ordinal) is distinct from (excluded.name,excluded.created_at,excluded.updated_at,excluded.ordinal);
    get diagnostics affected=row_count; changes:=changes+affected;
  end loop;
  for row_data in select * from jsonb_array_elements(coalesce(additions->'constellation_members','[]'::jsonb)) loop
    insert into cosmifold_private.constellation_members as existing(universe_id,constellation_id,entry_id,ordinal)
      values(target,row_data->>'constellation_id',row_data->>'entry_id',((row_data->>'ordinal')::numeric)::bigint)
    on conflict(universe_id,constellation_id,entry_id) do update set ordinal=excluded.ordinal where existing.ordinal is distinct from excluded.ordinal;
    get diagnostics affected=row_count; changes:=changes+affected;
  end loop;
  for row_data in select * from jsonb_array_elements(coalesce(additions->'linked_placements','[]'::jsonb)) loop
    insert into cosmifold_private.linked_placements as existing(universe_id,id,target_entry_id,parent_entry_id,created_at,ordinal)
      values(target,row_data->>'id',row_data->>'target_entry_id',row_data->>'parent_entry_id',row_data->>'created_at',((row_data->>'ordinal')::numeric)::bigint)
    on conflict(universe_id,id) do update set target_entry_id=excluded.target_entry_id,parent_entry_id=excluded.parent_entry_id,created_at=excluded.created_at,ordinal=excluded.ordinal
    where (existing.target_entry_id,existing.parent_entry_id,existing.created_at,existing.ordinal) is distinct from (excluded.target_entry_id,excluded.parent_entry_id,excluded.created_at,excluded.ordinal);
    get diagnostics affected=row_count; changes:=changes+affected;
  end loop;
  if payload ? 'snapshot_fields' then
    flags:=payload->'snapshot_fields';
    if not cosmifold_private.valid_snapshot_fields(flags) then raise exception using errcode='CM005',message='INVALID_METADATA'; end if;
    update cosmifold_private.universes set snapshot_fields=flags where id=target and snapshot_fields is distinct from flags;
    get diagnostics affected=row_count; changes:=changes+affected;
  end if;
  perform cosmifold_private.assert_integrity(target);
  -- Only our deferred constraints: don't alter unrelated application constraints.
  set constraints cosmifold_private.entries_parent_fk, cosmifold_private.entries_order_key,
    cosmifold_private.constellations_order_key, cosmifold_private.members_collection_fk, cosmifold_private.members_entry_fk,
    cosmifold_private.members_order_key, cosmifold_private.placements_target_fk, cosmifold_private.placements_parent_fk,
    cosmifold_private.placements_pair_key, cosmifold_private.placements_order_key immediate;
  set constraints cosmifold_private.entries_parent_fk, cosmifold_private.entries_order_key,
    cosmifold_private.constellations_order_key, cosmifold_private.members_collection_fk, cosmifold_private.members_entry_fk,
    cosmifold_private.members_order_key, cosmifold_private.placements_target_fk, cosmifold_private.placements_parent_fk,
    cosmifold_private.placements_pair_key, cosmifold_private.placements_order_key deferred;
  if changes>0 then
    if current_revision=9223372036854775807 then raise exception using errcode='22003',message='REVISION_EXHAUSTED'; end if;
    update cosmifold_private.universes set revision=revision+1 where id=target returning revision into current_revision;
  end if;
  result:=jsonb_build_object('scope',jsonb_build_object('ownerUserId',auth.uid(),'universeId',target),'operationId',operation,
    'baseRevision',base::text,'revision',current_revision::text,'status',case when changes>0 then 'committed' else 'unchanged' end,'replayed',false,'result',null);
  insert into cosmifold_private.operation_receipts(universe_id,operation_id,request_digest,base_revision,resulting_revision,acknowledgement)
    values(target,operation,digest,base,current_revision,result);
  return result;
exception
  -- Sanitize relational/cast errors; the function's subtransaction rolls back
  -- every changed row, revision and receipt before this exception is returned.
  when check_violation or foreign_key_violation or unique_violation or not_null_violation then
    raise exception using errcode='CM005',message='INVALID_METADATA';
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode='22023',message='INVALID_COMMAND';
end;
$$;

-- Supabase's default public-function privileges must not make RPCs anonymous.
revoke all on all functions in schema cosmifold_private from public, anon, authenticated;
grant execute on all functions in schema cosmifold_private to authenticated;
revoke all on function public.cosmifold_read_universe(jsonb), public.cosmifold_list_universes(),
  public.cosmifold_create_universe(uuid), public.cosmifold_operation_receipt(jsonb,uuid), public.cosmifold_commit_metadata(jsonb)
  from public, anon, authenticated;
grant execute on function public.cosmifold_read_universe(jsonb), public.cosmifold_list_universes(),
  public.cosmifold_create_universe(uuid), public.cosmifold_operation_receipt(jsonb,uuid), public.cosmifold_commit_metadata(jsonb)
  to authenticated;

$cm_migration_body$;
    stage := 'authored database/security suite';
    -- Exact suite body; psql fixture parameters become literal JSON. Its outer
    -- BEGIN/ROLLBACK is removed, not its assertions or privilege switches.
    execute $cm_database_suite$
create temporary table cosmifold_test_fixture(command jsonb,expected jsonb);
insert into cosmifold_test_fixture values($cm_command${"scope":{"ownerUserId":"00000000-0000-4000-8000-000000000001","universeId":"00000000-0000-4000-8000-000000000011"},"operationId":"00000000-0000-4000-8000-000000000101","baseRevision":"0","type":"items.created","payload":{"upsert":{"entries":[{"universe_id":"00000000-0000-4000-8000-000000000011","id":"galaxy","parent_id":null,"parent_id_present":true,"name":"Japan","ordinal":0,"attributes_json":{"appearance":{"seed":7}}},{"universe_id":"00000000-0000-4000-8000-000000000011","id":"tokyo","parent_id":"galaxy","parent_id_present":true,"name":"Tokyo","ordinal":1,"attributes_json":{"description":"Travel","category":"Places","content":{"version":1,"notes":{"format":"plain","text":"Saved trip note"},"links":[{"id":"bookmark","url":"https://example.com","title":""}],"attachments":[]},"location":{"text":"Tokyo Station"},"createdAt":"2026-10-12T00:00:00.000Z","updatedAt":"2026-10-12T00:00:00.000Z"}},{"universe_id":"00000000-0000-4000-8000-000000000011","id":"archived-root","parent_id":null,"parent_id_present":true,"name":"Old trip","ordinal":2,"attributes_json":{"appearance":{"seed":0}},"archive_json":{"ordinal":0,"archivedAt":"2026-10-12T00:00:00.000Z","expandedIds":["archived-root","archived-note"]}},{"universe_id":"00000000-0000-4000-8000-000000000011","id":"archived-note","parent_id":"archived-root","parent_id_present":true,"name":"Old notes","ordinal":3,"attributes_json":{"content":{"version":1,"notes":{"format":"plain","text":"Archived note"},"links":[],"attachments":[]}}}],"constellations":[{"universe_id":"00000000-0000-4000-8000-000000000011","id":"favorites","name":"Favorites","ordinal":0,"created_at":"2026-10-12T00:00:00.000Z","updated_at":"2026-10-12T00:00:00.000Z"}],"constellation_members":[{"universe_id":"00000000-0000-4000-8000-000000000011","constellation_id":"favorites","entry_id":"tokyo","ordinal":0},{"universe_id":"00000000-0000-4000-8000-000000000011","constellation_id":"favorites","entry_id":"archived-note","ordinal":1}],"linked_placements":[{"universe_id":"00000000-0000-4000-8000-000000000011","id":"portal:link","ordinal":0,"target_entry_id":"tokyo","parent_entry_id":"archived-root","created_at":"2026-10-12T00:00:00.000Z"}]},"snapshot_fields":{"connections":true,"portals":true,"constellations":true,"archivedGalaxies":true}}}$cm_command$::jsonb,$cm_expected${"format":"cosmifold-cloud-metadata","projectionVersion":1,"storageVersion":5,"universe":{"id":"00000000-0000-4000-8000-000000000011","owner_id":"00000000-0000-4000-8000-000000000001","revision":"1"},"snapshot_fields":{"connections":true,"portals":true,"constellations":true,"archivedGalaxies":true},"entries":[{"universe_id":"00000000-0000-4000-8000-000000000011","id":"galaxy","parent_id":null,"parent_id_present":true,"name":"Japan","ordinal":0,"attributes_json":{"appearance":{"seed":7}}},{"universe_id":"00000000-0000-4000-8000-000000000011","id":"tokyo","parent_id":"galaxy","parent_id_present":true,"name":"Tokyo","ordinal":1,"attributes_json":{"description":"Travel","category":"Places","content":{"version":1,"notes":{"format":"plain","text":"Saved trip note"},"links":[{"id":"bookmark","url":"https://example.com","title":""}],"attachments":[]},"location":{"text":"Tokyo Station"},"createdAt":"2026-10-12T00:00:00.000Z","updatedAt":"2026-10-12T00:00:00.000Z"}},{"universe_id":"00000000-0000-4000-8000-000000000011","id":"archived-root","parent_id":null,"parent_id_present":true,"name":"Old trip","ordinal":2,"attributes_json":{"appearance":{"seed":0}},"archive_json":{"ordinal":0,"archivedAt":"2026-10-12T00:00:00.000Z","expandedIds":["archived-root","archived-note"]}},{"universe_id":"00000000-0000-4000-8000-000000000011","id":"archived-note","parent_id":"archived-root","parent_id_present":true,"name":"Old notes","ordinal":3,"attributes_json":{"content":{"version":1,"notes":{"format":"plain","text":"Archived note"},"links":[],"attachments":[]}}}],"constellations":[{"universe_id":"00000000-0000-4000-8000-000000000011","id":"favorites","name":"Favorites","ordinal":0,"created_at":"2026-10-12T00:00:00.000Z","updated_at":"2026-10-12T00:00:00.000Z"}],"constellation_members":[{"universe_id":"00000000-0000-4000-8000-000000000011","constellation_id":"favorites","entry_id":"tokyo","ordinal":0},{"universe_id":"00000000-0000-4000-8000-000000000011","constellation_id":"favorites","entry_id":"archived-note","ordinal":1}],"linked_placements":[{"universe_id":"00000000-0000-4000-8000-000000000011","id":"portal:link","ordinal":0,"target_entry_id":"tokyo","parent_entry_id":"archived-root","created_at":"2026-10-12T00:00:00.000Z"}]}$cm_expected$::jsonb);
insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000001','owner-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000002','owner-b@example.invalid');

do $$
declare cmd jsonb; expected jsonb; response jsonb; before_data jsonb; before_receipts bigint; row_data jsonb;
  a uuid:='00000000-0000-4000-8000-000000000001'; b uuid:='00000000-0000-4000-8000-000000000002';
  ua uuid:='00000000-0000-4000-8000-000000000011'; ua2 uuid:='00000000-0000-4000-8000-000000000012'; ub uuid:='00000000-0000-4000-8000-000000000013';
  sa jsonb; sb jsonb; sa2 jsonb; modified jsonb; empty_command jsonb; ack jsonb;
begin
  select command,cosmifold_test_fixture.expected into cmd,expected from cosmifold_test_fixture;
  sa:=jsonb_build_object('ownerUserId',a,'universeId',ua); sa2:=jsonb_build_object('ownerUserId',a,'universeId',ua2); sb:=jsonb_build_object('ownerUserId',b,'universeId',ub);
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if current_user<>'authenticated' then raise exception 'tests must exercise the non-owner authenticated role'; end if;
  perform public.cosmifold_create_universe(ua); perform public.cosmifold_create_universe(ua2);
  if jsonb_array_length(public.cosmifold_list_universes())<>2 then raise exception 'multiple Universes per owner failed'; end if;
  response:=public.cosmifold_read_universe(sa2);
  if response->>'status'<>'found' or response#>'{metadata,entries}'<>'[]'::jsonb then raise exception 'empty Universe is not a found result'; end if;
  response:=public.cosmifold_read_universe(jsonb_build_object('ownerUserId',a,'universeId','00000000-0000-4000-8000-000000000099'));
  if response->>'status'<>'absent' then raise exception 'genuine absence not distinguished'; end if;
  ack:=public.cosmifold_commit_metadata(cmd);
  if ack->>'revision'<>'1' or ack->>'status'<>'committed' then raise exception 'valid revision did not increment once'; end if;
  -- The RPC has returned inside THIS transaction, not committed a second one.
  response:=public.cosmifold_operation_receipt(sa,(cmd->>'operationId')::uuid);
  if response->>'status' is distinct from 'found' or
    response->'acknowledgement' is distinct from (ack || '{"replayed":true}'::jsonb) or
    (select count(*) from cosmifold_private.operation_receipts where universe_id=ua and operation_id=(cmd->>'operationId')::uuid)<>1 then
    raise exception 'new operation returned without its exact receipt';
  end if;
  response:=public.cosmifold_read_universe(sa);
  if response->'metadata' is distinct from expected then raise exception 'SQL projection differs from Step-2 fixture'; end if;
  response:=public.cosmifold_commit_metadata(cmd);
  if response->>'revision'<>'1' or response->'replayed'<>'true'::jsonb then raise exception 'identical retry failed'; end if;
  if (public.cosmifold_read_universe(sa)#>>'{metadata,universe,revision}')<>'1' then raise exception 'retry advanced revision'; end if;
  modified:=jsonb_set(cmd,'{type}','"items.changed"');
  begin
    perform public.cosmifold_commit_metadata(modified); raise exception 'changed digest was accepted';
  exception when sqlstate 'CM004' then null; end;
  response:=public.cosmifold_operation_receipt(sa,(cmd->>'operationId')::uuid);
  if response->>'status'<>'found' or response#>'{acknowledgement,replayed}'<>'true'::jsonb then raise exception 'receipt reconciliation failed'; end if;
  if public.cosmifold_operation_receipt(sa,'00000000-0000-4000-8000-000000000999')->>'status'<>'missing' then raise exception 'missing receipt not explicit'; end if;
  row_data:=jsonb_set(cmd#>'{payload,upsert,entries,0}','{name}','"Renamed Galaxy"');
  modified:=jsonb_build_object('scope',sa,'operationId','00000000-0000-4000-8000-000000000102','baseRevision','1','type','items.renamed',
    'payload',jsonb_build_object('upsert',jsonb_build_object('entries',jsonb_build_array(row_data))));
  response:=public.cosmifold_commit_metadata(modified);
  if response->>'revision'<>'2' then raise exception 'second mutation failed'; end if;
  response:=public.cosmifold_commit_metadata(cmd);
  if response->>'revision'<>'1' or response->'replayed'<>'true'::jsonb or public.cosmifold_read_universe(sa)#>>'{metadata,universe,revision}'<>'2' then
    raise exception 'old receipt retry was not checked before stale revision'; end if;
  before_data:=public.cosmifold_read_universe(sa); select count(*) into before_receipts from cosmifold_private.operation_receipts where universe_id=ua;
  begin
    perform public.cosmifold_commit_metadata(jsonb_set(cmd,'{operationId}','"00000000-0000-4000-8000-000000000103"')); raise exception 'stale write succeeded';
  exception when sqlstate 'CM003' then null; end;
  if public.cosmifold_read_universe(sa) is distinct from before_data or
    (select count(*) from cosmifold_private.operation_receipts where universe_id=ua)<>before_receipts then raise exception 'stale write changed data/receipts'; end if;
  -- A caller rollback AFTER successful RPC return must undo metadata, revision
  -- and receipt together. Uses only the real RPC and an enclosing subtransaction;
  -- no trigger, split write, receipt fabrication or change to deployed SQL.
  modified:=jsonb_build_object('scope',sa,'operationId','00000000-0000-4000-8000-000000000109','baseRevision','2','type','items.renamed',
    'payload',jsonb_build_object('upsert',jsonb_build_object('entries',jsonb_build_array(jsonb_set(row_data,'{name}','"Outer rollback"')))));
  begin
    ack:=public.cosmifold_commit_metadata(modified);
    response:=public.cosmifold_operation_receipt(sa,(modified->>'operationId')::uuid);
    if ack->>'revision' is distinct from '3' or
      public.cosmifold_read_universe(sa)#>>'{metadata,universe,revision}' is distinct from '3' or
      response->>'status' is distinct from 'found' or
      response->'acknowledgement' is distinct from (ack || '{"replayed":true}'::jsonb) then
      raise exception 'RPC return must not independently commit: expected provisional metadata/revision/receipt';
    end if;
    raise exception using errcode='CT001',message='ROLLBACK_SUCCESSFUL_RPC';
  exception when sqlstate 'CT001' then null; end;
  if public.cosmifold_read_universe(sa) is distinct from before_data or
    (select count(*) from cosmifold_private.operation_receipts where universe_id=ua)<>before_receipts or
    public.cosmifold_operation_receipt(sa,(modified->>'operationId')::uuid)->>'status' is distinct from 'missing' then
    raise exception 'outer rollback separated metadata/revision/receipt';
  end if;
  -- First row update succeeds; missing-parent second row fails FINAL validation.
  modified:=jsonb_build_object('scope',sa,'operationId','00000000-0000-4000-8000-000000000104','baseRevision','2','type','items.changed',
    'payload',jsonb_build_object('upsert',jsonb_build_object('entries',jsonb_build_array(jsonb_set(row_data,'{name}','"Must roll back"'),
      jsonb_build_object('universe_id',ua,'id','bad-child','parent_id','missing','parent_id_present',true,'name','Bad','ordinal',4,'attributes_json','{}'::jsonb)))));
  begin perform public.cosmifold_commit_metadata(modified); raise exception 'compound invalid parent succeeded'; exception when sqlstate 'CM005' then null; end;
  if public.cosmifold_read_universe(sa) is distinct from before_data or
    (select count(*) from cosmifold_private.operation_receipts where universe_id=ua)<>before_receipts then raise exception 'compound rollback changed data/revision/receipt'; end if;
  modified:=jsonb_set(modified,'{payload,upsert,entries}',jsonb_build_array(jsonb_set(row_data,'{parent_id}','"tokyo"')));
  begin perform public.cosmifold_commit_metadata(modified); raise exception 'cycle succeeded'; exception when sqlstate 'CM005' then null; end;
  modified:=jsonb_set(modified,'{payload,upsert,entries}',jsonb_build_array(jsonb_set(row_data,'{universe_id}',to_jsonb(ua2))));
  begin perform public.cosmifold_commit_metadata(modified); raise exception 'cross-Universe row succeeded'; exception when sqlstate 'CM005' then null; end;
  modified:=jsonb_set(modified,'{payload,upsert,entries}',jsonb_build_array(jsonb_set(row_data,'{attributes_json}',
    '{"content":{"version":1,"notes":{"format":"plain","text":""},"links":[],"attachments":[{"id":"file"}]}}')));
  begin perform public.cosmifold_commit_metadata(modified); raise exception 'attachment metadata succeeded'; exception when sqlstate 'CM006' then null; end;
  -- Composite FK enforcement independently of RPC validation. No private-schema
  -- Data API access exists; raw SQL is used here solely to exercise constraints.
  begin
    insert into cosmifold_private.entries(universe_id,id,parent_id,parent_id_present,name,ordinal) values(ua2,'foreign-child','tokyo',true,'Bad',0);
    set constraints cosmifold_private.entries_parent_fk immediate; raise exception 'cross-Universe parent FK succeeded';
  exception when foreign_key_violation then null; end;
  begin
    insert into cosmifold_private.constellation_members values(ua2,'favorites','tokyo',0);
    set constraints cosmifold_private.members_collection_fk,cosmifold_private.members_entry_fk immediate; raise exception 'cross-Universe membership FK succeeded';
  exception when foreign_key_violation then null; end;
  begin
    insert into cosmifold_private.linked_placements values(ua2,'foreign-link','tokyo','galaxy','2026-10-12T00:00:00.000Z',0);
    set constraints cosmifold_private.placements_target_fk,cosmifold_private.placements_parent_fk immediate; raise exception 'cross-Universe placement FK succeeded';
  exception when foreign_key_violation then null; end;
  begin
    update cosmifold_private.universes set owner_id=b where id=ua; raise exception 'ownership reassignment succeeded';
  exception when insufficient_privilege then null; end;
  -- Removing an entry without its memberships/placements does not cascade.
  modified:=jsonb_build_object('scope',sa,'operationId','00000000-0000-4000-8000-000000000105','baseRevision','2','type','items.deleted',
    'payload',jsonb_build_object('delete',jsonb_build_object('entries',jsonb_build_array('tokyo')),
      'upsert',jsonb_build_object('entries',jsonb_build_array(jsonb_set(cmd#>'{payload,upsert,entries,2}','{ordinal}','1'),jsonb_set(cmd#>'{payload,upsert,entries,3}','{ordinal}','2')))));
  begin perform public.cosmifold_commit_metadata(modified); raise exception 'dangling references silently cascaded'; exception when sqlstate 'CM005' then null; end;
  if public.cosmifold_read_universe(sa) is distinct from before_data then raise exception 'failed delete changed data'; end if;
  -- No-op receipts are durable without advancing revision.
  empty_command:=jsonb_build_object('scope',sa,'operationId','00000000-0000-4000-8000-000000000106','baseRevision','2','type','items.changed','payload','{}'::jsonb);
  response:=public.cosmifold_commit_metadata(empty_command);
  if response->>'revision'<>'2' or response->>'status'<>'unchanged' then raise exception 'no-op revision changed'; end if;
  ack:=public.cosmifold_operation_receipt(sa,(empty_command->>'operationId')::uuid);
  if ack->>'status' is distinct from 'found' or ack->'acknowledgement' is distinct from (response || '{"replayed":true}'::jsonb) then
    raise exception 'no-op returned without its receipt';
  end if;
  -- Swap global ordinals: deferred uniqueness allows valid reordering atomically.
  modified:=jsonb_build_object('scope',sa,'operationId','00000000-0000-4000-8000-000000000107','baseRevision','2','type','items.changed',
    'payload',jsonb_build_object('upsert',jsonb_build_object('entries',jsonb_build_array(jsonb_set(row_data,'{ordinal}','1'),jsonb_set(cmd#>'{payload,upsert,entries,1}','{ordinal}','0')))));
  response:=public.cosmifold_commit_metadata(modified);
  if response->>'revision'<>'3' then raise exception 'ordinal swap failed'; end if;
  -- Successful deletion supplies ALL reference removal and ordinal adjustments.
  modified:=jsonb_build_object('scope',sa,'operationId','00000000-0000-4000-8000-000000000108','baseRevision','3','type','items.deleted',
    'payload',jsonb_build_object('delete',jsonb_build_object('entries',jsonb_build_array('tokyo'),'linked_placements',jsonb_build_array('portal:link'),
      'constellation_members',jsonb_build_array(jsonb_build_object('constellation_id','favorites','entry_id','tokyo'))),
      'upsert',jsonb_build_object('entries',jsonb_build_array(jsonb_set(row_data,'{ordinal}','0'),jsonb_set(cmd#>'{payload,upsert,entries,2}','{ordinal}','1'),
        jsonb_set(cmd#>'{payload,upsert,entries,3}','{ordinal}','2')),
        'constellation_members',jsonb_build_array(jsonb_set(cmd#>'{payload,upsert,constellation_members,1}','{ordinal}','0')))));
  response:=public.cosmifold_commit_metadata(modified);
  if response->>'revision'<>'4' or jsonb_array_length(public.cosmifold_read_universe(sa)#>'{metadata,entries}')<>3 or
    jsonb_array_length(public.cosmifold_read_universe(sa)#>'{metadata,linked_placements}')<>0 then raise exception 'explicit deletion failed'; end if;
  -- Null session must not work even if a caller is assigned authenticated role.
  perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
  begin perform public.cosmifold_read_universe(sa); raise exception 'missing subject read succeeded'; exception when invalid_authorization_specification then null; end;
  -- B cannot read or mutate A; raw table RLS is tested as well as the RPC guard.
  perform set_config('request.jwt.claim.sub',b::text,true); perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
  perform public.cosmifold_create_universe(ub);
  if jsonb_array_length(public.cosmifold_list_universes())<>1 then raise exception 'list leaked owner A'; end if;
  begin perform public.cosmifold_read_universe(sa); raise exception 'B read A'; exception when insufficient_privilege then null; end;
  begin perform public.cosmifold_commit_metadata(empty_command); raise exception 'B mutated A'; exception when insufficient_privilege then null; end;
  begin perform public.cosmifold_operation_receipt(sa,(cmd->>'operationId')::uuid); raise exception 'B reconciled A'; exception when insufficient_privilege then null; end;
  if exists(select 1 from cosmifold_private.universes where id=ua) or exists(select 1 from cosmifold_private.entries where universe_id=ua) then raise exception 'RLS leaked A'; end if;
  begin
    insert into cosmifold_private.entries(universe_id,id,parent_id_present,name,ordinal) values(ua,'b-in-a',false,'Bad',4);
    raise exception 'B inserted into A';
  exception when insufficient_privilege then null; end;
  -- Foreign IDs queried under B's claimed scope stay indistinguishable from
  -- absence, without disclosing whether A's Universe exists.
  if public.cosmifold_read_universe(jsonb_build_object('ownerUserId',b,'universeId',ua))->>'status'<>'absent' then raise exception 'foreign existence leaked'; end if;
  execute 'reset role'; execute 'set local role anon';
  begin perform public.cosmifold_read_universe(sa); raise exception 'anonymous read succeeded'; exception when insufficient_privilege then null; end;
  begin perform public.cosmifold_commit_metadata(cmd); raise exception 'anonymous mutation succeeded'; exception when insufficient_privilege then null; end;
  begin perform 1 from cosmifold_private.entries; raise exception 'anonymous table read succeeded'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
    (n.nspname='cosmifold_private' or n.nspname='public' and p.proname like 'cosmifold_%') and p.prosecdef) then raise exception 'DEFINER function found'; end if;
  if has_function_privilege('anon','public.cosmifold_commit_metadata(jsonb)','EXECUTE') or
    has_table_privilege('anon','cosmifold_private.entries','SELECT') or
    has_column_privilege('authenticated','cosmifold_private.universes','owner_id','UPDATE') then raise exception 'unsafe grant'; end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='cosmifold_private' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity)) then raise exception 'missing RLS'; end if;
  if cosmifold_private.utf16_length(chr(128640))<>2 then raise exception 'UTF16 length compatibility failed'; end if;
  raise notice 'cloud metadata database/security assertions passed (fixtures roll back)';
end;
$$;
$cm_database_suite$;
    execute format('set local role %I',actor);
    stage := 'supplemental grant/role/RPC checks';
    execute $cm_supplemental$
do $cm_supplemental_do$
declare r record; private_relation text; leaked boolean; response jsonb;
  a uuid := '00000000-0000-4000-8000-000000000001';
  b uuid := '00000000-0000-4000-8000-000000000002';
  ua uuid := '00000000-0000-4000-8000-000000000011';
begin
  -- Assert effective privileges, including any inherited/default PUBLIC grants.
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='cosmifold_private' or n.nspname='public' and p.proname in ('cosmifold_read_universe','cosmifold_list_universes',
      'cosmifold_create_universe','cosmifold_operation_receipt','cosmifold_commit_metadata')
  loop
    if has_function_privilege('anon',r.oid,'EXECUTE') or not has_function_privilege('authenticated',r.oid,'EXECUTE') then
      raise exception 'Incorrect effective function grant (including inherited/PUBLIC grants).';
    end if;
  end loop;
  if not has_schema_privilege('authenticated','cosmifold_private','USAGE') or has_schema_privilege('authenticated','cosmifold_private','CREATE') or
    has_schema_privilege('anon','cosmifold_private','USAGE') or
    has_column_privilege('authenticated','cosmifold_private.entries','id','UPDATE') or
    has_column_privilege('authenticated','cosmifold_private.entries','universe_id','UPDATE') or
    has_table_privilege('authenticated','cosmifold_private.operation_receipts','UPDATE') or
    has_table_privilege('authenticated','cosmifold_private.operation_receipts','DELETE') then raise exception 'Incorrect effective schema/column/receipt grants.'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if current_user<>'authenticated' or auth.uid() is distinct from a then raise exception 'User A simulation failed.'; end if;
  -- Ordinary RPCs cannot change Universe ownership; creation also cannot claim
  -- somebody else's pre-existing ID. No direct browser owner-update API exists.
  begin
    perform public.cosmifold_commit_metadata(jsonb_build_object('scope',jsonb_build_object('ownerUserId',a,'universeId',ua),
      'operationId','00000000-0000-4000-8000-000000000120','baseRevision','4','type','items.changed','payload',jsonb_build_object('owner_id',b)));
    raise exception 'RPC accepted ownership reassignment.';
  exception when invalid_parameter_value then null; end;
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
  if auth.uid() is distinct from b then raise exception 'User B simulation failed.'; end if;
  begin perform public.cosmifold_create_universe(ua); raise exception 'B claimed A via creation RPC.'; exception when insufficient_privilege then null; end;
  foreach private_relation in array array['entries','constellations','constellation_members','linked_placements','operation_receipts'] loop
    execute format('select exists(select 1 from cosmifold_private.%I where universe_id=$1)',private_relation) into leaked using ua;
    if leaked then raise exception 'User B sees A in a private domain table.'; end if;
  end loop;
  execute 'reset role';
end;
$cm_supplemental_do$;
$cm_supplemental$;
    -- Intentional exception rolls back THIS subtransaction even on success:
    -- scratch schema, public RPCs, grants and Auth/test rows all disappear.
    stage := 'successful scratch rollback';
    raise exception using errcode='CV001',message='CM_VALIDATION_SUCCESS_ROLLBACK';
  exception
    when sqlstate 'CV001' then
      raise notice 'All migration/database/security assertions passed; scratch changes rolled back.';
    when others then
      get stacked diagnostics failure_state=returned_sqlstate,failure_message=message_text,failure_context=pg_exception_context;
      raise exception using errcode='P0001',message=format('Validation failed during %s: [%s] %s. Scratch changes rolled back; migration was not modified.',stage,failure_state,failure_message),detail=failure_context;
    when query_canceled then
      raise exception 'Validation canceled/timed out during %. Scratch subtransaction rolled back. Issue ROLLBACK if the Editor reports an aborted transaction.',stage;
  end;
  -- This verifies rollback before the final outer ROLLBACK too.
  if to_regnamespace('cosmifold_private') is not null or exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('cosmifold_read_universe','cosmifold_list_universes',
      'cosmifold_create_universe','cosmifold_operation_receipt','cosmifold_commit_metadata')
  ) or exists(select 1 from auth.users where id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002')) then
    raise exception 'Scratch rollback verification failed. Do not apply migration.';
  end if;
end;
$cm_validation_runner$;

-- Failure raises before this statement. SQL Editor may show only the final
-- command; green/no-error completion means assertions passed, not HTTP testing.
select 'PASSED: migration and single-session assertions; scratch objects removed' as database_validation,
       'NOT TESTED: actual PostgREST/GraphQL HTTP exposure and concurrent locking' as integration_validation;
rollback;
