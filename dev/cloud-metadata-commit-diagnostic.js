// Development-only Step-5 test; intentionally never imported by the normal app.
function createCloudMetadataCommitDiagnostic({location=globalThis.location,provider=getSharedSupabaseClientProvider(),
    gateway=createSupabaseMetadataGateway({provider}),randomUUID=()=>crypto.randomUUID(),report=()=>{},onTestIdentity=()=>{}}={}){
    const contract=cosmifoldCloudContract,changes=cosmifoldCloudChanges;
    const entry={id:'diagnostic-entry',name:'Cosmifold metadata commit test',parentId:null};
    let started=false,repository,subscription,current=true,identity,originalCommand;
    function fail(code){throw Object.assign(new Error(code),{code});}
    function sameAck(a,b){
        // Replay is the only expected difference from the first RPC reply.
        if(!changes.equal({...a,replayed:true},{...b,replayed:true}))fail('RECEIPT_ACKNOWLEDGEMENT_MISMATCH');
    }
    return Object.freeze({
        async run(){
            if(!['http:','https:'].includes(location.protocol)||!['localhost','127.0.0.1','[::1]'].includes(location.hostname))fail('LOCAL_DEVELOPMENT_ONLY');
            if(started)fail('DIAGNOSTIC_ALREADY_STARTED');started=true;
            const client=await provider.getClient();if(!client)fail('AUTH_NOT_CONFIGURED');
            const result=await client.auth.getSession(),session=result.data?.session;
            if(result.error||!session?.user?.id||!session.access_token)fail('SIGN_IN_LOCALLY_FIRST');
            identity={...contract.scope({ownerUserId:session.user.id,universeId:randomUUID()}),operationId:null};
            onTestIdentity(identity);report(`Disposable commit test Universe: ${identity.universeId}.`);
            subscription=client.auth.onAuthStateChange((event,next)=>{
                if(event==='SIGNED_OUT'||next?.user?.id!==identity.ownerUserId)current=false;
            }).data.subscription;
            const created=await gateway.createUniverse(identity.universeId);
            if(created.universe.owner_id!==identity.ownerUserId||created.universe.revision!=='0'||
                ['entries','constellations','constellation_members','linked_placements'].some(key=>created[key].length))fail('TEST_UNIVERSE_NOT_EMPTY');
            let originalAck,publications=0;
            // One real commit; deliberately withhold its already validated reply
            // once to exercise repository receipt reconciliation. No retry.
            const testGateway={readUniverse:scope=>gateway.readUniverse(scope),
                getOperationReceipt:(scope,id)=>gateway.getOperationReceipt(scope,id),
                async commitMetadata(command){
                    originalCommand=contract.command(command);identity={...identity,operationId:command.operationId};onTestIdentity(identity);
                    originalAck=await gateway.commitMetadata(command);
                    throw Object.assign(new Error('Diagnostic reply withheld'),{code:'OUTCOME_UNKNOWN',outcome:'unknown',requiresReconciliation:true});
                }};
            repository=createCloudUniverseRepository({scope:identity,gateway:testGateway,newOperationId:randomUUID,isCurrent:()=>current});
            repository.subscribe(()=>publications++);
            const opened=await repository.open();if(opened.status!=='found'||opened.revision!=='0')fail('INITIAL_REVISION_NOT_ZERO');
            report('PASS: initial read returned an empty Universe at revision 0.');
            const candidate=repository.load();candidate.entries=[{...entry}];
            await repository.save(candidate,{type:'items.created',ids:[entry.id]});
            if(repository.revision()!=='1'||publications!==1)fail('COMMIT_NOT_ACKNOWLEDGED_ONCE');
            report('PASS: one small semantic commit became revision 1; its withheld reply was reconciled through the real receipt RPC.');
            const read=await gateway.readUniverse(identity);
            if(read.status!=='found'||read.metadata.universe.revision!=='1'||!changes.equal(cosmifoldCloudProjection.toStorageV5(read.metadata),candidate))fail('COMMITTED_READ_MISMATCH');
            report('PASS: read sees exactly the committed test metadata at revision 1.');
            const receipt=await gateway.getOperationReceipt(identity,originalCommand.operationId);
            if(receipt.status!=='found')fail('RECEIPT_NOT_FOUND');
            const receiptAck=contract.acknowledgement(receipt.acknowledgement,originalCommand);sameAck(originalAck,receiptAck);
            report('PASS: operation receipt exists and matches the original operation/revision.');
            const repeated=await repository.reconcile();sameAck(receiptAck,repeated);
            if(publications!==1||repository.revision()!=='1')fail('RECONCILIATION_APPLIED_TWICE');
            report('PASS: repeated reconciliation returns the same acknowledgement without a second semantic mutation or publication.');
            const stale=contract.command({...originalCommand,operationId:randomUUID(),payload:{upsert:{entries:[{
                ...originalCommand.payload.upsert.entries[0],name:'Stale change must not be saved'}]}}});
            try{await gateway.commitMetadata(stale);fail('STALE_WRITE_ACCEPTED');}
            catch(error){if(error.code!=='REVISION_CONFLICT'||error.outcome!=='not-committed')throw error;}
            const after=await gateway.readUniverse(identity);
            if(after.status!=='found'||!changes.equal(after.metadata,read.metadata))fail('STALE_WRITE_CHANGED_METADATA');
            report('PASS: deliberately stale base revision 0 was rejected; metadata and revision 1 are unchanged.');
            report('COMPLETE: commit/receipt diagnostic passed. Only this disposable Universe was modified; no local Cosmos was uploaded.');
            return {...identity,revision:'1'};
        },
        dispose(){current=false;repository?.dispose();subscription?.unsubscribe();gateway.dispose();}
    });
}

