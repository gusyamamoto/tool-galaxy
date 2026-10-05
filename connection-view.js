// Presentation-only geometry. Never changes relationships, ancestry or physics.
const connectionView = {
    intersects(start, end, bounds) {
        if (![start.x,start.y,end.x,end.y].every(Number.isFinite)) return false;
        const dx = end.x - start.x, dy = end.y - start.y;
        let low = 0, high = 1;
        for (const [p,q] of [[-dx,start.x-bounds.left],[dx,bounds.right-start.x],[-dy,start.y-bounds.top],[dy,bounds.bottom-start.y]]) {
            if (!p) { if (q < 0) return false; continue; }
            if (p < 0) low = Math.max(low,q/p); else high = Math.min(high,q/p);
            if (low > high) return false;
        }
        return true;
    },
    nearest(point, start, end) {
        const dx = end.x - start.x, dy = end.y - start.y, length = dx * dx + dy * dy;
        const t = length ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length)) : 0;
        const x = start.x + t * dx, y = start.y + t * dy;
        return { x, y, t, distance: Math.hypot(point.x - x, point.y - y) };
    },
    pick(hits) {
        // Quantized distance gives a transitive ordering at crowded crossings.
        hits.sort((a,b) => Math.round(a.distance * 2) - Math.round(b.distance * 2) ||
            Number(b.incident) - Number(a.incident) || a.link.id.localeCompare(b.link.id));
        return hits[0] || null;
    },
    destination(link, selectedId, point, start, end) {
        if (selectedId === link.from) return link.to;
        if (selectedId === link.to) return link.from;
        return Math.hypot(point.x - start.x, point.y - start.y) <= Math.hypot(point.x - end.x, point.y - end.y) ? link.from : link.to;
    },
    description(link, entries) {
        const from = entries.get(link.from)?.name || "", to = entries.get(link.to)?.name || "";
        const label = link.label || (link.type ? link.type.replace(/[-_]/g, " ").replace(/^./, letter => letter.toUpperCase()) : "");
        return label ? `${from} — ${label} — ${to}` : `${from} ↔ ${to}`;
    }
};
