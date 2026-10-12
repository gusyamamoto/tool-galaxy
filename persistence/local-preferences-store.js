// Optional UI preferences are separate from domain metadata and never block work.
function createLocalPreferencesStore({storage = () => globalThis.localStorage, scope = null} = {}) {
    const key = scope == null ? 'galaxy:navigation-ui' : `galaxy:workspace:${encodeURIComponent(scope)}:navigation-ui`;
    return {
        replaceRaw(text) { if(text===null)storage().removeItem(key);else storage().setItem(key,text); },
        readForBackup() { return storage().getItem(key); },
        load() {
            try {
                const value = JSON.parse(storage().getItem(key) || '{}');
                return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
            } catch { return {}; }
        },
        update(patch) {
            try { storage().setItem(key, JSON.stringify({...this.load(), ...patch}));return Promise.resolve(); } catch(error) {return Promise.reject(error);}
        },
        clear() { try { storage().removeItem(key);return Promise.resolve(); } catch(error) {return Promise.reject(error);} }
    };
}
