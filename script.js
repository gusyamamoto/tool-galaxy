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
const panelAncestry = document.getElementById("panel-ancestry");
const regionsLayer = document.getElementById("regions-layer");
const regions = new Map();
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
// Parent-relative arrangement influences and exact pins are separate from content.
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
let cameraViewReady = false;
let lastRegionSample = -Infinity, lastRegionFrame = 0;
let semanticDetail = cosmosView.detail(1);
const focusRevealIds = new Set();
const smoothDetail = (scale, start, end) => cosmosView.smooth(scale, start, end);
const renderBackground = createUniverseBackground(galaxy);
const camera = new GraphCamera({
    onRest() {
        if (focusRevealIds.size) { focusRevealIds.clear(); renderGraph(); }
    },
    onChange({ x, y, scale }) {
        graphWorld.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
        // SVG geometry stays in world space. Bodies are sized and projected in
        // screen space, so zoom paints gradients and text at native resolution
        // instead of magnifying a previously composited DOM world layer.
        graphViewport.style.setProperty("--camera-scale", scale);
        graphViewport.style.setProperty("--native-label-scale", Math.min(1, scale / 0.62));
        const detail = semanticDetail = cosmosView.detail(scale);
        for (const role of ["sun", "planet", "moon", "satellite"]) {
            graphViewport.style.setProperty(`--${role}-detail`, detail[role]);
            graphViewport.style.setProperty(`--${role}-render-scale`, scale * (.72 + detail[role] * .28));
            if (role !== "sun") graphViewport.style.setProperty(`--${role}-label-detail`, detail[`${role}Label`]);
        }
        graphViewport.style.setProperty("--surface-detail", smoothDetail(scale, 0.5, 1));
        graphViewport.style.setProperty("--orbit-detail", detail.guides);
        graphViewport.style.setProperty("--galaxy-cloud-detail", detail.clouds);
        graphViewport.style.setProperty("--galaxy-label-size", `${14 + 2 * (1 - smoothDetail(scale, .18, .50))}px`);
        galaxy.dataset.detailLevel = detail.tier;
        zoomLevel.textContent = `${Math.round(scale * 100)}%`;
        updateRegionFootprints();
        renderRegions();
        entries.forEach(entry => renderNode(entry, nodes.get(entry.id)));
        updateConnections();
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
    dismissTemporaryReveal();
    const rect = graphViewport.getBoundingClientRect();
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
    const delta = Math.max(-240, Math.min(240, event.deltaY * units));
    camera.zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-delta * 0.0018));
}, { passive: false });

graphViewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || pan || activeNodeDrags || event.target.closest(".entry-node")) return;
    autoFitPending = false;
    dismissTemporaryReveal();
    camera.stopAnimation();
    const point = { x: event.clientX - graphViewport.getBoundingClientRect().left, y: event.clientY - graphViewport.getBoundingClientRect().top };
    // Clouds stay in a non-intercepting paint layer. Hit-test their visible core
    // behind bodies so space remains pannable and a click can focus the region.
    const candidates = [...regions].filter(([, r]) => r.dataset.semanticHidden !== "true" && r.dataset.culled !== "true")
        .map(([id, r]) => ({ id, distance: ((point.x-r.renderX)/(r.renderWidth*.4)) ** 2 + ((point.y-r.renderY)/(r.renderHeight*.4)) ** 2 }))
        .filter(r => r.distance <= 1).sort((a, b) => a.distance - b.distance);
    pan = { id: event.pointerId, x: event.clientX, y: event.clientY, view: { ...camera.view }, galaxyId: candidates[0]?.id, moved: false };
    graphViewport.setPointerCapture(event.pointerId);
    graphViewport.classList.add("is-panning");
});
graphViewport.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pan?.id) return;
    if (Math.hypot(event.clientX - pan.x, event.clientY - pan.y) > 3) pan.moved = true;
    camera.panTo(pan.view.x + event.clientX - pan.x, pan.view.y + event.clientY - pan.y);
});
function endPan(event) {
    if (event.pointerId !== pan?.id) return;
    const galaxyId = event.type === "pointerup" && !pan.moved ? pan.galaxyId : null;
    pan = null;
    graphViewport.classList.remove("is-panning");
    if (graphViewport.hasPointerCapture(event.pointerId)) graphViewport.releasePointerCapture(event.pointerId);
    if (galaxyId) focusEntry(galaxyId);
}
["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => graphViewport.addEventListener(type, endPan));
document.getElementById("reset-view-button").addEventListener("click", () => {
    autoFitPending = !physics.settled;
    fitGalaxy();
});

const physics = new GalaxyPhysics({
    onPlacementChange(id, placement) { if (placement) layout.set(id, placement); else layout.delete(id); },
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
        updateRegionFootprints(true);
        renderGraph();
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
        entries: [...entries.values()].map(({ id, name, description, category, parentId, x, y, appearance }) =>
            ({ id, name, description, category, parentId, x, y, ...(appearance ? { appearance } : {}) })),
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
    (sampleMode || (saved && !saved.legacy) ? [] : initialEntries).forEach((initialEntry) => {
        const stored = records.find((entry) => entry?.id === initialEntry.id);
        const entry = galaxyModel.normalizeEntry({ ...initialEntry, ...stored }) ||
            galaxyModel.normalizeEntry(initialEntry);
        entries.set(entry.id, entry);
    });
    records.forEach((record) => {
        const entry = galaxyModel.normalizeEntry(record);
        if (entry && !entries.has(entry.id)) entries.set(entry.id, entry);
        if (!entry && !(saved?.legacy && builtInIds.has(record?.id)) && !sampleMode) {
            storageAvailable = false;
            reportStorageFailure("Some saved entries are invalid. The original saved data is preserved; changes are available for this session only.");
        }
    });
    if (!sampleMode && (!saved || saved.migrateTree)) {
        galaxyModel.migrateLegacy(entries, [...initialEntries, ...records]);
        graphNeedsSave = true;
    } else galaxyModel.normalizeHierarchy(entries);
    if (sampleMode) entries.forEach(entry => { entry.seedLayout = true; });
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
    panelParent.textContent = parent ? `Parent: ${parent.name}` : "Universe · Top-level Galaxy";
    panelAncestry.replaceChildren();
    [...galaxyModel.ancestors(entries, entry.id)].reverse().forEach(ancestor => {
        const button = document.createElement("button");
        button.type = "button"; button.textContent = ancestor.name;
        button.addEventListener("click", () => focusEntry(ancestor.id));
        panelAncestry.appendChild(button);
    });
    panelAncestry.hidden = !parent;
    addEntryButton.textContent = `Add ${entryRoles[galaxyModel.roleAtDepth(entry.depth + 1)].name}`;
    panelParent.hidden = false;
    entryActions.hidden = false;
    deleteEntryButton.hidden = builtInIds.has(entry.id);
    actionStatus.hidden = true;
    updatePlacementControls();
    updateHierarchyEmphasis();
}

function updateHierarchyEmphasis() {
    const id = selectedNode?.dataset.entryId, selected = physics.particles.get(id);
    galaxy.classList.toggle("has-selection", !!selected);
    const ancestorIds = new Set(selected ? galaxyModel.ancestors(entries, id).map(entry => entry.id) : []);
    const relatedIds = new Set(ancestorIds);
    if (selected) {
        physics.children.get(id)?.forEach(node => relatedIds.add(node.id));
        if (selected.parent) physics.children.get(selected.parent.id).forEach(node => relatedIds.add(node.id));
        connections.filter(link => link.kind === "relationship").forEach(({ from, to }) => {
            if (from === id) relatedIds.add(to); if (to === id) relatedIds.add(from);
        });
    }
    nodes.forEach((element, nodeId) => {
        const particle = physics.particles.get(nodeId);
        element.classList.toggle("related", relatedIds.has(nodeId));
        element.classList.toggle("selected-ancestor", ancestorIds.has(nodeId));
        element.classList.toggle("in-system", !!selected && particle?.systemId === selected.systemId && !!selected.systemId);
        element.classList.toggle("in-galaxy", !!selected && particle?.galaxyId === selected.galaxyId);
    });
    lines.forEach(({ from, to, element }) => element.classList.toggle("selected", from === id || to === id));
    entries.forEach(entry => renderNode(entry, nodes.get(entry.id)));
    updateConnections(); updateOrbitGuides();
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
    node.addEventListener("click", event => {
        if (event.detail && didMove) return;
        if (entry.depth <= 1) focusEntry(entry.id);
        else selectEntry(entry, node);
    });
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
        dismissTemporaryReveal();
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
        renderNode(entry, node);
        if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
        if (didMove) {
            if (placement) layout.set(entry.id, placement); else layout.delete(entry.id);
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
    node.dataset.role = entry.role; node.dataset.depth = entry.depth;
    node.dataset.body = entryRoles[entry.role].body;
    node.style.setProperty("--body-scale", entryRoles[entry.role].scale);
    const style = galaxyAppearance.resolve(entry), hash = style.seed;
    node.dataset.archetype = style.archetype;
    node.dataset.surface = style.archetype === "gas-giant" ? "gaseous" : style.archetype;
    node.dataset.rings = String(style.rings);
    node.style.setProperty("--body-hue", style.hue);
    node.style.setProperty("--surface-angle", `${style.angle}deg`);
    let ring = node.querySelector(".planet-rings");
    if (style.rings && !ring) { ring = document.createElement("span"); ring.className = "planet-rings"; ring.setAttribute("aria-hidden", "true"); node.prepend(ring); }
    if (!style.rings) ring?.remove();
    node.querySelector(".satellite-craft")?.remove();
    if (entry.role === "satellite") node.insertAdjacentHTML("afterbegin", galaxyAppearance.satellite(style));
    if (entry.role === "galaxy") {
        let region = regions.get(entry.id);
        if (!region) { region = document.createElement("canvas"); region.width = region.height = 512; region.className = "galaxy-region"; regions.set(entry.id, region); regionsLayer.appendChild(region); }
        region.dataset.archetype = style.archetype;
        galaxyAppearance.prepareCloud(region, style);
    } else if (entry.role !== "satellite") {
        regions.get(entry.id)?.remove(); regions.delete(entry.id);
        const texture = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="terrain"><feTurbulence type="fractalNoise" baseFrequency=".075 .11" numOctaves="3" seed="${hash % 997}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="1.8" intercept="-.4"/><feFuncG type="linear" slope="1.8" intercept="-.4"/><feFuncB type="linear" slope="1.8" intercept="-.4"/></feComponentTransfer></filter><rect width="100%" height="100%" filter="url(#terrain)"/></svg>`;
        // Metadata/parent edits keep an existing baked field for this stable ID.
        if (!node.dataset.textureReady) node.style.setProperty("--surface-map", `url("data:image/svg+xml,${encodeURIComponent(texture)}")`);
    } else {
        regions.get(entry.id)?.remove(); regions.delete(entry.id);
    }
    node.querySelector(".node-label").textContent = entry.name; node.title = entry.name;
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
    return baseNodeRadius * (entry ? entryRoles[entry.role].scale : 1);
}

function syncPhysicsGraph() {
    galaxyModel.normalizeHierarchy(entries);
    entries.forEach(entry => updateEntryNode(entry, nodes.get(entry.id)));
    physics.setGraph([...entries.values()].map(({ id, role, depth, parentId, x, y, seedLayout }) =>
        ({ id, role, depth, parentId, x, y, seedLayout, sizeScale: entryRoles[role].scale })), connections, layout);
    // Seeding and restoring pins can move fresh particles synchronously. Use the
    // actual coordinates for the first render, save and Add/focus handoff.
    physics.particles.forEach((particle, id) => {
        const entry = entries.get(id);
        if (entry.x !== particle.x || entry.y !== particle.y) graphNeedsSave = true;
        entry.x = particle.x; entry.y = particle.y;
    });
    entries.forEach(entry => { entry.seedLayout = false; });
    // Reparenting invalidates only relative influences, never exact pins.
    layout.forEach((placement, id) => {
        if (!placement.pinned && placement.parentId !== entries.get(id)?.parentId) layout.delete(id);
    });
    updateRegionFootprints(true);
    rebuildOrbitGuides(); updateHierarchyEmphasis(); renderGraph();
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
    updateRegionFootprints(true);
    const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    // Include simplified/hidden descendants too: changing zoom must not crop them.
    entries.forEach(entry => {
        if (entry.depth === 0) return;
        const radius = getNodeRadius(entry);
        bounds.left = Math.min(bounds.left, entry.x - radius - 28);
        bounds.right = Math.max(bounds.right, entry.x + radius + 28);
        bounds.top = Math.min(bounds.top, entry.y - radius - 12);
        bounds.bottom = Math.max(bounds.bottom, entry.y + radius + 44);
    });
    regions.forEach((element, id) => {
        const root = physics.particles.get(id);
        if (!root || !element.footprint) return;
        // Include current and eventual cloud extents while its size eases.
        for (const region of [element.footprint, element.footprint.target]) {
            const x = root.x + region.offsetX, y = root.y + region.offsetY;
            bounds.left = Math.min(bounds.left, x - region.width / 2 - 28);
            bounds.right = Math.max(bounds.right, x + region.width / 2 + 28);
            bounds.top = Math.min(bounds.top, y - region.height / 2 - 28);
            bounds.bottom = Math.max(bounds.bottom, y + region.height / 2 + 28);
        }
    });
    return bounds;
}

function fitGalaxy(animate = true) {
    dismissTemporaryReveal();
    camera.fitBounds(galaxyBounds(), physics.bounds, { padding: 32, animate });
}

function dismissTemporaryReveal() {
    focusRevealIds.clear();
    searchOpen = false;
    searchResults.hidden = true;
    renderGraph();
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
    const particle = physics.particles.get(entry.id);
    const region = regions.get(entry.id)?.footprint;
    const point = region ? camera.worldToScreen(entry.x + region.offsetX, entry.y + region.offsetY) : camera.worldToScreen(entry.x, entry.y);
    if (region) point.y -= Math.max(140, region.height * camera.view.scale) * .36;
    const revealed = focusRevealIds.has(entry.id) || node.classList.contains("dragging") ||
        (searchOpen && node.matches(".search-match,.search-ancestor"));
    node.classList.toggle("temporarily-revealed", revealed);
    const hidden = entry.depth > 0 && !revealed && semanticDetail[entry.role] < .02;
    if (node.dataset.semanticHidden !== String(hidden)) node.dataset.semanticHidden = String(hidden);
    if (node.inert !== hidden) node.inert = hidden;
    const margin = Math.max(100, getNodeRadius(entry) * camera.view.scale * 2 + 64);
    const culled = point.x + margin < 0 || point.y + margin < 0 ||
        point.x - margin > window.innerWidth || point.y - margin > window.innerHeight;
    if (node.dataset.culled !== String(culled)) node.dataset.culled = String(culled);
    if (cameraViewReady && particle && !culled && !hidden && entry.depth > 0 && entry.role !== "satellite" && camera.view.scale >= .68) galaxyAppearance.prepareTextures(node, getNodeRadius(entry) * 2 * camera.view.scale);
    if (node.renderX === point.x && node.renderY === point.y) return;
    node.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`;
    node.renderX = point.x;
    node.renderY = point.y;
}

function renderGraph() {
    updateRegionFootprints();
    renderRegions();
    entries.forEach((entry) => renderNode(entry, nodes.get(entry.id)));
    updateConnections();
    updateOrbitGuides();
}

function updateRegionFootprints(force = false) {
    const now = performance.now(), elapsed = lastRegionFrame ? now - lastRegionFrame : 16;
    if (force || now - lastRegionSample >= 250) {
        const members = new Map([...regions.keys()].map(id => [id, []]));
        physics.particles.forEach(node => { if (node.depth > 0) members.get(node.galaxyId)?.push(node); });
        regions.forEach((element, id) => {
            const root = physics.particles.get(id);
            if (root) element.regionTarget = cosmosView.regionTarget(root, members.get(id));
        });
        lastRegionSample = now;
    }
    regions.forEach(element => {
        if (element.regionTarget) element.footprint = cosmosView.updateRegion(element.footprint, element.regionTarget, elapsed);
    });
    lastRegionFrame = now;
}

function renderRegions() {
    const hidden = semanticDetail.clouds === 0;
    regions.forEach((element, id) => {
        if (element.dataset.semanticHidden !== String(hidden)) element.dataset.semanticHidden = String(hidden);
        if (hidden) return;
        const particle = physics.particles.get(id);
        const footprint = element.footprint;
        if (!particle || !footprint) return;
        const point = camera.worldToScreen(particle.x + footprint.offsetX, particle.y + footprint.offsetY);
        // Tiny simulation drift should not repaint a large background every tick.
        point.x = Math.round(point.x * 2) / 2; point.y = Math.round(point.y * 2) / 2;
        const width = Math.max(160, Math.round(footprint.width * camera.view.scale / 4) * 4);
        const height = Math.max(140, Math.round(footprint.height * camera.view.scale / 4) * 4);
        const culled = point.x + width / 2 < 0 || point.y + height / 2 < 0 ||
            point.x - width / 2 > window.innerWidth || point.y - height / 2 > window.innerHeight;
        if (element.dataset.culled !== String(culled)) element.dataset.culled = String(culled);
        if (element.renderX !== point.x || element.renderY !== point.y || element.renderWidth !== width || element.renderHeight !== height) {
            element.style.transform = `translate(${point.x}px, ${point.y}px) scale(${width / 512}, ${height / 512}) translate(-50%, -50%)`;
            element.renderX = point.x; element.renderY = point.y; element.renderWidth = width; element.renderHeight = height;
        }
    });
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
    const contextParents = new Set();
    if (selected?.systemId) contextParents.add(selected.systemId);
    if (selected && camera.view.scale >= cosmosView.tiers.close) {
        if (selected.childOrbit) contextParents.add(selected.id);
        if (selected.parent?.depth >= 2) contextParents.add(selected.parentId);
    }

    orbitGuides.forEach(({ id, element }) => {
        const parent = physics.particles.get(id);
        const active = !!parent && camera.view.scale > cosmosView.tiers.system && parent.systemId === systemId &&
            (selected ? contextParents.has(id) : parent.depth === 1);
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
    const ancestry = selected ? new Set([selected.id, ...galaxyModel.ancestors(entries, selected.id).map(entry => entry.id)]) : new Set();
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
            const selectedAncestry = selected?.depth >= 3 && ancestry.has(to) && ancestry.has(from) && fromEntry.depth > 0;
            const stretched = selected && (from === selected.id || to === selected.id) && child &&
                Math.hypot(toEntry.x - fromEntry.x, toEntry.y - fromEntry.y) > child.orbitRadius * 1.6;
            element.classList.toggle("context-link", camera.view.scale > cosmosView.tiers.system && (!!selectedAncestry || !!stretched || physics.dragging.has(to)));
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
        checkbox.disabled = checkbox.value === parentField.value;
        if (checkbox.disabled) checkbox.checked = false;
    });
}

function updateFormRole() {
    const parent = entries.get(parentField.value), depth = parent ? parent.depth + 1 : 0;
    roleField.dataset.role = galaxyModel.roleAtDepth(depth);
    roleField.textContent = `${entryRoles[roleField.dataset.role].name} · Depth ${depth}`;
    document.getElementById("parent-help").textContent = parent ? `Child of ${parent.name}. Its descendants move with this branch.` : "A top-level Galaxy in the Universe.";
    if (!editingId) {
        document.getElementById("add-entry-title").textContent = `Add ${entryRoles[roleField.dataset.role].name}`;
        submitButton.textContent = `Add ${entryRoles[roleField.dataset.role].name}`;
    }
    updateParentConnectionOption();
}
function updateParentOptions(preferredId = parentField.value) {
    clearFormError(); parentField.required = false;
    parentField.replaceChildren(new Option("Universe — new Galaxy", ""));
    const descendants = new Set(editingId ? [editingId] : []);
    entries.forEach(entry => {
        if (editingId && galaxyModel.ancestors(entries, entry.id).some(ancestor => ancestor.id === editingId)) descendants.add(entry.id);
    });
    [...entries.values()].filter(entry => !descendants.has(entry.id)).sort((a,b) => a.depth - b.depth || a.name.localeCompare(b.name)).forEach(entry => {
        const path = [...galaxyModel.ancestors(entries, entry.id)].reverse().map(ancestor => ancestor.name);
        parentField.add(new Option(`${[...path, entry.name].join(" / ")} · ${entryRoles[entry.role].name}`, entry.id));
    });
    parentField.value = entries.has(preferredId) && !descendants.has(preferredId) ? preferredId : "";
    updateFormRole();
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
    }
    updateParentOptions(entry ? entry.parentId || "" : selectedNode?.dataset.entryId || "");
    populateConnectionOptions();
    physics.pause();
    dialog.showModal();
}

addEntryButton.addEventListener("click", () => openEntryForm());
editEntryButton.addEventListener("click", () => {
    const entry = entries.get(selectedNode?.dataset.entryId);
    if (entry) openEntryForm(entry);
});
parentField.addEventListener("change", () => {
    clearFormError();
    updateFormRole();
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
        parentId: parentField.value || null
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
        ...getNewEntryPosition(data.parentId ? [data.parentId] : targetIds, roleField.dataset.role), seedLayout: true
    };
    const oldParentId = entry.parentId;
    Object.assign(entry, data);
    entries.set(entry.id, entry);
    if (oldParentId !== data.parentId && !layout.get(entry.id)?.pinned) layout.delete(entry.id);
    galaxyModel.normalizeHierarchy(entries);
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
    if (node.inert) focusEntry(entry.id);
    else revealEntry(entry);
    node.focus({ preventScroll: true });
    refreshSearchResults();
});

function clearSelection() {
    focusRevealIds.clear();
    selectedNode = null;
    addEntryButton.textContent = "Add Galaxy";
    panelAncestry.hidden = true;
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
    const pinned = layout.get(id)?.pinned === true;
    panelPlacement.textContent = pinned ? "Position: Pinned" : "Position: Flowing";
    panelPlacement.hidden = false;
    pinPositionButton.textContent = pinned ? "Unpin position" : "Pin position";
}
pinPositionButton.addEventListener("click", () => {
    const entry = entries.get(selectedNode?.dataset.entryId);
    if (!entry || activeNodeDrags) return;
    const placement = physics.setPlacement(entry.id, layout.get(entry.id)?.pinned ? null : { x: entry.x, y: entry.y, pinned: true });
    if (placement) layout.set(entry.id, placement); else layout.delete(entry.id);
    updatePlacementControls(); saveGalaxy();
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
    regions.get(entry.id)?.remove(); regions.delete(entry.id);
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
    focusRevealIds.clear();
    searchOpen = false;
    searchResults.hidden = true;
    searchField.blur();
    if (entry.depth >= 2) {
        focusRevealIds.add(id);
        galaxyModel.ancestors(entries, id).forEach(ancestor => focusRevealIds.add(ancestor.id));
    }
    selectEntry(entry, nodes.get(id));
    const { left, right, top, bottom } = physics.bounds;
    const particle = physics.particles.get(id);
    if (entry.depth <= 1) {
        const members = entry.depth === 0 ? physics.ordered.filter(node => node.galaxyId === id && node.depth > 0) : physics.systems.get(id).members;
        const positions = cosmosView.normalPositions(particle, members);
        const bounds = { left: entry.x - 48, right: entry.x + 48, top: entry.y - 48, bottom: entry.y + 48 };
        members.forEach(node => {
            const point = positions.get(node), margin = node.radius + 28;
            bounds.left = Math.min(bounds.left, point.x - margin); bounds.right = Math.max(bounds.right, point.x + margin);
            bounds.top = Math.min(bounds.top, point.y - margin); bounds.bottom = Math.max(bounds.bottom, point.y + margin + 20);
        });
        if (entry.depth === 1) {
            // Symmetric bounds keep the Sun at the center of its whole local tree.
            const rx = Math.max(entry.x - bounds.left, bounds.right - entry.x), ry = Math.max(entry.y - bounds.top, bounds.bottom - entry.y);
            Object.assign(bounds, { left: entry.x-rx, right: entry.x+rx, top: entry.y-ry, bottom: entry.y+ry });
        }
        camera.fitBounds(bounds, physics.bounds, { padding: 36, maxScale: entry.depth === 0 ? .58 : .82 });
        return;
    }
    const usefulScale = Math.max(entry.depth >= 4 ? 1.7 : entry.depth === 3 ? 1.2 : 1, Math.min(1.8, camera.view.scale));
    // Center in the usable graph area, leaving the fixed panel and controls visible.
    camera.setView({ x: (left + right) / 2 - entry.x * usefulScale,
        y: (top + bottom) / 2 - entry.y * usefulScale, scale: usefulScale });
}

function refreshSearchResults() {
    searchResultList.replaceChildren();
    const matches = galaxyModel.search(entries, searchField.value);
    const revealed = new Set(matches.flatMap(entry => galaxyModel.ancestors(entries, entry.id).map(ancestor => ancestor.id)));
    nodes.forEach((node, id) => node.classList.toggle("search-ancestor", revealed.has(id)));
    const matchIds = new Set(matches.map(entry => entry.id));
    nodes.forEach((node, id) => node.classList.toggle("search-match", matchIds.has(id)));
    entries.forEach(entry => renderNode(entry, nodes.get(entry.id)));
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
        dismissTemporaryReveal();
    }
});
document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".entry-search")) {
        dismissTemporaryReveal();
    }
});

initializeGalaxy();
addEntryButton.textContent = "Add Galaxy";
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
cameraViewReady = true;

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
