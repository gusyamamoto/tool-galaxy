// Shared panel overflow interaction for content and collection entries.
function createPanelItemMenu(actions, label, root) {
    const menu = document.createElement("details"), summary = document.createElement("summary");
    menu.className = "content-item-menu"; summary.textContent = "•••";
    summary.ariaLabel = `Actions for ${label}`; summary.title = summary.ariaLabel;
    actions.setAttribute("role", "menu"); actions.setAttribute("aria-label", summary.ariaLabel);
    actions.querySelectorAll("button").forEach(button => button.setAttribute("role", "menuitem"));
    menu.append(summary, actions);
    menu.addEventListener("toggle", () => {
        if (menu.open) {
            root.querySelectorAll(".content-item-menu[open]").forEach(other => { if (other !== menu) other.open = false; });
            const bounds = root.closest("#entry-panel").getBoundingClientRect(), point = summary.getBoundingClientRect();
            menu.classList.toggle("opens-up", point.bottom + actions.offsetHeight + 6 > bounds.bottom && point.top - bounds.top > actions.offsetHeight + 6);
        }
    });
    menu.addEventListener("keydown", event => {
        if (event.key === "Escape" && menu.open) {
            event.preventDefault(); event.stopPropagation(); menu.open = false; summary.focus({ preventScroll: true });
        } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault(); event.stopPropagation(); menu.open = true;
            const buttons = [...actions.querySelectorAll("button:not(:disabled)")];
            const current = buttons.indexOf(document.activeElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : current < 0 ? 0 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next]?.focus({ preventScroll: true });
        }
    });
    menu.addEventListener("focusout", event => { if (event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false; });
    return menu;
}

