// Display-only example. Never passed to a repository, ID allocator or simulation.
// Deliberate fixed geography, not a generated ring or time-triggered scenery.
// Nearer groups enter at Macro 2; distant groups enter only as territory expands.
const firstUseOuterSystems = [
    ['health','Health',-2700,220,'Appointments','Wellbeing'],
    ['fitness','Fitness',2700,-550,'Training','Running'],
    ['reading','Books',-1650,-1450,'Fiction','Reading list'],
    ['music','Music',550,-1600,'Guitar','Playlists'],
    ['photography','Photography',2850,950,'Trips','Portraits'],
    ['career','Career',-1750,1650,'Work','Learning'],
    ['finances','Finances',900,1750,'Budget','Plans'],
    ['hobbies','Hobbies',2450,-1650,'Making','Collecting'],
    ['friends','Friends',-3200,-650,'Meetups','Visits'],
    ['family','Family',3100,250,'Celebrations','Traditions'],
    ['goals','Goals',-700,-2700,'This year','Someday'],
    ['garden-life','Garden',-3100,1550,'Plants','Seasons'],
    ['car','Car',3450,-2100,'Maintenance','Road trips'],
    ['events','Events',2100,2650,'Gatherings','Tickets'],
    ['inspiration','Inspiration',-2250,-2550,'Sketches','Discoveries'],
    ['courses','Courses',-700,2850,'Science','History'],
    ['home-projects','Home Projects',3900,1500,'Repairs','Renovation'],
    ['memories','Memories',-3800,-2300,'Childhood','Milestones'],
    ['volunteering','Volunteering',-4250,450,'Community','Causes'],
    ['writing-life','Writing',4150,-700,'Stories','Journal'],
    ['outdoors','Outdoors',-2350,2900,'Hiking','Camping'],
    ['pets-life','Pets',1000,-3050,'Care','Adventures'],
    ['celebrations','Celebrations',4500,2700,'Birthdays','Holidays'],
    ['collections','Collections',-4400,2700,'Art','Keepsakes']
];

const firstUseScene = Object.freeze([
    ['travel','Travel',null,-430,160],
    ['weekends','Weekend trips','travel',-540,40],
    ['japan','Japan Trip','travel',0,0],
    ['tokyo','Tokyo','japan',90,-10],
    ['stay','Stay','tokyo',103,-43],
    ['hotel','Hotel','stay',111,-55],
    ['reservation','Reservation','hotel',123,-63],
    ['check-in','Check-in','hotel',99,-67],
    ['airbnb','Airbnb','stay',83,-51],
    ['tokyo-food','Food','tokyo',110,10],
    ['sushi','Sushi','tokyo-food',125,1],
    ['ramen','Ramen','tokyo-food',131,23],
    ['cafes','Cafés','tokyo-food',102,29],
    ['tokyo-places','Places','tokyo',65,35],
    ['shibuya','Shibuya','tokyo-places',45,33],
    ['asakusa','Asakusa','tokyo-places',68,56],
    ['teamlab','TeamLab','tokyo-places',84,42],
    ['kyoto','Kyoto','japan',-110,60],
    ['temples','Temples','kyoto',-140,30],
    ['kyoto-food','Food','kyoto',-150,80],
    ['kyoto-hotel','Hotel','kyoto',-92,106],
    ['osaka','Osaka','japan',50,140],
    ['osaka-food','Food','osaka',12,153],
    ['osaka-hotel','Hotel','osaka',68,178],
    ['osaka-places','Places','osaka',96,136],
    ['recipes','Recipes',null,450,-350],
    ['dinners','Dinners','recipes',545,-470],
    ['baking','Baking','recipes',350,-460],
    ['pasta','Pasta','dinners',580,-450],
    ['home','Home',null,-880,-350],
    ['garden','Garden','home',-790,-470],
    ['rooms','Rooms','home',-1000,-460],
    ['plants','Plants','garden',-755,-450],
    ['learning','Learning',null,-700,850],
    ['languages','Languages','learning',-590,730],
    ['books','Books','learning',-800,740],
    ['japanese','Japanese','languages',-550,750],
    ['projects','Projects',null,620,800],
    ['website','Website','projects',720,680],
    ['workshop','Workshop','projects',520,690],
    ['design','Design','website',760,700],
    ['ideas','Ideas',null,1020,200],
    ['writing','Writing','ideas',1120,80],
    ['someday','Someday','ideas',920,90],
    ['stories','Stories','writing',1160,100]
].concat(firstUseOuterSystems.flatMap(([id,name,x,y,first,second],index)=>{
    // Real Galaxy -> Sun families. Larger world offsets keep small native Sun
    // companions distinguishable in the final view without enlarging artwork.
    const [[ax,ay],[bx,by]]=[
        [[-190,-220],[210,-170]], [[-230,90],[140,-230]],
        [[180,150],[-170,-210]], [[-220,-180],[240,-20]],
        [[-180,180],[200,-160]], [[110,-240],[-250,-30]]
    ][index%6];
    return [[id,name,null,x,y],[`${id}-a`,first,id,x+ax,y+ay],
        [`${id}-b`,second,id,x+bx,y+by]];
})).map(([id,name,parentId,x,y],index,rows)=>{
    // Canonical production forest: independent Galaxy roots, each with Suns.
    // The Japan Trip subtree retains its original Sun-through-Astronaut roles.
    let depth=0, parent=parentId;
    while(parent){depth++;parent=rows.find(row=>row[0]===parent)[2];}
    return Object.freeze({id:`onboarding-demo-${id}`,name,parentId:parentId?`onboarding-demo-${parentId}`:null,
        x,y,depth,role:galaxyModel.roleAtDepth(depth)});
}));

