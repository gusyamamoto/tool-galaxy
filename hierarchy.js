// Disposable navigation state over the existing generic tree. No graph writes.
const cosmosHierarchy = {
    index(entries, portals = new Map()) {
        const children = new Map([...entries.keys()].map(id => [id, []])), roots = [];
        entries.forEach(entry => {
            if (children.has(entry.parentId)) children.get(entry.parentId).push(entry.id);
            else roots.push(entry.id);
        });
        portals.forEach(portal => {
            if (entries.has(portal.parentEntryId) && entries.has(portal.targetEntryId)) children.get(portal.parentEntryId).push(portal.id);
        });
        return { children, roots };
    },
    visible(entries, index, expanded, portals = new Map()) {
        const rows = [], visited = new Set();
        const push = (ids, level, stack) => {
            for (let i = ids.length - 1; i >= 0; i--) stack.push({ id: ids[i], level, position: i + 1, size: ids.length });
        };
        const stack = []; push(index.roots, 1, stack);
        while (stack.length) {
            const row = stack.pop();
            const portal = portals.get(row.id);
            if (visited.has(row.id) || (!entries.has(row.id) && !portal)) continue;
            if (portal) { row.kind = "portal"; row.parentId = portal.parentEntryId; }
            visited.add(row.id); rows.push(row);
            if (!portal && expanded.has(row.id)) push(index.children.get(row.id), row.level + 1, stack);
        }
        return rows;
    },
    childContext(entries, parentId = null) {
        const parent = parentId ? entries.get(parentId) : null;
        if (parentId && !parent) return null;
        if (parent && entries.get(parent.parentId)?.taskList === true) return null;
        const depth = parent ? parent.depth + 1 : 0, role = galaxyModel.roleAtDepth(depth);
        return { parentId: parent?.id || null, depth, role,
            action: parent?.taskList === true ? 'Add task' : parent ? 'Add item' : 'New Galaxy' };
    }
};

// Ephemeral selection only: active item, range anchor and activation history.
// Keyboard focus stays in HierarchySidebar.activeId, independently of this set.
class HierarchySelection {
    constructor(){this.ids=new Set();this.activeEntryId=null;this.anchorId=null;this.history=[];}
    single(id){this.ids=new Set(id?[id]:[]);this.activeEntryId=id||null;this.anchorId=id||null;this.history=id?[id]:[];}
    activate(id){this.activeEntryId=id;this.history=this.history.filter(value=>value!==id);if(id)this.history.push(id);}
    fallback(){this.activeEntryId=[...this.history].reverse().find(id=>this.ids.has(id))||[...this.ids].at(-1)||null;}
    click(id,{toggle=false,range=false,visible=[]}={}){
        if(!visible.includes(id))return;
        if(range&&visible.includes(this.anchorId)){
            const a=visible.indexOf(this.anchorId),b=visible.indexOf(id);
            this.ids=new Set(visible.slice(Math.min(a,b),Math.max(a,b)+1));
            this.history=this.history.filter(value=>this.ids.has(value));this.activate(id);
        }else if(toggle){
            if(this.ids.has(id)){this.ids.delete(id);this.history=this.history.filter(value=>value!==id);if(this.activeEntryId===id)this.fallback();}
            else{this.ids.add(id);this.activate(id);}
            this.anchorId=this.ids.size?id:null;
        }else this.single(id);
    }
    retain(valid){
        this.ids=new Set([...this.ids].filter(id=>valid.has(id)));this.history=this.history.filter(id=>this.ids.has(id));
        if(!this.ids.has(this.activeEntryId))this.fallback();
        if(!valid.has(this.anchorId))this.anchorId=null;
    }
    visibleOnly(visible){
        // Preserve the established single active Content selection if its
        // branch is closed, but never retain an invisible batch of secondaries.
        if(this.activeEntryId&&!visible.has(this.activeEntryId)){this.single(this.activeEntryId);return;}
        this.retain(visible);
    }
}

