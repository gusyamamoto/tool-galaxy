// D3 owns temporary particles; entry records and stored connections stay plain data.
class GalaxyPhysics {
    constructor({ onTick, onSettle }) {
        this.onTick = onTick;
        this.onSettle = onSettle;
        this.particles = new Map();
        this.dragging = new Set();
        this.bounds = { left: 60, right: 900, top: 140, bottom: 700 };
        this.baseNodeRadius = 52;
        this.paused = false;
        this.settled = true;

        this.linkForce = d3.forceLink().id((node) => node.id)
            .distance((link) => this.linkDistance(link))
            .strength((link) => this.linkStrength(link)).iterations(2);
        // Leave a little breathing room for the labels below each body.
        this.collisionForce = d3.forceCollide((node) => node.radius + 18).strength(1).iterations(6);
        this.simulation = d3.forceSimulation([]).stop()
            .alphaMin(0.002).alphaDecay(0.035).velocityDecay(0.38)
            .force("links", this.linkForce)
            .force("repulsion", d3.forceManyBody().strength((node) =>
                node.role === "category" ? -1800 : node.role === "subcategory" ? -650 : -350
            ).distanceMin(40).distanceMax(900))
            .force("systems", (alpha) => this.separateSystems(alpha))
            .force("collision", this.collisionForce)
            .force("hierarchy", (alpha) => this.clusterChildren(alpha))
            .force("placement", (alpha) => this.attractToPreferredPositions(alpha))
            .force("x", d3.forceX().strength(0.012))
            .force("y", d3.forceY().strength(0.018))
            .force("viewport", () => this.constrainToViewport())
            .on("tick", () => this.onTick(this.particles))
            .on("end", () => {
                this.settled = true;
                this.onSettle();
            });
    }

    setGraph(entries, connections, placements = null) {
        const nextParticles = new Map();
        entries.forEach((entry) => {
            const particle = this.particles.get(entry.id) || {
                id: entry.id, x: entry.x, y: entry.y, vx: 0, vy: 0
            };
            particle.sizeScale = Number.isFinite(entry.sizeScale) && entry.sizeScale > 0 ? entry.sizeScale : 1;
            particle.radius = this.baseNodeRadius * particle.sizeScale;
            particle.role = entry.role || "entry";
            particle.parentId = entry.parentId || null;
            if (placements !== null) particle.placement = this.copyPlacement(placements.get(entry.id));
            this.applyPin(particle);
            nextParticles.set(entry.id, particle);
        });
        this.particles = nextParticles;
        this.dragging = new Set([...this.dragging].filter((id) => this.particles.has(id)));
        this.simulation.alphaTarget(this.dragging.size ? 0.16 : 0);

        // D3 replaces link endpoint IDs with objects. Give it disposable copies.
        this.linkForce.links([]);
        this.simulation.nodes([...this.particles.values()]);
        this.linkForce.links(connections.map(({ from, to, kind }) => ({ source: from, target: to, kind })));
        this.refreshPlacementForces();
        this.reheat(0.55);
    }

    setViewport(bounds, nodeRadius) {
        this.bounds = bounds;
        this.baseNodeRadius = nodeRadius;
        this.particles.forEach((node) => { node.radius = nodeRadius * node.sizeScale; });
        this.collisionForce.radius((node) => node.radius + 18);
        this.linkForce.distance((link) => this.linkDistance(link));
        this.simulation.force("x").x((bounds.left + bounds.right) / 2);
        this.simulation.force("y").y((bounds.top + bounds.bottom) / 2);
        // A resize changes automatic layout bounds, never a saved world-space pin.
        this.reheat(0.3);
    }

    linkDistance(link) {
        const gap = link.kind === "hierarchy" ? (link.target.role === "entry" ? 46 : 70) : 80;
        return link.source.radius + link.target.radius + gap;
    }

