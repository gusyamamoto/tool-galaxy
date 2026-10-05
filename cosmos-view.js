// Presentation only. These values never modify particles, ancestry or saved data.
const cosmosView = {
    tiers: { galaxy: .45, system: .58, close: .78 },
    fades: {
        sun: [.43, .58], planet: [.58, .68], moon: [.68, .76], satellite: [.70, .79], astronaut: [.74, .86],
        planetLabel: [.62, .72], moonLabel: [.73, .83], satelliteLabel: [.76, .88],
        astronautLabel: [.82, .96], tethers: [.78, .96], guides: [.58, .78], clouds: [.38, .72]
    },
    smooth(scale, start, end) {
        const t = Math.max(0, Math.min(1, (scale - start) / (end - start)));
        return t * t * (3 - 2 * t);
    },
    detail(scale) {
        const result = { tier: scale < this.tiers.galaxy ? "universe" : scale < this.tiers.system ? "galaxy" : scale < this.tiers.close ? "system" : "close" };
        Object.entries(this.fades).forEach(([name, range]) => { result[name] = this.smooth(scale, ...range); });
        result.clouds = this.cloudOpacity(scale);
        return result;
    },
    cloudOpacity(scale, viewport, footprint) {
        let [start, end] = this.fades.clouds;
        if (viewport) {
            const width = Math.max(1, viewport.right - viewport.left), height = Math.max(1, viewport.bottom - viewport.top);
            const smallCanvas = 1 - this.smooth(Math.min(width, height), 420, 900);
            // Size only: translation/panning never changes this pressure. The
            // footprint already has a dead band and gradual size interpolation.
            const coverage = footprint ? Math.max(Math.max(160, footprint.width * scale) / width,
                Math.max(140, footprint.height * scale) / height) : 0;
            const pressure = this.smooth(coverage, .8, 2.2);
            start -= .03 * smallCanvas;
            end -= .04 * smallCanvas + .04 * pressure;
        }
        const remaining = 1 - this.smooth(scale, start, end);
        return .92 * remaining * remaining;
    },
    // Measure the normal local footprint. Winsorize parent-relative offsets so
    // a dragged/outlying branch cannot inflate its whole Galaxy. Never move bodies.
    normalPositions(root, members) {
        const positions = new Map([[root, { x: root.x, y: root.y }]]);
        [...members].sort((a, b) => a.depth - b.depth).forEach(node => {
            const parent = node.parent, anchor = positions.get(parent);
            if (!anchor || !Number.isFinite(node.orbitRadius)) {
                positions.set(node, { x: node.x, y: node.y }); return;
            }
            const dx = node.x - parent.x, dy = node.y - parent.y, distance = Math.hypot(dx, dy);
            const limit = node.orbitRadius * 1.4 + (node.depth === 1 ? node.envelope * .4 + 60 : node.radius + 32);
            const factor = distance > limit ? limit / distance : 1;
            positions.set(node, { x: anchor.x + dx * factor, y: anchor.y + dy * factor });
        });
        return positions;
    },
    regionTarget(root, members) {
        const positions = this.normalPositions(root, members);
        let left = root.x - 40, right = root.x + 40, top = root.y - 40, bottom = root.y + 40;
        members.forEach(node => {
            const point = positions.get(node);
            const radius = node.radius + 24;
            left = Math.min(left, point.x - radius); right = Math.max(right, point.x + radius);
            top = Math.min(top, point.y - radius); bottom = Math.max(bottom, point.y + radius);
        });
        return { offsetX: (left + right) / 2 - root.x, offsetY: (top + bottom) / 2 - root.y,
            width: Math.max(320, (right - left) * 1.35 + 144), height: Math.max(280, (bottom - top) * 1.35 + 144) };
    },
    updateRegion(previous, target, elapsed, immediate = false) {
        if (!previous || immediate) return { ...target, target: { ...target } };
        // Small breathing of a settled system must not resize its territory.
        for (const key of ["offsetX", "offsetY", "width", "height"]) {
            const size = key === "offsetY" || key === "height" ? previous.height : previous.width;
            const tolerance = Math.max(16, size * (key.startsWith("offset") ? .015 : .04));
            if (Math.abs(target[key] - previous.target[key]) > tolerance) previous.target[key] = target[key];
        }
        const blend = 1 - Math.exp(-Math.min(100, elapsed) / 650);
        for (const key of ["offsetX", "offsetY", "width", "height"]) previous[key] += (previous.target[key] - previous[key]) * blend;
        return previous;
    }
};
