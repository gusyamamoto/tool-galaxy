const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const source=fs.readFileSync('ids.js','utf8');
function ids(crypto){const context=vm.createContext({crypto});vm.runInContext(source,context);return vm.runInContext('cosmifoldIds',context);}

test('shared UUID helper prefers the native API with its Crypto receiver',()=>{
    const expected='d96bc512-af81-438f-9d9d-a8d567ea1004';let calls=0;
    const crypto={randomUUID(){assert.equal(this,crypto);calls++;return expected;},getRandomValues(){assert.fail('fallback must not run');}};
    assert.equal(ids(crypto).uuid(),expected);assert.equal(calls,1);
});

test('Crypto without randomUUID produces RFC 4122 v4 UUIDs from secure bytes',()=>{
    for(const [byte,expected] of [[0,'00000000-0000-4000-8000-000000000000'],[255,'ffffffff-ffff-4fff-bfff-ffffffffffff']]) {
        const crypto={getRandomValues(value){assert.equal(this,crypto);assert.equal(value.length,16);value.fill(byte);return value;}};
        assert.equal(ids(crypto).uuid(),expected);assert.equal(crypto.randomUUID,undefined);
    }
    const helper=ids({getRandomValues:bytes=>webcrypto.getRandomValues(bytes)});
    const values=Array.from({length:1024},()=>helper.uuid());
    assert.equal(new Set(values).size,values.length);
    assert.ok(values.every(value=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)));
});

test('missing secure randomness fails explicitly instead of generating predictable IDs',()=>{
    for(const crypto of [undefined,{}]) assert.throws(()=>ids(crypto).uuid(),/updated browser.*HTTPS/);
});
