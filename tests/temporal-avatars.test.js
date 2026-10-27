const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function load(){
    const make=tag=>({tag,className:'',dataset:{},attributes:{},children:[],properties:{},style:{setProperty(key,value){this[key]=String(value);}},setAttribute(key,value){this.attributes[key]=value;},append(...nodes){this.children.push(...nodes);}});
    const context=vm.createContext({document:{createElement:make}});
    for(const file of ['appearance.js','temporal-avatars.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
    return {avatar:vm.runInContext('cosmosTemporalAvatars',context),appearance:vm.runInContext('galaxyAppearance',context)};
}
test('Task miniatures inherit their immediate canonical Task List, never a semantic Task icon',()=>{
    const {avatar}=load(),list={id:'list',role:'planet',taskList:true,appearance:{archetype:'ringed',palette:'amber'}},task={id:'task',role:'moon',parentId:'list'},map=new Map([['list',list],['task',task]]);
    const before=JSON.stringify([...map]);assert.equal(avatar.source(map,'task'),list);
    const host=avatar.render(map,'task');assert.equal(host.dataset.sourceId,'list');assert.equal(host.dataset.body,'planet');assert.equal(host.dataset.archetype,'ringed');assert.equal(host.dataset.rings,'true');
    assert.equal(host.children[0].children[0].className,'temporal-rings');assert.equal(JSON.stringify([...map]),before);
});
test('normal dated Items and Galaxies retain their own source identity',()=>{
    const {avatar}=load(),map=new Map([['g',{id:'g',role:'galaxy'}],['item',{id:'item',role:'satellite',parentId:'g'}]]);
    assert.equal(avatar.source(map,'item'),map.get('item'));assert.equal(avatar.render(map,'item').dataset.sourceId,'item');
    assert.match(avatar.render(map,'g').style['--temporal-cloud'],/^url\("data:image\/svg\+xml,/);
    assert.equal(avatar.render(map,'missing').children.length,0);
});
test('all existing body types use production resolve/overrides and static native paint',()=>{
    const {avatar,appearance}=load();
    for(const role of Object.keys(appearance.archetypes))for(const archetype of appearance.archetypes[role]){
        const entry={id:`${role}-${archetype}`,role,appearance:{archetype,palette:'teal',rings:role==='planet'}},map=new Map([[entry.id,entry]]),style=appearance.resolve(entry),host=avatar.render(map,entry.id);
        assert.equal(host.dataset.archetype,style.archetype);assert.equal(host.style['--temporal-hue'],String(style.hue));assert.equal(host.attributes['aria-hidden'],'true');
        if(['astronaut','satellite'].includes(role)){assert.match(host.innerHTML,/<svg/);assert.doesNotMatch(host.innerHTML,/<animate|<canvas|<script/);}
        else if(role!=='galaxy')assert.equal(host.children[0].className,'temporal-body');
    }
});
test('static avatar rendering never calls live rendering, animation or texture baking',()=>{
    const {avatar,appearance}=load();
    for(const method of ['bakeField','prepareTextures','prepareCloud','queueTextureTrim'])appearance[method]=()=>assert.fail(`Live method called: ${method}`);
    for(const role of ['galaxy','sun','planet','moon','satellite','astronaut'])avatar.render(new Map([['id',{id:'id',role}]]),'id');
});
