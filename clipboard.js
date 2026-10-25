// Page-local clipboard. Entries/content are read afresh when Paste is confirmed.
class HierarchyClipboard {
    constructor(){this.copiedEntryIds=[];this.copiedRootIds=[];this.copiedAt=null;}
    copy(entries,ids){
        this.copiedEntryIds=[...new Set(ids)].filter(id=>entries.has(id));
        this.copiedRootIds=galaxyModel.effectiveRoots(entries,this.copiedEntryIds);
        this.copiedAt=Date.now();return this.copiedRootIds.length;
    }
    roots(entries){return galaxyModel.effectiveRoots(entries,this.copiedRootIds.filter(id=>entries.has(id)));}
    copyError(entries,destination){return hierarchyCopies.destinationValidator(entries,this.roots(entries))(destination);}
}

const hierarchyCopies = {
    // Validate independent projected IDs, not a Move of the original. Copying
    // inside the source/its descendants is finite and may be valid. No content,
    // attachment bytes or production IDs are allocated by this read-only index.
    destinationValidator(entries,roots,{structure=false,archivedGalaxies=[]}={}) {
        if(!roots.length||roots.some(id=>!entries.has(id)))return ()=> 'The copied items are no longer available.';
        roots=galaxyModel.effectiveRoots(entries,roots);
        const included=new Set();roots.forEach(id=>galaxyModel.subtreeIds(entries,id).forEach(child=>included.add(child)));
        const used=new Set(entries.keys()),remap=new Map();let next=0;
        for(const id of included){let fresh;do{fresh=`destination-check:${next++}`;}while(used.has(fresh));used.add(fresh);remap.set(id,fresh);}
        const rootSet=new Set(roots),copies=[...included].map(id=>{
            const source=entries.get(id);
            return {...source,id:remap.get(id),parentId:rootSet.has(id)?null:remap.get(source.parentId),
                description:structure?'':source.description,category:structure?'':source.category||''};
        });
        const combined=new Map([...entries,...copies.map(entry=>[entry.id,entry])]);
        const projectedRoots=roots.map(id=>combined.get(remap.get(id))),archived=new Set(archivedGalaxies.map(record=>record.galaxyId));
        return destination=>{
            if((destination!==null||!structure)&&!entries.has(destination))return 'Choose an available location.';
            if(structure&&roots.some(id=>entries.get(id).parentId==null)&&destination!==null)return 'A Galaxy structure belongs at Universe level.';
            if(destination!==null&&[entries.get(destination),...galaxyModel.ancestors(entries,destination)].some(entry=>archived.has(entry.id)))return 'Choose a location in an active Galaxy.';
            projectedRoots.forEach(entry=>entry.parentId=destination);
            for(const entry of copies){const error=galaxyModel.validateChange(entry,combined);if(error)return error;}
            return '';
        };
    },
    prepare(snapshot,roots,destination,newId,{topLevel=false}={}) {
        const entries=new Map(snapshot.entries.map(entry=>[entry.id,entry]));
        if((!entries.has(destination)&&!(topLevel&&destination===null))||!roots.length||roots.some(id=>!entries.has(id)))throw new Error('The copied items or destination are no longer available.');
        roots=galaxyModel.effectiveRoots(entries,roots);
        if(!roots.length)throw new Error('The copied items are no longer available.');
        const included=new Set();roots.forEach(id=>galaxyModel.subtreeIds(entries,id).forEach(child=>included.add(child)));
        const used=new Set([...entries.keys(),...(snapshot.portals||[]).map(p=>p.id)]),fresh=()=>{const id=newId();if(!id||used.has(id))throw new Error('Could not allocate independent item IDs.');used.add(id);return id;};
        const remap=new Map([...included].map(id=>[id,fresh()])),rootSet=new Set(roots),now=new Date().toISOString();
        const parentId=id=>rootSet.has(id)?destination:remap.get(entries.get(id).parentId);
        return {entries,roots,included,fresh,remap,now,parentId};
    },
    structure(snapshot,rootId,name,newId,{x=0,y=0,destination}={}) {
        if(typeof rootId!=='string'||typeof name!=='string')throw new Error('Choose one item and enter a name.');
        const source=snapshot.entries.find(entry=>entry.id===rootId);
        if(!source)throw new Error('This item no longer exists.');
        if(destination===undefined)destination=source.parentId??null;
        const error=this.destinationValidator(new Map(snapshot.entries.map(entry=>[entry.id,entry])),[rootId],{structure:true,archivedGalaxies:snapshot.archivedGalaxies})(destination);
        if(error)throw new Error(error);
        const {entries,included,remap,now,parentId}=this.prepare(snapshot,[rootId],destination,newId,{topLevel:true});
        // An allowlist keeps future content/metadata fields out of this operation.
        const copies=[...included].map(id=>({id:remap.get(id),name:id===rootId?name.trim():entries.get(id).name,
            parentId:parentId(id),description:'',category:'',x,y,createdAt:now,updatedAt:now,
            ...(entries.get(id).taskList === true ? {taskList:true} : {}),
            ...(entries.get(id===rootId?destination:entries.get(id).parentId)?.taskList === true ? {completed:false} : {})}));
        const combined=new Map([...entries,...copies.map(entry=>[entry.id,entry])]);
        for(const entry of copies){
            const error=galaxyModel.validateChange(entry,combined);
            if(error)throw new Error(error);
        }
        return {copies,links:[],files:[],rootIds:[remap.get(rootId)],sourceIds:[...included],remap};
    },
    plan(snapshot,roots,destination,newId) {
        const error=this.destinationValidator(new Map(snapshot.entries.map(entry=>[entry.id,entry])),roots,{archivedGalaxies:snapshot.archivedGalaxies})(destination);
        if(error)throw new Error(error);
        const {entries,included,fresh,remap,now,parentId,roots:normalizedRoots}=this.prepare(snapshot,roots,destination,newId);
        const files=[];
        const copies=[...included].map(id=>{
            const source=entries.get(id),copy=structuredClone(source);copy.id=remap.get(id);
            copy.parentId=parentId(id);
            copy.x=entries.get(destination).x;copy.y=entries.get(destination).y;
            copy.createdAt=copy.updatedAt=now;
            for(const key of ['role','depth','seedLayout','protected','template'])delete copy[key];
            if(copy.content){
                copy.content.links.forEach(link=>{link.id=fresh();});
                copy.content.attachments.forEach(file=>{
                    const old={...file};file.id=fresh();file.storageKey=file.id;file.entryId=copy.id;file.createdAt=now;
                    files.push({source:old,metadata:file});
                });
                if(!galaxyModel.normalizeContent(copy.content,copy.id))throw new Error('Copied content is invalid.');
            }
            return copy;
        });
        // Only wholly internal placements are safe to reproduce. External
        // placements/memberships deliberately stay with the originals.
        const links=(snapshot.portals||[]).filter(p=>included.has(p.parentEntryId)&&included.has(p.targetEntryId))
            .map(p=>({...p,id:fresh(),parentEntryId:remap.get(p.parentEntryId),targetEntryId:remap.get(p.targetEntryId),createdAt:now}));
        const combined=new Map([...entries,...copies.map(entry=>[entry.id,entry])]);
        for(const entry of copies){
            const error=galaxyModel.validateChange(entry,combined);
            if(error)throw new Error(error);
        }
        return {copies,links,files,rootIds:normalizedRoots.map(id=>remap.get(id)),sourceIds:[...included],remap};
    }
};
