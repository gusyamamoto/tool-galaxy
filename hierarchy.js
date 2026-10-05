// Disposable navigation state over the existing generic tree. No graph writes.
const cosmosHierarchy = {
    index(entries) {
        const children = new Map([...entries.keys()].map(id => [id, []])), roots = [];
        entries.forEach(entry => {
            if (children.has(entry.parentId)) children.get(entry.parentId).push(entry.id);
            else roots.push(entry.id);
        });
        return { children, roots };
    },
    visible(entries, index, expanded) {
        const rows = [], visited = new Set();
        const push = (ids, level, stack) => {
            for (let i = ids.length - 1; i >= 0; i--) stack.push({ id: ids[i], level, position: i + 1, size: ids.length });
        };
        const stack = []; push(index.roots, 1, stack);
        while (stack.length) {
            const row = stack.pop();
            if (visited.has(row.id) || !entries.has(row.id)) continue;
            visited.add(row.id); rows.push(row);
            if (expanded.has(row.id)) push(index.children.get(row.id), row.level + 1, stack);
        }
        return rows;
    },
    childContext(entries, parentId = null) {
        const parent = parentId ? entries.get(parentId) : null;
        if (parentId && !parent) return null;
        const depth = parent ? parent.depth + 1 : 0, role = galaxyModel.roleAtDepth(depth);
        return { parentId: parent?.id || null, depth, role,
            action: `Add ${galaxyModel.roles[role].name}` };
    }
};

