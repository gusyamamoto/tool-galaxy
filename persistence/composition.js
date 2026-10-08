// The single adapter selection point. Product features receive these interfaces.
class PersistenceError extends Error {
    constructor(error, store, operation, scope) {
        super(error?.message || 'Storage could not complete the action.', {cause: error});
        // Preserve quota classification used by the current friendly recovery UI.
        this.name = error?.name || 'PersistenceError';
        this.store = store; this.operation = operation; this.scope = scope;
    }
}
function createPersistence({config = cosmosConfig, sample = false, sampleSnapshot = null, metadata, files, preferences} = {}) {
    const scope = config.workspaceId ?? null;
    // Sample overrides even explicitly injected real adapters, by design.
    metadata = sample ? createMemoryMetadataStore(sampleSnapshot) : metadata || createLocalMetadataStore({scope});
    files = sample ? createMemoryFileStore() : files || createIndexedDbFileStore({scope});
    preferences = sample ? createMemoryPreferencesStore() : preferences || createLocalPreferencesStore({scope});
    const diagnostics = {lastError: null};
    function boundary(adapter, store, methods) {
        const service = {};
        function failure(error, operation) {
            const wrapped = error instanceof PersistenceError ? error : new PersistenceError(error, store, operation, scope);
            diagnostics.lastError = wrapped; return wrapped;
        }
        methods.forEach(operation => service[operation] = (...args) => {
            try {
                const result = adapter[operation](...args);
                if (result?.then && store === 'metadata') {
                    result.catch(() => {});
                    throw new Error('Metadata adapters must provide synchronous local commits; remote sync belongs behind that boundary.');
                }
                return result?.then ? result.catch(error => { throw failure(error, operation); }) : result;
            } catch (error) { throw failure(error, operation); }
        });
        return service;
    }
    return {
        scope, sample, diagnostics,
        metadata: boundary(metadata, 'metadata', ['load','save','clear']),
        files: Object.assign(boundary(files, 'files', ['save','get','delete','deleteEntries','hasEntries']), {temporary: !!files.temporary}),
        preferences
    };
}
