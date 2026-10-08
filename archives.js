// Archive state is additive metadata over canonical entries, never a second copy
// of content or files. Active projections use a separate map; snapshots join both.
const galaxyArchives = {
    normalize(records, entries) {
        if (!Array.isArray(records)) throw new Error('Invalid archived Galaxy state.');
        const result = new Map();
        for (const record of records) {
            const root = entries.get(record?.galaxyId);
            if (!root || root.parentId || root.depth !== 0 || result.has(root.id) ||
                typeof record.archivedAt !== 'string' || !Number.isFinite(Date.parse(record.archivedAt)) ||
                (record.expandedIds != null && (!Array.isArray(record.expandedIds) || record.expandedIds.some(id => typeof id !== 'string'))))
                throw new Error('Invalid archived Galaxy state.');
            const ids = galaxyModel.subtreeIds(entries, root.id);
            result.set(root.id, { galaxyId: root.id, archivedAt: record.archivedAt,
                ...(record.expandedIds ? { expandedIds: [...new Set(record.expandedIds)].filter(id => ids.has(id)) } : {}) });
        }
        return result;
    },
    split(entries, records) {
        const archived = new Map();
        records.forEach(record => galaxyModel.subtreeIds(entries, record.galaxyId).forEach(id => archived.set(id, entries.get(id))));
        archived.forEach((_, id) => entries.delete(id));
        return archived;
    },
    join(active, archived) { return new Map([...archived, ...active]); }
};