function cloudMetadataCommitDiagnosticCleanup({ownerUserId,universeId,operationId=null}){
    cosmifoldCloudContract.scope({ownerUserId,universeId});
    if(operationId!==null)cosmifoldCloudContract.scope({ownerUserId:operationId,universeId});
    // Static fixture + validated UUIDs only. No local user strings reach SQL.
    const operation=operationId===null?'null':`'${operationId}'::uuid`;
    return `begin;
do $$
declare target uuid := '${universeId}'::uuid;
        expected_owner uuid := '${ownerUserId}'::uuid;
        expected_operation uuid := ${operation};
        current_revision bigint;
begin
  select revision into current_revision from cosmifold_private.universes
    where id = target and owner_id = expected_owner for update;
  if not found then raise exception 'Test Universe absent or owner mismatch; nothing deleted'; end if;
  if exists (select 1 from cosmifold_private.constellations where universe_id = target)
     or exists (select 1 from cosmifold_private.constellation_members where universe_id = target)
     or exists (select 1 from cosmifold_private.linked_placements where universe_id = target)
  then raise exception 'Unexpected test data; nothing deleted'; end if;
  if current_revision = 0 then
    if exists (select 1 from cosmifold_private.entries where universe_id = target)
       or exists (select 1 from cosmifold_private.operation_receipts where universe_id = target)
    then raise exception 'Nonempty revision-zero Universe; nothing deleted'; end if;
  elsif current_revision = 1 then
    if (select count(*) from cosmifold_private.entries where universe_id = target) <> 1
       or not exists (select 1 from cosmifold_private.entries where universe_id = target
         and id = 'diagnostic-entry' and name = 'Cosmifold metadata commit test'
         and parent_id is null and parent_id_present and ordinal = 0
         and attributes_json = '{}'::jsonb and archive_json is null)
       or (select count(*) from cosmifold_private.operation_receipts where universe_id = target) <> 1
       or not exists (select 1 from cosmifold_private.operation_receipts where universe_id = target
         and operation_id = expected_operation and base_revision = 0 and resulting_revision = 1)
    then raise exception 'Test state differs from expected fixture; nothing deleted'; end if;
  else raise exception 'Unexpected test revision; nothing deleted'; end if;
  delete from cosmifold_private.operation_receipts where universe_id = target;
  delete from cosmifold_private.entries where universe_id = target;
  delete from cosmifold_private.universes where id = target and owner_id = expected_owner;
  raise notice 'Removed the exact disposable metadata commit test Universe';
end;
$$;
select not exists (select 1 from cosmifold_private.universes where id = '${universeId}'::uuid) as test_universe_removed;
commit;`;
}
