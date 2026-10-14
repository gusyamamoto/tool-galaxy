// Static SQL/ACL-model checks only; no PostgreSQL or HTTP execution.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const sql=fs.readFileSync('supabase/migrations/202610130001_cloud_metadata_rpc_grants.sql','utf8');
const audit=fs.readFileSync('tests/database/cloud-rpc-grants-postfix.sql','utf8');
const uncomment=s=>s.replace(/--[^\n]*/g,'');
const signatures=['public.cosmifold_list_universes()','public.cosmifold_create_universe(uuid)',
 'public.cosmifold_read_universe(jsonb)','public.cosmifold_commit_metadata(jsonb)','public.cosmifold_operation_receipt(jsonb,uuid)'];
const statements=uncomment(sql).split(';').map(s=>s.trim()).filter(Boolean);
const commands=statements.filter(s=>/^(revoke|grant) /i.test(s)).map(s=>{
 const m=s.match(/^(revoke|grant) execute on function\s+([\s\S]+?)\s+(from|to)\s+([\w,\s]+)$/i);
 assert.ok(m,'only signature-specific EXECUTE changes are allowed');
 const functions=[...m[2].matchAll(/public\.\w+\([^)]*\)/g)].map(m=>m[0].replace(/\s/g,''));
 assert.equal(m[2].replace(/public\.\w+\([^)]*\)/g,'').replace(/[\s,]/g,''),'');
 return {action:m[1],direction:m[3],functions,roles:m[4].split(',').map(r=>r.trim())};
});
function apply(acl){for(const c of commands)for(const name of c.functions)for(const role of c.roles){
 if(c.action==='grant')acl.get(name).add(role);else acl.get(name).delete(role);
}return acl;}
test('correction changes only exact-five EXECUTE grants in one transaction',()=>{
 assert.equal(statements.length,5);assert.equal(statements[0],'begin');assert.equal(statements[4],'commit');
 assert.equal(statements[3],"notify pgrst, 'reload schema'");assert.equal(commands.length,2);
 assert.deepEqual(commands.map(c=>[c.action,c.direction,c.roles]),[
 ['revoke','from',['public','anon']],['grant','to',['authenticated']]]);
 for(const c of commands)assert.deepEqual(c.functions,signatures);
 assert.doesNotMatch(uncomment(sql),/\b(create|alter|drop|insert|update|delete|truncate)\b|cosmifold_private|all functions|default privileges|service_role/i);
});
test('anonymous/PUBLIC execution denied; authenticated execution retained or established',()=>{
 for(const start of [['public','anon','authenticated','service_role','postgres'],['public','anon'],[]]){
  const acl=apply(new Map(signatures.map(s=>[s,new Set(start)])));
  for(const roles of acl.values()){
   assert.equal(roles.has('public')||roles.has('anon'),false);assert.equal(roles.has('authenticated'),true);
  }
 }
});
test('idempotent correction preserves explicit administrative and unrelated privileges without broadening them',()=>{
 for(const admin of [[],['service_role','postgres']]){
  const acl=new Map([...signatures.map(s=>[s,new Set(['public','anon',...admin])]),
   ['public.unrelated_rpc()',new Set(['anon'])],['cosmifold_private.helper()',new Set(['authenticated'])]]);
  apply(acl);const once=[...acl].map(([s,r])=>[s,[...r]]);apply(acl);
  assert.deepEqual([...acl].map(([s,r])=>[s,[...r]]),once);
  for(const s of signatures)for(const role of ['service_role','postgres'])assert.equal(acl.get(s).has(role),admin.includes(role));
  assert.deepEqual([...acl.get('public.unrelated_rpc()')],['anon']);
  assert.deepEqual([...acl.get('cosmifold_private.helper()')],['authenticated']);
 }
});
test('read-only post-fix audit covers missing signatures, effective roles, PUBLIC and direct ACLs',()=>{
 const source=uncomment(audit);
 assert.doesNotMatch(source,/\b(begin|commit|grant|revoke|insert|update|delete|create|alter|drop|notify)\b/i);
 for(const signature of signatures)assert.ok(source.includes("'"+signature+"'"));
 assert.equal((source.match(/'public\.cosmifold_/g)||[]).length,5);
 assert.match(source,/left join pg_proc p on p\.oid=to_regprocedure\(e\.signature\)/);
 for(const role of ['anon','authenticated'])assert.ok(source.includes("has_function_privilege('"+role+"',p.oid,'EXECUTE')"));
 assert.match(source,/has_schema_privilege\('authenticated','public','USAGE'\)/);
 assert.match(source,/aclexplode\(coalesce\(p\.proacl,acldefault\('f',p\.proowner\)\)\)/);
 assert.match(source,/a\.grantee=0 and a\.privilege_type='EXECUTE'/);
 assert.match(source,/r\.rolname='anon' and a\.privilege_type='EXECUTE'/);
 assert.match(source,/function_exists and security_invoker and authenticated_execute\s+and not anonymous_execute and not anonymous_direct_execute and not public_execute,false/);
 assert.match(source,/count\(\*\) over \(\)=5 and bool_and\(function_checks_passed\) over \(\)/);
});