// Cached presentation echoes use bounded compositor timelines. Saved world
// coordinates, physics and storage stay independent of animation completion.
class GalaxyArchiveMotion {
    constructor(host) {
        this.host = host; this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.transitions = new Set();
    }
    capture(region, bodyNodes, center) {
        if (document.hidden) return null;
        const layer = document.createElement('div'); layer.className = 'galaxy-archive-echo';
        layer.inert = true; layer.setAttribute('aria-hidden', 'true');
        const group = document.createElement('div'); group.className = 'galaxy-archive-collapse'; layer.append(group);
        const viewport = this.host.getBoundingClientRect(), points = [];
        if (region && region.renderOpacity > .02 && region.dataset.culled !== 'true') {
            const rect = region.getBoundingClientRect(), canvas = document.createElement('canvas');
            canvas.width = canvas.height = 512;
            try { canvas.getContext('2d').drawImage(region, 0, 0); } catch { /* Bodies still provide the echo. */ }
            Object.assign(canvas.style, { position: 'absolute', left: `${rect.left-viewport.left}px`, top: `${rect.top-viewport.top}px`,
                width: `${rect.width}px`, height: `${rect.height}px`, opacity: region.renderOpacity });
            group.append(canvas); points.push({ x: rect.left-viewport.left+rect.width/2, y: rect.top-viewport.top+rect.height/2 });
        }
        for (const node of bodyNodes) {
            if (node.dataset.body === 'galaxy' || node.dataset.culled === 'true' || node.dataset.semanticHidden === 'true') continue;
            const style = getComputedStyle(node);
            if (Number(style.opacity) < .02) continue;
            const rect = node.getBoundingClientRect();
            if (rect.right < viewport.left || rect.left > viewport.right || rect.bottom < viewport.top || rect.top > viewport.bottom) continue;
            const copy = node.cloneNode(true);
            copy.removeAttribute('id'); copy.removeAttribute('data-entry-id'); copy.removeAttribute('aria-pressed'); copy.removeAttribute('title');
            copy.querySelectorAll('.node-label,.node-hit-area').forEach(element => element.remove());
            copy.classList.remove('selected','dragging','label-priority','content-drop-target');
            Object.assign(copy.style, { position: 'absolute', left: `${rect.left-viewport.left}px`, top: `${rect.top-viewport.top}px`,
                width: `${rect.width}px`, height: `${rect.height}px`, transform: 'none', opacity: style.opacity,
                outline: 'none', transition: 'none', pointerEvents: 'none' });
            copy.style.setProperty('--surface-detail', style.getPropertyValue('--surface-detail') || '1');
            group.append(copy); points.push({ x: rect.left-viewport.left+rect.width/2, y: rect.top-viewport.top+rect.height/2 });
        }
        if (!points.length) return null;
        if (center.x < 0 || center.x > viewport.width || center.y < 0 || center.y > viewport.height)
            center = { x: points.reduce((sum,p)=>sum+p.x,0)/points.length, y: points.reduce((sum,p)=>sum+p.y,0)/points.length };
        center = { x: Math.max(16,Math.min(viewport.width-16,center.x)), y: Math.max(16,Math.min(viewport.height-16,center.y)) };
        group.style.transformOrigin = `${center.x}px ${center.y}px`;
        layer.dataset.centerX=center.x;layer.dataset.centerY=center.y;
        const hue=bodyNodes.find(node=>node?.dataset.body==='galaxy')?.style.getPropertyValue('--body-hue')||'205';
        layer.style.setProperty('--energy-hue',hue);
        if (!this.reduced) this.energy(layer,center);
        return layer;
    }
    energy(layer,center) {
        const ring=document.createElement('span');ring.className='galaxy-energy-ring';
        ring.innerHTML='<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M16 69C5 34 45 13 82 30C112 44 112 76 83 90"/><path d="M99 43C116 76 74 108 37 90C13 78 9 58 21 43"/></svg>';
        const glow=document.createElement('span');glow.className='galaxy-energy-core';
        const point=document.createElement('span');point.className='galaxy-archive-core';
        for(const element of [ring,glow,point]){Object.assign(element.style,{left:`${center.x}px`,top:`${center.y}px`});layer.append(element);}
    }
    track(layer,animations,duration,kind) {
        const record={layer,animations,timer:null,kind,finish:null};this.transitions.add(record);
        let finished=false;
        record.finish=()=>{if(finished)return;finished=true;clearTimeout(record.timer);animations.forEach(a=>a.cancel());layer?.remove();this.transitions.delete(record);};
        Promise.allSettled(animations.map(a=>a.finished)).then(record.finish);
        record.timer=setTimeout(record.finish,duration+160);
        return record;
    }
    implode(layer) {
        if (!layer || document.hidden) return;
        this.host.append(layer);layer.dataset.transition='archive';
        const group=layer.querySelector('.galaxy-archive-collapse'),ring=layer.querySelector('.galaxy-energy-ring'),
            glow=layer.querySelector('.galaxy-energy-core'),point=layer.querySelector('.galaxy-archive-core');
        const duration=this.reduced?110:780,animations=[];
        try {
            animations.push(group.animate(this.reduced?[{transform:'scale(1)',opacity:1},{transform:'scale(.94)',opacity:0}]:[
                {transform:'scale(1) rotate(0deg)',opacity:1},
                {transform:'scale(.9) rotate(-3deg)',opacity:.96,offset:.18},
                {transform:'scale(.54) rotate(-8deg)',opacity:.85,offset:.5},
                {transform:'scale(.18) rotate(-14deg)',opacity:.5,offset:.74},
                {transform:'scale(.025) rotate(-18deg)',opacity:0,offset:.88},
                {transform:'scale(.012) rotate(-18deg)',opacity:0}],{duration,easing:'linear',fill:'forwards'}));
            if(ring)animations.push(ring.animate([
                {transform:'translate(-50%,-50%) rotate(-24deg) scale(1)',opacity:0},
                {transform:'translate(-50%,-50%) rotate(-38deg) scale(.8)',opacity:.32,offset:.28},
                {transform:'translate(-50%,-50%) rotate(-64deg) scale(.3)',opacity:.26,offset:.7},
                {transform:'translate(-50%,-50%) rotate(-76deg) scale(.04)',opacity:0,offset:.88},
                {transform:'translate(-50%,-50%) rotate(-76deg) scale(.04)',opacity:0}],{duration,easing:'ease-in',fill:'forwards'}));
            if(glow)animations.push(glow.animate([
                {transform:'translate(-50%,-50%) scale(.12)',opacity:0},
                {transform:'translate(-50%,-50%) scale(.35)',opacity:.18,offset:.4},
                {transform:'translate(-50%,-50%) scale(1)',opacity:.8,offset:.73},
                {transform:'translate(-50%,-50%) scale(.14)',opacity:.2,offset:.87},
                {transform:'translate(-50%,-50%) scale(.025)',opacity:0}],{duration,easing:'linear',fill:'forwards'}));
            if(point)animations.push(point.animate([
                {transform:'translate(-50%,-50%) scale(.1)',opacity:0},
                {transform:'translate(-50%,-50%) scale(.1)',opacity:0,offset:.7},
                {transform:'translate(-50%,-50%) scale(1)',opacity:.9,offset:.85},
                {transform:'translate(-50%,-50%) scale(.08)',opacity:0}],{duration,easing:'ease-in',fill:'forwards'}));
            this.track(layer,animations,duration,'archive');
        } catch { animations.forEach(a=>a.cancel());layer.remove(); }
    }
    restore(elements,center) {
        if(document.hidden)return;
        const visible=elements.filter(Boolean).filter(el=>el.dataset.culled!=='true'&&el.dataset.semanticHidden!=='true');
        const region=visible.find(el=>el.tagName==='CANVAS'),bodies=visible.filter(el=>el.classList.contains('entry-node'));
        if(!visible.length)return;
        center ||= {x:this.host.clientWidth/2,y:this.host.clientHeight/2};
        let layer;try{layer=this.capture(region,bodies,center);}catch{return;}
        if(!layer)return;
        layer.dataset.transition='restore';this.host.append(layer);
        const group=layer.querySelector('.galaxy-archive-collapse'),ring=layer.querySelector('.galaxy-energy-ring'),
            glow=layer.querySelector('.galaxy-energy-core'),point=layer.querySelector('.galaxy-archive-core');
        const duration=this.reduced?140:560,animations=[],rank={sun:0,planet:1,moon:2,satellite:3,astronaut:4};
        try {
            if(this.reduced){
                animations.push(group.animate([{transform:'scale(.94)',opacity:0},{transform:'scale(1)',opacity:1,offset:.65},{transform:'scale(1)',opacity:0}],{duration,easing:'ease-out',fill:'forwards'}));
                visible.forEach(el=>animations.push(el.animate([{opacity:0},{opacity:0,offset:.5},{opacity:getComputedStyle(el).opacity}],{duration,fill:'backwards'})));
            }else{
                // Five role groups emerge in order. Live bodies keep their saved
                // coordinates and normal physics underneath these inert echoes.
                const buckets=new Map(),origin=group.style.transformOrigin;
                [...group.children].forEach(copy=>{
                    const role=copy.tagName==='CANVAS'?'cloud':copy.dataset.body;
                    if(!buckets.has(role)){const bucket=document.createElement('div');bucket.className='galaxy-restore-band';bucket.style.transformOrigin=origin;group.append(bucket);buckets.set(role,bucket);}
                    buckets.get(role).append(copy);
                });
                const timing=role=>role==='cloud'?{delay:80,length:480}:{delay:70+(rank[role]||0)*42,length:322};
                buckets.forEach((bucket,role)=>{const {delay,length}=timing(role);
                    animations.push(bucket.animate([{transform:'scale(.045) rotate(7deg)',opacity:0},
                        {transform:'scale(.3) rotate(4deg)',opacity:.9,offset:.32},
                        {transform:'scale(.92) rotate(.5deg)',opacity:1,offset:.75},
                        {transform:'scale(1) rotate(0deg)',opacity:0}],{duration:length,delay,easing:'cubic-bezier(.2,.65,.25,1)',fill:'both'}));
                });
                visible.forEach(el=>{
                    if(el.dataset.body==='galaxy')animations.push(el.animate([{opacity:0},{opacity:0,offset:.3},{opacity:getComputedStyle(el).opacity}],{duration:320,fill:'backwards'}));
                    else{const {delay,length}=timing(el.tagName==='CANVAS'?'cloud':el.dataset.body);
                        animations.push(el.animate([{opacity:0},{opacity:0,offset:.7},{opacity:getComputedStyle(el).opacity}],{duration:length,delay,fill:'backwards'}));}
                });
                if(point)animations.push(point.animate([{transform:'translate(-50%,-50%) scale(.25)',opacity:0},
                    {transform:'translate(-50%,-50%) scale(.7)',opacity:.8,offset:.14},
                    {transform:'translate(-50%,-50%) scale(.35)',opacity:0,offset:.48},
                    {transform:'translate(-50%,-50%) scale(.1)',opacity:0}],{duration,fill:'forwards'}));
                if(glow)animations.push(glow.animate([{transform:'translate(-50%,-50%) scale(.1)',opacity:0},
                    {transform:'translate(-50%,-50%) scale(.8)',opacity:.6,offset:.28},
                    {transform:'translate(-50%,-50%) scale(.4)',opacity:0,offset:.75},
                    {transform:'translate(-50%,-50%) scale(.1)',opacity:0}],{duration,fill:'forwards'}));
                if(ring)animations.push(ring.animate([{transform:'translate(-50%,-50%) rotate(-70deg) scale(.04)',opacity:0},
                    {transform:'translate(-50%,-50%) rotate(-55deg) scale(.3)',opacity:.3,offset:.25},
                    {transform:'translate(-50%,-50%) rotate(-24deg) scale(1)',opacity:.15,offset:.72},
                    {transform:'translate(-50%,-50%) rotate(-18deg) scale(1.08)',opacity:0}],{duration,easing:'ease-out',fill:'forwards'}));
            }
            this.track(layer,animations,duration,'restore');
        } catch {animations.forEach(a=>a.cancel());layer.remove();}
    }
    clear() { [...this.transitions].forEach(record=>record.finish()); }
    setReducedMotion(value) { this.reduced=value;this.clear(); }
}
