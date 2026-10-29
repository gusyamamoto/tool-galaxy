// Defaults stay offline. A future composition can inject account/workspace adapters.
const cosmosConfig = Object.freeze({
    applicationMode: 'local-beta',
    environment: 'local',
    persistenceMode: 'local',
    workspaceId: null,
    auth: 'none',
    sync: 'none'
});
