// Persistence adapter: exchange plain data with the app, never DOM elements.
// A future backend can replace load/save while keeping the snapshot format.
const galaxyStorage = {
    key: "galaxy:user-data",
    legacyKey: "tool-galaxy:user-data",
    backupKey: "galaxy:user-data:pre-hierarchy",
    layoutBackupKey: "galaxy:user-data:pre-layout",
    treeBackupKey: "galaxy:user-data:pre-cosmic-tree",

    load() {
        const stored = localStorage.getItem(this.key) ?? localStorage.getItem(this.legacyKey);
        if (stored === null) {
            return null;
        }

        const data = JSON.parse(stored);
        const records = data?.version === 1 ? data.tools : data?.entries;
        if (!data || ![1, 2, 3, 4, 5].includes(data.version) || !Array.isArray(records) ||
            !Array.isArray(data.connections) || (data.version < 3 && !Array.isArray(data.builtInPositions)) ||
            (data.version >= 4 && !Array.isArray(data.layout))) {
            throw new Error("Unsupported or invalid saved galaxy.");
        }
        // Version 3 keeps all entries (including built-in edits/positions) together.
        // Partial legacy built-in records are merged with defaults by the application.
        return {
            version: 5,
            migrateTree: data.version < 5,
            legacy: data.version < 3,
            entries: data.version < 3 ? [...records, ...data.builtInPositions] : records,
            connections: data.connections,
            layout: data.version >= 4 ? data.layout : []
        };
    },

    save(snapshot) {
        const previous = localStorage.getItem(this.key) ?? localStorage.getItem(this.legacyKey);
        const previousVersion = previous === null ? null : JSON.parse(previous).version;
        if (previousVersion !== null && ![1, 2, 3, 4, 5].includes(previousVersion)) {
            throw new Error("Unsupported saved galaxy cannot be overwritten.");
        }
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
            version: 5, entries: snapshot.entries, connections: snapshot.connections, layout: snapshot.layout || []
        }));
    }
};
