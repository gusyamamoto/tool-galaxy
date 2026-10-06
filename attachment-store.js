// Replaceable binary storage boundary. The inspector never uses IndexedDB APIs.
// Metadata callbacks are synchronous so both writes share an abortable IDB tx.
function createGalaxyAttachmentStore({ temporary = false, indexedDB = globalThis.indexedDB } = {}) {
    const memory = new Map();
    const ownership = new Map();
    let discovered = temporary;
    let opening = null;
    function open() {
        if (opening) return opening;
        opening = new Promise((resolve, reject) => {
            if (!indexedDB) { reject(new Error("File storage is unavailable in this browser.")); return; }
            const request = indexedDB.open("galaxy-attachments", 1);
            let failed = false;
            request.onupgradeneeded = () => {
                const store = request.result.createObjectStore("files", { keyPath: "key" });
                store.createIndex("entryId", "entryId", { unique: false });
            };
            request.onblocked = () => { failed = true; reject(new Error("Close other Galaxy tabs and try the file action again.")); };
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                if (failed) { db.close(); return; }
                db.onversionchange = () => { db.close(); opening = null; };
                resolve(db);
            };
        }).catch(error => { opening = null; throw error; });
        return opening;
    }
    async function transaction(mode, operation, commit = () => {}, rollback = () => {}) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction("files", mode), store = tx.objectStore("files");
            let result, failure, metadataCommitted = false;
            tx.oncomplete = () => resolve(result);
            tx.onabort = () => {
                if (metadataCommitted) {
                    try { rollback(); } catch (error) { failure = new Error("The file action failed and metadata recovery failed. Reload before continuing.", { cause: error }); }
                }
                reject(failure || tx.error || new Error("File storage could not complete the action."));
            };
            const finish = value => {
                try {
                    const returned = commit();
                    if (returned?.then) throw new Error("Attachment metadata must be committed synchronously.");
                    metadataCommitted = true; result = value;
                } catch (error) { failure = error; tx.abort(); }
            };
            try { operation(store, finish); } catch (error) { failure = error; tx.abort(); }
        });
    }
    // Read keys/owners only at startup, never file bytes or previews. This also
    // lets deletion clean an unreferenced file left by an interrupted old write.
    if (!temporary) transaction("readonly", (store, finish) => {
        const request = store.index("entryId").openKeyCursor();
        request.onsuccess = () => { const cursor = request.result;
            if (!cursor) { finish(); return; }
            ownership.set(cursor.primaryKey, cursor.key); cursor.continue();
        };
    }).catch(() => {}).finally(() => { discovered = true; });
    async function remove(matches, commit, rollback, targets, byEntry = false) {
        if (temporary) {
            const removed = [...memory].filter(([, record]) => matches(record));
            // A failed metadata write cannot delete temporary files either.
            const result = commit?.();
            if (result?.then) throw new Error("Attachment metadata must be committed synchronously.");
            removed.forEach(([key]) => memory.delete(key));
            return removed.length;
        }
        const removed = [];
        const result = await transaction("readwrite", (store, finish) => {
            let count = 0, index = 0;
            const source = byEntry ? store.index("entryId") : store;
            const next = () => {
                if (index === targets.length) { finish(count); return; }
                const request = source.openKeyCursor(IDBKeyRange.only(targets[index++]));
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (!cursor) { next(); return; }
                    store.delete(cursor.primaryKey); removed.push(cursor.primaryKey); count++; cursor.continue();
                };
            };
            next();
        }, commit, rollback);
        removed.forEach(key => ownership.delete(key));
        return result;
    }
    return {
        temporary,
        hasEntries(ids) { const set = new Set(ids); return temporary ? [...memory.values()].some(record => set.has(record.entryId)) : !discovered || [...ownership.values()].some(id => set.has(id)); },
        async save(record, commit, rollback) {
            if (!record?.key || !record.entryId || !(record.blob instanceof Blob)) throw new Error("Invalid attachment file.");
            if (temporary) { commit?.(); memory.set(record.key, record); return; }
            const result = await transaction("readwrite", (store, finish) => { const request = store.put(record); request.onsuccess = () => finish(); }, commit, rollback);
            ownership.set(record.key, record.entryId); return result;
        },
        async get(key) {
            if (temporary) return memory.get(key) || null;
            return transaction("readonly", (store, finish) => { const request = store.get(key); request.onsuccess = () => finish(request.result || null); });
        },
        delete(key, commit, rollback) { return remove(record => record.key === key, commit, rollback, [key]); },
        deleteEntries(ids, commit, rollback) { const set = new Set(ids); return remove(record => set.has(record.entryId), commit, rollback, [...set], true); }
    };
}

