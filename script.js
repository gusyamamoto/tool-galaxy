const tools = [
    {
        name: "GitHub",
        x: 300,
        y: 250
    },
    {
        name: "VS Code",
        x: 550,
        y: 380
    },
    {
        name: "Codex",
        x: 800,
        y: 220
    }
];

const connections = [
    ["GitHub", "VS Code"],
    ["VS Code", "Codex"]
];

const galaxy = document.getElementById("galaxy");

const connectionsLayer = document.getElementById("connections");

const nodes = {};

tools.forEach((tool) => {
    const node = document.createElement("div");

    node.classList.add("tool-node");
    node.textContent = tool.name;

    node.style.left = `${tool.x}px`;
    node.style.top = `${tool.y}px`;

    let offsetX = 0;
    let offsetY = 0;

    node.addEventListener("pointerdown", (event) => {
        const galaxyRect = galaxy.getBoundingClientRect();

        const pointerX = event.clientX - galaxyRect.left;
        const pointerY = event.clientY - galaxyRect.top;

        offsetX = pointerX - parseFloat(node.style.left);
        offsetY = pointerY - parseFloat(node.style.top);

        node.setPointerCapture(event.pointerId);
    });

    node.addEventListener("pointermove", (event) => {
        if (!node.hasPointerCapture(event.pointerId)) {
            return;
        }

        const galaxyRect = galaxy.getBoundingClientRect();

        const pointerX = event.clientX - galaxyRect.left;
        const pointerY = event.clientY - galaxyRect.top;

        node.style.left = `${pointerX - offsetX}px`;
        node.style.top = `${pointerY - offsetY}px`;

        updateConnections();
    });

    nodes[tool.name] = node;

    galaxy.appendChild(node);
});

const lines = [];

connections.forEach(([from, to]) => {
    const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line"
    );

    line.classList.add("connection-line");

    connectionsLayer.appendChild(line);

    lines.push({
        from,
        to,
        element: line
    });
});

function updateConnections() {
    lines.forEach((connection) => {
        const fromNode = nodes[connection.from];
        const toNode = nodes[connection.to];

        const fromX = parseFloat(fromNode.style.left);
        const fromY = parseFloat(fromNode.style.top);

        const toX = parseFloat(toNode.style.left);
        const toY = parseFloat(toNode.style.top);

        connection.element.setAttribute("x1", fromX);
        connection.element.setAttribute("y1", fromY);

        connection.element.setAttribute("x2", toX);
        connection.element.setAttribute("y2", toY);
    });
}

updateConnections();