const firstUseSceneIndex = new Map(firstUseScene.map(entry=>[entry.id,entry]));
const firstUseTerminalIds = cosmosView.terminalLabelIds(firstUseSceneIndex);
const firstUsePrimaryGalaxyIds = new Set(firstUseScene.filter(entry=>entry.depth===0).slice(0,6).map(entry=>entry.id));

// Inward poses retain the original teaching holds. Outward semantic landmarks
// control family emphasis only; the camera retreats from one locked center.
// Semantic scale is never multiplied by a CSS/container fit factor.
function firstUseCamera(milliseconds, narrow=false) {
    const wide=narrow?[8,55,.95,'japan']:[0,50,.95,'japan'];
    const tokyo=narrow?[48,0,2.2,'tokyo']:[70,-2,2.65,'tokyo'];
    // Native caps stay fixed while closer, family-centered poses fill the frame.
    const stay=narrow?[100,-29,4.5,'stay']:[100,-30,5,'stay'];
    // Share macro X from the Hotel pose onward: no late sideways handoff.
    // Keep the existing Y framing for Check-in's compact-viewport headroom.
    const hotel=narrow?[110,-53.5,8.6,'hotel']:[110,-53.5,9,'hotel'];
    // Near the populated forest's visual center at macro distance, but close
    // enough to Hotel to need only a half-world-unit vertical adjustment.
    const macro=[110,-53],extreme=[...macro,narrow?.018:.02,'travel'];
    const keys=[[0,...wide],[2300,...wide],[4700,...tokyo],[5400,...tokyo],
        [7000,...stay],[7700,...stay],[9000,...hotel],[10500,...hotel]];
    const time=((milliseconds%24500)+24500)%24500;
    const ease=t=>t*t*t*(t*(t*6-15)+10);
    const context=(from,to,weight)=>{
        const reveals={};
        reveals[`onboarding-demo-${from}`]=1-weight;
        reveals[`onboarding-demo-${to}`]=(reveals[`onboarding-demo-${to}`]||0)+weight;
        return {reveals,focusId:`onboarding-demo-${weight<.5?from:to}`};
    };
    const blend=(a,b,weight,scale)=>({x:a[0]+(b[0]-a[0])*weight,y:a[1]+(b[1]-a[1])*weight,scale,
        ...context(a[3],b[3],weight)});
    if(time<10500){
        const i=keys.findIndex((key,index)=>index<keys.length-1&&time<keys[index+1][0]);
        const a=keys[i],b=keys[i+1],weight=ease((time-a[0])/(b[0]-a[0]));
        return blend(a.slice(1),b.slice(1),weight,Math.exp(Math.log(a[3])+Math.log(b[3]/a[3])*weight));
    }
    if(time<=19750){
        // One smooth acceleration/deceleration for the entire 9.25s pullback.
        // Recenter once over 0.3s, then lock X/Y. Semantic bands contain no camera
        // targets: only zoom determines which family regains its emphasis.
        const progress=Math.max(0,Math.min(1,ease((time-10500)/9250)));
        const scale=Math.exp(Math.log(hotel[2])+Math.log(extreme[2]/hotel[2])*progress);
        const landmarks=[[hotel[2],'hotel'],[stay[2],'stay'],[tokyo[2],'tokyo'],[wide[2],'japan'],
            [narrow?.14:.23,'travel'],[extreme[2],'travel']];
        let i=0;
        while(i<landmarks.length-2&&scale<=landmarks[i+1][0])i++;
        const a=landmarks[i],b=landmarks[i+1];
        const weight=progress===0?0:Math.max(0,Math.min(1,ease(Math.max(0,Math.min(1,Math.log(scale/a[0])/Math.log(b[0]/a[0]))))));
        const recenter=ease(Math.min(1,(time-10500)/300));
        return {x:hotel[0]+(macro[0]-hotel[0])*recenter,y:hotel[1]+(macro[1]-hotel[1])*recenter,scale,
            ...context(a[1],b[1],weight)};
    }
    // No endpoint hold: quintic velocity/acceleration reach zero at maximum
    // distance, then reverse continuously. The near-still breath is ~0.5s.
    const weight=ease((time-19750)/4750);
    return blend(extreme,wide,weight,Math.exp(Math.log(extreme[2])+Math.log(wide[2]/extreme[2])*weight));
}

