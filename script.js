const initialTools = [
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

// Connections use stable IDs so tools can share a display name.
const initialConnections = [
    { from: "github", to: "vs-code" },
    { from: "vs-code", to: "codex" }
];

const galaxy = document.getElementById("galaxy");
const connectionsLayer = document.getElementById("connections");
const panel = document.getElementById("tool-panel");
const panelName = document.getElementById("panel-name");
const panelDescription = document.getElementById("panel-description");
const panelCategory = document.getElementById("panel-category");
const addToolButton = document.getElementById("add-tool-button");
const dialog = document.getElementById("add-tool-dialog");
const form = document.getElementById("add-tool-form");
const connectionOptions = document.getElementById("connection-options");
const storageStatus = document.getElementById("storage-status");
const fields = ["tool-name", "tool-description", "tool-category"].map((id) =>
    document.getElementById(id)
);

// Plain tool/connection data is kept separate from the rendered DOM.
const tools = new Map();
const connections = [];
const builtInIds = new Set(initialTools.map((tool) => tool.id));
const nodes = new Map();
const lines = [];
let selectedNode = null;
let nextToolId = 1;
let storageAvailable = true;
let graphNeedsSave = false;

const physics = new GalaxyPhysics({
    onTick(particles) {
        particles.forEach((particle, id) => {
            const tool = tools.get(id);
            if (tool.x !== particle.x || tool.y !== particle.y) {
                graphNeedsSave = true;
            }
            tool.x = particle.x;
            tool.y = particle.y;
        });
        renderGraph();
    },
    onSettle() {
        if (graphNeedsSave) {
            saveGalaxy();
        }
    }
});

function reportStorageFailure(message) {
    storageStatus.textContent = message;
    storageStatus.hidden = false;
}

function getGalaxySnapshot() {
    return {
        tools: [...tools.values()].filter((tool) => !builtInIds.has(tool.id))
            .map(({ id, name, description, category, x, y }) =>
                ({ id, name, description, category, x, y })
            ),
        connections: connections.filter(({ from, to }) =>
            !builtInIds.has(from) || !builtInIds.has(to)
        ),
        builtInPositions: initialTools.map(({ id }) => {
            const { x, y } = tools.get(id);
            return { id, x, y };
        })
    };
}

function saveGalaxy() {
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

function hasValidPosition(tool) {
    return tool && Number.isFinite(tool.x) && Number.isFinite(tool.y);
}

function isValidStoredTool(tool) {
    return hasValidPosition(tool) && typeof tool.id === "string" &&
        tool.id.trim().length > 0 && tool.id.length <= 100 &&
        ["name", "description", "category"].every((key) =>
            typeof tool[key] === "string" && tool[key].trim().length > 0 &&
            tool[key].length <= (key === "description" ? 1000 : 60)
        );
}

function initializeGalaxy() {
    let saved = null;
    try {
        saved = galaxyStorage.load();
    } catch (error) {
        // Preserve unreadable/unsupported data instead of overwriting it.
        storageAvailable = false;
        reportStorageFailure("Saved tools could not be loaded. Changes will remain available only for this session.");
    }

    initialTools.forEach((initialTool) => {
        const tool = { ...initialTool };
        const position = saved?.builtInPositions.find((entry) =>
            entry?.id === tool.id && hasValidPosition(entry)
        );
        if (position) {
            tool.x = position.x;
            tool.y = position.y;
        }
        createToolNode(tool);
    });

    (saved?.tools || []).forEach((tool) => {
        if (isValidStoredTool(tool) && !tools.has(tool.id)) {
            // Only restore fields that belong to the app's data model.
            const { id, name, description, category, x, y } = tool;
            createToolNode({ id, name, description, category, x, y });
        }
    });

    initialConnections.forEach(createConnection);
    (saved?.connections || []).forEach((connection) => {
        if (connection && typeof connection.from === "string" && typeof connection.to === "string") {
            createConnection(connection);
        }
    });
}

function selectTool(tool, node) {
    if (selectedNode) {
        selectedNode.classList.remove("selected");
        selectedNode.setAttribute("aria-pressed", "false");
    }

    selectedNode = node;
    node.classList.add("selected");
    node.setAttribute("aria-pressed", "true");
    panelName.textContent = tool.name;
    panelDescription.textContent = tool.description;
    panelCategory.textContent = `Category: ${tool.category}`;
    panelCategory.hidden = false;
    lines.forEach(({ from, to, element }) => {
        element.classList.toggle("selected", from === tool.id || to === tool.id);
    });
}

// Initial tools and form submissions share all rendering and interactions.
function createToolNode(tool) {
    const node = document.createElement("button");
    node.type = "button";
    node.classList.add("tool-node");
    const label = document.createElement("span");
    label.className = "node-label";
    label.textContent = tool.name;
    node.appendChild(label);
    node.title = tool.name;
    node.dataset.toolId = tool.id;
    node.setAttribute("aria-pressed", "false");
    node.addEventListener("click", () => selectTool(tool, node));

    let dragPointerId = null;
    let didMove = false;
    let offsetX = 0;
    let offsetY = 0;

    node.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || dragPointerId !== null) {
            return;
        }

        const galaxyRect = galaxy.getBoundingClientRect();
        offsetX = event.clientX - galaxyRect.left - tool.x;
        offsetY = event.clientY - galaxyRect.top - tool.y;
        physics.beginDrag(tool.id);
        dragPointerId = event.pointerId;
        didMove = false;
        node.classList.add("dragging");
        selectTool(tool, node);
        node.setPointerCapture(event.pointerId);
    });

    node.addEventListener("pointermove", (event) => {
        if (event.pointerId !== dragPointerId || !node.hasPointerCapture(event.pointerId)) {
            return;
        }

        const galaxyRect = galaxy.getBoundingClientRect();
        const x = event.clientX - galaxyRect.left - offsetX;
        const y = event.clientY - galaxyRect.top - offsetY;
        if (didMove || Math.hypot(x - tool.x, y - tool.y) > 3) {
            didMove = true;
            physics.moveDrag(tool.id, x, y);
        }
    });

    function endDrag(event) {
        if (event.pointerId === dragPointerId) {
            dragPointerId = null;
            physics.endDrag(tool.id, didMove);
            node.classList.remove("dragging");
            if (node.hasPointerCapture(event.pointerId)) {
                node.releasePointerCapture(event.pointerId);
            }
            // Save immediately, then again when the released graph settles.
            if (didMove) {
                saveGalaxy();
            }
        }
    }

    node.addEventListener("pointerup", endDrag);
    node.addEventListener("pointercancel", endDrag);
    node.addEventListener("lostpointercapture", endDrag);

    tools.set(tool.id, tool);
    nodes.set(tool.id, node);
    galaxy.appendChild(node);
    renderNode(tool, node);
    return node;
}

