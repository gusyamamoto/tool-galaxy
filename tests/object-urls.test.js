const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const active=new Map(),revoked=[],timers=new Map(),listeners=new Map();let serial=0,timerId=0;
 const URL={createObjectURL(blob){const url='blob:test-'+ ++serial;active.set(url,blob);return url;},revokeObjectURL(url){assert.ok(active.has(url),'URL revoked exactly once');active.delete(url);revoked.push(url);}};
 const context=vm.createContext({URL,Blob,console,clearTimeout:id=>timers.delete(id),clearInterval:id=>timers.delete(id),
  setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},setInterval:fn=>{const id=++timerId;timers.set(id,fn);return id;},
  addEventListener:(event,fn)=>listeners.set(event,fn)});
 const load=file=>vm.runInContext(fs.readFileSync(file,'utf8'),context),get=name=>vm.runInContext(name,context);
 return {context,active,revoked,timers,listeners,load,get,flush(){const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());}};
}
function image(){return {isConnected:true,remove(){this.removed=true;},removeAttribute(key){delete this[key];}};}

test('download URL remains valid during click, then expires once with its anchor removed',()=>{
 const f=fixture(),owner=new Map();let anchor;
 f.context.document={createElement(){return anchor={click(){assert.ok(f.active.has(this.href));},remove(){this.removed=true;}};},body:{append(){}}};
 f.load('object-urls.js');f.get('cosmifoldObjectUrls').download(new Blob(['original']),'original.txt',owner);
 assert.equal(f.active.size,1);assert.equal(owner.size,1);assert.ok(anchor.removed);
 f.flush();assert.equal(f.active.size,0);assert.equal(owner.size,0);f.listeners.get('pagehide')();assert.equal(f.revoked.length,1);
});
for(const failure of ['create','append','click'])test('failed download '+failure+' releases the allocated URL and timer',()=>{
 const f=fixture(),owner=new Map();
 f.context.document={createElement(){if(failure==='create')throw Error('create');return {click(){if(failure==='click')throw Error('click');},remove(){}};},body:{append(){if(failure==='append')throw Error('append');}}};
 f.load('object-urls.js');assert.throws(()=>f.get('cosmifoldObjectUrls').download(new Blob(['bytes']),'copy.txt',owner));
 assert.equal(f.active.size,0);assert.equal(f.timers.size,0);assert.equal(owner.size,0);
});
test('pagehide releases downloads owned by different surfaces without duplicate revocation',()=>{
 const f=fixture();f.context.document={createElement:()=>({click(){},remove(){}}),body:{append(){}}};f.load('object-urls.js');
 const owners=[new Map(),new Map()];owners.forEach(owner=>f.get('cosmifoldObjectUrls').download(new Blob(['bytes']),'copy',owner));
 f.listeners.get('pagehide')();assert.equal(f.active.size,0);assert.equal(f.timers.size,0);assert.ok(owners.every(owner=>owner.size===0));f.flush();
});

