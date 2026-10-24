function cosmosMediaDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '';
    const total = Math.floor(seconds), minutes = Math.floor(total / 60);
    return `${minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2,'0')}` : minutes}:${String(total % 60).padStart(2,'0')}`;
}

// Unified local Media presentation. PDFs keep their independent native-reader flow.
// Retain the constructor name for the existing inspector composition.
class CosmifoldImageViewer {
    constructor({store, getEntry, openExternal, supportsPdf = () => navigator.pdfViewerEnabled ?? !!navigator.mimeTypes?.namedItem?.('application/pdf')}) {
        Object.assign(this, {store, getEntry, openExternal, supportsPdf});
        const byId = id => document.getElementById(id);
        this.dialog = byId('image-viewer'); this.image = byId('image-viewer-image'); this.video = byId('media-viewer-video');
        this.area = this.dialog.querySelector('.media-viewer-area'); this.name = byId('image-viewer-name');
        this.status = byId('image-viewer-status'); this.navigation = byId('image-viewer-navigation');
        this.previous = byId('image-viewer-previous'); this.next = byId('image-viewer-next');
        this.filmstrip = byId('media-viewer-filmstrip'); this.pdf = byId('attachment-viewer-pdf');
        this.pdfTools = byId('attachment-viewer-pdf-tools'); this.external = byId('attachment-viewer-external');
        this.info = byId('image-viewer-info'); this.infoText = byId('media-viewer-info-text'); this.infoButton = byId('image-viewer-info-button');
        this.infoCopy = byId('media-viewer-info-copy'); this.saveCopy = byId('media-viewer-save-copy');
        this.version = 0; this.session = 0; this.thumbnailUrls = new Set();
        this.external.addEventListener('click',event=>{
            if(!this.openExternal)return;event.preventDefault();this.openExternal(this.images[this.index],this.originalBlob);
        });
        for(const link of [this.saveCopy,this.infoCopy])link.addEventListener('click',event=>{
            event.preventDefault();if(!this.originalBlob)return;
            try{cosmifoldObjectUrls.download(new Blob([this.originalBlob],{type:'application/octet-stream'}),this.images[this.index].filename);}
            catch{this.status.hidden=false;this.status.textContent='This copy could not be saved. Please try again.';}
        });
        this.infoButton.addEventListener('click', () => {
            this.info.hidden = !this.info.hidden; this.infoButton.setAttribute('aria-expanded', String(!this.info.hidden));
        });
        byId('image-viewer-close').addEventListener('click', () => this.dialog.close());
        this.previous.addEventListener('click', () => this.show(this.index - 1));
        this.next.addEventListener('click', () => this.show(this.index + 1));
        const isBackdrop = target => target === this.dialog || target.classList.contains('image-viewer-stage') || target === this.area;
        let backdrop = false;
        this.dialog.addEventListener('pointerdown', event => { backdrop = isBackdrop(event.target); });
        this.dialog.addEventListener('click', event => { if (backdrop && isBackdrop(event.target)) this.dialog.close(); backdrop = false; });
        this.dialog.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.key === 'Escape') {
                // The first Escape belongs to native video fullscreen when it is active.
                if (document.fullscreenElement) return;
                event.preventDefault(); this.dialog.close();
            } else if (!this.isPdf && event.target !== this.video && ['ArrowLeft','ArrowRight'].includes(event.key)) {
                event.preventDefault(); this.show(this.index + (event.key === 'ArrowLeft' ? -1 : 1));
            } else if (event.key === 'Tab' && event.target !== this.video) {
                const controls = [...this.dialog.querySelectorAll('button,a[href],embed,video')].filter(control => !control.disabled && control.getClientRects().length);
                const target = event.shiftKey && document.activeElement === controls[0] ? controls.at(-1)
                    : !event.shiftKey && document.activeElement === controls.at(-1) ? controls[0] : null;
                if (target) { event.preventDefault(); target.focus(); }
            }
            // Arrow/Space/Tab defaults inside native video controls remain available.
        });
        this.pdf.addEventListener('error', () => {
            if (!this.dialog.open || !this.isPdf) return;
            this.pdf.hidden = true;this.pdf.removeAttribute('src');this.pdf.removeAttribute('type');this.status.hidden = false;
            this.status.textContent = 'This PDF could not be displayed here. Try Open externally.';
        });
        this.dialog.addEventListener('beforetoggle',event=>{if(event.newState==='closed')this.finishSession();});
        this.dialog.addEventListener('close', () => {
            if (this.dialog.open) return;
            this.finishSession();
            const target = this.trigger?.isConnected && this.trigger.getClientRects().length ? this.trigger : byId('close-inspector-button');
            (target?.getClientRects().length ? target : byId('sidebar-toggle')).focus({preventScroll:true});
        });
        this.resizeObserver = new ResizeObserver(() => this.fitImage()); this.resizeObserver.observe(this.area);
        window.addEventListener('pagehide', () => this.finishSession());
    }
    finishSession(){
        if(this.finishedSession===this.session)return;
        this.version++;this.session++;this.release();this.clearFilmstrip();this.finishedSession=this.session;
    }
    open(metadata, trigger) {
        if (document.querySelector('dialog[open]')) return;
        const policy = galaxyModel.filePolicy;
        this.isPdf = policy.classify(metadata).kind === 'pdf';
        const attachments = this.getEntry(metadata.entryId)?.content?.attachments || [];
        // Existing inspection property now contains the combined, ordered Media sequence.
        this.images = attachments.filter(file => this.isPdf ? file.id === metadata.id && policy.classify(file).kind === 'pdf' : policy.isMedia(file));
        const index = this.images.findIndex(file => file.id === metadata.id);
        if (index < 0) return;
        this.dialog.setAttribute('aria-label', this.isPdf ? 'PDF viewer' : 'Media viewer');
        this.info.hidden = true; this.infoButton.hidden = this.isPdf; this.infoButton.setAttribute('aria-expanded','false');
        this.trigger = trigger || document.activeElement; this.session++;
        this.dialog.showModal(); this.buildFilmstrip(); this.show(index);
    }
    release() {
        clearTimeout(this.videoTimer);
        this.video.onloadedmetadata = this.video.onloadeddata = this.video.onerror = null;
        this.video.pause(); this.video.hidden = true; this.video.removeAttribute('src'); this.video.removeAttribute('poster'); this.video.load();
        this.image.hidden = true; this.image.removeAttribute('src');
        this.pdf.hidden = true; this.pdf.removeAttribute('type'); this.pdf.removeAttribute('src');
        this.pdfTools.hidden = true; this.external.removeAttribute('href');
        this.saveCopy.hidden = true; this.saveCopy.removeAttribute('href'); this.infoCopy.removeAttribute('href');
        this.previous.style.removeProperty('left'); this.next.style.removeProperty('right');
        new Set([this.url,this.originalUrl,this.posterUrl].filter(Boolean)).forEach(url=>URL.revokeObjectURL(url));
        this.url = this.posterUrl = this.originalUrl = null;
        this.originalBlob=null;
    }
    clearFilmstrip() {
        this.filmstrip.querySelectorAll('img').forEach(image=>{image.onerror=null;image.removeAttribute('src');});
        this.filmstrip.replaceChildren();this.thumbnailUrls.forEach(url => URL.revokeObjectURL(url)); this.thumbnailUrls.clear();
    }
    refresh(){
        if(!this.dialog.open)return;
        const current=this.images[this.index],attachments=this.getEntry(current?.entryId)?.content?.attachments||[];
        const files=attachments.filter(file=>this.isPdf?file.id===current?.id:galaxyModel.filePolicy.isMedia(file));
        const index=files.findIndex(file=>file.id===current?.id&&file.storageKey===current?.storageKey);
        if(index<0){this.dialog.close();return;}
        if(JSON.stringify(files.map(file=>[file.id,file.storageKey]))!==JSON.stringify(this.images.map(file=>[file.id,file.storageKey]))){
            this.images=files;this.session++;this.buildFilmstrip();this.show(index);
        }
    }
    buildFilmstrip() {
        this.clearFilmstrip();
        if (this.isPdf || this.images.length < 2) return;
        const session = this.session;
        this.images.forEach((metadata,index) => {
            const kind = galaxyModel.filePolicy.classify(metadata).kind, button = document.createElement('button');
            button.type = 'button'; button.className = 'media-filmstrip-thumb'; button.setAttribute('aria-label', `View ${kind}: ${metadata.filename}`);
            button.textContent = kind === 'video' ? '▷' : '◇'; button.dataset.mediaId = metadata.id;
            if (kind === 'video') button.classList.add('is-video');
            button.addEventListener('click', () => this.show(index)); this.filmstrip.append(button);
            this.store.get(metadata.storageKey).then(record => {
                if (session !== this.session || !this.dialog.open || !button.isConnected || record?.entryId !== metadata.entryId || !record.thumbnail) return;
                const image = document.createElement('img'),url = URL.createObjectURL(record.thumbnail);
                const release=()=>{image.onerror=null;image.removeAttribute('src');image.remove();if(this.thumbnailUrls.delete(url))URL.revokeObjectURL(url);};
                try {
                    this.thumbnailUrls.add(url);
                    image.onerror=()=>{release();if(button.isConnected)button.textContent=kind==='video'?'▷':'◇';};
                    image.src = url; image.alt = ''; image.loading = 'lazy'; button.replaceChildren(image);
                    if (kind === 'video') { const play=document.createElement('span');play.textContent='▷';play.setAttribute('aria-hidden','true');button.append(play); }
                } catch {release();}
            }).catch(() => {});
        });
    }
    updateInfo(metadata) {
        const filename = document.createElement('p'), details = document.createElement('p'); filename.textContent = metadata.filename;
        const size = metadata.size >= 1024*1024 ? `${(metadata.size/1024/1024).toFixed(1)} MiB` : metadata.size >= 1024 ? `${(metadata.size/1024).toFixed(1)} KiB` : `${metadata.size} B`;
        const format = galaxyModel.filePolicy.extension(metadata.filename).toUpperCase();
        details.textContent = `${format ? format+' · ' : ''}${metadata.mimeType} · ${size}${metadata.width && metadata.height ? ` · ${metadata.width} × ${metadata.height}` : ''}${Number.isFinite(metadata.duration) ? ` · ${cosmosMediaDuration(metadata.duration)}` : ''}`;
        this.infoText.replaceChildren(filename,details);
    }
    fitImage() {
        if (!this.dialog.open) return;
        const rect = this.area.getBoundingClientRect();
        let renderedWidth = rect.width;
        if (!this.image.hidden && this.image.naturalWidth && this.image.naturalHeight) {
            const ratio = Math.min(rect.width/this.image.naturalWidth,rect.height/this.image.naturalHeight);
            renderedWidth = this.image.naturalWidth*ratio;
            this.image.style.width = `${renderedWidth}px`; this.image.style.height = `${this.image.naturalHeight*ratio}px`;
        } else if (!this.video.hidden && this.video.videoWidth && this.video.videoHeight) {
            renderedWidth = this.video.videoWidth*Math.min(rect.width/this.video.videoWidth,rect.height/this.video.videoHeight);
        }
        // Keep side navigation close to portrait media as well as wide photos.
        const inset = Math.max(0,(rect.width-renderedWidth)/2-56);
        this.previous.style.left = `${inset}px`; this.next.style.right = `${inset}px`;
    }
    videoUnavailable(version) {
        if (version !== this.version || !this.dialog.open) return;
        this.fallbackOriginal();
        this.status.hidden = false; this.status.textContent = 'This video cannot be played in this browser. Save a copy to watch it in another player.';
        this.saveCopy.hidden = !this.originalUrl;
    }
    fallbackOriginal(){
        // Failed decoder resources have no visible owner. Only an explicit
        // original-file download URL remains until this viewer session closes.
        clearTimeout(this.videoTimer);this.video.onloadedmetadata=this.video.onloadeddata=this.video.onerror=null;
        this.video.pause();this.video.hidden=true;this.video.removeAttribute('src');this.video.removeAttribute('poster');this.video.load();
        this.image.hidden=true;this.image.removeAttribute('src');
        if(this.posterUrl)URL.revokeObjectURL(this.posterUrl);this.posterUrl=null;
        try {
            if(!this.originalUrl)this.originalUrl=URL.createObjectURL(new Blob([this.originalBlob],{type:'application/octet-stream'}));
            if(this.url&&this.url!==this.originalUrl)URL.revokeObjectURL(this.url);this.url=null;
            for(const link of [this.saveCopy,this.infoCopy])link.href=this.originalUrl;
        } catch {this.release();}
    }
    async show(index) {
        if (!this.dialog.open || index < 0 || index >= this.images.length) return;
        this.index = index; const version = ++this.version, metadata = this.images[index], capability = galaxyModel.filePolicy.classify(metadata);
        this.release(); this.name.textContent = metadata.filename; this.name.hidden = !this.isPdf; this.image.alt = metadata.filename;
        this.updateInfo(metadata);
        this.status.hidden = false; this.status.textContent = this.isPdf ? 'Loading PDF...' : capability.kind === 'video' ? 'Loading video...' : 'Loading photo...';
        const navigable = !this.isPdf && this.images.length > 1;
        this.navigation.hidden = this.previous.hidden = this.next.hidden = !navigable;
        this.previous.disabled = index === 0; this.next.disabled = index === this.images.length-1;
        document.getElementById('image-viewer-position').textContent = `${index+1} / ${this.images.length}`;
        [...this.filmstrip.children].forEach((button,n) => { button.setAttribute('aria-current',String(n===index)); });
        this.filmstrip.children[index]?.scrollIntoView({block:'nearest',inline:'nearest'});
        if (document.activeElement?.disabled) document.getElementById('image-viewer-close').focus({preventScroll:true});
        try {
            const record = await this.store.get(metadata.storageKey);
            if (version !== this.version || !this.dialog.open) return;
            if(!this.getEntry(metadata.entryId)?.content?.attachments.some(file=>file.id===metadata.id&&file.storageKey===metadata.storageKey)){this.dialog.close();return;}
            if (!record || record.entryId !== metadata.entryId) throw new Error('Attachment unavailable in this browser storage.');
            this.originalBlob=record.blob;
            // A persisted friendly HEIF preview can be read even without a HEIF decoder.
            const preview = ['image/heic','image/heif'].includes(capability.renderType) && record.thumbnail;
            this.url = URL.createObjectURL(new Blob([record.blob],{type:capability.renderType}));
            if (preview) { this.originalUrl = this.url; this.url = URL.createObjectURL(preview); }
            if (this.isPdf) {
                this.external.href = this.url; this.pdfTools.hidden = false;
                const supported = this.supportsPdf(); this.status.hidden = supported;
                if (supported) { this.pdf.type='application/pdf';this.pdf.src=this.url;this.pdf.title=`PDF: ${metadata.filename}`;this.pdf.hidden=false; }
                else this.status.textContent = 'This browser cannot display PDFs here. Open the document externally to read it.';
                return;
            }
            for (const link of [this.saveCopy,this.infoCopy]) { link.href=this.originalUrl||this.url;link.download=metadata.filename; }
            if (capability.kind === 'video') {
                this.video.preload = 'auto';
                this.video.setAttribute('aria-label',`Video: ${metadata.filename}`);
                this.video.onloadedmetadata = () => {
                    if (version !== this.version) return;
                    this.updateInfo({...metadata,...(this.video.videoWidth && this.video.videoHeight ? {width:this.video.videoWidth,height:this.video.videoHeight} : {}),...(Number.isFinite(this.video.duration) ? {duration:this.video.duration} : {})});
                };
                this.video.onloadeddata = () => { if (version===this.version && this.dialog.open) {clearTimeout(this.videoTimer);this.status.hidden=true;this.video.hidden=false;this.fitImage();} };
                this.video.onerror = () => this.videoUnavailable(version);
                this.videoTimer = setTimeout(() => this.videoUnavailable(version),12000);
                if (record.thumbnail) {this.posterUrl=URL.createObjectURL(record.thumbnail);this.video.poster=this.posterUrl;}
                this.video.src = this.url; this.video.load();
                return;
            }
            this.image.src = this.url; await this.image.decode();
            if (version !== this.version || !this.dialog.open) return;
            this.status.hidden = true; this.image.hidden = false; this.fitImage();
        } catch {
            if (version !== this.version || !this.dialog.open) return;
            const downloadable = !this.isPdf && this.saveCopy.hasAttribute('href');
            if (downloadable) { this.fallbackOriginal();this.saveCopy.hidden = !this.originalUrl; }
            else this.release();
            this.status.hidden = false;
            this.status.textContent = this.isPdf ? 'This PDF could not be opened. You can close the viewer and try again.' : downloadable ? 'Preview unavailable in this browser. Save a copy to open the original in another app.' : 'This media could not be opened. It may be unavailable in this browser storage.';
        }
    }
}
