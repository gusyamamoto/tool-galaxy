// Alpha-only composition of the existing Universe editor's shared components.
// Physics/navigation are disposable. Only foundation.createItem/renameItem write.
function createTravelAlphaEditor({foundation}){
    const element=id=>document.getElementById(id),host=element('galaxy'),viewport=element('graph-viewport'),layer=element('nodes-layer');
    const dialog=element('add-entry-dialog'),form=element('add-entry-form'),input=element('entry-name'),error=element('entry-form-error');
    let state=foundation.getState(),context=null,selected=null,edit=null,sidebar,disposed=false,lastSnapshot=null,pan=null;
    const entries=new Map(),nodes=new Map();
    // Navigation preferences are ephemeral, never the beta's preference store.
    let preferences={};
    const camera=new GraphCamera({onChange:()=>paint()});
    const physics=new GalaxyPhysics({onTick:()=>paint(),onSettle:()=>{paint();if(!pan)fit();}});
    camera.setReducedMotion(matchMedia('(prefers-reduced-motion: reduce)').matches);
    physics.setReducedMotion(matchMedia('(prefers-reduced-motion: reduce)').matches);
    const canEdit=()=>!state.readOnly&&state.dataset.context===context&&!state.writing;
    function bounds(){return {left:sidebar&&!sidebar.collapsed&&!sidebar.narrow?sidebar.width+16:24,top:40,right:viewport.clientWidth-24,bottom:viewport.clientHeight-64};}
    function fit(){if(disposed||!entries.size)return;const points=[...physics.particles.values()];
        camera.fitBounds({left:Math.min(...points.map(p=>p.x))-60,right:Math.max(...points.map(p=>p.x))+60,top:Math.min(...points.map(p=>p.y))-60,bottom:Math.max(...points.map(p=>p.y))+60},bounds(),{animate:false,maxScale:1});}
    function paint(){
        if(disposed)return;const detail=cosmosView.detail(camera.view.scale),terminal=cosmosView.terminalLabelIds(entries);
        host.style.setProperty('--camera-scale',camera.view.scale);
        for(const role of cosmosView.labelOrder){host.style.setProperty(`--${role}-detail`,detail[role]??1);host.style.setProperty(`--${role}-label-detail`,detail.labels[role].opacity);}
        for(const entry of entries.values()){
            const node=nodes.get(entry.id),particle=physics.particles.get(entry.id);if(!node||!particle)continue;
            const point=camera.worldToScreen(particle.x,particle.y);
            node.style.transform=`translate(${point.x}px,${point.y}px) translate(-50%,-50%)`;
            node.style.setProperty('--terminal-label-opacity',cosmosView.labelDisclosure(entry.role,camera.view.scale,entry.id,detail,terminal.has(entry.id)));
            node.classList.toggle('selected',entry.id===selected);node.setAttribute('aria-pressed',String(entry.id===selected));
        }
        // Use the same group-envelope positioning as the main Universe editor.
        for(const entry of entries.values())if(entry.depth===0){
            const node=nodes.get(entry.id),label=node.querySelector('.node-label'),root=node.getBoundingClientRect();
            const suns=[...entries.values()].filter(e=>e.parentId===entry.id).map(e=>nodes.get(e.id).getBoundingClientRect());
            const envelope=suns.length?{left:Math.min(...suns.map(r=>r.left)),right:Math.max(...suns.map(r=>r.right)),top:Math.min(...suns.map(r=>r.top))}:null;
            const position=cosmosView.galaxyLabelPosition(root,envelope,label.getBoundingClientRect(),viewport.getBoundingClientRect());
            label.style.left=`${position.left-root.left}px`;label.style.top=`${position.top-root.top}px`;label.style.transform='none';
        }
    }
    function controls(){
        element('alpha-new-galaxy').disabled=!canEdit();
        element('add-entry-button').disabled=!canEdit();
        const entry=entries.get(selected),parent=entries.get(entry?.parentId);
        element('alpha-add-item').disabled=!canEdit()||!entry||entry.taskList===true||parent?.taskList===true;
        element('alpha-rename-item').disabled=!canEdit()||!entry;
        element('alpha-selected-name').textContent=entry?.name||'Select an Item';
        for(const [id,row] of sidebar.rows){row.draggable=false;row.querySelector('.tree-add').disabled=!canEdit()||entries.get(id)?.taskList===true||entries.get(entries.get(id)?.parentId)?.taskList===true;
            const task=row.querySelector('.tree-task-toggle');if(task)task.disabled=true;}
    }
    function select(id){if(!entries.has(id))return;selected=id;sidebar.select(id);controls();paint();}
    function open({id=null,parentId=null,editContext=context}={}){
        if(!canEdit()||editContext!==context||id&&!entries.has(id)||parentId&&!entries.has(parentId))return;
        edit={id,parentId,context};element('add-entry-title').textContent=id?'Rename Item':parentId?'Add Item':'New Galaxy';
        element('alpha-entry-location').textContent=id?'Keep this Item in its current location.':parentId?'Inside '+entries.get(parentId).name:'In the Universe';
        input.value=id?entries.get(id).name:'';input.disabled=false;element('entry-submit').disabled=false;element('alpha-entry-cancel').disabled=false;
        input.setCustomValidity('');error.hidden=true;dialog.showModal();input.focus();
    }
    let sidebarRenameContext=null;
    sidebar=new HierarchySidebar({host,preferences:{load:()=>({...preferences}),update:patch=>{preferences={...preferences,...patch};}},
        onNavigate:select,onActivate:select,onSelectionEmpty:()=>{selected=null;controls();paint();},
        onCreate:id=>open({parentId:id}),onMenu:id=>open({id}),moveBlocked:()=>true,taskBlocked:()=>true,
        onRenameStart:()=>{sidebarRenameContext=context;},onRename:(id,name)=>foundation.renameItem({id,name,context:sidebarRenameContext}),
        onViewportChange:()=>{if(sidebar)fit();},onDragEnd:()=>{}});
    const beginRename=sidebar.beginRename.bind(sidebar);
    sidebar.beginRename=id=>{if(canEdit())beginRename(id);};
    const renderSidebar=sidebar.render.bind(sidebar);
    sidebar.render=()=>{renderSidebar();controls();};
    function sync(next){
        if(disposed)return;state=next;
        if(context!==state.dataset.context){
            context=state.dataset.context;selected=null;edit=null;pan=null;lastSnapshot=null;
            if(dialog.open)dialog.close();input.value='';error.textContent='';error.hidden=true;
            sidebar.rename=null;sidebar.rows.clear();sidebar.expanded.clear();sidebar.selection.single(null);sidebar.selectedId=null;sidebar.activeId=null;sidebar.index={roots:[],children:new Map()};sidebar.tree.replaceChildren();
            entries.clear();nodes.clear();layer.replaceChildren();physics.pause();physics.setGraph(new Map());physics.galaxies.clear();physics.origin=null;camera.stopAnimation();preferences={};
        }
        const serialized=JSON.stringify(state.dataset.snapshot);
        if(serialized!==lastSnapshot){
            const previousTopology=JSON.stringify([...entries.values()].map(entry=>[entry.id,entry.parentId]));
            lastSnapshot=serialized;entries.clear();
            const all=new Map(state.dataset.snapshot.entries.map(record=>[record.id,galaxyModel.normalizeEntry(record)]));
            for(const record of state.dataset.snapshot.archivedGalaxies||[])for(const id of galaxyModel.subtreeIds(all,record.galaxyId))all.delete(id);
            galaxyModel.normalizeHierarchy(all);all.forEach((entry,id)=>entries.set(id,entry));
            for(const [id,node] of nodes)if(!entries.has(id)){node.remove();nodes.delete(id);}
            for(const entry of entries.values()){
                let node=nodes.get(entry.id);if(!node){node=document.createElement('button');node.type='button';node.className='entry-node';node.dataset.entryId=entry.id;
                    const label=document.createElement('span');label.className='node-label';node.append(label);node.addEventListener('click',()=>select(entry.id));layer.append(node);nodes.set(entry.id,node);}
                renderCelestialBody(entry,node);
            }
            sidebar.setEntries(entries);
            if(previousTopology!==JSON.stringify([...entries.values()].map(entry=>[entry.id,entry.parentId]))){
                physics.setGraph(new Map([...entries].map(([id,entry])=>[id,{...entry,seedLayout:true,sizeScale:galaxyModel.roles[entry.role].scale}])));
                if(entries.size)physics.resume();else physics.pause();
                fit();
            }
        }
        controls();paint();
    }
    element('alpha-new-galaxy').addEventListener('click',()=>open());
    element('add-entry-button').addEventListener('click',()=>open());
    element('universe-home').addEventListener('click',()=>{selected=null;sidebar.select(null);controls();fit();paint();});
    element('alpha-add-item').addEventListener('click',()=>open({parentId:selected}));
    element('alpha-rename-item').addEventListener('click',()=>open({id:selected}));
    element('alpha-entry-cancel').addEventListener('click',()=>dialog.close());
    // Native close events are queued. An earlier close must not erase a form
    // that was reopened before that event is delivered.
    dialog.addEventListener('close',()=>{if(dialog.open)return;edit=null;input.value='';error.textContent='';error.hidden=true;});
    dialog.addEventListener('cancel',event=>{if(state.writing)event.preventDefault();});
    input.addEventListener('input',()=>input.setCustomValidity(''));
    form.addEventListener('submit',async event=>{
        event.preventDefault();const attempt=edit;if(!attempt||state.writing)return;
        input.setCustomValidity(input.value.trim()?'':'Enter a name.');if(!form.reportValidity())return;
        input.disabled=true;element('entry-submit').disabled=true;element('alpha-entry-cancel').disabled=true;error.hidden=true;
        try{
            const id=await (attempt.id?foundation.renameItem({id:attempt.id,name:input.value,context:attempt.context}):foundation.createItem({name:input.value,parentId:attempt.parentId,context:attempt.context}));
            if(edit!==attempt||context!==attempt.context)return;
            dialog.close();if(id||attempt.id)select(id||attempt.id);
        }catch{
            if(edit!==attempt||context!==attempt.context)return;
            error.textContent=state.writeStatus==='unresolved'?'Unresolved: the server may have saved this change. Check the pending save before trying another edit.':'Failed: this change was not saved. Reload from the server if editing is unavailable.';error.hidden=false;
        }finally{if(edit===attempt){input.disabled=!canEdit();element('entry-submit').disabled=!canEdit();element('alpha-entry-cancel').disabled=false;}}
    });
    element('alpha-fit').addEventListener('click',fit);
    for(const [id,factor] of [['alpha-zoom-in',1.3],['alpha-zoom-out',1/1.3]])element(id).addEventListener('click',()=>camera.zoomAt(viewport.clientWidth/2,viewport.clientHeight/2,factor));
    viewport.addEventListener('wheel',event=>{event.preventDefault();const r=viewport.getBoundingClientRect();camera.zoomAt(event.clientX-r.left,event.clientY-r.top,Math.exp(-event.deltaY*.001),{source:'user-zoom'});},{passive:false});
    viewport.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('button'))return;camera.stopAnimation();pan={id:event.pointerId,x:event.clientX,y:event.clientY,view:{...camera.view}};viewport.setPointerCapture(event.pointerId);});
    viewport.addEventListener('pointermove',event=>{if(pan?.id===event.pointerId)camera.panTo(pan.view.x+event.clientX-pan.x,pan.view.y+event.clientY-pan.y);});
    for(const type of ['pointerup','pointercancel'])viewport.addEventListener(type,event=>{if(pan?.id===event.pointerId)pan=null;});
    const resize=new ResizeObserver(()=>{sidebar.onWindowResize();controls();fit();});resize.observe(host);
    const unsubscribe=foundation.subscribe(sync);
    return Object.freeze({dispose(){disposed=true;unsubscribe();resize.disconnect();physics.pause();camera.stopAnimation();entries.clear();nodes.clear();layer.replaceChildren();if(dialog.open)dialog.close();input.value='';sidebar.tree.replaceChildren();}});
}
