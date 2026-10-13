"""Account UI checks through the actual static app, with a deterministic provider."""
import base64
import json


def run_auth_checks(*, cdp, evaluate, check, wait_for, load, origin, root, screenshot_dir):
    def click(selector):
        evaluate(f"document.querySelector({json.dumps(selector)}).click()")

    def submit(email='member@example.invalid', password='test password', confirmation=None):
        evaluate(f"cosmifoldAccountUI.email.value={json.dumps(email)};cosmifoldAccountUI.password.value={json.dumps(password)};cosmifoldAccountUI.confirm.value={json.dumps(confirmation if confirmation is not None else password)};cosmifoldAccountUI.form.requestSubmit();void 0")

    def screenshot(name):
        if screenshot_dir:
            result = cdp.call('Page.captureScreenshot', format='png', captureBeyondViewport=False)
            (screenshot_dir / f'auth-{name}.png').write_bytes(base64.b64decode(result['data']))

    def reload():
        cdp.call('Page.reload')
        wait_for("document.readyState==='complete'&&typeof cosmifoldAuth!=='undefined'&&cosmifoldAuth.getState().ready&&typeof physics!=='undefined'")
        load()
        evaluate('physics.pause();graphNeedsSave=false')

    check(evaluate("cosmifoldAuth.getState().ready&&!cosmifoldAuth.getState().available&&entries.size===6"), 'unconfigured Auth does not block the local Cosmos')
    click('#account-button')
    check(evaluate("cosmifoldAccountUI.dialog.open&&cosmifoldAccountUI.mode==='unavailable'&&cosmifoldAccountUI.description.textContent.includes('local Cosmos')"), 'unconfigured Account surface explains that local use continues')
    click('#account-cancel')
    wait_for("!cosmifoldAccountUI.dialog.open&&document.activeElement.id==='account-button'")
    check(evaluate("!cosmifoldAccountUI.dialog.open&&document.activeElement.id==='account-button'"), 'Close returns keyboard focus to the account entry')
    check(not any('cdn.jsdelivr.net' in r['url'] or '.supabase.co' in r['url'] for r in cdp.requests), 'blank configuration makes no SDK or Auth network request')

    # Replace the provider at the classic script boundary in the test profile only.
    # No production test switch and no real project, email delivery or credentials.
    source = (root / 'tests/fake-auth.js').read_text(encoding='utf-8') + """
    document.addEventListener('load',event=>{
        if(event.target.src?.endsWith('/services/supabase-auth.js')){
            const actual=createSupabaseAuthAdapter;
            window.authFixture=createFakeAuthAdapter({storage:localStorage});
            createSupabaseAuthAdapter=options=>options?.disabled?actual(options):authFixture;
        }
    },true);
    """
    cdp.call('Page.addScriptToEvaluateOnNewDocument', source=source)
    reload()
    check(evaluate("cosmifoldAuth.getState().available&&cosmifoldAuth.getState().user===null&&document.getElementById('account-button').textContent==='Sign in'"), 'signed-out configured startup keeps the Cosmos available')
    evaluate("(async()=>{selectEntry(entries.get('old-moon'),nodes.get('old-moon'),{reframe:false});await contentInspector.upload([new File([new Uint8Array([0,128,255])],'auth-isolation.bin',{type:'application/octet-stream'})]);await applicationCommandTail;physics.pause();graphNeedsSave=false;window.authFileKey=contentInspector.content().attachments[0].storageKey;})()")
    evaluate("window.authBaseline=localStorage.getItem('galaxy:user-data');window.prefBaseline=localStorage.getItem('galaxy:navigation-ui')")
    click('#account-button')
    check(evaluate("document.activeElement.id==='account-email'&&cosmifoldAccountUI.password.autocomplete==='current-password'&&cosmifoldAccountUI.email.autocomplete==='email'"), 'sign-in opens with labelled email focus and password-manager attributes')
    evaluate('cosmifoldAccountUI.cancel.focus()')
    cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Tab',code='Tab',windowsVirtualKeyCode=9)
    cdp.call('Input.dispatchKeyEvent',type='keyUp',key='Tab',code='Tab',windowsVirtualKeyCode=9)
    check(evaluate("document.activeElement.id==='account-close'"), 'Tab stays inside the account dialog')
    click('#account-switch')
    check(evaluate("cosmifoldAccountUI.mode==='signUp'&&cosmifoldAccountUI.password.autocomplete==='new-password'&&cosmifoldAccountUI.confirm.autocomplete==='new-password'"), 'create-account asks only email and confirmed new password')
    submit(password='short')
    check(evaluate("authFixture.calls.filter(c=>c==='signUp').length===0"), 'invalid signup password is rejected before a provider request')
    submit(confirmation='different password')
    check(evaluate("!cosmifoldAccountUI.status.hidden&&cosmifoldAccountUI.status.textContent.includes(\"don't match\")&&authFixture.calls.filter(c=>c==='signUp').length===0"), 'signup confirmation mismatch preserves the form without a request')
    evaluate('window.releaseAuth=authFixture.delayNext();void 0')
    submit()
    wait_for("cosmifoldAuth.getState().busy==='signUp'")
    evaluate('cosmifoldAccountUI.form.requestSubmit();void 0')
    check(evaluate("cosmifoldAccountUI.submit.disabled&&cosmifoldAccountUI.submit.textContent==='Creating account...'&&authFixture.calls.filter(c=>c==='signUp').length===1"), 'pending signup disables duplicate submission')
    evaluate('releaseAuth();void 0')
    wait_for("cosmifoldAccountUI.mode==='checkEmail'")
    check(evaluate("cosmifoldAuth.getState().user===null&&cosmifoldAccountUI.title.textContent==='Check your email'"), 'confirmation-required signup does not falsely sign in')
    click('#account-cancel');click('#account-button')
    evaluate('authFixture.rejectNext()');submit()
    wait_for('!cosmifoldAccountUI.status.hidden')
    check(evaluate("cosmifoldAccountUI.email.value==='member@example.invalid'&&!cosmifoldAccountUI.submit.disabled&&cosmifoldAccountUI.status.textContent===\"Couldn't sign in. Check your email and password.\""), 'rejected sign-in keeps the email and shows a privacy-safe retry state')
    evaluate('window.releaseAuth=authFixture.delayNext();void 0');submit()
    wait_for("cosmifoldAuth.getState().busy==='signIn'")
    evaluate('cosmifoldAccountUI.form.requestSubmit();void 0')
    check(evaluate("cosmifoldAccountUI.submit.disabled&&authFixture.calls.filter(c=>c==='signIn').length===2"), 'pending sign-in does not submit twice')
    evaluate('releaseAuth();void 0');wait_for("cosmifoldAccountUI.mode==='account'")
    check(evaluate("cosmifoldAccountUI.description.textContent==='member@example.invalid'&&!document.getElementById('account-local-data').hidden&&document.getElementById('account-button').textContent==='Account'"), 'signed-in account shows email and browser-local limitation')
    check(evaluate("document.activeElement.id==='account-submit'"), 'successful sign-in moves keyboard focus to the Account action')
    check(evaluate("localStorage.getItem('galaxy:user-data')===authBaseline&&localStorage.getItem('galaxy:navigation-ui')===prefBaseline"), 'sign-up and sign-in do not alter local Cosmos or preferences')
    check(evaluate("(async()=>JSON.stringify([...new Uint8Array(await (await attachmentStore.get(authFileKey)).blob.arrayBuffer())])==='[0,128,255]')()"), 'sign-in leaves real IndexedDB original bytes intact')
    click('#account-cancel');reload()
    check(evaluate("cosmifoldAuth.getState().user.email==='member@example.invalid'&&document.getElementById('account-button').textContent==='Account'"), 'existing session returns after a real page reload')

    # Backup and replacement Restore use their real repository and real IndexedDB.
    evaluate("(async()=>{await applicationCommandTail;window.authPortable=await cosmifoldBackup.create(universeRepository);window.authStoreBefore=localStorage.getItem('galaxy:user-data');window.authPrefsBefore=localStorage.getItem('galaxy:navigation-ui');window.authSessionBefore=localStorage.getItem('test:auth-session');})()")
    check(evaluate("!['TEST_ONLY_ACCESS_MARKER','TEST_ONLY_REFRESH_MARKER','TEST_ONLY_PKCE_MARKER','test:auth-session','member@example.invalid'].some(s=>JSON.stringify(authPortable.manifest).includes(s))"), 'real backup manifest excludes the session, verifier, tokens and account identity')
    evaluate("(async()=>{await cosmifoldRestore.restore(await cosmifoldRestore.inspect(authPortable.blob),universeRepository);})()")
    check(evaluate("localStorage.getItem('test:auth-session')===authSessionBefore&&cosmifoldAuth.getState().user.email==='member@example.invalid'"), 'real local replacement Restore preserves independent Auth credentials')
    click('#account-button');click('#account-submit');wait_for("cosmifoldAuth.getState().user===null")
    check(evaluate("localStorage.getItem('galaxy:user-data')===authStoreBefore&&localStorage.getItem('galaxy:navigation-ui')===authPrefsBefore&&localStorage.getItem('test:auth-session')===null"), 'sign-out clears identity only and retains local metadata/preferences')
    check(evaluate("(async()=>{const record=(await attachmentStore.readAll()).find(r=>r.blob.size===3);return record&&JSON.stringify([...new Uint8Array(await record.blob.arrayBuffer())])==='[0,128,255]'})()"), 'real IndexedDB bytes survive Backup, replacement Restore and sign-out')
    submit(email='other@example.invalid');wait_for("cosmifoldAccountUI.mode==='account'")
    check(evaluate("localStorage.getItem('galaxy:user-data')===authStoreBefore&&cosmifoldAuth.getState().user.email==='other@example.invalid'"), 'account B sees the same browser-local Cosmos without ownership or sync claims')
    evaluate("authFixture.emit('SIGNED_OUT',null)")
    wait_for("cosmifoldAccountUI.mode==='signIn'")
    check(evaluate("document.getElementById('account-button').textContent==='Sign in'"), 'provider sign-out notification updates an open account surface')
    click('#account-forgot');evaluate('authFixture.rejectNext()');submit(email='private@example.invalid')
    wait_for('!cosmifoldAccountUI.status.hidden')
    check(evaluate("cosmifoldAccountUI.email.value==='private@example.invalid'&&!cosmifoldAccountUI.submit.disabled"), 'reset request failure retains email and re-enables the form')
    submit(email='private@example.invalid');wait_for("cosmifoldAccountUI.mode==='checkEmail'")
    check(evaluate("cosmifoldAccountUI.description.textContent===\"If an account exists for that address, you'll receive a password reset link.\"&&authFixture.calls.includes('requestPasswordReset')"), 'reset request confirmation does not reveal account existence')
    click('#account-cancel')
    click('#help-button')
    evaluate("authFixture.emit('PASSWORD_RECOVERY',{id:'fixture-recovery',email:'member@example.invalid'})")
    evaluate('new Promise(r=>setTimeout(r,30))')
    check(evaluate("document.getElementById('help-dialog').open&&!cosmifoldAccountUI.dialog.open"), 'recovery waits for an existing modal rather than stacking dialogs')
    click('#close-help-button')
    wait_for("cosmifoldAccountUI.dialog.open&&cosmifoldAccountUI.mode==='newPassword'")
    check(evaluate("document.activeElement.id==='account-password'&&cosmifoldAccountUI.password.autocomplete==='new-password'"), 'recovery event opens focused new-password dialog')
    evaluate('authFixture.rejectNext()');submit(password='replacement password')
    wait_for('!cosmifoldAccountUI.status.hidden')
    check(evaluate("cosmifoldAuth.getState().recovery&&!cosmifoldAccountUI.submit.disabled"), 'failed password update retains a usable recovery form')
    submit(password='replacement password');wait_for("cosmifoldAccountUI.mode==='passwordSaved'")
    check(evaluate("!cosmifoldAuth.getState().recovery&&cosmifoldAccountUI.password.value===''"), 'password update uses provider flow and clears the password after success')
    click('#account-cancel');click('#account-button')
    for width, height, mobile, name in [(1440,1000,False,'desktop-account'), (600,850,False,'narrow-account'), (390,844,True,'mobile-account')]:
        cdp.call('Emulation.setDeviceMetricsOverride',width=width,height=height,deviceScaleFactor=1,mobile=mobile)
        check(evaluate("(()=>{const r=cosmifoldAccountUI.dialog.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&cosmifoldAccountUI.dialog.scrollWidth<=cosmifoldAccountUI.dialog.clientWidth;})()"), name+' fits without horizontal overflow')
        check(evaluate("[...cosmifoldAccountUI.dialog.querySelectorAll('button')].filter(b=>b.getClientRects().length).every(b=>b.getBoundingClientRect().height>=44)"), name+' has comfortable button targets')
        screenshot(name)
    click('#account-submit');wait_for("cosmifoldAccountUI.mode==='signIn'")
    screenshot('mobile-sign-in');click('#account-switch');screenshot('mobile-create-account')
    cdp.call('Input.dispatchKeyEvent',type='keyDown',key='Escape',code='Escape',windowsVirtualKeyCode=27)
    cdp.call('Input.dispatchKeyEvent',type='keyUp',key='Escape',code='Escape',windowsVirtualKeyCode=27)
    wait_for("!cosmifoldAccountUI.dialog.open&&['account-button','sidebar-toggle'].includes(document.activeElement.id)")
    check(evaluate("!cosmifoldAccountUI.dialog.open&&['account-button','sidebar-toggle'].includes(document.activeElement.id)"), 'Escape closes Auth and restores visible chrome focus')
    evaluate("(async()=>{cosmifoldAccountUI.dispose();cosmifoldAuth.dispose();window.unavailableFixture=createFakeAuthAdapter();unavailableFixture.rejectNext();window.unavailableAuth=createAuthService({adapter:unavailableFixture});window.unavailableUI=new CosmifoldAccountUI({service:unavailableAuth});await unavailableAuth.initialize();})()")
    click('#account-button')
    check(evaluate("unavailableUI.mode==='unavailable'&&entries.size===6&&storageAvailable&&localStorage.getItem('galaxy:user-data')===authStoreBefore"), 'Auth initialization rejection leaves the actual local Cosmos available')
    click('#account-retry');wait_for("unavailableAuth.getState().ready&&!unavailableAuth.getState().failed&&unavailableUI.mode==='signIn'")
    check(evaluate("unavailableUI.mode==='signIn'"), 'account UI recovers after a failed initialization retry')
    check(not cdp.errors, f'no unhandled Auth/browser exceptions: {cdp.errors}')
