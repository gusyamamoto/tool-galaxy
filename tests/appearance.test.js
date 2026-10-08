const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), path=require('node:path');
const {test}=require('node:test');
function load(){const c=vm.createContext({}); vm.runInContext(fs.readFileSync(path.join(__dirname,'../appearance.js'),'utf8'),c);return vm.runInContext('galaxyAppearance',c);}
const plain=v=>JSON.parse(JSON.stringify(v));
test('identities remain identical after reload, rename and metadata edits',()=>{
    const a=load(),b=load();
    for(const role of ['galaxy','sun','planet','moon','satellite','astronaut']) for(let i=0;i<30;i++) {
        const entry={id:`identity-${i}`,role,name:'Original'};
        assert.deepEqual(plain(a.resolve(entry)),plain(b.resolve({...entry,name:'Renamed',category:'Changed'})));
        if(role==='galaxy') assert.equal(a.cloud(a.resolve(entry)),b.cloud(b.resolve(entry)));
    }
});
test('automatic variants cover all six Galaxy and six Planet archetypes, with occasional rings',()=>{
    const a=load();
    for(const role of ['galaxy','planet','satellite','astronaut']) {
        const variants=Array.from({length:100},(_,i)=>a.resolve({id:`node-${i}`,role}));
        assert.equal(new Set(variants.map(s=>s.archetype)).size,a.archetypes[role].length);
        if(role==='planet'){const rings=variants.filter(s=>s.rings).length;assert.ok(rings>0 && rings<35);}
    }
});

test('all artificial Satellite variants are stable lightweight native silhouettes and accept overrides',()=>{
    const a=load();
    for(const archetype of a.archetypes.satellite) {
        const entry={id:'craft',role:'satellite',appearance:{archetype,palette:'teal'}};
        const style=a.resolve(entry),svg=a.satellite(style);
        assert.equal(style.archetype,archetype);assert.equal(style.hue,178);
        assert.equal(svg,load().satellite(load().resolve(entry)));
        assert.match(svg,/viewBox="0 0 24 24"/);assert.doesNotMatch(svg,/<filter|<circle|image|random/);
        assert.ok(svg.length<1300);
    }
});
test('valid future overrides resolve predictably while auto and invalid overrides fall back safely',()=>{
    const a=load(),entry={id:'test',role:'planet'};
    const override=a.resolve({...entry,appearance:{archetype:'oceanic',rings:true,palette:'teal'}});
    assert.equal(override.archetype,'oceanic');assert.equal(override.rings,true);assert.equal(override.hue,178);
    assert.deepEqual(plain(a.resolve({...entry,appearance:{mode:'auto',archetype:'oceanic'}})),plain(a.resolve(entry)));
    assert.deepEqual(plain(a.resolve({...entry,appearance:{archetype:'bad',palette:'bad'}})),plain(a.resolve(entry)));
    assert.equal(a.resolve({id:'test',role:'moon',appearance:{rings:true}}).rings,false);
});

test('Astronaut poses are stable, compact native SVG silhouettes and accept future overrides',()=>{
    const a=load();
    const figures=new Set();
    for(const archetype of a.archetypes.astronaut){
        const entry={id:'eva',role:'astronaut',appearance:{archetype,palette:'blue',future:'keep'}};
        const style=a.resolve(entry),svg=a.astronaut(style);
        assert.equal(style.archetype,archetype);assert.equal(style.hue,212);
        assert.equal(svg,load().astronaut(load().resolve(entry)));
        assert.doesNotMatch(svg,/<filter|<image|foreignObject|random/);
        assert.ok(svg.length<1200);figures.add(svg);
    }
    assert.equal(figures.size,4);
    const entry={id:'eva',role:'astronaut'};
    assert.deepEqual(plain(a.resolve({...entry,appearance:{archetype:'bad'}})),plain(a.resolve(entry)));
});

test('Galaxy archetypes use deterministic designed morphologies with transparent edges and no live filters',()=>{
    const appearance=load(), images=[];
    for(const archetype of appearance.archetypes.galaxy) {
        const style=appearance.resolve({id:'cloud-test',role:'galaxy',appearance:{archetype}});
        const svg=appearance.cloud(style);images.push(svg);
        assert.match(svg, /radialGradient/);assert.match(svg, /stop-opacity="0"/);
        assert.doesNotMatch(svg, /<path|<filter|stroke=/);
        assert.equal(svg,load().cloud(style));
    }
    assert.equal(new Set(images).size,6);
});

test('old Galaxy appearance overrides map to nebula territories without changing stored metadata',()=>{
    const a=load(), aliases={spiral:'wispy','barred-spiral':'double-lobed',elliptical:'bloom',irregular:'cluster'};
    for(const [legacy, current] of Object.entries(aliases)) {
        const entry={id:'legacy-cloud',role:'galaxy',appearance:{archetype:legacy,palette:'teal'}};
        const before=JSON.stringify(entry),style=a.resolve(entry);
        assert.equal(style.archetype,current);assert.equal(style.hue,178);
        assert.equal(JSON.stringify(entry),before);
        assert.doesNotMatch(a.cloud(style),/<path|<filter|stroke=/);
    }
});
