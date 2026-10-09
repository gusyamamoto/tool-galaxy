// Visible viewport bounds account for browser chrome and the on-screen keyboard.
function cosmosVisibleViewport(){const v=window.visualViewport;return {left:v?.offsetLeft||0,top:v?.offsetTop||0,width:v?.width||innerWidth,height:v?.height||innerHeight};}
function positionCosmosMenu(menu,x,y,{above=null}={}) {
    const v=cosmosVisibleViewport(),gap=8;
    Object.assign(menu.style,{position:'fixed',right:'auto',bottom:'auto',maxWidth:`${v.width-gap*2}px`,maxHeight:`${v.height-gap*2}px`,overflowY:'auto'});
    const rect=menu.getBoundingClientRect();
    const up=above!==null&&y+rect.height>v.top+v.height-gap&&above-rect.height>=v.top+gap;
    menu.style.left=`${Math.max(v.left+gap,Math.min(x,v.left+v.width-rect.width-gap))}px`;
    menu.style.top=`${Math.max(v.top+gap,Math.min(up?above-rect.height:y,v.top+v.height-rect.height-gap))}px`;
    return up;
}
// Shared panel overflow interaction for content and collection entries.
function createPanelItemMenu(actions, label, root) {
    const menu = document.createElement("details"), summary = document.createElement("summary");
    menu.className = "content-item-menu"; summary.textContent = "•••";
    summary.ariaLabel = `Actions for ${label}`; summary.title = summary.ariaLabel;
    actions.setAttribute("role", "menu"); actions.setAttribute("aria-label", summary.ariaLabel);
    actions.querySelectorAll("button").forEach(button => button.setAttribute("role", "menuitem"));
    menu.append(summary, actions);
    menu.addEventListener("toggle", () => {
        if (menu.open) {
            root.querySelectorAll(".content-item-menu[open]").forEach(other => { if (other !== menu) other.open = false; });
            const point = summary.getBoundingClientRect();
            if(window.matchMedia('(max-width: 760px), (pointer: coarse) and (max-width: 1024px) and (max-height: 500px)').matches){
                menu.classList.toggle('opens-up',positionCosmosMenu(actions,point.right-actions.offsetWidth,point.bottom+4,{above:point.top-4}));
            }else{
                actions.removeAttribute('style');const bounds=root.closest('#entry-panel').getBoundingClientRect();
                menu.classList.toggle('opens-up',point.bottom+actions.offsetHeight+6>bounds.bottom&&point.top-bounds.top>actions.offsetHeight+6);
            }
        }
    });
    menu.addEventListener("keydown", event => {
        if (event.key === "Escape" && menu.open) {
            event.preventDefault(); event.stopPropagation(); menu.open = false; summary.focus({ preventScroll: true });
        } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault(); event.stopPropagation(); menu.open = true;
            const buttons = [...actions.querySelectorAll("button:not(:disabled)")];
            const current = buttons.indexOf(document.activeElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : current < 0 ? 0 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next]?.focus({ preventScroll: true });
        }
    });
    menu.addEventListener("focusout", event => { if (event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false; });
    return menu;
}

