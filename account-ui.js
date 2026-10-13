class CosmifoldAccountUI {
    constructor({service,document:doc=document}){
        this.service=service;this.doc=doc;this.mode='signIn';this.actionLabel='Sign in';this.epoch=0;this.recoveryRequested=false;
        const get=id=>doc.getElementById(id);
        this.button=get('account-button');this.dialog=get('account-dialog');this.form=get('account-form');
        this.title=get('account-title');this.description=get('account-description');this.status=get('account-status');
        this.email=get('account-email');this.password=get('account-password');this.confirm=get('account-confirm-password');
        this.submit=get('account-submit');this.switchButton=get('account-switch');this.forgot=get('account-forgot');
        this.close=get('account-close');this.cancel=get('account-cancel');
        this.bindings=[];
        const bind=(target,type,handler,capture=false)=>{target.addEventListener(type,handler,capture);this.bindings.push(()=>target.removeEventListener(type,handler,capture));};
        bind(this.button,'click',()=>this.open());
        bind(this.close,'click',()=>this.dialog.close());bind(this.cancel,'click',()=>this.dialog.close());
        bind(this.dialog,'close',()=>{
            this.epoch++;this.password.value=this.confirm.value='';
            if(!doc.querySelector('dialog[open]')){
                const bounds=this.button.getBoundingClientRect();
                (bounds.width&&bounds.right>0&&bounds.left<globalThis.innerWidth?this.button:doc.getElementById('sidebar-toggle')).focus({preventScroll:true});
            }
        });
        bind(this.dialog,'keydown',event=>{
            event.stopPropagation();
            if(event.key==='Escape'){event.preventDefault();this.dialog.close();return;}
            if(event.key!=='Tab')return;
            const controls=[...this.dialog.querySelectorAll('button,input')].filter(control=>!control.disabled&&control.getClientRects().length);
            const target=event.shiftKey&&doc.activeElement===controls[0]?controls.at(-1):!event.shiftKey&&doc.activeElement===controls.at(-1)?controls[0]:null;
            if(target){event.preventDefault();target.focus();}
        });
        bind(this.switchButton,'click',()=>{this.show(this.mode==='signIn'?'signUp':'signIn');this.focus();});
        bind(this.forgot,'click',()=>{this.show('reset');this.focus();});
        bind(get('account-retry'),'click',()=>{void service.initialize();});
        bind(this.form,'submit',event=>{event.preventDefault();void this.perform();});
        // Avoid stacking a recovery dialog over another Cosmifold modal.
        bind(doc,'close',()=>setTimeout(()=>this.openRecovery(),0),true);
        this.unsubscribe=service.subscribe(state=>this.update(state));
    }
    open(){
        if(this.doc.querySelector('dialog[open]')&&!this.dialog.open)return;
        const state=this.service.getState();
        this.show(!state.ready?'checking':!state.available||state.failed?'unavailable':state.recovery?'newPassword':state.user?'account':'signIn');
        if(!this.dialog.open)this.dialog.showModal();this.focus();
    }
    openRecovery(){
        if(!this.recoveryRequested||!this.service.getState().recovery||this.doc.querySelector('dialog[open]'))return;
        this.recoveryRequested=false;this.show('newPassword');this.dialog.showModal();this.focus();
    }
    focus(){
        (['signIn','signUp','reset'].includes(this.mode)?this.email:this.mode==='newPassword'?this.password:this.submit.hidden?this.cancel:this.submit).focus();
    }
    update(state){
        this.button.textContent=state.user?'Account':'Sign in';
        if(state.recovery&&!this.previousRecovery){this.recoveryRequested=true;setTimeout(()=>{
            if(this.dialog.open){this.show('newPassword');this.focus();this.recoveryRequested=false;}else this.openRecovery();
        },0);}
        this.previousRecovery=state.recovery;
        if(this.dialog.open&&!state.busy&&['checking','unavailable','account','signIn'].includes(this.mode)){
            const next=!state.ready?'checking':!state.available||state.failed?'unavailable':state.recovery?'newPassword':state.user?'account':'signIn';
            if(next!==this.mode)this.show(next);
            else if(next==='account')this.description.textContent=state.user.email;
        }
        for(const control of this.form.querySelectorAll('input,button'))control.disabled=!!state.busy||(control.matches('input')&&control.closest('.account-field').hidden);
        // Closing never cancels an in-flight SDK request, and never blocks the Cosmos.
        this.cancel.disabled=this.close.disabled=false;
        this.submit.textContent=state.busy?({signIn:'Signing in...',signUp:'Creating account...',signOut:'Signing out...',requestPasswordReset:'Sending email...',updatePassword:'Saving password...'}[state.busy]):this.actionLabel;
    }
    show(mode,message=''){
        if(mode!==this.mode)this.password.value=this.confirm.value='';
        this.mode=mode;this.epoch++;
        const copy={
            signIn:['Sign in to Cosmifold','Your Cosmifold data stays in this browser.','Sign in'],
            signUp:['Create your account','Your Cosmifold data stays in this browser.','Create account'],
            reset:['Forgot password?','Enter your email to request a password reset link.','Send reset email'],
            newPassword:['Choose a new password','Use at least 8 characters.','Save password'],
            account:['Account',this.service.getState().user?.email||'','Sign out'],
            checking:['Account','Checking your account...',null],
            unavailable:['Account',this.service.getState().available?'Accounts are temporarily unavailable. You can keep using your local Cosmos.':"Accounts aren't connected yet. You can keep using your local Cosmos.",null],
            checkEmail:['Check your email',message,null],
            passwordSaved:['Password updated','You can now use your new password to sign in.',null]
        }[mode];
        this.title.textContent=copy[0];this.description.textContent=copy[1];this.actionLabel=copy[2];
        this.submit.hidden=!copy[2];this.submit.textContent=copy[2]||'';
        const email=['signIn','signUp','reset'].includes(mode),password=['signIn','signUp','newPassword'].includes(mode),confirm=['signUp','newPassword'].includes(mode);
        for(const [input,visible] of [[this.email,email],[this.password,password],[this.confirm,confirm]]){
            input.closest('.account-field').hidden=!visible;input.disabled=!visible;input.required=visible;
        }
        this.password.autocomplete=mode==='signIn'?'current-password':'new-password';
        this.password.minLength=mode==='signIn'?1:8;
        this.switchButton.hidden=!['signIn','signUp','reset'].includes(mode);
        this.switchButton.textContent=mode==='signIn'?'New to Cosmifold? Create account':'Already have an account? Sign in';
        this.forgot.hidden=mode!=='signIn';
        this.doc.getElementById('account-local-data').hidden=mode!=='account';
        this.doc.getElementById('account-retry').hidden=mode!=='unavailable'||!this.service.getState().available;
        this.status.hidden=true;this.status.textContent='';
        this.update(this.service.getState());
        if(this.dialog.open)this.focus();
    }
    async perform(){
        const state=this.service.getState();if(state.busy||!this.form.reportValidity())return;
        if(['signUp','newPassword'].includes(this.mode)&&this.password.value.length<8){
            this.error('Use at least 8 characters for your password.');this.password.focus();return;
        }
        if(['signUp','newPassword'].includes(this.mode)&&this.password.value!==this.confirm.value){
            this.error("The passwords don't match.");this.confirm.focus();return;
        }
        const mode=this.mode,epoch=this.epoch;this.status.hidden=true;
        try{
            if(mode==='signUp'){
                const result=await this.service.signUp(this.email.value.trim(),this.password.value);
                if(this.dialog.open&&epoch===this.epoch){this.password.value=this.confirm.value='';this.show(result.confirmationRequired?'checkEmail':'account','Follow the confirmation link in your email to finish creating your account.');}
            }else if(mode==='signIn')await this.service.signIn(this.email.value.trim(),this.password.value);
            else if(mode==='account')await this.service.signOut();
            else if(mode==='reset'){
                await this.service.requestPasswordReset(this.email.value.trim());
                if(this.dialog.open&&epoch===this.epoch)this.show('checkEmail',"If an account exists for that address, you'll receive a password reset link.");
            }else if(mode==='newPassword'){
                await this.service.updatePassword(this.password.value);
                if(this.dialog.open&&epoch===this.epoch){this.password.value=this.confirm.value='';this.show('passwordSaved');}
            }
        }catch{
            if(this.dialog.open&&epoch===this.epoch)this.error({signIn:"Couldn't sign in. Check your email and password.",signUp:"Couldn't create your account. Check your details and try again.",reset:"Couldn't send the reset email. Try again.",newPassword:"Couldn't update your password. Try again.",account:"Couldn't sign out. Try again."}[mode]);
        }
    }
    error(message){this.status.textContent=message;this.status.hidden=false;}
    dispose(){this.unsubscribe();for(const remove of this.bindings)remove();}
}
