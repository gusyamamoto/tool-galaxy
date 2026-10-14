// Reviewed Supabase schema-17 bodies only. No name-based or keyword-based safety exceptions.
// Source: supabase/postgres migrations/schema-17.sql; never executed by this diagnostic.
const cloudGraphqlStock=Object.freeze({
    grant:`begin
if not exists (select 1 from pg_event_trigger_ddl_commands() ev join pg_catalog.pg_extension e on ev.objid = e.oid where e.extname = 'pg_graphql') then return; end if;
drop function if exists graphql_public.graphql;
create or replace function graphql_public.graphql("operationName" text default null, query text default null, variables jsonb default null, extensions jsonb default null)
returns jsonb language sql as $$ select graphql.resolve(query := query, variables := coalesce(variables, '{}'), "operationName" := "operationName", extensions := extensions); $$;
alter extension pg_graphql add function graphql_public.graphql(text, text, jsonb, jsonb);
grant usage on schema graphql to postgres, anon, authenticated, service_role;
grant execute on function graphql.resolve to postgres, anon, authenticated, service_role;
grant usage on schema graphql to postgres with grant option;
grant usage on schema graphql_public to postgres with grant option;
end;`,
    placeholder:`DECLARE server_version float; BEGIN
server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);
IF server_version >= 14 THEN RETURN jsonb_build_object('errors', jsonb_build_array(jsonb_build_object('message', 'pg_graphql extension is not enabled.')));
ELSE RETURN jsonb_build_object('errors', jsonb_build_array(jsonb_build_object('message', 'pg_graphql is only available on projects running Postgres 14 onwards.'))); END IF; END;`,
    set:`DECLARE graphql_is_dropped bool; BEGIN
graphql_is_dropped = (SELECT ev.schema_name = 'graphql_public' FROM pg_event_trigger_dropped_objects() AS ev WHERE ev.schema_name = 'graphql_public');
IF graphql_is_dropped THEN create or replace function graphql_public.graphql("operationName" text default null, query text default null, variables jsonb default null, extensions jsonb default null)
returns jsonb language plpgsql as $$ DECLARE server_version float; BEGIN
server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);
IF server_version >= 14 THEN RETURN jsonb_build_object('errors', jsonb_build_array(jsonb_build_object('message', 'pg_graphql extension is not enabled.')));
ELSE RETURN jsonb_build_object('errors', jsonb_build_array(jsonb_build_object('message', 'pg_graphql is only available on projects running Postgres 14 onwards.'))); END IF; END; $$; END IF; END;`
});
// Exact live body reviewed October 13, 2026: only this catalog qualification differs.
// Do not strip schema qualifiers generally or permit substitutions elsewhere.
const cloudGraphqlStockGrantVariants=Object.freeze([
    Object.freeze({id:'schema-17-unqualified-ddl-helper',body:cloudGraphqlStock.grant}),
    Object.freeze({id:'catalog-qualified-ddl-helper',body:cloudGraphqlStock.grant.replace(
        'from pg_event_trigger_ddl_commands() ev','from pg_catalog.pg_event_trigger_ddl_commands() ev')})
]);
// Reviewed live set-helper body: fixes the regenerated placeholder's search_path.
// This clause is permitted only at this exact CREATE FUNCTION location.
const cloudGraphqlStockSetVariants=Object.freeze([
    Object.freeze({id:'schema-17-default-placeholder-path',body:cloudGraphqlStock.set}),
    Object.freeze({id:'fixed-empty-placeholder-path',body:cloudGraphqlStock.set.replace(
        'returns jsonb language plpgsql as $$',()=>"returns jsonb language plpgsql set search_path to '' as $$")})
]);
function cloudGraphqlStockTokenList(body){
    if(typeof body!=='string'||body.length>100000)return null;
    // Match complete quoted strings/identifiers before folding unquoted SQL tokens.
    // Literal contents are preserved. Only whitespace, SQL comments and unquoted case vary.
    const tokens=body.match(/--[^\r\n]*|\/\*[\s\S]*?\*\/|(?:[eE])?'(?:''|[^'])*'|"(?:""|[^"])*"|\$[A-Za-z_0-9]*\$|[A-Za-z_][A-Za-z_0-9$]*|[0-9]+(?:\.[0-9]+)?|[^\s]/g)||[];
    return tokens.filter(t=>!t.startsWith('--')&&!t.startsWith('/*')).map(t=>/^['"]|^[eE]'/.test(t)?t:t.toLowerCase());
}
function cloudGraphqlStockTokens(body){
    return cloudGraphqlStockTokenList(body)?.join(' ')??null;
}
function cloudGraphqlStockDifference(expected,actual){
    const left=cloudGraphqlStockTokenList(expected),right=cloudGraphqlStockTokenList(actual);
    if(!left||!right)return {condition:'body must be a string within the existing size bound'};
    let index=0;while(index<left.length&&index<right.length&&left[index]===right[index])index++;
    const safe=token=>/^'|^[eE]'/.test(token)?'[SQL string literal withheld]':token;
    return {condition:'difference after whitespace/comment/unquoted-case normalization',firstDifferingToken:index,
        expectedTokenCount:left.length,receivedTokenCount:right.length,
        expectedContext:left.slice(Math.max(0,index-4),index+7).map(safe),
        receivedContext:right.slice(Math.max(0,index-4),index+7).map(safe)};
}