// Content presentation over canonical entry content and a replaceable file store.
class EntryContentInspector {
    constructor({ store, getEntry, save, rollback, onAction, onLayout, motion=null, imageViewer }) {
        Object.assign(this, { store, getEntry, save, rollback, onAction, onLayout, motion, imageViewer });
        this.root = document.getElementById("panel-rich-content");
        this.notes = document.getElementById("content-notes");
        this.notesForm = document.getElementById("content-notes-form");
        this.notesView = document.getElementById("content-notes-view");
        this.linkForm = document.getElementById("content-link-form");
        this.quickBookmark=document.getElementById('content-bookmarks-empty');this.quickUrl=document.getElementById('content-quick-bookmark-url');
        this.quickSave=document.getElementById('content-quick-bookmark-save');
        this.files = document.getElementById("content-files");
        this.status = document.getElementById("content-status");
        this.jobs = new Map(); this.urls = new Set(); this.generation = 0; this.entryId = null; this.previewLoads = 0;
        this.downloadUrls = new Map();
        this.setupFileDetails();
        this.notes.maxLength = galaxyModel.contentLimits.notes;
        document.getElementById("content-file-limit").textContent = `Documents, archives, images, and project files · up to ${galaxyModel.contentLimits.fileBytes / 1024 / 1024} MiB per file`;
        this.root.addEventListener("input", () => this.onAction());
        this.root.addEventListener("click", () => this.onAction());
        this.notesForm.addEventListener("submit", event => {
            event.preventDefault();
            this.onAction();
            try {
                this.save(this.entryId, { ...this.content(), notes: { format: "plain", text: this.notes.value } });
                this.notesForm.hidden = true; this.renderNotes(); this.message("Note saved.");
            }
            catch (error) { this.error(error); }
        });
        this.notesView.addEventListener('change',event=>{
            const checkbox=event.target.closest('input[data-note-line]');
            if(!checkbox||this.jobs.get(this.entryId))return;
            this.onAction();
            try{
                const text=cosmosEveryday.toggleChecklist(this.content().notes.text,Number(checkbox.dataset.noteLine),checkbox.checked);
                this.save(this.entryId,{...this.content(),notes:{format:'plain',text}});
                this.notes.value=text;this.onLayout();
            }catch(error){checkbox.checked=!checkbox.checked;this.error(error);}
        });
        document.getElementById("content-edit-notes").addEventListener("click", () => this.editNotes());
        document.getElementById("content-add-files").addEventListener("click", () => this.chooseFiles());
        document.getElementById("content-notes-empty").addEventListener("click", () => this.editNotes());
        document.getElementById("content-add-bookmark").addEventListener("click", () => this.editLink());
        document.getElementById("content-cancel-notes").addEventListener("click", () => { this.notesForm.hidden = true; this.renderNotes(); this.onLayout(); });
        document.getElementById("content-cancel-link").addEventListener("click", () => { this.linkForm.hidden = true; this.renderBookmarkState(); this.onLayout(); });
        this.linkForm.addEventListener("submit", event => {
            event.preventDefault();
            this.onAction();
            if(this.saveBookmark(document.getElementById('content-link-url').value,document.getElementById('content-link-title').value.trim(),this.editingLinkId)){
                this.linkForm.hidden=true;this.renderLists();
            }
        });
        this.quickUrl.addEventListener('input',()=>{this.quickSave.hidden=!galaxyModel.webUrl(this.quickUrl.value);this.quickUrl.removeAttribute('aria-invalid');});
        this.quickBookmark.addEventListener('focusin',()=>this.onLayout());
        // The compact mobile field retains a padded tap area around its silhouette.
        this.quickBookmark.addEventListener('click',event=>{if(event.target===this.quickBookmark)this.quickUrl.focus();});
        this.quickBookmark.addEventListener('submit',event=>{event.preventDefault();
            if(this.saveBookmark(this.quickUrl.value)){this.quickUrl.value='';this.quickSave.hidden=true;this.quickUrl.blur();this.renderLists();}
            else this.quickUrl.setAttribute('aria-invalid','true');
        });
        this.files.addEventListener("change", () => {
            const files = [...this.files.files]; this.files.value = "";
            document.getElementById("content-file-limit").hidden = true;
            if (files.length) this.upload(files); else this.onLayout();
        });
        this.files.addEventListener("cancel", () => { document.getElementById("content-file-limit").hidden = true; this.onLayout(); });
        document.addEventListener("pointerdown", event => {
            this.root.querySelectorAll(".content-item-menu[open]").forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
        });
        window.addEventListener("pagehide", () => {
            this.clearPreviews();
            this.downloadUrls.forEach((timer,url)=>{clearTimeout(timer);URL.revokeObjectURL(url)});this.downloadUrls.clear();
        });
    }
    content(id = this.entryId) { return this.getEntry(id)?.content || galaxyModel.emptyContent(); }
    message(text, error = false) {
        clearTimeout(this.statusTimer);
        this.status.textContent = text; this.status.hidden = false; this.status.dataset.error = String(error); this.onLayout();
        if (!error) this.statusTimer = setTimeout(() => { this.status.hidden = true; this.onLayout(); }, 4000);
    }
    error(error) {
        this.message(error?.name === "QuotaExceededError" ? "Browser storage is full. Remove some files and try again." : error?.message || "This content could not be saved.", true);
    }
    select(entry, visible) {
        clearTimeout(this.statusTimer);
        this.entryId = entry?.id || null; this.visible = visible;
        this.linkForm.hidden = this.notesForm.hidden = true; this.status.hidden = true;
        this.quickUrl.value='';this.quickUrl.removeAttribute('aria-invalid');this.quickSave.hidden=true;
        document.getElementById("content-file-limit").hidden = true;
        this.notes.value = this.content().notes.text;
        this.renderNotes(); this.renderLists(); this.busy();
    }
    hide() { this.visible = false; clearTimeout(this.statusTimer); this.clearPreviews(); }
    render() { if (this.entryId) { this.renderLists(); this.busy(); } }
    busy() {
        const busy = !!this.jobs.get(this.entryId);
        this.root.querySelectorAll("button,input,textarea").forEach(field => { field.disabled = busy; });
        this.root.setAttribute("aria-busy", String(busy));
    }
    hasJobs(ids) { return [...ids].some(id => this.jobs.get(id)); }
    async job(id, operation) {
        if (this.jobs.get(id)) { this.message("Wait for the current file action to finish.", true); return; }
        this.onAction(); this.jobs.set(id, 1); this.busy();
        try { await operation(); if (id === this.entryId) { this.renderLists(); this.message("File action completed."); } }
        catch (error) { if (id === this.entryId) { this.renderLists(); this.error(error); } }
        finally { this.jobs.delete(id); this.busy(); }
    }
    editLink(link) {
        if (!this.entryId || this.jobs.get(this.entryId)) return;
        this.onAction();
        this.editingLinkId = link?.id || null;
        document.getElementById("content-link-url").value = link?.url || "";
        document.getElementById("content-link-title").value = link?.title || "";
        this.linkForm.hidden = false; this.renderBookmarkState();
        document.getElementById("content-link-url").focus({ preventScroll: true }); this.onLayout();
    }
    chooseFiles() {
        if (this.entryId && !this.jobs.get(this.entryId)) {
            this.onAction(); document.getElementById("content-file-limit").hidden = false;
            this.onLayout(); this.files.click();
        }
    }
    editNotes() {
        if (!this.entryId || this.jobs.get(this.entryId)) return;
        this.onAction();
        if (this.notesForm.hidden) this.notes.value = this.content().notes.text;
        this.notesForm.hidden = false; this.renderNotes();
        this.notes.focus({ preventScroll: true }); this.onLayout();
    }
    renderNotes() {
        const text = this.content().notes.text;
        this.notesView.replaceChildren();
        if(!/^\s*-\s+\[[ xX]\]\s+/m.test(text))this.notesView.textContent=text;
        else text.split('\n').forEach((line,index,lines)=>{
            const checklist=cosmosEveryday.checklistLine(line);
            if(!checklist){this.notesView.append(document.createTextNode(line+(index<lines.length-1?'\n':'')));return;}
            const label=document.createElement('label'),checkbox=document.createElement('input'),description=document.createElement('span');
            label.className='note-checklist';checkbox.type='checkbox';checkbox.checked=checklist.checked;checkbox.dataset.noteLine=index;
            checkbox.ariaLabel=checklist.label||'Checklist item';description.textContent=checklist.label;label.append(checkbox,description);this.notesView.append(label);
        });
        this.notesView.hidden = !text || !this.notesForm.hidden;
        const button = document.getElementById("content-edit-notes");
        button.hidden = !text || !this.notesForm.hidden;
        document.getElementById("content-notes-empty").hidden = !!text || !this.notesForm.hidden;
    }
    renderBookmarkState() { const empty=!this.content().links.length&&this.linkForm.hidden;this.quickBookmark.hidden=!empty;document.getElementById('content-add-bookmark').hidden=empty; }
    saveBookmark(value,title='',editingId=null){
        this.onAction();const url=galaxyModel.webUrl(value);
        if(!url){this.message('Enter a valid website address, such as google.com or an HTTPS URL.',true);return false;}
        const link={id:editingId||crypto.randomUUID(),url,...(title?{title}:{})},content=this.content();
        const links=editingId?content.links.map(old=>old.id===link.id?link:old):[...content.links,link];
        try{this.save(this.entryId,{...content,links});this.message('Bookmark saved.');return true;}
        catch(error){this.error(error);return false;}
    }
    button(text, action, label = text) {
        const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.ariaLabel = label;
        button.addEventListener("click", action); return button;
    }
    itemMenu(actions, label) {
        return createPanelItemMenu(actions, label, this.root);
    }
    clearPreviews() { this.generation++; this.urls.forEach(url => URL.revokeObjectURL(url)); this.urls.clear(); }
    renderLists() {
        const links = document.getElementById("content-links"), files = document.getElementById("content-attachments");
        const changed=this.listEntryId!==this.entryId,previous=this.listFileIds||new Set(),current=new Set(this.content().attachments.map(file=>file.id));
        if(!changed&&this.visible&&this.motion&&!this.motion.reduced){
            const removed=[...files.children].filter(row=>!current.has(row.dataset.attachmentId)).map(row=>({rect:row.getBoundingClientRect(),name:row.querySelector('.content-file-name').textContent}));
            removed.forEach(row=>this.motion.fileExit(row.name,row.rect,this.root.closest('#entry-panel')));
        }
        this.listEntryId=this.entryId;this.listFileIds=current;this.clearPreviews();
        links.replaceChildren(); files.replaceChildren();
        if (!this.entryId) return;
        this.content().links.forEach(link => {
            const item = document.createElement("li"), anchor = document.createElement("a"), url = document.createElement("small"), actions = document.createElement("div"), info = document.createElement("div"), icon = document.createElement("span");
            const address = new URL(link.url);
            item.className = "content-bookmark";
            icon.className = "bookmark-icon"; icon.ariaHidden = "true";
            icon.innerHTML = '<svg viewBox="0 0 20 20"><path d="M5 3h10v14l-5-3-5 3z"/></svg>';
            anchor.href = link.url; anchor.target = "_blank"; anchor.rel = "noopener noreferrer"; anchor.textContent = link.title || address.hostname;
            url.textContent = `${address.hostname}${address.pathname === "/" ? "" : address.pathname}${address.search}`;
            url.title = link.url;
            actions.className = "content-row-actions";
            actions.append(this.button("Edit", () => this.editLink(link), `Edit bookmark ${link.title || link.url}`), this.button("Remove", () => {
                try { this.save(this.entryId, { ...this.content(), links: this.content().links.filter(old => old.id !== link.id) }); this.renderLists(); this.message("Bookmark removed."); }
                catch (error) { this.error(error); }
            }, `Remove bookmark ${link.title || link.url}`));
            info.className = "bookmark-info"; info.append(anchor, url);
            item.append(icon, info, this.itemMenu(actions, link.title || link.url)); links.append(item);
        });
        const generation = this.generation;
        const gallery=this.content().attachments.filter(file=>galaxyModel.filePolicy.classify(file).kind==='image').length>1;
        files.classList.toggle('has-image-gallery',gallery);
        this.content().attachments.forEach(metadata => {
            const capability = galaxyModel.filePolicy.classify(metadata), generic = capability.kind === 'generic';
            const item = document.createElement("li"), name = this.button(metadata.filename, event => this.openFile(metadata,event.currentTarget), `${generic?'File details for':'Open attachment'} ${metadata.filename}`), size = document.createElement("small"), preview = document.createElement("div"), actions = document.createElement("div"), info = document.createElement("div");
            item.className = "content-file"; item.dataset.attachmentId = metadata.id;
            if(capability.kind==='image')item.classList.add('content-image');
            name.className = "content-file-name";
            preview.className = "content-file-preview";
            const badge = this.button(capability.badge, event => this.openFile(metadata,event.currentTarget), `${generic?'File details for':'View'} ${metadata.filename}`);
            badge.className = "content-file-icon"; preview.append(badge);
            name.title = name.ariaLabel; badge.title = badge.ariaLabel;
            size.textContent = `${metadata.size >= 1024*1024 ? (metadata.size/1024/1024).toFixed(1)+" MiB" : metadata.size >= 1024 ? (metadata.size/1024).toFixed(1)+" KiB" : metadata.size+" B"}`;
            actions.className = "content-row-actions";
            actions.append(this.button("Remove", event => {
                const button = event.currentTarget;
                if (button.dataset.confirm !== "true") { button.dataset.confirm = "true"; button.textContent = "Confirm remove"; button.ariaLabel = `Confirm remove attachment ${metadata.filename}`; return; }
                const id = metadata.entryId;
                this.job(id, async () => {
                    const previous = {content:this.getEntry(id)?.content, updatedAt:this.getEntry(id)?.updatedAt};
                    await this.store.delete(metadata.storageKey,
                        () => this.save(id, { ...this.content(id), attachments: this.content(id).attachments.filter(file => file.id !== metadata.id) }),
                        () => this.rollback(id, previous));
                });
            }, `Remove attachment ${metadata.filename}`));
            info.className = "content-file-info"; info.append(name, size);
            item.append(preview, info, this.itemMenu(actions, metadata.filename)); files.append(item);
            if(!changed&&!previous.has(metadata.id)&&this.visible)this.motion?.fileEnter(item);
            if (this.visible) this.preview(metadata, preview, generation);
        });
        document.getElementById("content-files-empty").hidden = !!this.content().attachments.length;
        this.renderBookmarkState();
        this.onLayout();
    }
    async preview(metadata, element, generation) {
        const capability = galaxyModel.filePolicy.classify(metadata);
        if (!['image','text'].includes(capability.kind)) return;
        this.previewLoads++;
        try {
            const record = await this.store.get(metadata.storageKey);
            if (generation !== this.generation || !this.visible) return;
            if (!record || record.entryId !== metadata.entryId) { element.textContent = "File unavailable in this browser storage."; return; }
            if (capability.kind === 'image' && record.thumbnail) {
                const image = document.createElement("img"), url = URL.createObjectURL(record.thumbnail);
                this.urls.add(url); image.src = url; image.alt = `Preview of ${metadata.filename}`; image.loading = "lazy";
                element.querySelector("button").replaceChildren(image);
                image.onload = () => this.onLayout();
            } else if (capability.kind === 'text') {
                const text = await record.blob.slice(0,galaxyModel.contentLimits.textPreviewBytes).text();
                if (generation !== this.generation) return;
                const pre = document.createElement("pre"); pre.textContent = text; pre.className = "content-text-preview";
                element.parentElement.append(pre);
            }
        } catch (error) { if (generation === this.generation) element.textContent = "Preview unavailable. Use Open to try again."; }
    }
    upload(files) {
        const id = this.entryId;
        return this.job(id, async () => {
            for (const file of files) {
                const { metadata, record } = await galaxyAttachmentFiles.prepare(file,id);
                let previous;
                await this.store.save(record, () => {
                    previous = {content:this.getEntry(id)?.content, updatedAt:this.getEntry(id)?.updatedAt};
                    this.save(id, { ...this.content(id), attachments: [...this.content(id).attachments, metadata] });
                }, () => this.rollback(id, previous));
            }
        });
    }
    setupFileDetails() {
        this.fileDetails = document.getElementById('file-details-dialog');
        const dialog = this.fileDetails, close = document.getElementById('file-details-close');
        const copy = document.getElementById('file-details-save-copy'), status = document.getElementById('file-details-status');
        this.fileDetailsSession = 0;
        close.addEventListener('click', () => dialog.close());
        dialog.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
            else if (event.key === 'Tab') {
                if (event.shiftKey && document.activeElement === close && !copy.disabled) { event.preventDefault(); copy.focus(); }
                else if (!event.shiftKey && document.activeElement === copy) { event.preventDefault(); close.focus(); }
                else if (copy.disabled) { event.preventDefault(); close.focus(); }
            }
        });
        const outside = event => { const r=dialog.getBoundingClientRect();return event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom); };
        let backdrop = false;
        dialog.addEventListener('pointerdown', event => { backdrop = outside(event); });
        dialog.addEventListener('click', event => { if (backdrop && outside(event)) dialog.close(); backdrop=false; });
        dialog.addEventListener('close', () => {
            if (dialog.open) return;
            this.fileDetailsSession++; this.fileDetailsMetadata = null;
            const trigger = this.fileDetailsTrigger;
            const fallback = document.getElementById('close-inspector-button');
            (trigger?.isConnected && trigger.getClientRects().length ? trigger : fallback.getClientRects().length ? fallback : document.getElementById('sidebar-toggle')).focus({preventScroll:true});
        });
        copy.addEventListener('click', async () => {
            const metadata = this.fileDetailsMetadata, session = this.fileDetailsSession;
            if (!metadata || copy.disabled) return;
            copy.disabled = true; status.hidden = true;
            const success = await this.downloadFile(metadata, error => {
                if (session !== this.fileDetailsSession || !dialog.open) return;
                status.textContent = error.message || 'This copy could not be saved. Please try again.';status.hidden=false;
            });
            if (session !== this.fileDetailsSession || !dialog.open) return;
            copy.disabled=false;
            if (success) { status.textContent='Copy sent to your browser’s downloads.';status.hidden=false; }
        });
    }
    showFileDetails(metadata, trigger) {
        if (document.querySelector('dialog[open]')) return;
        this.fileDetailsSession++;this.fileDetailsMetadata={...metadata};this.fileDetailsTrigger=trigger;
        const extension = galaxyModel.filePolicy.extension(metadata.filename);
        document.getElementById('file-details-name').textContent = metadata.filename;
        document.getElementById('file-details-type').textContent = extension ? `${extension.toUpperCase()} file` : 'File';
        document.getElementById('file-details-size').textContent = metadata.size>=1024*1024 ? `${(metadata.size/1024/1024).toFixed(1)} MiB` : metadata.size>=1024 ? `${(metadata.size/1024).toFixed(1)} KiB` : `${metadata.size} B`;
        document.getElementById('file-details-status').hidden=true;document.getElementById('file-details-save-copy').disabled=false;
        this.fileDetails.showModal();
    }
    async downloadFile(metadata, onError = error => this.error(error)) {
        try {
            const record = await this.store.get(metadata.storageKey);
            if (!record || record.entryId !== metadata.entryId) throw new Error('This file is unavailable in this browser storage.');
            // Generic files download inertly; never navigate to active HTML/SVG
            // or let a browser infer an executable preview from a MIME guess.
            const url = URL.createObjectURL(new Blob([record.blob], {type:'application/octet-stream'}));
            const link = document.createElement('a');link.href=url;link.download=metadata.filename;link.hidden=true;
            document.body.append(link);link.click();link.remove();
            const timer = setTimeout(()=>{URL.revokeObjectURL(url);this.downloadUrls.delete(url)},60000);
            this.downloadUrls.set(url,timer);
            return true;
        } catch (error) { onError(error); return false; }
    }
    async openFile(metadata, trigger = document.activeElement) {
        this.onAction();
        const capability = galaxyModel.filePolicy.classify(metadata);
        if (['image','pdf'].includes(capability.kind)) { this.imageViewer.open(metadata, trigger); return; }
        if (capability.kind === 'generic') { this.showFileDetails(metadata,trigger); return; }
        const tab = window.open("about:blank", "_blank");
        if (!tab) { this.message("Allow this file to open in a new browser tab.", true); return; }
        tab.opener = null;
        try {
            const record = await this.store.get(metadata.storageKey);
            if (!record || record.entryId !== metadata.entryId) throw new Error("This file is unavailable in this browser storage.");
            const blob = new Blob([record.blob],{type:"text/plain"});
            const url = URL.createObjectURL(blob);
            tab.location.replace(url);
            const timer = setInterval(() => { if (tab.closed) { URL.revokeObjectURL(url); clearInterval(timer); } },1000);
            window.addEventListener("pagehide", () => { URL.revokeObjectURL(url); clearInterval(timer); }, { once: true });
        } catch (error) { tab.close(); this.error(error); }
    }
}
