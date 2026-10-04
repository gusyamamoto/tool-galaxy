const initialEntries = [
    {
        id: "github",
        name: "GitHub",
        x: 300,
        y: 250,
        description: "Stores and manages Git repositories online.",
        category: "Version control"
    },
    {
        id: "vs-code",
        name: "VS Code",
        x: 550,
        y: 380,
        description: "Code editor used to build and manage the project.",
        category: "Code editor"
    },
    {
        id: "codex",
        name: "Codex",
        x: 800,
        y: 220,
        description: "AI coding assistant for writing and modifying code.",
        category: "AI assistant"
    }
];

// Connections use stable IDs so entries can share a display name.
const initialConnections = [
    { from: "github", to: "vs-code" },
    { from: "vs-code", to: "codex" }
];

const entryRoles = galaxyModel.roles;
const sampleMode = galaxySample.isRequested(window.location.search);
if (sampleMode) {
    // The query activates this page load only. Keeping it out of the address bar
    // means a normal refresh always returns to the user's persisted Galaxy.
    const realGalaxyUrl = new URL(window.location.href);
    realGalaxyUrl.searchParams.delete("sample");
    window.history.replaceState(null, "", realGalaxyUrl.href);
}

function normalizeRole(role) {
    return galaxyModel.normalizeRole(role);
}

const galaxy = document.getElementById("galaxy");
const graphViewport = document.getElementById("graph-viewport");
const graphWorld = document.getElementById("graph-world");
const nodesLayer = document.getElementById("nodes-layer");
const zoomLevel = document.getElementById("zoom-level");
const connectionsLayer = document.getElementById("connections");
const panel = document.getElementById("entry-panel");
const panelName = document.getElementById("panel-name");
const panelDescription = document.getElementById("panel-description");
const panelCategory = document.getElementById("panel-category");
const panelRole = document.getElementById("panel-role");
const panelParent = document.getElementById("panel-parent");
const entryActions = document.getElementById("entry-actions");
const editEntryButton = document.getElementById("edit-entry-button");
const deleteEntryButton = document.getElementById("delete-entry-button");
const actionStatus = document.getElementById("entry-action-status");
const panelPlacement = document.getElementById("panel-placement");
const pinPositionButton = document.getElementById("pin-position-button");
const releasePositionButton = document.getElementById("release-position-button");
const roleField = document.getElementById("entry-role");
const parentField = document.getElementById("entry-parent");
const formError = document.getElementById("entry-form-error");
const submitButton = document.getElementById("entry-submit");
const addEntryButton = document.getElementById("add-entry-button");
const dialog = document.getElementById("add-entry-dialog");
const form = document.getElementById("add-entry-form");
const connectionOptions = document.getElementById("connection-options");
const storageStatus = document.getElementById("storage-status");
const deleteDialog = document.getElementById("delete-entry-dialog");
const searchField = document.getElementById("entry-search");
const searchResults = document.getElementById("search-results");
const searchResultList = document.getElementById("search-result-list");
const sampleControls = document.getElementById("sample-controls");
const sampleModeLabel = document.getElementById("sample-mode-label");
const sampleModeCount = document.getElementById("sample-mode-count");
const loadSampleButton = document.getElementById("load-sample-button");
const removeSampleButton = document.getElementById("remove-sample-button");
const fields = ["entry-name", "entry-description", "entry-category"].map((id) =>
    document.getElementById(id)
);

// Plain entry/connection data is kept separate from the rendered DOM.
const entries = new Map();
// Preferred world coordinates and pins are layout state, never semantic hierarchy.
let layout = new Map();
const relationships = [];
let connections = [];
const builtInIds = new Set(initialEntries.map((entry) => entry.id));
const nodes = new Map();
const lines = [];
const orbitGuides = [];
let hoveredSystemId = null;
let selectedNode = null;
let nextEntryId = 1;
let storageAvailable = true;
let graphNeedsSave = false;
let editingId = null;
let deletingId = null;
let searchOpen = false;
let keyboardNavigation = false;
document.addEventListener("keydown", event => {
    if (event.key === "Tab") keyboardNavigation = true;
});
document.addEventListener("pointerdown", () => { keyboardNavigation = false; }, true);
let autoFitPending = true;
let baseNodeRadius = 23;
const smoothDetail = (scale, start, end) => {
    const t = Math.max(0, Math.min(1, (scale - start) / (end - start)));
    return t * t * (3 - 2 * t);
};
const renderBackground = createUniverseBackground(galaxy);
const camera = new GraphCamera({
    onChange({ x, y, scale }) {
        graphWorld.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
        // SVG geometry stays in world space. Bodies are sized and projected in
        // screen space, so zoom paints gradients and text at native resolution
        // instead of magnifying a previously composited DOM world layer.
        graphViewport.style.setProperty("--camera-scale", scale);
        graphViewport.style.setProperty("--native-label-scale", Math.min(1, scale / 0.62));
        graphViewport.style.setProperty("--sun-render-scale", Math.max(scale, 0.3));
        graphViewport.style.setProperty("--planet-detail", smoothDetail(scale, 0.35, 0.65));
        graphViewport.style.setProperty("--moon-detail", smoothDetail(scale, 0.45, 0.85));
        graphViewport.style.setProperty("--moon-label-detail", smoothDetail(scale, 0.8, 1.05));
        graphViewport.style.setProperty("--surface-detail", smoothDetail(scale, 0.5, 1));
        graphViewport.style.setProperty("--orbit-detail", smoothDetail(scale, 0.5, 0.85));
        galaxy.dataset.detailLevel = scale < 0.5 ? "far" : scale < 0.95 ? "medium" : "near";
        zoomLevel.textContent = `${Math.round(scale * 100)}%`;
        entries.forEach(entry => renderNode(entry, nodes.get(entry.id)));
        updateOrbitGuides();
    }
});
let pan = null;
let activeNodeDrags = 0;

