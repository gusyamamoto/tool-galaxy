// Static Time artwork only. Canonical hierarchy/appearance in; no simulation, texture queue or writes.
const cosmosTemporalAvatars = (() => {
    function source(entries, id) {
        const entry = entries.get(id);
        if (!entry) return null;
        const parent = entries.get(entry.parentId);
        return parent?.taskList === true && entry.taskList !== true ? parent : entry;
    }
    function render(entries, id) {
        const entry = source(entries, id);
        const host = document.createElement('span');
        host.className = 'temporal-avatar';
        host.setAttribute('aria-hidden', 'true');
        if (!entry) return host;
        const style = galaxyAppearance.resolve(entry);
        host.dataset.sourceId = entry.id;
        host.dataset.body = entry.role;
        host.dataset.archetype = style.archetype;
        host.dataset.rings = String(style.rings);
        host.style.setProperty('--temporal-hue', style.hue);
        if (entry.role === 'satellite' || entry.role === 'astronaut') {
            // These production helpers return native, static SVG geometry only.
            host.innerHTML = entry.role === 'satellite' ? galaxyAppearance.satellite(style) : galaxyAppearance.astronaut(style);
            // Keep the geometry, without canvas-specific CSS classes/effects.
            host.firstElementChild?.removeAttribute('class');
        } else if (entry.role === 'galaxy') {
            host.style.setProperty('--temporal-cloud', `url("data:image/svg+xml,${encodeURIComponent(galaxyAppearance.cloud(style))}")`);
        } else {
            const body = document.createElement('span');
            body.className = 'temporal-body';
            const texture = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><filter id="terrain"><feTurbulence type="fractalNoise" baseFrequency=".075 .11" numOctaves="3" seed="${style.seed % 997}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="1.8" intercept="-.4"/><feFuncG type="linear" slope="1.8" intercept="-.4"/><feFuncB type="linear" slope="1.8" intercept="-.4"/></feComponentTransfer></filter><rect width="100%" height="100%" filter="url(#terrain)"/></svg>`;
            host.style.setProperty('--temporal-texture', `url("data:image/svg+xml,${encodeURIComponent(texture)}")`);
            if (style.rings) {
                const rings = document.createElement('span');
                rings.className = 'temporal-rings';
                body.append(rings);
            }
            host.append(body);
        }
        return host;
    }
    return { source, render };
})();
if (typeof module !== 'undefined') module.exports = cosmosTemporalAvatars;