// Section disclosure is UI-only and merges with existing navigation preferences.
class NavigationSection {
    constructor({root,toggle,list,name,key,preferences,collapsed=false}) {
        Object.assign(this,{root,toggle,list,name,key,preferences});this.scroll={top:0,left:0};
        const preference=preferences.load();
        this.collapsed=typeof preference[key]==='boolean'?preference[key]:collapsed;
        toggle.addEventListener('click',()=>this.mobileGroup?.query.matches?this.mobileGroup.toggle(this):this.setCollapsed(!this.collapsed));this.apply();
    }
    apply() {
        const collapsed=this.mobileCollapsed??this.collapsed;
        if(collapsed&&this.list.contains(document.activeElement))this.toggle.focus({preventScroll:true});
        this.list.hidden=collapsed;this.toggle.setAttribute('aria-expanded',String(!collapsed));
        this.toggle.ariaLabel=this.toggle.title=`${collapsed?'Expand':'Collapse'} ${this.name}`;
        this.root.classList.toggle('section-collapsed',collapsed);
    }
    setCollapsed(value) {
        if(this.collapsed===value)return;
        if(value)this.scroll={top:this.list.scrollTop,left:this.list.scrollLeft};
        this.collapsed=value;this.apply();
        if(!value){this.list.scrollTop=this.scroll.top;this.list.scrollLeft=this.scroll.left;}
        Promise.resolve(this.preferences.update({[this.key]:value})).catch(error=>{this.preferenceError=error;});
        this.onDisclosure?.(value);
    }
}

// Mobile disclosure is transient; desktop preferences and nested branches survive it.
class MobileSidebarSections {
    constructor(query,sections,onLayout){
        Object.assign(this,{query,sections,onLayout});this.selected=sections[0];
        sections.forEach(section=>section.mobileGroup=this);
        query.addEventListener('change',()=>this.apply());this.apply();
    }
    select(section){this.selected=section;this.apply();}
    toggle(section){this.select(this.selected===section?null:section);}
    apply(){
        for(const section of this.sections){section.mobileCollapsed=this.query.matches?section!==this.selected:null;section.apply();}
        this.onLayout();
    }
}

