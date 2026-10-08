// Disposable screen-space label decisions, independent of physics and storage.
class LabelDensity {
    constructor({ interval = 120, restoreDelay = 240 } = {}) {
        this.interval = interval; this.restoreDelay = restoreDelay; this.states = new Map();
        this.frame = null; this.timer = null; this.trailingTimer = null; this.lastRun = -Infinity; this.hiddenIds = new Set(); this.cost = 0;
    }
    resolve(candidates, now) {
        const accepted = new Map(), grid = new Map(), hidden = new Set(), size = 96;
        const cells = rect => {
            const keys=[];
            for(let x=Math.floor(rect.left/size);x<=Math.floor(rect.right/size);x++)
                for(let y=Math.floor(rect.top/size);y<=Math.floor(rect.bottom/size);y++)keys.push(`${x}:${y}`);
            return keys;
        };
        const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)-2)*
            Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)-2);
        let recheck=false;
        candidates.sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
        for(const candidate of candidates) {
            const keys=cells(candidate.rect),neighbors=new Set(keys.flatMap(key=>grid.get(key)||[]));
            const previous=this.states.get(candidate.id),threshold=previous?.hidden ? .08 : .24;
            const area=Math.max(1,(candidate.rect.right-candidate.rect.left)*(candidate.rect.bottom-candidate.rect.top));
            const blocked=!candidate.protected&&[...neighbors].some(id=>{const other=accepted.get(id).rect;
                const reference=Math.min(area,Math.max(1,(other.right-other.left)*(other.bottom-other.top)));
                return overlap(candidate.rect,other)>reference*threshold;});
            let suppress=blocked,clearSince=null;
            if(!blocked&&!candidate.protected&&previous?.hidden) {
                clearSince=previous.clearSince??now;
                suppress=now-clearSince<this.restoreDelay;recheck ||= suppress;
            }
            this.states.set(candidate.id,{hidden:suppress,clearSince});
            if(suppress){hidden.add(candidate.id);continue;}
            accepted.set(candidate.id,candidate);keys.forEach(key=>{if(!grid.has(key))grid.set(key,[]);grid.get(key).push(candidate.id);});
        }
        const ids=new Set(candidates.map(c=>c.id));this.states.forEach((_,id)=>{if(!ids.has(id))this.states.delete(id);});
        return {hidden,recheck};
    }
    request(read, force=false) {
        this.read=read;
        if(this.frame!==null||document.hidden)return;
        const remaining=this.interval-(performance.now()-this.lastRun);
        if(!force&&remaining>0){
            // A final camera update can land inside the throttle window after
            // physics has stopped. Measure that latest view once, so labels do
            // not retain collision decisions from the preceding zoom scale.
            if(this.trailingTimer===null)this.trailingTimer=setTimeout(()=>{this.trailingTimer=null;this.request(this.read,true);},remaining);
            return;
        }
        clearTimeout(this.trailingTimer);this.trailingTimer=null;
        this.frame=requestAnimationFrame(()=>{
            this.frame=null;const start=performance.now();this.lastRun=start;
            // Read all projected rectangles first, then write suppression flags:
            // one layout measurement batch, never alternating reads and writes.
            const {candidates,labels}=this.read(),result=this.resolve(candidates,start);
            this.hiddenIds=result.hidden;
            labels.forEach(({id,label,eligible})=>{const value=String(!eligible||result.hidden.has(id));
                if(label.dataset.densityHidden!==value)label.dataset.densityHidden=value;
            });
            this.cost=performance.now()-start;
            clearTimeout(this.timer);this.timer=null;
            if(result.recheck)this.timer=setTimeout(()=>{this.timer=null;this.request(this.read,true);},this.restoreDelay+10);
        });
    }
    destroy(){if(this.frame!==null)cancelAnimationFrame(this.frame);clearTimeout(this.timer);clearTimeout(this.trailingTimer);this.frame=this.timer=this.trailingTimer=null;this.states.clear();}
}
