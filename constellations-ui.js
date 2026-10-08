// Presentation/workflows over collection references; persistence/navigation are injected.
class ConstellationWorkspace {
    constructor({entries,portals,collections,getActive,activate,inspect,commit,onModal,onModalClose,onLayout,showMembershipMenu,overview,onCollectionMenu,persist=true}) {
        Object.assign(this,{entries,portals,collections,getActive,activate,inspect,commit,onModal,onModalClose,onLayout,showMembershipMenu,overview,onCollectionMenu,persist});
        this.list=document.getElementById('constellation-list');this.nameDialog=document.getElementById('constellation-name-dialog');
        this.sectionToggle=document.getElementById('constellations-toggle');
        let preference={};try{if(persist)preference=JSON.parse(localStorage.getItem('galaxy:navigation-ui')||'{}')||{};}catch{/* Optional UI preferences. */}
        this.collapsed=typeof preference.constellationsCollapsed==='boolean'?preference.constellationsCollapsed:null;
        this.hasHadCollections=preference.constellationsSeen===true;this.initialized=false;
        this.sectionToggle.addEventListener('click',()=>{this.collapsed=!this.collapsed;this.applySectionState();this.saveSectionPreference();this.onLayout();});
        document.addEventListener('pointerdown',event=>{document.querySelectorAll('#constellation-content .content-item-menu[open]').forEach(menu=>{if(!menu.contains(event.target))menu.open=false;});});
        this.picker=document.getElementById('constellation-picker-dialog');this.deleteDialog=document.getElementById('delete-constellation-dialog');
        document.getElementById('new-constellation-button').addEventListener('click',()=>this.openName());
        document.getElementById('panel-add-member').addEventListener('click',()=>this.openPicker(this.getActive()));
        document.getElementById('rename-constellation-button').addEventListener('click',()=>this.openName(this.getActive()));
        document.getElementById('delete-constellation-button').addEventListener('click',()=>this.openDelete(this.getActive()));
        document.getElementById('constellation-name-form').addEventListener('submit',event=>{event.preventDefault();this.saveName();});
        this.pickerInput=document.getElementById('constellation-member-search');this.pickerList=document.getElementById('constellation-picker-results');
        this.pickerAdd=document.getElementById('confirm-constellation-entries');this.pickerSelection=new Set();
        document.getElementById('constellation-picker-form').addEventListener('submit',event=>{event.preventDefault();this.addPickerEntries();});
        this.pickerInput.addEventListener('input',()=>{this.limit=100;this.renderPicker();});
        this.pickerInput.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='Enter'){event.preventDefault();this.pickerList.querySelector('button[data-entry-id]')?.focus();}});
        this.pickerList.addEventListener('click',event=>{
            const expand=event.target.closest('[data-expand-id]'),choice=event.target.closest('button[data-entry-id]');
            if(expand){this.togglePickerBranch(expand.dataset.expandId);return;}
            if(choice){this.togglePickerEntry(choice.dataset.entryId);return;}
            if(event.target.closest('[data-picker-more]')){this.limit+=100;this.renderPicker();}
        });
        this.pickerList.addEventListener('keydown',event=>this.pickerKey(event));
        this.pickerList.addEventListener('focusin',event=>{const id=event.target.closest('button[data-entry-id]')?.dataset.entryId;if(!id)return;
            this.pickerRows.get(this.pickerFocusId)?.choice.setAttribute('tabindex','-1');this.pickerFocusId=id;event.target.tabIndex=0;});
        document.getElementById('delete-constellation-form').addEventListener('submit',event=>{event.preventDefault();
            try {const next=new Map(this.collections);next.delete(this.deletingId);this.commit(next);this.deleteDialog.close();this.restoreFocus();}
            catch(error){this.error('delete-constellation-error',error);}
        });
        for(const [dialog,button] of [[this.nameDialog,'cancel-constellation-name'],[this.picker,'close-constellation-picker'],[this.deleteDialog,'cancel-delete-constellation']]) {
            const close=()=>{if(dialog===this.picker)this.pickerSelection.clear();dialog.close();this.restoreFocus();};document.getElementById(button).addEventListener('click',close);
            dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
            dialog.addEventListener('close',()=>{if(!dialog.open)this.onModalClose();});
        }
    }
    isDialogOpen(){return this.nameDialog.open||this.picker.open||this.deleteDialog.open;}
    error(id,error){const field=document.getElementById(id);field.textContent=error.message||error;field.hidden=false;}
    modal(dialog){if(this.isDialogOpen())return false;this.returnFocus=document.activeElement;
        if(this.returnFocus.closest('#entry-actions'))this.returnFocus=document.getElementById('entry-more-button');
        this.returnCollectionId=this.returnFocus.closest('[data-constellation-id]')?.dataset.constellationId;this.returnAction=this.returnFocus.dataset.collectionAction;
        this.onModal();dialog.showModal();return true;}
    restoreFocus(){const row=[...this.list.children].find(row=>row.dataset.constellationId===this.returnCollectionId);
        const replacement=row?.querySelector(`[data-collection-action="${this.returnAction||'open'}"]`);
        let element=this.returnFocus!==document.body&&this.returnFocus?.isConnected&&this.returnFocus.getBoundingClientRect().width?this.returnFocus:replacement||document.getElementById('new-constellation-button');
        if(!element.getBoundingClientRect().width)element=document.getElementById('sidebar-toggle');element.focus({preventScroll:true});}
    button(text,action,label=text){const button=document.createElement('button');button.type='button';button.textContent=text;button.ariaLabel=label;button.addEventListener('click',action);return button;}
    saveSectionPreference(){
        if(!this.persist)return;let preference={};try{preference=JSON.parse(localStorage.getItem('galaxy:navigation-ui')||'{}')||{};}catch{/* Recover optional UI state. */}
        try{localStorage.setItem('galaxy:navigation-ui',JSON.stringify({...preference,constellationsCollapsed:this.collapsed,constellationsSeen:this.hasHadCollections}));}catch{/* Section remains usable without storage. */}
    }
    applySectionState(){
        if(this.collapsed&&this.list.contains(document.activeElement))this.sectionToggle.focus({preventScroll:true});
        this.list.hidden=this.collapsed;this.sectionToggle.setAttribute('aria-expanded',String(!this.collapsed));
        this.sectionToggle.ariaLabel=this.sectionToggle.title=`${this.collapsed?'Expand':'Collapse'} Constellations`;
    }
    renderSidebar(){
        if(!this.initialized){this.initialized=true;this.hasHadCollections=this.hasHadCollections||this.collections.size>0;this.collapsed=this.collapsed??this.collections.size===0;}
        else if(!this.hasHadCollections&&this.collections.size>0){this.hasHadCollections=true;this.collapsed=false;this.saveSectionPreference();}
        this.applySectionState();
        const scroll=this.list.scrollTop,focused=document.activeElement?.closest('[data-constellation-id]'),action=document.activeElement?.dataset.collectionAction;
        const focusId=focused?.dataset.constellationId;this.list.replaceChildren();
        this.collections.forEach(collection=>{
            const row=document.createElement('li');row.className='constellation-row';row.dataset.constellationId=collection.id;
            row.classList.toggle('is-active',collection.id===this.getActive());
            const open=this.button('',()=>this.activate(collection.id),`${collection.id===this.getActive()?'Deactivate':'Activate'} Constellation ${collection.name}`);
            open.className='constellation-open';open.dataset.collectionAction='open';open.setAttribute('aria-pressed',String(collection.id===this.getActive()));
            const star=document.createElement('span'),name=document.createElement('span');star.textContent='✦';star.className='constellation-star';star.ariaHidden='true';name.className='constellation-name';name.textContent=collection.name;open.append(star,name);open.title=collection.name;
            const add=this.button('+',event=>{event.stopPropagation();this.openPicker(collection.id);},`Add item to ${collection.name}`);
            add.className='collection-add';add.dataset.collectionAction='add';add.title=add.ariaLabel;
            const more=this.button('•••',event=>{event.stopPropagation();const r=more.getBoundingClientRect();this.onCollectionMenu(collection.id,r.right,r.bottom,more);},`More actions for ${collection.name}`);
            more.className='collection-more';more.dataset.collectionAction='more';more.title=more.ariaLabel;more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-controls','entry-context-menu');more.setAttribute('aria-expanded','false');row.append(open,add,more);
            row.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();this.onCollectionMenu(collection.id,event.clientX,event.clientY,event.target.closest('button')||open);});
            row.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){event.preventDefault();event.stopPropagation();const r=row.getBoundingClientRect();this.onCollectionMenu(collection.id,r.right,r.bottom,event.target.closest('button')||open);}});
            this.list.append(row);
        });
        this.list.scrollTop=scroll;
        if(focusId&&!this.collapsed){const row=[...this.list.children].find(row=>row.dataset.constellationId===focusId);row?.querySelector(`[data-collection-action="${action||'open'}"]`)?.focus({preventScroll:true});}
    }
    renderPanel(){
        const collection=this.collections.get(this.getActive());if(!collection)return;
        const memberList=document.getElementById('constellation-member-list'),focused=document.activeElement?.closest('#constellation-member-list > li');
        const focusId=focused?.dataset.entryId,focusIndex=focused?[...memberList.children].indexOf(focused):-1;
        const focusMenu=focused?.querySelector('details')?.contains(document.activeElement);
        document.getElementById('panel-name').textContent=collection.name;document.getElementById('panel-kind').textContent='Constellation';
        const closeButton=document.getElementById('close-inspector-button');closeButton.setAttribute('aria-label','Deactivate Constellation');closeButton.title='Deactivate Constellation';
        document.getElementById('panel-ancestry').hidden=true;document.getElementById('panel-rich-content').hidden=true;
        document.getElementById('constellation-content').hidden=false;document.getElementById('entry-action-status').hidden=true;
        const count=document.getElementById('constellation-count');count.hidden=false;count.textContent=`${collection.memberEntryIds.length} ${collection.memberEntryIds.length===1?'item':'items'}`;
        document.querySelectorAll('#entry-actions button').forEach(button=>{button.hidden=!button.hasAttribute('data-collection-action');});
        const list=memberList;list.replaceChildren();
        collection.memberEntryIds.forEach(id=>{const entry=this.entries.get(id);if(!entry)return;
            const row=document.createElement('li'),open=this.button(entry.name,()=>this.inspect(id));row.dataset.entryId=id;open.className='constellation-member-name';
            open.title=this.path(id);
            const actions=document.createElement('div');actions.className='content-row-actions';
            actions.append(this.button('Remove from Constellation',()=>{try{this.setMember(collection.id,id,false);}catch(error){this.error('entry-action-status',error);}}));
            const menu=createPanelItemMenu(actions,entry.name,document.getElementById('constellation-content'));menu.classList.add('constellation-member-menu');
            row.append(open,menu);list.append(row);
        });
        document.getElementById('constellation-members-empty').hidden=collection.memberEntryIds.length>0;
        if(focusId){const row=[...list.children].find(row=>row.dataset.entryId===focusId)||list.children[Math.min(focusIndex,list.children.length-1)];
            (row?.querySelector(focusMenu?'summary':'.constellation-member-name')||document.getElementById('panel-add-member')).focus({preventScroll:true});}
        this.onLayout();
    }
    path(id){return [...galaxyModel.ancestors(this.entries,id)].reverse().map(entry=>entry.name).join(' › ')||'Universe';}
    setMember(collectionId,entryId,present){
        const id=galaxyConstellations.canonicalId(entryId,this.entries,this.portals),collection=this.collections.get(collectionId);
        if(!collection||!id)throw new Error('Choose an existing item.');
        const ids=new Set(collection.memberEntryIds);present?ids.add(id):ids.delete(id);
        if(ids.size===collection.memberEntryIds.length&&ids.has(id)===collection.memberEntryIds.includes(id))return;
        const next=new Map(this.collections);next.set(collectionId,{...collection,memberEntryIds:[...ids]});this.commit(next);
    }
    openName(id=null,entryId=null){
        if(this.isDialogOpen()||(id&&!this.collections.has(id)))return;
        this.editingId=id;this.pendingEntryId=entryId;document.getElementById('constellation-name-title').textContent=id?'Rename Constellation':'Create Constellation';
        document.getElementById('constellation-name').value=id?this.collections.get(id).name:'';
        document.getElementById('constellation-name-error').hidden=true;document.getElementById('save-constellation-name').textContent=id?'Save':'Create';
        if(this.modal(this.nameDialog))document.getElementById('constellation-name').focus({preventScroll:true});
    }
    saveName(){
        const name=document.getElementById('constellation-name').value.trim();if(!name||name.length>60){this.error('constellation-name-error','Enter a name of up to 60 characters.');return;}
        const old=this.collections.get(this.editingId);if(this.editingId&&!old){this.error('constellation-name-error','This Constellation no longer exists.');return;}
        const collection=old?{...old,name}:{id:`constellation:${crypto.randomUUID()}`,name,memberEntryIds:[],createdAt:new Date().toISOString()};
        const next=new Map(this.collections);next.set(collection.id,collection);
        try {this.commit(next);this.nameDialog.close();this.restoreFocus();
            // Creation is empty; the originating entity can then be added through
            // the same checked membership menu, with a separate explicit click.
            if(this.pendingEntryId)this.showMembershipMenu(this.pendingEntryId);
        }catch(error){this.error('constellation-name-error',error);}
    }
    openPicker(id){
        if(this.isDialogOpen()||!this.collections.has(id))return;this.pickerId=id;this.limit=100;
        this.pickerSelection=new Set();this.pickerRows=new Map();this.pickerFocusId=null;
        this.pickerIndex=cosmosHierarchy.index(this.entries);this.pickerExpanded=new Set(this.pickerIndex.roots);
        document.getElementById('constellation-picker-title').textContent='Add items to Constellation';
        document.getElementById('constellation-picker-name').textContent=this.collections.get(id).name;
        document.getElementById('constellation-member-search').value='';document.getElementById('constellation-picker-status').hidden=true;
        this.renderPicker();if(this.modal(this.picker))document.getElementById('constellation-member-search').focus({preventScroll:true});
    }
    renderPicker(){
        const collection=this.collections.get(this.pickerId);if(!collection)return;
        const searching=!!this.pickerInput.value.trim(),scroll=this.pickerList.scrollTop;
        const matches=searching?galaxyModel.search(this.entries,this.pickerInput.value):null;
        const rows=searching?matches.slice(0,this.limit).map(entry=>({id:entry.id,level:1})):cosmosHierarchy.visible(this.entries,this.pickerIndex,this.pickerExpanded);
        const existing=new Set(collection.memberEntryIds),fragment=document.createDocumentFragment();
        this.pickerList.setAttribute('role',searching?'listbox':'tree');this.pickerList.setAttribute('aria-multiselectable','true');
        if(!rows.some(row=>row.id===this.pickerFocusId))this.pickerFocusId=rows[0]?.id;
        rows.forEach(({id,level,position,size})=>{
            const entry=this.entries.get(id);if(!entry)return;
            const row=this.pickerRows.get(id)||this.createPickerRow(entry),children=this.pickerIndex.children.get(id)||[];
            row.item.style.setProperty('--picker-indent',`${Math.min(48,level<=5?(level-1)*9:36+6*Math.log2(level-4))}px`);
            row.expand.hidden=searching||!children.length;row.expand.setAttribute('aria-expanded',String(this.pickerExpanded.has(id)));
            row.expand.ariaLabel=`${this.pickerExpanded.has(id)?'Collapse':'Expand'} ${entry.name}`;
            row.choice.setAttribute('role',searching?'option':'treeitem');
            if(searching)row.choice.removeAttribute('aria-level');else row.choice.setAttribute('aria-level',String(level));
            if(!searching&&children.length)row.choice.setAttribute('aria-expanded',String(this.pickerExpanded.has(id)));else row.choice.removeAttribute('aria-expanded');
            if(!searching){row.choice.setAttribute('aria-posinset',String(position));row.choice.setAttribute('aria-setsize',String(size));}
            else{row.choice.removeAttribute('aria-posinset');row.choice.removeAttribute('aria-setsize');}
            row.path.hidden=!searching;row.choice.tabIndex=id===this.pickerFocusId?0:-1;
            this.updatePickerRow(id,existing);fragment.append(row.item);
        });
        if(searching&&matches.length>this.limit){const item=document.createElement('li'),more=document.createElement('button');more.type='button';more.dataset.pickerMore='true';more.textContent='Show more items';item.append(more);fragment.append(item);}
        if(!rows.length){const item=document.createElement('li');item.className='picker-empty';item.textContent=searching?'No matching items.':'No items yet.';fragment.append(item);}
        this.pickerList.replaceChildren(fragment);this.pickerList.scrollTop=scroll;this.updatePickerCount();
    }
    createPickerRow(entry){
        const row=createCanonicalPickerRow(entry,this.path(entry.id));this.pickerRows.set(entry.id,row);return row;
    }
    updatePickerRow(id,existing=new Set(this.collections.get(this.pickerId)?.memberEntryIds)){
        const row=this.pickerRows.get(id);if(!row)return;
        const included=existing.has(id),selected=included||this.pickerSelection.has(id);
        row.choice.setAttribute('aria-selected',String(selected));row.choice.setAttribute('aria-disabled',String(included));
        row.choice.ariaLabel=`${this.entries.get(id)?.name}, ${row.path.textContent}${included?', already added':''}`;
        row.choice.classList.toggle('picker-existing',included);row.check.textContent=selected?'✓':'';row.added.hidden=!included;
    }
    togglePickerEntry(id){
        if(!this.entries.has(id)||this.collections.get(this.pickerId)?.memberEntryIds.includes(id))return;
        this.pickerSelection.has(id)?this.pickerSelection.delete(id):this.pickerSelection.add(id);
        this.updatePickerRow(id);this.updatePickerCount();
    }
    updatePickerCount(){const count=this.pickerSelection.size;this.pickerAdd.disabled=!count;this.pickerAdd.textContent=count>1?`Add ${count} items`:'Add item';}
    togglePickerBranch(id){
        this.pickerExpanded.has(id)?this.pickerExpanded.delete(id):this.pickerExpanded.add(id);this.pickerFocusId=id;this.renderPicker();this.pickerRows.get(id)?.choice.focus({preventScroll:true});
    }
    pickerKey(event){
        const id=event.target.closest('button[data-entry-id]')?.dataset.entryId;if(!id)return;
        const buttons=[...this.pickerList.querySelectorAll('button[data-entry-id]')],index=buttons.indexOf(event.target),searching=!!this.pickerInput.value.trim();let target;
        if(event.key==='ArrowDown')target=buttons[Math.min(buttons.length-1,index+1)];
        else if(event.key==='ArrowUp')target=buttons[Math.max(0,index-1)];
        else if(event.key==='Home')target=buttons[0];else if(event.key==='End')target=buttons.at(-1);
        else if(!searching&&event.key==='ArrowRight'&&this.pickerIndex.children.get(id)?.length){
            if(!this.pickerExpanded.has(id)){event.preventDefault();this.togglePickerBranch(id);return;}target=buttons[index+1];
        }else if(!searching&&event.key==='ArrowLeft'){
            if(this.pickerExpanded.has(id)&&this.pickerIndex.children.get(id)?.length){event.preventDefault();this.togglePickerBranch(id);return;}
            target=this.pickerRows.get(this.entries.get(id)?.parentId)?.choice;
        }else return;
        event.preventDefault();target?.focus({preventScroll:true});target?.scrollIntoView({block:'nearest'});
    }
    addPickerEntries(){
        const collection=this.collections.get(this.pickerId);if(!collection){this.error('constellation-picker-status','This Constellation no longer exists.');return;}
        const ids=new Set(collection.memberEntryIds);
        this.pickerSelection.forEach(id=>{const canonical=galaxyConstellations.canonicalId(id,this.entries,this.portals);if(canonical)ids.add(canonical);});
        if(ids.size===collection.memberEntryIds.length)return;
        const next=new Map(this.collections);next.set(collection.id,{...collection,memberEntryIds:[...ids]});
        try{this.commit(next);this.pickerSelection.clear();this.picker.close();this.restoreFocus();}
        catch(error){this.error('constellation-picker-status',error);}
    }
    renderMemberships(container,entryId){
        const canonical=galaxyConstellations.canonicalId(entryId,this.entries,this.portals);if(!canonical)return;
        container.replaceChildren();this.collections.forEach(collection=>{const member=collection.memberEntryIds.includes(canonical);
            const button=this.button(`${member?'✓ ':''}${collection.name}`,()=>{
                try{this.setMember(collection.id,canonical,!member);this.renderMemberships(container,canonical);container.querySelector(`[data-collection-id="${CSS.escape(collection.id)}"]`)?.focus({preventScroll:true});}
                catch(error){this.errorMembership(container,error);}
            });button.dataset.collectionId=collection.id;button.setAttribute('role','menuitemcheckbox');button.setAttribute('aria-checked',String(member));container.append(button);
        });
        const create=this.button('+ New Constellation',()=>this.openName(null,canonical));create.setAttribute('role','menuitem');container.append(create);
    }
    errorMembership(container,error){let status=container.querySelector('p');if(!status){status=document.createElement('p');status.setAttribute('role','status');container.append(status);}status.textContent=error.message;}
    openDelete(id){if(this.isDialogOpen()||!this.collections.has(id))return;this.deletingId=id;document.getElementById('delete-constellation-question').textContent=`Delete “${this.collections.get(id).name}”?`;document.getElementById('delete-constellation-error').hidden=true;if(this.modal(this.deleteDialog))document.getElementById('cancel-delete-constellation').focus({preventScroll:true});}
}
