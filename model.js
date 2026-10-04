// Generic content and hierarchy rules, independent of DOM, D3 and persistence.
const galaxyModel = {
    roles: {
        category: { name: "Sun", label: "Sun · Main category", body: "sun", scale: 1.35, parentRole: null },
        subcategory: { name: "Planet", label: "Planet · Subcategory", body: "planet", scale: 1, parentRole: "category" },
        entry: { name: "Moon", label: "Moon · Leaf entry", body: "moon", scale: 0.66, parentRole: "subcategory" }
    },

    normalizeRole(role) {
        if (role === "group") return "category";
        return typeof role === "string" && Object.hasOwn(this.roles, role) ? role : "entry";
    },

    normalizeEntry(record) {
        if (!record || typeof record.id !== "string" || !record.id.trim() || record.id.length > 100 ||
            typeof record.name !== "string" || !record.name.trim() || record.name.length > 60 ||
            typeof record.description !== "string" || !record.description.trim() || record.description.length > 1000) {
            return null;
        }
        return {
            id: record.id, name: record.name, description: record.description,
            category: typeof record.category === "string" ? record.category : "",
            role: this.normalizeRole(record.role),
            parentId: typeof record.parentId === "string" ? record.parentId : null,
            x: Number.isFinite(record.x) ? record.x : 400,
            y: Number.isFinite(record.y) ? record.y : 350
        };
    },

    childrenOf(entries, id) {
        return [...entries.values()].filter((entry) => entry.parentId === id);
    },

    normalizeLayout(records, entries) {
        const layout = new Map();
        records.forEach((record) => {
            if (record && entries.has(record.id) && Number.isFinite(record.x) && Number.isFinite(record.y)) {
                layout.set(record.id, { x: record.x, y: record.y, pinned: record.pinned === true });
            }
        });
        return layout;
    },

    // Old unassigned entries remain usable. Never guess ancestry from free-form links.
    normalizeHierarchy(entries) {
        entries.forEach((entry) => {
            const expected = this.roles[entry.role].parentRole;
            if (!expected || entries.get(entry.parentId)?.role !== expected || entry.parentId === entry.id) {
                entry.parentId = null;
            }
        });
    },

    validateChange(entry, entries) {
        if (!Object.hasOwn(this.roles, entry.role)) return "Choose Sun, Planet or Moon.";
        if (!entry.name.trim()) return "Enter a name.";
        if (!entry.description.trim()) return "Enter a description.";
        if (entry.name.length > 60 || entry.description.length > 1000 || entry.category.length > 60) {
            return "Please shorten the name, description or category to fit the field limits.";
        }
        const children = this.childrenOf(entries, entry.id);
        if (children.some((child) => this.roles[child.role].parentRole !== entry.role)) {
            return "Reassign or delete this entry's children before changing its role.";
        }
        const expected = this.roles[entry.role].parentRole;
        if (!expected) return entry.parentId === null ? "" : "A Sun cannot have a parent.";
        const parent = entries.get(entry.parentId);
        const label = this.roles[expected].name;
        if (!parent || parent.role !== expected || parent.id === entry.id) {
            return `Choose an existing ${label} as the parent. Create one first if none are available.`;
        }
        const visited = new Set([entry.id]);
        let ancestor = parent;
        while (ancestor) {
            if (visited.has(ancestor.id)) return "An entry cannot be its own ancestor.";
            visited.add(ancestor.id);
            ancestor = entries.get(ancestor.parentId);
        }
        return "";
    },

    connectionKey(from, to) {
        return JSON.stringify([from, to].sort());
    },

    // One rendered edge per pair. Hierarchy edges take priority over optional links.
    buildConnections(entries, relationships) {
        const edges = new Map();
        relationships.forEach(({ from, to }) => {
            if (from !== to && entries.has(from) && entries.has(to)) {
                edges.set(this.connectionKey(from, to), { from, to, kind: "relationship" });
            }
        });
        entries.forEach((entry) => {
            if (entry.parentId && entries.has(entry.parentId)) {
                edges.set(this.connectionKey(entry.parentId, entry.id), {
                    from: entry.parentId, to: entry.id, kind: "hierarchy"
                });
            }
        });
        return [...edges.values()];
    },

    search(entries, query) {
        const term = query.trim().toLocaleLowerCase();
        if (!term) return [];
        return [...entries.values()].filter((entry) => entry.name.toLocaleLowerCase().includes(term))
            .sort((a, b) => Number(!a.name.toLocaleLowerCase().startsWith(term)) -
                Number(!b.name.toLocaleLowerCase().startsWith(term)) || a.name.localeCompare(b.name));
    }
};
