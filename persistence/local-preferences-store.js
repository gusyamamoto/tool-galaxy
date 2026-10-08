// Optional UI preferences are separate from domain metadata and never block work.
function createLocalPreferencesStore({storage = () => globalThis.localStorage, scope = null} = {}) {
    const key = scope == null ? 'galaxy:navigation-ui' : `galaxy:workspace:${encodeURIComponent(scope)}:navigation-ui`;
    return {
        load() {
            try {
                const value = JSON.parse(storage().getItem(key) || '{}');
                return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
            } catch { return {}; }
        },
        update(patch) {
            try { storage().setItem(key, JSON.stringify({...this.load(), ...patch})); } catch { /* Optional UI state. */ }
        },
        clear() { try { storage().removeItem(key); } catch { /* Optional UI state. */ } }
    };
}
