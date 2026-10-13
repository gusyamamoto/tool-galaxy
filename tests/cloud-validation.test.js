const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {generate,sources}=require('../scripts/build-cloud-validation.js');
const file='tests/database/cloud-metadata-sql-editor.sql';
const script=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'),input=sources();
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');

test('SQL Editor script is deterministically generated from unchanged migration/test sources',()=>{
 assert.equal(script,generate());assert.ok(script.includes(hash(input.migration)));assert.ok(script.includes(hash(input.suite)));
 assert.equal(script.split(input.migrationBody).length,2);assert.equal(script.split(input.testBody).length,2);
});
test('generated runnable header cannot retain the template-only warning',()=>{
 assert.ok(script.startsWith('-- GENERATED SQL EDITOR VALIDATION (runnable artifact, not the template).\n'));
 assert.ok(script.includes('-- Paste this ENTIRE file: tests/database/cloud-metadata-sql-editor.sql\n'));
 assert.doesNotMatch(script,/TEMPLATE ONLY|Do not run this template|Do not paste or run this file/);
 assert.ok(fs.readFileSync('tests/database/cloud-metadata-editor.template.sql','utf8').startsWith('-- TEMPLATE ONLY.'));
});
test('the temporary migration and test blocks have no outer transaction/psql commands',()=>{
 assert.doesNotMatch(input.migrationBody,/^\s*(?:begin|commit|rollback);\s*$/m);
 assert.doesNotMatch(input.testBody,/^\s*(?:begin|commit|rollback);\s*$|^\\set|:'(?:cloud_command|expected_projection)'/m);
 assert.doesNotMatch(script,/^\\set|\{\{(?:MIGRATION|SUITE|TEST)_/m);
 assert.match(script,/\nbegin;\n/);assert.match(script,/\nrollback;\s*$/);
});
test('success deliberately rolls back the scratch subtransaction and real failures are rethrown',()=>{
 assert.match(script,/errcode='CV001',message='CM_VALIDATION_SUCCESS_ROLLBACK'/);
 assert.match(script,/when sqlstate 'CV001'/);assert.match(script,/when others then[\s\S]*get stacked diagnostics[\s\S]*raise exception using errcode='P0001'/);
 assert.match(script,/when query_canceled then/);assert.match(script,/Scratch rollback verification failed/);
});
test('preflight refuses existing objects, fixture collisions, unsafe roles/triggers and visible API exposure',()=>{
 for(const text of ['Cosmifold schema/RPC objects already exist','Fixture IDs already exist','rolsuper or rolbypassrls',
  'not tgisinternal','pgrst.db_schemas','pgrst.db_extra_search_path','pgrst.db_pre_config','GraphQL function search_path'])assert.ok(script.includes(text),text);
 assert.ok(script.indexOf('Fixture IDs already exist')<script.indexOf('execute $cm_migration_body$'));
});
test('runner adds effective grants, authenticated subjects, all private table isolation and owner RPC checks',()=>{
 for(const text of ['Incorrect effective function grant','current_user<>\'authenticated\' or auth.uid() is distinct from a',
  'RPC accepted ownership reassignment','B claimed A via creation RPC','has_column_privilege','has_schema_privilege',
  "array['entries','constellations','constellation_members','linked_placements','operation_receipts']"])assert.ok(script.includes(text),text);
});
test('HTTP exposure/concurrency are explicitly untested and no migration exposure/security changes are smuggled in',()=>{
 assert.match(script,/NOT TESTED: actual PostgREST\/GraphQL HTTP exposure and concurrent locking/);
 const template=fs.readFileSync('tests/database/cloud-metadata-editor.template.sql','utf8');
 assert.doesNotMatch(template,/security definer|alter role .*pgrst|create extension|https?:\/\//i);
 assert.ok(!template.includes('drop schema'));assert.ok(!template.includes('truncate auth'));
});