const galaxyAttachmentFiles = {
    types: { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf", txt: "text/plain", md: "text/markdown" },
    async prepare(file, entryId) {
        const extension = file.name.split(".").pop().toLowerCase(), mimeType = this.types[extension];
        if (!mimeType) throw new Error("Unsupported file type. Choose JPG, JPEG, PNG, WebP, PDF, TXT or MD.");
        if (!file.name || file.name.length > 255) throw new Error("Choose a file with a shorter filename.");
        if (file.size > galaxyModel.contentLimits.fileBytes) throw new Error(`This file is too large. The per-file limit is ${galaxyModel.contentLimits.fileBytes / 1024 / 1024} MiB.`);
        const id = crypto.randomUUID(), metadata = { id, kind: "upload", entryId, filename: file.name,
            mimeType, size: file.size, storageKey: id, createdAt: new Date().toISOString() };
        const record = { key: id, entryId, blob: new Blob([file], { type: mimeType }) };
        if (mimeType === "application/pdf") {
            if (await file.slice(0, 5).text() !== "%PDF-") throw new Error("This file is not a valid PDF.");
        }
        if (mimeType.startsWith("image/")) {
            const bytes = new Uint8Array(await file.arrayBuffer()), view = new DataView(bytes.buffer);
            let width, height, orientation = 1;
            if (mimeType === "image/png" && bytes.length >= 24 && bytes.slice(0,8).join() === "137,80,78,71,13,10,26,10") {
                width = view.getUint32(16); height = view.getUint32(20);
            } else if (mimeType === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216) {
                for (let i = 2; i + 9 < bytes.length;) {
                    if (bytes[i++] !== 255) break;
                    while (bytes[i] === 255) i++;
                    const marker = bytes[i++];
                    if (marker === 217 || marker === 218) break;
                    if (marker === 1 || marker >= 208 && marker <= 215) continue;
                    const size = view.getUint16(i);
                    if (size < 2 || i+size > bytes.length) break;
                    if (marker === 225 && size >= 16 && String.fromCharCode(...bytes.slice(i+2,i+8)) === "Exif\0\0") {
                        const tiff = i+8, little = view.getUint16(tiff) === 18761, end = i+size;
                        const directory = tiff+view.getUint32(tiff+4,little);
                        if (directory >= tiff+8 && directory+2 <= end) {
                            const count = view.getUint16(directory,little);
                            for (let n=0;n<count && directory+2+(n+1)*12<=end;n++) {
                                const row = directory+2+n*12;
                                if (view.getUint16(row,little) === 274 && view.getUint16(row+2,little) === 3 && view.getUint32(row+4,little) === 1)
                                    orientation = view.getUint16(row+8,little);
                            }
                        }
                    }
                    if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) { height = view.getUint16(i+3); width = view.getUint16(i+5); break; }
                    i += size;
                }
            } else if (mimeType === "image/webp" && bytes.length >= 25 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") {
                const type = String.fromCharCode(...bytes.slice(12,16));
                if (type === "VP8X" && bytes.length >= 30) { width = 1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16); height = 1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16); }
                else if (type === "VP8 " && bytes.length >= 30) { width = view.getUint16(26,true)&16383; height = view.getUint16(28,true)&16383; }
                else if (type === "VP8L" && bytes[20] === 47) { const bits=view.getUint32(21,true);width=(bits&16383)+1;height=((bits>>>14)&16383)+1; }
            }
            if (orientation >= 5 && orientation <= 8) [width,height] = [height,width];
            if (!width || !height || width*height > galaxyModel.contentLimits.imagePixels) throw new Error(`This image is invalid or exceeds the ${galaxyModel.contentLimits.imagePixels / 1000000} megapixel preview limit.`);
            const ratio = Math.min(1, galaxyModel.contentLimits.thumbnailEdge / Math.max(width,height));
            const bitmap = await createImageBitmap(file, { resizeWidth: Math.max(1,Math.round(width*ratio)), resizeHeight: Math.max(1,Math.round(height*ratio)), resizeQuality: "low" });
            try {
                const canvas = document.createElement("canvas");canvas.width=bitmap.width;canvas.height=bitmap.height;
                canvas.getContext("2d").drawImage(bitmap,0,0);
                record.thumbnail = await new Promise(resolve => canvas.toBlob(resolve,"image/webp",.8));
                if (!record.thumbnail) throw new Error("Could not create this image preview.");
                metadata.width=width;metadata.height=height;
            } finally { bitmap.close(); }
        }
        return { metadata, record };
    }
};
