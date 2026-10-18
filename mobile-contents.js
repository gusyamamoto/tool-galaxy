// Presentation and gesture ownership for the existing inspector, never content storage.
class MobileContentsSheet {
    static pages = ['files', 'notes', 'links', 'location'];
    static nextState(state, direction) {
        const states=['compact','browse'], index=states.indexOf(state);
        return states[Math.max(0,Math.min(1,index+direction))];
    }
    static direction(dx,dy) {
        if(Math.hypot(dx,dy)<10)return null;
        if(Math.abs(dx)>Math.abs(dy)*1.5)return 'horizontal';
        if(Math.abs(dy)>Math.abs(dx)*1.5)return 'vertical';
        return 'ambiguous';
    }
    // Screen rectangles become local canvas coordinates once per UI layout.
    // Keep the raw available rectangle separate from the existing body inset.
    static canvasBounds({viewport,visible,sidebar=null,sheet=null,compact=null,sideSheet=false,insets={}}) {
        const left=Math.max(0,visible.left-viewport.left+(insets.left||0),sidebar?sidebar.right-viewport.left:0);
        const top=Math.max(0,visible.top-viewport.top+(insets.top||0));
        const right=Math.max(left,Math.min(viewport.width,visible.left+visible.width-viewport.left-(insets.right||0),
            sheet&&sideSheet?sheet.left-viewport.left:Infinity));
        const bottom=Math.max(top,Math.min(viewport.height,visible.top+visible.height-viewport.top-(insets.bottom||0),
            sheet&&!sideSheet?sheet.top-viewport.top:Infinity,compact?compact.top-viewport.top:Infinity));
        return {left,top,right,bottom,width:right-left,height:bottom-top};
    }
    constructor({panel,card,root,onTransition,onPage,onResize=()=>{},getEntryId,enabled}) {
        Object.assign(this,{panel,card,root,onTransition,onPage,onResize,getEntryId,enabled});
        this.state='compact';this.page='files';this.mobile=false;this.open=false;
        this.dock=document.getElementById('contents-dock');
        this.sections=[...root.querySelectorAll(':scope > [data-contents-page]')];
        this.tabs=[...this.dock.querySelectorAll('[role="tab"]')];
        this.fileAdd=document.getElementById('content-browse-add-file');
        this.noteAdd=document.getElementById('content-browse-add-note');
        // Mobile entry points reuse the existing controls and content handlers.
        this.fileAdd.addEventListener('click',()=>document.getElementById('content-add-files').click());
        this.noteAdd.addEventListener('click',()=>document.getElementById('content-notes-empty').click());
        this.tabs.forEach(tab=>{
            tab.addEventListener('click',()=>this.setPage(tab.dataset.page));
            tab.addEventListener('keydown',event=>{
                const index=MobileContentsSheet.pages.indexOf(this.page);
                const next={ArrowLeft:(index+3)%4,ArrowRight:(index+1)%4,Home:0,End:3}[event.key];
                if(next===undefined)return;
                event.preventDefault();this.setPage(MobileContentsSheet.pages[next]);this.tabs[next].focus({preventScroll:true});
            });
        });
        // Intrinsic page/media/form growth changes the exposed canvas too.
        // Observe only the sheet box; refreshing bounds never assigns its size.
        this.resizeObserver=new ResizeObserver(()=>{if(this.mobile&&this.open)this.onResize();});
        this.resizeObserver.observe(panel,{box:'border-box'});
        this.bindGestures();
    }
    sync({mobile,open,available=true}) {
        this.mobile=mobile&&available;this.open=open;this.available=available;
        this.state=this.mobile?(open?'browse':'compact'):'desktop';
        this.render();
    }
    render() {
        const browsing=this.mobile&&this.open&&this.state==='browse';
        const state=this.mobile?this.state:'desktop';
        if(this.panel.dataset.contentsState!==state)this.panel.dataset.contentsState=state;
        if(this.panel.dataset.contentsPage!==this.page)this.panel.dataset.contentsPage=this.page;
        this.dock.hidden=!browsing;
        this.fileAdd.hidden=!browsing;
        this.noteAdd.hidden=!browsing||!document.getElementById('content-notes-form').hidden;
        const down=document.getElementById('close-inspector-button');
        down.hidden=false;
        if(browsing){down.ariaLabel='Collapse contents';down.title=down.ariaLabel;}
        else if(!this.mobile&&this.available){down.ariaLabel='Close contents';down.title=down.ariaLabel;}
        this.renderPagePresentation(browsing);
        this.sections.forEach(section=>{
            const hidden=String(browsing&&section.dataset.contentsPage!==this.page);
            if(section.dataset.pageHidden!==hidden)section.dataset.pageHidden=hidden;
            if(section.inert!==(hidden==='true'))section.inert=hidden==='true';
        });
        this.tabs.forEach(tab=>{
            const selected=tab.dataset.page===this.page;
            if(tab.getAttribute('aria-selected')!==String(selected))tab.setAttribute('aria-selected',String(selected));
            tab.tabIndex=selected?0:-1;
        });
    }
    renderPagePresentation(browsing) {
        // Reorder the existing sections/entry row only at a presentation boundary.
        // Desktop retains its Media-first inspector and bookmark wording/order.
        const media=document.getElementById('content-media-section'),files=document.getElementById('content-files-section');
        const links=document.getElementById('content-links'),add=document.getElementById('content-bookmarks-placeholder');
        const linkEntry=[add,document.getElementById('content-bookmarks-empty'),document.getElementById('content-link-form')];
        if(browsing){
            if(media.nextElementSibling===files)this.root.insertBefore(files,media);
            if(links.previousElementSibling!==linkEntry[2])linkEntry.forEach(element=>links.before(element));
        }else{
            if(files.nextElementSibling===media)this.root.insertBefore(media,files);
            if(links.nextElementSibling!==add){let previous=links;linkEntry.forEach(element=>{previous.after(element);previous=element;});}
        }
        for(const [id,text] of [['bookmarks-heading',browsing?'Links':'Bookmarks'],['content-add-bookmark',browsing?'Add link…':'Paste a link…']]){
            const element=document.getElementById(id);if(element.textContent!==text)element.textContent=text;
        }
        for(const [selector,desktop] of [['#content-notes-form button[type="submit"]','Save note'],['#content-link-form button[type="submit"]','Save bookmark'],['#content-quick-bookmark-save','Save bookmark'],['#content-location-form button[type="submit"]','Save location']]){
            const button=this.root.querySelector(selector),text=browsing?'Save':desktop;
            if(button.textContent!==text)button.textContent=text;
        }
        const url=document.getElementById('content-link-url'),placeholder=browsing?'Paste a link…':'example.com';
        if(url.placeholder!==placeholder)url.placeholder=placeholder;
    }
    setPage(page) {
        if(!MobileContentsSheet.pages.includes(page)||page===this.page)return;
        const focusInside=this.root.contains(document.activeElement);
        this.gesture=null;this.onPage();this.page=page;this.root.scrollTop=0;this.render();
        if(focusInside&&this.mobile&&this.state==='browse')this.tabs.find(tab=>tab.dataset.page===page).focus({preventScroll:true});
    }
    transition(state) {
        if(!['compact','browse'].includes(state)||!this.enabled()||state===this.state)return;
        this.cancelAnimation();this.gesture=null;
        const closing=state==='compact',id=this.getEntryId();
        if(closing&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
            const animation=this.panel.animate([{transform:'translateY(0)',opacity:1},{transform:'translateY(64px)',opacity:0}],{duration:160,easing:'ease-in',fill:'forwards'});
            this.animation=animation;this.closing=true;
            animation.finished.then(()=>{
                if(this.animation!==animation)return;
                if(this.enabled()&&this.getEntryId()===id){this.state=state;this.onTransition(state);}
                this.cancelAnimation();
            }).catch(()=>{});
            return;
        }
        this.state=state;this.onTransition(state);
        if(!closing&&!matchMedia('(prefers-reduced-motion: reduce)').matches)
            this.animation=this.panel.animate([{transform:'translateY(24px)',opacity:.7},{transform:'translateY(0)',opacity:1}],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'});
    }
    cancelAnimation(){this.animation?.cancel();this.animation=null;this.closing=false;}
    cancelPendingClose(){if(this.closing)this.cancelAnimation();}
    atTop(target) {
        for(let node=target;node&&node!==this.panel.parentElement;node=node.parentElement){
            if(node.scrollTop>1)return false;
            if(node===this.panel)break;
        }
        // Browse content has its own scroller, even for gestures on the header.
        return this.panel.scrollTop<=1&&(!this.mobile||this.state!=='browse'||this.root.scrollTop<=1);
    }
    bindGestures() {
        const interactive='button,a,input,textarea,select,summary,video,audio,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="tab"]';
        for(const surface of [this.card,this.panel]){
            surface.addEventListener('touchstart',event=>{
                this.cancelPendingClose();this.gesture=null;
                if(!this.enabled()||event.touches.length!==1)return;
                const target=event.target,fromCard=surface===this.card,control=target.closest(interactive);
                if(control&&!['mobile-body-contents','close-inspector-button'].includes(control.id))return;
                if(fromCard?!this.panel.hidden:this.panel.hidden)return;
                const touch=event.touches[0];
                this.gesture={surface,target,fromCard,handle:!!control,id:touch.identifier,x:touch.clientX,y:touch.clientY,entryId:this.getEntryId(),atTop:this.atTop(target),state:this.state};
            },{passive:true});
            surface.addEventListener('touchmove',event=>{
                const g=this.gesture;if(!g||g.surface!==surface)return;
                const touch=[...event.touches].find(t=>t.identifier===g.id);
                if(!this.enabled()||event.touches.length!==1||!touch||this.getEntryId()!==g.entryId||g.state!==this.state){this.gesture=null;return;}
                const dx=touch.clientX-g.x,dy=touch.clientY-g.y;
                if(!g.direction){
                    const direction=MobileContentsSheet.direction(dx,dy);if(!direction)return;
                    if(direction==='ambiguous'||direction==='horizontal'&&(g.fromCard||g.handle||this.state!=='browse')||direction==='vertical'&&(g.fromCard?dy>=0:dy<=0||!g.atTop)){this.gesture=null;return;}
                    // Horizontally scrollable nested content owns its own swipe.
                    for(let node=g.target;direction==='horizontal'&&node&&node!==this.root;node=node.parentElement)
                        if(node.scrollWidth>node.clientWidth+1&&/auto|scroll/.test(getComputedStyle(node).overflowX)){this.gesture=null;return;}
                    g.direction=direction;
                }
                if(g.direction==='vertical'&&!g.fromCard&&!this.atTop(g.target)){this.gesture=null;return;}
                if(event.cancelable)event.preventDefault();
                g.dx=dx;g.dy=dy;
            },{passive:false});
            surface.addEventListener('touchend',event=>{
                const g=this.gesture;this.gesture=null;
                if(!g||g.surface!==surface||event.touches.length||!g.direction||!this.enabled()||this.getEntryId()!==g.entryId||g.state!==this.state)return;
                const distance=g.direction==='horizontal'?Math.abs(g.dx):Math.abs(g.dy),cross=g.direction==='horizontal'?Math.abs(g.dy):Math.abs(g.dx);
                if(distance<64||distance<cross*1.5)return;
                if(event.cancelable)event.preventDefault();
                if(g.direction==='horizontal'){
                    const index=MobileContentsSheet.pages.indexOf(this.page)+(g.dx<0?1:-1);
                    if(index>=0&&index<4)this.setPage(MobileContentsSheet.pages[index]);
                }else this.transition(MobileContentsSheet.nextState(this.state,g.dy<0?1:-1));
            },{passive:false});
            surface.addEventListener('touchcancel',()=>{this.gesture=null;},{passive:true});
        }
        document.addEventListener('touchstart',event=>{if(event.touches.length>1)this.gesture=null;},{passive:true});
        document.addEventListener('pointerdown',()=>this.cancelPendingClose(),true);
        window.addEventListener('blur',()=>{this.gesture=null;this.cancelAnimation();});
    }
}
