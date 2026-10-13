// Account initialization is deliberately independent of startup.js and local storage.
const cosmifoldAuth = createAuthService({adapter:createSupabaseAuthAdapter({disabled:galaxySample.isRequested(location.search)})});
const cosmifoldAccountUI = new CosmifoldAccountUI({service:cosmifoldAuth});
void cosmifoldAuth.initialize();
