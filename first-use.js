// Static Introduction and existing show-once contextual onboarding.
class FirstUseOnboarding {
    constructor({root,hint,preferences,create,help,obscured,coachTarget}){
        Object.assign(this,{root,hint,preferences,obscured,coachTarget});this.timer=null;this.coachFrame=null;
        this.state=preferences.load().firstUseHints||{};
        root.querySelector('#first-use-create').addEventListener('click',create);
        this.helpButton=root.querySelector('#first-use-help');this.helpButton.addEventListener('click',help);
        hint.querySelector('button').addEventListener('click',()=>this.hideHint(true));
        document.getElementById('help-dialog').addEventListener('close',()=>{
            if(!root.hidden)this.helpButton.focus({preventScroll:true});
        });
    }
    sync({empty,available,entries}){
        const show=empty&&available;
        if(show)this.setArtworkActive(true);
        this.root.hidden=!show;
        if(!show)this.setArtworkActive(false);
        document.getElementById('galaxy').classList.toggle('first-use-visible',show);
        if(empty||!available||(this.state.rootId&&!entries.has(this.state.rootId)))this.hideHint();
    }
    setArtworkActive(active){
        // Unknown/returning/recovery states never expose image URLs. Activate
        // picture sources before fallback imgs; disarm imgs first when hiding.
        for(const attribute of active?['srcset','src']:['src','srcset']){
            const from=active?`data-${attribute}`:attribute,to=active?attribute:`data-${attribute}`;
            const selector=attribute==='src'?`img[${from}]`:`source[${from}],img[${from}]`;
            for(const node of this.root.querySelectorAll(selector)){
                node.setAttribute(to,node.getAttribute(from));node.removeAttribute(from);
            }
        }
    }
    save(state){this.state=state;this.preferences.update({firstUseHints:state}).catch(()=>{});}
    created({wasEmpty,rootId,created}){
        if(this.state.phase==='done')return;
        if(wasEmpty){
            const alreadyIntroduced=this.state.phase==='child';
            this.save({phase:'child',rootId});
            if(created.some(item=>item.parentId===rootId)){this.finish();return;}
            if(!alreadyIntroduced)this.showHint('Tap + to add something inside this Item.');
        }else if(this.state.phase==='child'&&created.some(item=>item.parentId===this.state.rootId))this.finish();
    }
    finish(){
        this.save({phase:'done'});
        this.showHint("That's a branch. Keep building it, or open Contents to add files, notes, links or a location.");
    }
    showHint(text){
        this.hideHint();this.hint.querySelector('p').textContent=text;this.hint.hidden=false;
        this.hint.querySelector('strong').textContent=this.state.phase==='child'?'Add your first item here':'Keep building your branch';
        if(this.coachTarget)this.positionHint();
        this.timer=setTimeout(()=>this.hideHint(),16000);
    }
    positionHint(){
        const target=this.coachTarget(),button=target?.button,rect=button?.getBoundingClientRect();
        const blocked=this.obscured?.()||document.querySelector('dialog[open],#add-menu:not([hidden]),#entry-context-menu:not([hidden]),#entry-panel .inline-editor:not([hidden])');
        const viewport=window.visualViewport,top=viewport?.offsetTop||0,left=viewport?.offsetLeft||0;
        const right=left+(viewport?.width||innerWidth),bottom=top+(viewport?.height||innerHeight);
        const visible=rect&&rect.width&&rect.top>=top&&rect.bottom<=bottom&&rect.left>=left&&rect.right<=right&&!blocked;
        if(this.coachAnchor!==button||!visible){this.coachAnchor?.classList.remove('first-use-add-target');this.coachAnchor=null;}
        if(visible){this.coachAnchor=button;button.classList.add('first-use-add-target');}
        this.hint.style.visibility=visible?'visible':'hidden';
        if(visible){
            if(this.state.phase==='child')this.hint.querySelector('p').textContent=`Tap + to add something inside ${target.name||'this Item'}.`;
            this.hint.dataset.anchor=button.id||'sidebar-add';
            const width=Math.min(284,right-left-24);this.hint.style.width=`${width}px`;
            const height=this.hint.offsetHeight,x=Math.max(left+12,Math.min(right-width-12,rect.right-width));
            const above=rect.top-height-14>=top+12;
            const edge=target.edge??rect.left;
            const side=target.side==='left'&&edge-width-14>=left+12?'left':target.side==='right'&&edge+width+14<=right-12?'right':above?'above':'below';
            this.hint.dataset.side=side;
            this.hint.style.left=`${side==='left'?edge-width-14:side==='right'?edge+14:x}px`;
            this.hint.style.top=`${['left','right'].includes(side)?Math.max(top+12,Math.min(bottom-height-12,rect.top)):above?rect.top-height-14:rect.bottom+14}px`;
            this.hint.style.setProperty('--coach-arrow',`${Math.max(14,Math.min(width-14,rect.left+rect.width/2-x))}px`);
        }
        this.coachFrame=requestAnimationFrame(()=>this.positionHint());
    }
    hideHint(restoreFocus=false){
        if(restoreFocus&&this.hint.contains(document.activeElement))this.coachTarget?.()?.button?.focus({preventScroll:true});
        this.coachAnchor?.classList.remove('first-use-add-target');this.coachAnchor=null;
        if(this.coachFrame!==null)cancelAnimationFrame(this.coachFrame);this.coachFrame=null;
        this.hint.hidden=true;if(this.timer!==null)clearTimeout(this.timer);this.timer=null;
    }
}
