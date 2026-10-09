// Attachment presentation only; original bytes come through the existing file service.
class CosmifoldImageViewer {
    constructor({store, getEntry, supportsPdf = () => navigator.pdfViewerEnabled ?? !!navigator.mimeTypes?.namedItem?.('application/pdf')}) {
        Object.assign(this, {store, getEntry, supportsPdf});
        this.dialog = document.getElementById('image-viewer');
        this.image = document.getElementById('image-viewer-image');
        this.name = document.getElementById('image-viewer-name');
        this.status = document.getElementById('image-viewer-status');
        this.navigation = document.getElementById('image-viewer-navigation');
        this.previous = document.getElementById('image-viewer-previous');
        this.next = document.getElementById('image-viewer-next');
        this.pdf = document.getElementById('attachment-viewer-pdf');
        this.pdfTools = document.getElementById('attachment-viewer-pdf-tools');
        this.external = document.getElementById('attachment-viewer-external');
        this.info = document.getElementById('image-viewer-info');
        this.infoButton = document.getElementById('image-viewer-info-button');
        this.infoButton.addEventListener('click', () => {
            this.info.hidden = !this.info.hidden; this.infoButton.setAttribute('aria-expanded', String(!this.info.hidden));
        });
        this.version = 0;
        document.getElementById('image-viewer-close').addEventListener('click', () => this.dialog.close());
        this.previous.addEventListener('click', () => this.show(this.index - 1));
        this.next.addEventListener('click', () => this.show(this.index + 1));
        let backdrop = false;
        this.dialog.addEventListener('pointerdown', event => { backdrop = event.target === this.dialog || event.target.classList.contains('image-viewer-stage'); });
        this.dialog.addEventListener('click', event => { if (backdrop && (event.target === this.dialog || event.target.classList.contains('image-viewer-stage'))) this.dialog.close(); backdrop = false; });
        this.onKey = event => {
            event.stopPropagation();
            if (event.key === 'Escape') { event.preventDefault(); this.dialog.close(); }
            else if (!this.isPdf && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
                event.preventDefault(); this.show(this.index + (event.key === 'ArrowLeft' ? -1 : 1));
            } else if (event.key === 'Tab') {
                const controls = [...this.dialog.querySelectorAll('button, a[href], embed')].filter(button => !button.disabled && button.getClientRects().length);
                const target = event.shiftKey && document.activeElement === controls[0] ? controls.at(-1)
                    : !event.shiftKey && document.activeElement === controls.at(-1) ? controls[0] : null;
                if (target) { event.preventDefault(); target.focus(); }
            }
        };
        this.dialog.addEventListener('keydown', this.onKey);
        this.pdf.addEventListener('error', () => {
            if (!this.dialog.open || !this.isPdf) return;
            this.pdf.hidden = true; this.status.hidden = false;
            this.status.textContent = 'This PDF could not be displayed here. Try Open externally.';
        });
        this.dialog.addEventListener('close', () => {
            if (this.dialog.open) return; // An older queued close must not clear a reopened viewer.
            this.version++; this.release();
            const target = this.trigger?.isConnected && this.trigger.getClientRects().length ? this.trigger : document.getElementById('close-inspector-button');
            (target?.getClientRects().length ? target : document.getElementById('sidebar-toggle')).focus({preventScroll:true});
        });
        window.addEventListener('pagehide', () => { this.version++; this.release(); });
    }
    open(metadata, trigger) {
        if (document.querySelector('dialog[open]')) return;
        this.isPdf = galaxyModel.filePolicy.classify(metadata).kind === 'pdf';
        const attachments = this.getEntry(metadata.entryId)?.content?.attachments || [];
        this.images = attachments.filter(file => this.isPdf ? file.id === metadata.id && galaxyModel.filePolicy.classify(file).kind === 'pdf' : galaxyModel.filePolicy.classify(file).kind === 'image');
        this.dialog.setAttribute('aria-label', this.isPdf ? 'PDF viewer' : 'Photo viewer');
        this.info.hidden = true; this.infoButton.hidden = this.isPdf; this.infoButton.setAttribute('aria-expanded','false');
        const index = this.images.findIndex(file => file.id === metadata.id);
        if (index < 0) return;
        this.trigger = trigger || document.activeElement;
        this.dialog.showModal(); this.show(index);
    }
    release() {
        this.image.hidden = true; this.image.removeAttribute('src');
        this.pdf.hidden = true; this.pdf.removeAttribute('type'); this.pdf.removeAttribute('src');
        this.pdfTools.hidden = true; this.external.removeAttribute('href');
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = null;
    }
    async show(index) {
        if (!this.dialog.open || index < 0 || index >= this.images.length) return;
        this.index = index; const version = ++this.version, metadata = this.images[index];
        this.release(); this.name.textContent = metadata.filename; this.name.hidden = !this.isPdf; this.image.alt = metadata.filename;
        const filename = document.createElement('p'), details = document.createElement('p');
        filename.textContent = metadata.filename;
        const size = metadata.size >= 1024 * 1024 ? `${(metadata.size / 1024 / 1024).toFixed(1)} MiB` : metadata.size >= 1024 ? `${(metadata.size / 1024).toFixed(1)} KiB` : `${metadata.size} B`;
        details.textContent = `${metadata.mimeType} \u00b7 ${size}${metadata.width && metadata.height ? ` \u00b7 ${metadata.width} \u00d7 ${metadata.height}` : ''}`;
        this.info.replaceChildren(filename, details);
        this.status.hidden = false; this.status.textContent = this.isPdf ? 'Loading PDF...' : 'Loading image...';
        this.navigation.hidden = this.isPdf || this.images.length < 2;
        this.previous.disabled = index === 0; this.next.disabled = index === this.images.length - 1;
        document.getElementById('image-viewer-position').textContent = `${index + 1} / ${this.images.length}`;
        // A disabled navigation button must not strand keyboard focus.
        if (document.activeElement?.disabled) document.getElementById('image-viewer-close').focus({preventScroll:true});
        try {
            const record = await this.store.get(metadata.storageKey);
            if (version !== this.version || !this.dialog.open) return;
            if (!record || record.entryId !== metadata.entryId) throw new Error('This image is unavailable in this browser storage.');
            this.url = URL.createObjectURL(new Blob([record.blob], {type:galaxyModel.filePolicy.classify(metadata).renderType}));
            if (this.isPdf) {
                this.external.href = this.url; this.pdfTools.hidden = false;
                const supported = this.supportsPdf();
                this.status.hidden = supported;
                if (supported) { this.pdf.type = 'application/pdf'; this.pdf.src = this.url; this.pdf.title = `PDF: ${metadata.filename}`; this.pdf.hidden = false; }
                else this.status.textContent = 'This browser cannot display PDFs here. Open the document externally to read it.';
                return;
            }
            this.image.src = this.url;
            await this.image.decode();
            if (version !== this.version || !this.dialog.open) return;
            this.status.hidden = true; this.image.hidden = false;
        } catch (error) {
            if (version !== this.version || !this.dialog.open) return;
            this.release(); this.status.textContent = this.isPdf ? 'This PDF could not be opened. You can close the viewer and try again.' : 'This image could not be opened. You can close the viewer and try again.';
        }
    }
}
