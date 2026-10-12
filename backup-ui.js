// Informational entry point and a local download over the read-only service.
class CosmifoldBackupUI {
    constructor({repository,sample=false,blocked=()=>false}) {
        this.repository=repository;this.blocked=blocked;this.sample=sample;this.busy=false;this.urls=new Map();
        this.trigger=document.getElementById('backup-button');this.dialog=document.getElementById('backup-dialog');
        this.download=document.getElementById('download-backup');this.status=document.getElementById('backup-status');
        this.trigger.disabled=sample;
        if(sample)this.trigger.title='Leave Sample mode to back up your saved Cosmos.';
        this.trigger.addEventListener('click',()=>{if(this.sample||this.busy||this.dialog.open)return;this.status.hidden=true;this.dialog.showModal();this.download.focus();});
        this.download.addEventListener('click',()=>this.export());
        document.getElementById('cancel-backup').addEventListener('click',()=>this.dialog.close());
        this.dialog.addEventListener('keydown',event=>{
            event.stopPropagation();
            if(event.key==='Escape'){event.preventDefault();this.dialog.close();return;}
            if(event.key==='Tab'){
                const controls=[...this.dialog.querySelectorAll('button:not(:disabled)')];
                const target=event.shiftKey&&document.activeElement===controls[0]?controls.at(-1):!event.shiftKey&&document.activeElement===controls.at(-1)?controls[0]:null;
                if(target){event.preventDefault();target.focus({preventScroll:true});}
            }
        });
        this.dialog.addEventListener('close',()=>{this.controller?.abort();(this.trigger.getClientRects().length?this.trigger:document.getElementById('sidebar-toggle')).focus({preventScroll:true});});
        window.addEventListener('pagehide',()=>{this.controller?.abort();this.urls.forEach((timer,url)=>{clearTimeout(timer);URL.revokeObjectURL(url);});this.urls.clear();});
    }
    message(text,error=false){this.status.textContent=text;this.status.hidden=false;this.status.dataset.error=String(error);}
    async export() {
        if(this.sample||this.busy||!this.dialog.open)return;
        if(this.blocked()){this.message('Wait for the current file action to finish, then try again.',true);return;}
        this.busy=true;this.download.disabled=true;this.trigger.disabled=true;this.controller=new AbortController();
        this.message('Preparing backup…');
        try{
            const result=await cosmifoldBackup.create(this.repository,{signal:this.controller.signal,onProgress:progress=>{
                if(this.dialog.open)this.message(progress.stage==='files'?`Preparing files ${progress.completed} of ${progress.total}…`:'Preparing backup…');
            }});
            if(!this.dialog.open||this.controller.signal.aborted)return;
            const url=URL.createObjectURL(result.blob),link=document.createElement('a');link.href=url;link.download=result.filename;link.hidden=true;
            document.body.append(link);link.click();link.remove();
            this.urls.set(url,setTimeout(()=>{URL.revokeObjectURL(url);this.urls.delete(url);},60000));
            this.message('Backup sent to your browser’s downloads.');
        }catch(error){
            if(error.name!=='AbortError'){
                console.error('Cosmifold backup failed:',error);
                if(this.dialog.open)this.message(`Couldn’t create the backup. Your Cosmifold data was not changed. ${error.message}`,true);
            }
        }finally{
            this.busy=false;this.download.disabled=false;this.trigger.disabled=this.sample;this.controller=null;
            if(this.dialog.open&&(document.activeElement===document.body||document.activeElement===this.dialog))this.download.focus({preventScroll:true});
        }
    }
}