function getNewToolPosition(targetIds) {
    const targets = targetIds.map((id) => tools.get(id));
    const bounds = physics.bounds;
    const center = targets.length ? {
        x: targets.reduce((sum, tool) => sum + tool.x, 0) / targets.length,
        y: targets.reduce((sum, tool) => sum + tool.y, 0) / targets.length
    } : { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
    const spacing = getNodeRadius() * 2 + 24;
    for (let ring = 1; ring <= 3; ring++) {
        for (let step = 0; step < 12; step++) {
            const angle = tools.size * 2.4 + step * Math.PI / 6;
            const point = physics.clampPosition(
                center.x + Math.cos(angle) * spacing * ring,
                center.y + Math.sin(angle) * spacing * ring
            );
            if ([...tools.values()].every((tool) =>
                Math.hypot(point.x - tool.x, point.y - tool.y) >= spacing
            )) {
                return point;
            }
        }
    }
    return physics.clampPosition(center.x, center.y);
}

function getNodeRadius() {
    return parseFloat(getComputedStyle(galaxy).getPropertyValue("--node-size")) / 2;
}

function updateGraphViewport() {
    const rect = galaxy.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const radius = getNodeRadius();
    const narrow = window.matchMedia("(max-width: 760px)").matches;
    const left = radius + 24;
    const top = radius + (narrow ? 102 : 148);
    const right = Math.max(left, (narrow ? rect.width - 24 : panelRect.left - rect.left - 24) - radius);
    const bottom = Math.max(top, (narrow ? panelRect.top - rect.top - 20 : rect.height - 52) - radius);
    physics.setViewport({ left, right, top, bottom }, radius);
}

function renderNode(tool, node) {
    node.style.transform = `translate3d(${tool.x}px, ${tool.y}px, 0) translate(-50%, -50%)`;
}

function renderGraph() {
    tools.forEach((tool) => renderNode(tool, nodes.get(tool.id)));
    updateConnections();
}

function updateConnections() {
    lines.forEach(({ from, to, element }) => {
        const fromTool = tools.get(from);
        const toTool = tools.get(to);
        element.setAttribute("x1", fromTool.x);
        element.setAttribute("y1", fromTool.y);
        element.setAttribute("x2", toTool.x);
        element.setAttribute("y2", toTool.y);
    });
}

// Built-in, newly submitted, and restored connections all use this path.
function createConnection({ from, to }) {
    if (from === to || !tools.has(from) || !tools.has(to) ||
        connections.some((connection) =>
            (connection.from === from && connection.to === to) ||
            (connection.from === to && connection.to === from)
        )) {
        return;
    }
    const element = document.createElementNS("http://www.w3.org/2000/svg", "line");
    element.classList.add("connection-line");
    connectionsLayer.appendChild(element);
    connections.push({ from, to });
    lines.push({ from, to, element });
    updateConnections();
}

function populateConnectionOptions() {
    connectionOptions.replaceChildren();
    tools.forEach((tool) => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.name = "connections";
        checkbox.value = tool.id;
        const text = document.createElement("span");
        text.textContent = `${tool.name} (${tool.category})`;
        label.append(checkbox, text);
        connectionOptions.appendChild(label);
    });
}

