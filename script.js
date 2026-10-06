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
const entryActions = document.getElementById("entry-actions");
const editEntryButton = document.getElementById("edit-entry-button");
const deleteEntryButton = document.getElementById("delete-entry-button");
const actionStatus = document.getElementById("entry-action-status");
const panelAncestry = document.getElementById("panel-ancestry");
const regionsLayer = document.getElementById("regions-layer");
const regions = new Map();
const roleField = document.getElementById("entry-role");
const parentField = document.getElementById("entry-parent");
const formError = document.getElementById("entry-form-error");
const submitButton = document.getElementById("entry-submit");
const addEntryButton = document.getElementById("add-entry-button");
const addChildButton = document.getElementById("add-child-button");
const contextMenu = document.getElementById("entry-context-menu");
const creationContext = document.getElementById("creation-context");
const dialog = document.getElementById("add-entry-dialog");
const form = document.getElementById("add-entry-form");
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
// Parent-relative arrangement influences are separate from content.
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
let contextualParentId = null;
let deletingId = null;
let deleteConfirmationIds = null, crudActive = false;
let panelChangeActive = false;
let deletionBusy = false;
const deletingContentIds = new Set();
let contextEntryId = null, contextReturnFocus = null;
let searchOpen = false;
let connectionSourceId = null, hoveredEntryId = null;
let hoveredConnectionId = null, connectionPointer = null, touchConnectionPreview = null;
const connectionHint = document.getElementById("connection-hint");
const connectionPicker = document.getElementById("connection-picker");
const connectionSearch = document.getElementById("connection-search");
const connectionResults = document.getElementById("connection-results");
const connectionStatus = document.getElementById("connection-status");
let keyboardNavigation = false;
document.addEventListener("keydown", event => {
    if (event.key === "Tab") keyboardNavigation = true;
});
document.addEventListener("pointerdown", () => { keyboardNavigation = false; }, true);
let autoFitPending = true;
let baseNodeRadius = 13;
let cameraViewReady = false;
let lastRegionSample = -Infinity, lastRegionFrame = 0;
let semanticDetail = cosmosView.detail(1);
const focusRevealIds = new Set();
const hierarchySidebar = new HierarchySidebar({ host: galaxy, persist: !sampleMode,
    onNavigate: id => connectionSourceId ? connectEntries(id) : focusEntry(id), onCreate: (id, button) => toggleContentMenu(addMenu, button, id),
    onViewportChange: animate => crudActive || panelChangeActive ? updateGraphViewport() : navigationViewportChanged(animate) });
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
        for (const role of ["sun", "planet", "moon", "satellite", "astronaut"]) {
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
    dismissConnectionHint();
    closeContextMenu();
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
    const hit = connectionSourceId ? null : hitConnection(point, event.pointerType === "touch" ? 10 : 6);
    if (!hit) dismissConnectionHint();
    // Clouds stay in a non-intercepting paint layer. Hit-test their visible core
    // behind bodies so space remains pannable and a click can focus the region.
    pan = { id: event.pointerId, x: event.clientX, y: event.clientY, view: { ...camera.view }, galaxyId: galaxyAtScreen(point), connectionId: hit?.link.id, touch: event.pointerType === "touch", moved: false };
    graphViewport.setPointerCapture(event.pointerId);
    graphViewport.classList.add("is-panning");
});
graphViewport.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pan?.id) return;
    if (Math.hypot(event.clientX - pan.x, event.clientY - pan.y) > 3 && !pan.moved) { pan.moved = true; dismissConnectionHint(); }
    if (!pan.moved) return;
    camera.panTo(pan.view.x + event.clientX - pan.x, pan.view.y + event.clientY - pan.y);
});
function endPan(event) {
    if (event.pointerId !== pan?.id) return;
    const clicked = event.type === "pointerup" && !pan.moved;
    const galaxyId = clicked ? pan.galaxyId : null;
    const connectionId = clicked ? pan.connectionId : null, touch = pan.touch;
    pan = null;
    graphViewport.classList.remove("is-panning");
    if (graphViewport.hasPointerCapture(event.pointerId)) graphViewport.releasePointerCapture(event.pointerId);
    const point = viewportPoint(event);
    const hit = connectionId && hitConnection(point, touch ? 10 : 6);
    if (hit && hit.link.id === connectionId) {
        if (touch && touchConnectionPreview?.id !== connectionId) showTouchConnection(hit, point);
        else navigateConnection(hit.link, point);
    } else if (connectionSourceId) {
        if (galaxyId) connectEntries(galaxyId); else if (clicked) cancelConnectionMode();
    } else if (galaxyId) focusEntry(galaxyId);
    else if (clicked) closeInspector();
}
["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => graphViewport.addEventListener(type, endPan));
function galaxyAtScreen(point) {
    return [...regions].filter(([, r]) => r.dataset.semanticHidden !== "true" && r.dataset.culled !== "true")
        .map(([id, r]) => ({ id, distance: ((point.x-r.renderX)/(r.renderWidth*.4)) ** 2 + ((point.y-r.renderY)/(r.renderHeight*.4)) ** 2 }))
        .filter(r => r.distance <= 1).sort((a, b) => a.distance - b.distance)[0]?.id;
}
function viewportPoint(event) {
    const rect = graphViewport.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
function connectionSegment(link) {
    return { start: camera.worldToScreen(link.element.renderFromX, link.element.renderFromY),
        end: camera.worldToScreen(link.element.renderToX, link.element.renderToY) };
}
function hitConnection(point, tolerance = 6) {
    if (connectionSourceId || activeNodeDrags) return null;
    const selectedId = selectedNode?.dataset.entryId, hits = [];
    lines.forEach(link => {
        if (!link.interactive || link.element.style.display === "none") return;
        const { start, end } = connectionSegment(link), nearest = connectionView.nearest(point, start, end);
        if (nearest.distance <= tolerance) hits.push({ link, ...nearest, incident: link.from === selectedId || link.to === selectedId });
    });
    // At near-equal crossings prefer the selected entry's link, then a stable
    // ID; otherwise the nearest line wins, independently of SVG insertion order.
    return connectionView.pick(hits);
}
function setConnectionHover(link) {
    if (hoveredConnectionId === (link?.id || null)) return;
    const previous = lines.find(line => line.id === hoveredConnectionId);
    if (previous) [previous.from, previous.to].forEach(id => nodes.get(id)?.classList.remove("connection-hover-endpoint"));
    hoveredConnectionId = link?.id || null;
    if (link) [link.from, link.to].forEach(id => nodes.get(id)?.classList.add("connection-hover-endpoint"));
}
function dismissConnectionHint() {
    const changed = !!hoveredConnectionId;
    setConnectionHover(null); connectionPointer = null; touchConnectionPreview = null;
    connectionHint.hidden = true; graphViewport.classList.remove("over-connection");
    if (changed) updateConnections();
}
function positionConnectionHint(point) {
    const rect = graphViewport.getBoundingClientRect(), bounds = connectionHint.getBoundingClientRect();
    connectionHint.style.left = `${Math.max(8, Math.min(innerWidth - bounds.width - 8, point.x + rect.left + 12))}px`;
    connectionHint.style.top = `${Math.max(8, Math.min(innerHeight - bounds.height - 8, point.y + rect.top + 12))}px`;
}
function refreshConnectionHint() {
    if (!hoveredConnectionId || pan || activeNodeDrags) return;
    const link = lines.find(line => line.id === hoveredConnectionId);
    if (!link?.interactive || connectionSourceId) { dismissConnectionHint(); return; }
    const { start, end } = connectionSegment(link);
    let point;
    if (touchConnectionPreview) {
        point = { x: start.x + (end.x - start.x) * touchConnectionPreview.t, y: start.y + (end.y - start.y) * touchConnectionPreview.t };
    } else if (connectionPointer) {
        const nearest = connectionView.nearest(connectionPointer, start, end);
        if (nearest.distance > 6) { dismissConnectionHint(); return; }
        point = nearest;
    } else point = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const text = connectionView.description(link, entries);
    document.getElementById("connection-hint-text").textContent = text;
    connectionHint.hidden = false; connectionHint.dataset.touch = String(!!touchConnectionPreview);
    connectionHint.setAttribute("role", touchConnectionPreview ? "dialog" : "tooltip");
    connectionHint.setAttribute("aria-label", text);
    document.getElementById("connection-hint-actions").hidden = !touchConnectionPreview;
    if (touchConnectionPreview) {
        const target = entries.get(touchConnectionPreview.targetId);
        if (!target) { dismissConnectionHint(); return; }
        document.getElementById("connection-hint-go").textContent = `Go to ${target.name}`;
    }
    positionConnectionHint(point);
}
function navigateConnection(link, point) {
    const { start, end } = connectionSegment(link);
    const targetId = connectionView.destination(link, selectedNode?.dataset.entryId, point, start, end);
    dismissConnectionHint(); focusEntry(targetId, { semantic: true });
}
function showTouchConnection(hit, point) {
    const { start, end } = connectionSegment(hit.link);
    touchConnectionPreview = { id: hit.link.id, t: hit.t,
        targetId: connectionView.destination(hit.link, selectedNode?.dataset.entryId, point, start, end) };
    connectionPointer = null; setConnectionHover(hit.link); updateConnections();
}
graphViewport.addEventListener("pointermove", event => {
    if (event.pointerType === "touch" || pan || activeNodeDrags || connectionSourceId || touchConnectionPreview) return;
    if (event.target.closest(".entry-node")) { dismissConnectionHint(); return; }
    const point = viewportPoint(event), hit = hitConnection(point);
    connectionPointer = hit ? point : null;
    if (hit) {
        setConnectionHover(hit.link); graphViewport.classList.add("over-connection"); updateConnections();
    } else dismissConnectionHint();
});
graphViewport.addEventListener("pointerleave", () => { if (!touchConnectionPreview) dismissConnectionHint(); });
document.getElementById("connection-hint-go").addEventListener("click", () => {
    const id = touchConnectionPreview?.targetId; dismissConnectionHint(); if (id) focusEntry(id, { semantic: true });
});
document.getElementById("connection-hint-close").addEventListener("click", dismissConnectionHint);
document.addEventListener("pointerdown", event => {
    if (!event.target.closest("#connection-hint,#graph-viewport")) dismissConnectionHint();
});

graphViewport.addEventListener("contextmenu", event => {
    if (event.defaultPrevented) return;
    const rect = graphViewport.getBoundingClientRect();
    const id = galaxyAtScreen({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    if (id) { event.preventDefault(); openContextMenu(id, event.clientX, event.clientY); }
});

function openContextMenu(id, x, y) {
    if (activeNodeDrags || pan || !entries.has(id)) return;
    dismissConnectionHint();
    cancelConnectionMode();
    const entry = entries.get(id);
    contextReturnFocus = nodes.get(id);
    contextEntryId = id; contextMenu.dataset.entryId = id;
    selectEntry(entry, nodes.get(id), { openInspector: false });
    contextMenu.setAttribute("aria-label", `Actions for ${entry.name}`);
    document.getElementById("context-entry-name").textContent = entry.name;
    contextMenu.querySelector('[data-action="create"]').textContent = cosmosHierarchy.childContext(entries, id).action;
    contextMenu.querySelector('[data-action="delete"]').disabled = builtInIds.has(id);
    contextMenu.hidden = false;
    const bounds = contextMenu.getBoundingClientRect();
    contextMenu.style.left = `${Math.max(8, Math.min(x, innerWidth - bounds.width - 8))}px`;
    contextMenu.style.top = `${Math.max(8, Math.min(y, innerHeight - bounds.height - 8))}px`;
    contextMenu.querySelector('button:not(:disabled)').focus({ preventScroll: true });
}
function closeContextMenu(restoreFocus = false) {
    if (contextMenu.hidden) return;
    contextMenu.hidden = true; contextEntryId = null;
    if (restoreFocus && contextReturnFocus?.isConnected) {
        // Returning keyboard focus must not launch a new Cosmos focus transition.
        keyboardNavigation = false; contextReturnFocus.focus({ preventScroll: true });
    }
    contextReturnFocus = null;
}
contextMenu.addEventListener("click", event => {
    const action = event.target.closest("button")?.dataset.action, id = contextEntryId;
    if (!action || !entries.has(id)) return;
    closeContextMenu(action === "delete");
    if (action === "create") createChildEntry(id);
    else if (action === "connect") startConnectionMode(id);
    else if (action === "edit") openEntryForm(entries.get(id));
    else if (action === "delete") requestEntryDelete(id);
});
contextMenu.addEventListener("keydown", event => {
    if (event.key === "Escape" || event.key === "Tab") {
        closeContextMenu(true); if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); } return;
    }
    const buttons = [...contextMenu.querySelectorAll('button:not(:disabled)')], index = buttons.indexOf(document.activeElement);
    const target = { ArrowDown: (index + 1) % buttons.length, ArrowUp: (index + buttons.length - 1) % buttons.length, Home: 0, End: buttons.length - 1 }[event.key];
    if (target !== undefined) { event.preventDefault(); buttons[target].focus(); }
});
document.addEventListener("pointerdown", event => {
    if (!event.target.closest("#entry-context-menu")) closeContextMenu();
}, true);
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !contextMenu.hidden) { closeContextMenu(true); event.preventDefault(); }
});
// Reuse the same compact actions on tree rows, including keyboard context menus.
hierarchySidebar.tree.addEventListener("contextmenu", event => {
    const row = event.target.closest(".hierarchy-row");
    if (!row) return;
    event.preventDefault();
    openContextMenu(row.dataset.entryId, event.clientX, event.clientY);
    contextReturnFocus = row;
});
hierarchySidebar.tree.addEventListener("keydown", event => {
    const row = event.target.closest(".hierarchy-row");
    if (!row || !(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) return;
    event.preventDefault(); const rect = row.getBoundingClientRect();
    openContextMenu(row.dataset.entryId, rect.left + 40, rect.top + rect.height / 2);
    contextReturnFocus = row;
});
document.getElementById("reset-view-button").addEventListener("click", () => {
    if (hierarchySidebar.narrow) hierarchySidebar.setCollapsed(true);
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

const attachmentStore = createGalaxyAttachmentStore({ temporary: sampleMode });
if (sampleMode) galaxySample.files().forEach(record => attachmentStore.save(record));
function persistContentSnapshot() {
    if (!sampleMode) {
        if (!storageAvailable) throw new Error("Saved content is unavailable. The original data is being preserved.");
        galaxyStorage.save(getGalaxySnapshot());
    }
    graphNeedsSave = false;
}
function saveEntryContent(id, value) {
    const entry = entries.get(id);
    if (!entry || deletingContentIds.has(id)) throw new Error("This entry is being deleted or no longer exists.");
    const content = galaxyModel.normalizeContent(value,id);
    if (!content) throw new Error("Content is invalid or exceeds its text limits.");
    const previous = entry.content;
    entry.content = content;
    try { persistContentSnapshot(); }
    catch (error) { if (previous) entry.content = previous; else delete entry.content; throw error; }
}
function rollbackEntryContent(id, previous) {
    const entry = entries.get(id);
    if (!entry) return;
    if (previous) entry.content = previous; else delete entry.content;
    persistContentSnapshot();
}
const contentInspector = new EntryContentInspector({ store: attachmentStore, getEntry: id => entries.get(id),
    save: saveEntryContent, rollback: rollbackEntryContent,
    onAction() { autoFitPending = false; keyboardNavigation = false; camera.stopAnimation(); },
    onLayout() { if (cameraViewReady) updateGraphViewport(); } });

function reportStorageFailure(message) {
    storageStatus.textContent = message;
    storageStatus.hidden = false;
}

function getGalaxySnapshot() {
    return {
        entries: [...entries.values()].map(({ id, name, description, category, parentId, x, y, appearance, content }) =>
            ({ id, name, description, category, parentId, x, y, ...(appearance ? { appearance } : {}), ...(content ? { content } : {}) })),
        // Only optional relationships are stored here; hierarchy edges come from parentId.
        connections: galaxyModel.normalizeConnections(relationships, entries),
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
    if (!sampleMode && saved?.layout?.some(record => record?.pinned === true)) graphNeedsSave = true;
    [...entries.values()].forEach(createEntryNode);
    const storedLinks = sampleMode ? saved.connections :
        (!saved || saved.legacy) ? [...initialConnections, ...(saved?.connections || [])] : saved.connections;
    relationships.push(...galaxyModel.normalizeConnections(storedLinks, entries));
    if (!sampleMode && JSON.stringify(storedLinks) !== JSON.stringify(relationships)) graphNeedsSave = true;
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

function selectEntry(entry, node, { openInspector = true, reframe = false, scroll = true } = {}) {
    closeContentMenus();
    const changingEntry = selectedNode?.dataset.entryId !== entry.id;
    dismissConnectionHint();
    if (connectionSourceId && connectionSourceId !== entry.id) cancelConnectionMode();
    if (selectedNode) {
        selectedNode.classList.remove("selected");
        selectedNode.setAttribute("aria-pressed", "false");
    }

    selectedNode = node;
    node.classList.add("selected");
    node.setAttribute("aria-pressed", "true");
    panelName.textContent = entry.name;
    const parent = entries.get(entry.parentId);
    panelAncestry.replaceChildren();
    [...galaxyModel.ancestors(entries, entry.id)].reverse().forEach(ancestor => {
        const button = document.createElement("button");
        button.type = "button"; button.textContent = ancestor.name;
        button.addEventListener("click", () => focusEntry(ancestor.id));
        panelAncestry.appendChild(button);
    });
    panelAncestry.hidden = !parent;
    deleteEntryButton.hidden = builtInIds.has(entry.id);
    actionStatus.hidden = true;
    refreshInspectorConnections();
    updateHierarchyEmphasis();
    hierarchySidebar.select(entry.id, { scroll });
    if (openInspector && !activeNodeDrags) setInspectorOpen(true, { reframe });
    else { contentInspector.select(entry, !panel.hidden); if (!activeNodeDrags) updateGraphViewport(); }
    if (changingEntry) panel.scrollTop = 0;
}

function setInspectorOpen(open, { reframe = false } = {}) {
    if (activeNodeDrags || (open && !selectedNode)) return;
    if (!open) { dismissConnectionHint(); cancelConnectionMode(); closeContentMenus(); }
    if (open && hierarchySidebar.narrow) {
        panelChangeActive = true;
        try { hierarchySidebar.setCollapsed(true); } finally { panelChangeActive = false; }
    }
    const previous = { ...physics.bounds };
    const reopening = panel.hidden && open;
    panel.hidden = !open;
    if (open) contentInspector.select(entries.get(selectedNode.dataset.entryId), true);
    else contentInspector.hide();
    galaxy.classList.toggle("inspector-open", open);
    if (reopening) panel.scrollTop = 0;
    // Measure content geometry without rebuilding physics or navigating.
    // Explicit sidebar/breadcrumb focus uses these updated viewport bounds.
    if (!reframe) { updateGraphViewport(); return; }
    navigationViewportChanged(true, { keepSelectedVisible: open, previous });
}
function closeInspector(restoreFocus = false) {
    if (panel.hidden) return;
    const hadFocus = panel.contains(document.activeElement);
    setInspectorOpen(false);
    if (restoreFocus || hadFocus) {
        keyboardNavigation = false;
        const row = hierarchySidebar.rows.get(selectedNode?.dataset.entryId);
        const target = selectedNode && !selectedNode.inert && selectedNode.dataset.culled !== "true" ? selectedNode :
            !hierarchySidebar.collapsed && hierarchySidebar.tree.contains(row) ? row : hierarchySidebar.toggle;
        target.focus({ preventScroll: true });
    }
}
document.getElementById("close-inspector-button").addEventListener("click", () => closeInspector(true));

function refreshInspectorConnections() {
    const id = selectedNode?.dataset.entryId, list = document.getElementById("panel-connection-list");
    list.replaceChildren();
    relationships.filter(link => link.from === id || link.to === id).forEach(link => {
        const targetId = link.from === id ? link.to : link.from, target = entries.get(targetId);
        if (!target) return;
        const row = document.createElement("li"), navigate = document.createElement("button"), remove = document.createElement("button");
        navigate.type = remove.type = "button";
        navigate.className = "connection-name"; navigate.textContent = target.name;
        navigate.title = [...galaxyModel.ancestors(entries, targetId)].reverse().map(entry => entry.name).concat(target.name).join(" / ");
        navigate.addEventListener("click", () => { cancelConnectionMode(); focusEntry(targetId, { semantic: true }); });
        remove.className = "remove-connection"; remove.textContent = "×";
        remove.ariaLabel = `Remove connection to ${target.name}`; remove.title = remove.ariaLabel;
        remove.addEventListener("click", () => {
            const index = relationships.indexOf(link);
            if (index < 0) return;
            relationships.splice(index, 1); refreshConnectionViews(); saveGalaxy();
            document.getElementById("connect-entry-button").focus({ preventScroll: true });
            reportAction(`Connection to ${target.name} removed.`);
        });
        row.append(navigate, remove); list.appendChild(row);
    });
    list.hidden = !list.children.length;
    const count = list.children.length, connect = document.getElementById("connect-entry-button");
    document.getElementById("connection-action-label").textContent = count ? `Connections ${count}` : "Connect";
    connect.ariaLabel = count ? `View ${count} connections` : "Connect to another entry";
    connect.setAttribute("aria-controls", count ? "panel-connections" : "connection-picker");
    if (count) connect.setAttribute("aria-haspopup", "dialog"); else connect.removeAttribute("aria-haspopup");
    if (!count) { document.getElementById("panel-connections").hidden = true; connect.setAttribute("aria-expanded", "false"); }
}

function refreshConnectionViews() {
    // Relationship edits update presentation only: no graph rebuild or reheating.
    rebuildConnections(); rebuildOrbitGuides(); refreshInspectorConnections(); updateHierarchyEmphasis();
    if (connectionSourceId) refreshConnectionTargets();
    if (!panel.hidden) updateGraphViewport();
}

function startConnectionMode(id) {
    if (!entries.has(id) || activeNodeDrags || pan || dialog.open || deleteDialog.open) return;
    dismissConnectionHint();
    cancelConnectionMode(); closeContextMenu(); dismissTemporaryReveal();
    selectEntry(entries.get(id), nodes.get(id));
    connectionSourceId = id;
    galaxy.classList.add("connection-mode"); nodes.get(id).classList.add("connection-source");
    connectionPicker.hidden = false; document.getElementById("connect-entry-button").hidden = true;
    document.getElementById("connection-prompt").textContent = `Connect ${entries.get(id).name} to...`;
    connectionSearch.value = ""; refreshConnectionTargets();
    updateGraphViewport(); updateConnections(); connectionSearch.focus({ preventScroll: true });
}

function cancelConnectionMode(restoreFocus = false) {
    if (!connectionSourceId) return;
    nodes.get(connectionSourceId)?.classList.remove("connection-source");
    connectionSourceId = null; galaxy.classList.remove("connection-mode");
    connectionPicker.hidden = true; connectionResults.replaceChildren(); connectionSearch.value = "";
    document.getElementById("connect-entry-button").hidden = false;
    if (restoreFocus) document.getElementById("connect-entry-button").focus({ preventScroll: true });
    updateGraphViewport();
    updateConnections();
}

function connectEntries(targetId) {
    if (!connectionSourceId) return;
    const sourceId = connectionSourceId, error = galaxyModel.validateConnection(entries, relationships, sourceId, targetId);
    if (error) { connectionStatus.textContent = error; return; }
    const pair = galaxyModel.connectionKey(sourceId, targetId);
    relationships.push({ id: `connection:${pair}`, from: sourceId, to: targetId, type: "related" });
    cancelConnectionMode(true); refreshConnectionViews(); saveGalaxy();
    reportAction(`Connected to ${entries.get(targetId).name}.`);
}

function connectionMatches() {
    return galaxyModel.search(entries, connectionSearch.value).filter(entry => entry.id !== connectionSourceId);
}

function refreshConnectionTargets() {
    connectionResults.replaceChildren();
    const matches = connectionMatches();
    matches.slice(0, 8).forEach(entry => {
        const row = document.createElement("li"), button = document.createElement("button"), location = document.createElement("small");
        button.type = "button"; button.dataset.entryId = entry.id;
        button.append(document.createTextNode(entry.name));
        location.textContent = galaxyModel.ancestors(entries, entry.id).reverse().map(parent => parent.name).join(" / ") || "Universe";
        button.append(location);
        const duplicate = !!galaxyModel.validateConnection(entries, relationships, connectionSourceId, entry.id);
        button.disabled = duplicate;
        if (duplicate) { location.textContent += " · Already connected"; button.title = "Already connected"; }
        button.addEventListener("click", () => connectEntries(entry.id));
        row.appendChild(button); connectionResults.appendChild(row);
    });
    connectionStatus.textContent = !connectionSearch.value.trim() ? "Click an entry, or search for one. Escape cancels." :
        !matches.length ? "No matching entries." : `${matches.length} ${matches.length === 1 ? "match" : "matches"}${matches.length > 8 ? " · showing the first 8" : ""}`;
    if (!panel.hidden) updateGraphViewport();
}
document.getElementById("connect-entry-button").addEventListener("click", () => {
    const button = document.getElementById("connect-entry-button");
    if (document.getElementById("panel-connection-list").children.length) toggleContentMenu(document.getElementById("panel-connections"), button);
    else startConnectionMode(selectedNode?.dataset.entryId);
});
document.getElementById("new-connection-button").addEventListener("click", () => startConnectionMode(selectedNode?.dataset.entryId));
document.getElementById("cancel-connection").addEventListener("click", () => cancelConnectionMode(true));
connectionSearch.addEventListener("input", refreshConnectionTargets);
connectionSearch.addEventListener("keydown", event => {
    if (event.key === "ArrowDown") { event.preventDefault(); connectionResults.querySelector("button:not(:disabled)")?.focus(); }
});
connectionPicker.addEventListener("submit", event => {
    event.preventDefault();
    connectionResults.querySelector("button:not(:disabled)")?.click();
});

function updateHierarchyEmphasis() {
    const id = selectedNode?.dataset.entryId, selected = physics.particles.get(id);
    galaxy.classList.toggle("has-selection", !!selected);
    const ancestorIds = new Set(selected ? galaxyModel.ancestors(entries, id).map(entry => entry.id) : []);
    const relatedIds = new Set(ancestorIds), connectedIds = new Set();
    if (selected) {
        physics.children.get(id)?.forEach(node => relatedIds.add(node.id));
        if (selected.parent) physics.children.get(selected.parent.id).forEach(node => relatedIds.add(node.id));
        connections.filter(link => link.kind === "relationship").forEach(({ from, to }) => {
            if (from === id) { relatedIds.add(to); connectedIds.add(to); }
            if (to === id) { relatedIds.add(from); connectedIds.add(from); }
        });
    }
    nodes.forEach((element, nodeId) => {
        const particle = physics.particles.get(nodeId);
        element.classList.toggle("related", relatedIds.has(nodeId));
        element.classList.toggle("semantic-connected", connectedIds.has(nodeId));
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
        if (connectionSourceId) { connectEntries(entry.id); return; }
        if (event.detail && didMove) return;
        if (entry.depth <= 1) focusEntry(entry.id);
        else selectEntry(entry, node);
    });
    node.addEventListener("contextmenu", event => {
        event.preventDefault(); event.stopPropagation();
        const rect = node.getBoundingClientRect();
        openContextMenu(entry.id, event.clientX || rect.left + rect.width / 2, event.clientY || rect.top + rect.height / 2);
    });
    node.addEventListener("keydown", event => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault(); const rect = node.getBoundingClientRect();
            openContextMenu(entry.id, rect.left + rect.width / 2, rect.top + rect.height / 2);
        }
    });
    node.addEventListener("focus", () => {
        // Browsers can restore old focus when a window receives pointer input.
        // Only intentional keyboard navigation should move the camera on focus.
        if (!crudActive && !activeNodeDrags && !connectionSourceId && keyboardNavigation) focusEntry(entry.id);
    });
    node.addEventListener("pointerenter", () => {
        dismissConnectionHint();
        hoveredEntryId = entry.id; updateConnections();
        hoveredSystemId = physics.particles.get(entry.id)?.systemId || null;
        updateOrbitGuides();
    });
    node.addEventListener("pointerleave", event => {
        // Transfer a body's temporarily revealed line to line-hover context
        // before removing body hover, avoiding a disappearing target at its edge.
        if (event.pointerType !== "touch" && !connectionSourceId && !activeNodeDrags) {
            const point = viewportPoint(event), hit = hitConnection(point);
            if (hit && (hit.link.from === entry.id || hit.link.to === entry.id)) {
                connectionPointer = point; setConnectionHover(hit.link);
            }
        }
        if (hoveredEntryId === entry.id) hoveredEntryId = null;
        updateConnections();
        hoveredSystemId = null;
        updateOrbitGuides();
    });

    let dragPointerId = null;
    let didMove = false;
    let offsetX = 0;
    let offsetY = 0;

    node.addEventListener("pointerdown", (event) => {
        dismissConnectionHint();
        if (connectionSourceId) { didMove = false; return; }
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
            saveGalaxy();
            setInspectorOpen(true);
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
    node.querySelector(".satellite-craft,.astronaut-figure")?.remove();
    if (entry.role === "satellite") node.insertAdjacentHTML("afterbegin", galaxyAppearance.satellite(style));
    if (entry.role === "astronaut") node.insertAdjacentHTML("afterbegin", galaxyAppearance.astronaut(style));
    if (entry.role === "galaxy") {
        let region = regions.get(entry.id);
        if (!region) { region = document.createElement("canvas"); region.width = region.height = 512; region.className = "galaxy-region"; regions.set(entry.id, region); regionsLayer.appendChild(region); }
        region.dataset.archetype = style.archetype;
        galaxyAppearance.prepareCloud(region, style);
    } else if (!["satellite", "astronaut"].includes(entry.role)) {
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

function syncPhysicsGraph({ updateUI = true, reheat = .55 } = {}) {
    galaxyModel.normalizeHierarchy(entries);
    if (updateUI) entries.forEach(entry => updateEntryNode(entry, nodes.get(entry.id)));
    physics.setGraph([...entries.values()].map(({ id, role, depth, parentId, x, y, seedLayout }) =>
        ({ id, role, depth, parentId, x, y, seedLayout, sizeScale: entryRoles[role].scale })), connections, layout, { reheat });
    // Seeding can move fresh particles synchronously. Use the
    // actual coordinates for the first render, save and Add/focus handoff.
    physics.particles.forEach((particle, id) => {
        const entry = entries.get(id);
        if (entry.x !== particle.x || entry.y !== particle.y) graphNeedsSave = true;
        entry.x = particle.x; entry.y = particle.y;
    });
    entries.forEach(entry => { entry.seedLayout = false; });
    // Reparenting invalidates only that entry's parent-relative influence.
    layout.forEach((placement, id) => {
        if (placement.parentId !== entries.get(id)?.parentId) layout.delete(id);
    });
    if (!updateUI) return;
    updateRegionFootprints(true);
    hierarchySidebar.setEntries(entries);
    hierarchySidebar.select(selectedNode?.dataset.entryId);
    rebuildOrbitGuides(); updateHierarchyEmphasis(); renderGraph();
}

function updateGraphViewport() {
    const rect = galaxy.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    baseNodeRadius = parseFloat(getComputedStyle(galaxy).getPropertyValue("--node-size")) / 2;
    const radius = getNodeRadius();
    const narrow = window.matchMedia("(max-width: 760px)").matches;
    const sidebarRight = hierarchySidebar.collapsed ? 0 : hierarchySidebar.sidebar.getBoundingClientRect().right - rect.left;
    const left = sidebarRight + radius + 24;
    const top = radius + 24;
    const rightEdge = !panel.hidden && !narrow ? panelRect.left - rect.left : rect.width;
    const bottomEdge = !panel.hidden && narrow ? panelRect.top - rect.top : rect.height;
    const right = Math.max(left, rightEdge - radius - 24);
    const bottom = Math.max(top, bottomEdge - radius - 24);
    const bounds = { left, right, top, bottom };
    // Sidebar chrome changes the usable screen, never orbital targets or forces.
    if (physics.baseNodeRadius !== radius) physics.setViewport(bounds, radius);
    else physics.bounds = bounds;
}

function navigationViewportChanged(animate = true, { keepSelectedVisible = false, previous = physics.bounds } = {}) {
    autoFitPending = false;
    closeContextMenu(); dismissTemporaryReveal();
    if (hierarchySidebar.narrow && !hierarchySidebar.collapsed) {
        panel.hidden = true; galaxy.classList.remove("inspector-open");
    }
    const before = { x: (previous.left + previous.right) / 2, y: (previous.top + previous.bottom) / 2 };
    updateGraphViewport();
    const bounds = physics.bounds;
    const view = { x: camera.view.x + (bounds.left + bounds.right) / 2 - before.x,
        y: camera.view.y + (bounds.top + bounds.bottom) / 2 - before.y, scale: camera.view.scale };
    const entry = entries.get(selectedNode?.dataset.entryId);
    if (keepSelectedVisible && entry?.depth > 0) {
        const margin = Math.max(24, getNodeRadius(entry) * view.scale);
        const padX = Math.min(margin, (bounds.right - bounds.left) / 3), padY = Math.min(margin, (bounds.bottom - bounds.top) / 3);
        const x = entry.x * view.scale + view.x, y = entry.y * view.scale + view.y;
        view.x += Math.max(bounds.left + padX, Math.min(bounds.right - padX, x)) - x;
        view.y += Math.max(bounds.top + padY, Math.min(bounds.bottom - padY, y)) - y;
    }
    if (view.x !== camera.view.x || view.y !== camera.view.y) camera.setView(view, animate);
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
    dismissConnectionHint();
    dismissTemporaryReveal();
    updateGraphViewport();
    camera.fitBounds(galaxyBounds(), physics.bounds, { padding: 32, animate });
}

function dismissTemporaryReveal() {
    focusRevealIds.clear();
    searchOpen = false;
    searchResults.hidden = true;
    renderGraph();
}

// CRUD may nudge a completely offscreen item to the nearest usable edge. Never
// change scale or center a whole family; partial visibility already suffices.
function revealEntry(entry) {
    if (activeNodeDrags) return;
    const bounds = physics.bounds;
    const rect = nodes.get(entry.id).getBoundingClientRect(), viewport = graphViewport.getBoundingClientRect();
    const left = rect.left-viewport.left, right = rect.right-viewport.left;
    const top = rect.top-viewport.top, bottom = rect.bottom-viewport.top;
    const dx = right<bounds.left ? bounds.left+12-left : left>bounds.right ? bounds.right-12-right : 0;
    const dy = bottom<bounds.top ? bounds.top+12-top : top>bounds.bottom ? bounds.bottom-12-bottom : 0;
    if (dx || dy) camera.panTo(camera.view.x+dx,camera.view.y+dy);
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
    if (cameraViewReady && particle && !culled && !hidden && entry.depth > 0 && !["satellite", "astronaut"].includes(entry.role) && camera.view.scale >= .68) galaxyAppearance.prepareTextures(node, getNodeRadius(entry) * 2 * camera.view.scale);
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
    regions.forEach((element, id) => {
        const footprint = element.footprint;
        const opacity = cosmosView.cloudOpacity(camera.view.scale, physics.bounds, footprint);
        if (element.renderOpacity !== opacity) { element.style.opacity = opacity; element.renderOpacity = opacity; }
        const hidden = opacity === 0;
        if (element.dataset.semanticHidden !== String(hidden)) element.dataset.semanticHidden = String(hidden);
        if (hidden) return;
        const particle = physics.particles.get(id);
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
        element.setAttribute("aria-hidden", "true");
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
    lines.forEach(link => {
        const { id, from, to, element } = link;
        const fromEntry = entries.get(from);
        const toEntry = entries.get(to);
        // Selection clears during deletion before the derived edge list rebuilds.
        if (!fromEntry || !toEntry) return;
        const semantic = element.dataset.kind === "relationship";
        // Galaxy names are native projections above their cloud; connect to the
        // selectable name rather than an invisible root underneath the cloud.
        const anchor = entry => semantic && entry.depth === 0 ?
            camera.screenToWorld(nodes.get(entry.id).renderX, nodes.get(entry.id).renderY) : entry;
        const start = anchor(fromEntry), end = anchor(toEntry);
        if (element.renderFromX !== start.x || element.renderFromY !== start.y ||
            element.renderToX !== end.x || element.renderToY !== end.y) {
            element.setAttribute("x1", start.x);
            element.setAttribute("y1", start.y);
            element.setAttribute("x2", end.x);
            element.setAttribute("y2", end.y);
            if (element.classList.contains("astronaut-tether")) {
                const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy) || 1;
                const slack = Math.min(18, length * .18) * (galaxyAppearance.hash(`${from}:${to}`) % 2 ? 1 : -1);
                element.setAttribute("d", `M${start.x},${start.y} Q${(start.x+end.x)/2-dy/length*slack},${(start.y+end.y)/2+dx/length*slack} ${end.x},${end.y}`);
            }
            element.renderFromX = start.x;
            element.renderFromY = start.y;
            element.renderToX = end.x;
            element.renderToY = end.y;
        }
        if (semantic) {
            const focused = selected && (from === selected.id || to === selected.id);
            const lineHovered = id === hoveredConnectionId;
            const hovered = from === hoveredEntryId || to === hoveredEntryId;
            const endpointsVisible = [from, to].every(id => {
                const node = nodes.get(id);
                return node.dataset.semanticHidden !== "true" && node.dataset.culled !== "true";
            });
            // Selected links remain available across Galaxies and zoom levels;
            // unrelated links need two visible endpoints and close detail.
            const opacity = lineHovered ? .62 : focused ? (camera.view.scale < .45 ? .4 : .5) :
                hovered && camera.view.scale >= .45 ? .3 : endpointsVisible ? smoothDetail(camera.view.scale, .78, 1) * .055 : 0;
            const segment = connectionSegment(link);
            link.interactive = opacity >= .18 && !connectionSourceId &&
                connectionView.intersects(segment.start, segment.end, physics.bounds);
            const tabIndex = link.interactive ? 0 : -1;
            if (element.tabIndex !== tabIndex) element.tabIndex = tabIndex;
            element.setAttribute("aria-hidden", String(!link.interactive));
            element.setAttribute("aria-label", connectionView.description(link, entries));
            const stroke = focused || hovered || lineHovered ? 1 : .7, appearance = `${opacity}:${stroke}:${camera.view.scale}`;
            if (element.renderAppearance !== appearance) {
                element.style.opacity = opacity;
                element.style.display = opacity ? "" : "none";
                // The world is scaled by an HTML transform outside the SVG. Size
                // semantic strokes/dashes explicitly in native pixels at every zoom.
                element.style.strokeWidth = stroke / camera.view.scale;
                element.style.strokeDasharray = `${3 / camera.view.scale} ${5 / camera.view.scale}`;
                element.renderAppearance = appearance;
            }
            element.classList.toggle("hovered", !!hovered);
            element.classList.toggle("line-hovered", lineHovered);
        } else if (element.classList.contains("astronaut-tether")) {
            const parentNode = nodes.get(from), childNode = nodes.get(to);
            const endpointsVisible = [parentNode, childNode].every(node => node.dataset.semanticHidden !== "true");
            const revealed = [parentNode, childNode].every(node => node.classList.contains("temporarily-revealed"));
            const opacity = endpointsVisible ? (revealed ? .23 : semanticDetail.tethers * .18) : 0;
            element.style.opacity = opacity;
            element.style.display = opacity ? "" : "none";
            element.style.strokeWidth = .65 / camera.view.scale;
        } else {
            const child = physics.particles.get(to);
            const selectedAncestry = selected?.depth >= 3 && ancestry.has(to) && ancestry.has(from) && fromEntry.depth > 0;
            const stretched = selected && (from === selected.id || to === selected.id) && child &&
                Math.hypot(toEntry.x - fromEntry.x, toEntry.y - fromEntry.y) > child.orbitRadius * 1.6;
            element.classList.toggle("context-link", camera.view.scale > cosmosView.tiers.system && (!!selectedAncestry || !!stretched || physics.dragging.has(to)));
        }
    });
    refreshConnectionHint();
}

function rebuildConnections() {
    dismissConnectionHint();
    connections = galaxyModel.buildConnections(entries, relationships);
    connectionsLayer.replaceChildren();
    lines.length = 0;
    connections.forEach(connection => {
        const { id, from, to, kind } = connection;
        const tether = kind === "hierarchy" && entries.get(to).role === "astronaut";
        const element = document.createElementNS("http://www.w3.org/2000/svg", tether ? "path" : "line");
        element.classList.add("connection-line");
        if (tether) element.classList.add("astronaut-tether");
        element.dataset.kind = kind;
        if (id) element.dataset.connectionId = id;
        connectionsLayer.appendChild(element);
        const link = { ...connection, element, interactive: false };
        if (kind === "relationship") {
            element.setAttribute("role", "link");
            element.addEventListener("focus", () => {
                if (!link.interactive || connectionSourceId) return;
                connectionPointer = null; setConnectionHover(link); updateConnections();
            });
            element.addEventListener("blur", () => { if (hoveredConnectionId === id) dismissConnectionHint(); });
            element.addEventListener("keydown", event => {
                if (!link.interactive || connectionSourceId || activeNodeDrags || pan) return;
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                const { start, end } = connectionSegment(link);
                navigateConnection(link, { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 });
            });
        } else element.setAttribute("aria-hidden", "true");
        lines.push(link);
    });
    updateConnections();
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

function updateFormRole() {
    const parent = entries.get(parentField.value), context = cosmosHierarchy.childContext(entries, parentField.value);
    const { role } = context;
    roleField.dataset.role = role;
    roleField.textContent = entryRoles[roleField.dataset.role].name;
    document.getElementById("parent-help").textContent = parent ? `Child of ${parent.name}. Its descendants move with this branch.` : "A top-level Galaxy in the Universe.";
    if (!editingId) {
        document.getElementById("add-entry-title").textContent = context.action;
        submitButton.textContent = `Create ${entryRoles[role].name}`;
    }
    creationContext.querySelector("span").textContent = parent ? `${entryRoles[role].name} under ${parent.name}` : "A new Galaxy in the Universe";
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

function beginCrudOperation() {
    crudActive = true;
    keyboardNavigation = false;
    autoFitPending = false;
    camera.stopAnimation();
    physics.pause();
    dismissConnectionHint();
}

function finishCrudOperation() {
    if (dialog.open || deleteDialog.open) return;
    crudActive = false;
    if (!document.hidden) physics.resume();
}

// One synchronous mutation: model/derived particles -> save -> DOM/tree ->
// selection/inspector. No navigation helpers or global Fit participate.
function commitCrudMutation(mutate, { selectionId, topologyChanged = true, reveal = false,
    preserveScroll = true, inspectorOpen = !panel.hidden, persisted = false } = {}) {
    beginCrudOperation();
    const scroll = { top: hierarchySidebar.tree.scrollTop, left: hierarchySidebar.tree.scrollLeft };
    const previousSelection = selectedNode?.dataset.entryId;
    mutate();
    if (topologyChanged || selectionId !== previousSelection) focusRevealIds.clear();
    if (!entries.has(selectedNode?.dataset.entryId)) selectedNode = null;
    galaxyModel.normalizeHierarchy(entries);
    connections = galaxyModel.buildConnections(entries, relationships);
    if (topologyChanged) syncPhysicsGraph({ updateUI: false, reheat: .12 });
    if (!persisted) saveGalaxy(); else graphNeedsSave = false;
    nodes.forEach((node, id) => {
        if (entries.has(id)) return;
        node.remove(); nodes.delete(id); regions.get(id)?.remove(); regions.delete(id);
    });
    entries.forEach(entry => {
        const node = nodes.get(entry.id);
        if (!node) createEntryNode(entry);
        else if (entry.id === selectionId || node.dataset.role !== entry.role || Number(node.dataset.depth) !== entry.depth) updateEntryNode(entry, node);
    });
    rebuildConnections();
    if (topologyChanged) updateRegionFootprints(true);
    hierarchySidebar.setEntries(entries);
    const entry = entries.get(selectionId);
    if (entry) selectEntry(entry, nodes.get(entry.id), { reframe: false, openInspector: inspectorOpen, scroll: !preserveScroll });
    else clearSelection({ reframe: false });
    rebuildOrbitGuides(); refreshSearchResults(); renderGraph();
    if (preserveScroll) {
        hierarchySidebar.tree.scrollTop = scroll.top; hierarchySidebar.tree.scrollLeft = scroll.left;
    }
    if (reveal && entry) {
        revealEntry(entry);
        if (entry.depth > 0 && semanticDetail[entry.role] < .02) {
            focusRevealIds.add(entry.id);
            galaxyModel.ancestors(entries, entry.id).forEach(parent => focusRevealIds.add(parent.id));
            renderGraph();
        }
    }
}

function restoreCrudFocus() {
    keyboardNavigation = false;
    const row = hierarchySidebar.rows.get(selectedNode?.dataset.entryId);
    const target = selectedNode && !selectedNode.inert && selectedNode.dataset.culled !== "true" ? selectedNode :
        row && !hierarchySidebar.collapsed && hierarchySidebar.tree.contains(row) ? row :
            hierarchySidebar.collapsed ? hierarchySidebar.toggle : addEntryButton;
    target.focus({ preventScroll: true });
}

function openEntryForm(entry = null, parentId = null, contextual = false, mode = "info") {
    if (deletionBusy) return;
    beginCrudOperation();
    cancelConnectionMode();
    closeContextMenu();
    closeContentMenus();
    editingId = entry?.id || null;
    contextualParentId = contextual ? parentId : null;
    creationContext.hidden = true;
    document.getElementById("parent-field").hidden = !entry || mode !== "move";
    document.getElementById("entry-info-fields").hidden = !entry || mode === "move";
    document.getElementById("entry-name-field").hidden = !!entry && mode === "move";
    form.reset();
    fields.forEach((field) => field.setCustomValidity(""));
    clearFormError();
    document.getElementById("add-entry-title").textContent = entry ? mode === "move" ? "Move / change parent" : "Edit info" : "Add Entry";
    submitButton.textContent = entry ? "Save changes" : "Add Entry";
    if (entry) {
        fields[0].value = entry.name;
        fields[1].value = entry.description;
        fields[2].value = entry.category;
    }
    updateParentOptions(entry ? entry.parentId || "" : parentId || "");
    dialog.showModal();
}

function createChildEntry(parentId) {
    const context = cosmosHierarchy.childContext(entries, parentId);
    if (!context || !parentId || activeNodeDrags || deletionBusy) return;
    beginCrudOperation();
    selectEntry(entries.get(parentId), nodes.get(parentId), { reframe: false });
    openEntryForm(null, context.parentId, true);
}

document.getElementById("change-creation-parent").addEventListener("click", () => {
    contextualParentId = null; creationContext.hidden = true;
    document.getElementById("parent-field").hidden = false; parentField.focus();
});

const addMenu = document.getElementById("add-menu"), moreButton = document.getElementById("entry-more-button");
let addMenuTargetId = null, addMenuTrigger = null;
function closeContentMenus() {
    addMenu.hidden = entryActions.hidden = true;
    document.getElementById("panel-connections").hidden = true;
    document.getElementById("connect-entry-button").setAttribute("aria-expanded", "false");
    addMenuTrigger?.setAttribute("aria-expanded", "false");
    addMenuTargetId = null; addMenuTrigger = null;
    moreButton.setAttribute("aria-expanded", "false");
}
function toggleContentMenu(menu, button, targetId = null) {
    if (menu === addMenu && !entries.has(targetId)) return;
    const opening = menu.hidden || (menu === addMenu && addMenuTrigger !== button);
    closeContentMenus();
    if (!opening) return;
    menu.hidden = false; button.setAttribute("aria-expanded", "true");
    if (menu === addMenu) {
        addMenuTargetId = targetId; addMenuTrigger = button;
        menu.setAttribute("aria-label", `Add to ${entries.get(targetId).name}`);
        const rect = button.getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 190))}px`;
        menu.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - menu.offsetHeight - 8))}px`;
    }
    menu.querySelector("button:not([hidden]):not(:disabled)")?.focus({ preventScroll: true });
}
addEntryButton.addEventListener("click", () => openEntryForm());
moreButton.addEventListener("click", () => toggleContentMenu(entryActions, moreButton));
addChildButton.addEventListener("click", () => {
    const id = addMenuTargetId;
    closeContentMenus();
    if (entries.has(id)) createChildEntry(id);
});
addMenu.addEventListener("click", event => {
    const action = event.target.closest("[data-add]")?.dataset.add;
    const id = addMenuTargetId;
    if (!action || !entries.has(id)) return;
    closeContentMenus();
    autoFitPending = false; keyboardNavigation = false; camera.stopAnimation();
    if (selectedNode?.dataset.entryId !== id) selectEntry(entries.get(id), nodes.get(id), { reframe: false });
    if (panel.hidden) setInspectorOpen(true);
    if (action === "files") contentInspector.chooseFiles();
    else if (action === "note") contentInspector.editNotes();
    else if (action === "bookmark") contentInspector.editLink();
});
document.getElementById("move-entry-button").addEventListener("click", () => {
    const entry = entries.get(selectedNode?.dataset.entryId);
    if (entry) openEntryForm(entry, null, false, "move");
});
entryActions.addEventListener("click", () => closeContentMenus());
document.addEventListener("pointerdown", event => {
    if (!event.target.closest("#add-menu,.tree-add,#entry-actions,#entry-more-button,#panel-connections,#connect-entry-button")) closeContentMenus();
});
document.addEventListener("keydown", event => {
    const connectionsPanel = document.getElementById("panel-connections");
    const menu = !addMenu.hidden ? addMenu : !entryActions.hidden ? entryActions : !connectionsPanel.hidden ? connectionsPanel : null;
    if (!menu) return;
    const button = menu === addMenu ? addMenuTrigger : menu === connectionsPanel ? document.getElementById("connect-entry-button") : moreButton;
    if (event.key === "Escape" || event.key === "Tab") {
        closeContentMenus();
        if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); button.focus({ preventScroll: true }); }
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        const items = [...menu.querySelectorAll("button:not([hidden]):not(:disabled)")];
        const index = items.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus({ preventScroll: true });
    }
}, true);
editEntryButton.addEventListener("click", () => {
    const entry = entries.get(selectedNode?.dataset.entryId);
    if (entry) openEntryForm(entry);
});
parentField.addEventListener("change", () => {
    clearFormError();
    updateFormRole();
});

dialog.addEventListener("close", () => {
    finishCrudOperation();
});

function cancelEntryForm() {
    dialog.close();
    restoreCrudFocus();
}
dialog.addEventListener("cancel", event => { event.preventDefault(); cancelEntryForm(); });
document.getElementById("cancel-add-entry").addEventListener("click", cancelEntryForm);

fields.forEach((field) => {
    field.addEventListener("input", () => { field.setCustomValidity(""); clearFormError(); });
});

form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFormError();
    fields.forEach((field, index) => {
        field.setCustomValidity(index !== 0 || field.value.trim() ? "" : "Please enter a value.");
    });
    const data = {
        id: editingId || getNewEntryId(),
        name: fields[0].value.trim(),
        description: fields[1].value.trim(),
        category: fields[2].value.trim(),
        parentId: contextualParentId || parentField.value || null
    };
    const error = galaxyModel.validateChange(data, entries);
    if (error) {
        formError.textContent = error;
        formError.hidden = false;
        return;
    }
    if (!form.reportValidity()) return;
    const creating = !editingId;
    const entry = editingId ? entries.get(editingId) : {
        ...getNewEntryPosition(data.parentId ? [data.parentId] : [], roleField.dataset.role), seedLayout: true
    };
    const oldParentId = entry.parentId;
    commitCrudMutation(() => {
        Object.assign(entry, data);
        entries.set(entry.id, entry);
        if (oldParentId !== data.parentId) layout.delete(entry.id);
    }, { selectionId: data.id, topologyChanged: creating || oldParentId !== data.parentId,
        reveal: creating || oldParentId !== data.parentId, preserveScroll: !creating,
        inspectorOpen: creating || !panel.hidden });
    dialog.close();
    restoreCrudFocus(); finishCrudOperation();
});

function clearSelection({ reframe = false } = {}) {
    dismissConnectionHint();
    focusRevealIds.clear();
    selectedNode = null;
    contentInspector.select(null, false);
    setInspectorOpen(false, { reframe });
    hierarchySidebar.select(null);
    panelAncestry.replaceChildren();
    panelAncestry.hidden = true;
    panelName.textContent = "Select an entry";
    refreshInspectorConnections();
    [entryActions, actionStatus].forEach((element) => { element.hidden = true; });
    nodes.forEach((node) => {
        node.classList.remove("related", "selected");
        node.setAttribute("aria-pressed", "false");
    });
    lines.forEach(({ element }) => element.classList.remove("selected"));
    updateHierarchyEmphasis();
}

function reportAction(message, { reframe = true } = {}) {
    actionStatus.textContent = message;
    actionStatus.hidden = false;
    if (panel.hidden) setInspectorOpen(true, { reframe });
}

function showDeleteConfirmation(entry, ids) {
    deleteConfirmationIds = new Set(ids);
    document.getElementById("delete-entry-title").textContent = ids.size > 1 ?
        `Delete “${entry.name}” and everything inside it?` : "Delete entry?";
    document.getElementById("delete-entry-message").textContent = ids.size > 1 ?
        `This will permanently delete ${ids.size} entries and their connections. This cannot be undone.` :
        `Delete “${entry.name}” and its connections? This cannot be undone.`;
    document.getElementById("confirm-delete-entry").textContent = ids.size > 1 ? `Delete ${ids.size} entries` : "Delete entry";
}

function requestEntryDelete(id) {
    if (deletionBusy) return;
    const entry = entries.get(id);
    if (!entry) return;
    beginCrudOperation();
    const plan = galaxyModel.deletionPlan(entries, relationships, id, { subtree: true, protectedIds: builtInIds });
    if (plan.error) {
        reportAction(plan.error, { reframe: false }); finishCrudOperation();
        return;
    }
    deletingId = entry.id;
    showDeleteConfirmation(entry, plan.ids);
    deleteDialog.showModal();
}
deleteEntryButton.addEventListener("click", () => requestEntryDelete(selectedNode?.dataset.entryId));
document.getElementById("cancel-delete-entry").addEventListener("click", () => deleteDialog.close());
deleteDialog.addEventListener("close", () => {
    if (deleteDialog.open) return;
    deletingId = null; deleteConfirmationIds = null;
    finishCrudOperation();
});
deleteDialog.addEventListener("cancel", event => { if (deletionBusy) event.preventDefault(); });
document.getElementById("delete-entry-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (deletionBusy) return;
    const entry = entries.get(deletingId);
    const plan = galaxyModel.deletionPlan(entries, relationships, deletingId, { subtree: true, protectedIds: builtInIds });
    if (!entry || plan.error) {
        deleteDialog.close();
        reportAction(plan.error, { reframe: false }); finishCrudOperation();
        return;
    }
    if (!deleteConfirmationIds || plan.ids.size !== deleteConfirmationIds.size || [...plan.ids].some(id => !deleteConfirmationIds.has(id))) {
        showDeleteConfirmation(entry, plan.ids);
        return; // Changed branch: show its new impact and require another explicit click.
    }
    const selectedId = selectedNode?.dataset.entryId;
    const fallbackId = plan.ids.has(selectedId) ?
        galaxyModel.ancestors(entries, selectedId).find(parent => !plan.ids.has(parent.id))?.id : selectedId;
    const hasFiles = [...plan.ids].some(id => entries.get(id)?.content?.attachments.length) || contentInspector.hasJobs(plan.ids) || attachmentStore.hasEntries(plan.ids);
    if (hasFiles) {
        deletionBusy = true;
        plan.ids.forEach(id => deletingContentIds.add(id));
        const confirm = document.getElementById("confirm-delete-entry"), cancel = document.getElementById("cancel-delete-entry");
        confirm.disabled = cancel.disabled = true;
        let metadataWritten = false;
        try {
            await attachmentStore.deleteEntries(plan.ids, () => {
                const current = galaxyModel.deletionPlan(entries, relationships, entry.id, { subtree: true, protectedIds: builtInIds });
                if (current.error || current.ids.size !== plan.ids.size || [...current.ids].some(id => !plan.ids.has(id))) throw new Error("The branch changed. Cancel and review its new deletion count.");
                const snapshot = getGalaxySnapshot();
                if (!sampleMode) {
                    if (!storageAvailable) throw new Error("Saved data cannot be updated in this browser.");
                    galaxyStorage.save({ ...snapshot, entries: snapshot.entries.filter(e => !plan.ids.has(e.id)),
                        connections: snapshot.connections.filter(link => !plan.ids.has(link.from) && !plan.ids.has(link.to)),
                        layout: snapshot.layout.filter(value => !plan.ids.has(value.id)) });
                }
                metadataWritten = true;
            }, () => { if (metadataWritten && !sampleMode) galaxyStorage.save(getGalaxySnapshot()); });
        } catch (error) {
            document.getElementById("delete-entry-message").textContent = `Could not delete the files. Your entries are unchanged. ${error.message || "Try again."}`;
            return;
        } finally {
            deletionBusy = false; deletingContentIds.clear(); confirm.disabled = cancel.disabled = false;
        }
    }
    commitCrudMutation(() => {
        plan.ids.forEach(id => { entries.delete(id); layout.delete(id); focusRevealIds.delete(id); });
        relationships.splice(0, relationships.length, ...plan.relationships);
        if (plan.ids.has(hoveredEntryId)) hoveredEntryId = null;
        if (plan.ids.has(hoveredSystemId)) hoveredSystemId = null;
    }, { selectionId: fallbackId, persisted: hasFiles });
    deleteDialog.close();
    restoreCrudFocus(); finishCrudOperation();
});

function focusEntry(id, { semantic = false } = {}) {
    const entry = entries.get(id);
    if (!entry || activeNodeDrags || pan) return;
    const source = physics.particles.get(selectedNode?.dataset.entryId);
    dismissConnectionHint();
    cancelConnectionMode();
    if (hierarchySidebar.narrow) hierarchySidebar.setCollapsed(true);
    closeContextMenu();
    autoFitPending = false;
    focusRevealIds.clear();
    searchOpen = false;
    searchResults.hidden = true;
    searchField.blur();
    if (entry.depth >= 2) {
        focusRevealIds.add(id);
        galaxyModel.ancestors(entries, id).forEach(ancestor => focusRevealIds.add(ancestor.id));
    }
    selectEntry(entry, nodes.get(id), { reframe: false });
    const { left, right, top, bottom } = physics.bounds;
    const particle = physics.particles.get(id);
    const applyView = view => semantic ? camera.travelTo(view, physics.bounds, {
        crossGalaxy: !!source && source.galaxyId !== particle.galaxyId,
        differentSystem: !!source && source.systemId !== particle.systemId
    }) : camera.setView(view);
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
        applyView(camera.boundsView(bounds, physics.bounds, { padding: 36, maxScale: entry.depth === 0 ? .58 : .82 }));
        return;
    }
    const usefulScale = Math.max(entry.depth >= 4 ? 1.7 : entry.depth === 3 ? 1.2 : 1, Math.min(1.8, camera.view.scale));
    // Center in the usable graph area, leaving the fixed panel and controls visible.
    applyView({ x: (left + right) / 2 - entry.x * usefulScale,
        y: (top + bottom) / 2 - entry.y * usefulScale, scale: usefulScale });
}

function refreshSearchResults() {
    searchResultList.replaceChildren();
    const matches = galaxyModel.search(entries, searchField.value);
    hierarchySidebar.markSearch(matches);
    const revealed = new Set(matches.flatMap(entry => galaxyModel.ancestors(entries, entry.id).map(ancestor => ancestor.id)));
    nodes.forEach((node, id) => node.classList.toggle("search-ancestor", revealed.has(id)));
    const matchIds = new Set(matches.map(entry => entry.id));
    nodes.forEach((node, id) => node.classList.toggle("search-match", matchIds.has(id)));
    entries.forEach(entry => renderNode(entry, nodes.get(entry.id)));
    updateConnections();
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
    if (event.key === "Escape" && !event.defaultPrevented && !dialog.open && !deleteDialog.open) {
        if (camera.travel) { camera.stopAnimation(); dismissConnectionHint(); event.preventDefault(); return; }
        if (!connectionHint.hidden) { dismissConnectionHint(); event.preventDefault(); return; }
        if (connectionSourceId) { cancelConnectionMode(true); event.preventDefault(); return; }
        const dismissingSearch = searchOpen;
        dismissTemporaryReveal();
        if (!dismissingSearch) closeInspector(true);
    }
});
document.addEventListener("pointerdown", (event) => {
    if (event.button === 2) return;
    if (!event.target.closest(".entry-search")) {
        dismissTemporaryReveal();
    }
});

initializeGalaxy();
if (sampleMode) {
    document.getElementById("sample-indicator").hidden = false;
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
    closeContextMenu(); hierarchySidebar.onWindowResize();
    renderBackground();
    navigationViewportChanged(false);
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
