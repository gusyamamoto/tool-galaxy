// Disposable task metadata, rebuilt on mutations, never in the animation loop.
const cosmosTasks = {
    lists(entries, states = this.index(entries)) {
        const lists = new Map();
        entries.forEach(entry => { if (entry.taskList === true) lists.set(entry.id, {entry, tasks:[], state:states.get(entry.id)}); });
        entries.forEach(entry => { lists.get(entry.parentId)?.tasks.push(entry); });
        return [...lists.values()];
    },
    index(entries) {
        const states = new Map();
        entries.forEach(entry => {
            const list = entry.taskList === true;
            const task = !list && entries.get(entry.parentId)?.taskList === true;
            const done = task && entry.completed === true ? 1 : 0;
            states.set(entry.id, {list, task, enabled:list || task,
                total:task ? 1 : 0, done, ratio:done, complete:done === 1});
        });
        entries.forEach(entry => {
            const parent = states.get(entry.parentId);
            if (parent?.list) {
                parent.total++;
                if (entry.completed === true && entry.taskList !== true) parent.done++;
            }
        });
        states.forEach(state => {
            if (!state.list) return;
            state.ratio = state.total ? state.done / state.total : 0;
            state.complete = state.total > 0 && state.done === state.total;
        });
        return states;
    },
    change(entries, id, field, value) {
        const entry = entries.get(id);
        if (!entry || typeof value !== 'boolean') throw new Error('This item is no longer available.');
        if (field !== 'completed' || entry.taskList === true || entries.get(entry.parentId)?.taskList !== true)
            throw new Error('Only direct tasks can be checked Done.');
        return {...entry, completed:value};
    },
    // Build the whole checklist before publishing or saving any of it.
    create(entries, parent, names, newId) {
        const list = {...parent, taskList:true};
        const staged = new Map(entries), result = [list];
        const error = galaxyModel.validateChange(list, staged);
        if (error) throw new Error(error);
        staged.set(list.id, list);
        for (const value of names) {
            const name = value.trim();
            if (!name) continue;
            const task = {id:newId(), name, parentId:list.id, description:'', category:'', completed:false,
                x:list.x, y:list.y, createdAt:list.createdAt, updatedAt:list.updatedAt};
            if (staged.has(task.id)) throw new Error('Could not allocate independent item IDs.');
            const error = galaxyModel.validateChange(task, staged);
            if (error) throw new Error(error);
            staged.set(task.id, task); result.push(task);
        }
        return result;
    },
    dormant(role) {
        if (role === 'satellite') return `<svg class="task-dormant-art" aria-hidden="true" viewBox="0 0 24 24"><path d="M7 2L16 3 22 9 20 17 14 22 5 19 2 12 3 6Z" fill="#5d6069" stroke="#93969c" stroke-width=".65"/><path d="M7 2L9 9 3 12 5 19 12 16 20 17 15 10 16 3" fill="#414651"/><path d="M9 9L15 10 12 16Z" fill="#76767a"/><ellipse cx="7" cy="14" rx="2" ry="1.6" fill="#2b303b"/><circle cx="16" cy="7" r="1.3" fill="#303440"/></svg>`;
        if (role === 'astronaut') return `<svg class="task-dormant-art" aria-hidden="true" viewBox="0 0 24 24"><g stroke-linecap="round" stroke-linejoin="round"><path d="M9 15L6 20M15 15L17 21M8 12L4 15M16 12L20 14" fill="none" stroke="#8eaa9f" stroke-width="2"/><path d="M8 10Q12 8 16 10L16 16 12 18 8 16Z" fill="#596d73"/><path d="M6 5Q6 1 12 1T18 5Q18 10 12 12 6 10 6 5Z" fill="#9bb5a6"/><path d="M8 5Q11 5 11 8 8 8 8 5M16 5Q13 5 13 8 16 8 16 5" fill="#172b32"/><path d="M11 10H13" stroke="#526d67" stroke-width=".6"/></g></svg>`;
        return '<span class="task-dormant-surface" aria-hidden="true"></span>';
    },
    decorate(entry, node, state) {
        if (!node) return;
        if (!state?.enabled) {
            if (node.dataset.taskState) {
                delete node.dataset.taskState; delete node.dataset.taskComplete;
                node.querySelector('.task-visuals')?.remove();
                node.style.removeProperty('--task-ratio');
            }
            return;
        }
        node.dataset.taskState = state.task ? 'task' : 'progress';
        node.dataset.taskComplete = String(state.complete);
        node.style.setProperty('--task-ratio', state.ratio);
        let visuals = node.querySelector('.task-visuals');
        if (!visuals || visuals.dataset.role !== entry.role) {
            visuals?.remove(); visuals = document.createElement('span');
            visuals.className = 'task-visuals'; visuals.dataset.role = entry.role;
            visuals.setAttribute('aria-hidden', 'true');
            visuals.innerHTML = this.dormant(entry.role) + '<svg class="task-progress-ring" viewBox="0 0 40 40"><circle class="task-ring-track" cx="20" cy="20" r="18"/><circle class="task-ring-value" cx="20" cy="20" r="18" pathLength="1" transform="rotate(-90 20 20)"/></svg><span class="task-completion-wave"></span>';
            node.prepend(visuals);
        }
        visuals.querySelector('.task-progress-ring').style.display = state.task ? 'none' : '';
    }
};
