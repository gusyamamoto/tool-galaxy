// Central SDK loading/configuration shared by Auth and the metadata gateway.
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
function createSupabaseClientProvider({config=cosmifoldAuthConfig,loadSDK=loadSupabaseAuthSDK}={}){
    let settings,configurationError,client,loading;
    try{settings=readPublicAuthConfiguration(config);}catch(error){configurationError=error;}
    return Object.freeze({
        available:!!settings||!!configurationError,
        async getClient(){
            if(configurationError)throw configurationError;
            if(!settings)return null;
            if(!loading)loading=(async()=>{
                const sdk=await loadSDK();
                client=sdk.createClient(settings.url,settings.key,{auth:{persistSession:true,autoRefreshToken:true,
                    detectSessionInUrl:true,flowType:'pkce'}});
                return client;
            })().catch(error=>{loading=null;throw error;});
            return loading;
        },
        // Only the provider owner tears down a shared client. Adapter/gateway
        // disposal merely removes their subscriptions; it cannot stop each other.
        dispose(){const result=client?.auth.stopAutoRefresh();if(result?.catch)result.catch(()=>{});}
    });
}
let sharedSupabaseClientProvider;
function getSharedSupabaseClientProvider(){
    return sharedSupabaseClientProvider||(sharedSupabaseClientProvider=createSupabaseClientProvider());
}
