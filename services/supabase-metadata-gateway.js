// Explicit RPC transport only. No repository planning, cache, mode or bootstrap.
function createSupabaseMetadataGateway({provider=getSharedSupabaseClientProvider()}={}){
    const contract=cosmifoldCloudContract,projection=cosmifoldCloudProjection;
    const rpc=Object.freeze({list:'cosmifold_list_universes',create:'cosmifold_create_universe',read:'cosmifold_read_universe',
        commit:'cosmifold_commit_metadata',receipt:'cosmifold_operation_receipt'});
    const mappings=Object.freeze({CM003:['REVISION_CONFLICT','REVISION_CONFLICT'],CM004:['INVALID_COMMAND','OPERATION_ID_REUSED'],
        CM005:['INVALID_METADATA','INVALID_METADATA'],CM006:['UNSUPPORTED_ATTACHMENTS','UNSUPPORTED_ATTACHMENTS'],CM007:['INVALID_COMMAND','UNIVERSE_ABSENT'],
        '28000':['UNAUTHENTICATED','UNAUTHENTICATED'],'42501':['FORBIDDEN','FORBIDDEN'],
        '22023':['INVALID_COMMAND','INVALID_COMMAND'],'22P02':['INVALID_COMMAND','INVALID_COMMAND'],'22003':['INVALID_COMMAND','REVISION_EXHAUSTED'],
        '23514':['INVALID_METADATA','INVALID_METADATA'],'23503':['INVALID_METADATA','INVALID_METADATA'],'23505':['INVALID_METADATA','INVALID_METADATA'],
        PGRST301:['UNAUTHENTICATED','UNAUTHENTICATED'],PGRST302:['UNAUTHENTICATED','UNAUTHENTICATED'],PGRST303:['UNAUTHENTICATED','UNAUTHENTICATED']});
    class GatewayError extends Error{
        constructor(code,reason,outcome='not-committed',context={}){
            super(`Cloud metadata gateway: ${code} (${reason}).`);this.name='CloudMetadataGatewayError';
            this.code=code;this.reason=reason;this.outcome=outcome;this.requiresReconciliation=outcome==='unknown';
            // Only safe correlation fields, never sessions, request content or raw SDK errors.
            for(const key of ['scope','operationId','baseRevision','universeId'])if(context[key]!=null)this[key]=context[key];
        }
    }
    const error=(code,reason,outcome,context)=>new GatewayError(code,reason,outcome,context);
    let client,subscription,actorId,generation=0,disposed=false;
    const uuid=value=>{contract.scope({ownerUserId:value,universeId:value});return value;};
    function keys(value,allowed,required=allowed){
        if(!value||typeof value!=='object'||Array.isArray(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!allowed.includes(key)))throw Error('Invalid RPC shape');
    }
    async function identity(){
        if(disposed)throw error('RPC_UNAVAILABLE','GATEWAY_DISPOSED');
        try{if(!client)client=await provider.getClient();}catch{throw error('AUTH_UNAVAILABLE','CLIENT_UNAVAILABLE');}
        if(!client)throw error('AUTH_UNAVAILABLE','NOT_CONFIGURED');
        try{if(!subscription)subscription=client.auth.onAuthStateChange((event,session)=>{
            const next=session?.user?.id||null;
            if(event==='SIGNED_OUT'||actorId!==undefined&&actorId!==next)generation++;
            actorId=next;
        }).data.subscription;}catch{throw error('AUTH_UNAVAILABLE','SESSION_UNAVAILABLE');}
        let result;try{result=await client.auth.getSession();}catch{throw error('AUTH_UNAVAILABLE','SESSION_UNAVAILABLE');}
        if(!result||result.error)throw error('AUTH_UNAVAILABLE','SESSION_UNAVAILABLE');
        const session=result.data?.session;
        if(!session?.access_token||!session.user?.id)throw error('UNAUTHENTICATED','NO_SESSION');
        try{uuid(session.user.id);}catch{throw error('UNAUTHENTICATED','INVALID_SESSION');}
        if(actorId!==undefined&&actorId!==session.user.id)generation++;
        actorId=session.user.id;
        return {id:actorId,generation};
    }
    function remoteError(response,write,context){
        const code=response?.error?.code,mapped=mappings[code];
        if(mapped)return error(mapped[0],mapped[1],'not-committed',context);
        if(['40001','40P01','57014'].includes(code))return error('TRANSACTION_ABORTED','TRANSACTION_ABORTED','not-committed',context);
        if(['PGRST106','PGRST202','PGRST203'].includes(code))return error('RPC_UNAVAILABLE',code,'not-committed',context);
        return error(write?'OUTCOME_UNKNOWN':'NETWORK_UNAVAILABLE','UNCLASSIFIED_RPC_FAILURE',write?'unknown':'not-committed',context);
    }
    async function invoke(name,params,owner,write,context,validate){
        let response;
        try{
            // Every RPC is POST, public, explicitly no automatic SDK retry.
            response=await client.schema('public').rpc(name,params).retry(false);
        }catch{throw error(write?'OUTCOME_UNKNOWN':'NETWORK_UNAVAILABLE','TRANSPORT_FAILURE',write?'unknown':'not-committed',context);}
        if(!response||response.error||!Number.isInteger(response.status)||response.status<200||response.status>=300)throw remoteError(response,write,context);
        let value;
        try{value=validate(contract.json(response.data,'rpc'));}
        catch{throw error(write?'INVALID_ACKNOWLEDGEMENT':'INVALID_RPC_RESPONSE','RESPONSE_VALIDATION_FAILED',write?'unknown':'not-committed',context);}
        let current;try{current=await identity();}catch{throw error(write?'OUTCOME_UNKNOWN':'SESSION_CHANGED','SESSION_CHANGED',write?'unknown':'not-committed',context);}
        if(current.id!==owner.id||current.generation!==owner.generation)throw error(write?'OUTCOME_UNKNOWN':'SESSION_CHANGED','SESSION_CHANGED',write?'unknown':'not-committed',context);
        return value;
    }
    async function owned(scope){
        const checked=contract.scope(scope),owner=await identity();
        if(checked.ownerUserId!==owner.id)throw error('FORBIDDEN','OWNER_MISMATCH','not-committed',{scope:checked});
        return {scope:checked,owner};
    }
    function metadata(value,scope){
        const checked=projection.validateRelational(value);
        if(checked.universe.id!==scope.universeId||checked.universe.owner_id!==scope.ownerUserId)throw Error('Wrong returned Universe');
        return checked;
    }
    function receiptAck(value,scope,operationId){
        keys(value,['scope','operationId','baseRevision','revision','status','replayed','result']);
        keys(value.scope,['ownerUserId','universeId']);
        if(value.scope.ownerUserId!==scope.ownerUserId||value.scope.universeId!==scope.universeId||value.operationId!==operationId||value.replayed!==true)throw Error('Wrong receipt identity');
        // A receipt has no original payload/type. Validate the common acknowledgement
        // invariants using a synthetic envelope; this does NOT verify its digest.
        return contract.acknowledgement(value,{scope,operationId,baseRevision:value.baseRevision,type:'items.changed',payload:{}});
    }
    return Object.freeze({
        async listOwnedUniverses(){
            const owner=await identity();
            return invoke(rpc.list,{},owner,false,{},value=>{
                if(!Array.isArray(value))throw Error('Invalid list');const ids=new Set();
                for(const row of value){keys(row,['id','owner_id','revision']);uuid(row.id);contract.revision(row.revision);
                    if(row.owner_id!==owner.id||ids.has(row.id))throw Error('Invalid owner/list');ids.add(row.id);}
                return value;
            });
        },
        async createUniverse(universeId){
            uuid(universeId);const owner=await identity(),scope=contract.scope({ownerUserId:owner.id,universeId});
            return invoke(rpc.create,{p_universe_id:universeId},owner,true,{scope,universeId},value=>metadata(value,scope));
        },
        async readUniverse(scope){
            const checked=await owned(scope);
            return invoke(rpc.read,{p_scope:checked.scope},checked.owner,false,{scope:checked.scope},value=>{
                keys(value,['status','metadata']);if(value.status==='absent'&&value.metadata===null)return value;
                if(value.status!=='found')throw Error('Invalid read status');return {...value,metadata:metadata(value.metadata,checked.scope)};
            });
        },
        async commitMetadata(request){
            const command=contract.command(request),checked=await owned(command.scope);
            return invoke(rpc.commit,{p_command:command},checked.owner,true,command,value=>contract.acknowledgement(value,command));
        },
        async getOperationReceipt(scope,operationId){
            uuid(operationId);const checked=await owned(scope);
            return invoke(rpc.receipt,{p_scope:checked.scope,p_operation_id:operationId},checked.owner,false,{scope:checked.scope,operationId},value=>{
                if(value?.status==='absent'||value?.status==='missing'){
                    keys(value,['status','acknowledgement']);if(value.acknowledgement!==null)throw Error('Invalid empty receipt');return value;
                }
                keys(value,['status','request_digest','acknowledgement']);
                if(value.status!=='found'||! /^[a-f0-9]{64}$/.test(value.request_digest))throw Error('Invalid receipt');
                return {status:'found',request_digest:value.request_digest,acknowledgement:receiptAck(value.acknowledgement,checked.scope,operationId)};
            });
        },
        dispose(){disposed=true;subscription?.unsubscribe();}
    });
}