class HierarchySidebar {
    constructor({ host, onNavigate, onCreate, onViewportChange, persist = true }) {
        Object.assign(this, { host, onNavigate, onCreate, onViewportChange, persist });
        this.sidebar = document.getElementById("hierarchy-sidebar");
        this.tree = document.getElementById("hierarchy-tree");
        this.toggle = document.getElementById("sidebar-toggle");
        this.resize = document.getElementById("sidebar-resize");
        this.entries = new Map(); this.rows = new Map(); this.expanded = new Set();
        this.index = { children: new Map(), roots: [] }; this.selectedId = null; this.activeId = null; this.searchMatches = new Set();
        this.narrow = window.matchMedia("(max-width: 760px)").matches;
        let preference = {};
        try { if (persist) preference = JSON.parse(localStorage.getItem("galaxy:navigation-ui") || "{}") || {}; } catch { /* UI remains usable without storage. */ }
        this.collapsed = this.narrow || preference.collapsed === true;
        this.width = Number.isFinite(preference.width) ? preference.width : 260;
        this.applyLayout();
        this.toggle.addEventListener("click", () => this.setCollapsed(!this.collapsed));
        this.tree.addEventListener("keydown", event => this.onKey(event));
        let drag = null;
        this.resize.addEventListener("pointerdown", event => {
            if (event.button !== 0) return;
            event.preventDefault(); drag = { id: event.pointerId, x: event.clientX, width: this.width };
            this.resize.setPointerCapture(event.pointerId); this.host.classList.add("sidebar-resizing");
        });
        this.resize.addEventListener("pointermove", event => {
            if (drag?.id === event.pointerId) this.setWidth(drag.width + event.clientX - drag.x, false);
        });
        const endResize = event => {
            if (drag?.id !== event.pointerId) return;
            drag = null; this.host.classList.remove("sidebar-resizing");
            if (this.resize.hasPointerCapture(event.pointerId)) this.resize.releasePointerCapture(event.pointerId);
            this.savePreference();
        };
        for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) this.resize.addEventListener(type, endResize);
        this.resize.addEventListener("keydown", event => {
            const limits = this.widthLimits();
            const width = { ArrowLeft: this.width - 16, ArrowRight: this.width + 16, Home: limits.min, End: limits.max }[event.key];
            if (width === undefined) return;
            event.preventDefault(); this.setWidth(width, true); this.savePreference();
        });
    }
    widthLimits() { return { min: 180, max: this.narrow ? Math.min(280, innerWidth * .75) : Math.min(360, innerWidth * .3) }; }
    applyLayout() {
        const { min, max } = this.widthLimits();
        this.width = Math.max(Math.min(min, max), Math.min(max, this.width));
        this.host.style.setProperty("--sidebar-width", `${this.width}px`);
        this.host.style.setProperty("--sidebar-space", `${this.collapsed || this.narrow ? 0 : this.width}px`);
        this.host.classList.toggle("sidebar-collapsed", this.collapsed);
        this.sidebar.hidden = this.collapsed;
        this.toggle.setAttribute("aria-expanded", String(!this.collapsed));
        this.toggle.title = this.toggle.ariaLabel = this.collapsed ? "Show navigation" : "Hide navigation";
        this.resize.setAttribute("aria-valuemin", String(Math.round(Math.min(min, max))));
        this.resize.setAttribute("aria-valuemax", String(Math.round(max)));
        this.resize.setAttribute("aria-valuenow", String(Math.round(this.width)));
    }
    savePreference() {
        try { if (this.persist) localStorage.setItem("galaxy:navigation-ui", JSON.stringify({ collapsed: this.collapsed, width: this.width })); } catch { /* Preference is optional. */ }
    }
    setCollapsed(collapsed) {
        if (this.collapsed === collapsed) return;
        if (collapsed && this.sidebar.contains(document.activeElement)) this.toggle.focus();
        this.collapsed = collapsed; this.applyLayout(); this.savePreference(); this.onViewportChange(true);
        if (!collapsed) this.scrollSelected();
    }
    setWidth(width, animate) { this.width = width; this.applyLayout(); this.onViewportChange(animate); }
    onWindowResize() {
        const narrow = window.matchMedia("(max-width: 760px)").matches;
        if (narrow !== this.narrow) { this.narrow = narrow; if (narrow) this.collapsed = true; }
        this.applyLayout();
    }
    setEntries(entries) {
        const scroll = { top: this.tree.scrollTop, left: this.tree.scrollLeft };
        this.entries = entries;
        const previousRoots = new Set(this.index.roots);
        this.index = cosmosHierarchy.index(entries);
        this.index.roots.forEach(id => { if (!previousRoots.has(id)) this.expanded.add(id); });
        this.expanded.forEach(id => { if (!entries.has(id)) this.expanded.delete(id); });
        this.rows.forEach((row, id) => { if (!entries.has(id)) { row.remove(); this.rows.delete(id); } });
        document.getElementById("hierarchy-count").textContent = `${entries.size} entries`;
        this.render();
        this.tree.scrollTop = scroll.top; this.tree.scrollLeft = scroll.left;
    }
    createRow(id) {
        const row = document.createElement("div");
        row.className = "hierarchy-row"; row.dataset.entryId = id; row.setAttribute("role", "treeitem");
        const disclosure = document.createElement("button");
        disclosure.type = "button"; disclosure.className = "tree-disclosure"; disclosure.tabIndex = -1;
        disclosure.textContent = "›";
        const icon = document.createElement("span"); icon.className = "tree-role-icon"; icon.ariaHidden = "true";
        const name = document.createElement("span"); name.className = "tree-name";
        const add = document.createElement("button"); add.type = "button"; add.className = "tree-add"; add.textContent = "+";
        row.append(disclosure, icon, name, add);
        row.addEventListener("click", event => {
            if (event.target.closest("button")) return;
            this.activeId = id; row.focus({ preventScroll: true });
            if (this.narrow) this.setCollapsed(true);
            this.onNavigate(id);
        });
        row.addEventListener("focus", () => { this.activeId = id; this.updateTabStops(); });
        disclosure.addEventListener("click", () => this.toggleBranch(id));
        add.addEventListener("click", () => this.onCreate(id));
        this.rows.set(id, row); return row;
    }
    render() {
        const scroll = { top: this.tree.scrollTop, left: this.tree.scrollLeft };
        const focused = document.activeElement?.closest(".hierarchy-row")?.dataset.entryId;
        this.visibleRows = cosmosHierarchy.visible(this.entries, this.index, this.expanded);
        if (!this.visibleRows.some(row => row.id === this.activeId)) this.activeId = this.visibleRows.some(row => row.id === this.selectedId) ? this.selectedId : this.visibleRows[0]?.id;
        const fragment = document.createDocumentFragment();
        this.visibleRows.forEach(({ id, level, position, size }) => {
            const entry = this.entries.get(id), row = this.rows.get(id) || this.createRow(id);
            const hasChildren = this.index.children.get(id).length > 0;
            row.style.setProperty("--tree-indent", `${(level - 1) * 14}px`);
            row.setAttribute("aria-level", level); row.setAttribute("aria-posinset", position); row.setAttribute("aria-setsize", size);
            row.setAttribute("aria-label", `${entry.name}, ${galaxyModel.roles[entry.role].name}`);
            if (hasChildren) row.setAttribute("aria-expanded", String(this.expanded.has(id))); else row.removeAttribute("aria-expanded");
            row.classList.toggle("is-selected", id === this.selectedId);
            row.classList.toggle("is-search-match", this.searchMatches.has(id));
            row.setAttribute("aria-selected", String(id === this.selectedId));
            row.dataset.role = entry.role; row.title = `${entry.name} · ${galaxyModel.roles[entry.role].name}`;
            row.querySelector(".tree-name").textContent = entry.name;
            const disclosure = row.querySelector(".tree-disclosure");
            disclosure.disabled = !hasChildren; disclosure.ariaLabel = `${this.expanded.has(id) ? "Collapse" : "Expand"} ${entry.name}`;
            const add = row.querySelector(".tree-add");
            add.title = add.ariaLabel = `${cosmosHierarchy.childContext(this.entries, id).action} under ${entry.name}`;
            fragment.appendChild(row);
        });
        this.tree.replaceChildren(fragment); this.updateTabStops();
        if (focused && this.tree.contains(this.rows.get(focused))) this.rows.get(focused).focus({ preventScroll: true });
        this.tree.scrollTop = scroll.top; this.tree.scrollLeft = scroll.left;
    }
    updateTabStops() {
        this.visibleRows?.forEach(({ id }) => {
            const row = this.rows.get(id); row.tabIndex = id === this.activeId ? 0 : -1;
            row.querySelector(".tree-add").tabIndex = id === this.activeId ? 0 : -1;
        });
    }
    toggleBranch(id) {
        if (!this.index.children.get(id)?.length) return;
        if (this.expanded.has(id)) this.expanded.delete(id); else this.expanded.add(id);
        this.activeId = id; this.render(); this.rows.get(id).focus({ preventScroll: true });
    }
    select(id, { scroll = true } = {}) {
        this.selectedId = id || null;
        let changed = false;
        if (id) galaxyModel.ancestors(this.entries, id).forEach(parent => {
            if (!this.expanded.has(parent.id)) { this.expanded.add(parent.id); changed = true; }
        });
        if (changed || (id && !this.tree.contains(this.rows.get(id)))) this.render();
        this.visibleRows?.forEach(({ id: rowId }) => {
            const row = this.rows.get(rowId); row.classList.toggle("is-selected", rowId === id); row.setAttribute("aria-selected", String(rowId === id));
        });
        if (id) { this.activeId = id; this.updateTabStops(); if (scroll) this.scrollSelected(); }
    }
    scrollSelected() {
        this.scrollRow(this.selectedId);
    }
    scrollRow(id) {
        const row = this.rows.get(id);
        if (this.collapsed || !this.tree.contains(row)) return;
        const bounds = this.tree.getBoundingClientRect(), target = row.getBoundingClientRect();
        if (target.top < bounds.top) this.tree.scrollTop += target.top - bounds.top;
        else if (target.bottom > bounds.bottom) this.tree.scrollTop += target.bottom - bounds.bottom;
        // Extremely deep indentation may need horizontal scrolling. Reveal the
        // name and action rather than aligning an oversized row's empty start.
        const name = row.querySelector(".tree-name").getBoundingClientRect();
        if (name.left < bounds.left + 38) this.tree.scrollLeft += name.left - bounds.left - 38;
        else if (name.right > bounds.right - 30) this.tree.scrollLeft += name.right - bounds.right + 30;
    }
    markSearch(matches) {
        const ids = new Set(matches.map(entry => entry.id));
        this.searchMatches = ids;
        this.rows.forEach((row, id) => row.classList.toggle("is-search-match", ids.has(id)));
    }
    onKey(event) {
        if (event.target.closest("button")) return;
        const id = event.target.closest(".hierarchy-row")?.dataset.entryId;
        if (!id) return;
        const index = this.visibleRows.findIndex(row => row.id === id), children = this.index.children.get(id);
        let target;
        if (event.key === "ArrowDown") target = this.visibleRows[Math.min(index + 1, this.visibleRows.length - 1)]?.id;
        else if (event.key === "ArrowUp") target = this.visibleRows[Math.max(0, index - 1)]?.id;
        else if (event.key === "Home") target = this.visibleRows[0]?.id;
        else if (event.key === "End") target = this.visibleRows.at(-1)?.id;
        else if (event.key === "ArrowRight") { if (children.length && !this.expanded.has(id)) this.toggleBranch(id); else target = children[0]; }
        else if (event.key === "ArrowLeft") { if (children.length && this.expanded.has(id)) this.toggleBranch(id); else target = this.entries.get(id).parentId; }
        else if (event.key === "Enter" || event.key === " ") { if (this.narrow) this.setCollapsed(true); this.onNavigate(id); }
        else return;
        event.preventDefault();
        if (target) {
            const row = this.rows.get(target);
            row?.focus({ preventScroll: true });
            this.scrollRow(target);
        }
    }
}
