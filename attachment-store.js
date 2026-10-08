// File preparation and preview validation; persistence is injected separately.
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
