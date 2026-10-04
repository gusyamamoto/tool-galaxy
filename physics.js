// Hierarchy is local physics. Only system centers participate in galaxy packing.
// Particles, orbital targets and system envelopes are disposable, never stored data.
class GalaxyPhysics {
    constructor({ onTick, onSettle, onPlacementChange = () => {} }) {
        Object.assign(this, { onTick, onSettle, onPlacementChange });
        this.particles = new Map();
        this.systems = new Map();
        this.children = new Map();
        this.dragging = new Set();
        this.bounds = { left: 60, right: 900, top: 140, bottom: 700 };
        this.baseNodeRadius = 23;
        this.paused = false;
        this.settled = true;
        this.origin = null;
        this.collisionForce = d3.forceCollide(node => node.radius + 12).strength(1).iterations(4);
        // Semantic links are separate from ancestry. Cross-system links are visual
        // only: they cannot drag unrelated systems across the galaxy.
        this.linkForce = d3.forceLink().id(node => node.id).distance(link =>
            link.source.radius + link.target.radius + 80).strength(link =>
            link.source.systemId === link.target.systemId ? 0.015 : 0);
        this.systemCollision = d3.forceCollide(system => system.radius + 32).strength(0.8).iterations(3);
        this.simulation = d3.forceSimulation([]).stop()
            .alphaMin(0.002).alphaDecay(0.032).velocityDecay(0.42)
            .force("follow", () => this.followParents())
            .force("galaxy", alpha => this.arrangeSystems(alpha))
            .force("orbits", alpha => this.attractToOrbits(alpha))
            .force("relationships", this.linkForce)
            .force("local", alpha => this.systems.forEach(system => system.repulsion(alpha)))
            .force("placement", alpha => this.attractToPreferredPositions(alpha))
            .force("siblings", alpha => this.separateSiblings(alpha))
            .force("collision", this.collisionForce)
            .on("tick", () => this.onTick(this.particles))
            .on("end", () => { this.settled = true; this.onSettle(); });
    }

    setGraph(entries, connections, placements = null) {
        const next = new Map();
        const fresh = new Set();
        entries.forEach(entry => {
            let node = this.particles.get(entry.id);
            if (!node) {
                fresh.add(entry.id);
                node = { id: entry.id, x: entry.x, y: entry.y, vx: 0, vy: 0 };
            }
            node.sizeScale = Number.isFinite(entry.sizeScale) && entry.sizeScale > 0 ? entry.sizeScale : 1;
            node.radius = this.baseNodeRadius * node.sizeScale;
            node.role = entry.role || "entry";
            node.parentId = entry.parentId || null;
            if (placements !== null) node.placement = this.copyPlacement(placements.get(entry.id));
            this.applyPin(node);
            next.set(node.id, node);
        });
        this.particles = next;
        this.dragging = new Set([...this.dragging].filter(id => next.has(id)));
        this.origin ||= { x: (this.bounds.left + this.bounds.right) / 2, y: (this.bounds.top + this.bounds.bottom) / 2 };
        this.linkForce.links([]);
        this.simulation.nodes([...next.values()]);
        this.buildSystems();
        // New automatic bodies start near their hierarchy targets. Saved manual
        // world coordinates, including legacy pins, are never reseeded.
        this.ordered.forEach(node => {
            if (fresh.has(node.id) && !node.placement && node.parent) {
                node.x = node.parent.x + Math.cos(node.orbitAngle) * node.orbitRadius;
                node.y = node.parent.y + Math.sin(node.orbitAngle) * node.orbitRadius;
            }
            node.lastX = node.x;
            node.lastY = node.y;
        });
        this.linkForce.links(connections.filter(link => link.kind !== "hierarchy")
            .map(({ from, to }) => ({ source: from, target: to })));
        this.simulation.alphaTarget(this.dragging.size ? 0.1 : 0);
        this.reheat(0.55);
    }

