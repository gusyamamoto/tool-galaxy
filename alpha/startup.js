// This entry never loads beta startup.js, script.js or browser-local adapters.
const alphaProvider=createSupabaseClientProvider({config:cosmifoldAuthConfig,storageKey:cosmifoldAlphaConfig.authStorageKey});
const alphaOriginAllowed=cosmifoldAlphaConfig.cloudEnabled===true&&location.origin===cosmifoldAlphaConfig.allowedOrigin&&
    !!cosmifoldAlphaConfig.localBetaOrigin&&location.origin!==cosmifoldAlphaConfig.localBetaOrigin;
const alphaAuth=createAuthService({adapter:createSupabaseAuthAdapter({provider:alphaProvider,disabled:!alphaOriginAllowed})});
const alphaGateway=createSupabaseMetadataGateway({provider:alphaProvider});
const travelAlpha=createTravelAlphaFoundation({config:cosmifoldAlphaConfig,auth:alphaAuth,
    gateway:alphaGateway});
const alphaEditor=createTravelAlphaEditor({foundation:travelAlpha});
const alphaElement=id=>document.getElementById(id);
const alphaMessages={disabled:'Cloud access is off in this build. This is an empty, isolated test Universe preview.',
    'auth-unavailable':'Alpha sign-in is unavailable. No dataset was opened.',
    'signed-out':'Sign in to select a private cloud dataset.',loaded:'Cloud dataset selected. Create and rename Items in this Universe.',
    'cached-degraded':'Showing an acknowledged cache. Server refresh is required; editing is unavailable.',
    'creation-uncertain':'Creation is unconfirmed. Refresh to check the same Universe; no creation will be resent.',
    'pending-reconciliation':'An earlier operation needs reconciliation. Editing is unavailable.'};
travelAlpha.subscribe(state=>{
    alphaElement('alpha-status').textContent=alphaMessages[state.status]||'Dataset status: '+state.status;
    alphaElement('alpha-account').textContent=state.user?.email||state.user?.id||'Not signed in';
    const signedIn=!!state.user,available=state.cloudEnabled&&alphaAuth.getState().available;
    for(const id of ['alpha-email','alpha-password','alpha-sign-in-button'])alphaElement(id).disabled=!available||signedIn||!!alphaAuth.getState().busy;
    alphaElement('alpha-sign-in').hidden=signedIn;alphaElement('alpha-sign-out').hidden=!signedIn;
    alphaElement('alpha-refresh').disabled=!signedIn||state.creating||state.writing;
    alphaElement('alpha-create').disabled=!signedIn||state.creating||state.writing||state.status==='creation-uncertain'||state.status==='pending-reconciliation';
    alphaElement('alpha-reload').disabled=!signedIn||!state.dataset.scope||state.creating||state.writing;
    const list=alphaElement('alpha-datasets');list.replaceChildren();
    for(const row of state.universes){const item=document.createElement('li'),button=document.createElement('button');
        button.type='button';button.textContent=`Select ${row.id} · revision ${row.revision}`;
        button.disabled=state.creating||state.writing;button.addEventListener('click',()=>alphaAction(()=>travelAlpha.select(row.id)));item.append(button);list.append(item);}
    const dataset=state.dataset;
    alphaElement('alpha-universe-title').textContent=dataset.kind==='cloud'?'Selected cloud Universe':'Empty test Universe · preview';
    alphaElement('alpha-scope').textContent=dataset.scope?`Universe ${dataset.scope.universeId} · revision ${dataset.revision}`:'No cloud dataset selected';
    alphaElement('alpha-count').textContent=`${dataset.snapshot.entries.length} Items`;
    const save=alphaElement('alpha-save-state');save.dataset.state=state.writeStatus;
    save.textContent={saving:'Saving…',saved:'Saved',failed:'Failed — the last confirmed data is shown.',unresolved:'Unresolved — the server may have saved this change. Check the pending save; do not recreate it.'}[state.writeStatus]||
        (dataset.kind==='cloud'?'Read-only — reload from the server before editing.':'No cloud dataset selected');
    if(state.writeStatus==='failed'&&dataset.kind!=='cloud')save.textContent='Failed — no cloud dataset could be opened.';
    if(state.writeStatus==='saved'&&state.readOnly)save.textContent='Saved data · read-only';
    alphaElement('alpha-error').hidden=!state.error;alphaElement('alpha-error').textContent=state.error?'The request could not complete safely. '+state.error:'';
});
async function alphaAction(action){try{await action();}catch{alphaElement('alpha-error').textContent='This action is unavailable. Your local beta has not been changed.';alphaElement('alpha-error').hidden=false;}}
alphaElement('alpha-sign-in').addEventListener('submit',event=>{event.preventDefault();
    const email=alphaElement('alpha-email').value,password=alphaElement('alpha-password').value;alphaElement('alpha-password').value='';
    void alphaAction(async()=>{await alphaAuth.signIn(email,password);await travelAlpha.refresh();});});
alphaElement('alpha-sign-out').addEventListener('click',()=>alphaAction(()=>alphaAuth.signOut()));
alphaElement('alpha-refresh').addEventListener('click',()=>alphaAction(()=>travelAlpha.refresh()));
alphaElement('alpha-create').addEventListener('click',()=>alphaAction(()=>travelAlpha.createEmpty()));
alphaElement('alpha-reload').addEventListener('click',()=>alphaAction(()=>travelAlpha.reload()));
window.addEventListener('pageshow',event=>{if(event.persisted){document.documentElement.inert=true;location.reload();}});
window.addEventListener('pagehide',()=>{alphaEditor.dispose();travelAlpha.dispose();alphaGateway.dispose();alphaAuth.dispose();alphaProvider.dispose();});
void alphaAuth.initialize();