function pointerInWorld(event) {
    const rect = graphViewport.getBoundingClientRect();
    return camera.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
}

graphViewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (activeNodeDrags || pan) return;
    autoFitPending = false;
    const rect = graphViewport.getBoundingClientRect();
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
    const delta = Math.max(-240, Math.min(240, event.deltaY * units));
    camera.zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-delta * 0.0018));
}, { passive: false });

graphViewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || pan || activeNodeDrags || event.target.closest(".entry-node")) return;
    autoFitPending = false;
    camera.stopAnimation();
    pan = { id: event.pointerId, x: event.clientX, y: event.clientY, view: { ...camera.view } };
    graphViewport.setPointerCapture(event.pointerId);
    graphViewport.classList.add("is-panning");
});
graphViewport.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pan?.id) return;
    camera.panTo(pan.view.x + event.clientX - pan.x, pan.view.y + event.clientY - pan.y);
});
function endPan(event) {
    if (event.pointerId !== pan?.id) return;
    pan = null;
    graphViewport.classList.remove("is-panning");
    if (graphViewport.hasPointerCapture(event.pointerId)) graphViewport.releasePointerCapture(event.pointerId);
}
["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => graphViewport.addEventListener(type, endPan));
document.getElementById("reset-view-button").addEventListener("click", () => {
    autoFitPending = !physics.settled;
    fitGalaxy();
});

const physics = new GalaxyPhysics({
    onPlacementChange(id, placement) { layout.set(id, placement); },
    onTick(particles) {
        if (!galaxy.classList.contains("is-settling")) galaxy.classList.add("is-settling");
        particles.forEach((particle, id) => {
            const entry = entries.get(id);
            if (entry.x !== particle.x || entry.y !== particle.y) {
                graphNeedsSave = true;
            }
            entry.x = particle.x;
            entry.y = particle.y;
        });
        renderGraph();
    },
    onSettle() {
        galaxy.classList.remove("is-settling");
        if (graphNeedsSave) {
            saveGalaxy();
        }
        if (autoFitPending) { autoFitPending = false; fitGalaxy(); }
    }
});

function reportStorageFailure(message) {
    storageStatus.textContent = message;
    storageStatus.hidden = false;
}

function getGalaxySnapshot() {
    return {
        entries: [...entries.values()].map(({ id, name, description, category, role, parentId, x, y }) =>
            ({ id, name, description, category, role, parentId, x, y })),
        // Only optional relationships are stored here; hierarchy edges come from parentId.
        connections: relationships.map(({ from, to }) => ({ from, to })),
        layout: [...layout].map(([id, placement]) => ({ id, ...placement }))
    };
}

function saveGalaxy() {
    if (sampleMode) {
        graphNeedsSave = false;
        return;
    }
    if (!storageAvailable) {
        return;
    }
    try {
        galaxyStorage.save(getGalaxySnapshot());
        graphNeedsSave = false;
        storageStatus.hidden = true;
    } catch (error) {
        reportStorageFailure("Changes could not be saved in this browser. They may be lost on refresh.");
    }
}

function initializeGalaxy() {
    let saved = null;
    if (sampleMode) {
        saved = galaxySample.build();
    } else {
        try {
            saved = galaxyStorage.load();
        } catch (error) {
            // Preserve unreadable/unsupported data instead of overwriting it.
            storageAvailable = false;
            reportStorageFailure("Saved entries could not be loaded. Changes will remain available only for this session.");
        }
    }

    const records = saved?.entries || [];
    (sampleMode ? [] : initialEntries).forEach((initialEntry) => {
        const stored = records.find((entry) => entry?.id === initialEntry.id);
        const entry = galaxyModel.normalizeEntry({ ...initialEntry, ...stored }) ||
            galaxyModel.normalizeEntry(initialEntry);
        entries.set(entry.id, entry);
    });
    records.forEach((record) => {
        const entry = galaxyModel.normalizeEntry(record);
        if (entry && !entries.has(entry.id)) entries.set(entry.id, entry);
    });
    galaxyModel.normalizeHierarchy(entries);
    layout = galaxyModel.normalizeLayout(saved?.layout || [], entries);
    [...entries.values()].forEach(createEntryNode);
    const storedLinks = sampleMode ? saved.connections :
        (!saved || saved.legacy) ? [...initialConnections, ...(saved?.connections || [])] : saved.connections;
    storedLinks.forEach((connection) => {
        if (connection && typeof connection.from === "string" && typeof connection.to === "string" &&
            connection.from !== connection.to && entries.has(connection.from) && entries.has(connection.to) &&
            !relationships.some((existing) => galaxyModel.connectionKey(existing.from, existing.to) ===
                galaxyModel.connectionKey(connection.from, connection.to))) {
            relationships.push({ from: connection.from, to: connection.to });
        }
    });
    rebuildConnections();
}

loadSampleButton.addEventListener("click", () => {
    if (sampleMode) return;
    // Finish the real graph's pending layout save before leaving it behind.
    physics.pause();
    if (graphNeedsSave) saveGalaxy();
    const url = new URL(window.location.href);
    url.searchParams.set("sample", galaxySample.queryValue);
    window.location.assign(url.href);
});
removeSampleButton.addEventListener("click", () => {
    if (sampleMode) window.location.reload();
});

function selectEntry(entry, node) {
    if (selectedNode) {
        selectedNode.classList.remove("selected");
        selectedNode.setAttribute("aria-pressed", "false");
    }

    selectedNode = node;
    node.classList.add("selected");
    node.setAttribute("aria-pressed", "true");
    panelName.textContent = entry.name;
    panelDescription.textContent = entry.description;
    panelCategory.textContent = `Category: ${entry.category}`;
    panelCategory.hidden = !entry.category;
    panelRole.textContent = `Role: ${entryRoles[entry.role].label}`;
    panelRole.hidden = false;
    const parent = entries.get(entry.parentId);
    panelParent.textContent = parent ? `Parent: ${parent.name}` : entry.role === "category" ?
        "Top-level system · No parent" : "Unassigned · Choose a parent in Edit";
    panelParent.hidden = false;
    entryActions.hidden = false;
    deleteEntryButton.hidden = builtInIds.has(entry.id);
    actionStatus.hidden = true;
    updatePlacementControls();
    updateHierarchyEmphasis();
}

function updateHierarchyEmphasis() {
    const id = selectedNode?.dataset.entryId;
    const selected = physics.particles.get(id);
    galaxy.classList.toggle("has-selection", !!selected);
    const relatedIds = new Set();
    if (selected) {
        const system = physics.systems.get(selected.systemId);
        relatedIds.add(system.root.id);
        physics.children.get(system.root.id).forEach(node => relatedIds.add(node.id));
        if (selected.role === "subcategory") physics.children.get(id).forEach(node => relatedIds.add(node.id));
        if (selected.parent) relatedIds.add(selected.parent.id);
        // Optional relationships retain their explicit connection emphasis.
        connections.filter(link => link.kind === "relationship").forEach(({ from, to }) => {
            if (from === id) relatedIds.add(to);
            if (to === id) relatedIds.add(from);
        });
    }
    nodes.forEach((element, nodeId) => {
        const particle = physics.particles.get(nodeId);
        element.classList.toggle("related", relatedIds.has(nodeId));
        element.classList.toggle("in-system", !!selected && particle?.systemId === selected.systemId);
        element.dataset.systemRoot = String(!particle?.parent);
    });
    lines.forEach(({ from, to, element }) => {
        const parent = physics.particles.get(from);
        const child = physics.particles.get(to);
        const ancestry = element.dataset.kind === "hierarchy" && selected &&
            child?.systemId === selected.systemId &&
            (selected.role === "category" || child?.role === "subcategory" ||
                from === id || to === id || to === selected.parentId);
        element.classList.toggle("selected", !!ancestry || from === id || to === id);
        element.classList.toggle("in-system", !!selected && parent?.systemId === selected.systemId && child?.systemId === selected.systemId);
    });
    updateConnections();
    updateOrbitGuides();
}

// Initial entries and form submissions share all rendering and interactions.
function createEntryNode(entry) {
    const node = document.createElement("button");
    node.type = "button";
    node.classList.add("entry-node");
    const label = document.createElement("span");
    label.className = "node-label";
    node.appendChild(label);
    updateEntryNode(entry, node);
    node.dataset.entryId = entry.id;
    node.setAttribute("aria-pressed", "false");
    node.addEventListener("click", () => selectEntry(entry, node));
    node.addEventListener("focus", () => {
        // Browsers can restore old focus when a window receives pointer input.
        // Only intentional keyboard navigation should move the camera on focus.
        if (!activeNodeDrags && keyboardNavigation) focusEntry(entry.id);
    });
    node.addEventListener("pointerenter", () => {
        hoveredSystemId = physics.particles.get(entry.id)?.systemId || null;
        updateOrbitGuides();
    });
    node.addEventListener("pointerleave", () => {
        hoveredSystemId = null;
        updateOrbitGuides();
    });

    let dragPointerId = null;
    let didMove = false;
    let offsetX = 0;
    let offsetY = 0;

    node.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || dragPointerId !== null || pan) return;
        camera.stopAnimation();
        const point = pointerInWorld(event);
        offsetX = point.x - entry.x;
        offsetY = point.y - entry.y;
        physics.beginDrag(entry.id);
        autoFitPending = false;
        activeNodeDrags++;
        dragPointerId = event.pointerId;
        didMove = false;
        node.classList.add("dragging");
        selectEntry(entry, node);
        node.setPointerCapture(event.pointerId);
    });

    node.addEventListener("pointermove", (event) => {
        if (event.pointerId !== dragPointerId || !node.hasPointerCapture(event.pointerId)) return;
        const point = pointerInWorld(event);
        const x = point.x - offsetX;
        const y = point.y - offsetY;
        if (didMove || Math.hypot(x - entry.x, y - entry.y) * camera.view.scale > 3) {
            didMove = true;
            physics.moveDrag(entry.id, x, y);
        }
    });

    function endDrag(event) {
        if (event.pointerId !== dragPointerId) return;
        dragPointerId = null;
        activeNodeDrags--;
        const placement = physics.endDrag(entry.id, didMove);
        node.classList.remove("dragging");
        if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
        if (didMove) {
            layout.set(entry.id, placement);
            updatePlacementControls();
            saveGalaxy();
        }
    }
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => node.addEventListener(type, endDrag));
    entries.set(entry.id, entry);
    nodes.set(entry.id, node);
    nodesLayer.appendChild(node);
    renderNode(entry, node);
    return node;
}