    buildSystems() {
        this.children = new Map([...this.particles.keys()].map(id => [id, []]));
        this.particles.forEach(node => {
            const parent = this.particles.get(node.parentId);
            // The model validates ancestry; also defend against malformed inputs.
            node.parent = parent && parent !== node &&
                ((node.role === "entry" && parent.role === "subcategory") ||
                 (node.role === "subcategory" && parent.role === "category")) ? parent : null;
            if (node.parent) this.children.get(node.parent.id).push(node);
        });
        const previous = this.systems;
        this.systems = new Map();
        this.ordered = [];
        const visit = (node, system) => {
            node.systemId = system.id;
            system.members.push(node);
            this.ordered.push(node);
            this.children.get(node.id).forEach(child => visit(child, system));
        };
        this.particles.forEach(root => {
            if (root.parent) return;
            const system = { ...previous.get(root.id), id: root.id, root, members: [] };
            this.systems.set(root.id, system);
            visit(root, system);
        });
        // Branch footprints are calculated bottom-up; then allocate sibling bands.
        [...this.ordered].reverse().forEach(parent => {
            const children = this.children.get(parent.id);
            const largest = Math.max(0, ...children.map(child => child.envelope));
            const minimum = parent.radius + largest + (parent.role === "category" ? 25 : 24);
            const spacing = children.length > 1 ? (largest + 12) / Math.sin(Math.PI / children.length) : 0;
            parent.childOrbit = children.length ? Math.max(minimum, spacing) : 0;
            parent.envelope = children.length ? parent.childOrbit + largest + 12 : parent.radius + 14;
            const phase = this.angleFor(parent.id);
            children.forEach((child, index) => {
                child.orbitRadius = parent.childOrbit;
                child.orbitAngle = phase + index * Math.PI * 2 / children.length;
            });
        });
        const systems = [...this.systems.values()];
        const largestSystem = Math.max(this.baseNodeRadius * 2, ...systems.map(system => system.root.envelope));
        const spacing = largestSystem * 1.48 + 45;
        systems.forEach((system, index) => {
            system.index = index; // D3 collision indexes proxy radii separately from bodies.
            system.radius = system.root.envelope;
            // A filled sunflower distribution gives the galaxy an occupied center.
            // Keep existing homes across metadata edits and insertion.
            system.home ||= { x: this.origin.x + Math.cos(index * 2.39996323) * spacing * Math.sqrt(index),
                y: this.origin.y + Math.sin(index * 2.39996323) * spacing * Math.sqrt(index) };
            system.repulsion = d3.forceManyBody().strength(node => -node.radius * 1.1)
                .distanceMin(this.baseNodeRadius).distanceMax(system.radius * 1.3);
            system.repulsion.initialize(system.members, this.simulation.randomSource());
        });
        this.galaxyRadius = Math.max(350, spacing * Math.sqrt(Math.max(1, systems.length)) + largestSystem);
        this.systemCollision.initialize(systems, this.simulation.randomSource());
    }