// Content presentation over canonical entry content and a replaceable file store.
class EntryContentInspector {
    constructor({ store, getEntry, save, rollback, onAction, onLayout }) {
        Object.assign(this, { store, getEntry, save, rollback, onAction, onLayout });
        this.root = document.getElementById("panel-rich-content");
        this.notes = document.getElementById("content-notes");
        this.notesForm = document.getElementById("content-notes-form");
        this.notesView = document.getElementById("content-notes-view");
        this.linkForm = document.getElementById("content-link-form");
        this.files = document.getElementById("content-files");
        this.status = document.getElementById("content-status");
        this.jobs = new Map(); this.urls = new Set(); this.generation = 0; this.entryId = null; this.previewLoads = 0;
        this.notes.maxLength = galaxyModel.contentLimits.notes;
        document.getElementById("content-file-limit").textContent = `JPG, PNG, WebP, PDF, TXT or MD · up to ${galaxyModel.contentLimits.fileBytes / 1024 / 1024} MiB per file`;
        this.root.addEventListener("input", () => this.onAction());
        this.root.addEventListener("click", () => this.onAction());
        this.notesForm.addEventListener("submit", event => {
            event.preventDefault();
            this.onAction();
            try {
                this.save(this.entryId, { ...this.content(), notes: { format: "plain", text: this.notes.value } });
                this.notesForm.hidden = true; this.renderNotes(); this.message("Note saved.");
            }
            catch (error) { this.error(error); }
        });
        document.getElementById("content-edit-notes").addEventListener("click", () => this.editNotes());
        document.getElementById("content-add-files").addEventListener("click", () => this.chooseFiles());
        document.getElementById("content-notes-empty").addEventListener("click", () => this.editNotes());
        document.getElementById("content-add-bookmark").addEventListener("click", () => this.editLink());
        document.getElementById("content-cancel-notes").addEventListener("click", () => { this.notesForm.hidden = true; this.renderNotes(); this.onLayout(); });
        document.getElementById("content-cancel-link").addEventListener("click", () => { this.linkForm.hidden = true; this.renderBookmarkState(); this.onLayout(); });
        this.linkForm.addEventListener("submit", event => {
            event.preventDefault();
            this.onAction();
            const url = galaxyModel.webUrl(document.getElementById("content-link-url").value);
            if (!url) { this.message("Enter a valid website address, such as google.com or an HTTPS URL.", true); return; }
            const title = document.getElementById("content-link-title").value.trim();
            const link = { id: this.editingLinkId || crypto.randomUUID(), url, ...(title ? { title } : {}) };
            const content = this.content(), links = this.editingLinkId ? content.links.map(old => old.id === link.id ? link : old) : [...content.links, link];
            try { this.save(this.entryId, { ...content, links }); this.linkForm.hidden = true; this.message("Bookmark saved."); this.renderLists(); }
            catch (error) { this.error(error); }
        });
        this.files.addEventListener("change", () => {
            const files = [...this.files.files]; this.files.value = "";
            document.getElementById("content-file-limit").hidden = true;
            if (files.length) this.upload(files); else this.onLayout();
        });
        this.files.addEventListener("cancel", () => { document.getElementById("content-file-limit").hidden = true; this.onLayout(); });
        document.addEventListener("pointerdown", event => {
            this.root.querySelectorAll(".content-item-menu[open]").forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
        });
        window.addEventListener("pagehide", () => this.clearPreviews());
    }
    content(id = this.entryId) { return this.getEntry(id)?.content || galaxyModel.emptyContent(); }
    message(text, error = false) {
        clearTimeout(this.statusTimer);
        this.status.textContent = text; this.status.hidden = false; this.status.dataset.error = String(error); this.onLayout();
        if (!error) this.statusTimer = setTimeout(() => { this.status.hidden = true; this.onLayout(); }, 4000);
    }
    error(error) {
        this.message(error?.name === "QuotaExceededError" ? "Browser storage is full. Remove some files and try again." : error?.message || "This content could not be saved.", true);
    }
    select(entry, visible) {
        clearTimeout(this.statusTimer);
        this.entryId = entry?.id || null; this.visible = visible;
        this.linkForm.hidden = this.notesForm.hidden = true; this.status.hidden = true;
        document.getElementById("content-file-limit").hidden = true;
        this.notes.value = this.content().notes.text;
        this.renderNotes(); this.renderLists(); this.busy();
    }
    hide() { this.visible = false; clearTimeout(this.statusTimer); this.clearPreviews(); }
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
        if (!this.entryId || this.jobs.get(this.entryId)) return;
        this.onAction();
        this.editingLinkId = link?.id || null;
        document.getElementById("content-link-url").value = link?.url || "";
        document.getElementById("content-link-title").value = link?.title || "";
        this.linkForm.hidden = false; this.renderBookmarkState();
        document.getElementById("content-link-url").focus({ preventScroll: true }); this.onLayout();
    }
    chooseFiles() {
        if (this.entryId && !this.jobs.get(this.entryId)) {
            this.onAction(); document.getElementById("content-file-limit").hidden = false;
            this.onLayout(); this.files.click();
        }
    }
    editNotes() {
        if (!this.entryId || this.jobs.get(this.entryId)) return;
        this.onAction();
        if (this.notesForm.hidden) this.notes.value = this.content().notes.text;
        this.notesForm.hidden = false; this.renderNotes();
        this.notes.focus({ preventScroll: true }); this.onLayout();
    }
    renderNotes() {
        const text = this.content().notes.text;
        this.notesView.textContent = text;
        this.notesView.hidden = !text || !this.notesForm.hidden;
        const button = document.getElementById("content-edit-notes");
        button.hidden = !text || !this.notesForm.hidden;
        document.getElementById("content-notes-empty").hidden = !!text || !this.notesForm.hidden;
    }
    renderBookmarkState() { document.getElementById("content-bookmarks-empty").hidden = !!this.content().links.length || !this.linkForm.hidden; }
    button(text, action, label = text) {
        const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.ariaLabel = label;
        button.addEventListener("click", action); return button;
    }
    itemMenu(actions, label) {
        return createPanelItemMenu(actions, label, this.root);
    }
    clearPreviews() { this.generation++; this.urls.forEach(url => URL.revokeObjectURL(url)); this.urls.clear(); }
    renderLists() {
        this.clearPreviews();
        const links = document.getElementById("content-links"), files = document.getElementById("content-attachments");
        links.replaceChildren(); files.replaceChildren();
        if (!this.entryId) return;
        this.content().links.forEach(link => {
            const item = document.createElement("li"), anchor = document.createElement("a"), url = document.createElement("small"), actions = document.createElement("div"), info = document.createElement("div"), icon = document.createElement("span");
            const address = new URL(link.url);
            item.className = "content-bookmark";
            icon.className = "bookmark-icon"; icon.ariaHidden = "true";
            icon.innerHTML = '<svg viewBox="0 0 20 20"><path d="M5 3h10v14l-5-3-5 3z"/></svg>';
            anchor.href = link.url; anchor.target = "_blank"; anchor.rel = "noopener noreferrer"; anchor.textContent = link.title || address.hostname;
            url.textContent = `${address.hostname}${address.pathname === "/" ? "" : address.pathname}${address.search}`;
            url.title = link.url;
            actions.className = "content-row-actions";
            actions.append(this.button("Edit", () => this.editLink(link), `Edit bookmark ${link.title || link.url}`), this.button("Remove", () => {
                try { this.save(this.entryId, { ...this.content(), links: this.content().links.filter(old => old.id !== link.id) }); this.renderLists(); this.message("Bookmark removed."); }
                catch (error) { this.error(error); }
            }, `Remove bookmark ${link.title || link.url}`));
            info.className = "bookmark-info"; info.append(anchor, url);
            item.append(icon, info, this.itemMenu(actions, link.title || link.url)); links.append(item);
        });
        const generation = this.generation;
        this.content().attachments.forEach(metadata => {
            const item = document.createElement("li"), name = this.button(metadata.filename, () => this.openFile(metadata), `Open attachment ${metadata.filename}`), size = document.createElement("small"), preview = document.createElement("div"), actions = document.createElement("div"), info = document.createElement("div");
            item.className = "content-file"; item.dataset.attachmentId = metadata.id;
            name.className = "content-file-name";
            preview.className = "content-file-preview";
            const badge = this.button(metadata.mimeType.startsWith("image/") ? "IMG" : metadata.mimeType === "application/pdf" ? "PDF" : metadata.filename.toLowerCase().endsWith(".md") ? "MD" : "TXT", () => this.openFile(metadata), `View ${metadata.filename}`);
            badge.className = "content-file-icon"; preview.append(badge);
            size.textContent = `${metadata.size >= 1024*1024 ? (metadata.size/1024/1024).toFixed(1)+" MiB" : metadata.size >= 1024 ? (metadata.size/1024).toFixed(1)+" KiB" : metadata.size+" B"}`;
            actions.className = "content-row-actions";
            actions.append(this.button("Remove", event => {
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
            info.className = "content-file-info"; info.append(name, size);
            item.append(preview, info, this.itemMenu(actions, metadata.filename)); files.append(item);
            if (this.visible) this.preview(metadata, preview, generation);
        });
        document.getElementById("content-files-empty").hidden = !!this.content().attachments.length;
        this.renderBookmarkState();
        this.onLayout();
    }
    async preview(metadata, element, generation) {
        this.previewLoads++;
        try {
            const record = await this.store.get(metadata.storageKey);
            if (generation !== this.generation || !this.visible) return;
            if (!record || record.entryId !== metadata.entryId) { element.textContent = "File unavailable in this browser storage."; return; }
            if (metadata.mimeType.startsWith("image/") && record.thumbnail) {
                const image = document.createElement("img"), url = URL.createObjectURL(record.thumbnail);
                this.urls.add(url); image.src = url; image.alt = `Preview of ${metadata.filename}`; image.loading = "lazy";
                element.querySelector("button").replaceChildren(image);
                image.onload = () => this.onLayout();
            } else if (metadata.mimeType.startsWith("text/")) {
                const text = await record.blob.slice(0,galaxyModel.contentLimits.textPreviewBytes).text();
                if (generation !== this.generation) return;
                const pre = document.createElement("pre"); pre.textContent = text; pre.className = "content-text-preview";
                element.parentElement.append(pre);
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
