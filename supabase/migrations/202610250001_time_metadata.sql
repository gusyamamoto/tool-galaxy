-- Optional canonical calendar metadata; no tables, RPCs, grants or revision changes.
-- Apply with the existing cloud migrations when cloud is next provisioned.
begin;

create or replace function cosmifold_private.valid_attributes(value jsonb) returns boolean
language plpgsql stable security invoker set search_path = '' as $$
declare content jsonb; link jsonb; bookmark_ids text[] := '{}'; key text;
  calendar jsonb; shape_keys text[]; date_keys text[]; date_key text;
  parts text[]; year_no integer; month_no integer; day_no integer; month_days integer[];
begin
  if not cosmifold_private.exact_keys(value,array['description','category','appearance','content','location','when','due','taskList','completed','createdAt','updatedAt']) or
     not cosmifold_private.valid_json(value) then return false; end if;
  if value ? 'description' and (jsonb_typeof(value->'description')<>'string' or cosmifold_private.utf16_length(value->>'description')>1000) then return false; end if;
  if value ? 'category' and jsonb_typeof(value->'category')<>'string' then return false; end if;
  if value ? 'appearance' and jsonb_typeof(value->'appearance')<>'object' then return false; end if;
  foreach key in array array['createdAt','updatedAt'] loop
    if value ? key and (jsonb_typeof(value->key)<>'string' or not cosmifold_private.valid_timestamp(value->>key)) then return false; end if;
  end loop;
  foreach key in array array['when','due'] loop
    if value ? key and value->key<>'null'::jsonb then
      calendar:=value->key;
      shape_keys:=case when key='when' then array['startDate','endDate','time'] else array['date','time'] end;
      if not cosmifold_private.exact_keys(calendar,shape_keys,shape_keys) then return false; end if;
      if calendar->'time'<>'null'::jsonb and (jsonb_typeof(calendar->'time')<>'string' or
        (calendar->>'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then return false; end if;
      date_keys:=case when key='when' then array['startDate','endDate'] else array['date'] end;
      foreach date_key in array date_keys loop
        if date_key='endDate' and calendar->date_key='null'::jsonb then continue; end if;
        if jsonb_typeof(calendar->date_key)<>'string' or (calendar->>date_key) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
        parts:=string_to_array(calendar->>date_key,'-');year_no:=parts[1]::integer;month_no:=parts[2]::integer;day_no:=parts[3]::integer;
        month_days:=array[31,case when year_no%4=0 and (year_no%100<>0 or year_no%400=0) then 29 else 28 end,31,30,31,30,31,31,30,31,30,31];
        if year_no<1 or month_no not between 1 and 12 or day_no not between 1 and coalesce(month_days[month_no],0) then return false; end if;
      end loop;
      if key='when' and calendar->'endDate'<>'null'::jsonb and
        (calendar->>'endDate'<calendar->>'startDate' or calendar->'time'<>'null'::jsonb) then return false; end if;
    end if;
  end loop;
  foreach key in array array['taskList','completed'] loop
    if value ? key and jsonb_typeof(value->key)<>'boolean' then return false; end if;
  end loop;
  if value->'taskList'='true'::jsonb and
    (coalesce(value->'when','null'::jsonb)<>'null'::jsonb or coalesce(value->'due','null'::jsonb)<>'null'::jsonb) then return false; end if;
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

-- CREATE OR REPLACE preserves the existing private-validator privileges.
commit;