function getNewToolId() {
    while (tools.has(`custom-${nextToolId}`)) {
        nextToolId++;
    }
    return `custom-${nextToolId++}`;
}

addToolButton.addEventListener("click", () => {
    form.reset();
    fields.forEach((field) => field.setCustomValidity(""));
    populateConnectionOptions();
    physics.pause();
    dialog.showModal();
});

dialog.addEventListener("close", () => {
    if (!document.hidden) {
        physics.resume();
    }
});

document.getElementById("cancel-add-tool").addEventListener("click", () => dialog.close());

fields.forEach((field) => {
    field.addEventListener("input", () => field.setCustomValidity(""));
});

form.addEventListener("submit", (event) => {
    event.preventDefault();
    fields.forEach((field) => {
        field.setCustomValidity(field.value.trim() ? "" : "Please enter a value.");
    });
    if (!form.reportValidity()) {
        return;
    }

    const targetIds = [...connectionOptions.querySelectorAll("input:checked")]
        .map((checkbox) => checkbox.value);
    const tool = {
        id: getNewToolId(),
        name: fields[0].value.trim(),
        description: fields[1].value.trim(),
        category: fields[2].value.trim(),
        ...getNewToolPosition(targetIds)
    };
    const node = createToolNode(tool);
    targetIds.forEach((to) => {
        createConnection({ from: tool.id, to });
    });
    physics.setGraph([...tools.values()], connections);
    saveGalaxy();
    selectTool(tool, node);
    dialog.close();
    node.focus();
});

initializeGalaxy();
updateGraphViewport();
physics.setGraph([...tools.values()], connections);

const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
physics.setReducedMotion(motionPreference.matches);
motionPreference.addEventListener("change", (event) => physics.setReducedMotion(event.matches));

window.addEventListener("resize", updateGraphViewport);
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
    } else if (!dialog.open) {
        physics.resume();
    }
});
