// File preparation and preview validation; persistence is injected separately.
const galaxyAttachmentFiles = {
    types: galaxyModel.filePolicy.previewTypes,
    async prepare(file, entryId) {
        if (!file.name) throw new Error('This file has no filename. Save a local copy with a name, then choose it again.');
        if (file.name.length > 255) throw new Error("Choose a file with a shorter filename.");
        const policy = galaxyModel.filePolicy, extension = policy.extension(file.name);
        const mimeType = policy.validMime(file.type) ? file.type : 'application/octet-stream';
        if (policy.blocked(file.name,mimeType)) throw new Error('Executable files, installers, and scripts cannot be attached. Choose a document, project file, or archive instead.');
        const isVideo = policy.classify({filename:file.name,mimeType}).kind === 'video';
        const limit = isVideo ? galaxyModel.contentLimits.videoBytes : galaxyModel.contentLimits.fileBytes;
        if (file.size > limit) throw new Error(`This ${isVideo ? 'video' : 'file'} is too large. The ${isVideo ? 'local video' : 'per-file'} limit is ${limit / 1024 / 1024} MiB.`);
        const id = cosmifoldIds.uuid(), metadata = { id, kind: "upload", entryId, filename: file.name,
            mimeType, extension, size: file.size, storageKey: id, createdAt: new Date().toISOString() };
        const record = { key: id, entryId, blob: new Blob([file], { type: mimeType }) };
        const {kind,renderType} = policy.classify(metadata);
        if (kind === 'pdf') {
            if (await file.slice(0, 5).text() !== "%PDF-") throw new Error("This file is not a valid PDF.");
        }
        const heif = ['image/heic','image/heif'].includes(renderType);
        if (heif) await this.imagePreview(file, record, metadata);
        if (kind === 'image' && !heif) {
            const bytes = new Uint8Array(await file.arrayBuffer()), view = new DataView(bytes.buffer);
            let width, height, orientation = 1;
            if (renderType === "image/png" && bytes.length >= 24 && bytes.slice(0,8).join() === "137,80,78,71,13,10,26,10") {
                width = view.getUint32(16); height = view.getUint32(20);
            } else if (renderType === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216) {
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
            } else if (renderType === "image/webp" && bytes.length >= 25 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") {
                const type = String.fromCharCode(...bytes.slice(12,16));
                if (type === "VP8X" && bytes.length >= 30) { width = 1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16); height = 1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16); }
                else if (type === "VP8 " && bytes.length >= 30) { width = view.getUint16(26,true)&16383; height = view.getUint16(28,true)&16383; }
                else if (type === "VP8L" && bytes[20] === 47) { const bits=view.getUint32(21,true);width=(bits&16383)+1;height=((bits>>>14)&16383)+1; }
            }
            if (orientation >= 5 && orientation <= 8) [width,height] = [height,width];
            if (!width || !height) throw new Error('This image has an invalid or unsupported header. Choose another copy of the photo.');
            metadata.width=width;metadata.height=height;
            // The pixel budget limits preview work, not original-file storage.
            if (width*height <= galaxyModel.contentLimits.imagePixels) await this.imagePreview(file, record, metadata, {width,height});
        }
        if (kind === 'video') await this.videoPreview(record, metadata, renderType);
        return { metadata, record };
    },
    async imagePreview(file, record, metadata, dimensions = null) {
        // Native decoding is optional. Never replace/re-encode the stored original.
        let bitmap, timer, expired = false;
        try {
            // Contents needs enough source pixels for its compact tiles at phone DPR 2–3.
            const edge = galaxyModel.contentLimits.imagePreviewEdge;
            const ratio = dimensions ? Math.min(1,edge/Math.max(dimensions.width,dimensions.height)) : 1;
            const options = dimensions ? {resizeWidth:Math.max(1,Math.round(dimensions.width*ratio)),resizeHeight:Math.max(1,Math.round(dimensions.height*ratio)),resizeQuality:'high'} : undefined;
            const decoding = createImageBitmap(file, options).then(value => {
                if (expired) { value.close(); return null; }
                return value;
            });
            bitmap = await Promise.race([decoding,new Promise(resolve => {
                timer = setTimeout(() => { expired = true; resolve(null); },4000);
            })]);
            if (!bitmap || !bitmap.width || !bitmap.height || bitmap.width*bitmap.height > galaxyModel.contentLimits.imagePixels) return;
            const thumbnailRatio = Math.min(1,edge/Math.max(bitmap.width,bitmap.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1,Math.round(bitmap.width*thumbnailRatio)); canvas.height = Math.max(1,Math.round(bitmap.height*thumbnailRatio));
            const context = canvas.getContext('2d');
            context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
            context.drawImage(bitmap,0,0,canvas.width,canvas.height);
            const thumbnail = await new Promise(resolve => canvas.toBlob(resolve,'image/webp',.85));
            if (thumbnail) { record.thumbnail = thumbnail; metadata.width = dimensions?.width || bitmap.width; metadata.height = dimensions?.height || bitmap.height; }
        } catch { /* Preview failures never discard an accepted image's original bytes. */ }
        finally { clearTimeout(timer); bitmap?.close(); }
    },
    async videoPreview(record, metadata, renderType) {
        // Best-effort local frame extraction. Unsupported codecs remain valid attachments.
        const video = document.createElement('video'), url = URL.createObjectURL(new Blob([record.blob],{type:renderType}));
        let timer;
        try {
            video.preload = 'auto'; video.muted = true; video.playsInline = true;
            await new Promise(resolve => {
                let seeking = false, done = false, capturing = false, discoveringDuration = false;
                const finish = () => { if (!done) { done = true; resolve(); } };
                const capture = () => {
                    if (done || capturing || !video.videoWidth || !video.videoHeight || video.readyState < 2) return;
                    capturing = true;
                    const ratio = Math.min(1,galaxyModel.contentLimits.thumbnailEdge / Math.max(video.videoWidth,video.videoHeight));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1,Math.round(video.videoWidth*ratio)); canvas.height = Math.max(1,Math.round(video.videoHeight*ratio));
                    try { canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height); canvas.toBlob(blob=>{if(!done && blob)record.thumbnail=blob;finish()},'image/webp',.8); }
                    catch { finish(); }
                };
                video.onloadedmetadata = () => {
                    if (done) return;
                    if (video.videoWidth && video.videoHeight) { metadata.width=video.videoWidth;metadata.height=video.videoHeight; }
                    if (Number.isFinite(video.duration) && video.duration >= 0) metadata.duration=video.duration;
                    // Some locally recorded WebM/fragmented MP4 files omit container duration.
                    // A native seek to the end can discover it without altering the file.
                    if (video.duration === Infinity) { seeking=true;discoveringDuration=true;video.currentTime=1e10;return; }
                    const position = Number.isFinite(video.duration) ? Math.min(2,video.duration*.2) : 0;
                    if (position > 0) { seeking = true;video.currentTime=position; }
                };
                video.onloadeddata = () => { if (!seeking) capture(); };
                video.onseeked = () => {
                    if (done) return;
                    if (discoveringDuration) {
                        discoveringDuration=false;
                        const duration=Number.isFinite(video.duration)?video.duration:video.currentTime;
                        if (duration>0 && duration<1e10) {metadata.duration=duration;video.currentTime=Math.min(2,duration*.2);return;}
                    }
                    seeking=false;
                    capture();
                };
                video.onerror = finish;
                timer = setTimeout(finish,6000);
                video.src = url;
            });
        } catch { /* A polished fallback tile uses the original video bytes. */ }
        finally {
            clearTimeout(timer); video.onloadedmetadata=video.onloadeddata=video.onseeked=video.onerror=null;
            try { video.pause();video.removeAttribute('src');video.load(); }
            catch { /* Native teardown failure must not discard the original. */ }
            finally { URL.revokeObjectURL(url); }
        }
    }
};