// Editing reuses the same appearance renderer without duplicating DOM or handlers.
function updateEntryNode(entry, node) {
    node.dataset.role = entry.role;
    node.dataset.body = entryRoles[entry.role].body;
    node.style.setProperty("--body-scale", entryRoles[entry.role].scale);
    // Appearance comes from the stable ID, not random values or mutable metadata.
    const hash = [...entry.id].reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 0);
    const surfaces = {
        sun: ["warm", "golden"],
        planet: ["rocky", "gaseous", "icy", "earthy"],
        moon: ["rocky", "icy", "earthy"]
    };
    const surface = surfaces[node.dataset.body][hash % surfaces[node.dataset.body].length];
    const hues = { warm: 38, golden: 46, rocky: 218, gaseous: 29, icy: 196, earthy: 27 };
    node.dataset.surface = surface;
    node.style.setProperty("--body-hue", hues[surface] + (hash % 13) - 6);
    node.style.setProperty("--surface-angle", `${hash % 360}deg`);
    // A static, seeded SVG noise field supplies uneven terrain, never discrete circles.
    const texture = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="terrain"><feTurbulence type="fractalNoise" baseFrequency=".075 .11" numOctaves="3" seed="${hash % 997}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="1.8" intercept="-.4"/><feFuncG type="linear" slope="1.8" intercept="-.4"/><feFuncB type="linear" slope="1.8" intercept="-.4"/></feComponentTransfer></filter><rect width="100%" height="100%" filter="url(#terrain)"/></svg>`;
    node.style.setProperty("--surface-map", `url("data:image/svg+xml,${encodeURIComponent(texture)}")`);
    node.querySelector(".node-label").textContent = entry.name;
    node.title = entry.name;
}

