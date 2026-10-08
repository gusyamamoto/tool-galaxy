// Persist a generic tree. Depth and celestial roles are disposable presentation.
const galaxyModel = {
    roles: {
        galaxy: { name: "Galaxy", label: "Galaxy · Domain", body: "galaxy", scale: 1 },
        sun: { name: "Sun", label: "Sun · Topic", body: "sun", scale: 2 },
        planet: { name: "Planet", label: "Planet · Category", body: "planet", scale: 1.1 },
        moon: { name: "Moon", label: "Moon · Subcategory", body: "moon", scale: 0.52 },
        satellite: { name: "Satellite", label: "Satellite · Entry", body: "satellite", scale: 0.38 },
        astronaut: { name: "Astronaut", label: "Astronaut · Entry", body: "astronaut", scale: 0.28 }
    },
    roleAtDepth(depth) { return ["galaxy", "sun", "planet", "moon", "satellite"][depth] || "astronaut"; },
    contentLimits: { notes: 100000, fileBytes: 10 * 1024 * 1024, thumbnailEdge: 240, imagePixels: 20000000, textPreviewBytes: 2048 },
    emptyContent() { return { version: 1, notes: { format: "plain", text: "" }, links: [], attachments: [] }; },
    webUrl(value) {
        if (typeof value !== "string" || value.length > 2048) return null;
        const text = value.trim();
        if (!text || /[\u0000-\u001f\u007f]/.test(text)) return null;
        const domainWithPort = /^[^/?#:\s]+\.[^/?#:\s]+:\d+(?:[/?#]|$)/.test(text);
        const explicitScheme = !domainWithPort && /^[a-z][a-z\d+.-]*:/i.test(text);
        try {
            if (!explicitScheme && (/[\s\\]/.test(text) || text.startsWith("/"))) return null;
            const url = new URL(explicitScheme ? text : `https://${text}`);
            if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return null;
            if (!explicitScheme && (url.username || url.password || !url.hostname.includes(".") ||
                !url.hostname.split(".").every(label => /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label)))) return null;
            return url.href;
        }
        catch { return null; }
    },
    normalizeContent(value, entryId) {
        if (!value || value.version !== 1 || value.notes?.format !== "plain" ||
            typeof value.notes.text !== "string" || value.notes.text.length > this.contentLimits.notes ||
            !Array.isArray(value.links) || !Array.isArray(value.attachments)) return null;
        const links = [], attachments = [], ids = new Set();
        const validId = id => typeof id === "string" && !!id.trim() && id.length <= 150;
        for (const link of value.links) {
            const url = this.webUrl(link?.url);
            if (!link || !validId(link.id) || ids.has(link.id) || !url ||
                (link.title != null && (typeof link.title !== "string" || link.title.length > 200))) return null;
            ids.add(link.id); links.push({ id: link.id, url, ...(link.title ? { title: link.title } : {}) });
        }
        ids.clear();
        for (const file of value.attachments) {
            if (!file || file.kind !== "upload" || !validId(file.id) || ids.has(file.id) || file.entryId !== entryId ||
                typeof file.storageKey !== "string" || !file.storageKey.trim() || file.storageKey.length > 1024 || typeof file.filename !== "string" || !file.filename || file.filename.length > 255 ||
                !["image/jpeg","image/png","image/webp","application/pdf","text/plain","text/markdown"].includes(file.mimeType) ||
                !Number.isSafeInteger(file.size) || file.size < 0 || typeof file.createdAt !== "string" || !Number.isFinite(Date.parse(file.createdAt))) return null;
            ids.add(file.id);
            attachments.push({ id: file.id, kind: "upload", entryId, filename: file.filename, mimeType: file.mimeType,
                size: file.size, storageKey: file.storageKey, createdAt: file.createdAt,
                ...(Number.isSafeInteger(file.width) && file.width > 0 && Number.isSafeInteger(file.height) && file.height > 0 ? { width: file.width, height: file.height } : {}) });
        }
        return { version: 1, notes: { format: "plain", text: value.notes.text }, links, attachments };
    },
    normalizeEntry(record) {
        // Canonical entries are user-owned. This allowlist intentionally drops
        // legacy protected/isProtected/builtIn flags while preserving content.
        const content = record?.content == null ? null : this.normalizeContent(record.content, record.id);
        if (record?.content != null && !content) return null;
        if (!record || typeof record.id !== "string" || !record.id.trim() || record.id.length > 100 ||
            typeof record.name !== "string" || !record.name.trim() || record.name.length > 60 ||
            (record.description != null && (typeof record.description !== "string" || record.description.length > 1000))) return null;
        return {
            id: record.id, name: record.name, description: record.description ?? "", ...(content ? { content } : {}),
            category: typeof record.category === "string" ? record.category : "",
            parentId: typeof record.parentId === "string" && record.parentId ? record.parentId : null,
            x: Number.isFinite(record.x) ? record.x : 400,
            y: Number.isFinite(record.y) ? record.y : 350,
            ...(record.appearance && typeof record.appearance === "object" && !Array.isArray(record.appearance) ?
                { appearance: { ...record.appearance } } : {})
        };
    },
    childrenOf(entries, id) { return [...entries.values()].filter(entry => entry.parentId === id); },
    subtreeIds(entries, id) {
        const ids = new Set();
        if (!entries.has(id)) return ids;
        const children = new Map();
        entries.forEach(entry => {
            const siblings = children.get(entry.parentId) || [];
            siblings.push(entry.id); children.set(entry.parentId, siblings);
        });
        const queue = [id];
        for (let i = 0; i < queue.length; i++) {
            if (ids.has(queue[i])) continue;
            ids.add(queue[i]); queue.push(...(children.get(queue[i]) || []));
        }
        return ids;
    },
    deletionPlan(entries, id, { subtree = false } = {}) {
        const ids = this.subtreeIds(entries, id);
        if (!ids.size) return { ids, error: "This item no longer exists." };
        if (ids.size > 1 && !subtree) return { ids, error: "Confirm deletion of this item and everything inside it." };
        return { ids, error: "" };
    },
    ancestors(entries, id) {
        const result = [], visited = new Set([id]);
        let parent = entries.get(entries.get(id)?.parentId);
        while (parent && !visited.has(parent.id)) {
            result.push(parent); visited.add(parent.id); parent = entries.get(parent.parentId);
        }
        return result;
    },
    // Repair invalid ancestry without discarding records, then compute arbitrary depth.
    normalizeHierarchy(entries) {
        entries.forEach(entry => {
            if (entry.parentId === entry.id || !entries.has(entry.parentId)) entry.parentId = null;
        });
        const done = new Set();
        entries.forEach(start => {
            const path = [], visiting = new Set();
            let entry = start;
            while (entry && !done.has(entry.id)) {
                if (visiting.has(entry.id)) { entry.parentId = null; break; }
                visiting.add(entry.id); path.push(entry); entry = entries.get(entry.parentId);
            }
            path.forEach(node => done.add(node.id));
        });
        const children = new Map([...entries.keys()].map(id => [id, []]));
        entries.forEach(entry => { if (entry.parentId) children.get(entry.parentId).push(entry); });
        const queue = [...entries.values()].filter(entry => !entry.parentId);
        queue.forEach(entry => { entry.depth = 0; });
        for (let i = 0; i < queue.length; i++) {
            const entry = queue[i]; entry.role = this.roleAtDepth(entry.depth);
            children.get(entry.id).forEach(child => { child.depth = entry.depth + 1; queue.push(child); });
        }
    },
    migrateLegacy(entries, records) {
        // Preserve valid old Sun→Planet→Moon edges. Do not infer hierarchy from links/labels.
        const roles = new Map(records.filter(record => record && typeof record.id === "string")
            .map(record => [record.id, record.role === "group" ? "category" : record.role]));
        entries.forEach(entry => {
            const role = roles.get(entry.id);
            const expected = role === "subcategory" ? "category" : role === "entry" ? "subcategory" : null;
            if (!expected || roles.get(entry.parentId) !== expected || !entries.has(entry.parentId)) entry.parentId = null;
        });
        if (entries.size) {
            let id = "migration-my-galaxy", suffix = 1;
            while (entries.has(id)) id = `migration-my-galaxy-${suffix++}`;
            const roots = [...entries.values()].filter(entry => !entry.parentId);
            const x = roots.reduce((sum, entry) => sum + entry.x, 0) / roots.length;
            const y = roots.reduce((sum, entry) => sum + entry.y, 0) / roots.length;
            entries.set(id, { id, name: "My Galaxy", description: "Your existing systems and entries.", category: "", parentId: null, x, y });
            roots.forEach(entry => { entry.parentId = id; });
        }
        this.normalizeHierarchy(entries);
    },
    normalizeLayout(records, entries) {
        const layout = new Map();
        // Resolve all historical coordinates before computing relative offsets,
        // so parent and child migration is independent of record order.
        records.forEach(record => {
            if (record && entries.has(record.id) && Number.isFinite(record.x) && Number.isFinite(record.y)) {
                entries.get(record.id).x = record.x; entries.get(record.id).y = record.y;
            }
        });
        records.forEach(record => {
            if (!record || !entries.has(record.id)) return;
            if (Number.isFinite(record.angle) && Number.isFinite(record.radius) && record.radius >= 0 &&
                !(record.pinned === true && Number.isFinite(record.x) && Number.isFinite(record.y))) {
                layout.set(record.id, { parentId: entries.get(record.id).parentId, angle: record.angle, radius: record.radius });
            } else if (Number.isFinite(record.x) && Number.isFinite(record.y)) {
                // Historical soft positions and pins both start at their saved coordinates.
                // Only a flowing parent-relative influence survives; roots need no influence.
                const entry = entries.get(record.id), parent = entries.get(entry.parentId);
                entry.x = record.x; entry.y = record.y;
                if (parent) layout.set(record.id, { parentId: parent.id,
                    angle: Math.atan2(entry.y - parent.y, entry.x - parent.x), radius: Math.hypot(entry.x - parent.x, entry.y - parent.y) });
            }
        });
        return layout;
    },
    validateChange(entry, entries) {
        if (!entry.name.trim()) return "Enter a name.";
        if (entry.description != null && typeof entry.description !== "string") return "Description must be text.";
        if (entry.name.length > 60 || (entry.description?.length ?? 0) > 1000 || entry.category.length > 60) return "Please shorten the name, description or category.";
        if (entry.parentId && !entries.has(entry.parentId)) return "Choose an existing parent.";
        const visited = new Set([entry.id]);
        let ancestor = entries.get(entry.parentId);
        while (ancestor) {
            if (visited.has(ancestor.id)) return "An item cannot be its own ancestor.";
            visited.add(ancestor.id); ancestor = entries.get(ancestor.parentId);
        }
        return "";
    },
    buildHierarchyEdges(entries) {
        return [...entries.values()].filter(entry => entry.parentId && entries.has(entry.parentId))
            .map(entry => ({ from: entry.parentId, to: entry.id, kind: "hierarchy" }));
    },
    search(entries, query) {
        const term = query.trim().toLocaleLowerCase();
        if (!term) return [];
        return [...entries.values()].filter(entry => entry.name.toLocaleLowerCase().includes(term))
            .sort((a, b) => Number(!a.name.toLocaleLowerCase().startsWith(term)) - Number(!b.name.toLocaleLowerCase().startsWith(term)) || a.name.localeCompare(b.name));
    }
};
