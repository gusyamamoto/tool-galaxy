// Manual/test-only. Paste into DevTools before exercising previews.
// Uninstall restores the native methods without revoking URLs still used by UI.
(()=>{
    if(window.cosmifoldUrlProbe)return;
    const create=URL.createObjectURL,revoke=URL.revokeObjectURL,known=new Set(),active=new Set();
    const probe={created:0,revoked:0,duplicateRevocations:0,active,
        snapshot(){return {created:this.created,revoked:this.revoked,active:active.size,duplicateRevocations:this.duplicateRevocations};},
        uninstall(){URL.createObjectURL=create;URL.revokeObjectURL=revoke;delete window.cosmifoldUrlProbe;}
    };
    URL.createObjectURL=function(blob){const url=create.call(URL,blob);known.add(url);active.add(url);probe.created++;return url;};
    URL.revokeObjectURL=function(url){if(known.has(url)){if(active.delete(url))probe.revoked++;else probe.duplicateRevocations++;}return revoke.call(URL,url);};
    window.cosmifoldUrlProbe=probe;
})();
