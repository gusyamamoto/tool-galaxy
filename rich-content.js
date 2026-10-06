// Inspector presentation over canonical entry content and a replaceable file store.
class EntryContentInspector {
    constructor({ store, getEntry, save, rollback, onAction, onLayout }) {
        Object.assign(this, { store, getEntry, save, rollback, onAction, onLayout });
        this.root = document.getElementById("panel-rich-content");
        this.notes = document.getElementById("content-notes");
        this.linkForm = document.getElementById("content-link-form");
        this.files = document.getElementById("content-files");
        this.status = document.getElementById("content-status");
        this.jobs = new Map(); this.urls = new Set(); this.generation = 0; this.entryId = null; this.previewLoads = 0;
        this.notes.maxLength = galaxyModel.contentLimits.notes;
        document.getElementById("content-file-limit").textContent = `JPG, PNG, WebP, PDF, TXT or MD · up to ${galaxyModel.contentLimits.fileBytes / 1024 / 1024} MiB per file`;
        this.root.addEventListener("toggle", () => { this.root.parentElement.classList.toggle("rich-content-open", this.root.open); this.render(); this.onLayout(); });
        this.root.addEventListener("input", () => this.onAction());
        this.root.addEventListener("click", () => this.onAction());
        document.getElementById("content-notes-form").addEventListener("submit", event => {
            event.preventDefault();
            this.onAction();
            try { this.save(this.entryId, { ...this.content(), notes: { format: "plain", text: this.notes.value } }); this.message("Notes saved."); }
            catch (error) { this.error(error); }
        });
        document.getElementById("content-add-link").addEventListener("click", () => this.editLink());
        document.getElementById("content-cancel-link").addEventListener("click", () => { this.linkForm.hidden = true; this.onLayout(); });
        this.linkForm.addEventListener("submit", event => {
            event.preventDefault();
            this.onAction();
            const url = galaxyModel.webUrl(document.getElementById("content-link-url").value);
            if (!url) { this.message("Enter a valid http or https web URL.", true); return; }
            const title = document.getElementById("content-link-title").value.trim();
            const link = { id: this.editingLinkId || crypto.randomUUID(), url, ...(title ? { title } : {}) };
            const content = this.content(), links = this.editingLinkId ? content.links.map(old => old.id === link.id ? link : old) : [...content.links, link];
            try { this.save(this.entryId, { ...content, links }); this.linkForm.hidden = true; this.message("Link saved."); this.renderLists(); }
            catch (error) { this.error(error); }
        });
        this.files.addEventListener("change", () => { const files = [...this.files.files]; this.files.value = ""; if (files.length) this.upload(files); });
        const drop = document.getElementById("content-drop");
        drop.addEventListener("dragover", event => { if ([...event.dataTransfer.types].includes("Files")) { event.preventDefault(); event.stopPropagation(); drop.classList.add("drop-active"); } });
        drop.addEventListener("dragleave", () => drop.classList.remove("drop-active"));
        drop.addEventListener("drop", event => {
            event.preventDefault(); event.stopPropagation(); drop.classList.remove("drop-active");
            if (this.entryId && event.dataTransfer.files.length) this.upload([...event.dataTransfer.files]);
        });
        window.addEventListener("pagehide", () => this.clearPreviews());
    }
    content(id = this.entryId) { return this.getEntry(id)?.content || galaxyModel.emptyContent(); }
    message(text, error = false) { this.status.textContent = text; this.status.hidden = false; this.status.dataset.error = String(error); this.onLayout(); }
    error(error) {
        this.message(error?.name === "QuotaExceededError" ? "Browser storage is full. Remove some files and try again." : error?.message || "This content could not be saved.", true);
    }
    select(entry, visible) {
        this.entryId = entry?.id || null; this.visible = visible;
        this.linkForm.hidden = true; this.status.hidden = true;
        this.notes.value = this.content().notes.text;
        this.renderLists(); this.busy();
    }
    hide() { this.visible = false; this.clearPreviews(); }
    render() { if (this.entryId) { this.renderLists(); this.busy(); } }
    busy() {
        const busy = !!this.jobs.get(this.entryId);
        this.root.querySelectorAll("button,input,textarea").forEach(field => { field.disabled = busy; });
        this.root.setAttribute("aria-busy", String(busy));
    }
    hasJobs(ids) { return [...ids].some(id => this.jobs.get(id)); }
    async job(id, operation) {
        if (this.jobs.get(id)) { this.message("Wait for the current file action to finish.", true); return; }
        this.onAction(); this.jobs.set(id, 1); this.busy();
        try { await operation(); if (id === this.entryId) { this.renderLists(); this.message("File action completed."); } }
        catch (error) { if (id === this.entryId) { this.renderLists(); this.error(error); } }
        finally { this.jobs.delete(id); this.busy(); }
    }
    editLink(link) {
        this.editingLinkId = link?.id || null;
        document.getElementById("content-link-url").value = link?.url || "";
        document.getElementById("content-link-title").value = link?.title || "";
        this.linkForm.hidden = false; document.getElementById("content-link-url").focus({ preventScroll: true }); this.onLayout();
    }
    button(text, action, label = text) {
        const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.ariaLabel = label;
        button.addEventListener("click", action); return button;
    }
    clearPreviews() { this.generation++; this.urls.forEach(url => URL.revokeObjectURL(url)); this.urls.clear(); }
    renderLists() {
        this.clearPreviews();
        const links = document.getElementById("content-links"), files = document.getElementById("content-attachments");
        links.replaceChildren(); files.replaceChildren();
        if (!this.entryId) return;
        this.content().links.forEach(link => {
            const item = document.createElement("li"), anchor = document.createElement("a"), url = document.createElement("small"), actions = document.createElement("div");
            anchor.href = link.url; anchor.target = "_blank"; anchor.rel = "noopener noreferrer"; anchor.textContent = link.title || link.url;
            url.textContent = link.title ? link.url : "";
            actions.className = "content-row-actions";
            actions.append(this.button("Edit", () => this.editLink(link), `Edit link ${link.title || link.url}`), this.button("Remove", () => {
                try { this.save(this.entryId, { ...this.content(), links: this.content().links.filter(old => old.id !== link.id) }); this.renderLists(); this.message("Link removed."); }
                catch (error) { this.error(error); }
            }, `Remove link ${link.title || link.url}`));
            item.append(anchor, url, actions); links.append(item);
        });
        const generation = this.generation;
        this.content().attachments.forEach(metadata => {
            const item = document.createElement("li"), name = document.createElement("span"), size = document.createElement("small"), preview = document.createElement("div"), actions = document.createElement("div");
            item.dataset.attachmentId = metadata.id; name.textContent = metadata.filename;
            size.textContent = `${metadata.mimeType === "application/pdf" ? "PDF · " : ""}${metadata.size >= 1024*1024 ? (metadata.size/1024/1024).toFixed(1)+" MiB" : metadata.size >= 1024 ? (metadata.size/1024).toFixed(1)+" KiB" : metadata.size+" B"}`;
            actions.className = "content-row-actions";
            actions.append(this.button("Open", () => this.openFile(metadata), `Open attachment ${metadata.filename}`), this.button("Remove", event => {
                const button = event.currentTarget;
                if (button.dataset.confirm !== "true") { button.dataset.confirm = "true"; button.textContent = "Confirm remove"; button.ariaLabel = `Confirm remove attachment ${metadata.filename}`; return; }
                const id = metadata.entryId;
                this.job(id, async () => {
                    const previous = this.getEntry(id)?.content;
                    await this.store.delete(metadata.storageKey,
                        () => this.save(id, { ...this.content(id), attachments: this.content(id).attachments.filter(file => file.id !== metadata.id) }),
                        () => this.rollback(id, previous));
                });
            }, `Remove attachment ${metadata.filename}`));
            item.append(name, size, preview, actions); files.append(item);
            if (this.root.open && this.visible) this.preview(metadata, preview, generation);
        });
        this.onLayout();
    }
    async preview(metadata, element, generation) {
        this.previewLoads++;
        try {
            const record = await this.store.get(metadata.storageKey);
            if (generation !== this.generation || !this.visible || !this.root.open) return;
            if (!record || record.entryId !== metadata.entryId) { element.textContent = "File unavailable in this browser storage."; return; }
            if (metadata.mimeType.startsWith("image/") && record.thumbnail) {
                const image = document.createElement("img"), url = URL.createObjectURL(record.thumbnail);
                this.urls.add(url); image.src = url; image.alt = `Preview of ${metadata.filename}`; image.loading = "lazy"; element.append(image);
                image.onload = () => this.onLayout();
            } else if (metadata.mimeType.startsWith("text/")) {
                const text = await record.blob.slice(0,galaxyModel.contentLimits.textPreviewBytes).text();
                if (generation !== this.generation) return;
                const pre = document.createElement("pre"); pre.textContent = text; element.append(pre);
            }
        } catch (error) { if (generation === this.generation) element.textContent = "Preview unavailable. Use Open to try again."; }
    }
    upload(files) {
        const id = this.entryId;
        return this.job(id, async () => {
            for (const file of files) {
                const { metadata, record } = await galaxyAttachmentFiles.prepare(file,id);
                let previous;
                await this.store.save(record, () => {
                    previous = this.getEntry(id)?.content;
                    this.save(id, { ...this.content(id), attachments: [...this.content(id).attachments, metadata] });
                }, () => this.rollback(id, previous));
            }
        });
    }
    async openFile(metadata) {
        this.onAction();
        const tab = window.open("about:blank", "_blank");
        if (!tab) { this.message("Allow this file to open in a new browser tab.", true); return; }
        tab.opener = null;
        try {
            const record = await this.store.get(metadata.storageKey);
            if (!record || record.entryId !== metadata.entryId) throw new Error("This file is unavailable in this browser storage.");
            const blob = metadata.mimeType === "text/markdown" ? new Blob([record.blob],{type:"text/plain"}) : record.blob;
            const url = URL.createObjectURL(blob);
            tab.location.replace(url);
            const timer = setInterval(() => { if (tab.closed) { URL.revokeObjectURL(url); clearInterval(timer); } },1000);
            window.addEventListener("pagehide", () => { URL.revokeObjectURL(url); clearInterval(timer); }, { once: true });
        } catch (error) { tab.close(); this.error(error); }
    }
}
