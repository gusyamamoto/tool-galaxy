"""Desktop discovery controls reuse child creation; mobile pixels stay unchanged."""
import base64
import json
import time


def run_desktop_add_checks(*,cdp,e,check,wait_for,add,shot,baseline_dir=None,capture_baseline=False):
    q=json.dumps
    root=add('Add review')
    owner=add('Selected body',root)
    other=add('Other body',root)
    e('physics.pause();motion.setReducedMotion(true);camera.setReducedMotion(true);ambient.setReducedMotion(true);autoFitPending=false;camera.stopAnimation()')

    def select(id,open=True):
        e(f'selectEntry(entries.get({q(id)}),nodes.get({q(id)}),{{openInspector:{str(open).lower()},reframe:false}});physics.pause()')

    def click(selector):
        e(f'document.querySelector({q(selector)}).click();applicationCommandTail')

    def labels():
        return e("[...contextMenu.querySelectorAll(':scope>button:not([hidden])')].map(b=>b.textContent)")

    def capture(name):
        cdp.call('Input.dispatchMouseEvent',type='mouseMoved',x=180,y=60)
        e('document.activeElement?.blur();new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        time.sleep(.25)
        shot(name)
        if baseline_dir:
            path=baseline_dir/(name+'.png')
            data=base64.b64decode(cdp.call('Page.captureScreenshot',format='png')['data'])
            if capture_baseline:
                baseline_dir.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
            else:
                check(data==path.read_bytes(),'mobile screenshot byte-identical to pre-change baseline: '+name)

    for width,height in [(360,800),(390,844),(430,932)]:
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=True)
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=5)
        wait_for('hierarchySidebar.narrow')
        e('closeContextMenu();closeContentMenus();closeInspector();hierarchySidebar.setCollapsed(true)')
        select(owner,False)
        # Keep identity/Contents real, with all bodies naturally culled outside the canvas.
        e('entries.forEach((entry,id)=>{const p=physics.particles.get(id);entry.x=p.x=-20000;entry.y=p.y=-20000});camera.setView({x:0,y:0,scale:1},false);renderGraph();physics.pause()')
        capture(f'mobile-add-compact-{width}')
        click('#mobile-body-add')
        check(e("[...addMenu.querySelectorAll('button:not([hidden])')].map(b=>b.textContent).join('|')==='Take Photo|Photo Gallery|Add item|Add task list'"),'mobile + retains original actions/order: '+str(width))
        capture(f'mobile-add-menu-{width}')
        e('closeContentMenus();openMobileContents()')
        wait_for("mobileContents.state==='browse'")
        capture(f'mobile-add-contents-{width}')
        if not capture_baseline:
            click('#entry-more-button')
            check(labels()==['Rename','Move to…','Add to Constellation','Copy','Duplicate structure','Delete item'],'mobile management order unchanged with Task List creation outside management: '+str(width))
            check(e("contextMenu.querySelector('[data-action=add-child]').hidden"),'desktop Add item absent from mobile management: '+str(width))
            e('closeContextMenu()')
        e('closeInspector()')
    if capture_baseline:
        return

    cdp.call('Emulation.setTouchEmulationEnabled',enabled=False,maxTouchPoints=1)
    cdp.call('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
    wait_for('!hierarchySidebar.narrow')
    select(owner)
    e(f"const ownerEntry=entries.get({q(owner)}),ownerParticle=physics.particles.get({q(owner)});ownerEntry.x=ownerParticle.x=500;ownerEntry.y=ownerParticle.y=200;camera.setView({{x:0,y:0,scale:1}},false);renderGraph()")
    point=e(f"(()=>{{const r=nodes.get({q(owner)}).getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}}}})()")
    cdp.call('Input.dispatchMouseEvent',type='mousePressed',button='right',clickCount=1,**point)
    cdp.call('Input.dispatchMouseEvent',type='mouseReleased',button='right',clickCount=1,**point)
    expected=['Add item','Add task list','Rename','Move to…','Add to Constellation','Copy','Duplicate structure','Delete item']
    check(labels()==expected,'desktop context menu starts with Add item and preserves management order')
    click('#entry-context-menu [data-action=add-child]')
    check(e(f'dialog.open&&editingId===null&&contextualParentId==={q(owner)}&&parentField.value==={q(owner)}'), 'desktop context Add uses existing contextual child form')
    check(e("document.getElementById('entry-info-fields').hidden&&document.getElementById('parent-field').hidden"),'desktop Add retains existing Name-only creation UI')
    e("fields[0].value='';form.requestSubmit()")
    check(e('dialog.open&&!fields[0].validity.valid'),'desktop Add retains existing required-name validation')
    e("fields[0].value='Context child';form.requestSubmit();applicationCommandTail")
    wait_for('!dialog.open&&!formSaveBusy')
    context_child=e('selectedNode.dataset.entryId')
    check(e(f'entries.get({q(context_child)}).parentId==={q(owner)}&&entries.get({q(context_child)}).depth===entries.get({q(owner)}).depth+1'),'context child has correct parent and hierarchy level')
    check(e(f"JSON.parse(localStorage.getItem('galaxy:user-data')).entries.some(x=>x.id==={q(context_child)}&&x.parentId==={q(owner)})"),'context child persists through existing repository')

    select(owner)
    check(e("(()=>{const a=document.getElementById('entry-add-button').getBoundingClientRect(),b=moreButton.getBoundingClientRect();return a.width===28&&a.height===28&&a.right<b.left&&Math.abs(a.top-b.top)<1})()"),'desktop Contents shows aligned 28px + beside management …')
    check(e("document.getElementById('entry-add-button').getAttribute('aria-haspopup')==='menu'&&document.getElementById('entry-add-button').getAttribute('aria-controls')==='add-menu'"),'desktop header + exposes creation menu semantics')
    shot('desktop-contents-add-control')
    e("window.reviewTitle=panelName.textContent;panelName.textContent='A long selected item title that wraps at narrow desktop panel widths'")
    for panel_width in [220,260,288]:
        e(f"panel.style.width='{panel_width}px'")
        check(e("(()=>{const a=document.getElementById('entry-add-button').getBoundingClientRect(),b=moreButton.getBoundingClientRect(),n=panelName.getBoundingClientRect(),p=panel.getBoundingClientRect();return Math.abs(a.top-b.top)<1&&a.right<b.left&&n.right<=a.left&&b.right<=p.right&&a.width===28&&b.width===28})()"),'desktop title action group stays aligned at '+str(panel_width)+'px')
    e("panel.style.removeProperty('width');panelName.textContent=reviewTitle")

    click('#entry-add-button')
    click('#add-child-button')
    check(e(f'dialog.open&&contextualParentId==={q(owner)}&&addMenu.hidden'),'desktop header Add item opens existing child form directly')
    e("fields[0].value='Header child';form.requestSubmit();applicationCommandTail")
    wait_for('!dialog.open&&!formSaveBusy')
    header_child=e('selectedNode.dataset.entryId')
    check(e(f'entries.get({q(header_child)}).parentId==={q(owner)}'),'header child belongs to selected CB')
    select(owner)
    click('#entry-more-button')
    check(labels()==expected,'desktop … still opens the same management menu')
    shot('desktop-management-add-item')
    check(not cdp.errors,'no desktop Add browser exceptions')
