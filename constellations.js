// Named sets of canonical IDs. No parents, content owners, or persistent edges.
const galaxyConstellations = {
    galaxyIds(memberIds, entries) {
        const ids = new Set();
        for (const id of memberIds) {
            let entry = entries.get(id);
            const visited = new Set();
            while (entry?.parentId && !visited.has(entry.id)) {
                visited.add(entry.id); entry = entries.get(entry.parentId);
            }
            if (entry && !entry.parentId) ids.add(entry.id);
        }
        return ids;
    },
    normalizeAll(records, entries) {
        const seen = new Set(), result = [];
        for (const record of records) {
            if (!record || typeof record.id !== "string" || !record.id.trim() || record.id.length > 150 || entries.has(record.id) || seen.has(record.id) ||
                typeof record.name !== "string" || !record.name.trim() || record.name.trim().length > 60 || !Array.isArray(record.memberEntryIds) ||
                typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt))) continue;
            seen.add(record.id);
            result.push({ id: record.id, name: record.name.trim(), memberEntryIds: [...new Set(record.memberEntryIds.filter(id => entries.has(id)))], createdAt: record.createdAt });
        }
        return result;
    },
    canonicalId(id, entries, portals) {
        return entries.has(id) ? id : entries.has(portals.get(id)?.targetEntryId) ? portals.get(id).targetEntryId : null;
    },
    withoutEntries(records, removed) {
        return records.map(record => ({ ...record, memberEntryIds: record.memberEntryIds.filter(id => !removed.has(id)) }));
    },
    // Exact Prim MST for normal collections; bounded spatial candidates plus
    // Kruskal for large sets. Always n-1 edges, no complete rendered graph.
    pattern(points) {
        if (points.length < 2) return [];
        const distance = (a, b) => (a.x-b.x)**2 + (a.y-b.y)**2;
        if (points.length <= 128) {
            const used = new Set([0]), best = points.map((p,i) => i ? distance(points[0],p) : Infinity), parent = points.map(()=>0), edges=[];
            while (used.size < points.length) {
                let next=-1;
                for(let i=0;i<points.length;i++)if(!used.has(i)&&(next<0||best[i]<best[next]))next=i;
                edges.push({from:points[parent[next]].id,to:points[next].id}); used.add(next);
                for(let i=0;i<points.length;i++)if(!used.has(i)) { const d=distance(points[next],points[i]);if(d<best[i]){best[i]=d;parent[i]=next;} }
            }
            return edges;
        }
        const candidates=[],parent=points.map((_,i)=>i),rank=points.map(()=>0);
        const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
        for(const axis of ['x','y']) {
            const order=points.map((p,i)=>i).sort((a,b)=>points[a][axis]-points[b][axis]||points[a].id.localeCompare(points[b].id));
            for(let i=0;i<order.length;i++)for(let j=i+1;j<Math.min(i+9,order.length);j++)candidates.push({a:order[i],b:order[j],d:distance(points[order[i]],points[order[j]])});
        }
        candidates.sort((a,b)=>a.d-b.d||a.a-b.a||a.b-b.b);const edges=[];
        for(const edge of candidates) { let a=find(edge.a),b=find(edge.b);if(a===b)continue;
            if(rank[a]<rank[b])[a,b]=[b,a];parent[b]=a;if(rank[a]===rank[b])rank[a]++;
            edges.push({from:points[edge.a].id,to:points[edge.b].id});if(edges.length===points.length-1)break;
        }
        return edges;
    }
};

class ConstellationOverlay {
    constructor(element, project, {motion=null}={}) { this.element=element;this.project=project;this.motion=motion;this.edges=[]; }
    rebuild(points,{animate=false}={}) {
        this.clear();
        this.edges=galaxyConstellations.pattern(points).map(edge=>{
            const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.classList.add('constellation-line');
            line.dataset.from=edge.from;line.dataset.to=edge.to;this.element.append(line);return {...edge,line};
        });
        this.update();
        if(animate&&this.motion&&!this.motion.reduced){
            this.motion.play(this.element,[{opacity:.4},{opacity:1}],{duration:260,group:'constellation'});
            this.edges.forEach(({line},index)=>this.motion.drawLine(line,index,this.edges.length));
        }
    }
    update() {
        this.edges.forEach(({from,to,line})=>{const a=this.project(from),b=this.project(to);if(!a||!b)return;
            line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);
        });
    }
    clear() { this.edges.forEach(({line})=>this.motion?.cancelElement(line));this.motion?.cancelElement(this.element);this.edges=[];this.element.replaceChildren(); }
}
