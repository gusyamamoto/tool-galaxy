-- REVIEW ONLY: not applied. Requires Supabase-compatible PostgreSQL 15+, UTF8,
-- auth.users/auth.uid(), and existing anon/authenticated roles. No extensions.
-- Keep cosmifold_private OUT of PostgREST's exposed schemas (see documentation).
begin;

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

commit;
