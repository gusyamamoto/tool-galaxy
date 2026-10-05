// Automatic identity and optional overrides are independent of hierarchy/storage/UI.
const galaxyAppearance = {
    archetypes: {
        galaxy: ["spiral", "barred-spiral", "elliptical", "irregular"],
        sun: ["warm", "golden"],
        planet: ["rocky", "gas-giant", "icy", "oceanic", "ringed", "desert"],
        moon: ["rocky", "icy", "earthy"],
        satellite: ["twin-panel", "dish", "probe", "station"],
        astronaut: ["floating", "angled", "extended-arm", "compact-eva"]
    },
    palettes: { amber: 36, blue: 212, teal: 178, violet: 265, rose: 327 },
    textureCache: new Map(),
    cloudCache: new Map(),
    // Cache surface noise only; lighting, edges, rings and text stay native.
    // Procedural pixels avoid repeated SVG-filter rasterization and expensive
    // SVG→canvas filter conversions after a display-scale change. Work is lazy
    // and scheduled in idle time for visible close bodies, never the whole tree.
    noise(seed, x, y) {
        let value = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
        value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
        return (value ^ (value >>> 16)) >>> 0;
    },
    bakeField(seed, size) {
        const key = `${seed}:${size}`;
        if (!this.textureCache.has(key)) {
            this.textureCache.set(key, new Promise(resolve => {
                const generate = () => {
                    try {
                        const canvas = document.createElement("canvas");
                        canvas.width = canvas.height = size;
                        const context = canvas.getContext("2d"), pixels = context.createImageData(size, size);
                        const angle = seed % 360 * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
                        const layers = [];
                        for (let octave = 0; octave < 3; octave++) {
                            const nx = 14 * 2 ** octave, ny = 20 * 2 ** octave, stride = nx * 2 + 1, grid = new Float32Array(stride * (ny * 2 + 1));
                            for (let y = 0; y <= ny * 2; y++) for (let x = 0; x <= nx * 2; x++) grid[y * stride + x] = this.noise(seed + octave * 997, x, y) / 4294967296;
                            layers.push({ nx, ny, stride, grid, weight: 1 / 2 ** octave });
                        }
                        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                            let value = 0;
                            // Bake the stable orientation into samples too, to
                            // avoid an extra rotated texture layer during motion.
                            const ux = x / size - .5, uy = y / size - .5;
                            for (const { nx, ny, stride, grid, weight } of layers) {
                                const gx = (ux * cos + uy * sin + 1) * nx, gy = (uy * cos - ux * sin + 1) * ny, ix = Math.floor(gx), iy = Math.floor(gy);
                                let tx = gx - ix, ty = gy - iy; tx *= tx * (3 - 2 * tx); ty *= ty * (3 - 2 * ty);
                                const i = iy * stride + ix, a = grid[i] * (1 - tx) + grid[i + 1] * tx,
                                    b = grid[i + stride] * (1 - tx) + grid[i + stride + 1] * tx;
                                value += (a * (1 - ty) + b * ty) * weight;
                            }
                            const shade = Math.max(0, Math.min(1, value / 1.75 * 1.8 - .4)) * 255;
                            const i = (y * size + x) * 4;
                            // Ordinary translucent highlights/shadows can be
                            // cached with the sphere. A live blend mode otherwise
                            // rerenders the textured group during every translation.
                            // Fold grain into the same overlay, so translation
                            // samples one image instead of two oversized fields.
                            const terrainAlpha = Math.abs(shade - 128) * (shade >= 128 ? .65 : .9) / 255;
                            const grainColor = this.noise(1947, Math.floor(x / size * 512), Math.floor(y / size * 512)) >>> 31 ? 255 : 0;
                            const alpha = terrainAlpha + 14 / 255 * (1 - terrainAlpha);
                            const color = ((shade >= 128 ? 255 : 0) * terrainAlpha + grainColor * 14 / 255 * (1 - terrainAlpha)) / alpha;
                            pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = color;
                            pixels.data[i + 3] = alpha * 255;
                        }
                        context.putImageData(pixels, 0, 0);
                        canvas.toBlob(blob => resolve(blob ? `url("${URL.createObjectURL(blob)}")` : null), "image/png");
                    } catch { resolve(null); } // The existing SVG field is a fallback.
                };
                if (typeof requestIdleCallback === "function") requestIdleCallback(generate, { timeout: 800 });
                else setTimeout(generate, 0);
            }));
        }
        return this.textureCache.get(key);
    },
    prepareTextures(node, diameter) {
        // Match natural-body display pixels in reusable tiers; a close high-DPI
        // Sun needs more detail. Artificial Satellites never request this field.
        const physicalSize = diameter * (window.devicePixelRatio || 1);
        const size = Math.min(1024, Math.max(64, 2 ** Math.ceil(Math.log2(physicalSize))));
        if (node.textureSize === size) return;
        node.textureSize = size;
        node.dataset.textureReady = "pending";
        const seed = this.hash(node.dataset.entryId);
        this.bakeField(seed, size).then(map => {
            if (!node.isConnected || node.textureSize !== size) return;
            if (map) {
                node.style.setProperty("--surface-map", map);
                node.style.setProperty("--surface-grain", "none");
                node.dataset.textureCached = "true";
            }
            node.dataset.textureReady = "true";
        });
    },
    hash(id) {
        let hash = 2166136261;
        for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
        return hash;
    },
    resolve(entry) {
        const seed = this.hash(entry.id), choices = this.archetypes[entry.role];
        const override = entry.appearance?.mode === "auto" ? {} : entry.appearance || {};
        const archetype = choices.includes(override.archetype) ? override.archetype : choices[seed % choices.length];
        const hues = { rocky: 218, "gas-giant": 29, icy: 196, oceanic: 205, ringed: 35, desert: 24, warm: 38, golden: 46, earthy: 27,
            "twin-panel": 214, dish: 208, probe: 220, station: 202,
            floating: 210, angled: 210, "extended-arm": 210, "compact-eva": 210 };
        return { seed, archetype, angle: seed % 360,
            hue: Object.hasOwn(this.palettes, override.palette) ? this.palettes[override.palette] :
                (entry.role === "galaxy" ? [212, 265, 178, 327][(seed >>> 8) % 4] : hues[archetype]) + (seed % 13) - 6,
            rings: entry.role === "planet" && (typeof override.rings === "boolean" ? override.rings : archetype === "ringed"),
            flatten: .62 + (seed % 22) / 100, density: 30 + (seed % 18) };
    },
    // A tiny native SVG: no sphere, noise field, filters or per-frame drawing.
    satellite(style) {
        const panel = '<path d="M2 8h5v8H2zM17 8h5v8h-5z" fill="hsl(' + style.hue + ' 28% 31%)"/><path d="M4.5 8v8M19.5 8v8M2 12h5M17 12h5" stroke="#8fa5bc" stroke-opacity=".5" stroke-width=".5"/>';
        const shapes = {
            "twin-panel": panel + '<path d="M7 12h10M12 7V4l3-1"/><rect x="9" y="8" width="6" height="8" rx="1" fill="#a5b2bd"/>',
            dish: '<path d="M12 12l4-5M14 5q7 0 6 6z" fill="#b0bcc5"/><path d="M3 13h6v5H3z" fill="hsl(' + style.hue + ' 28% 31%)"/><path d="M8 15h3"/><rect x="10" y="11" width="6" height="7" rx="1" fill="#96a6b5"/>',
            probe: '<path d="M12 8V2M8 14l-4 5M16 14l4 5"/><path d="M8 9l4-3 4 3v6l-4 3-4-3z" fill="#adb9c2"/><path d="M9 11h6" stroke="#e0e8ec"/>',
            station: panel + '<path d="M7 12h10M12 5v14"/><rect x="9" y="9" width="6" height="6" rx="1" fill="#b1bdc6"/><rect x="10" y="4" width="4" height="4" rx=".5" fill="#8395a6"/><path d="M11 18h2"/>'
        };
        return `<svg class="satellite-craft" aria-hidden="true" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g transform="rotate(${style.angle % 50 - 25} 12 12)" stroke="#a1b0bf" stroke-width=".85" stroke-linejoin="round" fill="none">${shapes[style.archetype]}</g></svg>`;
    },
    astronaut(style) {
        const poses = {
            floating: ['M8 10l-3 4M16 10l3 4', 'M10 16l-2 5M14 16l2 5'],
            angled: ['M8 10l-4 2M16 10l2 5', 'M10 16l-3 4M14 16l4 3'],
            'extended-arm': ['M8 10L3 7M16 10l5-1', 'M10 16l-2 5M14 16l2 5'],
            'compact-eva': ['M8 10l-2 3 2 1M16 10l2 3-2 1', 'M10 16l-2 2 1 3M14 16l2 2-1 3']
        };
        const [arms, legs] = poses[style.archetype];
        const tilt = style.archetype === 'angled' ? 24 : style.angle % 25 - 12;
        return `<svg class="astronaut-figure" aria-hidden="true" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g transform="rotate(${tilt} 12 12)" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="8" width="10" height="8" rx="2" fill="#87939d"/><path d="${arms}M10 16h4${legs}" stroke="#cbd2d7" stroke-width="2.4" fill="none"/><path d="M9 9h6l1 7-4 2-4-2z" fill="#d6dce0"/><ellipse cx="12" cy="6" rx="4.5" ry="4.2" fill="#e0e4e7"/><rect x="8.8" y="4.1" width="6.4" height="3.6" rx="1.6" fill="#172634"/><path d="M10 4.7h2" stroke="#82939f" stroke-width=".65"/></g></svg>`;
    },
    prepareCloud(element, style) {
        const key = JSON.stringify(style);
        if (element.cloudKey === key) return;
        element.cloudKey = key;
        if (!this.cloudCache.has(key)) {
            const svg = this.cloud(style), source = `data:image/svg+xml,${encodeURIComponent(svg)}`;
            this.cloudCache.set(key, new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    try {
                        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 512;
                        const context = canvas.getContext("2d");
                        // Smooth gradient dithering once, never blur live bodies/text.
                        context.filter = "blur(1.25px)";
                        context.drawImage(img, 0, 0, 512, 512);
                        resolve(canvas);
                    } catch { resolve(null); }
                };
                img.onerror = () => resolve(null);
                img.src = source;
            }));
        }
        this.cloudCache.get(key).then(canvas => {
            if (element.isConnected && element.cloudKey === key) {
                if (canvas) {
                    const context = element.getContext("2d");
                    context.clearRect(0, 0, 512, 512);
                    context.drawImage(canvas, 0, 0);
                    element.cloudDraws = (element.cloudDraws || 0) + 1;
                }
                element.dataset.cloudReady = "true";
            }
        });
    },
    // Filled gradient concentrations, no spiral outlines, blur filters or hard edges.
    // Rasterize once at 512px; only this intentionally diffuse cloud is magnified.
    cloud(style) {
        let state = style.seed;
        const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
        const puffs = [], dust = [];
        const coreX = style.archetype === "irregular" ? 110 + random() * 22 : 123 + random() * 10;
        const coreY = style.archetype === "irregular" ? 110 + random() * 28 : 123 + random() * 10;
        for (let i = 0; i < style.density; i++) {
            const t = random(), radius = 12 + Math.sqrt(t) * 76;
            let angle = random() * Math.PI * 2, x, y, rx = 19 + random() * 23, ry = 14 + random() * 22;
            if (style.archetype === "spiral") angle = t * Math.PI * 3 + i % 3 * Math.PI * 2 / 3 + (random() - .5) * 1.2;
            x = 128 + Math.cos(angle) * radius; y = 128 + Math.sin(angle) * radius * style.flatten;
            if (style.archetype === "barred-spiral") { x = 52 + random() * 152; y = 128 + (random() - .5) * 42; rx *= 1.25; ry *= .7; }
            if (style.archetype === "elliptical") { x = 128 + Math.cos(angle) * radius * .8; y = 128 + Math.sin(angle) * radius * .6; rx *= 1.2; ry *= 1.2; }
            if (style.archetype === "irregular") { x = 66 + random() * 124; y = 60 + random() * 136; rx *= .9; }
            puffs.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="url(#dust)" opacity="${(.20 + random() * .28).toFixed(2)}"/>`);
            // Soft dust concentrations, not bright circles competing with bodies.
            dust.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(1.3 + random() * 1.5).toFixed(1)}" ry="${(1 + random() * 1.1).toFixed(1)}" fill="url(#star)" opacity="${(.12 + random() * .24).toFixed(2)}"/>`);
        }
        const gradient = (id, hue, light, opacity) => `<radialGradient id="${id}"><stop stop-color="hsl(${hue} 32% ${light}%)" stop-opacity="${opacity}"/><stop offset=".38" stop-color="hsl(${hue} 30% ${light - 10}%)" stop-opacity="${opacity * .55}"/><stop offset=".72" stop-color="hsl(${hue} 26% ${light - 16}%)" stop-opacity="${opacity * .18}"/><stop offset="1" stop-opacity="0"/></radialGradient>`;
        const core = style.archetype === "barred-spiral" ? [56, 24] : style.archetype === "elliptical" ? [48, 36] : [35, 30];
        return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 256 256"><defs>${gradient("halo", style.hue, 40, .36)}${gradient("dust", style.hue + 7, 58, .50)}${gradient("core", style.hue - 6, 78, .45)}${gradient("star", style.hue, 86, .75)}</defs><ellipse cx="128" cy="128" rx="122" ry="118" fill="url(#halo)"/><g transform="rotate(${style.angle} 128 128)">${puffs.join("")}<ellipse cx="${coreX.toFixed(1)}" cy="${coreY.toFixed(1)}" rx="${core[0]}" ry="${core[1]}" fill="url(#core)"/>${dust.join("")}</g></svg>`;
    }
};
