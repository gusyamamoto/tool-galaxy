// Sidebar references to canonical entries. Never particles, parents or content owners.
const galaxyPortals = {
    normalize(record, entries) {
        if (!record || typeof record.id !== "string" || !record.id.trim() || record.id.length > 150 || entries.has(record.id) ||
            !entries.has(record.targetEntryId) || !entries.has(record.parentEntryId) ||
            typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt))) return null;
        return { id: record.id, targetEntryId: record.targetEntryId, parentEntryId: record.parentEntryId, createdAt: record.createdAt };
    },
    normalizeAll(records, entries) {
        const result = [], ids = new Set(), placements = new Set();
        for (const record of records) {
            const portal = this.normalize(record, entries);
            if (!portal) continue;
            const pair = JSON.stringify([portal.targetEntryId, portal.parentEntryId]);
            if (ids.has(portal.id) || placements.has(pair)) continue;
            ids.add(portal.id); placements.add(pair); result.push(portal);
        }
        return result;
    },
    placementError(entries, portals, targetEntryId, parentEntryId) {
        if (!entries.has(targetEntryId)) return "The original entry is no longer available.";
        if (!entries.has(parentEntryId)) return "Choose a place in the canonical hierarchy.";
        if ([...portals.values()].some(portal => portal.targetEntryId === targetEntryId && portal.parentEntryId === parentEntryId))
            return "A Portal to this entry already exists here.";
        return "";
    },
    withoutEntries(records, ids) {
        return records.filter(portal => !ids.has(portal.targetEntryId) && !ids.has(portal.parentEntryId));
    }
};