function getNewEntryPosition(targetIds, role) {
    const targets = targetIds.map((id) => entries.get(id));
    const bounds = physics.bounds;
    const center = targets.length ? {
        x: targets.reduce((sum, entry) => sum + entry.x, 0) / targets.length,
        y: targets.reduce((sum, entry) => sum + entry.y, 0) / targets.length
    } : { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
    const radius = getNodeRadius({ role });
    const spacing = radius * 2 + 24;
    for (let ring = 1; ring <= 3; ring++) {
        for (let step = 0; step < 12; step++) {
            const angle = entries.size * 2.4 + step * Math.PI / 6;
            const point = { x: center.x + Math.cos(angle) * spacing * ring,
                y: center.y + Math.sin(angle) * spacing * ring };
            if ([...entries.values()].every((entry) =>
                Math.hypot(point.x - entry.x, point.y - entry.y) >= radius + getNodeRadius(entry) + 24
            )) {
                return point;
            }
        }
    }
    return center;
}

function getNodeRadius(entry) {
    return baseNodeRadius * (entry ? entryRoles[normalizeRole(entry.role)].scale : 1);
}

function syncPhysicsGraph() {
    physics.setGraph([...entries.values()].map(({ id, role, parentId, x, y }) =>
        ({ id, role, parentId, x, y, sizeScale: entryRoles[role].scale })
    ), connections, layout);
    rebuildOrbitGuides();
    updateHierarchyEmphasis();
    renderGraph();
}

function updateGraphViewport() {
    const rect = galaxy.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    baseNodeRadius = parseFloat(getComputedStyle(galaxy).getPropertyValue("--node-size")) / 2;
    const radius = getNodeRadius();
    const narrow = window.matchMedia("(max-width: 760px)").matches;
    const left = radius + 24;
    const top = radius + (narrow ? 234 : 200);
    const right = Math.max(left, (narrow ? rect.width - 24 : panelRect.left - rect.left - 24) - radius);
    const bottom = Math.max(top, (narrow ? panelRect.top - rect.top - 48 : rect.height - 76) - radius);
    physics.setViewport({ left, right, top, bottom }, radius);
}

function galaxyBounds() {
    if (!entries.size) return null;
    const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    // Include simplified/hidden descendants too: changing zoom must not crop them.
    entries.forEach(entry => {
        const radius = getNodeRadius(entry);
        bounds.left = Math.min(bounds.left, entry.x - radius - 28);
        bounds.right = Math.max(bounds.right, entry.x + radius + 28);
        bounds.top = Math.min(bounds.top, entry.y - radius - 12);
        bounds.bottom = Math.max(bounds.bottom, entry.y + radius + 44);
    });
    return bounds;
}

function fitGalaxy(animate = true) {
    camera.fitBounds(galaxyBounds(), physics.bounds, { padding: 32, animate });
}

// Keep new entries and keyboard-focused bodies visible even after panning away.
function revealEntry(entry) {
    if (activeNodeDrags) return;
    const bounds = physics.bounds;
    const radius = getNodeRadius(entry);
    const point = camera.worldToScreen(entry.x, entry.y);
    const edge = radius * camera.view.scale;
    const left = bounds.left - getNodeRadius();
    const right = bounds.right + getNodeRadius();
    const top = bounds.top - getNodeRadius();
    const bottom = bounds.bottom + getNodeRadius();
    if (point.x - edge < left || point.x + edge > right || point.y - edge < top || point.y + edge > bottom) {
        const scale = Math.min(camera.view.scale, Math.max(camera.minScale,
            Math.min(right - left, bottom - top) / (radius * 2 + 32)));
        camera.setView({ x: (left + right) / 2 - entry.x * scale,
            y: (top + bottom) / 2 - entry.y * scale, scale }, false);
    }
}

function renderNode(entry, node) {
    const point = camera.worldToScreen(entry.x, entry.y);
    if (node.renderX === point.x && node.renderY === point.y) return;
    node.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`;
    node.renderX = point.x;
    node.renderY = point.y;
}

function renderGraph() {
    entries.forEach((entry) => renderNode(entry, nodes.get(entry.id)));
    updateConnections();
    updateOrbitGuides();
}

function rebuildOrbitGuides() {
    orbitGuides.forEach(({ element }) => element.remove());
    orbitGuides.length = 0;
    physics.particles.forEach(node => {
        if (!node.childOrbit) return;
        const element = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
        element.classList.add("orbit-guide");
        element.dataset.role = node.role;
        connectionsLayer.prepend(element);
        orbitGuides.push({ id: node.id, element });
    });
}

function updateOrbitGuides() {
    const selected = physics.particles.get(selectedNode?.dataset.entryId);
    const systemId = selected?.systemId || hoveredSystemId;
    const moonParent = selected?.role === "subcategory" ? selected.id :
        selected?.role === "entry" ? selected.parentId : null;
    orbitGuides.forEach(({ id, element }) => {
        const parent = physics.particles.get(id);
        const active = !!parent && camera.view.scale > 0.5 && parent.systemId === systemId &&
            (parent.role === "category" || (camera.view.scale >= 0.95 && id === moonParent));
        if (element.dataset.active !== String(active)) element.dataset.active = String(active);
        if (!active) return;
        // One preferred band per parent, never a separate arc/ring per child.
        // Manual bodies can freely leave the band; guides do not constrain them.
        if (element.renderX !== parent.x || element.renderY !== parent.y || element.renderRadius !== parent.childOrbit) {
            element.setAttribute("cx", parent.x);
            element.setAttribute("cy", parent.y);
            element.setAttribute("rx", parent.childOrbit);
            element.setAttribute("ry", parent.childOrbit);
            element.renderX = parent.x;
            element.renderY = parent.y;
            element.renderRadius = parent.childOrbit;
        }
    });
}

function updateConnections() {
    const selected = physics.particles.get(selectedNode?.dataset.entryId);
    lines.forEach(({ from, to, element }) => {
        const fromEntry = entries.get(from);
        const toEntry = entries.get(to);
        // Selection clears during deletion before the derived edge list rebuilds.
        if (!fromEntry || !toEntry) return;
        if (element.renderFromX !== fromEntry.x || element.renderFromY !== fromEntry.y ||
            element.renderToX !== toEntry.x || element.renderToY !== toEntry.y) {
            element.setAttribute("x1", fromEntry.x);
            element.setAttribute("y1", fromEntry.y);
            element.setAttribute("x2", toEntry.x);
            element.setAttribute("y2", toEntry.y);
            element.renderFromX = fromEntry.x;
            element.renderFromY = fromEntry.y;
            element.renderToX = toEntry.x;
            element.renderToY = toEntry.y;
        }
        if (element.dataset.kind === "hierarchy") {
            const child = physics.particles.get(to);
            const selectedAncestry = selected?.role === "entry" &&
                (to === selected.id || to === selected.parentId);
            const stretched = selected && (from === selected.id || to === selected.id) && child &&
                Math.hypot(toEntry.x - fromEntry.x, toEntry.y - fromEntry.y) > child.orbitRadius * 1.6;
            element.classList.toggle("context-link", !!selectedAncestry || !!stretched || physics.dragging.has(to));
        }
    });
}

function rebuildConnections() {
    connections = galaxyModel.buildConnections(entries, relationships);
    connectionsLayer.replaceChildren();
    lines.length = 0;
    connections.forEach(({ from, to, kind }) => {
        const element = document.createElementNS("http://www.w3.org/2000/svg", "line");
        element.classList.add("connection-line");
        element.dataset.kind = kind;
        connectionsLayer.appendChild(element);
        lines.push({ from, to, element });
    });
    updateConnections();
}

function populateConnectionOptions() {
    connectionOptions.replaceChildren();
    entries.forEach((entry) => {
        if (entry.id === editingId) return;
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.name = "connections";
        checkbox.value = entry.id;
        checkbox.checked = editingId !== null && relationships.some(({ from, to }) =>
            (from === editingId && to === entry.id) || (to === editingId && from === entry.id));
        const text = document.createElement("span");
        text.textContent = `${entry.name} · ${entryRoles[entry.role].name}${entry.category ? ` (${entry.category})` : ""}`;
        label.append(checkbox, text);
        connectionOptions.appendChild(label);
    });
    updateParentConnectionOption();
}

function getNewEntryId() {
    if (typeof crypto.randomUUID === "function") return `entry-${crypto.randomUUID()}`;
    while (entries.has(`custom-${nextEntryId}`)) {
        nextEntryId++;
    }
    return `custom-${nextEntryId++}`;
}

function clearFormError() {
    formError.hidden = true;
    parentField.setCustomValidity("");
}

function updateParentConnectionOption() {
    connectionOptions.querySelectorAll("input").forEach((checkbox) => {
        checkbox.disabled = checkbox.value === parentField.value && roleField.value !== "category";
        if (checkbox.disabled) checkbox.checked = false;
    });
}

function updateParentOptions(preferredId = parentField.value) {
    clearFormError();
    const expected = entryRoles[roleField.value].parentRole;
    const container = document.getElementById("parent-field");
    container.hidden = !expected;
    parentField.required = !!expected;
    parentField.replaceChildren(new Option(expected ? "Choose a parent…" : "No parent", ""));
    if (expected) {
        const label = entryRoles[expected].name;
        document.getElementById("parent-label").textContent = `Parent ${label}`;
        const options = [...entries.values()].filter((entry) => entry.role === expected && entry.id !== editingId);
        options.sort((a, b) => a.name.localeCompare(b.name)).forEach((entry) => {
            const ancestor = entries.get(entry.parentId);
            parentField.add(new Option(`${entry.name}${ancestor ? ` — ${ancestor.name}` : ""}`, entry.id));
        });
        document.getElementById("parent-help").textContent = options.length ?
            `This ${label.toLowerCase()} connection is automatic.` : `No ${label}s yet. Create a ${label} first.`;
        if (options.some((entry) => entry.id === preferredId)) parentField.value = preferredId;
    }
    updateParentConnectionOption();
}

function openEntryForm(entry = null) {
    editingId = entry?.id || null;
    form.reset();
    fields.forEach((field) => field.setCustomValidity(""));
    clearFormError();
    document.getElementById("add-entry-title").textContent = entry ? "Edit Entry" : "Add Entry";
    submitButton.textContent = entry ? "Save changes" : "Add Entry";
    if (entry) {
        fields[0].value = entry.name;
        fields[1].value = entry.description;
        fields[2].value = entry.category;
        roleField.value = entry.role;
    }
    updateParentOptions(entry?.parentId || "");
    populateConnectionOptions();
    physics.pause();
    dialog.showModal();
}

addEntryButton.addEventListener("click", () => openEntryForm());
editEntryButton.addEventListener("click", () => {
    const entry = entries.get(selectedNode?.dataset.entryId);
    if (entry) openEntryForm(entry);
});
roleField.addEventListener("change", () => updateParentOptions());
parentField.addEventListener("change", () => {
    clearFormError();
    updateParentConnectionOption();
});

dialog.addEventListener("close", () => {
    if (!document.hidden && !deleteDialog.open) {
        physics.resume();
    }
});

document.getElementById("cancel-add-entry").addEventListener("click", () => dialog.close());

fields.forEach((field) => {
    field.addEventListener("input", () => { field.setCustomValidity(""); clearFormError(); });
});

form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFormError();
    fields.forEach((field, index) => {
        field.setCustomValidity(index === 2 || field.value.trim() ? "" : "Please enter a value.");
    });
    const data = {
        id: editingId || getNewEntryId(),
        name: fields[0].value.trim(),
        description: fields[1].value.trim(),
        category: fields[2].value.trim(),
        role: normalizeRole(roleField.value),
        parentId: roleField.value === "category" ? null : parentField.value || null
    };
    const error = galaxyModel.validateChange(data, entries);
    if (error) {
        formError.textContent = error;
        formError.hidden = false;
        return;
    }
    if (!form.reportValidity()) return;
    const targetIds = [...connectionOptions.querySelectorAll("input:checked:not(:disabled)")]
        .map((checkbox) => checkbox.value);
    const entry = editingId ? entries.get(editingId) : {
        ...getNewEntryPosition(data.parentId ? [data.parentId] : targetIds, data.role)
    };
    Object.assign(entry, data);
    const node = editingId ? nodes.get(editingId) : createEntryNode(entry);
    updateEntryNode(entry, node);
    // Replace only this entry's optional relationships. All other relationships stay intact.
    for (let i = relationships.length - 1; i >= 0; i--) {
        if (relationships[i].from === entry.id || relationships[i].to === entry.id) relationships.splice(i, 1);
    }
    targetIds.forEach((to) => relationships.push({ from: entry.id, to }));
    rebuildConnections();
    syncPhysicsGraph();
    saveGalaxy();
    selectEntry(entry, node);
    dialog.close();
    revealEntry(entry);
    node.focus({ preventScroll: true });
    refreshSearchResults();
});

function clearSelection() {
    selectedNode = null;
    panelName.textContent = "Select an entry";
    panelDescription.textContent = "Click a node to see more information.";
    [panelCategory, panelRole, panelParent, panelPlacement, entryActions, actionStatus].forEach((element) => { element.hidden = true; });
    nodes.forEach((node) => {
        node.classList.remove("related", "selected");
        node.setAttribute("aria-pressed", "false");
    });
    lines.forEach(({ element }) => element.classList.remove("selected"));
    updateHierarchyEmphasis();
}

function updatePlacementControls() {
    const id = selectedNode?.dataset.entryId;
    if (!id) return;
    const placement = layout.get(id);
    panelPlacement.textContent = `Position: ${placement?.pinned ? "Pinned" : placement ? "Soft positioned" : "Automatic"}`;
    panelPlacement.hidden = false;
    pinPositionButton.textContent = placement?.pinned ? "Unpin position" : "Pin position";
    releasePositionButton.disabled = !placement;
}

pinPositionButton.addEventListener("click", () => {
    const entry = entries.get(selectedNode?.dataset.entryId);
    if (!entry || activeNodeDrags) return;
    const placement = { x: entry.x, y: entry.y, pinned: !layout.get(entry.id)?.pinned };
    layout.set(entry.id, placement);
    physics.setPlacement(entry.id, placement);
    updatePlacementControls();
    saveGalaxy();
});
releasePositionButton.addEventListener("click", () => {
    const id = selectedNode?.dataset.entryId;
    if (!entries.has(id) || activeNodeDrags) return;
    layout.delete(id);
    physics.setPlacement(id, null);
    updatePlacementControls();
    saveGalaxy();
});

function reportAction(message) {
    actionStatus.textContent = message;
    actionStatus.hidden = false;
}

deleteEntryButton.addEventListener("click", () => {
    const entry = entries.get(selectedNode?.dataset.entryId);
    if (!entry || builtInIds.has(entry.id)) return;
    const children = galaxyModel.childrenOf(entries, entry.id);
    if (children.length) {
        reportAction(`Cannot delete ${entry.name}: it has ${children.length} ${children.length === 1 ? "child" : "children"}. Reassign or delete them first.`);
        return;
    }
    deletingId = entry.id;
    document.getElementById("delete-entry-message").textContent =
        `Delete “${entry.name}” and its connections? This cannot be undone.`;
    physics.pause();
    deleteDialog.showModal();
});
document.getElementById("cancel-delete-entry").addEventListener("click", () => deleteDialog.close());
deleteDialog.addEventListener("close", () => {
    deletingId = null;
    if (!document.hidden && !dialog.open) physics.resume();
});
document.getElementById("delete-entry-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const entry = entries.get(deletingId);
    if (!entry || builtInIds.has(entry.id) || galaxyModel.childrenOf(entries, entry.id).length) {
        deleteDialog.close();
        reportAction("This entry cannot be deleted while it has children.");
        return;
    }
    nodes.get(entry.id).remove();
    nodes.delete(entry.id);
    entries.delete(entry.id);
    layout.delete(entry.id);
    for (let i = relationships.length - 1; i >= 0; i--) {
        if (relationships[i].from === entry.id || relationships[i].to === entry.id) relationships.splice(i, 1);
    }
    clearSelection();
    rebuildConnections();
    syncPhysicsGraph();
    saveGalaxy();
    deleteDialog.close();
    addEntryButton.focus();
    refreshSearchResults();
});

function focusEntry(id) {
    const entry = entries.get(id);
    if (!entry || activeNodeDrags || pan) return;
    autoFitPending = false;
    selectEntry(entry, nodes.get(id));
    const { left, right, top, bottom } = physics.bounds;
    const usefulScale = Math.max(entry.role === "entry" ? 1.15 : 1, Math.min(1.5, camera.view.scale));
    // Center in the usable graph area, leaving the fixed panel and controls visible.
    camera.setView({ x: (left + right) / 2 - entry.x * usefulScale,
        y: (top + bottom) / 2 - entry.y * usefulScale, scale: usefulScale });
    searchResults.hidden = true;
    searchOpen = false;
    searchField.blur();
}

function refreshSearchResults() {
    searchResultList.replaceChildren();
    const matches = galaxyModel.search(entries, searchField.value);
    const matchIds = new Set(matches.map(entry => entry.id));
    nodes.forEach((node, id) => node.classList.toggle("search-match", matchIds.has(id)));
    searchResults.hidden = !searchOpen || !searchField.value.trim();
    matches.slice(0, 8).forEach((entry) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        const parent = entries.get(entry.parentId);
        button.textContent = `${entry.name} · ${entryRoles[entry.role].name}${parent ? ` · ${parent.name}` : ""}`;
        button.addEventListener("click", () => focusEntry(entry.id));
        item.appendChild(button);
        searchResultList.appendChild(item);
    });
    document.getElementById("search-status").textContent = matches.length ?
        `${matches.length} ${matches.length === 1 ? "match" : "matches"}${matches.length > 8 ? " · showing the first 8" : ""}` : "No matching entries.";
}
searchField.addEventListener("input", () => { searchOpen = true; refreshSearchResults(); });
searchField.addEventListener("focus", () => { searchOpen = true; refreshSearchResults(); });
searchField.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        const first = galaxyModel.search(entries, searchField.value)[0];
        if (first) focusEntry(first.id);
    } else if (event.key === "ArrowDown") {
        event.preventDefault();
        searchResultList.querySelector("button")?.focus();
    }
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dialog.open && !deleteDialog.open) {
        searchOpen = false;
        searchResults.hidden = true;
    }
});
document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".entry-search")) {
        searchOpen = false;
        searchResults.hidden = true;
    }
});

initializeGalaxy();
if (sampleMode) {
    sampleControls.classList.add("sample-active");
    sampleModeLabel.textContent = "Sample galaxy";
    sampleModeCount.textContent = `(${entries.size} temporary entries)`;
}
loadSampleButton.disabled = sampleMode;
removeSampleButton.disabled = !sampleMode;
updateGraphViewport();
syncPhysicsGraph();
fitGalaxy(false);

const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
physics.setReducedMotion(motionPreference.matches);
camera.setReducedMotion(motionPreference.matches);
motionPreference.addEventListener("change", (event) => {
    physics.setReducedMotion(event.matches);
    camera.setReducedMotion(event.matches);
});

window.addEventListener("resize", () => {
    renderBackground();
    updateGraphViewport();
    updateOrbitGuides();
});
window.addEventListener("pagehide", () => {
    if (graphNeedsSave) {
        saveGalaxy();
    }
});
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        physics.pause();
        if (graphNeedsSave) {
            saveGalaxy();
        }
    } else if (!dialog.open && !deleteDialog.open) {
        physics.resume();
    }
});
