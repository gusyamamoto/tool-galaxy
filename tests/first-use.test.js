const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(saved={}){
    const timers=new Map(),elements=new Map();let nextTimer=0;
    const element=()=>({hidden:true,textContent:'',listeners:{},classList:{toggle(){}},addEventListener(type,fn){this.listeners[type]=fn;},
        querySelector(selector){return this.children[selector] ||= element();},children:{},contains(){return false;},focus(){this.focused=true;}});
    const root=element(),hint=element(),writes=[];
    const ctx=vm.createContext({document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);}},
        setTimeout(fn){const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}});
    for(const file of ['model.js','cosmos-view.js','label-density.js','first-use.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx);
    // Controller tests use a disposable preview stand-in; real lifecycle is browser-tested.
    vm.runInContext('FirstUsePreview=class {constructor(){this.destroyed=false;}destroy(){this.destroyed=true;}}',ctx);
    const Controller=vm.runInContext('FirstUseOnboarding',ctx),camera=vm.runInContext('firstUseCamera',ctx),scene=vm.runInContext('firstUseScene',ctx);
    let created=0,help=0;
    const controller=new Controller({root,hint,preferences:{load:()=>saved,update:patch=>{writes.push(patch);return Promise.resolve();}},
        create:()=>created++,help:()=>help++});
    return {controller,root,hint,writes,timers,camera,scene,frame:vm.runInContext('firstUseFrame',ctx),view:vm.runInContext('cosmosView',ctx),
        terminals:vm.runInContext('firstUseTerminalIds',ctx),model:vm.runInContext('galaxyModel',ctx),labels:vm.runInContext('firstUseLabelCandidates',ctx),cosmic:vm.runInContext('firstUseCosmicVisibility',ctx),Density:vm.runInContext('LabelDensity',ctx),get created(){return created;},get help(){return help;}};
}
// Locate flowing semantic landmarks by actual camera scale, never fixed holds.
function outwardTime(camera,scale,compact){
    let start=10500,end=19750;
    for(let i=0;i<55;i++){const middle=(start+end)/2;if(camera(middle,compact).scale>scale)start=middle;else end=middle;}
    return (start+end)/2;
}

test('welcome is driven by real emptiness independently of legacy or completed hint preferences',()=>{
    for(const saved of [{},{firstItemCreated:true},{firstUseHints:{phase:'done'}}]){
        const s=setup(saved);s.controller.sync({empty:true,available:true,entries:new Map()});assert.equal(s.root.hidden,false);
        const preview=s.controller.preview;
        s.controller.sync({empty:false,available:true,entries:new Map([['real',{}]])});
        assert.equal(s.root.hidden,true);assert.equal(s.controller.preview,null);assert.equal(preview.destroyed,true);
        s.controller.sync({empty:true,available:true,entries:new Map()});assert.equal(s.root.hidden,false);
        s.controller.sync({empty:true,available:false,entries:new Map()});assert.equal(s.root.hidden,true);
        assert.equal(s.writes.length,0,'mounting welcome writes no preferences or data');
    }
});
test('primary and Help controls delegate to their existing flows',()=>{
    const s=setup();s.root.querySelector('#first-use-create').listeners.click();s.root.querySelector('#first-use-help').listeners.click();
    assert.equal(s.created,1);assert.equal(s.help,1);
});
test('immutable multi-Galaxy forest preserves Japan Trip through every production depth',()=>{
    const {scene,model}=setup();assert.equal(scene.length,117);assert.equal(scene.filter(item=>!item.parentId).length,30);
    const normalized=new Map(scene.map(entry=>[entry.id,{...entry}]));model.normalizeHierarchy(normalized);
    for(const entry of scene){assert.equal(entry.depth,normalized.get(entry.id).depth);assert.equal(entry.role,normalized.get(entry.id).role);}
    assert.equal(Math.max(...scene.map(item=>item.depth)),5);
    for(const name of ['Japan Trip','Tokyo','Stay','Hotel','Reservation','Check-in','Airbnb','Kyoto','Osaka'])assert.ok(scene.some(item=>item.name===name),name);
    for(const name of ['Travel','Recipes','Home','Learning','Projects','Ideas'])assert.ok(scene.some(item=>item.name===name&&item.depth===0&&item.role==='galaxy'));
    for(const [id,role,depth,parent] of [['travel','galaxy',0,null],['japan','sun',1,'travel'],['tokyo','planet',2,'japan'],['stay','moon',3,'tokyo'],['hotel','satellite',4,'stay'],['reservation','astronaut',5,'hotel']]){
        const item=scene.find(entry=>entry.id==='onboarding-demo-'+id);assert.equal(item.role,role);assert.equal(item.depth,depth);
        assert.equal(item.parentId,parent?'onboarding-demo-'+parent:null);
    }
    assert.ok(Object.isFrozen(scene));assert.ok(scene.every(item=>Object.isFrozen(item)&&item.id.startsWith('onboarding-demo-')));
    assert.ok(scene.every(item=>!item.parentId||scene.some(parent=>parent.id===item.parentId)));
});
test('24.5-second desktop/mobile paths follow depth, breadth and a seamless approach',()=>{
    const {camera}=setup();for(const narrow of [false,true]){
        assert.deepEqual(camera(0,narrow),camera(24500,narrow));
        assert.equal(camera(5000,narrow).focusId,'onboarding-demo-tokyo');
        assert.equal(camera(7000,narrow).focusId,'onboarding-demo-stay');
        assert.equal(camera(9500,narrow).focusId,'onboarding-demo-hotel');
        assert.ok(camera(9000,narrow).scale>=8);assert.deepEqual(camera(9000,narrow),camera(10000,narrow));
        assert.deepEqual(camera(4700,narrow),camera(5300,narrow));
        assert.deepEqual(camera(7000,narrow),camera(7600,narrow));
        assert.ok(camera(11400,narrow).scale<camera(10500,narrow).scale);
        assert.notEqual(camera(0,narrow).x,camera(5500,narrow).x);
        for(const key of ['x','y','scale'])assert.ok(Math.abs(camera(24499,narrow)[key]-camera(0,narrow)[key])<.000001);
    }
    assert.notDeepEqual(camera(5500,true),camera(5500,false),'phone camera is its own family framing');
});
test('every stage uses production caps, semantic disclosure and true terminal eligibility',()=>{
    const {frame,view,terminals}=setup();
    for(const size of [[324,256],[354,270],[394,298],[600,460],[650,260]])for(const time of [0,4000,5500,7000,8500,10000,12000,14000,14800,15800,18000,20500,21500,23500,24999]){
        const f=frame(...size,time);
        for(const body of f.bodies){
            const {entry}=body,s=f.view.scale,ordinary=view.labelDisclosure(entry.role,s,entry.id,f.detail,terminals.has(entry.id));
            assert.equal(body.diameter,entry.depth===0?view.galaxyDiameter(s):view.renderedDiameter(entry.role,26*({sun:2,planet:1.1,moon:.52,satellite:.38,astronaut:.28}[entry.role]),s,f.detail[entry.role]));
            assert.ok(body.diameter<=view.renderCap(entry.role,s));
            assert.equal(body.labelOpacity,ordinary+(1-ordinary)*body.context.reveal);
            assert.equal(body.hidden,entry.depth>0&&f.detail[entry.role]<.02);
        }
    }
    assert.ok(!terminals.has('onboarding-demo-hotel'));assert.ok(terminals.has('onboarding-demo-airbnb'));assert.ok(terminals.has('onboarding-demo-reservation'));
});
test('native body sizes saturate while deeper label bands emerge and ancestors yield',()=>{
    const {frame}=setup(),at=(time,id)=>frame(354,270,time).bodies.find(b=>b.entry.id==='onboarding-demo-'+id);
    assert.equal(at(0,'reservation').labelOpacity,0);assert.equal(at(0,'hotel').labelOpacity,0);
    assert.ok(at(5000,'stay').labelOpacity>.6);assert.ok(at(5000,'japan').labelOpacity>.6,'immediate parent remains contextually eligible');
    assert.ok(at(7350,'hotel').labelOpacity>.8);assert.ok(at(9750,'stay').labelOpacity>.6);
    assert.equal(at(9750,'japan').labelOpacity,0);assert.equal(at(9750,'tokyo').labelOpacity,0);
    assert.equal(at(9500,'reservation').labelOpacity,1);assert.equal(at(9500,'check-in').labelOpacity,1);
    assert.ok(at(9500,'reservation').diameter>=13);assert.ok(at(9500,'hotel').diameter>=24);
    assert.equal(at(9500,'tokyo').diameter,32,'Planet stays capped, not enlarged like a bitmap');
    const zoomRatio=frame(354,270,9500).view.scale/frame(354,270,0).view.scale;
    assert.ok(at(9500,'tokyo').diameter/at(0,'tokyo').diameter<zoomRatio/2);
});
test('compact focus stages and static middle depth keep the meaningful hierarchy in frame',()=>{
    const {frame}=setup();
    for(const [width,height] of [[322,254],[352,268],[392,296]]){
        for(const [time,ids] of [[0,['japan','tokyo','kyoto','osaka']],[5000,['japan','tokyo','stay','tokyo-food','tokyo-places']],
            [7350,['tokyo','stay','hotel','airbnb']],[9750,['stay','hotel','reservation','check-in']]]){
            const f=frame(width,height,time);for(const id of ids){const b=f.bodies.find(b=>b.entry.id==='onboarding-demo-'+id);
                assert.ok(b.x-b.diameter/2>=0&&b.x+b.diameter/2<=width,id+' body horizontally in frame');
                assert.ok(b.y-b.diameter/2>=0&&b.y+b.diameter/2+20<=height,id+' body and label vertically in frame');
                assert.ok(b.labelOpacity>.1,id+' label eligible');
            }
        }
        const f=frame(width,height,0,{reduced:true});assert.ok(f.view.scale>1.6);
        for(const id of ['japan','tokyo','stay','tokyo-food','tokyo-places']){
            const b=f.bodies.find(b=>b.entry.id==='onboarding-demo-'+id);assert.ok(b.labelOpacity>.6);
            assert.ok(b.x-b.diameter/2>=0&&b.x+b.diameter/2<=width&&b.y-b.diameter/2>=0&&b.y+b.diameter/2+20<=height,id+' static body and label fit');
        }
    }
});
test('parent anchors overlap continuously while focus, children and siblings retain their priority',()=>{
    const {frame}=setup(),get=(f,id)=>f.bodies.find(b=>b.entry.id==='onboarding-demo-'+id);
    for(const time of [5400,5700,6200,6800,7350]){
        const f=frame(352,268,time);
        assert.ok(get(f,'tokyo').labelOpacity>=.65);assert.ok(get(f,'tokyo').opacity>=.5);
        assert.ok(get(f,'stay').opacity>.99,'entering child remains bright through the overlap');
        assert.equal(f.relationships.find(e=>e.id==='onboarding-demo-stay').weight,1,'shared parent edge never cuts');
    }
    for(const time of [7700,8100,8500,9000,9750]){
        const f=frame(352,268,time);
        assert.ok(get(f,'stay').labelOpacity>=.65);assert.ok(get(f,'hotel').opacity>.99);
        assert.equal(f.relationships.find(e=>e.id==='onboarding-demo-hotel').weight,1);
    }
    const f=frame(352,268,9750),focus=get(f,'hotel'),child=get(f,'reservation'),parent=get(f,'stay'),sibling=get(f,'airbnb');
    assert.ok(focus.priority<child.priority&&child.priority<parent.priority&&parent.priority<sibling.priority);
    assert.equal(focus.opacity,1);assert.equal(child.opacity,1);assert.ok(parent.opacity<.55&&parent.opacity>.45);
    assert.ok(sibling.opacity<parent.opacity);assert.equal(get(f,'kyoto').labelOpacity,0);assert.equal(get(f,'osaka').labelOpacity,0);
    for(const id of ['reservation','check-in'])assert.equal(f.relationships.find(e=>e.id==='onboarding-demo-'+id).weight,1);
});
test('outward families keep native semantics without revisiting the inward camera poses',()=>{
    const {frame,camera}=setup();
    for(const inward of [5000,7350]){
        const time=outwardTime(camera,camera(inward,true).scale,true),a=frame(352,268,inward),b=frame(352,268,time);
        for(let i=0;i<a.bodies.length;i++)for(const key of ['diameter','opacity','labelOpacity'])assert.ok(Math.abs(a.bodies[i][key]-b.bodies[i][key])<1e-8,'same semantic family passes without a hold');
        assert.ok(camera(time-1,true).scale>camera(time,true).scale&&camera(time+1,true).scale<camera(time,true).scale);
        assert.equal(b.view.x,110);assert.equal(b.view.y,-53);assert.notDeepEqual([a.view.x,a.view.y],[b.view.x,b.view.y]);
    }
    const f=frame(322,254,9750),hotel=f.bodies.find(b=>b.entry.name==='Hotel'),children=f.bodies.filter(b=>b.entry.parentId===hotel.entry.id);
    const span=Math.max(...children.map(b=>b.x))-Math.min(...children.map(b=>b.x));
    assert.ok(span>140,'deep children have breathing room');
    assert.ok(hotel.x>Math.min(...children.map(b=>b.x))&&hotel.x<Math.max(...children.map(b=>b.x)));
    assert.ok(children.every(child=>child.y<hotel.y),'parent anchors the family beneath its children');
    assert.notEqual(camera(9750,true).x,118);assert.notEqual(camera(9750,true).x,100);
});

test('closer native semantic poses give all three families a substantial compact composition',()=>{
    const {frame,camera}=setup();
    for(const [time,ids,minWidth,minHeight] of [
        [5000,['tokyo','stay','tokyo-food','tokyo-places'],100,175],
        [7350,['stay','hotel','airbnb','tokyo'],120,200],
        [9750,['hotel','reservation','check-in','stay'],200,225]
    ]){
        const f=frame(322,254,time),family=f.bodies.filter(b=>ids.includes(b.entry.id.slice('onboarding-demo-'.length)));
        const width=Math.max(...family.map(b=>b.x+b.diameter/2))-Math.min(...family.map(b=>b.x-b.diameter/2));
        const height=Math.max(...family.map(b=>b.y+b.diameter/2+20))-Math.min(...family.map(b=>b.y-b.diameter/2));
        assert.ok(width>minWidth,`${time}: substantial family width`);assert.ok(height>minHeight,`${time}: substantial family height`);
    }
    assert.ok(camera(7350,true).scale>4);assert.ok(camera(9750,true).scale>8.5);
});

test('macro retreat discovers actual fixed roots progressively and hands names back to the Galaxy band',()=>{
    const {frame,view,scene,camera}=setup();
    for(const [width,height] of [[322,254],[352,268],[392,296],[600,460],[650,260]]){
        const visibleRoots=time=>frame(width,height,time).bodies.filter(b=>b.entry.depth===0&&b.x-b.diameter/2>=0&&b.x+b.diameter/2<=width&&b.y-b.diameter/2>=0&&b.y+b.diameter/2+20<=height);
        for(const time of [0,5000,7350,9750,12550])assert.equal(visibleRoots(time).length,0,'other Galaxies stay spatially outside depth scenes');
        const compact=width<440||height<320,macro=outwardTime(camera,compact?.105:.18,compact);
        const stages=[14550,14900,15200,15400,macro].sort((a,b)=>a-b),counts=stages.map(time=>visibleRoots(time).length);
        assert.ok(counts.at(-1)>=6&&counts.at(-1)<=10);assert.ok(counts.some(count=>count>0&&count<6));
        assert.ok(counts.every((count,i)=>!i||count>=counts[i-1]),'roots enter progressively');
        const f=frame(width,height,macro);
        for(const b of visibleRoots(macro)){
            assert.equal(b.diameter,view.galaxyDiameter(f.view.scale));assert.equal(b.opacity,1);
            assert.equal(b.labelOpacity,1,'production Galaxy labels take over at macro scale');
            assert.ok(b.diameter>=14,'native compact root remains a useful screen target');
            if(!['travel','recipes','home','learning','projects','ideas'].some(id=>b.entry.id==='onboarding-demo-'+id))continue;
            const label={left:b.x-(b.entry.name.length*6.5+8)/2,right:b.x+(b.entry.name.length*6.5+8)/2,
                top:b.y+b.diameter/2+5,bottom:b.y+b.diameter/2+20};
            for(const other of f.bodies.filter(other=>other.entry.id!==b.entry.id&&!other.hidden&&other.opacity>.1)){
                const overlap=Math.min(label.right,other.x+other.diameter/2)-Math.max(label.left,other.x-other.diameter/2)>0&&
                    Math.min(label.bottom,other.y+other.diameter/2)-Math.max(label.top,other.y-other.diameter/2)>0;
                assert.equal(overlap,false,`${b.entry.name} macro name clear of ${other.entry.name} artwork`);
            }
        }
        for(const b of f.bodies){
            assert.equal(b.entry,scene.find(entry=>entry.id===b.entry.id));
            assert.equal(b.x,width/2+(b.entry.x-f.view.x)*f.view.scale,'same world geography at every level');
        }
        const reference=frame(width,height,outwardTime(camera,.95,compact)).bodies.find(b=>b.entry.name==='Japan Trip');
        assert.ok(reference.labelOpacity>.95&&reference.x>0&&reference.x<width,'Japan remains the initial retreat reference');
    }
});

test('one continuous pullback reconstructs families, discovers scope and never settles at a landmark',()=>{
    const {camera,frame}=setup();
    for(const [width,height] of [[322,254],[352,268],[392,296],[650,260],[650,460]]){
        const compact=width<440||height<320,roots=time=>frame(width,height,time).bodies.filter(b=>b.entry.depth===0&&!b.culled);
        const times=[compact?.105:.18,compact?.06:.1].map(scale=>outwardTime(camera,scale,compact));
        const first=roots(times[0]),second=roots(times[1]),third=roots(19750);
        assert.ok(first.length>=6&&first.length<=10);assert.ok(second.length>first.length&&second.length<=22);assert.equal(third.length,30);
        assert.ok(first.every(b=>second.some(other=>other.entry===b.entry))&&second.every(b=>third.some(other=>other.entry===b.entry)));
        const counts=[];for(let time=10500;time<=19750;time+=50)counts.push(roots(time).length);
        assert.ok(counts.every((count,i)=>!i||count>=counts[i-1]),'territory enters continuously');
        assert.ok(roots(23000).length<30);assert.equal(roots(24499).length,0,'outer roots leave through geography');
        for(const scale of [compact?4.5:5,compact?2.2:2.65,.95,...[compact?.105:.18,compact?.06:.1]]){
            const time=outwardTime(camera,scale,compact),a=camera(time-1,compact),b=camera(time,compact),c=camera(time+1,compact);
            assert.ok(a.scale>b.scale&&b.scale>c.scale,'no Stay, Tokyo, Japan or macro return hold');
            const before=(Math.log(b.scale)-Math.log(a.scale))*1000,after=(Math.log(c.scale)-Math.log(b.scale))*1000;
            assert.ok(before<-.01&&after<-.01&&Math.abs(before-after)<.001,'matched nonzero log-zoom velocity');
            for(const key of ['x','y'])assert.ok(Math.abs((b[key]-a[key])-(c[key]-b[key]))<.001,'continuous pan at context joins');
        }
    }
    for(const compact of [true,false]){
        for(let time=10501;time<19749;time+=16)assert.ok(camera(time+1,compact).scale<camera(time,compact).scale,'every outward sample moves');
        for(let time=19751;time<24499;time+=16)assert.ok(camera(time+1,compact).scale>camera(time,compact).scale,'inward approach has no reverse holds');
        for(let time=10500;time<24500;time+=16){const a=camera(time,compact),b=camera(time+16,compact);assert.ok(Math.abs(Math.log(b.scale/a.scale))<.04);assert.ok(Math.hypot(b.x-a.x,b.y-a.y)<5);assert.ok(Math.hypot(b.x-a.x,b.y-a.y)*a.scale<8,'bounded projected pan per frame');}
    }
});

test('Hotel X stays locked through retreat; a half-unit Y adjustment finishes within 300ms',()=>{
    const {camera}=setup();
    for(const compact of [true,false]){
        const start=camera(10500,compact),locked=camera(10800,compact);
        assert.equal(locked.x,110);assert.equal(locked.y,-53);
        assert.equal(camera(10700,compact).x,locked.x,'no late horizontal recenter');
        assert.notEqual(camera(10700,compact).y,locked.y,'existing tiny vertical interpolation');
        assert.ok(locked.scale/start.scale>.99,'lock before appreciable semantic retreat');
        assert.equal(locked.x-start.x,0);assert.equal(locked.y-start.y,.5);
        let previous=start;
        for(let time=10500;time<=19750;time+=5){
            const p=camera(time,compact);
            assert.ok(p.x<=previous.x&&p.y>=previous.y,'one direction for the single recenter');
            assert.equal(p.x,start.x,'horizontal axis already locked at Hotel');
            if(time>=10800)assert.deepEqual([p.x,p.y],[locked.x,locked.y],'locked macro pullback');
            previous=p;
        }
        for(const scale of [compact?4.5:5,compact?2.2:2.65,.95,.14,.065,.03]){
            const p=camera(outwardTime(camera,scale,compact),compact);assert.deepEqual([p.x,p.y],[110,-53]);
        }
    }
});

test('Hotel family keeps one X/Y anchor throughout the deepest reveal and hold',()=>{
    const {camera,frame,labels,Density}=setup();
    for(const [width,height] of [[322,254],[352,268],[392,296],[650,460]]){
        const compact=width<440||height<320,anchor=camera(9000,compact);
        assert.deepEqual([anchor.x,anchor.y],[110,-53.5]);
        assert.ok(camera(8500,compact).scale<anchor.scale,'semantic zoom still approaches deepest depth');
        for(let time=9000;time<=10500;time+=25){
            const view=camera(time,compact),f=frame(width,height,time);
            assert.deepEqual([view.x,view.y],[anchor.x,anchor.y]);
            assert.equal(view.scale,anchor.scale,'deepest hold preserved');
            const candidates=labels(f,width,height),hidden=new Density({restoreDelay:0}).resolve(candidates,0).hidden;
            for(const id of ['hotel','reservation','check-in']){
                const body=f.bodies.find(b=>b.entry.id==='onboarding-demo-'+id);
                assert.ok(body.x-body.diameter/2>=0&&body.x+body.diameter/2<=width);
                assert.ok(body.y-body.diameter/2>=0&&body.y+body.diameter/2+20<=height);
                assert.equal(body.opacity,1);assert.ok(body.labelOpacity>.99);
                assert.ok(candidates.some(c=>c.id===body.entry.id)&&!hidden.has(body.entry.id),'native family labels stay readable');
                assert.equal(f.relationships.find(r=>r.id===body.entry.id).weight,1,'parent/child cues stay intact');
            }
        }
        const start=frame(width,height,10500).bodies.find(b=>b.entry.id==='onboarding-demo-hotel');
        const end=frame(width,height,10800).bodies.find(b=>b.entry.id==='onboarding-demo-hotel');
        assert.ok(Math.abs(end.x-start.x)<.02,'no visible rightward slide at retreat boundary');
    }
});

test('loop approach follows one straight trajectory and ends at Japan without entering Tokyo',()=>{
    const {camera}=setup();
    for(const compact of [true,false]){
        const start=camera(19750,compact),end=camera(0,compact);let previous=start;
        for(let time=19750;time<24500;time+=5){
            const p=camera(time,compact),cross=(p.x-start.x)*(end.y-start.y)-(p.y-start.y)*(end.x-start.x);
            assert.ok(Math.abs(cross)<1e-8);assert.ok(p.x<=previous.x&&p.y>=previous.y,'no return center reversal');
            assert.ok(p.scale<=end.scale,'approach ends at the Japan overview scale');previous=p;
        }
    }
});

test('cosmic dissolution depends only on zoom and restores continuously on approach',()=>{
    const {camera,frame,labels}=setup();
    for(const [width,height] of [[322,254],[352,268],[392,296],[650,460]]){
        const compact=width<440||height<320;
        let previous=0;
        for(const scale of [compact?.018108:.02012,.022,.03,.0499,.05,.065,.1]){
            const outward=frame(width,height,outwardTime(camera,scale,compact));
            let start=19750,end=24500;
            for(let i=0;i<55;i++){const t=(start+end)/2;if(camera(t,compact).scale<scale)start=t;else end=t;}
            const approach=frame(width,height,(start+end)/2);
            for(const key of ['bodyOpacity','connectorOpacity','labelOpacity'])assert.ok(Math.abs(outward.cosmic[key]-approach.cosmic[key])<1e-10,'same zoom, same optical treatment in either direction');
            if(scale>=.065)assert.ok(Object.values(outward.cosmic).every(v=>Math.abs(v-1)<1e-12),'ordinary macro unchanged');
            else assert.ok(outward.cosmic.bodyOpacity>=0&&outward.cosmic.bodyOpacity<=1);
            assert.ok(outward.cosmic.bodyOpacity>=previous,'opacity restores monotonically with zoom');
            previous=outward.cosmic.bodyOpacity;
        }
        const far=frame(width,height,19750);assert.ok(Object.values(far.cosmic).every(v=>v===0));assert.equal(labels(far,width,height).length,0);
        assert.ok(far.bodies.every(b=>b.opacity*far.cosmic.bodyOpacity===0),'all demo bodies disappear completely');
        assert.equal(frame(width,height,0,{reduced:true}).cosmic.bodyOpacity,1);assert.equal(frame(width,height,0,{reduced:true}).cosmic.labelOpacity,1);
    }
});

test('labels yield first, connectors next, then bodies dissolve only at extreme distance',()=>{
    const {cosmic}=setup();
    for(const compact of [true,false]){
        const end=compact?.018108:.02012;
        assert.deepEqual(Object.values(cosmic(.1,compact)),[1,1,1]);
        assert.equal(cosmic(.06,compact).bodyOpacity,1);
        assert.equal(cosmic(.06,compact).connectorOpacity,1);
        assert.ok(cosmic(.06,compact).labelOpacity>0&&cosmic(.06,compact).labelOpacity<1);
        assert.deepEqual(Object.values(cosmic(.05,compact)),[1,1,0]);
        assert.equal(cosmic(.03,compact).connectorOpacity,0);
        assert.ok(cosmic(.03,compact).bodyOpacity>0);
        assert.deepEqual(Object.values(cosmic(end,compact)),[0,0,0]);
        for(const boundary of [end,.03,.05,.065]){
            const a=cosmic(boundary-1e-7,compact),b=cosmic(boundary+1e-7,compact);
            for(const key of Object.keys(a))assert.ok(Math.abs(a[key]-b[key])<.0001,'no threshold pop-in');
        }
    }
});

test('distance-only zero band creates a finite starfield breath without changing camera motion',()=>{
    const {camera,frame}=setup();
    for(const [width,height] of [[322,254],[352,268],[392,296],[650,460]]){
        const compact=width<440||height<320,end=compact?.018108:.02012;
        const out=outwardTime(camera,end,compact);
        let a=19750,b=24500;
        for(let i=0;i<55;i++){const t=(a+b)/2;if(camera(t,compact).scale<end)a=t;else b=t;}
        const reappear=(a+b)/2;
        assert.ok(reappear-out>=500&&reappear-out<=1000,'0.5–1 second of stars only');
        for(let t=out+1;t<reappear;t+=10)assert.ok(Object.values(frame(width,height,t).cosmic).every(v=>v===0));
        assert.ok(frame(width,height,out-100).cosmic.bodyOpacity>0);
        assert.ok(frame(width,height,reappear+100).cosmic.bodyOpacity>0);
        assert.equal(frame(width,height,24500).cosmic.bodyOpacity,1);
    }
});

test('turnaround is a smooth reversal rather than a held screen, and the seam reaches Japan exactly',()=>{
    const {camera,frame}=setup();
    for(const compact of [true,false]){
        const minimum=camera(19750,compact);assert.ok(Math.abs(minimum.scale-(compact?.018:.02))<1e-12);
        const a=camera(19749,compact),b=camera(19751,compact);
        assert.ok(a.scale>minimum.scale&&b.scale>minimum.scale);
        assert.ok(Math.abs(Math.log(minimum.scale/a.scale))*1000<1e-6&&Math.abs(Math.log(b.scale/minimum.scale))*1000<1e-6,'velocity smoothly reaches zero from both sides');
        for(const time of [19500,20000])assert.ok(camera(time,compact).scale>minimum.scale&&camera(time,compact).scale/minimum.scale<1.01,'half-second visual breath, no plateau');
        const size=compact?[352,268]:[650,460];
        assert.deepEqual(frame(...size,24500),frame(...size,0));
        for(const key of ['x','y','scale'])assert.ok(Math.abs(camera(24499,compact)[key]-camera(0,compact)[key])<1e-6);
        assert.deepEqual(camera(24500+5000,compact),camera(5000,compact),'next loop retains its Tokyo hold');
    }
});

test('outer systems are legitimate immutable Galaxy/Sun families present at every camera stage',()=>{
    const {scene,model,frame}=setup(),outer=scene.slice(45);
    assert.equal(outer.length,72);assert.equal(outer.filter(e=>!e.parentId).length,24);
    for(const root of outer.filter(e=>!e.parentId)){
        const children=outer.filter(e=>e.parentId===root.id);assert.equal(root.role,'galaxy');assert.equal(children.length,2);
        assert.ok(children.every(e=>e.depth===1&&e.role==='sun'));
    }
    const normalized=new Map(scene.map(entry=>[entry.id,{...entry}]));model.normalizeHierarchy(normalized);
    for(const entry of scene){assert.equal(entry.depth,normalized.get(entry.id).depth);assert.equal(entry.role,normalized.get(entry.id).role);}
    for(const time of [0,9750,15800,18000,21200,23500]){
        const f=frame(352,268,time);assert.equal(f.bodies.length,117);
        for(const b of f.bodies){assert.equal(b.entry,scene.find(e=>e.id===b.entry.id));assert.equal(b.x,352/2+(b.entry.x-f.view.x)*f.view.scale);}
        assert.ok(f.bodies.filter(b=>b.entry.depth===0).every(b=>b.opacity===1&&!b.hidden),'no time-driven root spawning/fades');
    }
});

test('screen-space root names progressively yield without changing production semantic eligibility',()=>{
    const {frame,labels,Density,view,camera}=setup();
    for(const [width,height] of [[322,254],[352,268],[392,296],[650,260],[650,460]]){
        const counts=[];
        const compact=width<440||height<320;
        for(const time of [outwardTime(camera,compact?.105:.18,compact),outwardTime(camera,compact?.06:.1,compact),19750]){
            const f=frame(width,height,time),candidates=labels(f,width,height),density=new Density({restoreDelay:0});
            const {hidden}=density.resolve(candidates,0),names=candidates.filter(c=>!hidden.has(c.id));counts.push(names.length);
            if(time!==19750)assert.ok(names.some(c=>c.id==='onboarding-demo-travel'),'central region retains a reference');
            for(const b of f.bodies.filter(b=>b.entry.depth===0))assert.equal(b.labelOpacity,view.labelDisclosure('galaxy',f.view.scale,b.entry.id,f.detail,false));
        }
        assert.ok(counts[0]>=4&&counts[0]<=6);assert.ok(counts[1]>=1&&counts[1]<=4);assert.equal(counts[2],0);
    }
});

test('ultra-wide keeps a bounded field of native clusters and substantial surrounding space',()=>{
    const {frame,view}=setup();
    for(const [width,height] of [[322,254],[352,268],[392,296],[650,260],[650,460]]){
        const f=frame(width,height,19750),roots=f.bodies.filter(b=>b.entry.depth===0&&!b.culled);
        for(const b of roots){
            assert.equal(b.diameter,view.galaxyDiameter(f.view.scale));assert.equal(b.diameter,14);
            assert.ok(f.bodies.filter(child=>child.entry.parentId===b.entry.id).length>=1);
        }
        const bodies=f.bodies.filter(b=>!b.hidden&&!b.culled);
        const w=Math.max(...bodies.map(b=>b.x+b.diameter/2))-Math.min(...bodies.map(b=>b.x-b.diameter/2));
        const h=Math.max(...bodies.map(b=>b.y+b.diameter/2))-Math.min(...bodies.map(b=>b.y-b.diameter/2));
        assert.ok(w<width*.85&&h<height*.78,'field leaves dark space around its bounds');
        assert.ok(w*h/(width*height)<.5,'surrounding starfield remains substantial');
        const outer=roots.filter(b=>!['travel','recipes','home','learning','projects','ideas'].some(id=>b.entry.id==='onboarding-demo-'+id));
        for(const b of outer)assert.ok(roots.filter(other=>other!==b).every(other=>Math.hypot(b.x-other.x,b.y-other.y)>13),'outer cores remain distinguishable near the starfield');
        assert.ok(f.bodies.filter(b=>b.entry.depth>0).every(b=>b.labelOpacity===0));
    }
});

test('first successful root offers a temporary child hint, then exactly one final branch hint',()=>{
    const s=setup(),root={id:'travel',parentId:null};
    s.controller.created({wasEmpty:true,rootId:root.id,created:[root]});
    assert.equal(s.hint.hidden,false);assert.equal(s.hint.querySelector('p').textContent,'Now add something inside it with +');
    assert.equal(s.timers.size,1);
    s.controller.created({wasEmpty:false,created:[{id:'unrelated',parentId:null}]});assert.equal(s.controller.state.phase,'child');
    s.controller.created({wasEmpty:false,created:[{id:'japan',parentId:'travel'}]});
    assert.equal(s.controller.state.phase,'done');assert.match(s.hint.querySelector('p').textContent,/That's a branch/);assert.equal(s.timers.size,1);
    [...s.timers.values()][0]();assert.equal(s.hint.hidden,true);assert.equal(s.timers.size,0);
    s.controller.created({wasEmpty:false,created:[{id:'tokyo',parentId:'japan'}]});assert.equal(s.hint.hidden,true);
    assert.ok(!JSON.stringify(s.writes).includes('onboarding-demo-'));
});
test('dismissal and reload never repeat child hints; an eventual first child can finish onboarding',()=>{
    const s=setup({firstUseHints:{phase:'child',rootId:'travel'}});
    s.controller.sync({empty:false,available:true,entries:new Map([['travel',{}]])});assert.equal(s.hint.hidden,true);
    s.controller.created({wasEmpty:false,created:[{id:'japan',parentId:'travel'}]});assert.equal(s.hint.hidden,false);
    s.hint.querySelector('button').listeners.click();assert.equal(s.hint.hidden,true);assert.equal(s.timers.size,0);
    const next=setup({firstUseHints:s.controller.state});next.controller.created({wasEmpty:true,rootId:'other',created:[{id:'other'}]});
    assert.equal(next.hint.hidden,true);
});
test('starter creation with children goes directly to the final hint and removing content clears timers',()=>{
    const s=setup();s.controller.created({wasEmpty:true,rootId:'travel',created:[{id:'travel'},{id:'japan',parentId:'travel'}]});
    assert.equal(s.controller.state.phase,'done');assert.match(s.hint.querySelector('p').textContent,/That's a branch/);
    s.controller.sync({empty:true,available:true,entries:new Map()});assert.equal(s.hint.hidden,true);assert.equal(s.timers.size,0);
});
test('deleting and recreating the first root does not replay the child hint',()=>{
    const s=setup({firstUseHints:{phase:'child',rootId:'deleted'}});
    s.controller.created({wasEmpty:true,rootId:'replacement',created:[{id:'replacement'}]});
    assert.equal(s.hint.hidden,true);assert.equal(s.controller.state.rootId,'replacement');
    s.controller.created({wasEmpty:false,created:[{id:'child',parentId:'replacement'}]});
    assert.equal(s.controller.state.phase,'done');assert.match(s.hint.querySelector('p').textContent,/That's a branch/);
});