function inspectorFixture(){
 const f=fixture();let img;
 f.context.document={createElement(){return img=image();}};f.context.galaxyModel={filePolicy:{classify:()=>({kind:'image'})}};
 f.load('rich-content.js');const prototype=f.get('EntryContentInspector.prototype');
 const inspector=Object.assign(Object.create(prototype),{generation:1,visible:true,urls:new Set(),previewLoads:0,onLayout(){},
  store:{get:async()=>({entryId:'a',thumbnail:new Blob(['bad image'])})},previewUnavailable(){}});
 const element={isConnected:true,querySelector:()=>({querySelector:()=>null,prepend(){}})};
 return {...f,inspector,element,img:()=>img};
}
test('failed thumbnail releases its URL as soon as the image leaves the DOM',async()=>{
 const f=inspectorFixture();await f.inspector.preview({entryId:'a'},f.element,1);assert.equal(f.active.size,1);
 f.img().onerror();assert.ok(f.img().removed);assert.equal(f.img().src,undefined);assert.equal(f.active.size,0);assert.equal(f.inspector.urls.size,0);
});
for(const stale of ['generation','hidden','detached'])test('late thumbnail cannot allocate for '+stale+' surface',async()=>{
 const f=inspectorFixture();let resolve;f.inspector.store.get=()=>new Promise(done=>resolve=done);
 const pending=f.inspector.preview({entryId:'a'},f.element,1);
 if(stale==='generation')f.inspector.generation++;if(stale==='hidden')f.inspector.visible=false;if(stale==='detached')f.element.isConnected=false;
 resolve({entryId:'a',thumbnail:new Blob(['bytes'])});await pending;assert.equal(f.active.size,0);assert.equal(f.revoked.length,0);
});
test('Contents teardown detaches sources and handlers before revoking all owned thumbnails',async()=>{
 const f=inspectorFixture();await f.inspector.preview({entryId:'a'},f.element,1);
 f.inspector.root={querySelectorAll:()=>[f.img()]};f.inspector.clearPreviews();
 assert.ok(f.img().removed);assert.equal(f.img().src,undefined);assert.equal(f.img().onerror,null);assert.equal(f.active.size,0);
});

function nativeFixture(){
 const f=fixture();f.context.galaxyModel={filePolicy:{classify:()=>({kind:'text'})}};
 const tabs=[];f.context.window={open(){const tab={closed:false,location:{href:'about:blank',replace(url){this.href=url;}},close(){this.closed=true;}};tabs.push(tab);return tab;}};
 f.load('rich-content.js');const metadata={id:'file',entryId:'a',storageKey:'key'};
 const inspector=Object.assign(Object.create(f.get('EntryContentInspector.prototype')),{nativePreviews:new Map(),onAction(){},error(error){this.failure=error;},
  getEntry:()=>({content:{attachments:[metadata]}}),store:{get:async()=>({entryId:'a',blob:new Blob(['original'])})}});
 return {...f,inspector,tabs,metadata};
}
test('closing native tab while reading prevents a late unused URL',async()=>{
 const f=nativeFixture();let resolve;f.inspector.store.get=()=>new Promise(done=>resolve=done);
 const pending=f.inspector.openFile(f.metadata,null);f.tabs[0].close();resolve({entryId:'a',blob:new Blob(['bytes'])});await pending;
 assert.equal(f.active.size,0);assert.equal(f.timers.size,0);assert.equal(f.inspector.nativePreviews.size,0);
});
test('50 native tab open/close cycles retain neither URLs nor close polls',async()=>{
 const f=nativeFixture();for(let i=0;i<50;i++){await f.inspector.openFile(f.metadata,null);assert.equal(f.active.size,1);f.tabs.at(-1).close();f.flush();assert.equal(f.active.size,0);}
 assert.equal(f.inspector.nativePreviews.size,0);assert.equal(f.timers.size,0);assert.equal(f.revoked.length,50);
});
test('native navigation failure after allocation and navigation away release the tab-owned URL',async()=>{
 const f=nativeFixture();f.context.window.open=()=>{const tab={closed:false,close(){this.closed=true;},location:{replace(){throw Error('navigation failed');}}};f.tabs.push(tab);return tab;};
 await f.inspector.openFile(f.metadata,null);assert.match(f.inspector.failure.message,/navigation failed/);assert.equal(f.active.size,0);assert.equal(f.timers.size,0);
 const g=nativeFixture();await g.inspector.openFile(g.metadata,null);g.tabs[0].location.href='https://example.com/';g.flush();assert.equal(g.active.size,0);assert.equal(g.inspector.nativePreviews.size,0);
});
test('branch deletion closes its native tab and releases its URL without reading unrelated files',async()=>{
 const f=nativeFixture();await f.inspector.openFile(f.metadata,null);f.inspector.getEntry=()=>undefined;
 f.inspector.reconcilePreviews();assert.ok(f.tabs[0].closed);assert.equal(f.active.size,0);assert.equal(f.timers.size,0);assert.equal(f.inspector.nativePreviews.size,0);
});
test('native PDF owns a different URL for already-loaded bytes without another storage read',async()=>{
 const f=nativeFixture(),blob=new Blob(['%PDF-original']),viewerUrl=f.context.URL.createObjectURL(blob);
 f.inspector.store.get=()=>assert.fail('Already loaded PDF must not be reread');
 await f.inspector.openNativeFile(f.metadata,'application/pdf',blob);const nativeUrl=f.tabs[0].location.href;
 assert.notEqual(nativeUrl,viewerUrl);f.context.URL.revokeObjectURL(viewerUrl);
 assert.equal(await f.active.get(nativeUrl).text(),'%PDF-original');assert.equal(f.active.get(nativeUrl).type,'application/pdf');
 f.tabs[0].close();f.flush();assert.equal(f.active.size,0);
});

