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
    // Large surfaces belong only to the active local world. Keep a small,
    // disposable presentation cache, independent of saved appearance metadata.
    closeTextureCache: new Map(),
    bodyTextureCache: new Map(),
    rasterResources: new Map(),
    releaseRaster(resource) {
        if(resource&&!resource.resident&&!resource.refs) {
            URL.revokeObjectURL(resource.url);this.rasterResources.delete(resource.map);
        }
    },
    retainPaint(node,slot,map) {
        const resource=this.rasterResources.get(map);
        if(node[slot]===resource)return;
        if(node[slot]){node[slot].refs--;this.releaseRaster(node[slot]);}
        node[slot]=resource;
        if(resource)resource.refs++;
    },
    releaseNodePaint(node) {
        for(const slot of ['bodyPaintResource','bodyPreviewResource']){
            if(node[slot]){node[slot].refs--;this.releaseRaster(node[slot]);node[slot]=null;}
        }
        // Removal or a genuine hierarchy role change invalidates pending paint
        // too. An old sphere must not reappear behind a vector detail object.
        for(const key of ['bodyPreviewRequestKey','bodyPreviewMap','bodyPreviewKey','bodyPreviewPromise','bodyPaintKey','bodyPaintPixels','lastPaintScale','textureKey','textureSize','closeDetailKey'])node[key]=null;
        for(const key of ['bodyPaint','closeDetail','closeResolution','textureReady','textureCached'])delete node.dataset[key];
        for(const key of ['--body-map','--close-body-map','--surface-map','--identity-pixels','--identity-scale'])node.style.removeProperty?.(key);
    },
    installPaint(node,map,size,key,diameter) {
        if(node.bodyPaintKey===key&&node.dataset.bodyPaint==='true')return;
        this.retainPaint(node,'bodyPaintResource',map);
        // A ready image replaces the old image on the same persistent layer.
        node.style.setProperty('--body-map',map);this.sizeIdentityPaint(node,size,diameter);
        node.bodyPaintKey=key;node.dataset.bodyPaint='true';
    },
    preparePreview(node,diameter) {
        const {material,seed,hue,role}=this.bodyIdentity(node),key=`${seed}:${role}:${material}:${hue}:64`;
        if(node.bodyPreviewKey===key&&node.bodyPreviewMap)return Promise.resolve(node.bodyPreviewMap);
        if(node.bodyPreviewRequestKey===key&&node.bodyPreviewPromise)return node.bodyPreviewPromise;
        node.bodyPreviewRequestKey=key;
        node.bodyPreviewPromise=this.bakeBody(seed,64,material,hue,role,
            ()=>node.isConnected&&node.bodyPreviewRequestKey===key&&node.dataset.semanticHidden!=='true'&&node.dataset.culled!=='true',this.bodyTextureCache,96).then(map=>{
            if(!node.isConnected||node.bodyPreviewRequestKey!==key)return null;
            node.bodyPreviewRequestKey=null;
            if(!map)return null;
            this.retainPaint(node,'bodyPreviewResource',map);node.bodyPreviewMap=map;node.bodyPreviewKey=key;
            if(node.dataset.bodyPaint!=='true')this.installPaint(node,map,64,key,diameter);
            return map;
        });
        return node.bodyPreviewPromise;
    },
    bodyIdentity(node) {
        if(!node.bodyIdentity){
            const hue=Number(node.style.getPropertyValue('--body-hue'));
            node.bodyIdentity={seed:this.hash(node.dataset.entryId),role:node.dataset.body,material:node.dataset.archetype,hue:Number.isFinite(hue)?hue:218};
        }
        return node.bodyIdentity;
    },
    // One canonical palette and surface recipe at every resolution. Focus only
    // changes sampling detail; it never selects a different material or tint.
    bodyPalette(material,hue,role) {
        if(role==='sun')return material==='golden'?[[163,83,27],[233,179,73],[255,225,130]]:[[185,83,22],[252,194,76],[255,235,155]];
        const saturation=role==='moon'?6:({rocky:24,'gas-giant':42,ringed:22,desert:48,icy:30,oceanic:48}[material]||32);
        const hsl=(s,l)=>{
            const h=((hue%360)+360)%360/60,c=(1-Math.abs(2*l/100-1))*s/100,x=c*(1-Math.abs(h%2-1)),m=l/100-c/2;
            const rgb=h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x];
            return rgb.map(value=>Math.round((value+m)*255));
        };
        return [hsl(saturation,role==='moon'?25:24),hsl(saturation,role==='moon'?49:49),hsl(saturation*.65,role==='moon'?72:78)];
    },
    closeResolution(diameter, pixelRatio = 1) {
        const physical = diameter * Math.min(1.5, Math.max(1, pixelRatio));
        return physical <= 256 ? 256 : physical <= 512 ? 512 : 768;
    },
    prepareCloseDetail(node, diameter, { focused = false, progress = 1, pixelRatio } = {}) {
        const role = node.dataset.body;
        const detailThreshold = node.closeDetailKey || node.dataset.closeDetail === 'true' ? .18 : .28;
        if (!focused || diameter < 120 || progress < detailThreshold || !['sun', 'planet', 'moon'].includes(role)) {
            node.closeDetailKey = null;
            delete node.dataset.closeDetail;
            delete node.dataset.closeResolution;
            if(node.bodyPreviewMap&&node.bodyPaintPixels>64&&(diameter<120||node.dataset.semanticHidden==='true'||node.dataset.culled==='true'))
                this.installPaint(node,node.bodyPreviewMap,64,node.bodyPreviewKey,diameter);
            return;
        }
        const size = this.closeResolution(diameter, pixelRatio ?? (window.devicePixelRatio || 1));
        const {material,seed,hue}=this.bodyIdentity(node);
        const key = `${seed}:${role}:${material}:${hue}:${size}`;
        if (node.closeDetailKey === key) return;
        node.closeDetailKey = key;
        const hasPaint = node.dataset.closeDetail === 'true';
        if (!hasPaint) node.dataset.closeDetail = 'pending';
        node.dataset.closeResolution = String(size);
        this.preparePreview(node,diameter);
        return this.bakeBody(seed, size, material, hue, role, () => node.isConnected && node.closeDetailKey === key).then(map => {
            if (!node.isConnected || node.closeDetailKey !== key) return;
            if (map) {
                node.style.setProperty('--close-body-map', map);
                this.installPaint(node,map,size,key,diameter);
                node.dataset.closeDetail = 'true';
            } else {
                if (!hasPaint) delete node.dataset.closeDetail;
                node.closeDetailKey = null;
            }
        });
    },
    sizeIdentityPaint(node, size, diameter) {
        // The fixed raster layer scales on the compositor while the body and
        // label keep native pixel sizes. Install its current scale immediately:
        // idle paint can finish after the last camera/projection frame.
        node.bodyPaintPixels=size;
        node.lastPaintScale=(node.renderDiameter??diameter)/size;
        node.style.setProperty('--identity-pixels',`${size}px`);
        node.style.setProperty('--identity-scale',node.lastPaintScale);
    },
    bakeBody(seed, size, material, hue, role, isCurrent = () => true, cache=this.closeTextureCache, limit=6) {
        const key = `${seed}:${role}:${material}:${hue}:${size}`;
        const cached = cache.get(key);
        if (cached) {
            cache.delete(key);
            cache.set(key, cached);
            return cached.promise;
        }
        const entry = { url: null,refs:0,resident:true,ready:false };
        entry.promise = new Promise(resolve => {
            const finish = map => {
                if (!map) {
                    if(cache.get(key)===entry)cache.delete(key);
                    entry.resident=false;
                    if(entry.url)this.releaseRaster(entry);
                }else entry.ready=true;
                // Revoke evicted native raster resources. No growing texture
                // history when navigating through a densely populated tree.
                while (cache.size > limit) {
                    const oldest = [...cache].find(([id, value]) => id !== key && value.ready);
                    if (!oldest) break;
                    cache.delete(oldest[0]);
                    oldest[1].resident=false;this.releaseRaster(oldest[1]);
                }
                resolve(map);
            };
            const generate = () => {
                if (!isCurrent()) { finish(null); return; }
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = canvas.height = size;
                    const context = canvas.getContext('2d'), pixels = context.createImageData(size, size);
                    const layers = [3, 7, 17, 39].map((frequency, index) => {
                        const stride = frequency * 2 + 2, grid = new Float32Array(stride * stride);
                        for (let y = 0; y < stride; y++) for (let x = 0; x < stride; x++) grid[y * stride + x] = this.noise(seed + index * 7919, x, y) / 4294967296;
                        return { frequency, stride, grid };
                    });
                    const sample = (layer, x, y) => {
                        const gx = (x + 1) * layer.frequency, gy = (y + 1) * layer.frequency;
                        const ix = Math.floor(gx), iy = Math.floor(gy), index = iy * layer.stride + ix;
                        let tx = gx - ix, ty = gy - iy;
                        tx *= tx * (3 - 2 * tx); ty *= ty * (3 - 2 * ty);
                        const a = layer.grid[index] * (1 - tx) + layer.grid[index + 1] * tx;
                        const b = layer.grid[index + layer.stride] * (1 - tx) + layer.grid[index + layer.stride + 1] * tx;
                        return a * (1 - ty) + b * ty;
                    };
                    // RGB palette anchors stay stylized: warm stellar material,
                    // muted moons, blue oceans and distinct earthy/icy worlds.
                    const palettes=this.bodyPalette(material,hue,role);
                    const angle = (seed % 360) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
                    // A small tint respects existing color overrides without
                    // turning moons into luminous saturated planets.
                    const tint = [.5 + .5 * Math.cos(hue * Math.PI / 180), .5 + .5 * Math.cos((hue - 120) * Math.PI / 180), .5 + .5 * Math.cos((hue - 240) * Math.PI / 180)];
                    let row = 0;
                    const paint = () => {
                        try {
                            if (!isCurrent()) { finish(null); return; }
                            const end = Math.min(size, row + 32);
                            for (let y = row; y < end; y++) for (let x = 0; x < size; x++) {
                                const nx = (x + .5) / size * 2 - 1, ny = (y + .5) / size * 2 - 1, radius = nx * nx + ny * ny;
                                if (radius >= 1) continue;
                                const z = Math.sqrt(1 - radius), curve = 1 / (.66 + .34 * z);
                                const sx = (nx * cos + ny * sin) * curve * .64, sy = (ny * cos - nx * sin) * curve * .64;
                                const broad = sample(layers[0], sx, sy), middle = sample(layers[1], sx, sy);
                                const fine = sample(layers[2], sx, sy), grain = sample(layers[3], sx, sy);
                                let terrain = broad * .57 + middle * .28 + fine * .11 + grain * .04;
                                if (material === 'gas-giant' || material === 'ringed') {
                                    terrain = .5 + Math.sin(ny * 20 + broad * 6 + middle * 2) * .13 + (middle - .5) * .26;
                                } else if (role === 'sun') terrain = .35 + middle * .35 + fine * .24 + grain * .10;
                                else if (material === 'oceanic') terrain = Math.max(.04, Math.min(.98, (terrain - .24) * 1.8));
                                else if (role === 'moon') terrain = .18 + terrain * .67;
                                const mix = Math.max(0, Math.min(1, terrain * 2)), high = terrain > .5;
                                const from = palettes[high ? 1 : 0], to = palettes[high ? 2 : 1], blend = high ? Math.min(1, (terrain - .5) * 2) : mix;
                                const light = Math.max(0, -.43 * nx - .36 * ny + .82 * z);
                                const shade = role === 'sun' ? .52 + light * .48 : .10 + light * .85;
                                const edge = role === 'moon' ? 0 : material === 'oceanic' || material === 'icy' ? Math.pow(1 - z, 5) * light * 16 : 0;
                                const i = (y * size + x) * 4;
                                for (let channel = 0; channel < 3; channel++) pixels.data[i + channel] = (from[channel] + (to[channel] - from[channel]) * blend) * shade * (.94 + tint[channel] * .12) + edge;
                                pixels.data[i + 3] = Math.min(1, (1 - radius) * size * .5) * 255;
                            }
                            row = end;
                            if (row < size) {
                                // Yield between small row batches, so a newly entered
                                // world cannot monopolize a mobile navigation frame.
                                if (typeof requestIdleCallback === 'function') requestIdleCallback(paint, { timeout: 200 });
                                else setTimeout(paint, 0);
                                return;
                            }
                            context.putImageData(pixels, 0, 0);
                            if (role === 'moon') {
                                // Restrained crater rims, locally baked with the sphere;
                                // no live SVG filters or additional animated DOM layers.
                                context.globalCompositeOperation = 'source-atop';
                                for (let crater = 0; crater < 8; crater++) {
                                    const cx = (.22 + this.noise(seed, crater, 91) / 4294967296 * .56) * size;
                                    const cy = (.20 + this.noise(seed, crater, 93) / 4294967296 * .58) * size;
                                    const r = (.012 + this.noise(seed, crater, 97) / 4294967296 * .035) * size;
                                    const gradient = context.createRadialGradient(cx - r * .2, cy - r * .2, 0, cx, cy, r);
                                    gradient.addColorStop(0, 'rgba(4,8,15,.13)'); gradient.addColorStop(.65, 'rgba(4,8,15,.18)');
                                    gradient.addColorStop(.82, 'rgba(216,224,229,.12)'); gradient.addColorStop(1, 'rgba(216,224,229,0)');
                                    context.fillStyle = gradient; context.fillRect(cx - r, cy - r, r * 2, r * 2);
                                }
                            }
                            canvas.toBlob(async blob => {
                                if (!blob || !isCurrent()) { finish(null); return; }
                                entry.url = URL.createObjectURL(blob);
                                entry.map=`url("${entry.url}")`;this.rasterResources.set(entry.map,entry);
                                try {
                                    if(typeof Image==='function') {
                                        const image=new Image();image.src=entry.url;
                                        if(typeof image.decode==='function')await image.decode();
                                        else await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});
                                    }
                                    if(!isCurrent()){finish(null);return;}
                                    finish(entry.map);
                                }catch {finish(null);}
                            }, 'image/png');
                        } catch { finish(null); }
                    };
                    paint();
                } catch { finish(null); }
            };
            if (typeof requestIdleCallback === 'function') requestIdleCallback(generate, { timeout: 600 });
            else setTimeout(generate, 0);
        });
        cache.set(key, entry);
        return entry.promise;
    },
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
    prepareTextures(node, diameter, pixelRatio = window.devicePixelRatio || 1) {
        // Match the capped screen diameter, never the uncapped world size.
        // Artificial Satellites and Astronauts never request a surface field.
        const physicalSize = diameter * pixelRatio;
        const size = Math.min(256, Math.max(64, 2 ** Math.ceil(Math.log2(physicalSize))));
        if(!['sun','planet','moon'].includes(node.dataset.body))return;
        const {material,seed,hue}=this.bodyIdentity(node);
        const key = `${seed}:${node.dataset.body}:${material}:${hue}:${size}`;
        if (node.textureKey === key && this.bodyTextureCache.has(key) && (node.bodyPaintKey===key||node.dataset.textureReady==='pending')) return;
        node.textureKey = key;
        node.textureSize = size;
        node.dataset.textureReady = "pending";
        const preview=this.preparePreview(node,diameter);
        const paint=size===64?preview:this.bakeBody(seed,size,material,hue,node.dataset.body,()=>node.isConnected&&node.textureKey===key&&node.dataset.semanticHidden!=='true'&&node.dataset.culled!=='true',this.bodyTextureCache,96);
        return paint.then(map => {
            if (!node.isConnected || node.textureKey !== key) return;
            if (map && !(node.closeDetailKey&&node.dataset.closeDetail==='true')) {
                node.style.setProperty("--surface-map", map);
                node.style.setProperty("--surface-grain", "none");
                this.installPaint(node,map,size,key,diameter);
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
        const panel = '<path d="M2 8h5v8H2zM17 8h5v8h-5z" fill="hsl(' + style.hue + ' 28% 31%)"/><path d="M4.5 8v8M19.5 8v8M2 12h5M17 12h5" stroke="#8fa5bc" stroke-opacity=".5" stroke-width=".5"/><path d="M2 8h5M17 8h5" stroke="#bdcbd5" stroke-width=".45"/>';
        const shapes = {
            "twin-panel": panel + '<path d="M7 12h10M12 7V4l3-1"/><rect x="9" y="8" width="6" height="8" rx="1" fill="#a5b2bd"/><path d="M10 9h4M10 14h4" stroke="#dce5e9" stroke-width=".55"/><path d="M11 16v2h2v-2" fill="#526473"/>',
            dish: '<path d="M12 12l4-5M14 5q7 0 6 6z" fill="#b0bcc5"/><path d="M14 5l4 3 2 3" stroke="#e0e6ea" stroke-width=".5"/><path d="M3 13h6v5H3z" fill="hsl(' + style.hue + ' 28% 31%)"/><path d="M8 15h3"/><rect x="10" y="11" width="6" height="7" rx="1" fill="#96a6b5"/><path d="M11 12h4M11 16h4" stroke="#dce5e9" stroke-width=".5"/>',
            probe: '<path d="M12 8V2M8 14l-4 5M16 14l4 5"/><path d="M8 9l4-3 4 3v6l-4 3-4-3z" fill="#adb9c2"/><path d="M9 11h6M12 7v3" stroke="#e0e8ec"/><path d="M9 14l3 2 3-2" stroke="#526473" stroke-width=".55"/>',
            station: panel + '<path d="M7 12h10M12 5v14"/><rect x="9" y="9" width="6" height="6" rx="1" fill="#b1bdc6"/><rect x="10" y="4" width="4" height="4" rx=".5" fill="#8395a6"/><path d="M11 18h2M10 10h4M11 5h2" stroke="#dce5e9" stroke-width=".6"/>'
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
        return `<svg class="astronaut-figure" aria-hidden="true" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g transform="rotate(${tilt} 12 12)" stroke-linecap="round" stroke-linejoin="round"><rect x="6.7" y="8" width="10.6" height="8" rx="2" fill="#758594"/><path d="${arms}M10 16h4${legs}" stroke="#cbd2d7" stroke-width="2.4" fill="none"/><path d="M9 9h6l1 7-4 2-4-2z" fill="#d6dce0"/><path d="M9 10v5M15 10v5" stroke="#99a9b5" stroke-width=".5"/><rect x="10.2" y="10.5" width="3.6" height="2.7" rx=".5" fill="#8799a6"/><path d="M11 11.4h1.4" stroke="#d9e5eb" stroke-width=".5"/><ellipse cx="12" cy="6" rx="4.5" ry="4.2" fill="#e0e4e7"/><rect x="8.8" y="4.1" width="6.4" height="3.6" rx="1.6" fill="#172634"/><path d="M10 4.7h2l1 1" stroke="#82939f" stroke-width=".65"/><path d="M9.5 8h5" stroke="#afbfc9" stroke-width=".6"/></g></svg>`;
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
