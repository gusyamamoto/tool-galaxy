// Explicit world navigation owns this presentation; camera gestures never change it.
// canonical coordinates, Content selection and persisted records remain independent.
class HierarchicalFocus {
    constructor({now=()=>performance.now(),duration=420}={}) {
        this.now=now;this.duration=duration;this.world={id:null,path:[],layout:null};this.entries=new Map();this.children=new Map();
        this.descendants=new Map();this.projection=new Map();this.references=new Map();this.drags=new Map();
        this.releases=new Map();this.sizes=new Map();this.progress=1;this.layout=null;this.started=0;this.mobile=false;this.scale=1;this.freeLevel='suns';
        this.localAmount=1;this.inspectionId=null;this.inspectionProgress=1;this.origins=new Map();
        this.familyIds=new Set();this.localFamily=[];this.visibleDetails=new Set();this.path=[];
        this.geometryCache=new Map();this.manual=new Map();this.arrangementRevision=0;
    }
    get anchorId() {return this.world.id;}
    get path() {return this.world.path;}
    set path(value) {this.world.path=value;}
    get layout() {return this.world.layout;}
    set layout(value) {this.world.layout=value;}
    rebuild(entries) {
        this.entries=entries;this.children=new Map([...entries.keys()].map(id=>[id,[]]));this.descendants=new Map();
        entries.forEach(entry=>this.children.get(entry.parentId)?.push(entry));
        // Iterative postorder supports arbitrary generic hierarchy depth.
        const ordered=[...entries.values()].sort((a,b)=>b.depth-a.depth);
        this.projectionOrder=[...ordered].reverse();
        ordered.forEach(entry=>this.descendants.set(entry.id,(this.children.get(entry.id)||[]).reduce((sum,child)=>sum+1+(this.descendants.get(child.id)||0),0)));
        if(this.anchorId&&!entries.has(this.anchorId))this.clear();
        if(entries.get(this.anchorId)?.depth>3){this.enter(this.anchorId);return;}
        this.ancestry=new Set();let current=entries.get(this.anchorId),seen=new Set();
        while(current?.parentId&&!seen.has(current.parentId)){seen.add(current.parentId);this.ancestry.add(current.parentId);current=entries.get(current.parentId);}
        this.path=this.anchorId?[...this.ancestry].reverse().concat(this.anchorId):[];
        this.localDescendants=new Set();const queue=[...(this.children.get(this.anchorId)||[])];
        for(let i=0;i<queue.length;i++){const child=queue[i];if(this.localDescendants.has(child.id))continue;this.localDescendants.add(child.id);queue.push(...(this.children.get(child.id)||[]));}
        const anchor=this.entries.get(this.anchorId);
        this.localFamily=anchor?.depth===3?[...this.localDescendants].map(id=>entries.get(id)).sort((a,b)=>a.depth-b.depth||(a.id<b.id?-1:1)):(this.children.get(this.anchorId)||[]);
        this.familyIds=new Set(this.localFamily.map(entry=>entry.id));
        this.visibleDetails=new Set(this.localFamily.filter((entry,index)=>entry.parentId===this.anchorId||index<96).map(entry=>entry.id));
        if(this.inspectionId&&!entries.has(this.inspectionId))this.inspect(null);
        this.origins.forEach((_,id)=>{if(!entries.has(id))this.origins.delete(id);});
        this.manual.forEach((value,id)=>{if(entries.get(id)?.parentId!==value.parentId)this.manual.delete(id);});
        this.geometryCache.forEach((_,id)=>{if(!entries.has(id))this.geometryCache.delete(id);});
        for(const map of [this.references,this.drags,this.releases,this.projection,this.sizes])map.forEach((_,id)=>{if(!entries.has(id))map.delete(id);});
        this.references.forEach((_,id)=>{if(!this.familyIds.has(id))this.references.delete(id);});
        this.version=(this.version||0)+1;
    }
    enter(id) {
        if(!this.entries.has(id))return false;
        const requested=this.entries.get(id),contextId=this.contextId(id);
        if(this.anchorId===contextId){this.inspect(requested.depth>3?id:null);return false;}
        const returning=this.ancestry?.has(contextId),body=this.entries.get(contextId),particle=this.particles?.get(contextId)||body,displayed=this.point(body);
        if(!returning||!this.origins.has(contextId))this.origins.set(contextId,{x:displayed.x,y:displayed.y});
        this.visibilityFrom=new Map([...this.entries.values()].map(entry=>[entry.id,this.visibility(entry)]));
        this.from=new Map([...this.projection].map(([key,point])=>[key,{...point}]));this.sizeFrom=new Map(this.sizes);this.previousAnchorId=this.anchorId;this.world={id:contextId,path:[],layout:null,origin:{...this.origins.get(contextId)},geometry:this.geometryCache.get(contextId)};this.started=this.now();this.progress=0;this.exiting=false;
        this.resetZoom();this.layoutKey=null;
        this.references.clear();this.drags.clear();this.releases.clear();this.rebuild(this.entries);this.inspect(requested.depth>3?id:null);return true;
    }
    clear() {
        this.visibilityFrom=new Map([...this.entries.values()].map(entry=>[entry.id,this.visibility(entry)]));
        this.exiting=!!this.anchorId;this.from=this.exiting?new Map([...this.projection].map(([id,point])=>[id,{...point}])):null;this.sizeFrom=new Map(this.sizes);
        this.previousAnchorId=this.anchorId;this.world={id:null,path:[],layout:null};this.progress=this.exiting?0:1;this.started=this.now();
        this.references.clear();this.drags.clear();this.releases.clear();this.ancestry=new Set();
        this.path=[];this.resetZoom();
        this.inspect(null);this.inspectionSizes=null;this.inspectionProgress=1;this.origins.clear();this.localFamily=[];this.familyIds=new Set();this.visibleDetails=new Set();this.localDescendants=new Set();this.layoutKey=null;this.projectionKey=null;
    }
    resetZoom() {} // Legacy caller compatibility; camera history has no world state.
    contextId(id) {
        let entry=this.entries.get(id),seen=new Set();
        while(entry&&!seen.has(entry.id)) {
            seen.add(entry.id);
            if(entry.depth<=3)return entry.id;
            entry=this.entries.get(entry.parentId);
        }
        return null;
    }
    inspect(id) {
        if(id===this.inspectionId)return;
        this.inspectionSizes=new Map(this.sizes);this.inspectionId=id;
        this.inspectionStarted=this.now();this.inspectionProgress=0;
    }
    anchorPoint() {
        const particle=this.particles?.get(this.anchorId)||this.entries.get(this.anchorId);if(!particle)return null;
        return this.world.origin||particle;
    }
    targetPoint(entry) {
        const anchor=this.anchorPoint(),local=this.world.points?.get(entry.id);
        if(entry.id===this.anchorId)return anchor;
        return anchor&&local?{x:anchor.x+local.dx,y:anchor.y+local.dy}:this.point(entry);
    }
    zoom(factor) {
        // Compatibility entry point for callers/tests: zoom has no authority
        // over world identity, path or local layout, in either direction.
        return null;
    }
    nominalScale(entry,bounds=this.viewport,mobile=this.mobile) {
        if(entry?.depth===0)return .52;
        const shortest=Math.max(1,Math.min(bounds.right-bounds.left,bounds.bottom-bounds.top));
        return Math.min(entry?.role==='sun'?1.25:1.5,shortest/(2*((mobile?156:180)+40)));
    }
    viewScale(bounds=this.viewport){
        const geometry=this.world.geometry,entry=this.entries.get(this.anchorId);
        if(!geometry||!entry)return this.nominalScale(entry,bounds,this.mobile);
        return Math.min(1.5,Math.min(bounds.right-bounds.left,bounds.bottom-bounds.top)*({sun:.25,planet:.55,moon:.45}[entry.role]||.25)/geometry.diameter);
    }
    smooth(value) {value=Math.max(0,Math.min(1,value));return value*value*(3-2*value);}
    worldDiameter(entry,mobile=this.mobile,bounds=this.viewport) {
        if(entry?.id===this.anchorId&&this.world.geometry)return this.world.geometry.diameter;
        return this.initialDiameter(entry,mobile,bounds);
    }
    initialDiameter(entry,mobile=this.mobile,bounds=this.viewport) {
        if(bounds&&['sun','planet','moon'].includes(entry?.role)) {
            const shortest=Math.max(1,Math.min(bounds.right-bounds.left,bounds.bottom-bounds.top));
            const proportion={sun:.25,planet:.55,moon:.45}[entry.role];
            return shortest*proportion/this.nominalScale(entry,bounds,mobile);
        }
        const values=mobile?{sun:132,planet:120,moon:104,satellite:30,astronaut:17}:{sun:170,planet:220,moon:190,satellite:30,astronaut:17};
        return values[entry?.role]||100;
    }
    frame(particles,bounds,scale,{mobile=false,reducedMotion=false,dragging=new Set(),poseRevision,now=this.now()}={}) {
        this.particles=particles;this.viewport=bounds;this.scale=scale;this.mobile=mobile;this.reduced=reducedMotion;
        if(scale>.64)this.freeLevel='planets';else if(scale<.48)this.freeLevel='suns';
        this.progress=!this.anchorId&&!this.exiting||reducedMotion?1:this.smooth((now-this.started)/Math.max(1,this.duration));
        this.localAmount=this.anchorId?1:0;
        this.inspectionProgress=reducedMotion?1:this.smooth((now-(this.inspectionStarted??-Infinity))/Math.max(1,this.duration));
        if(this.inspectionProgress===1)this.inspectionSizes=null;
        const anchor=this.entries.get(this.anchorId);
        if(anchor) {
            // Geometry is captured on entry, not inferred from camera scale or
            // changing Content/sidebar bounds. Only hierarchy changes rebuild it.
            if(!this.world.geometry||this.world.geometry.role!==anchor.role){this.world.geometry=null;this.world.geometry={role:anchor.role,mobile,diameter:this.initialDiameter(anchor,mobile,bounds),scale:this.nominalScale(anchor,bounds,mobile)};this.geometryCache.set(anchor.id,this.world.geometry);if(this.geometryCache.size>16)this.geometryCache.delete(this.geometryCache.keys().next().value);}
            const geometry=this.world.geometry,key=`${anchor.id}:${this.version}:${geometry.mobile}:${geometry.diameter}`;
            if(key!==this.layoutKey){this.layout=cosmosLocalLayout.build(anchor,this.localFamily,{mobile:geometry.mobile,includeDescendants:anchor.depth===3,bodyRadius:geometry.diameter/2});this.layoutKey=key;this.world.pointsKey=null;}
            const pointsKey=`${key}:${this.arrangementRevision}`;
            if(pointsKey!==this.world.pointsKey){this.buildPoints();this.world.pointsKey=pointsKey;}
        }
        const projectionKey=poseRevision===undefined?null:`${anchor&&!this.world.anchorFollow?this.arrangementRevision:poseRevision}:${this.version}:${this.anchorId}:${this.layoutKey}:${this.progress}`;
        if(projectionKey&&projectionKey===this.projectionKey&&!this.drags.size&&!this.releases.size)return this;
        this.projectionKey=projectionKey;
        let anchorPoint=this.anchorPoint();
        const anchorDrag=this.drags.get(this.anchorId)||this.world.anchorFollow;
        if(anchorDrag){const p=particles.get(this.anchorId);anchorPoint=this.world.origin={x:anchorDrag.point.x+p.x-anchorDrag.x,y:anchorDrag.point.y+p.y-anchorDrag.y};this.origins.set(this.anchorId,{...anchorPoint});}
        const projection=this.projection,motion=new Map();
        this.projectionOrder.forEach(entry=>{
            const particle=particles.get(entry.id)||entry;let target=projection.get(entry.id);
            if(!target){target={x:particle.x,y:particle.y};projection.set(entry.id,target);}
            target.x=particle.x;target.y=particle.y;
            if(entry.id===this.anchorId){target.x=anchorPoint.x;target.y=anchorPoint.y;}
            const local=this.world.points?.get(entry.id);
            if(anchor&&local) {
                target.x=anchorPoint.x+local.dx;target.y=anchorPoint.y+local.dy;
            }
            const from=this.from?.get(entry.id);
            if(from&&this.progress<1){target.x=from.x+(target.x-from.x)*this.progress;target.y=from.y+(target.y-from.y)*this.progress;}
            const nominal={x:target.x,y:target.y},inherited=local&&this.world.points.has(entry.parentId)?motion.get(entry.parentId):null;
            if(inherited){target.x+=inherited.x;target.y+=inherited.y;}
            const drag=this.drags.get(entry.id);
            if(drag){target.x=drag.point.x+particle.x-drag.x;target.y=drag.point.y+particle.y-drag.y;}
            const release=this.releases.get(entry.id);
            if(release&&!drag) {
                const blend=reducedMotion?1:this.smooth((now-release.started)/600);
                target.x=release.point.x+(target.x-release.point.x)*blend;target.y=release.point.y+(target.y-release.point.y)*blend;
                if(blend===1)this.releases.delete(entry.id);
            }
            if(local)motion.set(entry.id,{x:target.x-nominal.x,y:target.y-nominal.y});
        });
        this.projection=projection;if(this.progress===1){this.from=null;this.sizeFrom=null;this.visibilityFrom=null;this.exiting=false;}
        return this;
    }
    point(entry) {return this.projection.get(entry.id)||this.particles?.get(entry.id)||entry;}
    buildPoints() {
        const points=new Map();this.world.points=points;
        [...this.localFamily].sort((a,b)=>a.depth-b.depth||(a.id<b.id?-1:1)).forEach(entry=>{
            const base=this.layout.positions.get(entry.id);if(!base)return;
            const parentBase=this.layout.positions.get(entry.parentId)||{dx:0,dy:0},parent=points.get(entry.parentId)||{dx:0,dy:0};
            let relative={dx:base.dx-parentBase.dx,dy:base.dy-parentBase.dy};
            const particle=this.particles.get(entry.id),preference=particle?.placement||this.manual.get(entry.id);
            if(preference?.parentId===entry.parentId&&Number.isFinite(preference.angle)&&Number.isFinite(preference.radius)){
                const radius=Math.hypot(relative.dx,relative.dy)*preference.radius/Math.max(1,particle?.orbitRadius||Math.hypot(relative.dx,relative.dy));
                relative=this.constrainPlacement(entry,{dx:Math.cos(preference.angle)*radius,dy:Math.sin(preference.angle)*radius},points);
            }
            points.set(entry.id,{...base,dx:parent.dx+relative.dx,dy:parent.dy+relative.dy});
        });
    }
    constrainPlacement(entry,relative,points=this.world.points) {
        const base=this.layout.positions.get(entry.id),parent=points.get(entry.parentId)||{dx:0,dy:0};
        const nested=entry.parentId!==this.anchorId,baseParent=this.layout.positions.get(entry.parentId)||{dx:0,dy:0};
        const defaultRadius=Math.hypot(base.dx-baseParent.dx,base.dy-baseParent.dy);
        const min=nested?30:this.layout.innerRadius*.85,max=nested?Math.max(52,Math.min(100,defaultRadius*1.6)):Math.max(defaultRadius,this.layout.radius)*1.65;
        let radius=Math.hypot(relative.dx,relative.dy)||1,ratio=Math.max(min,Math.min(max,radius))/radius;
        let point={dx:parent.dx+relative.dx*ratio,dy:parent.dy+relative.dy*ratio};
        const clearance=nested?44:this.layout.groupRadius?this.layout.groupRadius*2+44:64;
        // Resolve only close sibling collisions, not an attraction to a slot.
        for(let pass=0;pass<5;pass++)for(const [id,other] of points){
            if(id===entry.id||this.entries.get(id)?.parentId!==entry.parentId)continue;
            const dx=point.dx-other.dx,dy=point.dy-other.dy,distance=Math.hypot(dx,dy);
            if(distance<clearance){const angle=distance?Math.atan2(dy,dx):base.angle;point.dx=other.dx+Math.cos(angle)*clearance;point.dy=other.dy+Math.sin(angle)*clearance;}
        }
        if(nested){const root=points.get(base.groupId),limit=Math.max(72,(this.layout.groupRadius||72)*1.3);if(root){const offset=cosmosLocalLayout.boundedOffset(point.dx-root.dx,point.dy-root.dy,limit);point={dx:root.dx+offset.dx,dy:root.dy+offset.dy};}}
        return {dx:point.dx-parent.dx,dy:point.dy-parent.dy};
    }
    relation(entry) {
        if(!this.anchorId)return entry.depth===0?'galaxy':entry.depth===1?'system':entry.depth===2?'child':'descendant';
        const anchor=this.entries.get(this.anchorId);
        if(entry.id===this.anchorId)return 'anchor';if(this.familyIds?.has(entry.id))return 'child';
        if(this.ancestry.has(entry.id))return 'ancestor';
        if(entry.parentId===anchor?.parentId&&entry.depth===anchor?.depth)return 'peer';
        return this.localDescendants.has(entry.id)?'descendant':'other';
    }
    visibility(entry,{priority=false,member=false}={}) {
        const relation=this.relation(entry);
        if(priority)return {body:1,label:1,relation};
        const target=this.targetVisibility(entry,member,relation);
        const from=this.visibilityFrom?.get(entry.id);
        if(from&&this.progress<1)return {body:from.body+(target.body-from.body)*this.progress,label:from.label+(target.label-from.label)*this.progress,relation};
        return target;
    }
    targetVisibility(entry,member=false,relation=this.relation(entry)) {
        if(!this.anchorId) {
            if(entry.depth===0)return {body:1,label:1,relation};
            if(entry.depth===1){const opacity=cosmosView.smooth(this.scale,.2,.55);return {body:Math.max(member ? .7 : 0,opacity),label:cosmosView.smooth(this.scale,.38,.58),relation};}
            if(entry.depth===2){const opacity=cosmosView.smooth(this.scale,.55,.86);return {body:Math.max(member ? .6 : 0,opacity),label:cosmosView.smooth(this.scale,.66,.94),relation};}
            return {body:member ? .25 : 0,label:0,relation};
        }
        if(relation==='anchor')return {body:1,label:1,relation};
        if(relation==='child') {
            const reference=this.viewScale();
            const body=entry.id===this.inspectionId||entry.parentId===this.anchorId?1:this.visibleDetails.has(entry.id)?cosmosView.smooth(this.scale/reference,.6,1):0;
            return {body,label:body,relation};
        }
        if(member)return {body:.22,label:0,relation};
        if(relation==='ancestor')return {body:(entry.depth===0?.16:.12)+(1-this.localAmount)*.5,label:(1-this.localAmount)*.7,relation};
        if(relation==='peer')return {body:.08+(1-this.localAmount)*.6,label:(1-this.localAmount)*.7,relation};
        return {body:0,label:0,relation};
    }
    diameter(entry,base,bounds,scale,{mobile=this.mobile}={}) {
        let target=base;
        if(entry.id===this.anchorId) {
            const shortest=Math.max(1,Math.min(bounds.right-bounds.left,bounds.bottom-bounds.top));
            const proportion={satellite:.15,astronaut:.10}[entry.role]||2.2;
            const absolute={satellite:mobile?76:120,astronaut:mobile?60:84}[entry.role]||Infinity;
            const cap=Math.min(absolute,shortest*proportion);
            target=Math.max(base,Math.min(cap,this.worldDiameter(entry,mobile,bounds)*scale));
        }else if(this.anchorId&&entry.depth>0) {
            if(this.familyIds.has(entry.id)) {
                if(entry.depth>3) {
                    const shortest=Math.min(bounds.right-bounds.left,bounds.bottom-bounds.top),satellite=entry.role==='satellite';
                    const cap=Math.min(mobile?(satellite?76:40):(satellite?120:60),shortest*(satellite?.15:.085));
                    const normal=this.initialDiameter(entry,mobile,null)*scale/Math.max(.001,this.world.geometry.scale);
                    target=Math.max(satellite?9:5,Math.min(cap,normal*(entry.id===this.inspectionId?(satellite?1.12:1.05):1)));
                    const initial=this.inspectionSizes?.get(entry.id);
                    if(initial!==undefined)target=initial+(target-initial)*this.inspectionProgress;
                }else {
                    const preview={sun:52,planet:37,moon:26}[entry.role]||18;
                    target=Math.max(4,preview*scale/Math.max(.001,this.world.geometry.scale));
                }
            }else target=Math.min(base,8);
        }
        const from=this.sizeFrom?.get(entry.id)??base;
        const size=from+(target-from)*this.progress;this.sizes.set(entry.id,size);return size;
    }
    hints(entry) {
        const count=this.descendants.get(entry.id)||0;if(!count)return null;
        return {id:entry.id,count,beads:count>=100?1:Math.min(3,count),mode:count>=100?'density':count>6?'count':'beads'};
    }
    hintDescriptors() {
        const candidates=this.anchorId?(this.children.get(this.anchorId)||[]):[...this.entries.values()].filter(entry=>entry.depth===(this.freeLevel==='suns'?1:2));
        if(this.entries.get(this.anchorId)?.depth===3&&this.localFamily.every(entry=>this.visibleDetails.has(entry.id)))return [];
        return candidates.map(entry=>this.hints(entry)).filter(Boolean).slice(0,16);
    }
    bounds() {
        const anchor=this.anchorPoint();if(!anchor||!this.layout)return null;
        const radius=this.world.geometry.diameter/2,e={left:-radius,right:radius,top:-radius,bottom:radius};
        this.world.points.forEach(p=>{e.left=Math.min(e.left,p.dx-32);e.right=Math.max(e.right,p.dx+32);e.top=Math.min(e.top,p.dy-32);e.bottom=Math.max(e.bottom,p.dy+32);});
        return {left:anchor.x+e.left,right:anchor.x+e.right,top:anchor.y+e.top,bottom:anchor.y+e.bottom};
    }
    captureDrag(id) {
        const particle=this.particles?.get(id)||this.entries.get(id);if(!particle)return;
        const point=this.point(particle);this.drags.set(id,{x:particle.x,y:particle.y,point:{x:point.x,y:point.y}});this.releases.delete(id);
    }
    releaseDrag(id,{moved=true}={}) {
        if(!this.drags.has(id))return;
        const point=this.projection.get(id)||this.point(this.entries.get(id));
        this.drags.delete(id);
        if(moved&&id===this.anchorId){const particle=this.particles.get(id);this.world.anchorFollow={point:{...point},x:particle.x,y:particle.y};}
        if(moved&&this.layout?.positions.has(id)){
            const entry=this.entries.get(id),parent=this.point(this.entries.get(entry.parentId)),relative=this.constrainPlacement(entry,{dx:point.x-parent.x,dy:point.y-parent.y});
            const base=this.layout.positions.get(id),baseParent=this.layout.positions.get(entry.parentId)||{dx:0,dy:0},baseRadius=Math.hypot(base.dx-baseParent.dx,base.dy-baseParent.dy);
            const placement={parentId:entry.parentId,angle:Math.atan2(relative.dy,relative.dx),radius:Math.hypot(relative.dx,relative.dy)*(this.particles.get(id)?.orbitRadius||baseRadius)/Math.max(1,baseRadius)};
            this.manual.set(id,placement);this.arrangementRevision++;
            this.releases.set(id,{point:{x:point.x,y:point.y},started:this.now()});return placement;
        }
    }
    onPhysicalRest(){this.world.anchorFollow=null;}
    get animating() {return (!!this.anchorId||this.exiting)&&(this.progress<1||this.releases.size>0||this.inspectionProgress<1);}
}
