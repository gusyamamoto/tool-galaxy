// D3 owns temporary particles; tool records and stored connections stay plain data.
class GalaxyPhysics {
    constructor({ onTick, onSettle }) {
        this.onTick = onTick;
        this.onSettle = onSettle;
        this.particles = new Map();
        this.dragging = new Set();
        this.bounds = { left: 60, right: 900, top: 140, bottom: 700 };
        this.paused = false;
        this.settled = true;

        this.linkForce = d3.forceLink().id((node) => node.id)
            .distance(180).strength(0.18).iterations(2);
        this.collisionForce = d3.forceCollide(60).strength(1).iterations(6);
        this.simulation = d3.forceSimulation([]).stop()
            .alphaMin(0.002).alphaDecay(0.035).velocityDecay(0.32)
            .force("links", this.linkForce)
            .force("repulsion", d3.forceManyBody().strength(-650).distanceMin(40).distanceMax(650))
            .force("collision", this.collisionForce)
            .force("x", d3.forceX().strength(0.012))
            .force("y", d3.forceY().strength(0.018))
            .force("viewport", () => this.constrainToViewport())
            .on("tick", () => this.onTick(this.particles))
            .on("end", () => {
                this.settled = true;
                this.onSettle();
            });
    }

    setGraph(tools, connections) {
        const nextParticles = new Map();
        tools.forEach((tool) => {
            nextParticles.set(tool.id, this.particles.get(tool.id) || {
                id: tool.id, x: tool.x, y: tool.y, vx: 0, vy: 0
            });
        });
        this.particles = nextParticles;

        // D3 replaces link endpoint IDs with objects. Give it disposable copies.
        this.linkForce.links([]);
        this.simulation.nodes([...this.particles.values()]);
        this.linkForce.links(connections.map(({ from, to }) => ({ source: from, target: to })));
        this.reheat(0.55);
    }

    setViewport(bounds, nodeRadius) {
        this.bounds = bounds;
        this.collisionForce.radius(nodeRadius + 10);
        this.simulation.force("x").x((bounds.left + bounds.right) / 2);
        this.simulation.force("y").y((bounds.top + bounds.bottom) / 2);
        this.particles.forEach((node) => {
            if (node.fx != null) {
                const point = this.clampPosition(node.fx, node.fy);
                node.fx = node.x = point.x;
                node.fy = node.y = point.y;
            }
        });
        this.reheat(0.3);
    }

    clampPosition(x, y) {
        return {
            x: Math.max(this.bounds.left, Math.min(this.bounds.right, x)),
            y: Math.max(this.bounds.top, Math.min(this.bounds.bottom, y))
        };
    }

    // Apply a screen constraint after the other forces, before D3 integrates.
    constrainToViewport() {
        const retention = 1 - this.simulation.velocityDecay();
        this.particles.forEach((node) => {
            if (node.fx != null) {
                return;
            }
            const nextX = node.x + node.vx * retention;
            const nextY = node.y + node.vy * retention;
            const point = this.clampPosition(nextX, nextY);
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
        const point = this.clampPosition(x, y);
        node.fx = node.x = point.x;
        node.fy = node.y = point.y;
        this.simulation.alphaTarget(0.16);
        this.reheat(0.32);
        this.onTick(this.particles);
    }

    endDrag(id, moved) {
        const node = this.particles.get(id);
        node.fx = node.fy = null;
        this.dragging.delete(id);
        this.simulation.alphaTarget(this.dragging.size ? 0.16 : 0);
        if (moved) {
            this.reheat(0.35);
        }
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
            .velocityDecay(reduce ? 0.6 : 0.32);
    }
}
