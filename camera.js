// The camera transforms the view only. Physics and storage always use world coordinates.
class GraphCamera {
    constructor({ onChange, onRest = () => {}, requestFrame = (callback) => requestAnimationFrame(callback),
        cancelFrame = (id) => cancelAnimationFrame(id) }) {
        this.onChange = onChange;
        this.onRest = onRest;
        this.requestFrame = requestFrame;
        this.cancelFrame = cancelFrame;
        this.minScale = 0.08;
        this.maxScale = 2.4;
        this.view = { x: 0, y: 0, scale: 1 };
        this.target = { ...this.view };
        this.frame = null;
        this.lastTime = null;
        this.reducedMotion = false;
        this.travel = null;
    }

    screenToWorld(x, y) {
        return { x: (x - this.view.x) / this.view.scale, y: (y - this.view.y) / this.view.scale };
    }

    worldToScreen(x, y) {
        return { x: x * this.view.scale + this.view.x, y: y * this.view.scale + this.view.y };
    }

    zoomAt(x, y, factor) {
        if (this.travel) this.stopAnimation();
        const anchor = this.screenToWorld(x, y);
        const scale = Math.max(this.minScale, Math.min(this.maxScale, this.target.scale * factor));
        this.setView({ x: x - anchor.x * scale, y: y - anchor.y * scale, scale });
    }

    setView(view, animate = true) {
        if (this.travel) this.stopAnimation();
        this.target = { ...view, scale: Math.max(this.minScale, Math.min(this.maxScale, view.scale)) };
        if (!animate || this.reducedMotion) {
            const target = this.target;
            this.stopAnimation();
            this.target = target;
            this.view = { ...target };
            this.onChange(this.view);
            this.onRest();
        } else if (this.frame === null) {
            this.lastTime = null;
            this.frame = this.requestFrame((time) => this.tick(time));
        }
    }

    tick(time) {
        if (this.travel) { this.tickTravel(time); return; }
        const elapsed = this.lastTime === null ? 16 : Math.min(64, time - this.lastTime);
        this.lastTime = time;
        const blend = 1 - Math.exp(-elapsed / 55);
        for (const key of ["x", "y", "scale"]) {
            this.view[key] += (this.target[key] - this.view[key]) * blend;
        }
        const settled = Math.abs(this.target.scale - this.view.scale) < 0.0001 &&
            Math.hypot(this.target.x - this.view.x, this.target.y - this.view.y) < 0.05;
        if (settled) this.view = { ...this.target };
        this.onChange(this.view);
        this.frame = settled ? null : this.requestFrame((nextTime) => this.tick(nextTime));
        if (settled) this.onRest();
    }

    // Freeze the visible view before starting a drag, avoiding coordinate jumps.
    stopAnimation() {
        if (this.frame !== null) this.cancelFrame(this.frame);
        this.frame = null;
        this.lastTime = null;
        this.travel = null;
        this.target = { ...this.view };
    }

    panTo(x, y) {
        this.setView({ x, y, scale: this.view.scale }, false);
    }

    reset() {
        this.setView({ x: 0, y: 0, scale: 1 });
    }

    boundsView(bounds, viewport, { padding = 32, maxScale = 1 } = {}) {
        if (!bounds || ![bounds.left, bounds.right, bounds.top, bounds.bottom].every(Number.isFinite)) return;
        const width = Math.max(1, viewport.right - viewport.left - padding * 2);
        const height = Math.max(1, viewport.bottom - viewport.top - padding * 2);
        const scale = Math.min(maxScale, width / Math.max(1, bounds.right - bounds.left),
            height / Math.max(1, bounds.bottom - bounds.top));
        // Distant dragged bodies must also fit. Wheel zoom can return to this scale.
        this.minScale = Math.min(this.minScale, scale);
        return { x: (viewport.left + viewport.right) / 2 - (bounds.left + bounds.right) / 2 * scale,
            y: (viewport.top + viewport.bottom) / 2 - (bounds.top + bounds.bottom) / 2 * scale,
            scale };
    }

    fitBounds(bounds, viewport, options = {}) {
        const view = this.boundsView(bounds, viewport, options);
        if (view) this.setView(view, options.animate ?? true);
    }

    // Semantic navigation uses the same view, frame loop and completion callback.
    // Interpolate the world point at the usable viewport center, so zooming out
    // establishes the route rather than introducing an unrelated translation.
    travelTo(view, viewport, { crossGalaxy = false, differentSystem = false } = {}) {
        this.stopAnimation();
        if (this.reducedMotion) { this.setView(view, false); return; }
        this.target = { ...view, scale: Math.max(this.minScale, Math.min(this.maxScale, view.scale)) };
        const center = { x: (viewport.left + viewport.right) / 2, y: (viewport.top + viewport.bottom) / 2 };
        const start = this.screenToWorld(center.x, center.y);
        const end = { x: (center.x - this.target.x) / this.target.scale, y: (center.y - this.target.y) / this.target.scale };
        const width = Math.max(1, viewport.right - viewport.left), height = Math.max(1, viewport.bottom - viewport.top);
        const distance = Math.hypot(end.x - start.x, end.y - start.y);
        const baseScale = Math.min(this.view.scale, this.target.scale);
        const screens = distance * baseScale / Math.min(width, height);
        const distant = crossGalaxy || screens > 1 || (differentSystem && screens > .55);
        const duration = crossGalaxy ? 1200 + Math.min(1, screens / 4) * 300 :
            distant || differentSystem ? 800 + Math.min(1, screens / 3) * 300 : 450 + Math.min(1, screens) * 200;
        const contextScale = distant ? Math.max(this.minScale, Math.min(baseScale, crossGalaxy ? .44 : .68,
            width * .78 / (Math.abs(end.x - start.x) + width * .55 / baseScale),
            height * .78 / (Math.abs(end.y - start.y) + height * .55 / baseScale))) : baseScale;
        this.travel = { start, end, center, startScale: this.view.scale, contextScale, distant, duration, started: null };
        this.frame = this.requestFrame(time => this.tick(time));
    }

    tickTravel(time) {
        const travel = this.travel;
        if (travel.started === null) travel.started = time;
        const t = Math.max(0, Math.min(1, (time - travel.started) / travel.duration));
        const ease = value => { const p = Math.max(0, Math.min(1, value)); return p * p * p * (p * (p * 6 - 15) + 10); };
        const progress = ease(t);
        // Proportional zoom feels even across large scale changes. Pan keeps one
        // slow-fast-slow velocity curve while context zoom overlaps its ends.
        const zoom = (from, to, p) => Math.exp(Math.log(from) + Math.log(to / from) * p);
        const scale = !travel.distant ? zoom(travel.startScale, this.target.scale, progress) :
            t < .32 ? zoom(travel.startScale, travel.contextScale, ease(t / .32)) :
            t < .62 ? travel.contextScale : zoom(travel.contextScale, this.target.scale, ease((t - .62) / .38));
        const x = travel.start.x + (travel.end.x - travel.start.x) * progress;
        const y = travel.start.y + (travel.end.y - travel.start.y) * progress;
        this.view = t === 1 ? { ...this.target } : { x: travel.center.x - x * scale, y: travel.center.y - y * scale, scale };
        if (t === 1) { this.travel = null; this.frame = null; }
        else this.frame = this.requestFrame(nextTime => this.tick(nextTime));
        this.onChange(this.view);
        if (t === 1) this.onRest();
    }

    setReducedMotion(enabled) {
        this.reducedMotion = enabled;
        if (enabled) this.setView(this.target, false);
    }
}
