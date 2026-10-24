// Temporary downloads own their URLs independently of the initiating panel.
// Keep the existing 60-second browser download grace; failures release at once.
const cosmifoldObjectUrls = (()=>{
    const pending=new Map();
    function download(blob,filename,owner=new Map()) {
        const url=URL.createObjectURL(blob);let link,timer,active=true;
        const release=()=>{
            if(!active)return;active=false;clearTimeout(timer);
            owner.delete(url);pending.delete(url);URL.revokeObjectURL(url);
        };
        pending.set(url,release);
        try {
            timer=setTimeout(release,60000);owner.set(url,timer);
            link=document.createElement('a');link.href=url;link.download=filename;link.hidden=true;
            document.body.append(link);link.click();
        } catch(error) { release();throw error; }
        finally { link?.remove(); }
    }
    function clearDownloads(){[...pending.values()].forEach(release=>release());}
    globalThis.addEventListener?.('pagehide',clearDownloads);
    return {download,clearDownloads};
})();