function textures(){
 const f=fixture(),live=[];
 f.context.document={querySelectorAll:()=>live,createElement(){return {getContext(){return {createImageData(w,h){return {data:new Uint8Array(w*h*4)};},putImageData(){}};},toBlob(done){done(new Blob(['texture']));}};}};
 f.load('appearance.js');return {...f,appearance:f.get('galaxyAppearance'),live};
}
test('50 unused texture URLs evict down to the explicit cache limit',async()=>{
 const f=textures(),pending=Array.from({length:50},(_,i)=>f.appearance.bakeField(i,8));f.flush();await Promise.all(pending);f.flush();
 assert.equal(f.active.size,32);assert.equal(f.revoked.length,18);assert.equal(f.appearance.textureCache.size,32);
 f.appearance.clearTextures();assert.equal(f.active.size,0);assert.equal(f.appearance.textureCache.size,0);
});
test('live CSS and animation-copy textures pin URLs until their surfaces disappear',async()=>{
 const f=textures(),pending=Array.from({length:50},(_,i)=>f.appearance.bakeField(i,8));f.flush();const values=await Promise.all(pending);
 const style={getPropertyValue:()=>values[0],removeProperty(){}};f.live.push({style,dataset:{}});f.flush();
 assert.equal(f.active.size,33);assert.ok(f.active.has(values[0].slice(5,-2)));
 f.live.length=0;f.appearance.trimTextures();assert.equal(f.active.size,32);f.appearance.clearTextures();
});
test('page teardown invalidates queued texture work before it can allocate a URL',async()=>{
 const f=textures(),pending=f.appearance.bakeField(1,8);f.appearance.clearTextures();f.flush();assert.equal(await pending,null);assert.equal(f.active.size,0);
});
test('late canvas encoding after teardown never resurrects an old texture URL',async()=>{
 const f=textures();let encode;
 f.context.document.createElement=()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8Array(w*h*4)}),putImageData(){}}),toBlob(done){encode=done;}});
 const pending=f.appearance.bakeField(1,8);f.flush();f.appearance.clearTextures();encode(new Blob(['late']));
 assert.equal(await pending,null);assert.equal(f.active.size,0);assert.equal(f.appearance.textureCache.size,0);
});
for(const broken of [false,true])test('video frame extraction releases its URL even with '+(broken?'failed native teardown':'unsupported codec'),async()=>{
 const f=fixture();let stopped=false,detached=false;
 const video={pause(){stopped=true;},removeAttribute(){detached=true;},load(){if(broken)throw Error('native API failed');}};
 Object.defineProperty(video,'src',{set(){video.onerror();}});
 f.context.document={createElement:()=>video};f.context.galaxyModel={filePolicy:{previewTypes:{}}};f.load('attachment-store.js');
 await f.get('galaxyAttachmentFiles').videoPreview({blob:new Blob(['original'])},{},'video/webm');
 assert.ok(stopped&&detached);assert.equal(f.active.size,0);assert.equal(f.timers.size,0);
});
