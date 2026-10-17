const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({});
for(const file of ['model.js','hierarchy.js','move-destination-picker.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const Index=vm.runInContext('MoveDestinationIndex',context),model=vm.runInContext('galaxyModel',context);
function fixture(){return new Map([
    ['g',{id:'g',name:'My Galaxy',parentId:null}],['food',{id:'food',name:'Food',parentId:'g'}],
    ['source',{id:'source',name:'Chicken',parentId:'food'}],['child',{id:'child',name:'Roast',parentId:'source'}],
    ['a',{id:'a',name:'Recipes',parentId:'food'}],['work',{id:'work',name:'Work',parentId:'g'}],
    ['client',{id:'client',name:'Client A',parentId:'work'}],['b',{id:'b',name:'Recipes',parentId:'client'}]
]);}
test('Move destinations use the existing validator and exclude the entire moved subtree',()=>{
    const entries=fixture(),index=new Index(entries,'source');
    assert.deepEqual([...index.entries.keys()],['g','food','a','work','client','b']);
    assert.equal(index.allowed('source'),false);assert.equal(index.allowed('child'),false);
    assert.equal(index.allowed('missing'),false);assert.equal(index.allowed(null),true);
    assert.equal(index.currentParentId,'food');assert.equal(index.path('food'),'My Galaxy › Food');
    assert.deepEqual([...index.expandedPath()],['food','g']);
    assert.equal(index.path(null),'Universe');assert.equal(entries.get('source').parentId,'food');
});
test('case-insensitive deep name search keeps duplicate identities and ancestry unambiguous',()=>{
    const index=new Index(fixture(),'source');
    assert.deepEqual(Array.from(index.search('  rEcIpEs '),e=>e.id),['a','b']);
    assert.equal(index.ancestry('a'),'My Galaxy › Food');
    assert.equal(index.ancestry('b'),'My Galaxy › Work › Client A');
    assert.equal(index.path('b'),'My Galaxy › Work › Client A › Recipes');
    assert.equal(index.search('My Galaxy › Food').length,0,'search matches names, with paths provided as context');
    assert.equal(index.search('Roast').length,0,'excluded descendants never reappear in search');
});
test('additional model restrictions are consulted rather than reimplemented by the picker',()=>{
    const entries=fixture();let calls=0;
    const index=new Index(entries,'source',(entry,data)=>{calls++;return entry.parentId==='work'?'Invalid parent type':model.validateChange(entry,data);});
    assert.equal(index.entries.has('work'),false);assert.equal(index.allowed('work'),false);
    assert.ok(calls>=entries.size);
    entries.delete('b');assert.equal(index.allowed('b'),false,'a destination removed since indexing cannot be selected');
    entries.delete('source');assert.equal(index.allowed('a'),false);
    assert.throws(()=>new Index(entries,'source'),/no longer available/);
});
test('large hierarchy searches reuse cached terms/paths without repeating validation or ancestry traversal',()=>{
    const entries=fixture();
    for(let group=0;group<100;group++){
        const parent='group-'+group;entries.set(parent,{id:parent,name:'Folder '+group,parentId:'work'});
        for(let i=0;i<40;i++){const id=parent+'-'+i;entries.set(id,{id,name:'Destination ['+group+'] '+i,parentId:parent});}
    }
    let calls=0;
    const index=new Index(entries,'source',(entry,data)=>{calls++;return model.validateChange(entry,data);}),afterOpening=calls;
    const originalAncestors=model.ancestors;model.ancestors=()=>{throw Error('Search must use its opening-time index');};
    try{
        for(let i=0;i<100;i++)assert.equal(index.search('DESTINATION ['+i+']').length,40);
        assert.equal(index.search('Folder').length,100);
        assert.equal(index.ancestry('group-99-39'),'My Galaxy › Work › Folder 99');
        assert.equal(calls,afterOpening);
    }finally{model.ancestors=originalAncestors;}
});
