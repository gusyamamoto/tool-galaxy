// Identity-only Auth adapter. The shared provider owns the SDK client.
function createSupabaseAuthAdapter({config=cosmifoldAuthConfig,loadSDK=loadSupabaseAuthSDK,
    location=globalThis.location,history=globalThis.history,disabled=false,provider=null}={}) {
    const owned=!provider&&(config!==cosmifoldAuthConfig||loadSDK!==loadSupabaseAuthSDK);
    const clientProvider=provider||(owned?createSupabaseClientProvider({config,loadSDK}):getSharedSupabaseClientProvider());
    let client,subscription,initializing;
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
        available:!disabled&&clientProvider.available,
        async initialize(onChange){
            if(disabled||!clientProvider.available)return {user:null};
            if(!initializing)initializing=(async()=>{
                if(!client)client=await clientProvider.getClient();
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
        dispose(){subscription?.unsubscribe();if(owned)clientProvider.dispose();}
    };
}