// Preview-only cinematic visibility, never used by the production renderer.
// Finish just above the camera minimum: its continuous turnaround spends ~0.7s
// inside this zero-opacity band. No timed fade, scene swap or background reset.
function firstUseCosmicVisibility(scale,compact=false) {
    const invisibleZoom=compact?.018108:.02012;
    return {
        bodyOpacity:cosmosView.smooth(scale,invisibleZoom,.05),
        connectorOpacity:cosmosView.smooth(scale,.03,.05),
        labelOpacity:cosmosView.smooth(scale,.05,.065)
    };
}

// Pure preview composition over the exact production semantic helpers. Body
// projection is screen-space arithmetic; only spacing follows world zoom.
function firstUseFrame(width,height,milliseconds,{reduced=false}={}) {
    const compact=width<440||height<320;
    const view=reduced?{x:55,y:compact?7:10,scale:compact?1.9:2,focusId:'onboarding-demo-tokyo',
        reveals:{'onboarding-demo-japan':1,'onboarding-demo-tokyo':1}}:firstUseCamera(milliseconds,compact);
    const detail=cosmosView.detail(view.scale);
    // Preview-only optical treatment, deterministic in zoom in both directions.
    // Native sizes/eligibility stay intact; the starfield is never altered.
    const cosmic=firstUseCosmicVisibility(view.scale,compact);
    // Production Galaxy/Sun handoff also releases local selection into the
    // whole-Universe overview. Roots already exist at their fixed coordinates;
    // they enter the viewport spatially, never by timed spawning or cluster fades.
    const overview=detail.labels.galaxy.opacity;
    // These are selection/context weights over the existing semantic envelopes,
    // not new zoom thresholds. Blend both adjacent families throughout travel.
    const parents={},siblings={};
    Object.entries(view.reveals).forEach(([id,weight])=>{
        const focus=firstUseSceneIndex.get(id);
        if(!focus?.parentId)return;
        parents[focus.parentId]=(parents[focus.parentId]||0)+weight;
        firstUseScene.forEach(entry=>{
            if(entry.parentId===focus.parentId&&entry.id!==id)siblings[entry.id]=(siblings[entry.id]||0)+weight;
        });
    });
    const bodies=firstUseScene.map(entry=>{
        const focus=view.reveals[entry.id]||0,child=view.reveals[entry.parentId]||0;
        const parent=parents[entry.id]||0,sibling=siblings[entry.id]||0;
        const reveal=Math.min(1,focus+parent*.65);
        const ordinary=cosmosView.labelDisclosure(entry.role,view.scale,entry.id,detail,firstUseTerminalIds.has(entry.id));
        const emphasis=.14+.86*Math.min(1,Math.max(overview,focus+child+parent*.42+sibling*.18));
        const priority=Math.min(cosmosView.labelPriority(entry.role,ordinary)+4,
            focus>.02?4*(1-focus):Infinity,child>.02?1+4*(1-child):Infinity,
            parent>.02?2+4*(1-parent):Infinity,sibling>.02?3+4*(1-sibling):Infinity);
        const root=entry.depth===0;
        const x=width/2+(entry.x-view.x)*view.scale,y=height/2+(entry.y-view.y)*view.scale;
        const diameter=root?cosmosView.galaxyDiameter(view.scale):cosmosView.renderedDiameter(entry.role,26*galaxyModel.roles[entry.role].scale,view.scale,detail[entry.role]);
        return {entry,x,y,diameter,culled:x+diameter/2<0||x-diameter/2>width||y+diameter/2<0||y-diameter/2>height,
            opacity:root?1:detail[entry.role]*emphasis,labelOpacity:ordinary+(1-ordinary)*reveal,
            priority,hidden:!root&&detail[entry.role]<.02,context:{focus,child,parent,sibling,emphasis,reveal}};
    });
    // Each local edge fades with its family, including the immediate-parent edge.
    // Shared edges stay stable across a handoff and also during the return.
    const relationships=firstUseScene.filter(entry=>entry.parentId).map(entry=>({id:entry.id,
        weight:Math.min(1,(view.reveals[entry.parentId]||0)+(view.reveals[entry.id]||0))}));
    return {view,detail,bodies,relationships,cosmic};
}

