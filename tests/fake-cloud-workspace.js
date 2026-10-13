// Isolated deterministic scoped-cache fixtures; no network.
const {A,U,B,scope,plain,fixture,failure,deferred,setup}=require('./fake-cloud-gateway.js');
function disk(){const map=new Map(),writes=[];return {map,writes,getItem:k=>map.get(k)??null,removeItem:k=>map.delete(k),setItem(k,v){map.set(k,v);writes.push({key:k,value:v});}};}
function fakeLocks(){const held=new Set();return {async request(key,options,action){if(held.has(key))return action(null);held.add(key);try{return await action({name:key});}finally{held.delete(key);}}};}
function fakeAuth(id=A){let state={ready:true,user:id?{id}:null};const listeners=new Set();return {getState:()=>state,
 subscribe(fn){listeners.add(fn);fn(state);return ()=>listeners.delete(fn);},emit(id){state={ready:true,user:id?{id}:null};listeners.forEach(fn=>fn(state));}};}
function environment({storage=disk(),locks=fakeLocks(),auth=fakeAuth(),initial=fixture(),timeout=1000}={}){
 const s=setup(initial);Object.assign(s.get('globalThis'),{setTimeout,clearTimeout});
 s.load('persistence/cloud-cache-store.js');s.load('services/cloud-workspace.js');
 let lists=[];s.gateway.listOwnedUniverses=async()=>lists;
 const cache=s.get('createCloudCacheStore')({storage:()=>storage,locks}),manager=s.get('createCloudWorkspace')({auth,gateway:s.gateway,cache,contextId:'fixture-context',newOperationId:()=>`00000000-0000-4000-9000-${String(++counter).padStart(12,'0')}`,requestTimeoutMs:timeout});
 let counter=0;
 return {...s,storage,locks,auth,cache,manager,record:(identity=scope)=>JSON.parse(storage.getItem(cache.key(identity))),
  setList:value=>lists=value,
  reload(){return s.get('createCloudWorkspace')({auth,gateway:s.gateway,cache,contextId:'reloaded-context',newOperationId:()=>{throw Error('Recovery must not allocate an operation');},requestTimeoutMs:timeout});}};
}

module.exports={environment,disk,fakeAuth,fakeLocks};
