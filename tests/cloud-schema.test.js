// Static review guards, NOT a PostgreSQL parser or substitute for database tests.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const migration=fs.readFileSync('supabase/migrations/202610120001_cloud_metadata.sql','utf8');
const databaseTests=fs.readFileSync('tests/database/cloud-metadata.sql','utf8');
const context=vm.createContext({URL});
for(const name of ['services/cloud-repository-contract.js','services/cloud-metadata-projection.js'])vm.runInContext(fs.readFileSync(name,'utf8'),context);
const contract=vm.runInContext('cosmifoldCloudContract',context),projection=vm.runInContext('cosmifoldCloudProjection',context);
const plain=value=>JSON.parse(JSON.stringify(value));
const functions=[...migration.matchAll(/create function ([\w.]+)\(([\s\S]*?)\) returns ([\s\S]*?) as \$\$([\s\S]*?)\$\$;/g)];
const body=name=>{const found=functions.find(match=>match[1]===name);assert.ok(found,name);return found[4];};
function balanced(source){
 const stack=[];let i=0;
 while(i<source.length){
  if(source.startsWith('--',i)){i=source.indexOf('\n',i);if(i<0)break;continue;}
  if(source[i]==="'"){
   const escaped=i>0&&/[eE]/.test(source[i-1]);i++;let closed=false;
   while(i<source.length){if(escaped&&source[i]==='\\'){i+=2;continue;}if(source[i]==="'"){if(source[i+1]==="'"){i+=2;continue;}i++;closed=true;break;}i++;}
   assert.ok(closed,'unterminated SQL string');continue;
  }
  const dollar=source.slice(i).match(/^\$(?:[a-zA-Z_]\w*)?\$/);
  if(dollar){const end=source.indexOf(dollar[0],i+dollar[0].length);assert.ok(end>=0,'unterminated dollar body');balanced(source.slice(i+dollar[0].length,end));i=end+dollar[0].length;continue;}
  if(source[i]==='(')stack.push(i);if(source[i]===')')assert.ok(stack.pop()!==undefined,'unmatched closing parenthesis');i++;
 }
 assert.equal(stack.length,0,'unclosed parentheses');
}
function fixture(name){const line=databaseTests.split('\n').find(line=>line.startsWith('\\set '+name+' '))?.trimEnd();assert.ok(line);return JSON.parse(line.slice(('\\set '+name+' ').length+1,-1).replace(/\\\\/g,'\\').replace(/\\'/g,"'"));}

test('migration has a transaction and balanced SQL delimiters; procedural blocks terminate explicitly',()=>{
 balanced(migration);balanced(databaseTests.replace(/^\\set.*$/gm,''));
 assert.match(migration,/\nbegin;[\s\S]*\ncommit;\s*$/);
 assert.equal(functions.length,(migration.match(/create function /g)||[]).length);
 for(const match of functions)if(/language plpgsql/.test(match[3]))assert.match(match[4],/end;\s*$/);
 for(const match of migration.matchAll(/do \$\$([\s\S]*?)\$\$;/g))assert.match(match[1],/end;\s*$/);
});
test('only the six planned domain tables exist; owner index is nonunique and canonical IDs stay text',()=>{
 const tables=[...migration.matchAll(/create table cosmifold_private\.(\w+)/g)].map(match=>match[1]);
 assert.deepEqual(tables,['universes','entries','constellations','constellation_members','linked_placements','operation_receipts']);
 assert.match(migration,/create index universes_owner_idx/);assert.doesNotMatch(migration,/unique\s*\(\s*owner_id/i);
 for(const table of ['entries','constellations','linked_placements'])assert.match(migration,new RegExp('create table cosmifold_private\\.'+table+' \\([\\s\\S]*?id text not null'));
 assert.match(migration,/owner_id uuid not null references auth\.users\(id\)/);
});
test('composite FKs, deferred ordering and explicit NO ACTION deletion protect relationships',()=>{
 for(const name of ['entries_parent_fk','members_collection_fk','members_entry_fk','placements_target_fk','placements_parent_fk']){
  assert.match(migration,new RegExp('constraint '+name+' foreign key \\(universe_id,[^)]+\\)[^\\n]+on delete no action deferrable initially deferred'));
 }
 assert.doesNotMatch(migration,/on delete cascade/i);
 assert.match(migration,/constraint placements_pair_key unique \(universe_id,parent_entry_id,target_entry_id\)/);
 assert.match(body('cosmifold_private.assert_integrity'),/with recursive tree/);
 assert.match(body('cosmifold_private.assert_integrity'),/count\(distinct/);
});
test('all functions use INVOKER with fixed empty search path; no anonymous RPC or ownership update grant',()=>{
 for(const match of functions){assert.match(match[3],/security invoker/);assert.match(match[3],/set search_path = ''/);}
 assert.doesNotMatch(migration,/security definer/i);
 assert.match(migration,/grant update \(revision,snapshot_fields\) on cosmifold_private\.universes to authenticated/);
 assert.match(migration,/revoke all on all tables in schema cosmifold_private from public, anon, authenticated/);
 assert.match(migration,/revoke all on function public\.cosmifold_read_universe[\s\S]+from public, anon, authenticated/);
 assert.match(migration,/create policy universe_owner[\s\S]+with check \(owner_id=/);
 assert.match(migration,/enable row level security/);assert.match(migration,/force row level security/);
 assert.match(migration,/array\['entries','constellations','constellation_members','linked_placements','operation_receipts'\]/);
});
test('narrow public surface is exactly discovery, create, read, mutation and receipt reconciliation',()=>{
 assert.deepEqual(functions.filter(match=>match[1].startsWith('public.')).map(match=>match[1]).sort(),[
  'public.cosmifold_commit_metadata','public.cosmifold_create_universe','public.cosmifold_list_universes','public.cosmifold_operation_receipt','public.cosmifold_read_universe']);
 assert.match(body('public.cosmifold_read_universe'),/for share/);assert.match(body('public.cosmifold_read_universe'),/'status','absent'/);
 assert.match(body('public.cosmifold_read_universe'),/'status','found'/);assert.match(body('public.cosmifold_operation_receipt'),/for share/);
});
test('receipt check precedes CAS; server digest and receipt/revision writes remain in the locked mutation',()=>{
 const source=body('public.cosmifold_commit_metadata');
 assert.ok(source.indexOf('for update')<source.indexOf('previous.request_digest'));
 assert.ok(source.indexOf('previous.request_digest')<source.indexOf('current_revision<>base'));
 assert.match(source,/sha256\(convert_to\(p_command::text,'UTF8'\)\)/);
 assert.match(source,/OPERATION_ID_REUSED/);assert.match(source,/REVISION_CONFLICT/);
 assert.match(source,/set revision=revision\+1/);assert.match(source,/insert into cosmifold_private\.operation_receipts/);
 assert.match(source,/when check_violation or foreign_key_violation or unique_violation or not_null_violation/);
 assert.match(source,/'status',case when changes>0 then 'committed' else 'unchanged'/);
});
test('semantic command labels match the existing JS contract and layout/files are rejected',()=>{
 const source=body('public.cosmifold_commit_metadata');const labels=source.match(/not \(p_command->>'type'\)=any\(array\[([\s\S]*?)\]\)/)[1];
 assert.deepEqual([...labels.matchAll(/'([^']+)'/g)].map(match=>match[1]),plain(contract.commandTypes));
 assert.match(source,/UNSUPPORTED_ATTACHMENTS/);assert.match(body('cosmifold_private.valid_attributes'),/content->'attachments'<>'\[\]'::jsonb/);
 assert.doesNotMatch(migration,/\b(?:x|y|layout|positions)\s+(?:real|double|jsonb|numeric)/i);
});
test('SQL test literals match the Step-2 projector exactly, not a handwritten second projection',()=>{
 const cmd=fixture('cloud_command'),expected=fixture('expected_projection'),snapshot=fixture('source_snapshot');
 const generated=projection.toRelational(snapshot,{...cmd.scope,revision:'1'}).metadata;
 assert.deepEqual(expected,plain(generated));assert.deepEqual(plain(contract.command(cmd)),cmd);
 for(const name of ['entries','constellations','constellation_members','linked_placements'])assert.deepEqual(cmd.payload.upsert[name],expected[name]);
 assert.deepEqual(plain(projection.toStorageV5(expected)),snapshot);
 for(const row of expected.entries)assert.ok(!Object.hasOwn(row.attributes_json,'x'));
});
test('authored database suite covers ownership, FK, CAS, retry and rollback with disposable fixtures',()=>{
 for(const marker of ['B read A','B mutated A','anonymous read succeeded','anonymous mutation succeeded','cross-Universe parent FK',
  'cross-Universe membership FK','cross-Universe placement FK','stale write','identical retry','changed digest','compound rollback','ordinal swap','ownership reassignment'])assert.ok(databaseTests.includes(marker),marker);
 assert.match(databaseTests,/set local role authenticated/);assert.match(databaseTests,/set local role anon/);assert.match(databaseTests,/\nrollback;\s*$/);
 assert.doesNotMatch(databaseTests,/\\connect|\.supabase\.co/);
});
