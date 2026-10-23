// Shared body artwork only: no model writes, physics, IDs, handlers or async work.
function renderCelestialBody(entry, node) {
    const hit=node.querySelector('.node-hit-area');
    if(!hit){const target=document.createElement('span');target.className='node-hit-area';target.ariaHidden='true';node.append(target);}
    node.dataset.role = entry.role; node.dataset.depth = entry.depth;
    node.dataset.body = galaxyModel.roles[entry.role].body;
    node.style.setProperty("--body-scale", galaxyModel.roles[entry.role].scale);
    node.style.setProperty("--body-visual-scale", cosmosView.visualScale[entry.role] || 1);
    const cap = `${cosmosView.bodyCaps[entry.role] || 76}px`;
    node.style.setProperty("--body-cap", cosmosView.inspectionCaps[entry.role] ? `var(--${entry.role}-inspection-cap, ${cap})` : cap);
    const style = galaxyAppearance.resolve(entry), hash = style.seed;
    node.dataset.archetype = style.archetype;
    node.dataset.surface = style.archetype === "gas-giant" ? "gaseous" : style.archetype;
    node.dataset.rings = String(style.rings);
    node.style.setProperty("--body-hue", style.hue);
    node.style.setProperty("--surface-angle", `${style.angle}deg`);
    let ring = node.querySelector(".planet-rings");
    if (style.rings && !ring) { ring = document.createElement("span"); ring.className = "planet-rings"; ring.setAttribute("aria-hidden", "true"); node.prepend(ring); }
    if (!style.rings) ring?.remove();
    node.querySelector(".galaxy-core,.satellite-craft,.astronaut-figure")?.remove();
    if (entry.role === 'galaxy') node.insertAdjacentHTML('afterbegin', '<span class="galaxy-core" aria-hidden="true"></span>');
    if (entry.role === "satellite") node.insertAdjacentHTML("afterbegin", galaxyAppearance.satellite(style));
    if (entry.role === "astronaut") node.insertAdjacentHTML("afterbegin", galaxyAppearance.astronaut(style));
    if (!["galaxy", "satellite", "astronaut"].includes(entry.role)) {
        const texture = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="terrain"><feTurbulence type="fractalNoise" baseFrequency=".075 .11" numOctaves="3" seed="${hash % 997}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="1.8" intercept="-.4"/><feFuncG type="linear" slope="1.8" intercept="-.4"/><feFuncB type="linear" slope="1.8" intercept="-.4"/></feComponentTransfer></filter><rect width="100%" height="100%" filter="url(#terrain)"/></svg>`;
        // Metadata/parent edits keep an existing baked field for this stable ID.
        if (!node.dataset.textureReady) node.style.setProperty("--surface-map", `url("data:image/svg+xml,${encodeURIComponent(texture)}")`);
    }
    node.querySelector(".node-label").textContent = entry.name; node.title = entry.name;
}
