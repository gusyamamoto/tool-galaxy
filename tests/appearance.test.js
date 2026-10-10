const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), path=require('node:path');
const {test}=require('node:test');
function load(globals={}){const c=vm.createContext(globals); vm.runInContext(fs.readFileSync(path.join(__dirname,'../appearance.js'),'utf8'),c);return vm.runInContext('galaxyAppearance',c);}
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

function surfaceHarness(extra={}){
    const queue=[],images=[],revoked=[],craters=[];
    let urls=0;
    const globals={window:{devicePixelRatio:2},requestIdleCallback:fn=>queue.push(fn),URL:{createObjectURL:()=>`blob:surface-${++urls}`,revokeObjectURL:url=>revoked.push(url)},document:{createElement:()=>({
        getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}),putImageData:image=>images.push(image),
            createRadialGradient:()=>({addColorStop:()=>{}}),fillRect:(...bounds)=>craters.push(bounds)}),
        toBlob:fn=>fn({})
    })}};
    const appearance=load({...globals,...extra});
    const flush=async()=>{while(queue.length)queue.shift()();await Promise.resolve();};
    const node=(role='planet',archetype='oceanic')=>({isConnected:true,dataset:{entryId:'close-surface',body:role,archetype},style:{getPropertyValue:()=>205,setProperty:(name,value)=>{}}});
    return {appearance,queue,images,revoked,craters,flush,node};
}

test('cache eviction cannot revoke a surface still displayed by a connected body',async()=>{
    const h=surfaceHarness(),node=h.node(),properties=new Map();node.style.setProperty=(name,value)=>properties.set(name,value);
    const first=h.appearance.prepareCloseDetail(node,160,{focused:true,pixelRatio:1});await h.flush();await first;
    const shown=properties.get('--body-map').split('"')[1];
    for(let seed=0;seed<9;seed++){const next=h.appearance.bakeBody(seed,32,'rocky',218,'planet');await h.flush();await next;}
    assert.equal(h.revoked.includes(shown),false,'the current body must retain a usable image after LRU eviction');
    h.appearance.releaseNodePaint(node);assert.equal(h.revoked.includes(shown),true,'deleted bodies release evicted raster bytes');
});

test('a resolution replacement is decoded before it atomically replaces the previous valid surface',async()=>{
    const decodes=[],h=surfaceHarness({Image:class {decode(){return new Promise(resolve=>decodes.push(resolve));}}});
    const node=h.node(),properties=new Map();node.renderDiameter=44;node.style.setProperty=(name,value)=>properties.set(name,value);
    const normal=h.appearance.prepareTextures(node,44,1);await h.flush();
    assert.equal(node.dataset.bodyPaint,undefined);decodes.shift()();await h.flush();await normal;
    const old=properties.get('--body-map');assert.ok(old);
    node.renderDiameter=430;const close=h.appearance.prepareCloseDetail(node,430,{focused:true,pixelRatio:1});await h.flush();
    assert.equal(properties.get('--body-map'),old,'old pixels remain while new pixels decode');
    assert.equal(node.dataset.bodyPaint,'true');decodes.shift()();await h.flush();await close;
    assert.notEqual(properties.get('--body-map'),old);assert.equal(node.bodyPaintPixels,512);
});

test('a genuine role change releases sphere paint and cancels a late raster replacement',async()=>{
    const decodes=[],h=surfaceHarness({Image:class {decode(){return new Promise(resolve=>decodes.push(resolve));}}});
    const node=h.node(),properties=new Map();node.style.setProperty=(name,value)=>properties.set(name,value);node.style.removeProperty=name=>properties.delete(name);
    const normal=h.appearance.prepareTextures(node,44,1);await h.flush();decodes.shift()();await h.flush();await normal;
    assert.equal(node.dataset.bodyPaint,'true');
    const close=h.appearance.prepareCloseDetail(node,430,{focused:true,pixelRatio:1});await h.flush();
    node.dataset.body='satellite';h.appearance.releaseNodePaint(node);
    decodes.shift()();await h.flush();await close;
    assert.equal(node.dataset.bodyPaint,undefined);assert.equal(properties.has('--body-map'),false);
    assert.equal(node.bodyPaintResource,null);assert.equal(node.bodyPreviewResource,null);
    assert.equal(node.textureKey,null);assert.equal(node.closeDetailKey,null);
    assert.equal(h.appearance.rasterResources.size,h.appearance.bodyTextureCache.size,'cancelled close raster is released; only the bounded resident preview remains');
});

