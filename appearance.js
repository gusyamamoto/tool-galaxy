// Automatic identity and optional overrides are independent of hierarchy/storage/UI.
const galaxyAppearance = {
    archetypes: {
        galaxy: ["wispy", "bloom", "cluster", "double-lobed", "crescent", "diffuse"],
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
    bakeField(seed, size, material = 'rocky') {
        const key = `${seed}:${material}:${size}`;
        if (!this.textureCache.has(key)) {
            this.textureCache.set(key, new Promise(resolve => {
                const generate = () => {
                    try {
                        const canvas = document.createElement("canvas");
                        canvas.width = canvas.height = size;
                        const context = canvas.getContext("2d"), pixels = context.createImageData(size, size);
                        const angle = (material === 'gas-giant' || material === 'ringed' ? seed % 16 - 8 : seed % 360) * Math.PI / 180;
                        const cos = Math.cos(angle), sin = Math.sin(angle);
                        const frequency = { oceanic: [5, 7], icy: [7, 10], desert: [8, 13], 'gas-giant': [3, 28], ringed: [4, 22] }[material] || [14, 20];
                        const layers = [];
                        for (let octave = 0; octave < 3; octave++) {
                            const nx = frequency[0] * 2 ** octave, ny = frequency[1] * 2 ** octave, stride = nx * 2 + 1, grid = new Float32Array(stride * (ny * 2 + 1));
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
        // Match the capped screen diameter, never the uncapped world size.
        // Artificial Satellites and Astronauts never request a surface field.
        const physicalSize = diameter * (window.devicePixelRatio || 1);
        const size = Math.min(1024, Math.max(64, 2 ** Math.ceil(Math.log2(physicalSize))));
        const material = node.dataset.archetype, key = `${material}:${size}`;
        if (node.textureKey === key) return;
        node.textureKey = key;
        node.textureSize = size;
        node.dataset.textureReady = "pending";
        const seed = this.hash(node.dataset.entryId);
        this.bakeField(seed, size, material).then(map => {
            if (!node.isConnected || node.textureKey !== key) return;
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
        // Honor legacy appearance metadata through a presentation alias only.
        const legacyCloud = { spiral: 'wispy', 'barred-spiral': 'double-lobed', elliptical: 'bloom', irregular: 'cluster' };
        const requested = entry.role === 'galaxy' ? legacyCloud[override.archetype] || override.archetype : override.archetype;
        const archetype = choices.includes(requested) ? requested : choices[seed % choices.length];
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
        element.dataset.morphology=style.archetype;
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
    // Soft territory silhouettes. A handful of gradient puffs, baked once;
    // no spiral arms, bright star fields, hard edges or live blur filters.
    cloud(style) {
        let state = style.seed;
        const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
        const gradient = (id, hue, light, alpha) => `<radialGradient id="${id}"><stop stop-color="hsl(${hue} 34% ${light}%)" stop-opacity="${alpha}"/><stop offset=".32" stop-color="hsl(${hue} 32% ${light - 8}%)" stop-opacity="${alpha * .7}"/><stop offset=".68" stop-color="hsl(${hue} 28% ${light - 16}%)" stop-opacity="${alpha * .25}"/><stop offset="1" stop-opacity="0"/></radialGradient>`;
        const puffs = [];
        const puff = (x, y, rx, ry, angle, alpha) => `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" transform="rotate(${angle.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="url(#mist)" opacity="${alpha.toFixed(2)}"/>`;
        for (let i = 0; i < 24; i++) {
            const t = random(), jitter = random() - .5;
            let x, y, rx = 22 + random() * 20, ry = 18 + random() * 16, angle = jitter * 35;
            if (style.archetype === 'wispy') {
                x = 46 + t * 164; y = 128 + Math.sin(t * 5 - 1) * 22 + jitter * 20;
                rx *= 1.4; ry *= .65; angle = -12;
            } else if (style.archetype === 'bloom') {
                const phase = random() * Math.PI * 2, r = Math.sqrt(t) * 54;
                x = 128 + Math.cos(phase) * r; y = 128 + Math.sin(phase) * r;
                rx *= 1.15; ry *= 1.15;
            } else if (style.archetype === 'cluster') {
                const centers = [[82, 98], [161, 80], [147, 162]];
                const [cx, cy] = centers[i % 3]; x = cx + jitter * 32; y = cy + (t - .5) * 34;
            } else if (style.archetype === 'double-lobed') {
                x = (i % 2 ? 168 : 87) + jitter * 32; y = 128 + (t - .5) * 46;
                rx *= 1.1; ry *= 1.15;
            } else if (style.archetype === 'crescent') {
                const phase = -.95 + t * 2.65;
                x = 105 + Math.cos(phase) * 62; y = 126 + Math.sin(phase) * 69;
                rx *= .85; ry *= .85; angle = phase * 180 / Math.PI;
            } else {
                const phase = random() * Math.PI * 2, r = i < 16 ? Math.sqrt(t) * 36 : 58 + t * 42;
                x = 128 + Math.cos(phase) * r; y = 128 + Math.sin(phase) * r * .82;
                if (i >= 16) { rx *= .7; ry *= .65; }
            }
            puffs.push(puff(x, y, rx, ry, angle, .28 + random() * .20));
        }
        // The broad haze follows the morphology too; it never fills every
        // Galaxy with the same circular background or a luminous central ball.
        const haze = style.archetype === 'wispy' ? [128, 128, 119, 55] :
            style.archetype === 'crescent' ? [154, 128, 68, 103] :
            style.archetype === 'double-lobed' ? [128, 128, 115, 76] : [128, 128, 106, 98];
        return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 256 256" data-morphology="${style.archetype}"><defs>${gradient('mist', style.hue + 6, 67, .55)}${gradient('haze', style.hue, 44, .14)}</defs><g transform="rotate(${style.angle} 128 128)"><ellipse cx="${haze[0]}" cy="${haze[1]}" rx="${haze[2]}" ry="${haze[3]}" fill="url(#haze)"/>${puffs.join('')}</g></svg>`;
    }
};
