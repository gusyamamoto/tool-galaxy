// A focused item's local territory is presentation state, not a saved layout.
// Keep this independent of camera zoom, particle positions and celestial roles:
// The primitive also arranges detail families without creating semantic worlds.
const cosmosLocalLayout = (() => {
    const layouts = new Map(), cacheLimit = 16, turn = Math.PI * 2;
    const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
    function hash(id) {
        let value = 2166136261;
        for (const char of id) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
        value = Math.imul(value ^ (value >>> 16), 2246822507) >>> 0;
        return value / 4294967296;
    }
    function boundedOffset(dx, dy, limit = 6) {
        dx = finite(dx, 0); dy = finite(dy, 0); limit = Math.max(0, finite(limit, 6));
        const distance = Math.hypot(dx, dy), factor = distance > limit ? limit / distance : 1;
        return { dx: dx * factor, dy: dy * factor };
    }
    function build(anchor, immediateChildren, options = {}) {
        if(options.includeDescendants)return buildDetailFamilies(anchor,immediateChildren,options);
        const mobile = options.mobile ?? (Number.isFinite(options.width) && options.width <= 600);
        const bodyRadius = Math.max(0, finite(options.bodyRadius, 0));
        const clearance = Math.max(32, finite(options.clearance, mobile ? 56 : 60));
        // Four-world-unit buckets prevent close-size rounding from continuously
        // rebuilding a local field while retaining enough body clearance.
        const innerRadius = Math.ceil(Math.max(mobile ? 154 : 180, bodyRadius + clearance,finite(options.minimumRadius,0)) / 4) * 4;
        const childSpacing = Math.max(mobile?76:82,finite(options.groupSpacing,0)),bandSpacing=Math.max(mobile?80:86,childSpacing*.65);
        const seen = new Set(), children = immediateChildren.filter(child => {
            if (typeof child?.id !== 'string' || child.id === anchor.id || seen.has(child.id) ||
                !options.includeDescendants && child.parentId !== undefined && child.parentId !== anchor.id) return false;
            seen.add(child.id); return true;
        }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        const margin = Math.max(32, Math.ceil(bodyRadius / 4) * 4);
        const signature = JSON.stringify([anchor.id, !!mobile, innerRadius, margin, childSpacing, children.map(child => child.id)]);
        if (layouts.has(signature)) {
            const saved = layouts.get(signature);
            layouts.delete(signature); layouts.set(signature, saved);
            return saved;
        }
        const positions = new Map(), rings = [], capacities = [];
        let capacity = 0;
        while (capacity < children.length) {
            const radius = innerRadius + rings.length * bandSpacing;
            const slots = Math.max(5, Math.floor(turn * radius / childSpacing));
            rings.push(radius); capacities.push(slots); capacity += slots;
        }
        // Share a nearly-full field across its bands. Adding a second band must
        // not strand a single child outside an otherwise full inner circle.
        const counts = capacities.map(slots => Math.floor(children.length * slots / capacity));
        let remainder = children.length - counts.reduce((sum, count) => sum + count, 0);
        for (let index = counts.length - 1; remainder > 0; index = (index - 1 + counts.length) % counts.length) {
            if (counts[index] < capacities[index]) { counts[index]++; remainder--; }
        }
        const phase = hash(anchor.id) * turn;
        let childIndex = 0, radius = 0;
        const extent = { left: -margin, right: margin, top: -margin, bottom: margin };
        counts.forEach((count, ring) => {
            const step = turn / count, ringPhase = phase + ring * .57;
            for (let index = 0; index < count; index++) {
                const child = children[childIndex++];
                const angle = ringPhase + index * step + (hash(`${child.id}:angle`) - .5) * step * .14;
                const childRadius = Math.max(innerRadius,
                    rings[ring] + (hash(`${child.id}:radius`) - .5) * bandSpacing * .18);
                const dx = Math.cos(angle) * childRadius, dy = Math.sin(angle) * childRadius;
                positions.set(child.id, Object.freeze({ dx, dy, radius: childRadius, ring, angle }));
                radius = Math.max(radius, childRadius);
                extent.left = Math.min(extent.left, dx - 32); extent.right = Math.max(extent.right, dx + 32);
                extent.top = Math.min(extent.top, dy - 32); extent.bottom = Math.max(extent.bottom, dy + 32);
            }
        });
        const result = Object.freeze({ positions, radius, innerRadius, rings: Object.freeze(rings),
            extent: Object.freeze(extent), signature });
        layouts.set(signature, result);
        if (layouts.size > cacheLimit) layouts.delete(layouts.keys().next().value);
        return result;
    }
    function buildDetailFamilies(anchor, descendants, options) {
        const mobile=options.mobile??false,entries=new Map(),children=new Map();
        descendants.forEach(entry=>{if(typeof entry?.id==='string'&&entry.id!==anchor.id)entries.set(entry.id,entry);});
        [...entries.values()].sort((a,b)=>a.id<b.id?-1:1).forEach(entry=>{
            if(!children.has(entry.parentId))children.set(entry.parentId,[]);
            children.get(entry.parentId).push(entry);
        });
        const roots=children.get(anchor.id)||[],branchCounts=new Map();
        const ordered=roots.slice();
        for(let index=0;index<ordered.length;index++)ordered.push(...(children.get(ordered[index].id)||[]));
        ordered.reverse().forEach(entry=>branchCounts.set(entry.id,(children.get(entry.id)||[]).reduce((sum,child)=>sum+1+(branchCounts.get(child.id)||0),0)));
        const familyRadius=count=>count?Math.min(mobile?140:160,(mobile?48:50)+Math.sqrt(count)*8):0;
        const footprint=Math.max(0,...roots.map(entry=>familyRadius(branchCounts.get(entry.id)||0)));
        const signature=JSON.stringify(['details',anchor.id,!!mobile,Math.round(options.bodyRadius||0),[...entries.values()].map(e=>[e.id,e.parentId]).sort((a,b)=>a[0]<b[0]?-1:1)]);
        if(layouts.has(signature)){const saved=layouts.get(signature);layouts.delete(signature);layouts.set(signature,saved);return saved;}
        // Allocate direct Moon children as groups. Their internal descendants
        // have their own small parent-relative positions, never another world.
        const groupSpacing=footprint?footprint*2+80:0;
        const rootField=build(anchor,roots,{...options,includeDescendants:false,
            groupSpacing,minimumRadius:Math.max(footprint?(options.bodyRadius||0)+footprint+32:0,
                roots.length>1&&roots.length<5?groupSpacing/(2*Math.sin(Math.PI/roots.length))+26:0)});
        const positions=new Map([...rootField.positions].map(([id,p])=>[id,Object.freeze({...p,parentId:anchor.id,groupId:id})]));
        const occupied=new Map(roots.map(entry=>[entry.id,[positions.get(entry.id)]]));
        const queue=roots.map(entry=>({entry,root:entry.id,level:0}));
        for(let index=0;index<queue.length;index++) {
            const {entry,root,level}=queue[index],parent=positions.get(entry.id),base=positions.get(root);
            const nested=children.get(entry.id)||[],limit=familyRadius(branchCounts.get(root)||0),spacing=mobile?34:42;
            // Subsequent small orbits turn deterministically so very deep
            // chains fold into their Satellite territory instead of running away.
            const phase=level===0?base.angle:base.angle+level*2.399963+hash(entry.id)*.5;
            const bands=[];let remaining=nested.length;
            for(let radius=mobile?55:52;remaining>0;radius+=spacing){
                const count=Math.min(remaining,Math.max(5,Math.floor(Math.PI*2*radius/(mobile?28:32))));
                bands.push({radius,count});remaining-=count;
            }
            let band=0,slot=0;
            nested.forEach(child=>{
                const {radius,count}=bands[band],spread=Math.PI*2/count;
                const angle=phase+(slot-(count-1)/2)*spread;
                let dx=parent.dx+Math.cos(angle)*radius,dy=parent.dy+Math.sin(angle)*radius;
                const bounded=boundedOffset(dx-base.dx,dy-base.dy,limit);
                dx=base.dx+bounded.dx;dy=base.dy+bounded.dy;
                // A folded deep chain must not return onto its Satellite or
                // another detail's touch area. Resolve within this family's
                // territory, preserving the actual parent-relative preference.
                const peers=occupied.get(root),preferred={dx,dy},separation=mobile?52:48;
                const score=p=>peers.reduce((sum,other)=>sum+Math.max(0,separation-Math.hypot(p.dx-other.dx,p.dy-other.dy))**2*1000,0)+
                    Math.hypot(p.dx-preferred.dx,p.dy-preferred.dy)**2*.15+Math.hypot(p.dx-parent.dx,p.dy-parent.dy)**2*.15;
                let best=preferred,bestScore=score(best);
                if(peers.some(p=>Math.hypot(dx-p.dx,dy-p.dy)<separation)) {
                    for(let band=0;band<4;band++)for(let step=0;step<24;step++) {
                        const direction=angle+step*turn/24,distance=separation+band*20;
                        const offset=boundedOffset(parent.dx-base.dx+Math.cos(direction)*distance,parent.dy-base.dy+Math.sin(direction)*distance,limit);
                        const candidate={dx:base.dx+offset.dx,dy:base.dy+offset.dy},cost=score(candidate);
                        if(cost<bestScore){best=candidate;bestScore=cost;}
                    }
                    dx=best.dx;dy=best.dy;
                }
                positions.set(child.id,Object.freeze({dx,dy,radius:Math.hypot(dx,dy),ring:base.ring,angle,parentId:entry.id,groupId:root}));
                peers.push(positions.get(child.id));
                queue.push({entry:child,root,level:level+1});
                if(++slot===count){band++;slot=0;}
            });
        }
        const extent={...rootField.extent};let radius=rootField.radius;
        positions.forEach(p=>{radius=Math.max(radius,Math.hypot(p.dx,p.dy));extent.left=Math.min(extent.left,p.dx-32);extent.right=Math.max(extent.right,p.dx+32);extent.top=Math.min(extent.top,p.dy-32);extent.bottom=Math.max(extent.bottom,p.dy+32);});
        const result=Object.freeze({...rootField,positions,extent:Object.freeze(extent),radius,groupRadius:footprint,signature});
        layouts.set(signature,result);while(layouts.size>cacheLimit)layouts.delete(layouts.keys().next().value);
        return result;
    }
    return { build, boundedOffset, clear() { layouts.clear(); } };
})();
