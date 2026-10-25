// Local, presentation-only help. Native dialog/details provide keyboard behavior.
(() => {
    const trigger = document.getElementById('help-button');
    const dialog = document.getElementById('help-dialog');
    trigger.addEventListener('click', () => {
        if (dialog.open) return;
        dialog.querySelectorAll('details').forEach(topic => {topic.open = false;});
        dialog.showModal();
        dialog.scrollTop = 0;
        dialog.querySelector('.help-topics').scrollTop = 0;
    });
    document.getElementById('close-help-button').addEventListener('click', () => dialog.close());
    // Keep Escape and navigation keys inside Help, without dismissing content
    // or an active Constellation behind it. Native cancel remains supported too.
    dialog.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); dialog.close(); return; }
        if (event.key !== 'Tab') return;
        const controls = [...dialog.querySelectorAll('button, summary, a[href], [tabindex="0"]')]
            .filter(control => !control.disabled && control.getClientRects().length);
        const target = event.shiftKey && document.activeElement === controls[0] ? controls.at(-1)
            : !event.shiftKey && document.activeElement === controls.at(-1) ? controls[0] : null;
        if (target) { event.preventDefault(); target.focus(); }
    });
    dialog.addEventListener('close', () => {
        const more=document.getElementById('utility-more');
        const target = trigger.getClientRects().length ? trigger : more?.getClientRects().length?more:document.getElementById('sidebar-toggle');
        target.focus({preventScroll: true});
    });
    dialog.querySelectorAll('details').forEach(topic => {
        const summary = topic.querySelector('summary');
        const sync = () => summary.setAttribute('aria-expanded', String(topic.open));
        sync();
        topic.addEventListener('toggle', sync);
    });
})();

// Reuse the existing utility buttons and their live account/backup state.
document.addEventListener('DOMContentLoaded',() => {
    const more=document.getElementById('utility-more'),menu=document.getElementById('utility-menu');
    const items=[...menu.querySelectorAll('button')];
    items.forEach(item=>item.setAttribute('role','menuitem'));
    const close=(restore=false)=>{menu.hidden=true;more.setAttribute('aria-expanded','false');if(restore)more.focus({preventScroll:true});};
    const position=()=>{
        if(menu.hidden)return;
        const r=more.getBoundingClientRect(),v=cosmosVisibleViewport();
        if(!r.width||r.bottom<=v.top||r.top>=v.top+v.height){close();return;}
        const room=Math.max(r.top-v.top-14,v.top+v.height-r.bottom-14);
        positionCosmosMenu(menu,r.left,r.bottom+6,{above:r.top-6,maxHeight:Math.max(0,room)});
    };
    const open=(last=false)=>{
        if(typeof closeContentMenus==='function')closeContentMenus();
        if(typeof closeContextMenu==='function')closeContextMenu();
        menu.hidden=false;more.setAttribute('aria-expanded','true');position();
        const enabled=items.filter(item=>!item.disabled);(last?enabled.at(-1):enabled[0])?.focus({preventScroll:true});
    };
    more.addEventListener('click',()=>{
        const opening=menu.hidden;close();
        if(opening)open();
    });
    more.addEventListener('keydown',event=>{
        if(!['ArrowDown','ArrowUp'].includes(event.key))return;
        event.preventDefault();event.stopPropagation();open(event.key==='ArrowUp');
    });
    menu.addEventListener('click',event=>{if(event.target.closest('button'))close();});
    document.addEventListener('pointerdown',event=>{if(!event.target.closest('#utility-menu,#utility-more'))close();});
    document.addEventListener('scroll',event=>{if(!menu.contains(event.target))position();},true);
    window.addEventListener('resize',position);
    window.visualViewport?.addEventListener('resize',position);
    window.visualViewport?.addEventListener('scroll',position);
    window.addEventListener('pagehide',()=>close());
    document.addEventListener('keydown',event=>{
        if(menu.hidden)return;
        if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close(true);}
        else if(event.key==='Tab')close();
        else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
            event.preventDefault();event.stopImmediatePropagation();
            const enabled=items.filter(item=>!item.disabled),index=enabled.indexOf(document.activeElement);
            const next=event.key==='Home'?0:event.key==='End'?enabled.length-1:(index+(event.key==='ArrowUp'?-1:1)+enabled.length)%enabled.length;
            enabled[next]?.focus();
        }
    },true);
});
