// DevTools-only fixture. Use in a disposable profile; never loaded by the app.
(() => {
    if(window.cosmifoldOrphanTest)throw new Error('The orphan test helper is already installed.');
    const key=`f8-synthetic-orphan:${cosmifoldIds.uuid()}`;
    let itemId=null,live=null,created=false;
    const guard=()=>{
        if(sampleMode||localDataRecovery||localSessionStale||localRestoreInProgress)throw new Error('Use a healthy disposable local workspace.');
    };
    window.cosmifoldOrphanTest={
        key,
        async create(){
            guard();if(created||document.querySelector('dialog[open]'))throw new Error('Close dialogs; run create only once.');
            if(await attachmentStore.get(key))throw new Error('Synthetic key already exists; nothing was overwritten.');
            created=true;
            openEntryForm(null,'',true);fields[0].value='F8 disposable storage test';parentField.value='';
            parentField.dispatchEvent(new Event('change'));form.requestSubmit();await applicationCommandTail;
            if(dialog.open||formSaveBusy)throw new Error('The test Item could not be created.');
            itemId=selectedNode.dataset.entryId;
            selectEntry(entries.get(itemId),nodes.get(itemId),{openInspector:true,reframe:false});
            const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
            const context=canvas.getContext('2d');context.fillStyle='#4488bb';context.fillRect(0,0,32,32);
            const image=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
            await contentInspector.upload([new File([image],'f8-live.png',{type:'image/png'})],itemId);
            live=entries.get(itemId).content?.attachments.find(file=>file.filename==='f8-live.png');
            if(!live)throw new Error('The normal test attachment did not save. No synthetic orphan was inserted.');
            await persistence.metadata.withWrite(async()=>{
                const name=persistence.scope==null?'galaxy-attachments':`galaxy-attachments:${encodeURIComponent(persistence.scope)}`;
                const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
                try{await new Promise((resolve,reject)=>{
                    const tx=db.transaction('files','readwrite',{durability:'strict'});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
                    // add(), never put(): even an unexpected key collision cannot overwrite.
                    tx.objectStore('files').add({key,entryId:itemId,blob:new Blob(['Synthetic F8 unused data'],{type:'text/plain'})});
                });}finally{db.close();}
            });
            return {itemId,liveKey:live.storageKey,syntheticKey:key};
        },
        async verify(){
            guard();const audit=await universeRepository.auditAttachmentStorage();
            return {syntheticPresent:!!await attachmentStore.get(key),livePresent:!!(live&&await attachmentStore.get(live.storageKey)),
                unused:audit.orphaned.map(record=>record.key),unknown:audit.unknown.length,blocked:audit.blocked};
        },
        openLive(){guard();if(!live||!entries.has(itemId))throw new Error('The test Item is unavailable.');
            selectEntry(entries.get(itemId),nodes.get(itemId),{openInspector:true,reframe:false});contentInspector.openFile(live);},
        async removeSynthetic(){guard();return universeRepository.removeOrphanedAttachments([key]);},
        uninstall(){delete window.cosmifoldOrphanTest;}
    };
})();
