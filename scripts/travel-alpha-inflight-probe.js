// Loaded as a temporary CDP expression by the external test controller only.
// No monkeypatches, storage writes, credentials returned, or new application API.
async function alphaInflightProbe(options, action, operationId) {
    const require = (ok, code) => { if (!ok) throw new Error(code); };
    const config = cosmifoldAlphaConfig;
    require(document.documentElement.dataset.applicationMode === 'cloud-alpha' &&
        config.applicationMode === 'cloud-alpha' && config.milestone === 2 && config.cloudEnabled === true &&
        config.allowedOrigin === options.origin && location.origin === options.origin &&
        config.localBetaOrigin && config.localBetaOrigin !== options.origin &&
        config.authStorageKey === 'cosmifold:travel-alpha:auth:v1', 'ISOLATED_ALPHA_REQUIRED');
    require(readPublicAuthConfiguration(cosmifoldAuthConfig)?.url === options.project, 'PROJECT_CHANGED');
    const state = travelAlpha.getState();
    require(state.user?.id === options.owner, 'ACCOUNT_CHANGED');
    const scope = {ownerUserId:options.owner, universeId:options.universe};
    const cacheKey = `cosmifold:travel-alpha:cache:cosmifold:cloud-cache:v1:${options.owner}:${options.universe}`;
    if (action === 'identity' || action === 'audit') {
        const client = await alphaProvider.getClient();
        const identity = await client.auth.getUser();
        require(!identity.error && identity.data?.user?.id === options.owner, 'AUTHENTICATED_OWNER_REQUIRED');
        if (action === 'identity') return {owner:identity.data.user.id, preview:state.dataset.kind === 'preview'};
        const rpc = (name, params) => client.schema('public').rpc(name, params).retry(false);
        let receipt = null;
        if (operationId) {
            const response = await rpc('cosmifold_operation_receipt', {p_scope:scope,p_operation_id:operationId});
            require(!response.error && response.status === 200, 'RECEIPT_READ_FAILED');
            receipt = response.data;
        }
        const response = await rpc('cosmifold_read_universe', {p_scope:scope});
        require(!response.error && response.status === 200 && response.data?.status === 'found', 'AUTHORITATIVE_READ_FAILED');
        const metadata = cosmifoldCloudProjection.validateRelational(response.data.metadata);
        require(metadata.universe.id === options.universe && metadata.universe.owner_id === options.owner, 'WRONG_SCOPE');
        const after = await client.auth.getUser();
        require(!after.error && after.data?.user?.id === options.owner && travelAlpha.getState().user?.id === options.owner, 'ACCOUNT_CHANGED');
        return {metadata,receipt};
    }
    require(state.dataset.scope?.ownerUserId === options.owner && state.dataset.scope?.universeId === options.universe, 'WRITER_SCOPE_CHANGED');
    const raw = localStorage.getItem(cacheKey);
    require(raw && raw.length < 48000, 'BOUNDED_ALPHA_CACHE_REQUIRED');
    const cache = cosmifoldCloudCacheFormat.validate(JSON.parse(raw),scope);
    const metadata = cosmifoldCloudProjection.toRelational(state.dataset.snapshot,{...scope,revision:state.dataset.revision}).metadata;
    if (action === 'submit') {
        require(!state.readOnly && !state.writing && state.dataset.revision === options.revision && !cache.pending &&
            document.getElementById('add-entry-dialog').open && document.getElementById('add-entry-title').textContent === 'Rename Item' &&
            document.querySelector('.hierarchy-row.is-selected')?.dataset.entryId === options.entry &&
            document.getElementById('entry-name').value === options.name && !document.getElementById('entry-submit').disabled,
            'EXACT_PREPARED_RENAME_REQUIRED');
        document.getElementById('add-entry-form').requestSubmit();
        return true;
    }
    const blocked = ['alpha-new-galaxy','alpha-add-item','alpha-rename-item'].every(id=>document.getElementById(id).disabled);
    const intended = cache.pending ? cosmifoldCloudProjection.toRelational(cache.pending.intendedSnapshot,{...scope,revision:options.revision}).metadata : null;
    return {metadata,cache,intended,writeStatus:state.writeStatus,readOnly:state.readOnly,writing:state.writing,
        blocked,uiStatus:document.getElementById('alpha-save-state').textContent,
        formBlocked:!document.getElementById('add-entry-dialog').open || document.getElementById('entry-submit').disabled};
}
