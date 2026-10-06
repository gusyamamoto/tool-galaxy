// Presentation/workflows over collection references; persistence/navigation are injected.
class ConstellationWorkspace {
    constructor({entries,portals,collections,getActive,activate,inspect,commit,onModal,onModalClose,onLayout,showMembershipMenu,overview,persist=true}) {
        Object.assign(this,{entries,portals,collections,getActive,activate,inspect,commit,onModal,onModalClose,onLayout,showMembershipMenu,overview,persist});
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
        document.getElementById('constellation-picker-form').addEventListener('submit',event=>{event.preventDefault();this.picker.querySelector('button[data-entry-id]')?.click();});
        document.getElementById('constellation-member-search').addEventListener('input',()=>{this.limit=8;this.renderPicker();});
        document.getElementById('constellation-member-search').addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();this.picker.querySelector('button[data-entry-id]')?.focus();}});
        document.getElementById('delete-constellation-form').addEventListener('submit',event=>{event.preventDefault();
            try {const next=new Map(this.collections);next.delete(this.deletingId);this.commit(next);this.deleteDialog.close();this.restoreFocus();}
            catch(error){this.error('delete-constellation-error',error);}
        });
        for(const [dialog,button] of [[this.nameDialog,'cancel-constellation-name'],[this.picker,'close-constellation-picker'],[this.deleteDialog,'cancel-delete-constellation']]) {
            const close=()=>{dialog.close();this.restoreFocus();};document.getElementById(button).addEventListener('click',close);
            dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
            dialog.addEventListener('close',()=>{if(!dialog.open)this.onModalClose();});
        }
    }
    isDialogOpen(){return this.nameDialog.open||this.picker.open||this.deleteDialog.open;}
    error(id,error){const field=document.getElementById(id);field.textContent=error.message||error;field.hidden=false;}
    modal(dialog){if(this.isDialogOpen())return false;this.returnFocus=document.activeElement;
        this.returnCollectionId=this.returnFocus.closest('[data-constellation-id]')?.dataset.constellationId;this.returnAction=this.returnFocus.dataset.collectionAction;
        this.onModal();dialog.showModal();return true;}
    restoreFocus(){const row=[...this.list.children].find(row=>row.dataset.constellationId===this.returnCollectionId);
        const replacement=row?.querySelector(`[data-collection-action="${this.returnAction||'open'}"]`);
        const element=this.returnFocus?.isConnected&&this.returnFocus.getBoundingClientRect().width?this.returnFocus:replacement||document.getElementById('new-constellation-button');element.focus({preventScroll:true});}
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
            const add=this.button('+',event=>{event.stopPropagation();this.openPicker(collection.id);},`Add entry to ${collection.name}`);
            add.className='collection-add';add.dataset.collectionAction='add';add.title=add.ariaLabel;row.append(open,add);
            const actions=()=>{if(this.getActive()!==collection.id)this.activate(collection.id);else this.overview();document.getElementById('entry-more-button').click();};
            row.addEventListener('contextmenu',event=>{event.preventDefault();actions();});
            row.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){event.preventDefault();event.stopPropagation();actions();}});
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
        const count=document.getElementById('constellation-count');count.hidden=false;count.textContent=`${collection.memberEntryIds.length} ${collection.memberEntryIds.length===1?'entry':'entries'}`;
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
        if(!collection||!id)throw new Error('Choose an existing entry.');
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
        if(this.isDialogOpen()||!this.collections.has(id))return;this.pickerId=id;this.limit=8;
        document.getElementById('constellation-picker-title').textContent=`Add entry to ${this.collections.get(id).name}`;
        document.getElementById('constellation-member-search').value='';document.getElementById('constellation-picker-status').hidden=true;
        this.renderPicker();if(this.modal(this.picker))document.getElementById('constellation-member-search').focus({preventScroll:true});
    }
    renderPicker(){
        const collection=this.collections.get(this.pickerId);if(!collection)return;
        const input=document.getElementById('constellation-member-search'),list=document.getElementById('constellation-picker-results');list.replaceChildren();
        const matches=input.value.trim()?galaxyModel.search(this.entries,input.value):[...this.entries.values()];
        matches.slice(0,this.limit).forEach(entry=>{const item=document.createElement('li'),member=collection.memberEntryIds.includes(entry.id);
            const button=this.button(`${member?'✓ ':''}${entry.name}`,()=>{
                try{this.setMember(collection.id,entry.id,true);this.renderPicker();list.querySelector(`[data-entry-id="${CSS.escape(entry.id)}"]`)?.focus({preventScroll:true});}
                catch(error){this.error('constellation-picker-status',error);}
            });button.dataset.entryId=entry.id;button.setAttribute('aria-pressed',String(member));
            const path=document.createElement('small');path.textContent=this.path(entry.id);button.append(path);item.append(button);list.append(item);
        });
        if(matches.length>this.limit){const item=document.createElement('li');item.append(this.button('Show more entries',()=>{this.limit+=8;this.renderPicker();}));list.append(item);}
        if(!matches.length){const item=document.createElement('li');item.textContent='No matching entries.';list.append(item);}
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
    openDelete(id){if(this.isDialogOpen()||!this.collections.has(id))return;this.deletingId=id;document.getElementById('delete-constellation-title').textContent=`Delete “${this.collections.get(id).name}”?`;document.getElementById('delete-constellation-error').hidden=true;this.modal(this.deleteDialog);}
}