// Screen-space decluttering only: ordinary semantic eligibility is untouched.
// As more real roots enter the viewport, reserve names for the original region.
// This is a preview density budget, not another hierarchy/zoom threshold model.
function firstUseLabelCandidates(frame,width,height) {
    const visible=frame.bodies.filter(body=>!body.hidden&&!body.culled);
    const rootCount=visible.filter(body=>body.entry.depth===0).length;
    const rootBudget=Math.ceil(36/Math.max(6,rootCount));
    const candidates=visible.flatMap(body=>{
        if(body.labelOpacity*frame.cosmic.labelOpacity<=.02)return [];
        const w=Math.min(114,body.entry.name.length*6.5+8);
        const rect={left:body.x-w/2,right:body.x+w/2,top:body.y+body.diameter/2+5,bottom:body.y+body.diameter/2+20};
        if(rect.left<4||rect.right>width-4||rect.top<4||rect.bottom>height-4)return [];
        // Same root-name obstruction test as production requestLabelLayout:
        // a 3px body margin and 24% overlap tolerance, with focus protected.
        if(body.entry.depth===0&&!body.context.focus&&visible.some(other=>{
            const r=other.diameter/2+3;
            return Math.max(0,Math.min(rect.right,other.x+r)-Math.max(rect.left,other.x-r))*
                Math.max(0,Math.min(rect.bottom,other.y+r)-Math.max(rect.top,other.y-r))>w*15*.24;
        }))return [];
        return [{id:body.entry.id,rect,priority:body.priority,
            root:body.entry.depth===0,primary:firstUsePrimaryGalaxyIds.has(body.entry.id)}];
    });
    const roots=candidates.filter(candidate=>candidate.root).sort((a,b)=>
        Number(b.primary)-Number(a.primary)||a.priority-b.priority||a.id.localeCompare(b.id));
    const names=new Set(roots.slice(0,rootBudget).map(candidate=>candidate.id));
    return candidates.filter(candidate=>!candidate.root||names.has(candidate.id));
}

