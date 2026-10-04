// Persistence adapter: exchange plain data with the app, never DOM elements.
// A future backend can replace load/save while keeping the snapshot format.
const galaxyStorage = {
    key: "tool-galaxy:user-data",

    load() {
        const stored = localStorage.getItem(this.key);
        if (stored === null) {
            return null;
        }

        const data = JSON.parse(stored);
        if (!data || data.version !== 1 || !Array.isArray(data.tools) ||
            !Array.isArray(data.connections) || !Array.isArray(data.builtInPositions)) {
            throw new Error("Unsupported or invalid saved galaxy.");
        }
        return data;
    },

    save(snapshot) {
        localStorage.setItem(this.key, JSON.stringify({ version: 1, ...snapshot }));
    }
};
