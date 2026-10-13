// The only module that knows the Supabase SDK. No Cosmos repository access.
const supabaseAuthSDK = Object.freeze({
    version: '2.117.3',
    url: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js',
    integrity: 'sha384-BWcjm9OdFth9TbhCxZPdm+gAOUMAzQy9nmTs12ioXdCcbVnJaPMn+fMUoQCLt60R'
});
let supabaseAuthSDKPromise;
function loadSupabaseAuthSDK() {
    if (!supabaseAuthSDKPromise) {
        supabaseAuthSDKPromise = new Promise((resolve,reject)=>{
            const script=document.createElement('script');
            script.src=supabaseAuthSDK.url;script.integrity=supabaseAuthSDK.integrity;script.crossOrigin='anonymous';
            const timer=setTimeout(()=>finish(new Error('Auth library unavailable')),15000);
            function finish(error){
                clearTimeout(timer);script.onload=script.onerror=null;
                if(error){script.remove();reject(error);}else resolve(globalThis.supabase);
            }
            script.onload=()=>finish(globalThis.supabase?.createClient?null:new Error('Auth library unavailable'));
            script.onerror=()=>finish(new Error('Auth library unavailable'));
            document.head.append(script);
        }).catch(error=>{supabaseAuthSDKPromise=null;throw error;});
    }
    return supabaseAuthSDKPromise;
}
function readPublicAuthConfiguration(config) {
    if(!config?.SUPABASE_URL&&!config?.SUPABASE_PUBLISHABLE_KEY)return null;
    const url=new URL(config.SUPABASE_URL);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||
        !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.SUPABASE_PUBLISHABLE_KEY||''))throw new Error('Invalid public Auth configuration');
    return {url:url.origin,key:config.SUPABASE_PUBLISHABLE_KEY};
}
function createSupabaseAuthAdapter({config=cosmifoldAuthConfig,loadSDK=loadSupabaseAuthSDK,
    location=globalThis.location,history=globalThis.history,disabled=false}={}) {
    let settings,configurationError,client,subscription,initializing;
    try{settings=disabled?null:readPublicAuthConfiguration(config);}catch(error){configurationError=error;}
    const identity=session=>session?.user&&session.access_token?{id:session.user.id,email:session.user.email||''}:null;
    // The SDK does the PKCE exchange and URL detection. Only a successful callback
    // event permits cleanup here; unrelated query parameters and fragments survive.
    const callbackURL=location?new URL(location.href):null;
    const hasCallback=callbackURL?.searchParams.has('code')||/^#(?:access_token|error)=/.test(callbackURL?.hash||'');
    function cleanCallback(event){
        if(!hasCallback||!['SIGNED_IN','PASSWORD_RECOVERY'].includes(event)||!history)return;
        const url=new URL(location.href);
        for(const key of ['code','error','error_code','error_description'])url.searchParams.delete(key);
        const hash=new URLSearchParams(url.hash.slice(1));
        if(hash.has('access_token')||hash.has('error')){
            for(const key of ['access_token','refresh_token','expires_in','expires_at','token_type','type','error','error_code','error_description'])hash.delete(key);
            url.hash=hash.toString();
        }
        history.replaceState(history.state,'',url.pathname+url.search+url.hash);
    }
    const checked=result=>{if(result.error)throw new Error('Auth request failed');return result.data;};
    const redirectTo=()=>new URL('./',location.href).href;
    return {
        available:!!settings||!!configurationError,
        async initialize(onChange){
            if(configurationError)throw configurationError;
            if(!settings)return {user:null};
            if(!initializing)initializing=(async()=>{
                if(!client){
                    const sdk=await loadSDK();
                    client=sdk.createClient(settings.url,settings.key,{auth:{persistSession:true,autoRefreshToken:true,
                        detectSessionInUrl:true,flowType:'pkce'}});
                }
                if(!subscription)subscription=client.auth.onAuthStateChange((event,session)=>{
                    // Never await or call another Auth method from this SDK callback.
                    cleanCallback(event);onChange({event,user:identity(session)});
                }).data.subscription;
                return {user:identity(checked(await client.auth.getSession()).session)};
            // Retain the single SDK client/subscription if session recovery fails.
            // A retry must not start a second refresh timer against the same store.
            })().catch(error=>{initializing=null;throw error;});
            return initializing;
        },
        async signUp(email,password){
            const data=checked(await client.auth.signUp({email,password,options:{emailRedirectTo:redirectTo()}}));
            return {user:identity(data.session),confirmationRequired:!data.session};
        },
        async signIn(email,password){
            const user=identity(checked(await client.auth.signInWithPassword({email,password})).session);
            if(!user)throw new Error('No active Auth session');return {user};
        },
        async signOut(){checked(await client.auth.signOut({scope:'local'}));return {user:null};},
        async requestPasswordReset(email){checked(await client.auth.resetPasswordForEmail(email,{redirectTo:redirectTo()}));},
        async updatePassword(password){checked(await client.auth.updateUser({password}));},
        dispose(){subscription?.unsubscribe();client?.auth.stopAutoRefresh();}
    };
}