class FirstUsePreview {
    constructor(host,{obscured=()=>false}={}) {
        this.host=host;this.obscured=obscured;this.frame=null;this.elapsed=0;this.lastTime=null;this.destroyed=false;
        this.motion=matchMedia('(prefers-reduced-motion: reduce)');
        host.innerHTML='<div class="universe-background"><div class="nebula-layer"></div><div class="star-layer"></div><div class="star-layer star-layer--middle"></div><div class="star-layer star-layer--near"></div></div><svg class="first-use-orbits" aria-hidden="true"></svg><div class="first-use-bodies"></div>';
        this.background=createUniverseBackground(host);
        this.bodies=firstUseScene.map(entry=>{
            const node=document.createElement('div');node.className='entry-node';
            node.dataset.entryId=entry.id;
            node.innerHTML='<span class="node-label"></span>';
            renderCelestialBody(entry,node);
            host.querySelector('.first-use-bodies').append(node);
            return {entry,node};
        });
        this.density=new LabelDensity({restoreDelay:0});
        // Like production, one preferred orbital band per parent, active only
        // for the current local family. No separate ring for every child.
        this.orbits=firstUseScene.filter(parent=>parent.depth>0&&firstUseScene.some(entry=>entry.parentId===parent.id)).map(parent=>{
            const children=firstUseScene.filter(entry=>entry.parentId===parent.id);
            const radius=children.reduce((sum,entry)=>sum+Math.hypot(entry.x-parent.x,entry.y-parent.y),0)/children.length;
            const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
            circle.classList.add('orbit-guide');circle.dataset.role=parent.role;
            host.querySelector('svg').append(circle);return {parent,radius,circle};
        });
        this.relationships=firstUseScene.filter(entry=>entry.parentId).map(entry=>{
            const parent=firstUseSceneIndex.get(entry.parentId),tether=entry.role==='astronaut';
            const element=document.createElementNS('http://www.w3.org/2000/svg',tether?'path':'line');
            element.classList.add('hierarchy-line');element.dataset.kind='hierarchy';
            if(tether)element.classList.add('astronaut-tether');
            host.querySelector('svg').append(element);return {entry,parent,element,tether};
        });
        this.refresh=()=>this.update();
        this.leave=()=>{this.suspended=true;this.stop();};
        this.return=()=>{this.suspended=false;this.update();};
        this.resize=new ResizeObserver(()=>{this.width=host.clientWidth;this.height=host.clientHeight;this.background();this.update();});
        this.resize.observe(host);
        this.modals=new MutationObserver(this.refresh);
        document.querySelectorAll('dialog').forEach(dialog=>this.modals.observe(dialog,{attributes:true,attributeFilter:['open']}));
        this.modals.observe(document.getElementById('galaxy'),{attributes:true,attributeFilter:['class']});
        this.motion.addEventListener('change',this.refresh);
        document.addEventListener('visibilitychange',this.refresh);
        window.addEventListener('pagehide',this.leave);
        window.addEventListener('pageshow',this.return);
        this.intersection=new IntersectionObserver(([entry])=>{this.intersecting=entry.isIntersecting;this.update();});
        this.intersection.observe(host);
        this.width=host.clientWidth;this.height=host.clientHeight;this.intersecting=true;this.update();
    }
    blocked(){return this.suspended||document.hidden||!this.intersecting||this.obscured()||!!document.querySelector('dialog[open]');}
    stop(){if(this.frame!==null)cancelAnimationFrame(this.frame);this.frame=null;this.lastTime=null;}
    update(){
        if(this.destroyed)return;
        this.stop();this.draw(this.elapsed,{reduced:this.motion.matches});
        if(!this.motion.matches&&!this.blocked())this.frame=requestAnimationFrame(time=>this.tick(time));
    }
    tick(time){
        this.frame=null;
        if(this.destroyed||this.blocked()){this.lastTime=null;return;}
        if(this.lastTime!==null)this.elapsed+=Math.min(50,time-this.lastTime);
        this.lastTime=time;this.draw(this.elapsed);
        this.frame=requestAnimationFrame(next=>this.tick(next));
    }
    draw(time,{reduced=false}={}){
        const frame=firstUseFrame(this.width,this.height,time,{reduced});
        const {view,detail,bodies,relationships,cosmic}=frame;
        const scale=view.scale;
        // Match production's inexpensive overview paint; depth artwork is intact.
        this.host.dataset.simpleBodies=String(scale<=.28);
        this.host.style.setProperty('--orbit-detail',detail.guides);
        this.host.querySelector('.first-use-orbits').style.opacity=String(cosmic.connectorOpacity);
        const project=entry=>({x:this.width/2+(entry.x-view.x)*scale,y:this.height/2+(entry.y-view.y)*scale});
        const candidates=firstUseLabelCandidates(frame,this.width,this.height);
        const eligible=new Set(candidates.map(candidate=>candidate.id)),labels=[];
        this.bodies.forEach(({entry,node},index)=>{
            const body=bodies[index],{diameter,x,y,labelOpacity,hidden}=body;
            if(!body.culled){
                node.style.transform=`translate(${x}px,${y}px) translate(-50%,-50%)`;
                node.style.width=node.style.height=`${diameter}px`;
            }
            node.style.opacity=String(body.opacity*cosmic.bodyOpacity);
            node.style.visibility=hidden||body.culled?'hidden':'visible';
            node.dataset.culled=String(body.culled);
            node.style.setProperty('--terminal-label-opacity',labelOpacity*cosmic.labelOpacity);
            node.dataset.semanticHidden=String(hidden);
            node.dataset.previewFocus=String(entry.id===view.focusId);
            labels.push({id:entry.id,label:node.querySelector('.node-label'),eligible:eligible.has(entry.id)});
        });
        // Reuse the production collision resolver directly, without scheduling
        // its DOM-measurement RAF/timers; native label rectangles are bounded.
        const {hidden}=this.density.resolve(candidates,performance.now());
        labels.forEach(({id,label,eligible})=>{label.style.visibility=eligible&&!hidden.has(id)?'visible':'hidden';});
        this.orbits.forEach(({parent,radius,circle})=>{
            const point=project(parent);circle.setAttribute('cx',point.x);circle.setAttribute('cy',point.y);
            circle.setAttribute('r',radius*scale);
            const weight=Math.min(1,(view.reveals[parent.id]||0)+firstUseScene.reduce((sum,entry)=>
                sum+(entry.parentId===parent.id?(view.reveals[entry.id]||0):0),0));
            circle.style.setProperty('--orbit-detail',detail.guides*weight);
            circle.dataset.active=String(scale>cosmosView.tiers.system&&weight>.001);
        });
        this.relationships.forEach(({entry,parent,element,tether},index)=>{
            const start=project(parent),end=project(entry);
            // Root-to-Sun context belongs to the macro tier, not the local
            // branch journey. Retain native line styling and semantic guides.
            const weight=relationships[index].weight*(parent.depth===0?1-detail.guides:1);
            element.style.visibility=weight>.001?'visible':'hidden';
            if(weight<=.001)return;
            if(tether){
                const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy)||1;
                const slack=Math.min(18,Math.hypot(entry.x-parent.x,entry.y-parent.y)*.18)*scale*
                    (galaxyAppearance.hash(`${parent.id}:${entry.id}`)%2?1:-1);
                element.setAttribute('d',`M${start.x},${start.y} Q${(start.x+end.x)/2-dy/length*slack},${(start.y+end.y)/2+dx/length*slack} ${end.x},${end.y}`);
                element.style.opacity=cosmosView.deepTetherOpacity(scale,entry.id,true)*weight*detail.astronaut;
                element.style.strokeWidth='.65';
            }else{
                element.classList.toggle('context-link',scale>cosmosView.tiers.system&&weight>.001);
                element.style.opacity=cosmosView.deepTetherOpacity(scale,entry.id,true)*weight;
                element.setAttribute('x1',start.x);element.setAttribute('y1',start.y);
                element.setAttribute('x2',end.x);element.setAttribute('y2',end.y);
            }
        });
    }
    destroy(){
        this.destroyed=true;this.stop();this.resize.disconnect();this.modals.disconnect();this.intersection.disconnect();
        this.motion.removeEventListener('change',this.refresh);document.removeEventListener('visibilitychange',this.refresh);
        window.removeEventListener('pagehide',this.leave);window.removeEventListener('pageshow',this.return);
        this.density.destroy();this.host.replaceChildren();this.bodies=[];this.orbits=[];this.relationships=[];
    }
}