test('parent and close views call one identity recipe; only resolution/cache may differ',async()=>{
    const a=load(),calls=[],style={getPropertyValue:()=>212,setProperty(){}};
    a.bakeBody=(seed,size,material,hue,role)=>{calls.push({seed,size,material,hue,role});return Promise.resolve('url("blob:identity")');};
    const node={isConnected:true,dataset:{entryId:'stable-blue-planet',body:'planet',archetype:'oceanic'},style};
    a.prepareTextures(node,44,1);await Promise.resolve();
    await a.prepareCloseDetail(node,430,{focused:true,pixelRatio:1});
    const {size:small,...parent}=calls[0],{size:large,...close}=calls[1];
    assert.deepEqual(parent,close);assert.ok(large>small);
    assert.deepEqual(a.bodyPalette('oceanic',212,'planet'),a.bodyPalette('oceanic',212,'planet'));
    assert.notDeepEqual(a.bodyPalette('gas-giant',212,'planet'),a.bodyPalette('gas-giant',29,'planet'),'palette overrides genuinely tint the same canonical material');
});

test('idle identity paint installs the latest body scale without needing another camera frame',async()=>{
    const h=surfaceHarness(),node=h.node(),properties=new Map();
    node.style.setProperty=(name,value)=>properties.set(name,value);
    node.renderDiameter=44;
    h.appearance.prepareTextures(node,44,1);
    node.renderDiameter=52;
    await h.flush();
    assert.equal(properties.get('--identity-pixels'),'64px');
    assert.equal(properties.get('--identity-scale'),52/64);
    const close=h.appearance.prepareCloseDetail(node,430,{focused:true,pixelRatio:1});
    node.renderDiameter=480;
    await h.flush();await close;
    assert.equal(properties.get('--identity-pixels'),'512px');
    assert.equal(properties.get('--identity-scale'),480/512);
});

test('small-body paint cancels when its preview becomes hidden and retries on reveal',async()=>{
    const h=surfaceHarness(),node=h.node();
    h.appearance.prepareTextures(node,44,1);
    node.dataset.semanticHidden='true';
    await h.flush();
    assert.equal(h.images.length,0);assert.equal(h.appearance.bodyTextureCache.size,0);
    node.dataset.semanticHidden='false';
    h.appearance.prepareTextures(node,44,1);
    await h.flush();
    assert.equal(h.images.length,1);assert.equal(node.dataset.bodyPaint,'true');
});

test('higher resolution preserves the major surface and crater positions rather than rerolling them',async()=>{
    for(const [material,role] of [['oceanic','planet'],['gas-giant','planet'],['icy','moon']]) {
        const small=surfaceHarness(),large=surfaceHarness();
        const low=small.appearance.bakeBody(711,64,material,212,role),high=large.appearance.bakeBody(711,128,material,212,role);
        await small.flush();await large.flush();await low;await high;
        let difference=0,samples=0;
        for(let y=8;y<56;y+=4)for(let x=8;x<56;x+=4){
            if((x-32)**2+(y-32)**2>22**2)continue;
            for(let c=0;c<3;c++){
                const a=small.images[0].data[(y*64+x)*4+c];
                let b=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)b+=large.images[0].data[((y*2+dy)*128+x*2+dx)*4+c]/4;
                difference+=Math.abs(a-b);samples++;
            }
        }
        assert.ok(difference/samples<15,`${material} should retain its coarse visible pattern`);
        assert.deepEqual(small.craters.map(bounds=>bounds.map(n=>n/64)),large.craters.map(bounds=>bounds.map(n=>n/128)));
    }
});

