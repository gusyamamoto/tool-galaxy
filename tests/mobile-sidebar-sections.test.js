const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {test}=require('node:test');

function fixture(matches=true) {
    const document={activeElement:null},context=vm.createContext({document});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','hierarchy.js'),'utf8'),context);
    const Section=vm.runInContext('NavigationSection',context),Group=vm.runInContext('MobileSidebarSections',context);
    const saved={universeCollapsed:false,tasksCollapsed:true,constellationsCollapsed:false},writes=[];
    const preferences={load:()=>({...saved}),update:patch=>{writes.push(patch);Object.assign(saved,patch);}};
    const query={matches,addEventListener(){}};
    const sections=['universe','tasks','constellations'].map(name=>{
        const classes=new Set(),attributes=new Map();
        const root={classList:{toggle:(key,value)=>value?classes.add(key):classes.delete(key),contains:key=>classes.has(key)}};
        const toggle={setAttribute:(key,value)=>attributes.set(key,value),getAttribute:key=>attributes.get(key),
            addEventListener:(name,callback)=>toggle[name]=callback,focus:()=>document.activeElement=toggle};
        const list={scrollTop:17,scrollLeft:0,contains:element=>!!element&&element===list.child};
        return new Section({root,toggle,list,name,key:name+'Collapsed',preferences});
    });
    const group=new Group(query,sections,()=>{});
    const open=()=>sections.filter(s=>!s.list.hidden);
    return {document,sections,group,query,saved,writes,open};
}

test('mobile disclosure toggles each open section closed and permits zero sections',()=>{
    const f=fixture();
    for(const section of f.sections) {
        f.group.select(section);section.toggle.click();
        assert.equal(f.group.selected,null);assert.equal(f.open().length,0);
        assert.equal(section.toggle.getAttribute('aria-expanded'),'false');
        assert.ok(section.root.classList.contains('section-collapsed'));
        section.toggle.click();assert.deepEqual(f.open(),[section]);
        assert.equal(section.toggle.getAttribute('aria-expanded'),'true');
    }
    assert.equal(f.writes.length,0,'transient mobile disclosure never writes desktop preferences');
});

test('switching mobile sections is exclusive; programmatic reveal remains idempotent',()=>{
    const f=fixture();
    for(const section of f.sections) {
        f.group.select(null);section.toggle.click();assert.deepEqual(f.open(),[section]);
        f.group.select(section);assert.deepEqual(f.open(),[section]);
        const next=f.sections[(f.sections.indexOf(section)+1)%3];
        next.toggle.click();assert.deepEqual(f.open(),[next]);
    }
});

test('desktop sections remain independent and return unchanged after an all-closed mobile state',()=>{
    const f=fixture(false),[universe,tasks,constellations]=f.sections;
    tasks.toggle.click();assert.deepEqual(f.open(),[universe,tasks,constellations]);
    const before=JSON.stringify(f.saved),writes=f.writes.length;
    f.query.matches=true;f.group.select(tasks);tasks.toggle.click();assert.equal(f.open().length,0);
    f.query.matches=false;f.group.apply();assert.deepEqual(f.open(),[universe,tasks,constellations]);
    assert.equal(JSON.stringify(f.saved),before);assert.equal(f.writes.length,writes);
    universe.toggle.click();assert.deepEqual(f.open(),[tasks,constellations]);
});

test('collapsing a mobile section returns focus from hidden content to its disclosure',()=>{
    const f=fixture(),section=f.sections[0];
    section.list.child={};f.document.activeElement=section.list.child;
    section.toggle.click();
    assert.equal(f.document.activeElement,section.toggle);assert.equal(f.open().length,0);
    assert.equal(section.list.scrollTop,17,'nested scrolling is retained');
});