class FirstUseOnboarding {
    constructor({root,hint,preferences,create,help,obscured}){
        Object.assign(this,{root,hint,preferences,obscured});this.preview=null;this.timer=null;
        this.state=preferences.load().firstUseHints||{};
        root.querySelector('#first-use-create').addEventListener('click',create);
        this.helpButton=root.querySelector('#first-use-help');this.helpButton.addEventListener('click',help);
        hint.querySelector('button').addEventListener('click',()=>this.hideHint(true));
        document.getElementById('help-dialog').addEventListener('close',()=>{
            if(!root.hidden)this.helpButton.focus({preventScroll:true});
        });
    }
    sync({empty,available,entries}){
        const show=empty&&available;
        this.root.hidden=!show;
        document.getElementById('galaxy').classList.toggle('first-use-visible',show);
        if(show&&!this.preview)this.preview=new FirstUsePreview(this.root.querySelector('#first-use-preview'),{obscured:this.obscured});
        if(!show&&this.preview){this.preview.destroy();this.preview=null;}
        if(empty||!available||(this.state.rootId&&!entries.has(this.state.rootId)))this.hideHint();
    }
    save(state){this.state=state;this.preferences.update({firstUseHints:state}).catch(()=>{});}
    created({wasEmpty,rootId,created}){
        if(this.state.phase==='done')return;
        if(wasEmpty){
            const alreadyIntroduced=this.state.phase==='child';
            this.save({phase:'child',rootId});
            if(created.some(item=>item.parentId===rootId)){this.finish();return;}
            if(!alreadyIntroduced)this.showHint('Now add something inside it with +');
        }else if(this.state.phase==='child'&&created.some(item=>item.parentId===this.state.rootId))this.finish();
    }
    finish(){
        this.save({phase:'done'});
        this.showHint("That's a branch. Keep building it, or open Contents to add files, notes, links or a location.");
    }
    showHint(text){
        this.hideHint();this.hint.querySelector('p').textContent=text;this.hint.hidden=false;
        this.timer=setTimeout(()=>this.hideHint(),16000);
    }
    hideHint(restoreFocus=false){
        if(restoreFocus&&this.hint.contains(document.activeElement))document.getElementById('mobile-body-add').getClientRects().length?
            document.getElementById('mobile-body-add').focus({preventScroll:true}):document.getElementById('entry-add-button').focus({preventScroll:true});
        this.hint.hidden=true;if(this.timer!==null)clearTimeout(this.timer);this.timer=null;
    }
}