test('close detail is opt-in, sphere-only, and does no far-view or transition-threshold raster work',async()=>{
    const h=surfaceHarness();
    for(const role of ['galaxy','sun','planet','moon','satellite','astronaut']) {
        const node=h.node(role);
        h.appearance.prepareCloseDetail(node,300);
        h.appearance.prepareCloseDetail(node,40,{focused:true});
        h.appearance.prepareCloseDetail(node,300,{focused:true,progress:.1});
        if(!['sun','planet','moon'].includes(role))h.appearance.prepareCloseDetail(node,300,{focused:true});
    }
    assert.equal(h.queue.length,0);assert.equal(h.images.length,0);assert.equal(h.appearance.closeTextureCache.size,0);
});

test('focused sphere resolution follows screen diameter and stays bounded on high-DPI/large viewports',()=>{
    const a=load();
    assert.equal(a.closeResolution(160,1),256);
    assert.equal(a.closeResolution(300,1),512);
    assert.equal(a.closeResolution(400,2),768);
    assert.equal(a.closeResolution(2000,4),768);
});

test('caller-provided viewport ratio avoids hot window reads while default retina sizing remains compatible',async()=>{
    let reads=0,closeSize,fieldSize;
    const screen=Object.defineProperty({},'devicePixelRatio',{get(){reads++;return 3;}});
    const a=load({window:screen}),node=()=>({isConnected:true,dataset:{entryId:'viewport-ratio',body:'planet',archetype:'rocky'},
        style:{getPropertyValue:()=>205,setProperty(){}}});
    a.bakeBody=(_,size,material,hue,role,isCurrent,cache)=>{if(cache===a.bodyTextureCache)fieldSize=size;else closeSize=size;return Promise.resolve('url("blob:close")');};
    a.bakeField=(_,size)=>{fieldSize=size;return Promise.resolve('url("blob:field")');};
    const close=node(),field=node();
    await a.prepareCloseDetail(close,400,{focused:true,pixelRatio:1});
    a.prepareTextures(field,100,1);await Promise.resolve();
    assert.equal(reads,0);assert.equal(closeSize,512);assert.equal(fieldSize,128);
    await a.prepareCloseDetail(close,400,{focused:true});
    a.prepareTextures(field,100);await Promise.resolve();
    assert.equal(reads,2);assert.equal(closeSize,768);assert.equal(fieldSize,256);
});

