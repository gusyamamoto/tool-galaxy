// Local Backup/Restore controls. Validation and replacement stay behind services.
class CosmifoldBackupUI {
    constructor({repository,sample=false,blocked=()=>false,session,onRestoreStart=()=>{},onRestoreEnd=()=>{},reload=()=>location.reload()}) {
        this.repository=repository;this.blocked=blocked;this.sample=sample;this.busy=false;this.urls=new Map();
        this.session=session;this.onRestoreStart=onRestoreStart;this.onRestoreEnd=onRestoreEnd;this.reload=reload;
        this.trigger=document.getElementById('backup-button');this.dialog=document.getElementById('backup-dialog');
        this.download=document.getElementById('download-backup');this.status=document.getElementById('backup-status');
        this.choose=document.getElementById('choose-restore-backup');this.file=document.getElementById('restore-backup-file');
        this.preview=document.getElementById('restore-backup-preview');this.confirm=document.getElementById('confirm-restore-backup');this.cancel=document.getElementById('cancel-backup');
        this.choose.disabled=!session?.supported||sample;
        if(!session?.supported)this.choose.title='Safe Restore requires a current browser on HTTPS or localhost.';
        this.choose.addEventListener('click',()=>{if(!this.busy){this.file.value='';this.file.click();}});
        this.file.addEventListener('change',()=>{if(this.file.files[0])this.checkBackup(this.file.files[0]);});
        this.confirm.addEventListener('click',()=>this.restore());
        this.trigger.disabled=sample;
        if(sample)this.trigger.title='Leave Sample mode to back up your saved Cosmos.';
        this.trigger.addEventListener('click',()=>{if(this.sample||this.busy||this.dialog.open)return;this.status.hidden=true;this.preview.hidden=true;this.handle=null;this.download.textContent='Download backup';this.dialog.showModal();this.download.focus();});
        this.download.addEventListener('click',()=>this.export());
        this.cancel.addEventListener('click',()=>{if(!this.committing)this.dialog.close();});
        this.dialog.addEventListener('cancel',event=>{if(this.committing)event.preventDefault();});
        this.dialog.addEventListener('keydown',event=>{
            event.stopPropagation();
            if(event.key==='Escape'){event.preventDefault();if(!this.committing)this.dialog.close();return;}
            if(event.key==='Tab'){
                const controls=[...this.dialog.querySelectorAll('button:not(:disabled)')].filter(b=>b.getClientRects().length);
                const target=event.shiftKey&&document.activeElement===controls[0]?controls.at(-1):!event.shiftKey&&document.activeElement===controls.at(-1)?controls[0]:null;
                if(target){event.preventDefault();target.focus({preventScroll:true});}
            }
        });
        this.dialog.addEventListener('close',()=>{this.controller?.abort();this.handle=null;this.preview.hidden=true;(this.trigger.getClientRects().length?this.trigger:document.getElementById('sidebar-toggle')).focus({preventScroll:true});});
        window.addEventListener('pagehide',()=>{this.controller?.abort();});
    }
    message(text,error=false){this.status.textContent=text;this.status.hidden=false;this.status.dataset.error=String(error);}
    setBusy(value){
        this.busy=value;this.download.disabled=value;this.confirm.disabled=value;this.trigger.disabled=value||this.sample;
        this.choose.disabled=value||this.sample||!this.session?.supported;this.cancel.disabled=!!this.committing;
    }
    async checkBackup(file){
        if(this.busy||this.sample||!this.dialog.open)return;
        this.handle=null;this.preview.hidden=true;this.setBusy(true);this.controller=new AbortController();this.message('Checking backup…');
        try{
            const handle=await cosmifoldRestore.inspect(file,{signal:this.controller.signal,onProgress:p=>this.message(p.stage==='files'?`Checking files ${p.completed} of ${p.total}…`:'Checking backup…')});
            if(!this.dialog.open||this.controller.signal.aborted)return;
            this.handle=handle;this.preview.hidden=false;this.download.textContent='Download current backup';
            document.getElementById('restore-backup-date').textContent=`Backup from ${new Date(handle.exportedAt).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})}`;
            const c=handle.counts,label=(n,one,many)=>`${n} ${n===1?one:many}`;
            document.getElementById('restore-backup-summary').textContent=[label(c.galaxies,'Galaxy','Galaxies'),label(c.entries,'item','items'),label(c.constellations,'Constellation','Constellations'),label(c.attachmentRecords,'file','files'),`${(handle.size/1000000).toFixed(1)} MB`].join(' · ');
            // Text only; backup strings never become HTML.
            this.status.hidden=true;
        }catch(error){if(error.name!=='AbortError'){console.error('Cosmifold backup validation failed:',error);this.message(error.message,true);}}
        finally{this.setBusy(false);this.controller=null;if(this.handle&&this.dialog.open)this.confirm.focus();}
    }
    async restore(){
        if(this.busy||this.sample||!this.handle||!this.dialog.open)return;
        if(this.blocked()){this.message('Wait for the current file action to finish, then try again.',true);return;}
        this.committing=true;this.setBusy(true);this.message('Restoring…');let started=false,success=false,recoveryRequired=false;
        try{
            // Pause writes before releasing the shared lock, including the gap
            // when another simultaneous Restore may win exclusive access.
            started=true;this.onRestoreStart();
            await this.session.exclusive(async()=>{
                if(this.blocked())throw new Error('Wait for the current file action to finish, then try again.');
                await cosmifoldRestore.restore(this.handle,this.repository);
            },{readRevision:()=>this.repository.restoreRevision()});
            success=true;this.message('Cosmifold restored. Reloading…');this.onRestoreEnd(true);
            await new Promise(resolve=>setTimeout(resolve,150));this.reload();
        }catch(error){
            console.error('Cosmifold Restore failed:',error);
            recoveryRequired=!!(error.recoveryRequired||error.reinitializationRequired);
            if(started)this.onRestoreEnd(false,recoveryRequired);
            this.message(error.reinitializationRequired?'Another Cosmifold tab may have restored data. Reload before continuing.':error.recoveryRequired?'Restore recovery could not finish. Close other Cosmifold tabs and reload before continuing.':`Couldn't restore this backup. Your existing Cosmifold data was not changed. ${error.message}`,true);
        }finally{if(!success&&!recoveryRequired){this.committing=false;this.setBusy(false);}}
    }
    async export() {
        if(this.sample||this.busy||!this.dialog.open)return;
        if(this.blocked()){this.message('Wait for the current file action to finish, then try again.',true);return;}
        this.setBusy(true);this.controller=new AbortController();
        this.message('Preparing backup…');
        try{
            const result=await cosmifoldBackup.create(this.repository,{signal:this.controller.signal,onProgress:progress=>{
                if(this.dialog.open)this.message(progress.stage==='files'?`Preparing files ${progress.completed} of ${progress.total}…`:'Preparing backup…');
            }});
            if(!this.dialog.open||this.controller.signal.aborted)return;
            cosmifoldObjectUrls.download(result.blob,result.filename,this.urls);
            this.message('Backup sent to your browser’s downloads.');
        }catch(error){
            if(error.name!=='AbortError'){
                console.error('Cosmifold backup failed:',error);
                if(this.dialog.open)this.message(`Couldn’t create the backup. Your Cosmifold data was not changed. ${error.message}`,true);
            }
        }finally{
            this.setBusy(false);this.controller=null;
            if(this.dialog.open&&(document.activeElement===document.body||document.activeElement===this.dialog))this.download.focus({preventScroll:true});
        }
    }
}
