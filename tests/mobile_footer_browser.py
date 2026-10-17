"""Sidebar utilities in a fresh local browser profile; no auth submission/network."""
import json


def run_mobile_footer_checks(*, cdp, evaluate, check, wait_for, add, shot, baseline=False):
    roots=[add('Footer navigation '+str(i)) for i in range(12)]
    branch=[roots[0]]
    for name in ['Development','Projects','Mobile','Details','Item']:
        branch.append(add(name,branch[-1]))
    wait_for('physics.settled');evaluate('physics.pause();closeInspector()')

    def tap(selector):
        evaluate(f"document.querySelector({json.dumps(selector)}).scrollIntoView({{block:'nearest'}})")
        evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        p=evaluate(f"(()=>{{const r=document.querySelector({json.dumps(selector)}).getBoundingClientRect();return {{x:r.x+r.width/2,y:r.y+r.height/2}};}})()")
        cdp.call('Input.dispatchTouchEvent',type='touchStart',touchPoints=[p])
        cdp.call('Input.dispatchTouchEvent',type='touchEnd',touchPoints=[])

    def marker_scale(label, mobile):
        markers=evaluate(f"""{json.dumps(branch)}.map(id=>{{
            const row=hierarchySidebar.rows.get(id),r=row.getBoundingClientRect(),
                i=row.querySelector('.tree-role-icon').getBoundingClientRect(),n=row.querySelector('.tree-name').getBoundingClientRect();
            return {{role:row.dataset.role,width:i.width,height:i.height,rowHeight:r.height,
                centered:Math.abs(i.y+i.height/2-r.y-r.height/2)<.6,
                columnOffset:n.left-i.left-i.width/2}};
        }})""")
        print('Tree markers '+label+': '+json.dumps(markers),flush=True)
        check([m['role'] for m in markers]==['galaxy','sun','planet','moon','satellite','astronaut'],'mixed branch covers every body marker type: '+label)
        check(all(markers[i]['width']*markers[i]['height']>markers[i+1]['width']*markers[i+1]['height'] for i in range(len(markers)-1)),'parent marker footprint decreases subtly toward leaf items: '+label)
        check(all(m['width']<=14 and m['height']<=14 and m['centered'] and m['rowHeight']==(44 if mobile else 32) and abs(m['columnOffset']-(10 if mobile else 13))<.6 for m in markers),'markers remain centered within unchanged icon columns and row heights: '+label)

    for width,height in [(360,800),(390,844),(430,932),(740,360),(844,390),(1440,1000)]:
        mobile=width<1000
        label=f'{width}x{height}'
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=mobile)
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=mobile,maxTouchPoints=5)
        wait_for('hierarchySidebar.narrow' if mobile else '!hierarchySidebar.narrow')
        evaluate("hierarchySidebar.setCollapsed(false);document.getElementById('sample-utility').open=false;hierarchySidebar.sidebar.scrollTop=0")
        evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        layout=evaluate("""(()=>{
            const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
            return {footer:box('#sidebar-utilities'),tree:box('#hierarchy-tree'),collections:box('#constellations-section'),help:box('#help-button'),backup:box('#backup-button'),account:box('#account-button'),sample:box('#sample-utility summary'),sidebarScroll:hierarchySidebar.sidebar.scrollHeight-hierarchySidebar.sidebar.clientHeight};
        })()""")
        print('Footer layout '+label+': '+json.dumps(layout),flush=True)
        shot('footer-'+label)
        if baseline:
            continue
        headers=evaluate("""(()=>{
            const read=(label,button,header,add)=>{
                const l=document.querySelector(label),r=document.createRange();r.selectNodeContents(l);
                const text=r.getBoundingClientRect(),b=document.querySelector(button).getBoundingClientRect(),
                    h=document.querySelector(header).getBoundingClientRect(),a=document.querySelector(add).getBoundingClientRect(),
                    svg=document.querySelector(button+' svg').getBoundingClientRect(),s=getComputedStyle(l);
                return {labelX:text.x,labelY:text.y-h.y,chevronX:svg.x,chevronY:svg.y-h.y,buttonHeight:b.height,
                    addX:a.x,addY:a.y-h.y,addHeight:a.height,rowHeight:h.height,
                    font:[s.fontFamily,s.fontSize,s.fontWeight,s.letterSpacing,s.color,s.lineHeight,s.textTransform]};
            };
            return {universe:read('#universe-home','#universe-toggle','#universe-section > header','#add-entry-button'),
                constellations:read('#constellations-toggle > span','#constellations-toggle','#constellations-section > header','#new-constellation-button')};
        })()""")
        print('Section headers '+label+': '+json.dumps(headers),flush=True)
        u,c=headers['universe'],headers['constellations']
        check(u['font']==c['font'],'peer section labels use identical typography: '+label)
        check(all(abs(u[key]-c[key])<.6 for key in ['labelX','labelY','chevronX','chevronY','buttonHeight','addX','addY','addHeight','rowHeight']),'peer section labels, chevrons and Add controls align in equal-height rows: '+label)
        if mobile:
            for expanded in [False,True]:
                evaluate(f"{json.dumps(branch)}.forEach(id=>hierarchySidebar.expanded.{'add' if expanded else 'delete'}(id));hierarchySidebar.render();hierarchySidebar.tree.scrollTop=0;hierarchySidebar.sidebar.scrollTop=0")
                grid=evaluate(f"""(()=>{{
                    const ids={json.dumps(branch)},center=r=>r.left+r.width/2;
                    const rows=ids.map(id=>{{const row=hierarchySidebar.rows.get(id);if(!row?.isConnected)return null;
                        const d=row.querySelector('.tree-disclosure').getBoundingClientRect(),i=row.querySelector('.tree-role-icon').getBoundingClientRect(),n=row.querySelector('.tree-name').getBoundingClientRect();
                        return {{chevron:center(d),iconX:i.left,iconWidth:i.width,nameX:n.left,level:Number(row.getAttribute('aria-level'))}};
                    }});
                    return {{rows,headers:['#universe-toggle svg','#constellations-toggle svg'].map(s=>center(document.querySelector(s).getBoundingClientRect())),headerLabel:document.getElementById('universe-home').getBoundingClientRect().left}};
                }})()""")
                print('Navigation grid '+label+' '+str(expanded)+': '+json.dumps(grid),flush=True)
                check(all(abs(x-grid['rows'][0]['chevron'])<.6 for x in grid['headers']),'section chevrons share the first-level CB base grid '+str(expanded)+': '+label)
                check(grid['headerLabel']<=grid['rows'][0]['nameX'] and grid['rows'][0]['iconWidth']>0 and grid['rows'][0]['nameX']>grid['rows'][0]['iconX']+grid['rows'][0]['iconWidth'],'section labels precede CB names while body icons retain their space: '+label)
                if expanded:
                    indent=lambda level:(level-1)*9 if level<=5 else 43
                    check(all(row is not None for row in grid['rows']) and all(abs(grid['rows'][i]['chevron']-grid['rows'][0]['chevron']-indent(grid['rows'][i]['level']))<.6 and abs(grid['rows'][i]['nameX']-grid['rows'][0]['nameX']-indent(grid['rows'][i]['level']))<.6 for i in range(1,len(branch))),'six hierarchy levels retain progressive descendant indentation: '+label)
                    marker_scale(label,True)
                else:
                    check(all(row is None for row in grid['rows'][1:]),'collapsed branch hides descendants without flattening them: '+label)
                shot('navigation-grid-'+label+('-expanded' if expanded else '-collapsed'))
            check(layout['footer']['height']<=52,'utilities occupy one compact row: '+label)
            check(all(layout[key]['height']>=44 and layout[key]['width']>=44 for key in ['help','backup','account','sample']),'all utility targets remain at least 44px: '+label)
            check(len({layout[key]['y'] for key in ['help','backup','account','sample']})==1,'Help, Backup, Account and development disclosure share one row: '+label)
            check(layout['collections']['bottom']<=layout['footer']['y'],'footer does not overlap Constellations: '+label)
            check(evaluate("getComputedStyle(document.querySelector('.sample-utility-label')).display==='none'&&!document.getElementById('sample-utility').open"),'Sample data is absent from primary footer labels and starts behind disclosure: '+label)
            for selector,dialog,close in [('#help-button','help-dialog','#close-help-button'),('#backup-button','backup-dialog','#cancel-backup'),('#account-button','account-dialog','#account-close')]:
                tap(selector);wait_for(f"document.getElementById('{dialog}').open")
                check(evaluate(f"document.getElementById('{dialog}').open"),'existing utility dialog opens via touch '+selector+': '+label)
                tap(close);wait_for(f"!document.getElementById('{dialog}').open")
            tap('#sample-utility summary');wait_for("document.getElementById('sample-utility').open")
            check(evaluate("""(()=>{const c=document.getElementById('sample-controls').getBoundingClientRect(),s=hierarchySidebar.sidebar.getBoundingClientRect(),f=document.getElementById('sidebar-utilities').getBoundingClientRect(),b=document.getElementById('load-sample-button').getBoundingClientRect();return c.width>0&&c.left>=s.left&&c.right<=s.right&&c.top>=s.top&&c.bottom<=f.top&&b.height>=44&&b.top>=0&&b.bottom<=innerHeight;})()"""),'existing sample controls open above footer and remain reachable: '+label)
            shot('footer-development-'+label)
            tap('#sample-utility summary');wait_for("!document.getElementById('sample-utility').open")
            # Short landscape retains the existing scrollable drawer. Reach its
            # end to include the footer's bottom margin, not just the last button.
            evaluate('hierarchySidebar.sidebar.scrollTop=hierarchySidebar.sidebar.scrollHeight')
            # scrollHeight is integral while landscape layout can use fractional pixels.
            check(evaluate("(()=>{const f=document.getElementById('sidebar-utilities').getBoundingClientRect(),s=hierarchySidebar.sidebar;return f.bottom<=innerHeight-12+1&&f.top>=0&&s.scrollWidth<=s.clientWidth})()"),'footer remains reachable without horizontal overflow and retains bottom spacing: '+label)
            shot('footer-reachable-'+label)
        else:
            evaluate(f"{json.dumps(branch)}.forEach(id=>hierarchySidebar.expanded.add(id));hierarchySidebar.render()")
            marker_scale(label,False)
            check(layout['help']['y']<layout['backup']['y']<layout['account']['y']<layout['sample']['y'],'desktop keeps its stacked utilities')
            check(evaluate("getComputedStyle(document.querySelector('.sample-utility-label')).display!=='none'&&getComputedStyle(document.querySelector('.sample-utility-overflow')).display==='none'"),'desktop retains Sample data disclosure label')
    if not baseline:
        personal=evaluate("localStorage.getItem('galaxy:user-data')")
        evaluate('loadSampleButton.click()')
        wait_for("document.readyState==='complete'&&typeof sampleMode!=='undefined'&&sampleMode&&typeof sampleUtility!=='undefined'")
        check(evaluate('sampleUtility.open'),'desktop Sample mode retains its expanded utility disclosure')
        cdp.call('Emulation.setDeviceMetricsOverride',width=844,height=390,deviceScaleFactor=1,mobile=False)
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=1)
        evaluate('window.dispatchEvent(new Event("resize"))')
        wait_for('hierarchySidebar.narrow&&!sampleUtility.open')
        check(evaluate('!sampleUtility.open'),'resize-driven phone-landscape transition also closes Sample disclosure')
        cdp.call('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=True)
        cdp.call('Emulation.setTouchEmulationEnabled',enabled=True,maxTouchPoints=1)
        wait_for('hierarchySidebar.narrow&&!sampleUtility.open')
        evaluate('hierarchySidebar.setCollapsed(false)')
        check(evaluate("!sampleUtility.open&&!document.getElementById('sample-controls').checkVisibility()"),'entering mobile Sample mode closes the floating utility panel instead of covering navigation')
        tap('#sample-utility summary')
        check(evaluate('sampleUtility.open&&!removeSampleButton.disabled'),'Sample utilities remain explicitly accessible on mobile')
        evaluate('window.dispatchEvent(new Event("resize"))')
        check(evaluate('sampleUtility.open'),'resizing within mobile keeps explicitly opened utilities available')
        tap('#sample-utility summary')
        evaluate('window.footerReloadProbe=true')
        cdp.call('Page.reload')
        wait_for("typeof footerReloadProbe==='undefined'&&document.readyState==='complete'&&typeof sampleMode!=='undefined'&&!sampleMode&&typeof sampleUtility!=='undefined'")
        check(evaluate("localStorage.getItem('galaxy:user-data')")==personal,'reloading Sample still returns to unchanged real data')
        # The real layout resumes after reload. Flush that ordinary layout save
        # before comparing a second independent Sample enter/leave cycle.
        personal=evaluate("(async()=>{physics.pause();await applicationCommandTail;if(graphNeedsSave)await saveGalaxy();return localStorage.getItem('galaxy:user-data')})()")
        evaluate('window.footerReloadProbe=true;loadSampleButton.click()')
        wait_for("typeof footerReloadProbe==='undefined'&&document.readyState==='complete'&&typeof sampleMode!=='undefined'&&sampleMode&&typeof sampleUtility!=='undefined'")
        check(evaluate('hierarchySidebar.narrow&&!sampleUtility.open'),'mobile Sample startup keeps the utility panel collapsed')
        evaluate('removeSampleButton.click()')
        wait_for("document.readyState==='complete'&&typeof sampleMode!=='undefined'&&!sampleMode&&typeof sampleUtility!=='undefined'")
        check(evaluate("localStorage.getItem('galaxy:user-data')")==personal,'Sample disclosure checks preserve all real saved data')
        check(not cdp.errors,f'no footer browser exceptions: {cdp.errors}')
