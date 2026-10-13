// Generate a pasteable SQL Editor runner; no database/network/tool installation.
// Migration/test sources remain byte-for-byte unchanged.
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8').replace(/\r\n/g,'\n');
const digest=text=>crypto.createHash('sha256').update(text).digest('hex');
function sources(){
 const migration=read('supabase/migrations/202610120001_cloud_metadata.sql'),suite=read('tests/database/cloud-metadata.sql');
 const transaction=migration.match(/\nbegin;\n([\s\S]*)\ncommit;\s*$/i);if(!transaction)throw Error('Expected one migration transaction.');
 let tests=suite.replace(/^\\set[^\n]*(?:\n|$)/gm,'');
 const fixtures=Object.fromEntries([...suite.matchAll(/^\\set (cloud_command|expected_projection) '([^\n]+)'\s*$/gm)].map(match=>[
  match[1],JSON.parse(match[2].replace(/\\\\/g,'\\').replace(/\\'/g,"'"))]));
 if(!fixtures.cloud_command||!fixtures.expected_projection)throw Error('Missing test fixtures.');
 const wrapper=tests.match(/\nbegin;\n([\s\S]*)\nrollback;\s*$/i);if(!wrapper)throw Error('Expected one test transaction.');tests=wrapper[1];
 const literal=(name,value)=>{const tag='$cm_'+name+'$';const json=JSON.stringify(value);if(json.includes(tag))throw Error('Unexpected dollar tag in fixture.');return tag+json+tag+'::jsonb';};
 tests=tests.replace(/:'cloud_command'::jsonb/g,literal('command',fixtures.cloud_command)).replace(/:'expected_projection'::jsonb/g,literal('expected',fixtures.expected_projection));
 if(/^\\|:'(?:cloud_command|expected_projection)'/m.test(tests))throw Error('psql syntax remains.');
 return {migration,suite,migrationBody:transaction[1],testBody:tests};
}
function generate(){
 const input=sources(),templateSource=read('tests/database/cloud-metadata-editor.template.sql');
 const templateHeader='-- TEMPLATE ONLY. Do not paste or run this file in Supabase SQL Editor.\n-- Generate the runnable artifact with: node scripts/build-cloud-validation.js\n';
 if(!templateSource.startsWith(templateHeader))throw Error('Expected the template-only header.');
 const artifactHeader='-- GENERATED SQL EDITOR VALIDATION (runnable artifact, not the template).\n-- Paste this ENTIRE file: tests/database/cloud-metadata-sql-editor.sql\n-- Generated locally by scripts/build-cloud-validation.js; no SQL was executed.\n';
 const template=artifactHeader+templateSource.slice(templateHeader.length);
 const values={MIGRATION_SHA256:digest(input.migration),SUITE_SHA256:digest(input.suite),MIGRATION_BODY:input.migrationBody,TEST_BODY:input.testBody};
 const result=template.replace(/\{\{(MIGRATION_SHA256|SUITE_SHA256|MIGRATION_BODY|TEST_BODY)\}\}/g,(_,key)=>values[key]);
 if(/\{\{(?:MIGRATION|SUITE|TEST)_/.test(result))throw Error('Unexpanded validation placeholder.');
 return result;
}
if(require.main===module){
 const output=path.join(root,'tests/database/cloud-metadata-sql-editor.sql');
 fs.writeFileSync(output,generate());process.stdout.write('Generated rollback-only SQL Editor validation. No SQL executed.\n');
}
module.exports={sources,generate};