    linkStrength(link) {
        // Children still follow an arranged parent, but must not overpower its anchor.
        // A child's own preference makes its hierarchy link especially flexible.
        if (link.kind === "hierarchy") {
            if (link.target.placement) return 0.014;
            if (link.source.placement) return 0.14;
            return link.target.role === "entry" ? 0.36 : 0.18;
        }
        return link.source.placement || link.target.placement ? 0.008 : 0.08;
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
        } else {
            node.fx = node.fy = null;
        }
    }

    refreshPlacementForces() {
        // D3 caches strengths. Refresh them when placement mode changes, not every tick.
        this.linkForce.strength((link) => this.linkStrength(link));
        this.simulation.force("x").strength((node) => node.placement ? 0.001 : 0.012);
        this.simulation.force("y").strength((node) => node.placement ? 0.001 : 0.018);
    }

    setPlacement(id, placement) {
        const node = this.particles.get(id);
        if (!node) return null;
        node.placement = this.copyPlacement(placement);
        this.applyPin(node);
        this.refreshPlacementForces();
        this.reheat(0.28);
        this.onTick(this.particles);
        return this.copyPlacement(node.placement);
    }

    attractToPreferredPositions(alpha) {
        this.particles.forEach((node) => {
            if (!node.placement || node.fx != null) return;
            node.vx += (node.placement.x - node.x) * 0.2 * alpha;
            node.vy += (node.placement.y - node.y) * 0.2 * alpha;
        });
    }

    separateSystems(alpha) {
        const stars = [...this.particles.values()].filter((node) => node.role === "category");
        stars.forEach((star, index) => stars.slice(index + 1).forEach((other) => {
            const dx = other.x - star.x || 0.001;
            const dy = other.y - star.y;
            const distance = Math.hypot(dx, dy);
            const spacing = star.radius + other.radius + 220;
            if (distance >= spacing) return;
            const strength = (spacing - distance) / distance * alpha * 0.06;
            if (star.fx == null) { star.vx -= dx * strength; star.vy -= dy * strength; }
            if (other.fx == null) { other.vx += dx * strength; other.vy += dy * strength; }
        }));
    }

    // Soft gravity assists springs only when a child wanders far from its parent.
    // This changes velocity, never positions, fixed coordinates or stored ancestry.
    clusterChildren(alpha) {
        this.particles.forEach((child) => {
            const parent = this.particles.get(child.parentId);
            if (!parent) return;
            const dx = parent.x - child.x;
            const dy = parent.y - child.y;
            const distance = Math.hypot(dx, dy);
            const comfortableDistance = parent.radius + child.radius + (child.role === "entry" ? 70 : 100);
            if (distance <= comfortableDistance) return;
            const gravity = child.placement ? 0.0015 : 0.018;
            const strength = (distance - comfortableDistance) / distance * alpha * gravity;
            if (child.fx == null) {
                child.vx += dx * strength;
                child.vy += dy * strength;
            }
            if (parent.fx == null) {
                parent.vx -= dx * strength * 0.18;
                parent.vy -= dy * strength * 0.18;
            }
        });
    }

    clampPosition(x, y, radius = this.baseNodeRadius) {
        const inset = radius - this.baseNodeRadius;
        const left = this.bounds.left + inset;
        const right = Math.max(left, this.bounds.right - inset);
        const top = this.bounds.top + inset;
        const bottom = Math.max(top, this.bounds.bottom - inset);
        return {
            x: Math.max(left, Math.min(right, x)),
            y: Math.max(top, Math.min(bottom, y))
        };
    }

    hasPlacedAncestor(node) {
        const visited = new Set([node.id]);
        let parent = this.particles.get(node.parentId);
        while (parent && !visited.has(parent.id)) {
            if (parent.placement) return true;
            visited.add(parent.id);
            parent = this.particles.get(parent.parentId);
        }
        return false;
    }

    // Apply a screen constraint after the other forces, before D3 integrates.
    constrainToViewport() {
        const retention = 1 - this.simulation.velocityDecay();
        this.particles.forEach((node) => {
            if (node.fx != null || node.placement || this.hasPlacedAncestor(node)) {
                return;
            }
            const nextX = node.x + node.vx * retention;
            const nextY = node.y + node.vy * retention;
            const point = this.clampPosition(nextX, nextY, node.radius);
            if (point.x !== nextX) {
                node.x = point.x;
                node.vx = 0;
            }
            if (point.y !== nextY) {
                node.y = point.y;
                node.vy = 0;
            }
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
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        // Dragging uses world coordinates, including space reached by zooming/panning.
        node.fx = node.x = x;
        node.fy = node.y = y;
        this.simulation.alphaTarget(0.16);
        this.reheat(0.32);
        this.onTick(this.particles);
    }

    endDrag(id, moved) {
        const node = this.particles.get(id);
        this.dragging.delete(id);
        if (moved) node.placement = { x: node.x, y: node.y, pinned: node.placement?.pinned === true };
        this.applyPin(node);
        this.simulation.alphaTarget(this.dragging.size ? 0.16 : 0);
        if (moved) {
            this.refreshPlacementForces();
            this.reheat(0.28);
        }
        return this.copyPlacement(node.placement);
    }

    reheat(alpha) {
        this.settled = false;
        this.simulation.alpha(Math.max(this.simulation.alpha(), alpha));
        if (!this.paused) {
            this.simulation.restart();
        }
    }

    pause() {
        this.paused = true;
        this.simulation.stop();
    }

    resume() {
        this.paused = false;
        if (!this.settled) {
            this.simulation.restart();
        }
    }

    setReducedMotion(reduce) {
        this.simulation.alphaDecay(reduce ? 0.12 : 0.035)
            .velocityDecay(reduce ? 0.6 : 0.38);
    }
}
