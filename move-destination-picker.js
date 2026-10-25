// Disposable destination/read index. Confirmation still uses the existing model validator.
class MoveDestinationIndex {
    constructor(entries, sourceId, validate=(entry,data)=>galaxyModel.validateChange(entry,data)) {
        const source=entries.get(sourceId);
        if(!source)throw new Error('This item is no longer available.');
        Object.assign(this,{allEntries:entries,sourceId,validate,currentParentId:source.parentId||null});
        this.paths=new Map();
        const index=cosmosHierarchy.index(entries);
        for(const {id} of cosmosHierarchy.visible(entries,index,new Set(entries.keys()))) {
            const entry=entries.get(id),parentPath=this.paths.get(entry.parentId);
            this.paths.set(id,parentPath?`${parentPath} › ${entry.name}`:entry.name);
        }
        this.entries=new Map([...entries].filter(([id])=>this.allowed(id)));
        // Normalize/sort once per opening, not once per keystroke or rendered row.
        this.searchRows=[...this.entries.values()].sort((a,b)=>a.name.localeCompare(b.name))
            .map(entry=>({entry,name:entry.name.toLocaleLowerCase()}));
    }
    allowed(parentId) {
        const source=this.allEntries.get(this.sourceId);
        return !!source&&(parentId===null||this.allEntries.has(parentId))
            &&!this.validate({...source,category:source.category||'',parentId},this.allEntries);
    }
    path(id) {return id===null?'Universe':this.paths.get(id)||'Unavailable destination';}
    ancestry(id) {return this.path(this.allEntries.get(id)?.parentId||null);}
    expandedPath() {
        return new Set(this.currentParentId?[this.currentParentId,...galaxyModel.ancestors(this.allEntries,this.currentParentId).map(entry=>entry.id)]:[]);
    }
    search(query) {
        const term=query.trim().toLocaleLowerCase(),prefix=[],other=[];
        if(!term)return [];
        for(const row of this.searchRows)if(row.name.includes(term))(row.name.startsWith(term)?prefix:other).push(row.entry);
        return prefix.concat(other);
    }
}

// Shared destination controller. Move keeps its existing defaults; independent
// structure duplication supplies its validator and permits the current location.
class MoveDestinationPicker {
    constructor({list,search,universe,current,selection,confirm,getEntries,onSelect,
        createIndex=(entries,id)=>new MoveDestinationIndex(entries,id),allowCurrent=false,selectionPrefix='Move to: ',showPath=false}) {
        Object.assign(this,{search,universe,current,selection,confirm,getEntries,onSelect,createIndex,allowCurrent,selectionPrefix,showPath});
        this.choices=new CanonicalSinglePicker({list,search,getEntries:()=>this.index.entries,
            included:id=>!this.allowCurrent&&id===this.index.currentParentId,includedLabel:'Current location',
            searchEntries:query=>this.index.search(query),ancestryFor:id=>this.index.ancestry(id),
            onSelect:id=>this.select(id===null?undefined:id)});
        universe.addEventListener('click',()=>this.select(null));
    }
    open(sourceId) {
        this.index=this.createIndex(this.getEntries(),sourceId);
        this.current.textContent=this.index.path(this.index.currentParentId);this.current.title=this.current.textContent;
        this.universe.disabled=(!this.allowCurrent&&this.index.currentParentId===null)||!this.index.allowed(null);
        this.choices.reset({expanded:this.index.expandedPath()});
        if(this.allowCurrent)this.select(this.index.currentParentId);
    }
    select(id) {
        if(id!==undefined&&((!this.allowCurrent&&id===this.index.currentParentId)||!this.index.allowed(id)))return false;
        this.destinationId=id;
        if(this.choices.selectedId!==(id||null)) {this.choices.selectedId=id||null;this.choices.render();}
        this.universe.setAttribute('aria-pressed',String(id===null));
        if(this.selection) {
            const name=document.createElement('strong'),path=document.createElement('small');
            const destinationName=id===undefined?'':id===null?'Universe':this.index.allEntries.get(id).name;
            const ambiguous=id!==undefined&&id!==null&&this.index.searchRows.some(row=>row.entry.id!==id&&row.name===destinationName.toLocaleLowerCase());
            name.textContent=id===undefined?'':`${this.selectionPrefix}${destinationName}`;
            path.textContent=id!==undefined&&(this.showPath||ambiguous)?this.index.path(id):'';path.hidden=!path.textContent;
            this.selection.replaceChildren(name,path);this.selection.title=id===undefined?'':this.index.path(id);
            this.selection.parentElement.hidden=id===undefined;
        }
        this.confirm.disabled=id===undefined;
        this.onSelect(id);
        return true;
    }
}
