// UI-only vertical space allocation. Canonical hierarchy and camera state are untouched.
class SidebarPaneSplit {
    static layout(height, ratio, secondaryHeight = Infinity) {
        const available = Math.max(0, height - 8);
        const scale = Math.min(1, available / 264);
        const min = 160 * scale, max = available - 104 * scale;
        const saved = typeof ratio === 'number' && Number.isFinite(ratio);
        const preferred = saved ? ratio * available : available - Math.max(104 * scale, Math.min(secondaryHeight, available * .32));
        return {available, min, max, top: Math.max(min, Math.min(max, preferred))};
    }
    constructor({preferences, mediaQuery}) {
        this.preferences = preferences;this.mediaQuery = mediaQuery;
        this.panes = document.getElementById('sidebar-panes');
        this.universe = document.getElementById('universe-section');
        this.secondary = document.getElementById('sidebar-secondary-views');
        this.handle = document.getElementById('sidebar-pane-splitter');
        this.ratio = preferences.load().sidebarPaneRatio;
        this.schedule = () => {
            if(this.frame) return;
            this.frame = requestAnimationFrame(() => {this.frame = null;this.apply();});
        };
        this.resizeObserver = new ResizeObserver(this.schedule);
        for(const element of [this.panes, ...this.secondary.children]) this.resizeObserver.observe(element);
        this.disclosureObserver = new MutationObserver(this.schedule);
        this.disclosureObserver.observe(this.universe, {attributes:true, attributeFilter:['class']});
        mediaQuery.addEventListener('change', () => {this.finish();this.apply();});
        this.handle.addEventListener('pointerdown', event => {
            if(event.button !== 0 || !this.enabled) return;
            event.preventDefault();this.pointer = event.pointerId;this.startY = event.clientY;this.startTop = this.current.top;
            this.handle.setPointerCapture(event.pointerId);this.panes.classList.add('is-resizing');
        });
        this.handle.addEventListener('pointermove', event => {
            if(this.pointer !== event.pointerId) return;
            this.adjust(this.startTop + event.clientY - this.startY);
        });
        for(const name of ['pointerup', 'pointercancel', 'lostpointercapture']) this.handle.addEventListener(name, () => this.finish());
        this.handle.addEventListener('keydown', event => {
            if(!this.enabled || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();this.adjust(this.current.top + (event.key === 'ArrowUp' ? -16 : 16));this.persist();
        });
        this.handle.addEventListener('dblclick', () => {
            if(!this.enabled) return;
            this.ratio = null;this.apply();this.persist();
        });
        this.apply();
    }
    apply() {
        const desktop = !this.mediaQuery.matches;
        const collapsed = this.universe.classList.contains('section-collapsed');
        this.panes.dataset.desktopSplit = String(desktop);
        this.panes.dataset.universeCollapsed = String(collapsed);
        this.enabled = desktop && !collapsed;
        this.handle.hidden = !this.enabled;this.handle.tabIndex = this.enabled ? 0 : -1;
        if(!this.enabled) {this.finish();return;}
        const height = this.panes.getBoundingClientRect().height;
        if(!height) return;
        const natural = [...this.secondary.children].reduce((total, section) => {
            if(section.hidden) return total;
            const style = getComputedStyle(section);
            return total + section.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
        }, 0);
        this.current = SidebarPaneSplit.layout(height, this.ratio, natural);
        this.panes.style.setProperty('--sidebar-primary-height', `${this.current.top}px`);
        const percent = value => Math.round(100 * value / (this.current.available || 1));
        for(const [name, value] of Object.entries({now:this.current.top, min:this.current.min, max:this.current.max})) this.handle.setAttribute(`aria-value${name}`, String(percent(value)));
        this.handle.setAttribute('aria-valuetext', `${percent(this.current.top)}% Universe`);
    }
    adjust(top) {
        if(!this.current?.available) return;
        this.ratio = Math.max(this.current.min, Math.min(this.current.max, top)) / this.current.available;
        this.apply();
    }
    persist() {
        this.preferences.update({sidebarPaneRatio:this.ratio}).catch(() => {});
    }
    finish() {
        if(this.pointer == null) return;
        const pointer = this.pointer;this.pointer = null;
        if(this.handle.hasPointerCapture(pointer)) this.handle.releasePointerCapture(pointer);
        this.panes.classList.remove('is-resizing');this.persist();
    }
}
if(typeof module !== 'undefined') module.exports = SidebarPaneSplit;
