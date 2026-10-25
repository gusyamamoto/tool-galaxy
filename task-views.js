// IDs only: dismissal belongs to navigation preferences, never the Universe model.
class CompletedTaskDismissals {
    constructor(preferences) {
        this.preferences=preferences;
        const saved=preferences.load().hiddenCompletedTaskListIds;
        this.ids=new Set(Array.isArray(saved)?saved.filter(id=>typeof id==='string'&&id.length>0):[]);
    }
    save() {
        this.preferences.update({hiddenCompletedTaskListIds:[...this.ids]}).catch(error=>{this.preferenceError=error;});
    }
    dismiss(id,state) {
        if(!state?.list||!state.complete||this.ids.has(id))return false;
        this.ids.add(id);this.save();return true;
    }
    reconcile(lists) {
        let changed=false;
        for(const {entry,state} of lists)if(!state.complete&&this.ids.delete(entry.id))changed=true;
        if(changed)this.save();
    }
}

// A secondary view of canonical Task Lists, with its own disposable disclosures.
class TasksSecondaryView {
    constructor({preferences, navigate, complete, blocked, onLayout, onMenu}) {
        Object.assign(this, {navigate, complete, blocked, onLayout, onMenu});
        this.dismissals=new CompletedTaskDismissals(preferences);
        this.root=document.getElementById('tasks-section');this.view=document.getElementById('tasks-view');
        this.active=document.getElementById('tasks-active');this.completed=document.getElementById('tasks-completed');
        this.empty=document.getElementById('tasks-empty');this.activeGroup=document.getElementById('tasks-active-group');
        this.completedGroup=document.getElementById('tasks-completed-group');this.completedToggle=document.getElementById('tasks-completed-toggle');
        this.section=new NavigationSection({root:this.root,toggle:document.getElementById('tasks-toggle'),list:this.view,name:'Tasks',key:'tasksCollapsed',preferences});
        this.section.onDisclosure=onLayout;
        this.activeToggle=document.getElementById('tasks-active-toggle');
        this.activeSection=new NavigationSection({root:document.getElementById('tasks-active-group'),toggle:this.activeToggle,list:this.active,name:'active Task Lists',key:'tasksActiveCollapsed',preferences});
        this.completedSection=new NavigationSection({root:this.completedGroup,toggle:this.completedToggle,list:this.completed,name:'completed Task Lists',key:'tasksCompletedCollapsed',preferences,collapsed:true});
        this.activeSection.onDisclosure=this.completedSection.onDisclosure=onLayout;
        this.expanded=new Set();this.rows=new Map();this.taskRows=new Map();
    }
    button(className, action) {
        const button=document.createElement('button');button.type='button';button.className=className;
        button.addEventListener('click',action);return button;
    }
    createList(id) {
        const item=document.createElement('li'),head=document.createElement('div'),tasks=document.createElement('ul');
        item.dataset.taskListId=id;head.className='tasks-list-row';tasks.className='tasks-children';tasks.id=`task-view-${id}`;
        const expand=this.button('tasks-list-disclosure',()=>{
            if(this.expanded.has(id))this.expanded.delete(id);else this.expanded.add(id);
            tasks.hidden=!this.expanded.has(id);expand.setAttribute('aria-expanded',String(!tasks.hidden));this.onLayout();
        });
        expand.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>';expand.setAttribute('aria-controls',tasks.id);
        const name=this.button('tasks-list-name',()=>this.navigate(id)),summary=document.createElement('span');
        const icon=document.createElement('span');icon.className='tree-role-icon';icon.ariaHidden='true';
        const more=this.button('tasks-list-more',()=>this.onMenu(id,more));
        more.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="4.5" cy="10" r="1.2"/><circle cx="10" cy="10" r="1.2"/><circle cx="15.5" cy="10" r="1.2"/></svg>';
        more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-controls','entry-context-menu');more.setAttribute('aria-expanded','false');
        summary.className='tasks-summary';summary.setAttribute('aria-live','polite');head.append(expand,icon,name,summary,more);item.append(head,tasks);
        return {item,head,tasks,expand,name,summary,more};
    }
    createTask(id) {
        const item=document.createElement('li');item.className='tasks-task-row';item.dataset.taskId=id;
        const check=this.button('task-view-check tree-task-toggle',()=>{
            const entry=this.entries.get(id);
            if(entry&&!this.blocked())Promise.resolve(this.complete(id,entry.completed!==true)).catch(()=>{});
        });
        check.setAttribute('role','checkbox');
        check.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2"/><path class="tree-task-check" d="m4.5 8 2.3 2.5 4.7-5"/></svg>';
        const name=this.button('tasks-task-name',()=>this.navigate(id)),icon=document.createElement('span');
        icon.className='tree-role-icon';icon.ariaHidden='true';item.append(check,icon,name);return {item,check,name};
    }
    render(entries, states, selectedId) {
        this.entries=entries;this.states=states;this.selectedId=selectedId;
        const lists=cosmosTasks.lists(entries,states),liveLists=new Set(),liveTasks=new Set();
        this.dismissals.reconcile(lists);
        const focus=document.activeElement,scroll=document.getElementById('sidebar-secondary-views').scrollTop;
        const wasHidden=this.root.hidden,wasEmptyHidden=this.empty.hidden;this.root.hidden=false;
        this.empty.hidden=lists.length>0;this.activeGroup.hidden=this.completedGroup.hidden=!lists.length;
        const active=document.createDocumentFragment(),completed=document.createDocumentFragment();
        for(const {entry,tasks,state} of lists) {
            if(state.complete&&this.dismissals.ids.has(entry.id))continue;
            liveLists.add(entry.id);
            const row=this.rows.get(entry.id)||this.createList(entry.id);this.rows.set(entry.id,row);
            row.head.dataset.role=entry.role;row.name.textContent=entry.name;row.name.title=[...galaxyModel.ancestors(entries,entry.id)].reverse().map(parent=>parent.name).concat(entry.name).join(' / ');
            row.name.setAttribute('aria-current',String(selectedId===entry.id));
            row.summary.textContent=state.total?`${state.done}/${state.total}`:'0 tasks';
            row.more.hidden=!state.complete;row.more.ariaLabel=row.more.title=`More actions for ${entry.name}`;
            row.expand.ariaLabel=`Expand or collapse ${entry.name}`;row.expand.setAttribute('aria-expanded',String(this.expanded.has(entry.id)));
            row.tasks.hidden=!this.expanded.has(entry.id);
            const children=document.createDocumentFragment();
            for(const task of tasks) {
                liveTasks.add(task.id);const child=this.taskRows.get(task.id)||this.createTask(task.id);this.taskRows.set(task.id,child);
                child.item.dataset.role=task.role;child.name.textContent=task.name;child.name.title=task.name;child.name.setAttribute('aria-current',String(selectedId===task.id));
                child.check.setAttribute('aria-checked',String(task.completed===true));child.check.setAttribute('aria-disabled',String(this.blocked()));
                child.check.ariaLabel=`Mark ${task.name} as ${task.completed===true?'incomplete':'done'}`;children.append(child.item);
            }
            row.tasks.replaceChildren(children);
            (state.complete?completed:active).append(row.item);
        }
        this.active.replaceChildren(active);this.completed.replaceChildren(completed);
        this.activeSection.apply();this.completedSection.apply();
        for(const id of this.rows.keys())if(!liveLists.has(id)){this.rows.delete(id);this.expanded.delete(id);}
        for(const id of this.taskRows.keys())if(!liveTasks.has(id))this.taskRows.delete(id);
        if(focus?.isConnected&&this.view.contains(focus)&&!focus.closest('[hidden]'))focus.focus({preventScroll:true});
        else if(this.view.contains(focus)&&focus.closest('[hidden]'))
            (this.completed.contains(focus)?this.completedToggle:this.activeToggle).focus({preventScroll:true});
        document.getElementById('sidebar-secondary-views').scrollTop=scroll;
        if(wasHidden||wasEmptyHidden!==this.empty.hidden)this.onLayout();
    }
    hideCompleted(id) {
        if(!this.dismissals.dismiss(id,this.states.get(id)))return false;
        this.render(this.entries,this.states,this.selectedId);
        this.completedToggle.focus({preventScroll:true});this.onLayout();return true;
    }
}
if(typeof module!=='undefined')module.exports={CompletedTaskDismissals};
