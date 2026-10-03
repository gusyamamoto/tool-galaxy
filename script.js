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

const galaxy = document.getElementById("galaxy");

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
    });

    galaxy.appendChild(node);
});