    angleFor(id) {
        const hash = [...id].reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 0);
        return hash / 4294967296 * Math.PI * 2;
    }

    setViewport(bounds, nodeRadius) {
        this.bounds = bounds; // Screen-space usable area, never world-space walls.
        this.baseNodeRadius = nodeRadius;
        this.particles.forEach(node => { node.radius = nodeRadius * node.sizeScale; });
        this.collisionForce.radius(node => node.radius + 12);
        if (this.particles.size) this.buildSystems();
        this.reheat(0.3);
    }

    followParents() {
        // Carry parent translation through its subtree without summing child
        // velocities into the Sun. Local offsets can still settle.
        this.ordered.forEach(node => {
            let dx = node.x - node.lastX || 0;
            let dy = node.y - node.lastY || 0;
            if (node.parent && !node.placement && node.fx == null) {
                node.x += node.parent.travelX;
                node.y += node.parent.travelY;
                dx += node.parent.travelX;
                dy += node.parent.travelY;
            }
            node.travelX = dx;
            node.travelY = dy;
            node.lastX = node.x;
            node.lastY = node.y;
        });
    }

    arrangeSystems(alpha) {
        this.systems.forEach(system => {
            const root = system.root;
            system.x = root.x;
            system.y = root.y;
            system.vx = system.vy = 0;
            system.fx = root.fx;
            system.fy = root.fy;
        });
        this.systemCollision(alpha);
        this.systems.forEach(system => {
            const root = system.root;
            if (root.fx != null) return;
            const mobility = root.placement ? 0.12 : 1;
            root.vx += system.vx * mobility;
            root.vy += system.vy * mobility;
            if (root.placement) return; // Manual coordinates are intentional.
            root.vx += (system.home.x - root.x) * 0.028 * alpha;
            root.vy += (system.home.y - root.y) * 0.028 * alpha;
            const dx = root.x - this.origin.x;
            const dy = root.y - this.origin.y;
            const distance = Math.hypot(dx, dy);
            if (distance > this.galaxyRadius) {
                const strength = (distance - this.galaxyRadius) / distance * 0.08 * alpha;
                root.vx -= dx * strength;
                root.vy -= dy * strength;
            }
        });
    }

    attractToOrbits(alpha) {
        this.ordered.forEach(child => {
            if (!child.parent || child.fx != null) return;
            const dx = child.x - child.parent.x;
            const dy = child.y - child.parent.y;
            const distance = Math.hypot(dx, dy) || 0.001;
            // A manually stretched branch has a tiny residual pull, no rigid spring.
            const manual = !!child.placement;
            // Radial and angular pulls add together. Keep both gentle so a
            // displaced branch accelerates gradually instead of snapping back.
            const radial = (distance - child.orbitRadius) / distance * alpha *
                (manual ? 0.001 : child.role === "entry" ? 0.17 : 0.1);
            child.vx -= dx * radial;
            child.vy -= dy * radial;
            if (!manual) {
                const angleStrength = alpha * (child.role === "entry" ? 0.06 : 0.025);
                child.vx += (Math.cos(child.orbitAngle) * child.orbitRadius - dx) * angleStrength;
                child.vy += (Math.sin(child.orbitAngle) * child.orbitRadius - dy) * angleStrength;
            }
        });
    }

    separateSiblings(alpha) {
        // Tangential clearance is local to one parent. It opens space before
        // body collision is needed, without enlarging system envelopes/homes.
        this.children.forEach((siblings, parentId) => {
            if (siblings.length < 2) return;
            const parent = this.particles.get(parentId);
            const px = parent.x + parent.vx, py = parent.y + parent.vy;
            siblings.forEach((a, index) => {
                for (let j = index + 1; j < siblings.length; j++) {
                    const b = siblings[j];
                    const ax = a.x + a.vx - px, ay = a.y + a.vy - py;
                    const bx = b.x + b.vx - px, by = b.y + b.vy - py;
                    const ar = Math.hypot(ax, ay), br = Math.hypot(bx, by);
                    const clearance = (a.radius + b.radius + 24) * (a.role === "subcategory" ? 1.35 : 1.15);
                    const radialGap = Math.abs(ar - br);
                    if (radialGap >= clearance) continue; // Separate radial bands are already safe.
                    const aa = Math.atan2(ay, ax), ba = Math.atan2(by, bx);
                    const delta = Math.atan2(Math.sin(ba - aa), Math.cos(ba - aa));
                    const angularDistance = 2 * Math.min(ar, br) * Math.sin(Math.abs(delta) / 2);
                    const deficit = Math.sqrt(clearance ** 2 - radialGap ** 2) - angularDistance;
                    if (deficit <= 0) continue;
                    const mobility = node => node.fx != null ? 0 : node.placement ? 0.35 : 1;
                    const am = mobility(a), bm = mobility(b), total = am + bm;
                    if (!total) continue;
                    const direction = Math.abs(delta) > 0.00001 ? Math.sign(delta) : a.id < b.id ? 1 : -1;
                    const impulse = Math.min(2, deficit * 0.06) * alpha;
                    a.vx += Math.sin(aa) * direction * impulse * am / total;
                    a.vy -= Math.cos(aa) * direction * impulse * am / total;
                    b.vx -= Math.sin(ba) * direction * impulse * bm / total;
                    b.vy += Math.cos(ba) * direction * impulse * bm / total;
                }
            });
        });
    }

    copyPlacement(placement) {
        return placement && Number.isFinite(placement.x) && Number.isFinite(placement.y) ?
            { x: placement.x, y: placement.y, pinned: placement.pinned === true } : null;
    }

    applyPin(node) {
        if (this.dragging.has(node.id)) return;
        if (node.placement?.pinned) {
            node.fx = node.x = node.placement.x;
            node.fy = node.y = node.placement.y;
            node.vx = node.vy = 0;
        } else node.fx = node.fy = null;
    }

    setPlacement(id, placement) {
        const node = this.particles.get(id);
        if (!node) return null;
        node.placement = this.copyPlacement(placement);
        this.applyPin(node);
        this.reheat(0.28);
        this.onTick(this.particles);
        return this.copyPlacement(node.placement);
    }

    attractToPreferredPositions(alpha) {
        this.particles.forEach(node => {
            if (!node.placement || node.fx != null) return;
            node.vx += (node.placement.x - node.x) * 0.15 * alpha;
            node.vy += (node.placement.y - node.y) * 0.15 * alpha;
        });
    }

    beginDrag(id) {
        const node = this.particles.get(id);
        this.dragging.add(id);
        node.fx = node.x;
        node.fy = node.y;
        node.vx = node.vy = 0;
    }

    moveDrag(id, x, y) {
        const node = this.particles.get(id);
        if (!node || !Number.isFinite(x) || !Number.isFinite(y)) return;
        const dx = x - node.x;
        const dy = y - node.y;
        // Sun dragging carries the system; Planet dragging carries its Moons.
        // Soft descendants travel with an intentional parent drag. Exact pins
        // remain in world coordinates, including a pinned Planet's branch.
        const carry = parent => this.children.get(parent.id).forEach(child => {
            if (child.fx != null || child.placement?.pinned) return;
            child.x += dx;
            child.y += dy;
            child.lastX = child.x;
            child.lastY = child.y;
            if (child.placement) {
                child.placement.x += dx;
                child.placement.y += dy;
                this.onPlacementChange(child.id, this.copyPlacement(child.placement));
            }
            carry(child);
        });
        carry(node);
        node.fx = node.x = node.lastX = x;
        node.fy = node.y = node.lastY = y;
        this.simulation.alphaTarget(0.1);
        this.reheat(0.22);
        this.onTick(this.particles);
    }

    endDrag(id, moved) {
        const node = this.particles.get(id);
        this.dragging.delete(id);
        if (moved) node.placement = { x: node.x, y: node.y, pinned: node.placement?.pinned === true };
        this.applyPin(node);
        this.simulation.alphaTarget(this.dragging.size ? 0.1 : 0);
        // Movement already reheated the simulation. Release starts cooling at
        // its current energy, preserving velocity without a restorative kick.
        if (moved) this.reheat(this.simulation.alpha());
        return this.copyPlacement(node.placement);
    }

    reheat(alpha) {
        this.settled = false;
        this.simulation.alpha(Math.max(this.simulation.alpha(), alpha));
        if (!this.paused) this.simulation.restart();
    }

    pause() { this.paused = true; this.simulation.stop(); }
    resume() { this.paused = false; if (!this.settled) this.simulation.restart(); }
    setReducedMotion(reduce) {
        this.simulation.alphaDecay(reduce ? 0.12 : 0.032).velocityDecay(reduce ? 0.6 : 0.42);
    }
}
