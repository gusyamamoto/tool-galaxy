"""Canonical range paint and native mobile Time close in disposable browser profiles."""
import json


def run_time_mobile_ranges_checks(*, cdp, e, check, wait_for, wait_camera, shot):
    q = json.dumps
    rows = [dict(id='range-universe', name='Range test universe', parentId=None, x=150, y=150),
            dict(id='range-travel', name='Travel', parentId='range-universe', x=250, y=150),
            dict(id='range-education', name='School', parentId='range-universe', x=350, y=150)]

    def item(id, start, end=None, parent='range-travel'):
        rows.append(dict(id=id, name=id.replace('-', ' ').title(), parentId=parent, x=150 + len(rows) * 40, y=250,
                         when=dict(startDate=start, endDate=end, time=None)))

    item('range-single', '2026-10-01')
    item('range-separate-a', '2026-10-02')
    item('range-separate-b', '2026-10-03')
    item('range-two', '2026-10-05', '2026-10-06')
    item('range-four', '2026-10-07', '2026-10-10')
    item('range-long', '2026-10-11', '2026-11-07')
    item('range-wrap', '2026-10-17', '2026-10-20', 'range-education')
    item('range-mixed-single', '2026-10-24', parent='range-education')
    item('range-overlap', '2026-10-26', '2026-10-30', 'range-education')
    item('range-hidden', '2026-10-27', '2026-10-29')
    for index in range(3):
        item(f'range-single-{index}', '2026-10-28', parent='range-education')
    snapshot = dict(version=5, entries=rows, layout=[], portals=[], constellations=[], archives=[])
    origin = e('location.origin')
    e('localStorage.setItem("galaxy:user-data",' + q(q(snapshot)) + ')')
    cdp.call('Page.navigate', url=origin)
    wait_for("typeof timeWorkspace!=='undefined'&&!!timeWorkspace&&cameraViewReady&&entries.has('range-long')")
    e('document.fonts.ready')
    e('physics.pause();camera.stopAnimation();graphNeedsSave=false')
    e('window.rangeCanonicalWhen=JSON.stringify([...entries].map(([id,e])=>[id,e.when]))')
    cdp.call('Emulation.setTouchEmulationEnabled', enabled=True, maxTouchPoints=2)

    def frame():
        e('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')

    def tap(selector):
        p = e('(()=>{const r=document.querySelector(' + q(selector) + ').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
        check(e(f'document.elementFromPoint({p["x"]},{p["y"]})?.closest({q(selector)})===document.querySelector({q(selector)})'), 'native touch target exposed: ' + selector)
        cdp.call('Input.dispatchTouchEvent', type='touchStart', touchPoints=[p])
        cdp.call('Input.dispatchTouchEvent', type='touchEnd', touchPoints=[])
        frame()

    for width, height in [(390, 844), (320, 568), (740, 390)]:
        name = f'{width}x{height}'
        cdp.call('Emulation.setDeviceMetricsOverride', width=width, height=height, deviceScaleFactor=1, mobile=True)
        frame()
        e('setInspectorOpen(false);timeWorkspace.open();timeWorkspace.month="2026-10-01";timeWorkspace.today="2026-10-27";timeWorkspace.selectedDay="2026-10-28";timeWorkspace.render();timeWorkspace.root.scrollTop=0')
        check(e("(()=>{const b=document.getElementById('time-close'),r=b.getBoundingClientRect(),h=b.closest('header').getBoundingClientRect(),t=document.getElementById('time-title').getBoundingClientRect(),nav=hierarchySidebar.toggle.getBoundingClientRect();return b.ariaLabel==='Close Time view'&&r.width===44&&r.height===44&&r.top>=h.top&&r.bottom<=h.bottom&&r.left>t.right&&nav.right<=t.left&&h.height===64})()"), name + ': compact X in existing 64px header, 44px target, distinct from sidebar navigation')
        check(e('timeWorkspace.root.scrollWidth===timeWorkspace.root.clientWidth&&document.documentElement.scrollWidth===innerWidth'), name + ': no horizontal page or Time overflow')
        check(e("[...document.querySelectorAll('.time-week')].every(w=>w.getBoundingClientRect().height===44)&&document.querySelector('.time-month').getBoundingClientRect().height===358"), name + ': unchanged 44px rows and compact 358px five-week Calendar')
        check(e("(()=>{const b=document.querySelector('[data-time-day=\"2026-10-01\"] .time-date-bar'),r=b.getBoundingClientRect(),s=getComputedStyle(b);return r.width===(innerWidth<=350?14:18)&&r.height===2&&s.borderRadius==='2px'&&b.dataset.timeIndicatorId==='range-single'})()"), name + ': single-date When retains its approved short context bar')
        check(e("!document.querySelector('[data-time-day=\"2026-10-05\"] .time-date-bar')&&!document.querySelector('[data-time-day=\"2026-10-06\"] .time-date-bar')"), name + ': range-only dates do not masquerade as repeated single-day bars')
        check(e("document.querySelectorAll('[data-time-indicator-id^=\"range-separate-\"]').length===2&&!document.querySelector('[data-time-range-id^=\"range-separate-\"]')"), name + ': consecutive independent daily entries remain short bars, never an inferred range')
        for id, start, end, columns in [('range-two', '2026-10-05', '2026-10-06', 2), ('range-four', '2026-10-07', '2026-10-10', 4)]:
            condition = """(()=>{const b=document.querySelector('[data-time-range-id="ID"]'),r=b.getBoundingClientRect(),w=b.closest('.time-week'),first=w.querySelector('[data-time-day="START"]').getBoundingClientRect(),last=w.querySelector('[data-time-day="END"]').getBoundingClientRect(),s=getComputedStyle(b);return document.querySelectorAll('[data-time-range-id="ID"]').length===1&&r.height===2&&r.width>first.width*(COLUMNS-1)&&Math.abs(r.left-(first.left+first.width/2-(innerWidth<=350?7:9)))<.2&&Math.abs(r.right-(last.left+last.width/2+(innerWidth<=350?7:9)))<.2&&s.borderTopLeftRadius==='2px'&&s.borderTopRightRadius==='2px'&&s.backgroundColor===(()=>{const x=document.createElement('span');x.style.color=cosmosTime.context(entries,entries.get('ID')).color;document.body.append(x);const color=getComputedStyle(x).color;x.remove();return color})()})()"""
            for key, value in [('ID', id), ('START', start), ('END', end), ('COLUMNS', str(columns))]:
                condition = condition.replace(key, value)
            check(e(condition), name + f': {columns}-day canonical range is one continuous context-colored span with rounded true endpoints')
        check(e("(()=>{const bars=[...document.querySelectorAll('[data-time-range-id=\"range-wrap\"]')];return bars.length===2&&bars[0].classList.contains('time-continues-after')&&!bars[0].classList.contains('time-continues-before')&&bars[1].classList.contains('time-continues-before')&&!bars[1].classList.contains('time-continues-after')&&getComputedStyle(bars[0]).gridRowStart===getComputedStyle(bars[1]).gridRowStart&&bars.every((b,i)=>{const r=b.getBoundingClientRect(),w=b.closest('.time-week').getBoundingClientRect(),s=getComputedStyle(b);return i===0?Math.abs(r.right-w.right)<.2&&s.borderTopRightRadius==='0px':Math.abs(r.left-w.left)<.2&&s.borderTopLeftRadius==='0px'})})()"), name + ': week wrap uses two aligned segments with flush continuing ends')
        check(e("(()=>{const bars=[...document.querySelectorAll('[data-time-range-id=\"range-long\"]')];return bars.length===3&&bars.every(b=>getComputedStyle(b).gridRowStart==='1')&&bars.slice(1).every(b=>b.classList.contains('time-continues-before'))&&bars.every(b=>b.classList.contains('time-continues-after'))})()"), name + ': multi-week range stays in the same lane and continues past the displayed month')
        check(e("(()=>{const d=document.querySelector('[data-time-day=\"2026-10-24\"]'),b=d.querySelector('.time-date-bar');return d.querySelectorAll('.time-date-bar').length===1&&b.dataset.timeIndicatorId==='range-mixed-single'&&b.style.getPropertyValue('--time-marker-lane')==='1'&&!d.querySelector('.time-date-overflow')})()"), name + ': range plus single event uses distinct lanes without hiding either')
        check(e("(()=>{const d=document.querySelector('[data-time-day=\"2026-10-28\"]'),w=d.closest('.time-week'),ranges=[...w.querySelectorAll('.time-mobile-range')].filter(b=>{const event=timeWorkspace.events.find(e=>e.id===b.dataset.timeRangeId);return event.start<='2026-10-28'&&event.end>='2026-10-28'});return ranges.length===2&&new Set(ranges.map(b=>b.style.gridRow)).size===2&&d.querySelectorAll('.time-date-bar').length===1&&d.querySelector('.time-date-bar').style.getPropertyValue('--time-marker-lane')==='2'&&d.querySelector('.time-date-overflow').textContent==='+3'&&document.querySelectorAll('#time-day-entries > li').length===6})()"), name + ': overlapping ranges and singles cap at three lanes, exact +3 overflow, all six canonical entries remain available')
        check(e("(()=>{const d=document.querySelector('[data-time-day=\"2026-10-27\"]'),s=getComputedStyle(d.querySelector('.time-day-number'));return s.width==='26px'&&s.borderRadius==='50%'&&d.closest('.time-day').classList.contains('time-is-today')&&document.querySelector('[data-time-day=\"2026-10-28\"]').closest('.time-day').ariaSelected==='true'})()"), name + ': Today ring and selected-day treatment coexist inside ranges')
        check(e("[...document.querySelectorAll('.time-mobile-range,.time-date-bar')].every(b=>{const r=b.getBoundingClientRect(),w=b.closest('.time-week'),n=w.querySelector('[data-time-day]'),text=document.createRange();text.selectNode(n.firstChild);return r.top>=text.getBoundingClientRect().bottom&&r.bottom<=w.getBoundingClientRect().bottom})"), name + ': all range/single lanes remain beneath readable date numbers and inside their 44px week')
        check(e("[...document.querySelectorAll('.time-mobile-range-layer')].every(n=>n.ariaHidden==='true'&&getComputedStyle(n).pointerEvents==='none')&&!document.querySelector('.time-mobile-range button,.time-mobile-range [tabindex]')"), name + ': decorative spans add no hit layer, card, focus target or duplicate event semantics')
        shot('mobile-ranges-' + name)

        # The ring belongs to the fixed date-number square, never the full date target.
        for day, kind in [('2026-10-04', 'no indicators'), ('2026-10-01', 'single-date bar'), ('2026-10-08', 'continuous range'), ('2026-10-28', 'Today inside overlapping ranges')]:
            e('timeWorkspace.today=' + q(day) + ';timeWorkspace.render()')
            metrics = e("""(()=>{const b=document.querySelector('[aria-current="date"]'),n=b.querySelector('.time-day-number'),r=n.getBoundingClientRect(),d=b.getBoundingClientRect(),s=getComputedStyle(n),text=document.createRange();text.selectNodeContents(n);const t=text.getBoundingClientRect();return {width:r.width,height:r.height,dx:r.x+r.width/2-d.x-d.width/2,top:r.top-d.top,textDx:t.x+t.width/2-r.x-r.width/2,textDy:t.y+t.height/2-r.y-r.height/2,border:s.borderTopWidth,color:s.borderTopColor,radius:s.borderRadius,background:s.backgroundColor,shadow:s.boxShadow,parentRing:getComputedStyle(b,'::before').content}})()""")
            check(metrics['width'] == 26 and metrics['height'] == 26 and abs(metrics['dx']) < .1 and metrics['top'] == 3 and abs(metrics['textDx']) < .1 and abs(metrics['textDy']) <= 1, name + ': Today circle and actual date text share a centered 26px square with ' + kind + ': ' + q(metrics))
            check(metrics['border'] == '1px' and metrics['color'] == 'rgb(150, 212, 255)' and metrics['radius'] == '50%' and metrics['background'] == 'rgba(36, 76, 117, 0.7)' and '9px' in metrics['shadow'] and '5px' in metrics['shadow'] and metrics['parentRing'] == 'none', name + ': original ring size, color and glow live on the number wrapper, independent of ' + kind)
        e('timeWorkspace.today="2026-10-27";timeWorkspace.render()')
        shot('mobile-today-centered-' + name)

        # Same native hit selects a date beneath the decorative range layer.
        e("document.querySelector('[data-time-day=\"2026-10-28\"]').scrollIntoView({block:'center'});timeWorkspace.selectedDay=null;timeWorkspace.render()")
        tap('[data-time-day="2026-10-28"]')
        check(e('timeWorkspace.active&&timeWorkspace.selectedDay==="2026-10-28"&&document.querySelectorAll("#time-day-entries > li").length===6'), name + ': range date remains a normal one-tap date target with complete selected-day list')
        selector = '#time-day-entries [data-time-entry-id="range-long"]'
        e('document.querySelector(' + q(selector) + ').scrollIntoView({block:"center"})')
        tap(selector)
        check(e('timeWorkspace.active&&selectedNode.dataset.entryId==="range-long"&&contentInspector.entryId==="range-long"&&!panel.hidden'), name + ': range list event stays in Time and opens existing canonical Contents')
        tap('#time-close')
        wait_camera()
        check(e('!timeWorkspace.active&&selectedNode.dataset.entryId==="range-long"&&hierarchySidebar.selectedId==="range-long"'), name + ': native X closes Time without clearing canonical selection')
        check(e("(()=>{const n=nodes.get('range-long'),p=camera.worldToScreen(entries.get('range-long').x,entries.get('range-long').y),b=physics.bounds;return !graphViewport.inert&&!n.inert&&n.dataset.culled!=='true'&&p.x>=b.left&&p.x<=b.right&&p.y>=b.top&&p.y<=b.bottom&&!timeWorkspace.root.contains(document.activeElement)})()"), name + ': existing Universe navigation reveals selected CB and returns focus outside Time')
        e('clearSelection();camera.stopAnimation();timeWorkspace.open();window.rangeCamera={...camera.view}')
        tap('#time-close')
        check(e('!timeWorkspace.active&&!selectedNode&&JSON.stringify(camera.view)===JSON.stringify(rangeCamera)'), name + ': native X with no selection returns without selecting or reframing')
        # Actual ending cap must appear correctly when advancing the canonical month.
        e('timeWorkspace.open();timeWorkspace.month="2026-11-01";timeWorkspace.today="2026-10-27";timeWorkspace.render();timeWorkspace.root.scrollTop=0')
        check(e("(()=>{const b=document.querySelector('[data-time-range-id=\"range-long\"]'),s=getComputedStyle(b);return !!b&&b.classList.contains('time-continues-before')&&!b.classList.contains('time-continues-after')&&s.borderTopLeftRadius==='0px'&&s.borderTopRightRadius==='2px'&&s.gridColumnEnd==='8'})()"), name + ': next month preserves the continuing start and rounds the actual final date')
        shot('mobile-ranges-next-month-' + name)
    # The same canonical segment helper also respects a Monday-first locale.
    e('window.rangeMonth=cosmosTime.month;cosmosTime.month=value=>rangeMonth(value,1);timeWorkspace.month="2026-10-01";timeWorkspace.render()')
    check(e("(()=>{const bars=[...document.querySelectorAll('[data-time-range-id=\"range-wrap\"]')];return bars.length===2&&bars.every(b=>Number(b.style.gridColumnEnd)-Number(b.style.gridColumnStart)===2)&&bars[0].classList.contains('time-continues-after')&&bars[1].classList.contains('time-continues-before')})()"), 'Monday-first week boundary also wraps canonical range into two continuous segments')
    e('cosmosTime.month=rangeMonth')
    check(e('JSON.stringify([...entries].map(([id,e])=>[id,e.when]))===rangeCanonicalWhen'), 'range rendering, selection, month changes and X never mutate canonical When metadata')
    check(not cdp.errors, 'no runtime errors during canonical mobile ranges and native close checks')
