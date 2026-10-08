// Persistence adapter: exchange plain data with the app, never DOM elements.
// Keep current keys, exact legacy backups and the v5 format inside this adapter.
function createLocalMetadataStore({storage = () => globalThis.localStorage, scope = null} = {}) {
    const prefix = scope == null ? "galaxy:user-data" : `galaxy:workspace:${encodeURIComponent(scope)}:user-data`;
    function validate(data) {
        const records = data?.version === 1 ? data.tools : data?.entries;
        if (!data || ![1, 2, 3, 4, 5].includes(data.version) || !Array.isArray(records) ||
            (data.version < 3 && !Array.isArray(data.builtInPositions)) ||
            (data.version >= 4 && !Array.isArray(data.layout)) ||
            (data.portals != null && !Array.isArray(data.portals)) ||
            (data.constellations != null && !Array.isArray(data.constellations)) ||
            (data.archivedGalaxies != null && !Array.isArray(data.archivedGalaxies))) {
            throw new Error("Unsupported or invalid saved galaxy.");
        }
    }
    return {
        key: prefix,
        legacyKey: scope == null ? "tool-galaxy:user-data" : prefix,
        backupKey: prefix + ":pre-hierarchy",
        layoutBackupKey: prefix + ":pre-layout",
        treeBackupKey: prefix + ":pre-cosmic-tree",

        load() {
            const localStorage = storage();
            const stored = localStorage.getItem(this.key) ?? localStorage.getItem(this.legacyKey);
            if (stored === null) {
                return null;
            }

            const data = JSON.parse(stored);
            validate(data);
            const records = data.version === 1 ? data.tools : data.entries;
            // Version 3 keeps all entries (including built-in edits/positions) together.
            // Partial legacy built-in records are merged with defaults by the application.
            return {
                version: 5,
                migrateTree: data.version < 5,
                legacy: data.version < 3,
                entries: data.version < 3 ? [...records, ...data.builtInPositions] : records,
                // Compatibility boundary only: obsolete records never enter active state.
                ...(data.connections != null && (!Array.isArray(data.connections) || data.connections.length) ? { needsCanonicalSave: true } : {}),
                layout: data.version >= 4 ? data.layout : [],
                ...(data.portals != null ? { portals: data.portals } : {}),
                ...(data.constellations != null ? { constellations: data.constellations } : {}),
                ...(data.archivedGalaxies != null ? { archivedGalaxies: data.archivedGalaxies } : {})
            };
        },

        save(snapshot) {
            const localStorage = storage();
            const previous = localStorage.getItem(this.key) ?? localStorage.getItem(this.legacyKey);
            const previousData = previous === null ? null : JSON.parse(previous);
            const previousVersion = previousData?.version ?? null;
            if (previousVersion !== null && ![1, 2, 3, 4, 5].includes(previousVersion)) {
                throw new Error("Unsupported saved galaxy cannot be overwritten.");
            }
            if (previous !== null) validate(previousData);
            if (previousVersion !== null && previousVersion < 3 && localStorage.getItem(this.backupKey) === null) {
                // Back up the exact old snapshot before replacing it. If this fails, keep it untouched.
                localStorage.setItem(this.backupKey, previous);
            }
            if (previousVersion === 3 && localStorage.getItem(this.layoutBackupKey) === null) {
                localStorage.setItem(this.layoutBackupKey, previous);
            }
            if (previousVersion !== null && previousVersion < 5 && localStorage.getItem(this.treeBackupKey) === null) {
                localStorage.setItem(this.treeBackupKey, previous);
            }
            localStorage.setItem(this.key, JSON.stringify({
                // Empty legacy slot keeps older version-5 readers able to open the snapshot.
                version: 5, entries: snapshot.entries, connections: [], layout: snapshot.layout || [],
                ...(snapshot.portals != null ? { portals: snapshot.portals } : {}),
                ...(snapshot.constellations != null ? { constellations: snapshot.constellations } : {}),
                ...(snapshot.archivedGalaxies != null ? { archivedGalaxies: snapshot.archivedGalaxies } : {})
            }));
        },
        clear() {
            const localStorage = storage();
            localStorage.removeItem(this.key);
            if (this.legacyKey !== this.key) localStorage.removeItem(this.legacyKey);
            // Recovery backups intentionally remain available.
        }
    };
}
