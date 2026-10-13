// Deterministic provider fixture. These session markers are not credentials.
function createFakeAuthAdapter({storage=null,storageKey='test:auth-session',user=null,available=true}={}){
    let current=user,listener,confirmationRequired=true,nextFailure=false,nextDelay=null;
    const calls=[];
    if(storage?.getItem(storageKey))current=JSON.parse(storage.getItem(storageKey)).user;
    function emit(event,identity){
        current=identity;
        if(storage){if(identity)storage.setItem(storageKey,JSON.stringify({user:identity,access_token:'TEST_ONLY_ACCESS_MARKER',refresh_token:'TEST_ONLY_REFRESH_MARKER',verifier:'TEST_ONLY_PKCE_MARKER'}));else storage.removeItem(storageKey);}
        listener?.({event,user:identity});
    }
    async function call(name){calls.push(name);const delay=nextDelay;nextDelay=null;if(delay)await delay.promise;if(nextFailure){nextFailure=false;throw new Error('Mock network rejection');}}
    return {
        available,calls,emit,
        setConfirmationRequired(value){confirmationRequired=value;},
        rejectNext(){nextFailure=true;},
        delayNext(){let resolve;nextDelay={promise:new Promise(r=>{resolve=r;})};return resolve;},
        async initialize(callback){await call('initialize');listener=callback;return {user:current};},
        async signUp(email){await call('signUp');if(confirmationRequired)return {user:null,confirmationRequired:true};const user={id:'fixture-'+email,email};emit('SIGNED_IN',user);return {user,confirmationRequired:false};},
        async signIn(email){await call('signIn');const user={id:'fixture-'+email,email};emit('SIGNED_IN',user);return {user};},
        async signOut(){await call('signOut');emit('SIGNED_OUT',null);return {user:null};},
        async requestPasswordReset(){await call('requestPasswordReset');},
        async updatePassword(){await call('updatePassword');emit('USER_UPDATED',current);},
        dispose(){listener=null;}
    };
}