test('close bodies preserve deterministic material, sphere silhouette and directional depth',async()=>{
    const results=[];
    for(const [material,role] of [['warm','sun'],['rocky','planet'],['oceanic','planet'],['icy','planet'],['desert','planet'],['gas-giant','planet'],['rocky','moon']]) {
        const h=surfaceHarness(),a=h.appearance;
        const result=a.bakeBody(517,64,material,205,role);await h.flush();assert.match(await result,/^url\("blob:/);
        const image=h.images[0],pixel=(x,y)=>[...image.data.slice((y*64+x)*4,(y*64+x)*4+4)];
        assert.equal(pixel(0,0)[3],0);assert.equal(pixel(32,32)[3],255);
        assert.ok(pixel(18,18).slice(0,3).reduce((sum,v)=>sum+v,0)>pixel(46,46).slice(0,3).reduce((sum,v)=>sum+v,0));
        assert.equal(h.craters.length,role==='moon'?8:0);
        const repeat=surfaceHarness(),again=repeat.appearance.bakeBody(517,64,material,205,role);await repeat.flush();await again;
        assert.deepEqual(image.data,repeat.images[0].data);
        results.push(Buffer.from(image.data).toString('base64'));
    }
    assert.equal(new Set(results).size,results.length);
});

test('focus paint is scheduled once per resolution, does not mutate appearance metadata, and releases opt-in on exit',async()=>{
    const h=surfaceHarness(),node=h.node();
    const before=JSON.stringify(node.dataset),pending=h.appearance.prepareCloseDetail(node,160,{focused:true,progress:1});
    h.appearance.prepareCloseDetail(node,160,{focused:true});assert.equal(h.queue.length,2,'one retained preview and one close resolution');
    assert.equal(node.dataset.closeDetail,'pending');await h.flush();await pending;
    assert.equal(node.dataset.closeDetail,'true');assert.equal(node.dataset.closeResolution,'256');assert.equal(h.images.length,2);
    h.appearance.prepareCloseDetail(node,160,{focused:true});assert.equal(h.queue.length,0);
    h.appearance.prepareCloseDetail(node,160,{focused:true,progress:.22});assert.equal(node.dataset.closeDetail,'true');
    h.appearance.prepareCloseDetail(node,160,{focused:false});
    const {bodyPaint,...identity}=node.dataset;
    assert.equal(JSON.stringify(identity),before);assert.equal(bodyPaint,'true','the same identity paint remains after leaving focus');
});

test('rapid navigation cancels obsolete close paint before generation and ignores disconnected nodes',async()=>{
    const h=surfaceHarness(),node=h.node();
    const pending=h.appearance.prepareCloseDetail(node,160,{focused:true});
    h.appearance.prepareCloseDetail(node,160,{focused:false});await h.flush();await pending;
    assert.equal(h.images.filter(image=>image.width>64).length,0);assert.equal(h.appearance.closeTextureCache.size,0);assert.equal(node.dataset.closeDetail,undefined);
    const next=h.appearance.prepareCloseDetail(node,160,{focused:true});node.isConnected=false;await h.flush();await next;
    assert.equal(h.images.filter(image=>image.width>64).length,0);assert.equal(h.appearance.closeTextureCache.size,0);
});

test('surface batches yield and can be cancelled midway through a focus transition',async()=>{
    const h=surfaceHarness(),node=h.node();
    const preview=h.appearance.preparePreview(node,44);await h.flush();await preview;
    const pending=h.appearance.prepareCloseDetail(node,300,{focused:true});
    h.queue.shift()();assert.equal(h.queue.length,1);assert.equal(h.images.filter(image=>image.width>64).length,0);
    h.appearance.prepareCloseDetail(node,300,{focused:false});await h.flush();await pending;
    assert.equal(h.images.filter(image=>image.width>64).length,0);assert.equal(h.appearance.closeTextureCache.size,0);
});

test('resolution upgrades keep current close paint visible while the next surface is pending',async()=>{
    const h=surfaceHarness(),node=h.node();
    const first=h.appearance.prepareCloseDetail(node,160,{focused:true});await h.flush();await first;
    const larger=h.appearance.prepareCloseDetail(node,400,{focused:true});
    assert.equal(node.dataset.closeDetail,'true');assert.equal(node.dataset.closeResolution,'768');
    await h.flush();await larger;assert.equal(node.dataset.closeDetail,'true');assert.equal(h.images.length,3);
});

test('close presentation cache reuses paint and revokes resources beyond six worlds',async()=>{
    const h=surfaceHarness(),a=h.appearance;
    for(let seed=0;seed<9;seed++){const result=a.bakeBody(seed,32,'rocky',218,'planet');await h.flush();await result;}
    assert.equal(a.closeTextureCache.size,6);assert.equal(h.revoked.length,3);assert.equal(h.images.length,9);
    const cached=a.bakeBody(8,32,'rocky',218,'planet');await h.flush();await cached;
    assert.equal(h.images.length,9);
});

test('canvas failure leaves existing sphere paint as fallback and permits retry',async()=>{
    const h=surfaceHarness(),node=h.node();
    const original=h.appearance.bakeBody;
    h.appearance.bakeBody=()=>Promise.resolve(null);
    await h.appearance.prepareCloseDetail(node,160,{focused:true});
    assert.equal(node.dataset.closeDetail,undefined);assert.equal(node.closeDetailKey,null);
    h.appearance.bakeBody=original;
    const retry=h.appearance.prepareCloseDetail(node,160,{focused:true});await h.flush();await retry;
    assert.equal(node.dataset.closeDetail,'true');
});
