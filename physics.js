// Local orbital physics, Sun footprint packing inside Galaxies, Galaxy packing
// inside the Universe. These indexes/envelopes are disposable derived state.
class GalaxyPhysics {
    constructor({ onTick, onSettle, onPlacementChange = () => {} }) {
        Object.assign(this, { onTick, onSettle, onPlacementChange });
        this.particles = new Map(); this.systems = new Map(); this.galaxies = new Map();
        this.children = new Map(); this.dragging = new Set();
        this.bounds = { left: 60, right: 900, top: 140, bottom: 700 };
        this.baseNodeRadius = 13; this.paused = false; this.settled = true; this.origin = null;
        this.collisionForce = d3.forceCollide(node => node.radius + (node.role === "astronaut" ? 10 : 12)).strength(1).iterations(4);
        this.linkForce = d3.forceLink().id(node => node.id).distance(link => link.source.radius + link.target.radius + 80)
            .strength(0); // Semantic relationships are informational, never layout constraints.
        this.galaxyCollision = d3.forceCollide(region => region.radius + 60).strength(.65).iterations(3);
        this.simulation = d3.forceSimulation([]).stop().alphaMin(.002).alphaDecay(.032).velocityDecay(.42)
            .force("follow", () => this.followParents())
            .force("regions", alpha => this.arrangeRegions(alpha))
            .force("orbits", alpha => this.attractToOrbits(alpha))
            .force("relationships", this.linkForce)
            .force("local", alpha => this.systems.forEach(system => system.repulsion(alpha)))
            .force("siblings", alpha => this.separateSiblings(alpha))
            .force("collision", this.collisionForce)
            .on("tick", () => this.onTick(this.particles))
            .on("end", () => { this.settled = true; this.onSettle(); });
    }
    setGraph(entries, connections, placements = null) {
        const next = new Map(), fresh = new Set();
        entries.forEach(entry => {
            let node = this.particles.get(entry.id);
            if (!node) { fresh.add(entry.id); node = { id: entry.id, x: entry.x, y: entry.y, vx: 0, vy: 0 }; }
            const parentChanged = node.parentId !== (entry.parentId || null);
            Object.assign(node, { role: entry.role, depth: entry.depth, parentId: entry.parentId || null,
                sizeScale: entry.sizeScale || 1, seedLayout: entry.seedLayout === true });
            node.radius = entry.role === "galaxy" ? 0 : this.baseNodeRadius * node.sizeScale;
            if (placements !== null) node.placement = this.copyPlacement(placements.get(entry.id));
            if (parentChanged && !fresh.has(entry.id)) node.placement = null;
            this.releaseConstraint(node); next.set(node.id, node);
        });
        this.particles = next;
        this.dragging = new Set([...this.dragging].filter(id => next.has(id)));
        this.origin ||= { x: (this.bounds.left + this.bounds.right) / 2, y: (this.bounds.top + this.bounds.bottom) / 2 };
        this.linkForce.links([]); this.simulation.nodes([...next.values()]); this.buildSystems();
        this.ordered.forEach(node => {
            if (fresh.has(node.id) && node.seedLayout) {
                if (!node.parent) Object.assign(node, this.galaxies.get(node.id).home);
                else {
                    if (node.role === "astronaut") {
                        const anchor = node.clusterAnchor;
                        if (Math.hypot(node.parent.x-anchor.x,node.parent.y-anchor.y)>anchor.clusterRadius*.55)
                            node.orbitAngle = Math.atan2(anchor.y-node.parent.y,anchor.x-node.parent.x);
                    }
                    node.x = node.parent.x + Math.cos(node.orbitAngle) * node.orbitRadius;
                    node.y = node.parent.y + Math.sin(node.orbitAngle) * node.orbitRadius; }
            }
            node.lastX = node.x; node.lastY = node.y;
        });
        this.linkForce.links(connections.filter(link => link.kind !== "hierarchy" && next.has(link.from) && next.has(link.to))
            .map(({ from, to }) => ({ source: from, target: to })));
        this.simulation.alphaTarget(this.dragging.size ? .1 : 0); this.reheat(.55);
    }
    buildSystems() {
        this.children = new Map([...this.particles.keys()].map(id => [id, []]));
        this.particles.forEach(node => {
            const parent = this.particles.get(node.parentId);
            node.parent = parent && parent !== node ? parent : null;
            if (node.parent) this.children.get(node.parent.id).push(node);
        });
        const previousGalaxies = this.galaxies;
        this.galaxies = new Map(); this.systems = new Map(); this.ordered = [];
        const queue = [...this.particles.values()].filter(node => !node.parent), visited = new Set();
        const astronautClusters = new Map();
        for (let i = 0; i < queue.length; i++) {
            const node = queue[i];
            if (visited.has(node.id)) continue;
            visited.add(node.id); this.ordered.push(node);
            node.galaxyId = node.parent ? node.parent.galaxyId : node.id;
            node.systemId = node.depth === 1 ? node.id : node.parent?.systemId || null;
            if (!node.parent) this.galaxies.set(node.id, { ...previousGalaxies.get(node.id), id: node.id, root: node, systems: [] });
            if (node.depth === 1) {
                const system = { id: node.id, root: node, members: [] };
                this.systems.set(node.id, system); this.galaxies.get(node.galaxyId).systems.push(system);
            }
            if (node.systemId) this.systems.get(node.systemId).members.push(node);
            node.clusterAnchor = node.role === "astronaut" ? (node.parent?.clusterAnchor || node.parent) : null;
            if (node.clusterAnchor) {
                const cluster = astronautClusters.get(node.clusterAnchor.id) || [];
                cluster.push(node); astronautClusters.set(node.clusterAnchor.id, cluster);
            }
            queue.push(...this.children.get(node.id));
        }
        this.ordered.forEach(node => { node.clusterRadius = 0; });
        astronautClusters.forEach((members, id) => {
            // Count, never depth: many figures need area, but a deep chain must
            // not accumulate another full orbital envelope at every level.
            this.particles.get(id).clusterRadius = 54 + Math.sqrt(members.length) * 18;
        });
        [...this.ordered].reverse().forEach(parent => {
            const children = this.children.get(parent.id), largest = Math.max(0, ...children.map(child => child.envelope));
            if (parent.depth >= 4) {
                const phase = this.floatAngleFor(parent.id);
                children.forEach((child, index) => {
                    const clearance = parent.radius + child.radius + (parent.role === "astronaut" ? 22 : 26);
                    child.orbitRadius = clearance + 9 * Math.sqrt(index);
                    child.orbitAngle = phase + index * 2.39996323;
                });
                parent.childOrbit = 0; // Compact floating clusters have no orbit guide.
                parent.envelope = parent.role === "satellite" ? Math.max(parent.radius + 14, parent.clusterRadius + 14) : parent.radius + 28;
                return;
            }
            // Size the local band from direct siblings, with a bounded allowance
            // for their branches. A deep chain must not recursively inflate it.
            const local = Math.max(0, ...children.map(child => child.radius +
                Math.min(parent.depth === 1 ? 28 : 14, Math.max(0, child.envelope - child.radius) * .18)));
            const clearance = parent.depth === 1 ? 66 : parent.depth === 2 ? 56 : 38;
            const minimum = parent.radius + local + clearance;
            const spacing = children.length > 1 ? (local + 26) * (parent.depth === 1 ? 1.35 : 1.15) / Math.sin(Math.PI / children.length) : 0;
            parent.childOrbit = children.length ? Math.max(minimum, spacing) : 0;
            parent.envelope = children.length ? parent.childOrbit + largest + 12 : parent.radius + 14;
            const phase = this.angleFor(parent.id);
            children.forEach((child, index) => {
                child.orbitRadius = parent.childOrbit; child.orbitAngle = phase + index * Math.PI * 2 / children.length;
            });
            if (parent.depth === 0) {
                // A filled local region, rather than a rigid Sun orbit or a grid.
                children.forEach((child, index) => {
                    child.orbitRadius = children.length === 1 ? 0 : (largest * 2 + 48) * Math.sqrt(index);
                    child.orbitAngle = phase + index * 2.39996323;
                });
                parent.childOrbit = 0;
                parent.envelope = Math.max(120, ...children.map(child => child.orbitRadius + child.envelope + 40));
            }
        });
        const regions = [...this.galaxies.values()];
        const largest = Math.max(120, ...regions.map(region => region.root.envelope));
        regions.forEach((region, index) => {
            region.index = index; region.radius = region.root.envelope;
            region.home ||= region.root.seedLayout ? {
                x: this.origin.x + Math.cos(index * 2.39996323) * (largest * 2.15 + 80) * Math.sqrt(index),
                y: this.origin.y + Math.sin(index * 2.39996323) * (largest * 2.15 + 80) * Math.sqrt(index)
            } : { x: region.root.x, y: region.root.y };
            region.systems.forEach((system, i) => { system.index = i; system.radius = system.root.envelope; });
            region.collision = d3.forceCollide(system => system.radius + 24).strength(.7).iterations(3);
            region.collision.initialize(region.systems, this.simulation.randomSource());
        });
        this.galaxyCollision.initialize(regions, this.simulation.randomSource());
        this.systems.forEach(system => {
            system.repulsion = d3.forceManyBody().strength(node => -node.radius * (node.role === "astronaut" ? .35 : 1.1))
                .distanceMin(this.baseNodeRadius).distanceMax(system.radius * 1.3);
            system.repulsion.initialize(system.members, this.simulation.randomSource());
        });
        // Galaxy regions overlap their own content by design; never body-collide them.
        this.collisionForce.initialize([...this.particles.values()].filter(node => node.depth > 0), this.simulation.randomSource());
    }
    angleFor(id) {
        const hash = [...id].reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 0);
        return hash / 4294967296 * Math.PI * 2;
    }
    floatAngleFor(id) {
        let hash=2166136261;
        for(const char of id) hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
        hash=Math.imul(hash^(hash>>>16),2246822507)>>>0;
        return hash/4294967296*Math.PI*2;
    }
    setViewport(bounds, nodeRadius) {
        this.bounds = bounds; this.baseNodeRadius = nodeRadius;
        this.particles.forEach(node => { node.radius = node.depth === 0 ? 0 : nodeRadius * node.sizeScale; });
        this.collisionForce.radius(node => node.radius + (node.role === "astronaut" ? 10 : 12));
        if (this.particles.size) this.buildSystems(); this.reheat(.3);
    }
    followParents() {
        this.ordered.forEach(node => {
            let dx = node.x - node.lastX || 0, dy = node.y - node.lastY || 0;
            if (node.parent && node.fx == null) {
                node.x += node.parent.travelX; node.y += node.parent.travelY;
                dx += node.parent.travelX; dy += node.parent.travelY;
            }
            node.travelX = dx; node.travelY = dy; node.lastX = node.x; node.lastY = node.y;
        });
    }
    arrangeRegions(alpha) {
        const prepare = proxy => { const node = proxy.root;
            proxy.x = node.x; proxy.y = node.y; proxy.vx = proxy.vy = 0; proxy.fx = node.fx; proxy.fy = node.fy; };
        this.galaxies.forEach(prepare); this.galaxyCollision(alpha);
        this.galaxies.forEach(region => {
            const root = region.root;
            if (root.fx == null) {
                root.vx += region.vx + (region.home.x - root.x) * .018 * alpha;
                root.vy += region.vy + (region.home.y - root.y) * .018 * alpha;
            }
            region.systems.forEach(prepare); region.collision(alpha);
            region.systems.forEach(system => {
                if (system.root.fx == null) { system.root.vx += system.vx; system.root.vy += system.vy; }
            });
        });
    }
    attractToOrbits(alpha) {
        let returning = false;
        this.floatPhase = (this.floatPhase || 0) + .025;
        this.ordered.forEach(child => {
            if (!child.parent || child.fx != null) return;
            const dx = child.x - child.parent.x, dy = child.y - child.parent.y;
            const distance = Math.hypot(dx, dy) || .001;
            const influence = child.placement?.parentId === child.parentId ? child.placement : null;
            // Release chooses the preferred angle AND radius. The default band
            // only seeds an untouched body and sizes its adaptive safety range.
            const range = this.orbitalRange(child);
            const targetRadius = influence ? Math.max(range.min, Math.min(range.max, influence.radius)) : child.orbitRadius;
            const astronaut = child.role === "astronaut";
            const slack = astronaut ? Math.max(8, targetRadius * .18) : Math.max(12, targetRadius * .12);
            const error = distance - targetRadius;
            const outside = Math.sign(error) * Math.max(0, Math.abs(error) - slack);
            const strength = astronaut ? .045 : child.depth === 1 ? .025 : child.depth === 2 ? .1 : .14;
            const pull = Math.max(-5, Math.min(5, outside * strength)) * alpha;
            child.vx -= dx / distance * pull; child.vy -= dy / distance * pull;
            // Distant drops need time to return after the ordinary cooling period.
            // A smooth, capped local pull sustains only that return; active drags
            // skip it, and release itself adds no velocity/heat.
            const excess = Math.max(0, distance - range.max - slack);
            if (excess > 1) {
                if (excess > 12) returning = true;
                const containment = Math.min(4, excess * .008);
                child.vx -= dx / distance * containment; child.vy -= dy / distance * containment;
            }
            const targetAngle = influence?.angle ?? child.orbitAngle;
            const delta = Math.atan2(Math.sin(targetAngle - Math.atan2(dy, dx)), Math.cos(targetAngle - Math.atan2(dy, dx)));
            const angular = astronaut ? .012 : child.depth === 1 ? .012 : child.depth === 2 ? .025 : .04;
            const tangent = delta * Math.min(targetRadius, 80) * angular * alpha;
            child.vx -= dy / distance * tangent; child.vy += dx / distance * tangent;
            if (astronaut) {
                const phase = this.floatPhase + this.angleFor(child.id);
                child.vx += Math.sin(phase) * .045 * alpha;
                child.vy += Math.cos(phase * .7) * .045 * alpha;
                // A soft outer boundary around the Satellite branch prevents
                // repeated deep nesting from walking away from the local system.
                const anchor = child.clusterAnchor, cx = child.x-anchor.x, cy = child.y-anchor.y;
                const distance = Math.hypot(cx,cy) || 1, excess = Math.max(0,distance-anchor.clusterRadius);
                if (excess>Math.max(32,anchor.clusterRadius*.25)) returning=true;
                const containment = Math.min(3,excess*.006);
                child.vx -= cx/distance*containment; child.vy -= cy/distance*containment;
            }
        });
        if (returning) this.simulation.alpha(Math.max(this.simulation.alpha(), .06));
    }
    orbitalRange(node) {
        // Suns retain the existing Galaxy packing allowance. Local families use
        // their sibling-sized band, with a body-collision-safe inner boundary.
        if (node.depth === 1) return { min: 0, max: node.orbitRadius + Math.max(60, node.envelope * .25) };
        if (node.role === "astronaut") {
            const min = (node.parent?.radius || 0) + node.radius + (node.parent?.role === "astronaut" ? 22 : 26);
            const siblings = this.children.get(node.parentId)?.length || 1;
            return { min, max: Math.max(min+20, 62+Math.sqrt(siblings)*12) };
        }
        const min = (node.parent?.radius || 0) + node.radius + 24;
        const factor = node.depth <= 3 ? 2.4 : 1.9;
        return { min, max: Math.max(min + 24, node.orbitRadius * factor) };
    }
    preferredLimit(node) { return this.orbitalRange(node).max; }
    separateSiblings(alpha) {
        this.children.forEach((siblings, parentId) => {
            if (siblings.length < 2 || this.particles.get(parentId).depth === 0) return;
            const parent = this.particles.get(parentId), px = parent.x + parent.vx, py = parent.y + parent.vy;
            siblings.forEach((a, index) => {
                for (let j = index + 1; j < siblings.length; j++) {
                    const b = siblings[j], ax = a.x + a.vx - px, ay = a.y + a.vy - py,
                        bx = b.x + b.vx - px, by = b.y + b.vy - py;
                    if (a.role === "astronaut" && b.role === "astronaut") {
                        let dx = bx-ax, dy = by-ay, distance = Math.hypot(dx,dy);
                        const clearance = a.radius+b.radius+24;
                        if (distance>=clearance) continue;
                        if (distance<.001) { const angle=this.angleFor(`${a.id}:${b.id}`);dx=Math.cos(angle);dy=Math.sin(angle);distance=1; }
                        const am=a.fx!=null?0:1, bm=b.fx!=null?0:1, total=am+bm;
                        if (!total) continue;
                        const impulse=Math.min(2,(clearance-distance)*.06)*alpha;
                        a.vx-=dx/distance*impulse*am/total;a.vy-=dy/distance*impulse*am/total;
                        b.vx+=dx/distance*impulse*bm/total;b.vy+=dy/distance*impulse*bm/total;
                        continue;
                    }
                    const ar = Math.hypot(ax, ay), br = Math.hypot(bx, by);
                    const clearance = (a.radius + b.radius + 24) * (a.depth === 2 ? 1.35 : 1.15), radialGap = Math.abs(ar - br);
                    if (radialGap >= clearance) continue;
                    const aa = Math.atan2(ay, ax), ba = Math.atan2(by, bx), delta = Math.atan2(Math.sin(ba - aa), Math.cos(ba - aa));
                    const deficit = Math.sqrt(clearance ** 2 - radialGap ** 2) - 2 * Math.min(ar, br) * Math.sin(Math.abs(delta) / 2);
                    if (deficit <= 0) continue;
                    const am = a.fx != null ? 0 : 1, bm = b.fx != null ? 0 : 1, total = am + bm;
                    if (!total) continue;
                    const direction = Math.abs(delta) > .00001 ? Math.sign(delta) : a.id < b.id ? 1 : -1;
                    const impulse = Math.min(2, deficit * .06) * alpha;
                    a.vx += Math.sin(aa) * direction * impulse * am / total; a.vy -= Math.cos(aa) * direction * impulse * am / total;
                    b.vx -= Math.sin(ba) * direction * impulse * bm / total; b.vy += Math.cos(ba) * direction * impulse * bm / total;
                }
            });
        });
    }
    copyPlacement(placement) {
        if (Number.isFinite(placement?.angle) && Number.isFinite(placement?.radius)) return { parentId: placement.parentId, angle: placement.angle, radius: placement.radius };
        return null;
    }
    influenceFor(node) {
        if (!node.parent) return null;
        const range = this.orbitalRange(node);
        return { parentId: node.parentId, angle: Math.atan2(node.y - node.parent.y, node.x - node.parent.x),
            radius: Math.max(range.min, Math.min(range.max, Math.hypot(node.x - node.parent.x, node.y - node.parent.y))) };
    }
    releaseConstraint(node) {
        if (this.dragging.has(node.id)) return;
        node.fx = node.fy = null;
    }
    beginDrag(id) {
        const node = this.particles.get(id); if (!node) return;
        this.dragging.add(id); node.fx = node.x; node.fy = node.y; node.vx = node.vy = 0;
    }
    moveDrag(id, x, y) {
        const node = this.particles.get(id); if (!node || !Number.isFinite(x) || !Number.isFinite(y)) return;
        const dx = x - node.x, dy = y - node.y, queue = [...this.children.get(id)];
        for (let i = 0; i < queue.length; i++) {
            const child = queue[i]; if (child.fx != null) continue;
            child.x += dx; child.y += dy; child.lastX = child.x; child.lastY = child.y; queue.push(...this.children.get(child.id));
        }
        node.fx = node.x = node.lastX = x; node.fy = node.y = node.lastY = y;
        this.simulation.alphaTarget(.1); this.reheat(.22); this.onTick(this.particles);
    }
    endDrag(id, moved) {
        const node = this.particles.get(id); if (!node) return null;
        this.dragging.delete(id);
        if (moved) {
            node.placement = this.influenceFor(node);
            if (!node.parent) this.galaxies.get(id).home = { x: node.x, y: node.y };
        }
        this.releaseConstraint(node); this.simulation.alphaTarget(this.dragging.size ? .1 : 0);
        if (moved) this.reheat(this.simulation.alpha());
        return this.copyPlacement(node.placement);
    }
    reheat(alpha) {
        this.settled = false; this.simulation.alpha(Math.max(this.simulation.alpha(), alpha));
        if (!this.paused) this.simulation.restart();
    }
    pause() { this.paused = true; this.simulation.stop(); }
    resume() { this.paused = false; if (!this.settled) this.simulation.restart(); }
    setReducedMotion(reduce) { this.simulation.alphaDecay(reduce ? .12 : .032).velocityDecay(reduce ? .6 : .42); }
}
