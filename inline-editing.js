// Shared presentation over existing save/cancel handlers; desktop keeps labels.
function decorateInlineActions(root) {
    root.querySelectorAll('.inline-editor-actions button').forEach(button=>{
        const label=button.type==='submit'?'Save':'Cancel';
        button.ariaLabel=button.title=label;
        const text=document.createElement('span');text.className='inline-action-label';text.textContent=label;
        const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
        icon.classList.add('inline-action-icon');icon.setAttribute('viewBox','0 0 20 20');icon.setAttribute('aria-hidden','true');
        const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d',label==='Save'?'m4 10 4 4 8-8':'m5 5 10 10M15 5 5 15');icon.append(path);
        button.replaceChildren(text,icon);
    });
}

// The two selected-title surfaces share tap ownership, validation and persistence.
class SelectedTitleRename {
    static moved(start,event){return Math.hypot(event.clientX-start.x,event.clientY-start.y)>8;}
    constructor({title,getEntry,enabled,onSave,onLayout}) {
        Object.assign(this,{title,getEntry,enabled,onSave,onLayout});this.touches=new Set();
        this.host=document.createElement('div');this.host.className='selected-title';
        title.before(this.host);this.host.append(title);
        this.host.insertAdjacentHTML('beforeend','<form class="title-rename-form inline-editor" hidden novalidate><div class="inline-editor-fields"><input type="text" maxlength="60" aria-label="Item name" autocomplete="off" spellcheck="false"></div><div class="inline-editor-actions"><button type="submit">Save</button><button type="button">Cancel</button></div></form>');
        this.form=this.host.querySelector('form');this.input=this.host.querySelector('input');
        this.form.addEventListener('submit',event=>{event.preventDefault();this.save();});
        this.form.querySelector('button[type="button"]').addEventListener('click',()=>this.cancel(true));
        this.input.addEventListener('input',()=>{this.input.setCustomValidity('');this.input.removeAttribute('aria-invalid');});
        this.input.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'&&!event.isComposing){event.preventDefault();this.cancel(true);}});
        document.addEventListener('pointerdown',event=>{
            if(event.pointerType==='touch')this.touches.add(event.pointerId);
            this.tap=null;
            if(this.touches.size<=1&&event.isPrimary&&event.button===0&&this.host.contains(event.target)&&!this.edit&&this.enabled())
                this.tap={id:event.pointerId,x:event.clientX,y:event.clientY,entryId:this.getEntry()?.id};
        },true);
        document.addEventListener('pointermove',event=>{if(this.tap?.id===event.pointerId&&SelectedTitleRename.moved(this.tap,event))this.tap=null;},true);
        document.addEventListener('pointercancel',event=>{this.touches.delete(event.pointerId);this.tap=null;},true);
        document.addEventListener('pointerup',event=>{
            this.touches.delete(event.pointerId);
            if(this.tap?.id===event.pointerId){if(SelectedTitleRename.moved(this.tap,event))this.tap=null;else this.tap.released=true;}
        },true);
        window.addEventListener('blur',()=>{this.tap=null;this.touches.clear();});
        this.host.addEventListener('click',event=>{
            if(!this.enabled()||this.edit||this.form.contains(event.target))return;
            event.preventDefault();event.stopPropagation();
            const tap=this.tap;this.tap=null;
            if(event.detail===0||tap?.released&&tap.entryId===this.getEntry()?.id)this.begin();
        });
        this.host.addEventListener('keydown',event=>{
            if(this.enabled()&&!this.edit&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();this.begin();}
        });
    }
    sync() {
        const entry=this.getEntry(),enabled=this.enabled()&&!!entry;
        if(this.edit&&(!enabled||entry?.id!==this.edit.id||!this.host.getClientRects().length))this.cancel();
        if(enabled&&!this.edit){this.host.dataset.sheetTitle='true';this.host.setAttribute('role','button');this.host.tabIndex=0;this.host.ariaLabel=`Rename ${entry.name}`;}
        else {delete this.host.dataset.sheetTitle;this.host.removeAttribute('role');this.host.removeAttribute('tabindex');this.host.removeAttribute('aria-label');}
    }
    begin() {
        const entry=this.getEntry();if(this.edit||!this.enabled()||!entry||!this.host.getClientRects().length)return;
        this.edit={id:entry.id};this.input.value=entry.name;this.input.setCustomValidity('');this.input.removeAttribute('aria-invalid');
        this.form.hidden=false;this.host.classList.add('is-renaming');this.sync();this.onLayout();
        this.input.focus({preventScroll:true});this.input.select();
    }
    cancel(focus=false) {
        this.edit=null;this.form.hidden=true;this.host.classList.remove('is-renaming');this.sync();
        this.input.disabled=false;this.form.querySelectorAll('button').forEach(button=>button.disabled=false);
        if(focus)this.host.focus({preventScroll:true});
    }
    async save() {
        const edit=this.edit;if(!edit||edit.pending)return;
        this.input.setCustomValidity('');this.input.removeAttribute('aria-invalid');
        edit.pending=true;this.input.disabled=true;this.form.querySelectorAll('button').forEach(button=>button.disabled=true);
        try {await this.onSave(edit.id,this.input.value);}
        catch(error){if(this.edit===edit){this.input.setCustomValidity(error.message);this.input.setAttribute('aria-invalid','true');}}
        finally {edit.pending=false;if(this.edit===edit){this.input.disabled=false;this.form.querySelectorAll('button').forEach(button=>button.disabled=false);}}
        if(this.edit!==edit)return;
        if(this.input.validity.customError){this.input.focus({preventScroll:true});this.input.reportValidity();}
        else this.cancel(true);
    }
}
