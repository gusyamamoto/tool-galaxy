// One editor for canonical Item When, Task Due, and an unsaved Task draft.
// Persistence/publication belongs to the caller's existing command coordinator.
class TimeMetadataEditor {
    constructor({save,onAction=()=>{},canEdit=()=>true}) {
        Object.assign(this,{save,onAction,canEdit});
        this.dialog=document.getElementById('time-editor');
        this.form=document.getElementById('time-editor-form');
        this.row=document.getElementById('content-time-row');
        this.start=document.getElementById('time-start');this.end=document.getElementById('time-end');this.clock=document.getElementById('time-clock');
        this.error=document.getElementById('time-editor-error');
        this.form.addEventListener('change',()=>this.mode());
        this.form.addEventListener('input',()=>{this.error.hidden=true;this.end.setCustomValidity('');});
        this.form.addEventListener('submit',event=>{event.preventDefault();this.submit();});
        document.getElementById('time-editor-cancel').addEventListener('click',()=>this.dialog.close());
        this.dialog.addEventListener('cancel',event=>{if(this.pending)event.preventDefault();});
        this.dialog.addEventListener('close',()=>{this.restoreFocus?.focus({preventScroll:true});});
        for(const id of ['content-time-value','content-time-edit'])document.getElementById(id).addEventListener('click',()=>{
            const entryId=this.entry?.id,kind=this.kind;
            if(entryId)this.open({kind,value:this.entry[kind],save:value=>this.save(entryId,kind,value)});
        });
        document.getElementById('content-time-remove').addEventListener('click',()=>this.remove());
        this.resize=()=>{
            if(!this.dialog.open)return;
            const viewport=window.visualViewport;
            this.dialog.style.maxHeight=`${Math.max(120,(viewport?.height??innerHeight)-24)}px`;
            // Fixed top follows the visible viewport when a keyboard pans it.
            this.dialog.style.top=`${(viewport?.offsetTop??0)+(viewport?.height??innerHeight)/2}px`;
        };
        window.visualViewport?.addEventListener('resize',this.resize);
        window.visualViewport?.addEventListener('scroll',this.resize);
        window.addEventListener('resize',this.resize);
    }
    render(entry,kind) {
        if(this.entry?.id!==entry?.id||this.kind!==kind)document.getElementById('content-time-error').hidden=true;
        this.entry=entry;this.kind=kind;this.row.hidden=!entry||!kind;
        if(this.row.hidden)return;
        const value=entry[kind],label=kind==='due'?'due date':'date';
        document.getElementById('content-time-label').textContent=kind.toUpperCase();
        const button=document.getElementById('content-time-value');
        button.textContent=value?galaxyModel.temporal.format(kind,value):kind==='due'?'Add due date…':'Add date…';
        button.disabled=this.removing||!this.canEdit();
        for(const action of ['edit','remove']){
            const control=document.getElementById(`content-time-${action}`);control.hidden=!value;
            control.disabled=this.removing||!this.canEdit();control.title=control.ariaLabel=`${action==='edit'?'Edit':'Remove'} ${label}`;
        }
    }
    open({kind,value=null,save}) {
        if(this.pending||!this.canEdit()||this.dialog.open)return;
        this.onAction();this.restoreFocus=document.activeElement;this.saveDraft=save;this.editingKind=kind;
        this.form.reset();this.end.setCustomValidity('');this.error.hidden=true;
        document.getElementById('time-editor-title').textContent=kind==='due'?'Due':'When';
        document.getElementById('time-editor-mode').hidden=kind==='due';
        this.form.elements.dateMode.value=kind==='when'&&value?.endDate?'range':'single';
        this.start.value=(kind==='when'?value?.startDate:value?.date)||'';
        this.end.value=value?.endDate||'';this.clock.value=value?.time||'';
        this.mode();this.dialog.showModal();this.resize();this.start.focus({preventScroll:true});
    }
    mode() {
        const range=this.editingKind==='when'&&this.form.elements.dateMode.value==='range';
        document.getElementById('time-end-field').hidden=!range;this.end.disabled=!range;this.end.required=range;
        document.getElementById('time-clock-field').hidden=range;this.clock.disabled=range;
        document.getElementById('time-range-help').hidden=!range;
        document.getElementById('time-start-label').textContent=range?'Starts':'Date';
    }
    busy(pending) {
        this.pending=pending;
        this.form.querySelectorAll('button,input').forEach(control=>control.disabled=pending);
        if(!pending)this.mode();
        this.form.setAttribute('aria-busy',String(pending));
    }
    async submit() {
        if(this.pending||!this.form.reportValidity())return;
        const range=this.editingKind==='when'&&this.form.elements.dateMode.value==='range';
        const value=this.editingKind==='due'?{date:this.start.value,time:this.clock.value||null}:
            {startDate:this.start.value,endDate:range?this.end.value:null,time:range?null:this.clock.value||null};
        if(!galaxyModel.temporal.valid(this.editingKind,value)){
            this.error.textContent='Choose valid dates. The end must be on or after the start.';this.error.hidden=false;return;
        }
        this.busy(true);
        try{await this.saveDraft(value);this.dialog.close();}
        catch(error){this.error.textContent=error.message||'This date could not be saved.';this.error.hidden=false;}
        finally{this.busy(false);}
    }
    async remove() {
        if(this.removing||!this.entry||!this.canEdit())return;
        const id=this.entry.id,kind=this.kind,error=document.getElementById('content-time-error');
        this.onAction();this.removing=true;error.hidden=true;this.render(this.entry,kind);
        try{await this.save(id,kind,null);}
        catch(failure){if(this.entry?.id===id){error.textContent=failure.message||'This date could not be removed.';error.hidden=false;}}
        finally{this.removing=false;this.render(this.entry,this.kind);if(this.entry?.id===id)document.getElementById('content-time-value').focus({preventScroll:true});}
    }
}
