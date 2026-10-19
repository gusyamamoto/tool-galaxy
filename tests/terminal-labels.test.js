const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {test}=require('node:test');
function load(){const c=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../cosmos-view.js'),'utf8'),c);return vm.runInContext('cosmosView',c);}
function chain(view,end){return new Map(view.labelOrder.slice(0,end+1).map((role,i)=>[role,{id:role,role,parentId:i?view.labelOrder[i-1]:null}]));}

test('every terminal depth preserves its entrance and remains eligible after its outgoing band',()=>{
    const v=load();
    v.labelOrder.forEach((role,index)=>{
        const entries=chain(v,index),terminals=v.terminalLabelIds(entries);
        assert.deepEqual([...terminals],[role]);
        for(const scale of [.02,.24,.33,.42,.64,.9,1.12,1.85,2.1,3.15,3.6,6,7,9,12]){
            const expected=index?v.smooth(scale,...v.labelHandoffs[index-1]):1;
            assert.equal(v.labelDisclosure(role,scale,role,undefined,true),expected);
            assert.equal(v.labelDisclosure(role,scale,role,v.detail(scale),true),expected);
            for(const e of entries.values())if(e.id!==role){
                const actual=v.labelDisclosure(e.role,scale,e.id,v.detail(scale),terminals.has(e.id));
                assert.equal(actual,v.labelDisclosure(e.role,scale,e.id),'nonterminal envelopes unchanged');
            }
        }
        assert.equal(v.labelDisclosure(role,12,role,v.detail(12),terminals.has(role)),1);
    });
});

test('mixed siblings have independent terminal labels, including indirect deeper semantic descendants',()=>{
    const v=load(),entries=chain(v,5);
    entries.set('shallow',{id:'shallow',role:'planet',parentId:'sun'});
    entries.set('middle',{id:'middle',role:'moon',parentId:'planet'});
    entries.set('wrapper',{id:'wrapper',role:'planet',parentId:'shallow'});
    assert.deepEqual([...v.terminalLabelIds(entries)].sort(),['astronaut','middle','shallow','wrapper']);
    entries.set('indirect',{id:'indirect',role:'satellite',parentId:'wrapper'});
    const terminals=v.terminalLabelIds(entries);
    assert(!terminals.has('shallow')&&!terminals.has('wrapper'));
    assert(terminals.has('middle')&&terminals.has('indirect')&&terminals.has('astronaut'));
    assert.equal(v.labelDisclosure('moon',9,'middle',v.detail(9),true),1);
    assert.equal(v.labelDisclosure('planet',9,'shallow',v.detail(9),false),0);
});

test('create/delete/reparent/duplicate and normalized imported maps refresh disposable terminal metadata',()=>{
    const v=load(),entries=chain(v,2);
    entries.set('other',{id:'other',role:'planet',parentId:'sun'});
    assert(v.terminalLabelIds(entries).has('planet'));
    entries.set('child',{id:'child',role:'moon',parentId:'planet'});
    assert(!v.terminalLabelIds(entries).has('planet'));
    entries.get('child').parentId='other';
    assert(v.terminalLabelIds(entries).has('planet')&&!v.terminalLabelIds(entries).has('other'));
    entries.delete('child');assert(v.terminalLabelIds(entries).has('other'));
    const imported=new Map(JSON.parse(JSON.stringify([...entries])));
    imported.set('copy',{...imported.get('planet'),id:'copy'});
    assert.deepEqual([...v.terminalLabelIds(imported)].sort(),['copy','other','planet']);
    assert.deepEqual([...v.terminalLabelIds(new Map())],[]);
});

test('very deep same-role branches are iterative and never mutate canonical records',()=>{
    const v=load(),entries=chain(v,5);
    for(let i=0;i<10000;i++)entries.set('d'+i,{id:'d'+i,role:'astronaut',parentId:i?'d'+(i-1):'astronaut'});
    const before=JSON.stringify([...entries]);
    const result=v.terminalLabelIds(entries);
    assert.equal(result.size,10001);assert(!result.has('satellite'));
    assert.equal(JSON.stringify([...entries]),before);
});
