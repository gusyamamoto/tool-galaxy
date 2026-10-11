// Page-local clipboard. Entries/content are read afresh when Paste is confirmed.
class HierarchyClipboard {
    constructor(){this.copiedEntryIds=[];this.copiedRootIds=[];this.copiedAt=null;}
    copy(entries,ids){
        this.copiedEntryIds=[...new Set(ids)].filter(id=>entries.has(id));
        this.copiedRootIds=galaxyModel.effectiveRoots(entries,this.copiedEntryIds);
        this.copiedAt=Date.now();return this.copiedRootIds.length;
    }
    roots(entries){return galaxyModel.effectiveRoots(entries,this.copiedRootIds.filter(id=>entries.has(id)));}
    linkError(entries,portals,destination,roots=this.roots(entries)){
        if(!roots.length)return 'The copied items are no longer available.';
        for(const id of roots){
            const error=galaxyPortals.placementError(entries,portals,id,destination);
            if(error)return error;
            if(id===destination||entries.get(id).parentId===destination)return 'This item is already here.';
        }
        return '';
    }
}

const hierarchyCopies = {
    plan(snapshot,roots,destination,newId) {
        const entries=new Map(snapshot.entries.map(entry=>[entry.id,entry]));
        if(!entries.has(destination)||!roots.length||roots.some(id=>!entries.has(id)))throw new Error('The copied items or destination are no longer available.');
        roots=galaxyModel.effectiveRoots(entries,roots);
        if(!roots.length)throw new Error('The copied items are no longer available.');
        const included=new Set();roots.forEach(id=>galaxyModel.subtreeIds(entries,id).forEach(child=>included.add(child)));
        const used=new Set([...entries.keys(),...(snapshot.portals||[]).map(p=>p.id)]),fresh=()=>{const id=newId();if(!id||used.has(id))throw new Error('Could not allocate independent item IDs.');used.add(id);return id;};
        const remap=new Map([...included].map(id=>[id,fresh()])),rootSet=new Set(roots),files=[],now=new Date().toISOString();
        const copies=[...included].map(id=>{
            const source=entries.get(id),copy=structuredClone(source);copy.id=remap.get(id);
            copy.parentId=rootSet.has(id)?destination:remap.get(source.parentId);
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
        return {copies,links,files,rootIds:roots.map(id=>remap.get(id)),sourceIds:[...included],remap};
    }
};
