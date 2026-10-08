// Everyday shortcuts reference the existing canonical hierarchy and plain text.
const cosmosEveryday = {
    starters: [
        {id:'blank',label:'Blank',name:'',children:[]},
        {id:'trip',label:'✈ Trip',name:'Trip',children:['Places','Accommodation','Transportation','Food','Packing','Documents']},
        {id:'home',label:'🏠 Home project',name:'Home Project',children:['Ideas','Tasks','Materials','Budget','Photos']},
        {id:'class',label:'🎓 Class / course',name:'Class',children:['Notes','Assignments','Resources','Exams']},
        {id:'recipes',label:'🍝 Recipes',name:'Recipes',children:['Favorites','To Try','Weeknight','Baking']},
        {id:'photos',label:'📷 Photos / inspiration',name:'Photos',children:['Favorites','Ideas','Collections']}
    ],
    checklistLine(line) {
        const match=/^(\s*-\s+\[)([ xX])(\]\s+)([\s\S]*)$/.exec(line);
        return match ? {checked:match[2].toLowerCase()==='x',label:match[4],prefix:match[1],suffix:match[3]} : null;
    },
    toggleChecklist(text,index,checked) {
        const lines=text.split('\n'),line=this.checklistLine(lines[index]||'');
        if(!line)return text;
        lines[index]=line.prefix+(checked?'x':' ')+line.suffix+line.label;
        return lines.join('\n');
    },
    droppedAddress(transfer) {
        const uri=transfer.getData('text/uri-list').split(/\r?\n/).find(line=>line.trim()&&!line.startsWith('#'));
        return uri || transfer.getData('text/x-moz-url').split(/\r?\n/)[0] || transfer.getData('text/plain');
    }
};

// One delegated external-drop route for bodies and canonical sidebar rows.
class CosmosContentDrops {
    constructor({host,getEntry,blocked,onDrop,backgroundTarget=()=>null,tree=null,expandRow=()=>false,hoverDelay=600}) {
        Object.assign(this,{host,getEntry,blocked,onDrop,backgroundTarget,tree,expandRow,hoverDelay});
        this.target=null;this.hoverTimer=null;this.internalDrag=false;this.pointer=null;this.lastEdgeScroll=0;
        // External drags have no dragstart in this document, including OS files
        // and links from other tabs. All local UI sources stay out of this path.
        document.addEventListener('dragstart',()=>{this.internalDrag=true;this.clear();});
        host.addEventListener('dragover',event=>{
            if(!this.external(event)||this.blocked()){this.clear();return;}
            this.pointer={x:event.clientX,y:event.clientY};
            const target=this.find(event);
            this.setTarget(target);
            if(target){event.preventDefault();event.dataTransfer.dropEffect='copy';}
            this.edgeScroll(event);
        });
        host.addEventListener('dragleave',event=>{if(this.target&&!this.target.contains(event.relatedTarget))this.clear();});
        host.addEventListener('drop',event=>{
            const target=this.find(event);this.clear();
            if(!target)return;
            event.preventDefault();event.stopPropagation();this.onDrop(target.dataset.entryId,event.dataTransfer);
        });
        // Never let an unsupported/cancelled external file navigate away from the app.
        document.addEventListener('dragover',event=>{if(this.external(event)){event.preventDefault();if(!host.contains(event.target))this.clear();}});
        document.addEventListener('drop',event=>{if(this.external(event))event.preventDefault();this.finish();});
        document.addEventListener('dragend',()=>this.finish());
        document.addEventListener('keydown',event=>{if(event.key==='Escape'){
            const dragging=!!this.pointer||this.internalDrag;this.finish();
            if(dragging){event.preventDefault();event.stopImmediatePropagation();}
        }});
        window.addEventListener('blur',()=>this.finish());
        window.addEventListener('pagehide',()=>this.finish());
        document.addEventListener('visibilitychange',()=>{if(document.hidden)this.finish();});
        tree?.addEventListener('scroll',()=>this.retargetTree(),{passive:true});
    }
    external(event){return !this.internalDrag&&[...(event.dataTransfer?.types||[])].some(type=>['Files','text/uri-list','text/plain','text/x-moz-url'].includes(type));}
    find(event){
        if(!this.external(event)||this.blocked())return null;
        const target=event.target.closest?.('.entry-node[data-entry-id],.hierarchy-row[data-entry-id]');
        return target&&this.getEntry(target.dataset.entryId)?target:this.backgroundTarget(event);
    }
    setTarget(target){
        if(this.target===target)return;
        this.cancelHover();this.target?.classList.remove('content-drop-target');this.target=target;
        target?.classList.add('content-drop-target');
        if(!target?.matches('.hierarchy-row[data-entry-id][aria-expanded="false"]'))return;
        target.classList.add('content-drop-pending');
        this.hoverTimer=setTimeout(()=>{
            this.hoverTimer=null;target.classList.remove('content-drop-pending');
            if(this.target!==target||!target.isConnected||this.blocked()||this.internalDrag)return;
            const under=this.pointer&&document.elementFromPoint(this.pointer.x,this.pointer.y)?.closest('.hierarchy-row[data-entry-id]');
            if(under===target)this.expandRow(target.dataset.entryId);
        },this.hoverDelay);
    }
    cancelHover(){if(this.hoverTimer!==null)clearTimeout(this.hoverTimer);this.hoverTimer=null;this.target?.classList.remove('content-drop-pending');}
    retargetTree(){
        if(!this.pointer||!this.tree||!this.target?.closest('#hierarchy-tree'))return;
        if(this.blocked()||this.internalDrag){this.clear();return;}
        const under=document.elementFromPoint(this.pointer.x,this.pointer.y)?.closest('.hierarchy-row[data-entry-id]');
        this.setTarget(under&&this.tree.contains(under)&&this.getEntry(under.dataset.entryId)?under:null);
    }
    edgeScroll(event){
        if(!this.tree?.contains(event.target)||performance.now()-this.lastEdgeScroll<50)return;
        const r=this.tree.getBoundingClientRect(),{x,y}=this.pointer;
        if(x<r.left||x>r.right||y<r.top||y>r.bottom)return;
        const direction=y<r.top+28?-1:y>r.bottom-28?1:0;
        if(direction){this.lastEdgeScroll=performance.now();this.tree.scrollTop+=direction*12;this.retargetTree();}
    }
    clear(){this.cancelHover();this.target?.classList.remove('content-drop-target');this.target=null;this.pointer=null;this.lastEdgeScroll=0;}
    finish(){this.clear();this.internalDrag=false;}
}
if(typeof module!=='undefined')module.exports={cosmosEveryday};
