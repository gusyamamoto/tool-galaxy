// Visible viewport bounds account for browser chrome and the on-screen keyboard.
function cosmosVisibleViewport(){const v=window.visualViewport;return {left:v?.offsetLeft||0,top:v?.offsetTop||0,width:v?.width||innerWidth,height:v?.height||innerHeight};}
function positionCosmosMenu(menu,x,y,{above=null,maxHeight=null}={}) {
    const v=cosmosVisibleViewport(),gap=8;
    Object.assign(menu.style,{position:'fixed',right:'auto',bottom:'auto',maxWidth:`${v.width-gap*2}px`,maxHeight:`${Math.min(v.height-gap*2,maxHeight??Infinity)}px`,overflowY:'auto'});
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
            if(menu.closest('.content-media-item') || window.matchMedia('(max-width: 760px), (pointer: coarse) and (max-width: 1024px) and (max-height: 500px)').matches){
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
    constructor({ store, getEntry, save, saveLocation, rollback, onAction, onLayout, motion=null, imageViewer, addAttachment,removeAttachment,
        notifyFileFailure=()=>{}, isSessionStale=()=>false,checkCapacity=null,capacityFailure=()=>{},cancelCapacity=()=>{} }) {
        Object.assign(this, { store, getEntry, save, saveLocation, rollback, onAction, onLayout, motion, imageViewer,addAttachment,removeAttachment,notifyFileFailure,isSessionStale });
        Object.assign(this,{checkCapacity,capacityFailure,cancelCapacity});
        this.root = document.getElementById("panel-rich-content");
        this.notes = document.getElementById("content-notes");
        this.notesForm = document.getElementById("content-notes-form");
        this.notesView = document.getElementById("content-notes-view");
        this.linkForm = document.getElementById("content-link-form");
        this.quickBookmark=document.getElementById('content-bookmarks-empty');this.quickUrl=document.getElementById('content-quick-bookmark-url');
        this.quickSave=document.getElementById('content-quick-bookmark-save');
        this.files = document.getElementById("content-files");
        this.status = document.getElementById("content-status");
        this.onLayout=()=>{
            // Editor feedback shares its field scroller; a previous success/error
            // must not consume the composer's minimum field/action space.
            const editing=this.root.closest('#entry-panel')?.dataset.contentsState==='browse'
                ?this.root.querySelector('[data-page-hidden="false"] .inline-editor:not([hidden])'):null;
            const target=editing?.querySelector('.inline-editor-fields')||this.root;
            if(this.status.parentElement!==target)target.append(this.status);
            onLayout();
        };
        this.jobs = new Map(); this.urls = new Set(); this.generation = 0; this.entryId = null; this.previewLoads = 0;
        this.downloadUrls = new Map();this.pendingDrafts=new Map();this.nativePreviews=new Map();
        this.setupFileDetails();
        this.setupLocation();
        this.notes.maxLength = galaxyModel.contentLimits.notes;
        document.getElementById("content-file-limit").textContent = `Photos and files · up to ${galaxyModel.contentLimits.fileBytes / 1024 / 1024} MiB each. Videos · up to ${galaxyModel.contentLimits.videoBytes / 1024 / 1024} MiB each in local browser storage.`;
        this.root.addEventListener("input", () => this.onAction());
        this.root.addEventListener("click", () => this.onAction());
        this.notesForm.addEventListener("submit", async event => {
            event.preventDefault();
            this.onAction();const id=this.entryId;
            try {
                const text=this.notes.value;this.pendingDrafts.set(id,{...this.pendingDrafts.get(id),notes:text});
                await this.semantic(id,()=>this.save(id,content=>({...content,notes:{format:'plain',text}})));
                const draft=this.pendingDrafts.get(id);if(draft)delete draft.notes;
                if(id===this.entryId){this.notesForm.hidden = true; this.renderNotes(); this.clearMessage();}
            }
            catch (error) { if(id===this.entryId)this.error(error); }
        });
        this.setupNoteEditing();
        this.notesView.addEventListener('change',async event=>{
            const checkbox=event.target.closest('input[data-note-line]');
            if(!checkbox||this.jobs.get(this.entryId))return;
            this.onAction();
            try{
                const text=cosmosEveryday.toggleChecklist(this.content().notes.text,Number(checkbox.dataset.noteLine),checkbox.checked);
                const id=this.entryId;await this.semantic(id,()=>this.save(id,content=>({...content,notes:{format:'plain',text}})));
                if(id===this.entryId){this.notes.value=text;this.onLayout();}
            }catch(error){checkbox.checked=!checkbox.checked;this.error(error);}
        });
        document.getElementById("content-edit-notes").addEventListener("click", () => this.editNotes());
        document.getElementById("content-add-files").addEventListener("click", () => this.chooseFiles());
        document.getElementById("content-add-media").addEventListener("click", () => this.chooseFiles({media:true}));
        document.getElementById("content-notes-empty").addEventListener("click", () => this.editNotes());
        document.getElementById("content-add-bookmark").addEventListener("click", () => this.addBookmark());
        document.getElementById("content-cancel-notes").addEventListener("click", () => { if(this.pendingDrafts.get(this.entryId))delete this.pendingDrafts.get(this.entryId).notes;this.notesForm.hidden = true; this.renderNotes(); this.onLayout(); });
        document.getElementById("content-cancel-link").addEventListener("click", () => { if(this.pendingDrafts.get(this.entryId))delete this.pendingDrafts.get(this.entryId).bookmark;this.linkForm.hidden = true; this.renderBookmarkState(); this.onLayout(); });
        this.linkForm.addEventListener("submit", async event => {
            event.preventDefault();
            this.onAction();
            if(await this.saveBookmark(document.getElementById('content-link-url').value,document.getElementById('content-link-title').value.trim(),this.editingLinkId)){
                this.linkForm.hidden=true;this.renderLists();
            }
        });
        this.quickUrl.addEventListener('input',()=>{this.quickSave.hidden=false;this.quickUrl.removeAttribute('aria-invalid');});
        document.getElementById('content-cancel-quick-bookmark').addEventListener('click',()=>this.cancelQuickBookmark());
        this.quickBookmark.addEventListener('keydown',event=>{
            if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.cancelQuickBookmark();}
        });
        this.quickBookmark.addEventListener('focusin',()=>this.onLayout());
        // The compact mobile field retains a padded tap area around its silhouette.
        this.quickBookmark.addEventListener('click',event=>{if(event.target===this.quickBookmark)this.quickUrl.focus();});
        this.quickBookmark.addEventListener('submit',async event=>{event.preventDefault();const id=this.entryId;
            if(await this.saveBookmark(this.quickUrl.value)){this.cancelQuickBookmark();this.renderLists();}
            else if(id===this.entryId)this.quickUrl.setAttribute('aria-invalid','true');
        });
        const inlineEntries=[
            [this.quickBookmark,this.quickUrl,options=>this.cancelQuickBookmark(options)],
            [this.locationForm,this.locationInput,options=>this.cancelLocation(options)]
        ].map(([form,input,cancel])=>({form,input,cancel,empty:()=>!form.hidden&&!input.value.trim()&&!this.jobs.get(this.entryId)}));
        // Keep the target stable until click dispatch, then collapse before
        // its action runs (so anchored menus use the final sheet position).
        // Keyboard focus changes still collapse empty entry immediately.
        const sheet=this.root.closest('#entry-panel');let pendingEmptyEntries=[];
        sheet.addEventListener('pointerdown',event=>{
            pendingEmptyEntries=[];
            if(event.button!==0||!event.target.closest('button,a,summary'))return;
            pendingEmptyEntries=inlineEntries.filter(entry=>entry.empty()&&!entry.form.contains(event.target));
            if(pendingEmptyEntries.length)event.preventDefault();
        },true);
        sheet.addEventListener('click',()=>{
            const pending=pendingEmptyEntries;pendingEmptyEntries=[];
            pending.forEach(entry=>{if(entry.empty())entry.cancel({restoreFocus:false});});
        },true);
        sheet.addEventListener('pointercancel',()=>{pendingEmptyEntries=[];});
        sheet.addEventListener('keydown',()=>{pendingEmptyEntries=[];},true);
        for(const {form,input,cancel,empty} of inlineEntries){
            form.addEventListener('focusout',event=>{
                if(empty()&&!form.contains(event.relatedTarget))cancel({restoreFocus:false});
            });
            input.addEventListener('invalid',event=>{if(empty()){event.preventDefault();cancel();}});
            form.addEventListener('submit',event=>{
                if(empty()){event.preventDefault();event.stopImmediatePropagation();cancel();}
            },true);
        }
        this.files.addEventListener("change", () => {
            const files = [...this.files.files]; this.files.value = "";
            const selection = this.fileSelection; this.fileSelection = null;
            document.getElementById("content-file-limit").hidden = true;
            const id = selection?.entryId || this.entryId;
            if (files.length && this.getEntry(id)) {
                selection?.onSelect?.(); this.upload(files, id);
            } else this.onLayout();
        });
        this.files.addEventListener("cancel", () => { this.fileSelection = null; document.getElementById("content-file-limit").hidden = true; this.onLayout(); });
        document.addEventListener("pointerdown", event => {
            this.root.querySelectorAll(".content-item-menu[open]").forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
        });
        window.addEventListener("pagehide", () => {
            this.clearPreviews();
            this.clearNativePreviews();
        });
    }
    content(id = this.entryId) { return this.getEntry(id)?.content || galaxyModel.emptyContent(); }
    clearMessage() {
        this.inlineFileFailure=null;
        clearTimeout(this.statusTimer);this.status.textContent='';this.status.hidden=true;this.onLayout();
    }
    message(text, error = false) {
        clearTimeout(this.statusTimer);
        this.status.textContent = text; this.status.hidden = false; this.status.dataset.error = String(error); this.onLayout();
        if (error && this.visible) requestAnimationFrame(() => {
            if (this.visible && this.status.parentElement===this.root && this.status.textContent === text && this.status.dataset.error === 'true' && this.status.getClientRects().length)
                this.status.scrollIntoView({block:'nearest'});
        });
        if (!error) this.statusTimer = setTimeout(() => { this.status.hidden = true; this.onLayout(); }, 4000);
    }
    error(error, prefix='') {
        const quota = error?.name === "QuotaExceededError" || error?.cause?.name === "QuotaExceededError";
        if(quota)this.capacityFailure?.();
        const messages = {
            NotReadableError: 'This file could not be read. Download or save a copy onto this device, then choose it again.',
            NotFoundError: 'This file is no longer available. Download or save a local copy, then choose it again.',
            SecurityError: 'This browser is blocking access to the file or local storage. Allow site storage or try a regular browser tab.',
            DataCloneError: 'This file could not be saved. Download or save a copy onto this device, then choose it again.'
        };
        const detail=quota ? "There isn’t enough local browser storage for this attachment. Free some space or choose a smaller file or video and try again." : messages[error?.name] || messages[error?.cause?.name] || error?.message || "This content could not be saved.";
        this.message(prefix ? `${prefix} ${detail}` : detail, true);
    }
    select(entry, visible) {
        this.cancelCapacity?.();
        if(this.entryId!==entry?.id&&this.imageViewer?.dialog.open)this.imageViewer.dialog.close();
        this.promoteFileFailure();
        clearTimeout(this.statusTimer);
        this.entryId = entry?.id || null; this.visible = visible;
        this.linkForm.hidden = this.notesForm.hidden = this.locationForm.hidden = true; this.status.hidden = true;
        this.locationInput.value='';this.locationInput.removeAttribute('aria-invalid');this.locationError.hidden=true;
        this.quickEditing=false;this.quickUrl.value='';this.quickUrl.removeAttribute('aria-invalid');this.quickSave.hidden=false;
        document.getElementById("content-file-limit").hidden = true;
        this.notes.value = this.content().notes.text;
        const draft=this.pendingDrafts.get(this.entryId);
        if(draft?.notes!==undefined){this.notes.value=draft.notes;this.notesForm.hidden=false;}
        if(draft?.location!==undefined){this.locationInput.value=draft.location;this.locationForm.hidden=false;}
        if(draft?.bookmark){document.getElementById('content-link-url').value=draft.bookmark.value;document.getElementById('content-link-title').value=draft.bookmark.title;this.editingLinkId=draft.bookmark.editingId;this.linkForm.hidden=false;}
        this.renderNotes(); this.renderLists(); this.renderLocation(); this.busy();
    }
    hide() { this.cancelCapacity?.();this.promoteFileFailure(); this.visible = false; clearTimeout(this.statusTimer); this.clearPreviews();this.reconcilePreviews();if(this.imageViewer?.dialog.open)this.imageViewer.dialog.close(); }
    render() { if (this.entryId) { this.renderLists(); this.renderLocation(); this.busy(); } }
    setupLocation() {
        this.locationForm=document.getElementById('content-location-form');
        this.locationInput=document.getElementById('content-location-input');
        this.locationError=document.getElementById('content-location-error');
        this.locationInput.maxLength=galaxyModel.locationTextLimit;
        document.getElementById('content-add-location').addEventListener('click',()=>this.editLocation());
        document.getElementById('content-edit-location').addEventListener('click',()=>this.editLocation());
        document.getElementById('content-cancel-location').addEventListener('click',()=>this.cancelLocation());
        this.locationInput.addEventListener('input',()=>{this.locationInput.removeAttribute('aria-invalid');this.locationError.hidden=true;});
        this.locationForm.addEventListener('keydown',event=>{
            if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.cancelLocation();}
        });
        this.locationForm.addEventListener('submit',async event=>{
            event.preventDefault();this.onAction();
            if(!this.entryId||this.jobs.get(this.entryId))return;const id=this.entryId;
            try{
                const text=this.locationInput.value;this.pendingDrafts.set(id,{...this.pendingDrafts.get(id),location:text});
                await this.semantic(id,()=>this.saveLocation(id,{text}));delete this.pendingDrafts.get(id).location;
                if(id!==this.entryId)return;
                this.locationForm.hidden=true;this.renderLocation();this.clearMessage();
                document.getElementById('content-edit-location').focus({preventScroll:true});
            }catch(error){
                if(id!==this.entryId)return;
                this.locationError.textContent=error.message;this.locationError.hidden=false;
                this.locationInput.setAttribute('aria-invalid','true');this.locationInput.focus({preventScroll:true});this.onLayout();
            }
        });
        document.getElementById('content-remove-location').addEventListener('click',async()=>{
            if(!this.entryId||this.jobs.get(this.entryId))return;
            this.onAction();
            try{const id=this.entryId;await this.semantic(id,()=>this.saveLocation(id,null));if(id!==this.entryId)return;this.renderLocation();this.message('Location removed.');document.getElementById('content-add-location').focus({preventScroll:true});}
            catch(error){this.message(error.message,true);}
        });
    }
    renderLocation() {
        const location=this.getEntry(this.entryId)?.location,editing=!this.locationForm.hidden;
        document.getElementById('content-location-empty').hidden=!!location||editing;
        document.getElementById('content-add-location').hidden=!!location||editing;
        document.getElementById('content-location-view').hidden=!location||editing;
        document.getElementById('content-location-text').textContent=location?.text||'';
        const maps=document.getElementById('content-location-maps'),href=galaxyModel.locationMapsUrl(location);
        if(href)maps.href=href;else maps.removeAttribute('href');
        this.onLayout();
    }
    editLocation() {
        if(!this.entryId||this.jobs.get(this.entryId))return;
        this.onAction();this.locationInput.value=this.getEntry(this.entryId)?.location?.text||'';
        this.locationInput.removeAttribute('aria-invalid');this.locationError.hidden=true;
        this.locationForm.hidden=false;this.renderLocation();this.focusEditor(this.locationInput);
    }
    cancelLocation({restoreFocus=true}={}) {
        if(this.pendingDrafts.get(this.entryId))delete this.pendingDrafts.get(this.entryId).location;
        this.onAction();this.locationForm.hidden=true;this.locationInput.value='';this.locationError.hidden=true;
        this.locationInput.removeAttribute('aria-invalid');this.renderLocation();
        if(restoreFocus)document.getElementById(this.getEntry(this.entryId)?.location?'content-edit-location':'content-add-location').focus({preventScroll:true});
    }
    busy() {
        const busy = !!this.jobs.get(this.entryId);
        this.root.querySelectorAll("button,input,textarea").forEach(field => { field.disabled = busy; });
        this.root.setAttribute("aria-busy", String(busy));
    }
    async semantic(id,operation){
        if(this.jobs.get(id))throw new Error('Wait for the current content action to finish.');
        this.jobs.set(id,1);this.busy();
        try{return await operation();}finally{this.jobs.delete(id);this.busy();}
    }
    hasJobs(ids) { return [...ids].some(id => this.jobs.get(id)); }
    promoteFileFailure() {
        if(!this.inlineFileFailure)return;
        if(!this.isSessionStale())this.notifyFileFailure(this.inlineFileFailure);
        this.inlineFileFailure=null;this.status.hidden=true;
    }
    fileFailureText(context,error) {
        const file=context.filename ? `“${context.filename}”` : 'the file';
        const item=context.itemName ? `“${context.itemName}”` : 'the original Item';
        const action=context.operation==='remove' ? `remove ${file} from` : `add ${file} to`;
        const quota=error?.name==='QuotaExceededError'||error?.cause?.name==='QuotaExceededError';
        return `Couldn’t ${action} ${item}.${quota?' Browser storage is full. Free some space and try again.':''}`;
    }
    async job(id, operation, details={}) {
        if (this.jobs.get(id)) { this.message("Wait for the current file action to finish.", true); return; }
        const context={itemId:id,itemName:this.getEntry(id)?.name,operation:'add',...details};
        this.onAction(); this.jobs.set(id, 1); this.busy();
        try { await operation(context); if (id === this.entryId) { this.renderLists(); this.clearMessage(); } }
        catch (error) {
            // F1 owns stale-session feedback and its Reload action.
            this.capacityFailure?.();
            if(!this.isSessionStale()&&error?.code!=='LOCAL_SNAPSHOT_STALE'&&error?.cause?.code!=='LOCAL_SNAPSHOT_STALE') {
                const text=this.fileFailureText(context,error);
                if(id===this.entryId&&this.visible&&!document.querySelector('dialog[open]')) {
                    this.renderLists();this.error(error,this.fileFailureText(context));this.inlineFileFailure=text;
                } else this.notifyFileFailure(text);
            }
        }
        finally { this.jobs.delete(id); this.busy(); }
    }
    focusEditor(input) {
        this.onLayout();
        if(this.root.closest('#entry-panel')?.dataset.contentsState==='browse') {
            // A previous list scroll must not carry the new composer offscreen.
            this.root.scrollTop=0;
            input.focus({preventScroll:true});
            input.scrollIntoView({block:'nearest',inline:'nearest'});
        } else input.focus({preventScroll:true});
    }
    editLink(link) {
        if (!this.entryId || this.jobs.get(this.entryId)) return;
        this.onAction();
        this.quickEditing=false;this.editingLinkId = link?.id || null;
        document.getElementById("content-link-url").value = link?.url || "";
        document.getElementById("content-link-title").value = link?.title || "";
        this.linkForm.hidden = false; this.renderBookmarkState();
        this.focusEditor(document.getElementById('content-link-url'));
    }
    chooseFiles({media=false,source='files',entryId=this.entryId,onSelect=null} = {}) {
        if (this.getEntry(entryId) && !this.jobs.get(entryId)) {
            this.cancelCapacity?.();
            this.fileSelection = {entryId,onSelect};
            // A different inspected body's job must not disable this destination.
            this.files.disabled = false;
            this.files.value = '';
            this.files.removeAttribute('capture'); this.files.multiple = source !== 'camera';
            if (source === 'camera') { this.files.accept = 'image/*'; this.files.setAttribute('capture','environment'); }
            else if (source === 'gallery') this.files.accept = 'image/*,.heic,.heif';
            else if (media) this.files.accept = '.jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.webm,.mov';
            else this.files.removeAttribute('accept');
            this.files.setAttribute('aria-label', source === 'camera' ? 'Take Photo' : source === 'gallery' ? 'Photo Gallery' : media ? 'Choose photos or videos' : 'Choose files');
            this.onAction(); document.getElementById("content-file-limit").hidden = false;
            this.onLayout();
            try { this.files.click(); }
            catch (error) { this.fileSelection = null; document.getElementById('content-file-limit').hidden = true; this.error(error); }
        }
    }
    setupNoteEditing() {
        // Saved Notes are a mobile edit target, but scrolling, text selection and
        // checklist controls keep their own gestures. Desktop keeps its Edit action.
        const mobile=()=>this.root.closest('#entry-panel')?.dataset.contentsState==='browse';
        const pointers=new Set();let tap=null;
        document.addEventListener('pointerdown',event=>{
            pointers.add(event.pointerId);tap=null;
            if(pointers.size===1&&event.isPrimary&&event.button===0&&mobile()&&this.notesView.contains(event.target)&&!event.target.closest('input,label,a,button'))
                tap={id:this.entryId,x:event.clientX,y:event.clientY,scroll:this.root.scrollTop};
        },true);
        document.addEventListener('pointermove',event=>{
            if(tap&&Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>8)tap=null;
        },true);
        document.addEventListener('pointerup',event=>{pointers.delete(event.pointerId);if(tap)tap.released=true;},true);
        document.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);tap=null;},true);
        window.addEventListener('blur',()=>{pointers.clear();tap=null;});
        this.notesView.addEventListener('click',event=>{
            if(!mobile()||event.target.closest('input,label,a,button'))return;
            const clean=event.detail===0||tap?.released&&tap.id===this.entryId&&tap.scroll===this.root.scrollTop&&!window.getSelection()?.toString();
            tap=null;if(clean)this.editNotes();
        });
        this.notesView.addEventListener('keydown',event=>{
            if(mobile()&&event.target===this.notesView&&['Enter',' '].includes(event.key)){
                event.preventDefault();this.editNotes();
            }
        });
    }
    editNotes() {
        if (!this.entryId || this.jobs.get(this.entryId)) return;
        this.onAction();
        if (this.notesForm.hidden) this.notes.value = this.content().notes.text;
        this.notesForm.hidden = false; this.renderNotes();
        this.focusEditor(this.notes);
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
        const mobile=this.root.closest('#entry-panel')?.dataset.contentsState==='browse';
        this.notesView.tabIndex=mobile&&!this.notesView.hidden?0:-1;
        if(mobile)this.notesView.setAttribute('aria-label','Edit note');else this.notesView.removeAttribute('aria-label');
        document.getElementById('content-browse-add-note').hidden=!!text||!this.notesForm.hidden||!mobile;
        const button = document.getElementById("content-edit-notes");
        button.hidden = !text || !this.notesForm.hidden;
        document.getElementById("content-notes-empty").hidden = !!text || !this.notesForm.hidden;
    }
    addBookmark() {
        if(!this.entryId||this.jobs.get(this.entryId))return;
        this.onAction();this.quickSave.hidden=false;this.quickEditing=true;this.linkForm.hidden=true;this.renderBookmarkState();
        this.focusEditor(this.quickUrl);
    }
    cancelQuickBookmark({restoreFocus=true}={}) {
        if(this.pendingDrafts.get(this.entryId))delete this.pendingDrafts.get(this.entryId).bookmark;
        this.quickEditing=false;this.quickUrl.value='';this.quickUrl.removeAttribute('aria-invalid');this.quickSave.hidden=false;
        this.renderBookmarkState();if(restoreFocus)document.getElementById('content-add-bookmark').focus({preventScroll:true});this.onLayout();
    }
    renderBookmarkState() {
        this.quickBookmark.hidden=!this.quickEditing||!this.linkForm.hidden;
        const editing=!this.quickBookmark.hidden||!this.linkForm.hidden;
        document.getElementById('content-bookmarks-placeholder').hidden=editing;
        document.getElementById('content-add-bookmark').hidden=editing;
    }
    async saveBookmark(value,title='',editingId=null){
        this.onAction();const url=galaxyModel.webUrl(value);
        if(!url){this.message('Enter a valid website address, such as google.com or an HTTPS URL.',true);return false;}
        const link={id:editingId||cosmifoldIds.uuid(),url,...(title?{title}:{})};
        const id=this.entryId;this.pendingDrafts.set(id,{...this.pendingDrafts.get(id),bookmark:{value,title,editingId}});
        try{await this.semantic(id,()=>this.save(id,current=>({...current,links:editingId?current.links.map(old=>old.id===link.id?link:old):[...current.links,link]})));delete this.pendingDrafts.get(id).bookmark;if(id===this.entryId)this.clearMessage();return id===this.entryId;}
        catch(error){if(id===this.entryId)this.error(error);return false;}
    }
    button(text, action, label = text) {
        const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.ariaLabel = label;
        button.addEventListener("click", action); return button;
    }
    itemMenu(actions, label) {
        return createPanelItemMenu(actions, label, this.root);
    }
    clearPreviews() {
        this.generation++;
        this.root.querySelectorAll('.content-file-preview img').forEach(image=>{
            image.onload=image.onerror=null;image.removeAttribute('src');image.remove();
        });
        this.urls.forEach(url => URL.revokeObjectURL(url)); this.urls.clear();
    }
    reconcilePreviews(){
        this.imageViewer?.refresh();
        this.nativePreviews.forEach((preview,tab)=>{
            if(!this.getEntry(preview.metadata.entryId)?.content?.attachments.some(file=>file.id===preview.metadata.id&&file.storageKey===preview.metadata.storageKey)){
                tab.close();preview.release();
            }
        });
    }
    clearNativePreviews(close=false){
        [...this.nativePreviews].forEach(([tab,preview])=>{if(close)tab.close();preview.release();});
    }
    renderLists() {
        this.reconcilePreviews();
        const links = document.getElementById("content-links"), files = document.getElementById("content-attachments"), media = document.getElementById("content-media");
        const changed=this.listEntryId!==this.entryId,previous=this.listFileIds||new Set(),current=new Set(this.content().attachments.map(file=>file.id));
        if(!changed&&this.visible&&this.motion&&!this.motion.reduced){
            const removed=[...media.children,...files.children].filter(row=>!current.has(row.dataset.attachmentId)).map(row=>({rect:row.getBoundingClientRect(),name:row.querySelector('.content-file-name')?.textContent || 'Media'}));
            removed.forEach(row=>this.motion.fileExit(row.name,row.rect,this.root.closest('#entry-panel')));
        }
        this.listEntryId=this.entryId;this.listFileIds=current;this.clearPreviews();
        links.replaceChildren(); files.replaceChildren(); media.replaceChildren();
        document.getElementById("content-media-section").hidden = true;
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
            actions.append(this.button("Edit", () => this.editLink(link), `Edit link ${link.title || link.url}`), this.button("Remove", async () => {
                try { const id=this.entryId;await this.semantic(id,()=>this.save(id,content=>({...content,links:content.links.filter(old=>old.id!==link.id)})));if(id!==this.entryId)return;this.renderLists(); this.message("Link removed."); }
                catch (error) { this.error(error); }
            }, `Remove link ${link.title || link.url}`));
            info.className = "bookmark-info"; info.append(anchor, url);
            item.append(icon, info, this.itemMenu(actions, link.title || link.url)); links.append(item);
        });
        const generation = this.generation;
        const mediaCount = this.content().attachments.filter(file => galaxyModel.filePolicy.isMedia(file)).length;
        document.getElementById("content-media-section").hidden = mediaCount === 0;
        media.classList.toggle('has-multiple-media', mediaCount > 1);
        this.content().attachments.forEach(metadata => {
            const capability = galaxyModel.filePolicy.classify(metadata), isMedia = ['image','video'].includes(capability.kind);
            const item = document.createElement("li"), preview = document.createElement("div"), actions = document.createElement("div");
            item.className = isMedia ? `content-media-item content-${capability.kind}` : "content-file"; item.dataset.attachmentId = metadata.id;
            preview.className = "content-file-preview";
            const badge = this.button(isMedia ? '' : capability.badge, event => this.openFile(metadata,event.currentTarget), `${capability.kind === 'generic' ? 'File details for' : 'View '+(isMedia ? capability.kind+':' : '')} ${metadata.filename}`);
            badge.className = isMedia ? "content-media-viewport" : "content-file-icon"; badge.title = metadata.filename; preview.append(badge);
            if (isMedia) {
                const placeholder = document.createElement('span');placeholder.className='content-media-placeholder';placeholder.textContent=capability.kind==='video'?'Video':'Photo';placeholder.setAttribute('aria-hidden','true');badge.append(placeholder);
                if (capability.kind==='video') {
                    badge.classList.add('is-video');
                    const play=document.createElement('span');play.className='content-media-play';play.setAttribute('aria-hidden','true');play.innerHTML='<svg viewBox="0 0 24 24"><path d="m9 5 11 7-11 7z"/></svg>';badge.append(play);
                    if (Number.isFinite(metadata.duration)) { const duration=document.createElement('span');duration.className='content-media-duration';duration.setAttribute('aria-hidden','true');duration.textContent=cosmosMediaDuration(metadata.duration);badge.append(duration); }
                }
            }
            actions.className = "content-row-actions";
            actions.append(this.button("Remove", event => {
                const button = event.currentTarget;
                if (button.dataset.confirm !== "true") { button.dataset.confirm = "true"; button.textContent = "Confirm remove"; button.ariaLabel = `Confirm remove attachment ${metadata.filename}`; return; }
                const id = metadata.entryId;
                this.job(id, async () => {
                    await this.removeAttachment(id,metadata.storageKey);
                }, {operation:'remove',filename:metadata.filename});
            }, `Remove attachment ${metadata.filename}`));
            if (isMedia) {
                item.append(preview, this.itemMenu(actions, metadata.filename)); media.append(item);
            } else {
                const name = this.button(metadata.filename, event => this.openFile(metadata,event.currentTarget), `${capability.kind==='generic'?'File details for':'Open attachment'} ${metadata.filename}`), size = document.createElement("small"), info = document.createElement("div");
                name.className = "content-file-name";
                name.title = name.ariaLabel; badge.title = badge.ariaLabel;
                size.textContent = `${metadata.size >= 1024*1024 ? (metadata.size/1024/1024).toFixed(1)+" MiB" : metadata.size >= 1024 ? (metadata.size/1024).toFixed(1)+" KiB" : metadata.size+" B"}`;
                info.className = "content-file-info"; info.append(name, size);
                item.append(preview, info, this.itemMenu(actions, metadata.filename)); files.append(item);
            }
            if(!changed&&!previous.has(metadata.id)&&this.visible)this.motion?.fileEnter(item);
            if (this.visible) this.preview(metadata, preview, generation);
        });
        document.getElementById("content-files-empty").hidden = this.content().attachments.length > mediaCount;
        this.renderBookmarkState();
        this.onLayout();
    }
    async preview(metadata, element, generation) {
        const capability = galaxyModel.filePolicy.classify(metadata);
        if (!['image','video','text'].includes(capability.kind)) return;
        this.previewLoads++;let image,url;
        const release=()=>{
            if(image){image.onload=image.onerror=null;image.removeAttribute('src');image.remove();}
            if(url){this.urls.delete(url);URL.revokeObjectURL(url);url=null;}
        };
        try {
            const record = await this.store.get(metadata.storageKey);
            if (generation !== this.generation || !this.visible || !element.isConnected) return;
            if (!record || record.entryId !== metadata.entryId) { this.previewUnavailable(element, "File unavailable in this browser storage."); return; }
            if (['image','video'].includes(capability.kind) && record.thumbnail) {
                image = document.createElement("img");url = URL.createObjectURL(record.thumbnail);
                this.urls.add(url); image.src = url; image.alt = ""; image.loading = "lazy";
                const button = element.querySelector("button");button.querySelector('.content-media-placeholder')?.remove();button.prepend(image);
                image.onload = () => this.onLayout();
                image.onerror = () => { release();if (generation === this.generation && this.visible) this.previewUnavailable(element, "Preview unavailable. Open to try again."); };
            } else if (capability.kind === 'text') {
                const text = await record.blob.slice(0,galaxyModel.contentLimits.textPreviewBytes).text();
                if (generation !== this.generation || !this.visible || !element.isConnected) return;
                const pre = document.createElement("pre"); pre.textContent = text; pre.className = "content-text-preview";
                element.parentElement.append(pre);
            }
        } catch (error) { release();if (generation === this.generation && this.visible) this.previewUnavailable(element, "Preview unavailable. Open to try again."); }
    }
    previewUnavailable(element, message) {
        // Keep the opening control available even when stored thumbnails cannot load.
        const button = element.querySelector("button");
        if (button?.classList.contains("content-media-viewport")) {
            button.querySelector('img')?.remove();
            let placeholder = button.querySelector('.content-media-placeholder');
            if (!placeholder) { placeholder=document.createElement('span');placeholder.className='content-media-placeholder';button.prepend(placeholder); }
            placeholder.textContent = button.classList.contains('is-video') ? 'Video' : message;
        }
        else element.textContent = message;
        this.onLayout();
    }
    upload(files, id = this.entryId) {
        return this.job(id, async context => {
            await this.checkCapacity?.(files,{isCurrent:()=>this.entryId===id&&this.visible&&!!this.getEntry(id)});
            for (const file of files) {
                context.filename=file.name;
                const { metadata, record } = await galaxyAttachmentFiles.prepare(file,id);
                await this.addAttachment(id,record,metadata);
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
            cosmifoldObjectUrls.download(new Blob([record.blob], {type:'application/octet-stream'}),metadata.filename,this.downloadUrls);
            return true;
        } catch (error) { onError(error); return false; }
    }
    async openFile(metadata, trigger = document.activeElement) {
        this.onAction();
        const capability = galaxyModel.filePolicy.classify(metadata);
        if (['image','video','pdf'].includes(capability.kind)) { this.imageViewer.open(metadata, trigger); return; }
        if (capability.kind === 'generic') { this.showFileDetails(metadata,trigger); return; }
        return this.openNativeFile(metadata);
    }
    async openNativeFile(metadata,type='text/plain',source=null) {
        const tab = window.open("about:blank", "_blank");
        if (!tab) { this.message("Allow this file to open in a new browser tab.", true); return; }
        tab.opener = null;
        // One tab owns one optional URL and one close poll. No per-open pagehide
        // closures survive after the tab closes, including while the read waits.
        const preview={metadata,url:null,timer:null,release:()=>{
            if(this.nativePreviews.get(tab)!==preview)return;
            clearInterval(preview.timer);this.nativePreviews.delete(tab);
            if(preview.url)URL.revokeObjectURL(preview.url);
        }};
        this.nativePreviews.set(tab,preview);
        preview.timer=setInterval(()=>{
            if(tab.closed){preview.release();return;}
            if(preview.url)try{if(!['about:blank',preview.url].includes(tab.location.href))preview.release();}catch{preview.release();}
        },1000);
        try {
            const record = source?{entryId:metadata.entryId,blob:source}:await this.store.get(metadata.storageKey);
            if(tab.closed||this.nativePreviews.get(tab)!==preview){preview.release();return;}
            if(!this.getEntry(metadata.entryId)?.content?.attachments.some(file=>file.id===metadata.id&&file.storageKey===metadata.storageKey)){tab.close();preview.release();return;}
            if (!record || record.entryId !== metadata.entryId) throw new Error("This file is unavailable in this browser storage.");
            const blob = new Blob([record.blob],{type});
            preview.url = URL.createObjectURL(blob);
            tab.location.replace(preview.url);
        } catch (error) { preview.release();tab.close();this.error(error); }
    }
}