class HierarchySidebar {
    constructor({ host, onNavigate, onSelectionEmpty, onActivate, onMove, moveBlocked=()=>false, onDragEnd, onCreate, onMenu, onRename, onRenameStart, onTaskToggle, taskBlocked=()=>false, onOpenPortal, onPortalMenu, portals = new Map(), onViewportChange, preferences }) {
        Object.assign(this, { host, onNavigate, onSelectionEmpty, onActivate, onMove, moveBlocked, onDragEnd, onCreate, onMenu, onRename, onRenameStart, onTaskToggle, taskBlocked, onOpenPortal, onPortalMenu, portals, onViewportChange, preferences });
        this.sidebar = document.getElementById("hierarchy-sidebar");
        this.tree = document.getElementById("hierarchy-tree");
        this.toggle = document.getElementById("sidebar-toggle");
        this.resize = document.getElementById("sidebar-resize");
        this.universeSection=new NavigationSection({root:document.getElementById('universe-section'),toggle:document.getElementById('universe-toggle'),list:this.tree,name:'Universe',key:'universeCollapsed',preferences});
        this.entries = new Map(); this.rows = new Map(); this.expanded = new Set();
        this.index = { children: new Map(), roots: [] }; this.selectedId = null; this.activeId = null; this.searchMatches = new Set();
        this.selection=new HierarchySelection();this.tree.setAttribute('aria-multiselectable','true');
        this.universeSection.onDisclosure=collapsed=>{if(collapsed){this.selection.single(this.selectedId);this.paintSelection();}};
        this.mobileQuery = window.matchMedia('(max-width: 760px), (pointer: coarse) and (max-width: 1024px) and (max-height: 500px)');
        this.narrow = this.mobileQuery.matches;
        const preference = preferences.load();
        this.collapsed = this.narrow || preference.collapsed === true;
        this.width = Number.isFinite(preference.width) ? preference.width : 260;
        this.applyLayout();
        this.toggle.addEventListener("click", () => this.setCollapsed(!this.collapsed));
        document.addEventListener('pointerdown',event=>{
            if(!this.narrow||this.collapsed||event.button!==0||event.target.closest('#hierarchy-sidebar,#sidebar-toggle,#add-menu,#entry-context-menu,dialog'))return;
            this.setCollapsed(true);event.preventDefault();event.stopPropagation();
        },true);
        document.addEventListener('keydown',event=>{
            if(event.key!=='Escape'||!this.narrow||this.collapsed||document.querySelector('dialog[open],#add-menu:not([hidden]),#entry-context-menu:not([hidden]),#search-results:not([hidden]),#utility-menu:not([hidden])'))return;
            this.setCollapsed(true);event.preventDefault();event.stopPropagation();
        },true);
        this.tree.addEventListener("keydown", event => this.onKey(event));
        this.tree.addEventListener('dragover',event=>this.moveOver(event));
        this.tree.addEventListener('drop',async event=>{
            if(!this.moveDrag)return;
            event.preventDefault();event.stopPropagation();
            const target=event.target.closest('.hierarchy-row[data-entry-id]')?.dataset.entryId;
            try{if(!this.moveBlocked()&&!galaxyModel.movePlan(this.entries,this.moveDrag.ids,target).error)await this.onMove(this.moveDrag,target);}
            finally{this.endMoveDrag();}
        });
        this.tree.addEventListener('dragleave',event=>{if(this.moveTarget&&!this.moveTarget.contains(event.relatedTarget))this.clearMoveTarget();});
        document.addEventListener('keydown',event=>{if(event.key==='Escape'&&this.moveDrag){this.endMoveDrag();event.preventDefault();event.stopImmediatePropagation();}});
        window.addEventListener('blur',()=>this.endMoveDrag());
        let drag = null;
        this.resize.addEventListener("pointerdown", event => {
            if (event.button !== 0) return;
            event.preventDefault(); drag = { id: event.pointerId, x: event.clientX, width: this.width };
            this.resize.setPointerCapture(event.pointerId); this.host.classList.add("sidebar-resizing");
        });
        this.resize.addEventListener("pointermove", event => {
            if (drag?.id === event.pointerId) this.setWidth(drag.width + event.clientX - drag.x, false);
        });
        const endResize = event => {
            if (drag?.id !== event.pointerId) return;
            drag = null; this.host.classList.remove("sidebar-resizing");
            if (this.resize.hasPointerCapture(event.pointerId)) this.resize.releasePointerCapture(event.pointerId);
            this.savePreference();
        };
        for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) this.resize.addEventListener(type, endResize);
        this.resize.addEventListener("keydown", event => {
            const limits = this.widthLimits();
            const width = { ArrowLeft: this.width - 16, ArrowRight: this.width + 16, Home: limits.min, End: limits.max }[event.key];
            if (width === undefined) return;
            event.preventDefault(); this.setWidth(width, true); this.savePreference();
        });
    }
    widthLimits() { return { min: 180, max: this.narrow ? Math.min(280, innerWidth * .75) : Math.min(360, innerWidth * .3) }; }
    applyLayout() {
        const { min, max } = this.widthLimits();
        this.width = Math.max(Math.min(min, max), Math.min(max, this.width));
        // Leave room for both touch actions without squeezing deep item names.
        // The saved desktop width remains unchanged.
        this.host.style.setProperty("--sidebar-width", `${this.narrow ? Math.min(320,innerWidth-48) : this.width}px`);
        this.host.style.setProperty("--sidebar-space", `${this.collapsed || this.narrow ? 0 : this.width}px`);
        this.host.classList.toggle("sidebar-collapsed", this.collapsed);
        this.sidebar.hidden = this.collapsed;
        this.toggle.setAttribute("aria-expanded", String(!this.collapsed));
        this.toggle.title = this.toggle.ariaLabel = this.collapsed ? "Show navigation" : "Hide navigation";
        this.resize.setAttribute("aria-valuemin", String(Math.round(Math.min(min, max))));
        this.resize.setAttribute("aria-valuemax", String(Math.round(max)));
        this.resize.setAttribute("aria-valuenow", String(Math.round(this.width)));
    }
    savePreference() {
        Promise.resolve(this.preferences.update({collapsed: this.collapsed, width: this.width})).catch(error=>{this.preferenceError=error;});
    }
    setCollapsed(collapsed) {
        if (this.collapsed === collapsed) return;
        if (collapsed && this.sidebar.contains(document.activeElement)) this.toggle.focus();
        this.collapsed = collapsed;
        if(collapsed){this.selection.single(this.selectedId);this.paintSelection();}
        this.applyLayout(); this.savePreference(); this.onViewportChange(true);
        if (!collapsed) this.scrollSelected();
    }
    setWidth(width, animate) { this.width = width; this.applyLayout(); this.onViewportChange(animate); }
    onWindowResize() {
        const narrow = this.mobileQuery.matches;
        if (narrow !== this.narrow) { this.narrow = narrow; if (narrow) {this.collapsed = true;this.selection.single(this.selectedId);this.paintSelection();} }
        this.applyLayout();
        this.rows.forEach((row,id)=>{
            row.draggable=this.entries.has(id)&&!this.narrow&&this.rename?.id!==id;
            const add=row.querySelector('.tree-add');
            if(add){const focused=document.activeElement===add;add.hidden=this.narrow;if(focused&&this.narrow)row.querySelector('.tree-more')?.focus({preventScroll:true});}
        });
        this.updateTabStops();
    }
    setEntries(entries) {
        const scroll = { top: this.tree.scrollTop, left: this.tree.scrollLeft };
        this.entries = entries;
        this.selection.retain(new Set(entries.keys()));this.selectedId=this.selection.activeEntryId;
        const previousRoots = new Set(this.index.roots);
        this.index = cosmosHierarchy.index(entries, this.portals);
        this.index.roots.forEach(id => { if (!previousRoots.has(id)) this.expanded.add(id); });
        this.expanded.forEach(id => { if (!entries.has(id)) this.expanded.delete(id); });
        this.rows.forEach((row, id) => { if (!entries.has(id) && !this.portals.has(id)) { row.remove(); this.rows.delete(id); } });
        document.getElementById("hierarchy-count").textContent = `${entries.size} items`;
        this.render();
        this.tree.scrollTop = scroll.top; this.tree.scrollLeft = scroll.left;
    }
    createRow(id) {
        const row = document.createElement("div");
        row.className = "hierarchy-row"; row.dataset.entryId = id; row.setAttribute("role", "treeitem");
        const disclosure = document.createElement("button");
        disclosure.type = "button"; disclosure.className = "tree-disclosure"; disclosure.tabIndex = -1;
        disclosure.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>';
        const icon = document.createElement("span"); icon.className = "tree-role-icon"; icon.ariaHidden = "true";
        const name = document.createElement("span"); name.className = "tree-name";
        const add = document.createElement("button"); add.type = "button"; add.className = "tree-add"; add.textContent = "+";
        add.setAttribute("aria-haspopup", "menu"); add.setAttribute("aria-controls", "add-menu"); add.setAttribute("aria-expanded", "false");
        const more = document.createElement('button'); more.type = 'button'; more.className = 'tree-more'; more.textContent = '…';
        more.setAttribute('aria-haspopup', 'menu'); more.setAttribute('aria-controls', 'entry-context-menu'); more.setAttribute('aria-expanded', 'false');
        const slot=document.createElement("span");slot.className="tree-disclosure-slot";slot.append(disclosure);
        row.append(slot, icon, name, add, more);
        row.addEventListener('pointerdown',event=>{
            this.moveOriginBlocked=event.button!==0||event.pointerType==='touch'||!!event.target.closest('button,input');
            if(event.button===0&&(event.ctrlKey||event.metaKey||event.shiftKey)&&!event.target.closest('button,input'))event.preventDefault();
        });
        row.addEventListener('dragstart',event=>{
            if(!this.entries.has(id)||this.narrow||this.rename||this.moveOriginBlocked||this.moveBlocked()||!event.dataTransfer){event.preventDefault();return;}
            if(!this.selection.ids.has(id)){
                this.keepMovedSelection=false;this.selection.single(id);this.selectedId=id;this.paintSelection();this.onActivate(id);
            }
            this.moveDrag={ids:this.getSelectedEntryIds(),activeId:this.activeEntryId};
            event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-cosmifold-entry-move',JSON.stringify(this.moveDrag.ids));
            this.moveDrag.ids.forEach(id=>this.rows.get(id)?.classList.add('is-moving'));
        });
        row.addEventListener('dragend',()=>this.endMoveDrag());
        row.addEventListener("click", event => {
            if (event.button!==0 || event.target.closest("button,input") || this.rename?.id === id || event.detail > 1) return;
            this.activeId = id; row.focus({ preventScroll: true });
            if (this.narrow) this.setCollapsed(true);
            this.selectFromClick(id,event);
        });
        name.addEventListener('dblclick', event => { event.preventDefault(); event.stopPropagation(); this.beginRename(id); });
        row.addEventListener("focus", () => { this.activeId = id; this.updateTabStops(); });
        disclosure.addEventListener('focus', () => { this.activeId = id; this.updateTabStops(); });
        disclosure.addEventListener('click', event => {
            event.stopPropagation();
            const entry = this.entries.get(id);
            if (entry?.taskList !== true && this.entries.get(entry?.parentId)?.taskList === true) {
                if (!this.taskBlocked()) Promise.resolve(this.onTaskToggle?.(id, entry.completed !== true)).catch(()=>{});
            } else this.toggleBranch(id);
        });
        add.addEventListener("focus", () => { this.activeId = id; this.updateTabStops(); });
        add.addEventListener("click", event => { event.stopPropagation(); this.onCreate(id, add); });
        more.addEventListener('focus', () => { this.activeId = id; this.updateTabStops(); });
        more.addEventListener('click', event => { event.stopPropagation(); this.onMenu?.(id, more); });
        this.rows.set(id, row); return row;
    }
    beginRename(id) {
        if (this.narrow || matchMedia('(pointer: coarse)').matches || !this.entries.has(id) || document.querySelector('dialog[open]')) return;
        this.endRename(false);
        const row = this.rows.get(id), name = row?.querySelector('.tree-name');
        if (!name) return;
        this.onRenameStart?.();
        const input = document.createElement('input'); input.type = 'text'; input.className = 'tree-rename';
        input.value = this.entries.get(id).name; input.maxLength = 60; input.ariaLabel = `Rename ${input.value}`;
        input.autocomplete = 'off'; input.spellcheck = false;
        this.rename = {id,input,row,name}; row.classList.add('is-renaming'); name.replaceChildren(input);
        input.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.isComposing) return;
            if (event.key === 'Enter') { event.preventDefault(); this.endRename(true); }
            else if (event.key === 'Escape') { event.preventDefault(); this.endRename(false); row.focus({preventScroll:true}); }
        });
        input.addEventListener('input', () => { input.setCustomValidity(''); input.removeAttribute('aria-invalid'); });
        input.addEventListener('blur', () => { if (!this.rendering) this.endRename(false); });
        input.addEventListener('click', event => event.stopPropagation());
        input.addEventListener('dblclick', event => event.stopPropagation());
        input.addEventListener('contextmenu', event => event.stopPropagation());
        input.focus({preventScroll:true}); input.select();
    }
    async endRename(save) {
        const edit = this.rename; if (!edit||edit.pending) return;
        if (save) {
            const value = edit.input.value.trim();
            try {
                if (!value) throw new Error('Please enter a name.');
                // Keep the editor intact on validation/storage errors.
                this.rendering = true;edit.pending=true;edit.input.disabled=true;await this.onRename(edit.id,value);
            } catch (error) {
                edit.input.disabled=false;edit.input.setCustomValidity(error.message); edit.input.setAttribute('aria-invalid','true');
                edit.input.reportValidity(); edit.input.focus(); return;
            } finally { this.rendering = false;edit.pending=false;edit.input.disabled=false; }
        }
        this.rename = null; edit.row.classList.remove('is-renaming');
        edit.name.textContent = this.entries.get(edit.id)?.name || '';
        if (save) edit.row.focus({preventScroll:true});
    }
    createPortalRow(id) {
        const row = document.createElement("div");
        row.className = "hierarchy-row portal-row"; row.dataset.portalId = id; row.setAttribute("role", "treeitem");
        const slot = document.createElement("span"); slot.className = "tree-disclosure-slot"; slot.ariaHidden = "true";
        const icon = document.createElement("span"); icon.className = "tree-portal-icon"; icon.ariaHidden = "true";
        icon.innerHTML = '<svg viewBox="0 0 20 20"><ellipse cx="10" cy="10" rx="8" ry="4" transform="rotate(-30 10 10)"/><ellipse cx="10" cy="10" rx="6" ry="3" transform="rotate(-30 10 10)"/><circle cx="10" cy="10" r="2.5"/></svg>';
        const name = document.createElement("span"); name.className = "tree-name";
        const actions = document.createElement("button"); actions.type = "button"; actions.className = "tree-portal-actions";
        actions.textContent = "•••"; actions.ariaLabel = "Linked item actions"; actions.title = "Linked item actions"; actions.setAttribute("aria-haspopup", "menu");actions.setAttribute("aria-controls","entry-context-menu");actions.setAttribute('aria-expanded','false');
        row.append(slot, icon, name, actions);
        row.addEventListener("click", event => { if (!event.target.closest("button")) this.activatePortal(id); });
        row.addEventListener("focus", () => { this.activeId = id; this.updateTabStops(); });
        actions.addEventListener("focus", () => { this.activeId = id; this.updateTabStops(); });
        actions.addEventListener("click", event => {
            event.stopPropagation(); const rect = actions.getBoundingClientRect();
            this.onPortalMenu(id, rect.right, rect.bottom);
        });
        this.rows.set(id, row); return row;
    }
    activatePortal(id) {
        const row = this.rows.get(id);
        row?.classList.add("portal-activated");
        setTimeout(() => row?.classList.remove("portal-activated"), 300);
        this.onOpenPortal(id);
    }
    render() {
        this.rendering = true;
        const scroll = { top: this.tree.scrollTop, left: this.tree.scrollLeft };
        const focusedRow = document.activeElement?.closest(".hierarchy-row");
        const focused = focusedRow?.dataset.entryId || focusedRow?.dataset.portalId;
        const focusedAction = document.activeElement?.closest('.tree-add,.tree-more,.tree-portal-actions,.tree-disclosure')?.classList[0];
        this.visibleRows = cosmosHierarchy.visible(this.entries, this.index, this.expanded, this.portals);
        if(!this.keepMovedSelection)this.selection.visibleOnly(new Set(this.visibleRows.filter(row=>!row.kind).map(row=>row.id)));
        this.selectedId=this.selection.activeEntryId;
        if (!this.visibleRows.some(row => row.id === this.activeId)) this.activeId = this.visibleRows.some(row => row.id === this.selectedId) ? this.selectedId : this.visibleRows[0]?.id;
        const fragment = document.createDocumentFragment();
        this.visibleRows.forEach(({ id, level, position, size, kind }) => {
            const portal = kind === "portal" ? this.portals.get(id) : null;
            const entry = this.entries.get(portal ? portal.targetEntryId : id), row = this.rows.get(id) || (portal ? this.createPortalRow(id) : this.createRow(id));
            const hasChildren = !portal && this.index.children.get(id).length > 0;
            row.style.setProperty("--tree-indent", `${(level - 1) * 14}px`);
            const mobileIndent=level<=5?(level-1)*9:Math.min(60,36+7*Math.log2(level-4));
            row.style.setProperty('--mobile-tree-indent',`${mobileIndent}px`);
            row.setAttribute("aria-level", level); row.setAttribute("aria-posinset", position); row.setAttribute("aria-setsize", size);
            const location = portal ? galaxyModel.ancestors(this.entries, entry.id).reverse().map(parent => parent.name).join(" › ") || "Universe" : "";
            row.setAttribute("aria-label", portal ? `Linked item ${entry.name}, ${location}` : `${entry.name}, ${entry.depth===0?'Galaxy':'item'}`);
            if (hasChildren) row.setAttribute("aria-expanded", String(this.expanded.has(id))); else row.removeAttribute("aria-expanded");
            row.classList.toggle("is-selected", id === this.selectedId);
            row.classList.toggle('is-multiselected',this.selection.ids.has(id)&&id!==this.selectedId);
            row.classList.toggle("is-search-match", this.searchMatches.has(id));
            row.setAttribute("aria-selected", String(this.selection.ids.has(id)));
            if (!portal) row.dataset.role = entry.role;
            row.draggable=!portal&&!this.narrow&&this.rename?.id!==id;
            row.title = portal ? `Linked item ${entry.name}\n${location}` : entry.name;
            if (this.rename?.id !== id) row.querySelector(".tree-name").textContent = entry.name;
            if (portal) { const actions=row.querySelector(".tree-portal-actions"); actions.ariaLabel=actions.title=`Linked item actions for ${entry.name}`; }
            if (!portal) {
                this.syncTaskControl(entry, row);
                const add = row.querySelector(".tree-add"); add.ariaLabel = add.title = `Add to ${entry.name}`;
                add.hidden=this.narrow;
                if (this.entries.get(entry.parentId)?.taskList === true) add.ariaLabel = add.title = `Add content to ${entry.name}`;
                const more = row.querySelector('.tree-more'); more.ariaLabel = more.title = `Actions for ${entry.name}`;
            }
            fragment.appendChild(row);
        });
        this.tree.replaceChildren(fragment); this.updateTabStops();
        if (focused && this.tree.contains(this.rows.get(focused))) {
            const row=this.rows.get(focused),action=focusedAction?row.querySelector(`.${focusedAction}`):null;
            (this.rename?.id === focused ? this.rename.input : action&&!action.disabled&&!action.hidden?action:row).focus({ preventScroll: true });
        }
        this.tree.scrollTop = scroll.top; this.tree.scrollLeft = scroll.left;
        this.rendering = false;
        if (this.rename && !this.tree.contains(this.rename.row)) this.endRename(false);
    }
    updateTabStops() {
        this.visibleRows?.forEach(({ id }) => {
            const row = this.rows.get(id); row.tabIndex = id === this.activeId ? 0 : -1;
            row.querySelectorAll('.tree-add,.tree-more,.tree-portal-actions,.tree-task-toggle').forEach(button => { button.tabIndex = id === this.activeId&&!button.hidden ? 0 : -1; });
        });
    }
    syncTaskControl(entry, row) {
        const control = row.querySelector('.tree-disclosure');
        const task = entry.taskList !== true && this.entries.get(entry.parentId)?.taskList === true;
        if (control.classList.contains('tree-task-toggle') !== task) {
            control.classList.toggle('tree-task-toggle', task);
            control.innerHTML = task
                ? '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2"/><path class="tree-task-check" d="m4.5 8 2.3 2.5 4.7-5"/></svg>'
                : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>';
        }
        if (task) {
            control.setAttribute('role', 'checkbox');
            control.setAttribute('aria-checked', String(entry.completed === true));
            control.ariaLabel = control.title = `Mark ${entry.name} as ${entry.completed === true ? 'incomplete' : 'done'}`;
            // Keep keyboard focus while the shared completion command saves.
            control.disabled = false;
            control.setAttribute('aria-disabled', String(this.taskBlocked()));
        } else {
            control.removeAttribute('role'); control.removeAttribute('aria-checked'); control.removeAttribute('aria-disabled'); control.removeAttribute('title');
            control.disabled = !this.index.children.get(entry.id)?.length;
            control.ariaLabel = `${this.expanded.has(entry.id) ? 'Collapse' : 'Expand'} ${entry.name}`;
            control.tabIndex = -1;
        }
    }
    refreshTaskControls() {
        this.rows.forEach((row, id) => {
            const entry = this.entries.get(id);
            if (entry && !row.dataset.portalId) this.syncTaskControl(entry, row);
        });
        this.updateTabStops();
    }
    toggleBranch(id) {
        if (!this.index.children.get(id)?.length) return;
        this.keepMovedSelection=false;
        if (this.expanded.has(id)) this.expanded.delete(id); else this.expanded.add(id);
        this.activeId = id; this.render(); this.rows.get(id).focus({ preventScroll: true });
    }
    expandForContentDrag(id) {
        if(!this.entries.has(id)||!this.index.children.get(id)?.length||this.expanded.has(id))return false;
        this.expanded.add(id);this.render();return true;
    }
    get activeEntryId(){return this.selectedId;}
    getSelectedEntryIds(){return [...this.selection.ids].filter(id=>this.entries.has(id));}
    clearMoveTarget(){this.moveTarget?.classList.remove('hierarchy-move-target','hierarchy-move-invalid');this.moveTarget=null;}
    moveOver(event){
        if(!this.moveDrag)return;
        event.stopPropagation();this.clearMoveTarget();
        const row=event.target.closest('.hierarchy-row[data-entry-id]');
        const valid=row&&!this.moveBlocked()&&!galaxyModel.movePlan(this.entries,this.moveDrag.ids,row.dataset.entryId).error;
        if(row){this.moveTarget=row;row.classList.add(valid?'hierarchy-move-target':'hierarchy-move-invalid');}
        event.dataTransfer.dropEffect=valid?'move':'none';if(valid)event.preventDefault();
    }
    endMoveDrag(){
        if(!this.moveDrag)return;
        this.moveDrag=null;this.clearMoveTarget();this.rows.forEach(row=>row.classList.remove('is-moving'));this.onDragEnd?.();
    }
    restoreMovedSelection(ids,activeId){
        this.selection.ids=new Set(ids.filter(id=>this.entries.has(id)));this.selection.activate(activeId);
        this.selection.anchorId=activeId;this.selectedId=activeId;this.keepMovedSelection=true;this.paintSelection();
    }
    paintSelection(){
        this.rows.forEach((row,id)=>{
            row.classList.toggle('is-selected',id===this.selectedId);
            row.classList.toggle('is-multiselected',this.selection.ids.has(id)&&id!==this.selectedId);
            row.setAttribute('aria-selected',String(this.selection.ids.has(id)));
        });
    }
    selectFromClick(id,event){
        if(this.keepMovedSelection){this.selection.retain(new Set(this.visibleRows.filter(row=>!row.kind).map(row=>row.id)));this.selectedId=this.selection.activeEntryId;}
        this.keepMovedSelection=false;
        const visible=this.visibleRows.filter(row=>!row.kind).map(row=>row.id);
        if(this.universeSection.collapsed||!visible.includes(id))return;
        const previous=this.selectedId,touch=this.narrow||event.pointerType==='touch'||event.sourceCapabilities?.firesTouchEvents;
        this.selection.click(id,{visible,range:!touch&&event.shiftKey,toggle:!touch&&!event.shiftKey&&(event.ctrlKey||event.metaKey)});
        this.selectedId=this.selection.activeEntryId;this.paintSelection();
        if(!this.selectedId){this.onSelectionEmpty?.();return;}
        if(this.selectedId!==previous||(!event.ctrlKey&&!event.metaKey))this.onNavigate(this.selectedId,{preserveSidebarSelection:true});
    }
    select(id, { scroll = true, preserveMulti = false } = {}) {
        if(!preserveMulti)this.keepMovedSelection=false;
        if(!preserveMulti||this.selection.activeEntryId!==id)this.selection.single(id);
        this.selectedId = id || null;
        let changed = false;
        if (id&&!this.keepMovedSelection) galaxyModel.ancestors(this.entries, id).forEach(parent => {
            if (!this.expanded.has(parent.id)) { this.expanded.add(parent.id); changed = true; }
        });
        if (changed || (id && !this.tree.contains(this.rows.get(id)))) this.render();
        this.paintSelection();
        if (id) { if(this.visibleRows.some(row=>row.id===id))this.activeId=id; this.updateTabStops(); if (scroll) this.scrollSelected(); }
    }
    scrollSelected() {
        this.scrollRow(this.selectedId);
    }
    scrollRow(id) {
        const row = this.rows.get(id);
        if (this.collapsed || this.universeSection.collapsed || !this.tree.contains(row)) return;
        const bounds = this.tree.getBoundingClientRect(), target = row.getBoundingClientRect();
        if (target.top < bounds.top) this.tree.scrollTop += target.top - bounds.top;
        else if (target.bottom > bounds.bottom) this.tree.scrollTop += target.bottom - bounds.bottom;
        // Extremely deep indentation may need horizontal scrolling. Reveal the
        // name and action rather than aligning an oversized row's empty start.
        if(this.narrow){this.tree.scrollLeft=0;return;}
        const name = row.querySelector(".tree-name").getBoundingClientRect();
        if (name.left < bounds.left + 38) this.tree.scrollLeft += name.left - bounds.left - 38;
        else if (name.right > bounds.right - 38) this.tree.scrollLeft += name.right - bounds.right + 38;
    }
    markSearch(matches) {
        const ids = new Set(matches.map(entry => entry.id));
        this.searchMatches = ids;
        this.rows.forEach((row, id) => row.classList.toggle("is-search-match", ids.has(id)));
    }
    onKey(event) {
        if (event.target.closest("button,input")) return;
        const source = event.target.closest(".hierarchy-row"), id = source?.dataset.entryId || source?.dataset.portalId;
        if (!id) return;
        const portal = this.portals.get(id);
        const index = this.visibleRows.findIndex(row => row.id === id), children = this.index.children.get(id) || [];
        let target;
        if (event.key === 'F2' && !portal) { event.preventDefault(); this.beginRename(id); return; }
        if (event.key === "ArrowDown") target = this.visibleRows[Math.min(index + 1, this.visibleRows.length - 1)]?.id;
        else if (event.key === "ArrowUp") target = this.visibleRows[Math.max(0, index - 1)]?.id;
        else if (event.key === "Home") target = this.visibleRows[0]?.id;
        else if (event.key === "End") target = this.visibleRows.at(-1)?.id;
        else if (event.key === "ArrowRight") { if (children.length && !this.expanded.has(id)) this.toggleBranch(id); else target = children[0]; }
        else if (event.key === "ArrowLeft") { if (children.length && this.expanded.has(id)) this.toggleBranch(id); else target = portal ? portal.parentEntryId : this.entries.get(id).parentId; }
        else if (event.key === "Enter" || event.key === " ") { if (portal) this.activatePortal(id); else { if (this.narrow) this.setCollapsed(true); this.onNavigate(id); } }
        else return;
        event.preventDefault();
        if (target) {
            const row = this.rows.get(target);
            row?.focus({ preventScroll: true });
            this.scrollRow(target);
        }
    }
}
