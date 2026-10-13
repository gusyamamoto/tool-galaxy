// Provider-independent, identity-only interface. State never exposes SDK sessions.
function createAuthService({adapter=createSupabaseAuthAdapter()}={}) {
    const listeners=new Set();let initialization,eventRevision=0;
    let state=Object.freeze({ready:false,available:adapter.available,user:null,recovery:false,busy:null,failed:false});
    function publish(change){
        const user=Object.hasOwn(change,'user')?change.user:state.user;
        state=Object.freeze({...state,...change,user:user?Object.freeze({id:user.id,email:user.email||''}):null});
        for(const listener of listeners)listener(state);
    }
    function onChange({event,user}){
        eventRevision++;
        publish({ready:true,failed:false,user,recovery:event==='PASSWORD_RECOVERY'?true:event==='SIGNED_OUT'?false:state.recovery});
    }
    async function initialize(){
        if(!initialization){
            publish({ready:false,failed:false});const revision=eventRevision;
            initialization=(async()=>{
                try{
                    const result=await adapter.initialize(onChange);
                    publish({ready:true,failed:false,...(revision===eventRevision?{user:result.user}:{})});
                }catch{
                    publish({ready:true,failed:true});initialization=null;
                }
                return state;
            })();
        }
        return initialization;
    }
    async function run(action,args){
        if(!state.ready||!state.available||state.failed||state.busy)throw new Error('Auth unavailable or busy');
        publish({busy:action});
        try{
            const result=await adapter[action](...args);
            if(action==='signIn'||action==='signOut'||action==='signUp'&&result.user)publish({user:result.user,recovery:false});
            if(action==='updatePassword')publish({recovery:false});
            return result;
        }catch{throw new Error('Auth request failed');}
        finally{publish({busy:null});}
    }
    return Object.freeze({
        getState:()=>state,
        subscribe(listener){listeners.add(listener);listener(state);return ()=>listeners.delete(listener);},
        initialize,
        signUp:(email,password)=>run('signUp',[email,password]),
        signIn:(email,password)=>run('signIn',[email,password]),
        signOut:()=>run('signOut',[]),
        requestPasswordReset:email=>run('requestPasswordReset',[email]),
        updatePassword:password=>run('updatePassword',[password]),
        dispose(){listeners.clear();adapter.dispose?.();}
    });
}
