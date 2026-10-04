// The camera transforms the view only. Physics and storage always use world coordinates.
class GraphCamera {
    constructor({ onChange, requestFrame = (callback) => requestAnimationFrame(callback),
        cancelFrame = (id) => cancelAnimationFrame(id) }) {
        this.onChange = onChange;
        this.requestFrame = requestFrame;
        this.cancelFrame = cancelFrame;
        this.minScale = 0.08;
        this.maxScale = 2.4;
        this.view = { x: 0, y: 0, scale: 1 };
        this.target = { ...this.view };
        this.frame = null;
        this.lastTime = null;
        this.reducedMotion = false;
    }

    screenToWorld(x, y) {
        return { x: (x - this.view.x) / this.view.scale, y: (y - this.view.y) / this.view.scale };
    }

    worldToScreen(x, y) {
        return { x: x * this.view.scale + this.view.x, y: y * this.view.scale + this.view.y };
    }

    zoomAt(x, y, factor) {
        const anchor = this.screenToWorld(x, y);
        const scale = Math.max(this.minScale, Math.min(this.maxScale, this.target.scale * factor));
        this.setView({ x: x - anchor.x * scale, y: y - anchor.y * scale, scale });
    }

    setView(view, animate = true) {
        this.target = { ...view, scale: Math.max(this.minScale, Math.min(this.maxScale, view.scale)) };
        if (!animate || this.reducedMotion) {
            const target = this.target;
            this.stopAnimation();
            this.target = target;
            this.view = { ...target };
            this.onChange(this.view);
        } else if (this.frame === null) {
            this.lastTime = null;
            this.frame = this.requestFrame((time) => this.tick(time));
        }
    }

    tick(time) {
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
    }

    // Freeze the visible view before starting a drag, avoiding coordinate jumps.
    stopAnimation() {
        if (this.frame !== null) this.cancelFrame(this.frame);
        this.frame = null;
        this.lastTime = null;
        this.target = { ...this.view };
    }

    panTo(x, y) {
        this.setView({ x, y, scale: this.view.scale }, false);
    }

    reset() {
        this.setView({ x: 0, y: 0, scale: 1 });
    }

    fitBounds(bounds, viewport, { padding = 32, maxScale = 1, animate = true } = {}) {
        if (!bounds || ![bounds.left, bounds.right, bounds.top, bounds.bottom].every(Number.isFinite)) return;
        const width = Math.max(1, viewport.right - viewport.left - padding * 2);
        const height = Math.max(1, viewport.bottom - viewport.top - padding * 2);
        const scale = Math.min(maxScale, width / Math.max(1, bounds.right - bounds.left),
            height / Math.max(1, bounds.bottom - bounds.top));
        // Deliberately remote pins must also fit. Wheel zoom can return to this scale.
        this.minScale = Math.min(this.minScale, scale);
        this.setView({ x: (viewport.left + viewport.right) / 2 - (bounds.left + bounds.right) / 2 * scale,
            y: (viewport.top + viewport.bottom) / 2 - (bounds.top + bounds.bottom) / 2 * scale,
            scale }, animate);
    }

    setReducedMotion(enabled) {
        this.reducedMotion = enabled;
        if (enabled) this.setView(this.target, false);
    }
}
