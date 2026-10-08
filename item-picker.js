// Shared row presentation; choices always reference canonical items, not placements.
function createCanonicalPickerRow(entry, ancestry) {
    const item=document.createElement('li'),expand=document.createElement('button'),choice=document.createElement('button');
    item.className='picker-entry-row';item.setAttribute('role','none');expand.type=choice.type='button';expand.className='picker-expand';expand.dataset.expandId=entry.id;expand.tabIndex=-1;
    const arrow=document.createElement('span');arrow.textContent='›';arrow.ariaHidden='true';expand.append(arrow);
    choice.className='picker-choice';choice.dataset.entryId=entry.id;
    const check=document.createElement('span'),info=document.createElement('span'),name=document.createElement('span'),path=document.createElement('small'),added=document.createElement('span');
    check.className='picker-check';check.ariaHidden='true';info.className='picker-entry-info';name.className='picker-entry-name';name.textContent=entry.name;
    path.textContent=ancestry;added.className='picker-added';added.textContent='Added';info.append(name,path);choice.append(check,info,added);
    choice.title=`${entry.name}\n${ancestry}`;item.append(expand,choice);return {item,expand,choice,check,path,added};
}

class CanonicalSinglePicker {
    constructor({list,search,getEntries,included,onSelect}) {
        Object.assign(this,{list,search,getEntries,included,onSelect});
        list.addEventListener('click',event=>{
            const expand=event.target.closest('[data-expand-id]'),choice=event.target.closest('[data-entry-id]');
            if(expand)this.toggle(expand.dataset.expandId);
            else if(choice)this.select(choice.dataset.entryId);
        });
        list.addEventListener('focusin',event=>{const id=event.target.closest('[data-entry-id]')?.dataset.entryId;if(id){this.focusId=id;this.rows.forEach((row,key)=>row.choice.tabIndex=key===id?0:-1);}});
        list.addEventListener('keydown',event=>this.key(event));
        search.addEventListener('input',()=>this.render());
        search.addEventListener('keydown',event=>{if(['Enter','ArrowDown'].includes(event.key)){event.preventDefault();list.querySelector('[data-entry-id]')?.focus();}});
    }
    reset(){this.entries=this.getEntries();this.index=cosmosHierarchy.index(this.entries);this.expanded=new Set(this.index.roots);this.rows=new Map();this.focusId=null;this.selectedId=null;this.search.value='';this.render();this.onSelect(null);}
    render(){
        if(!this.entries)return;
        const searching=!!this.search.value.trim(),scroll=this.list.scrollTop;
        const visible=searching?galaxyModel.search(this.entries,this.search.value).map(entry=>({id:entry.id,level:1})):cosmosHierarchy.visible(this.entries,this.index,this.expanded);
        this.list.setAttribute('role',searching?'listbox':'tree');this.list.setAttribute('aria-multiselectable','false');
        if(!visible.some(row=>row.id===this.focusId))this.focusId=visible[0]?.id;
        const fragment=document.createDocumentFragment();
        visible.forEach(({id,level,position,size})=>{
            const entry=this.entries.get(id),ancestry=galaxyModel.ancestors(this.entries,id).reverse().map(parent=>parent.name).join(' › ')||'Universe';
            const row=this.rows.get(id)||createCanonicalPickerRow(entry,ancestry);this.rows.set(id,row);
            const children=this.index.children.get(id)||[],added=this.included(id),selected=this.selectedId===id;
            row.item.style.setProperty('--picker-indent',`${Math.min(48,level<=5?(level-1)*9:36+6*Math.log2(level-4))}px`);
            row.expand.hidden=searching||!children.length;row.expand.setAttribute('aria-expanded',String(this.expanded.has(id)));row.expand.ariaLabel=`${this.expanded.has(id)?'Collapse':'Expand'} ${entry.name}`;
            row.choice.setAttribute('role',searching?'option':'treeitem');row.choice.setAttribute('aria-selected',String(selected));row.choice.setAttribute('aria-disabled',String(added));
            if(searching)row.choice.removeAttribute('aria-level');else row.choice.setAttribute('aria-level',level);
            if(!searching&&children.length)row.choice.setAttribute('aria-expanded',String(this.expanded.has(id)));else row.choice.removeAttribute('aria-expanded');
            for(const [attribute,value] of [['aria-posinset',position],['aria-setsize',size]]){if(!searching)row.choice.setAttribute(attribute,value);else row.choice.removeAttribute(attribute);}
            row.choice.classList.toggle('is-selected',selected);row.choice.classList.toggle('picker-existing',added);row.choice.tabIndex=id===this.focusId?0:-1;
            row.choice.ariaLabel=`${entry.name}, ${ancestry}${added?', already here':''}`;row.check.textContent=selected||added?'✓':'';row.added.textContent='Already here';row.added.hidden=!added;
            row.path.hidden=!searching;fragment.append(row.item);
        });
        if(!visible.length){const empty=document.createElement('li');empty.className='picker-empty';empty.textContent='No matching items.';fragment.append(empty);}
        this.list.replaceChildren(fragment);this.list.scrollTop=scroll;
    }
    select(id){if(!this.entries?.has(id)||this.included(id))return;this.selectedId=this.selectedId===id?null:id;this.focusId=id;this.render();this.rows.get(id)?.choice.focus({preventScroll:true});this.onSelect(this.selectedId);}
    toggle(id){if(this.expanded.has(id))this.expanded.delete(id);else this.expanded.add(id);this.focusId=id;this.render();this.rows.get(id)?.choice.focus({preventScroll:true});}
    key(event){
        const id=event.target.closest('[data-entry-id]')?.dataset.entryId;if(!id)return;
        const buttons=[...this.list.querySelectorAll('[data-entry-id]')],index=buttons.indexOf(event.target),searching=!!this.search.value.trim();let target;
        if(['Enter',' '].includes(event.key)){event.preventDefault();this.select(id);return;}
        if(event.key==='ArrowDown')target=buttons[index+1];else if(event.key==='ArrowUp')target=buttons[index-1];else if(event.key==='Home')target=buttons[0];else if(event.key==='End')target=buttons.at(-1);
        else if(!searching&&event.key==='ArrowRight'&&this.index.children.get(id)?.length){if(!this.expanded.has(id)){event.preventDefault();this.toggle(id);return;}target=buttons[index+1];}
        else if(!searching&&event.key==='ArrowLeft'){if(this.expanded.has(id)&&this.index.children.get(id)?.length){event.preventDefault();this.toggle(id);return;}target=this.rows.get(this.entries.get(id)?.parentId)?.choice;}
        if(target){event.preventDefault();target.focus({preventScroll:true});target.scrollIntoView({block:'nearest'});}
    }
}
