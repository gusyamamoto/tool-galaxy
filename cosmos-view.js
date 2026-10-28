// Presentation only. These values never modify particles, ancestry or saved data.
const cosmosView = {
    bodyCaps: { sun: 100, planet: 32, moon: 16, satellite: 12, astronaut: 8 },
    inspectionCaps: { satellite: 26, astronaut: 14 },
    visualScale: { sun: 1.5, planet: 1.3 },
    overviewMinimum: { sun: 6, planet: 2.5 },
    galaxyDiameter(scale) { return 14 + 8 * this.smooth(scale, .08, .58); },
    galaxyLabelPosition(root, suns, label, bounds) {
        const center=(root.left+root.right)/2;
        if(!suns)return {left:center-label.width/2,top:root.bottom+4};
        // One continuous group envelope, never a nearby child's name anchor or
        // alternating collision sides. Keep the title clear of its own core too.
        const left=(suns.left+suns.right-label.width)/2;
        const top=Math.min(root.top,suns.top)-label.height-12;
        return {
            left:Math.round(Math.max(bounds.left+8,Math.min(bounds.right-label.width-8,left))*4)/4,
            top:Math.round(Math.max(bounds.top+8,top)*4)/4
        };
    },
    renderCap(role, scale) {
        const normal = this.bodyCaps[role] || Infinity;
        const close = this.inspectionCaps[role];
        if (!close || scale <= 3) return normal;
        if (scale >= 9) return close;
        return normal + (close - normal) * this.smooth(scale, 3, 9);
    },
    renderedDiameter(role, diameter, scale, detail = 1) {
        return Math.max(this.overviewMinimum[role] || 0,
            Math.min(this.renderCap(role, scale), diameter * (this.visualScale[role] || 1) * scale * (.72 + detail * .28)));
    },
    tiers: { galaxy: .45, system: .58, close: .78 },
    // Continuing branches use one layer, or two adjacent layers in a handoff.
    // Terminal branches retain their entrance beyond the final local handoff.
    // Galaxy names yield near the Galaxy tier; Planet names begin emerging
    // just before close. Deeper bands leave room to orient before yielding again.
    // Body disclosure, explicit reveals and the Constellation lens are separate.
    labelOrder: ['galaxy','sun','planet','moon','satellite','astronaut'],
    labelHandoffs: [[.24,.42],[.64,1.12],[1.60,2.10],[2.70,3.60],[5,7]],
    releasesOverviewSelection(scale, previousScale, source) {
        // One-way release: no state is automatically restored on zoom-in, so
        // boundary oscillation cannot toggle an old selection back on.
        return source === 'user-zoom' && scale < previousScale && scale <= this.tiers.galaxy;
    },
    fades: {
        sun: [.04, .30], planet: [.08, .50], moon: [.14, .55], satellite: [.70, .79], astronaut: [.74, .86],
        sunLabel: [.04, .26], planetLabel: [.20, .60], moonLabel: [.90, 1.12], satelliteLabel: [1.1, 2.7],
        astronautLabel: [2.7, 7], tethers: [.78, .96], guides: [.58, .78], clouds: [.38, .72]
    },
    smooth(scale, start, end) {
        const t = Math.max(0, Math.min(1, (scale - start) / (end - start)));
        return t * t * (3 - 2 * t);
    },
    disclosureOffset(id) {
        let hash=2166136261;
        for(const char of id)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
        hash=Math.imul(hash^(hash>>>16),2246822507)>>>0;
        hash=(hash^(hash>>>13))>>>0;
        return hash/4294967296;
    },
    // Disposable branch metadata over canonical parent IDs. A bottom-up pass
    // also handles same-role descendants at the deepest supported levels.
    terminalLabelIds(entries) {
        const ranks=new Map(this.labelOrder.map((role,index)=>[role,index]));
        const pending=new Map(), deepest=new Map(), queue=[], terminal=new Set();
        entries.forEach(entry=>{pending.set(entry.id,0);deepest.set(entry.id,ranks.get(entry.role)??-1);});
        entries.forEach(entry=>{if(pending.has(entry.parentId))pending.set(entry.parentId,pending.get(entry.parentId)+1);});
        pending.forEach((count,id)=>{if(!count)queue.push(id);});
        for(let i=0;i<queue.length;i++){
            const id=queue[i],entry=entries.get(id),rank=ranks.get(entry.role)??-1;
            if(rank>=0&&deepest.get(id)===rank)terminal.add(id);
            if(!pending.has(entry.parentId))continue;
            deepest.set(entry.parentId,Math.max(deepest.get(entry.parentId),deepest.get(id)));
            const remaining=pending.get(entry.parentId)-1;pending.set(entry.parentId,remaining);
            if(!remaining)queue.push(entry.parentId);
        }
        return terminal;
    },
    labelPriority(role, opacity) { return 4+6*(1-opacity)+this.labelOrder.indexOf(role)*.001; },
    labelDisclosure(role, scale, id, detail, terminal=false) {
        if(detail?.labels[role])return terminal?detail.labels[role].terminalOpacity:detail.labels[role].opacity;
        const index=this.labelOrder.indexOf(role);
        if(index<0)return 1;
        const enter=index ? this.smooth(scale,...this.labelHandoffs[index-1]) : 1;
        if(terminal)return enter;
        const leave=index<this.labelHandoffs.length ? this.smooth(scale,...this.labelHandoffs[index]) : 0;
        // Non-overlapping bands make each child's emergence exactly its
        // parent's departure. No residual floors or ID-dependent layer timing.
        return enter-leave;
    },
    deepTetherOpacity(scale, id, protectedRelationship=false) {
        if(protectedRelationship)return .25;
        const offset=this.disclosureOffset(id)*1.2;
        return .14*this.smooth(scale,2.5+offset,6+offset);
    },
    detail(scale) {
        const result = { tier: scale < this.tiers.galaxy ? "universe" : scale < this.tiers.system ? "galaxy" : scale < this.tiers.close ? "system" : "close" };
        Object.entries(this.fades).forEach(([name, range]) => { result[name] = this.smooth(scale, ...range); });
        result.sun = .82 + .18 * result.sun;
        result.planet = .58 + .42 * result.planet;
        result.labels={};
        this.labelOrder.forEach((role,index)=>{
            const opacity=this.labelDisclosure(role,scale,'');
            // Protected context ranks 0–3 remain first. Among ordinary names,
            // the stronger envelope wins; exact crossover ties favor the parent.
            const terminalOpacity=index?this.smooth(scale,...this.labelHandoffs[index-1]):1;
            result.labels[role]={opacity,terminalOpacity,priority:this.labelPriority(role,opacity)};
        });
        // Legacy cloud utilities remain available for historical/isolated tests;
        // normal overview represents the actual root and its real descendants.
        result.clouds = 0;
        return result;
    },
    // A temporary lens over normal role fades, never a replacement for them.
    constellationVisibility(scale, role, { member = false, priority = false } = {}, detail = this.detail(scale)) {
        const context = .78 * this.smooth(scale, .34, .84);
        const body = role === 'galaxy' ? 1 : detail[role];
        // Preserve the established Constellation lens disclosure separately.
        const lensRange={satellite:[1.02,1.30],astronaut:[1.20,1.52]}[role];
        const label = role === 'galaxy' ? this.smooth(scale, .48, .68) : lensRange?this.smooth(scale,...lensRange):detail[`${role}Label`];
        return { body: member || priority ? 1 : body * context,
            label: priority ? 1 : member ? label : label * context };
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
