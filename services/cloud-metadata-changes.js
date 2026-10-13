// Pure deterministic Step-2 projections -> installed Step-3 RPC patch payload.
const cosmifoldCloudChanges=(()=>{
    const contract=cosmifoldCloudContract,projection=cosmifoldCloudProjection;
    // Equality only, NOT PostgreSQL's request digest serialization.
    const canonical=value=>JSON.stringify(value,(_key,node)=>node&&typeof node==='object'&&!Array.isArray(node)
        ?Object.fromEntries(Object.keys(node).sort().map(key=>[key,node[key]])):node);
    function between(before,after){
        before=projection.validateRelational(before);after=projection.validateRelational(after);
        if(canonical(before.universe)!==canonical(after.universe))contract.fail('INVALID_COMMAND','changes.scope/revision');
        const upsert={},remove={};
        for(const relation of ['entries','constellations','constellation_members','linked_placements']){
            const member=relation==='constellation_members';
            const key=row=>member?JSON.stringify([row.constellation_id,row.entry_id]):row.id;
            const old=new Map(before[relation].map(row=>[key(row),row])),next=new Map(after[relation].map(row=>[key(row),row]));
            const additions=after[relation].filter(row=>!old.has(key(row))||canonical(old.get(key(row)))!==canonical(row));
            const removals=before[relation].filter(row=>!next.has(key(row))).map(row=>member
                ?{constellation_id:row.constellation_id,entry_id:row.entry_id}:row.id);
            if(additions.length)upsert[relation]=additions;if(removals.length)remove[relation]=removals;
        }
        return {...(Object.keys(upsert).length?{upsert}:{}),...(Object.keys(remove).length?{delete:remove}:{}),
            ...(canonical(before.snapshot_fields)!==canonical(after.snapshot_fields)?{snapshot_fields:after.snapshot_fields}:{})};
    }
    return Object.freeze({between,equal:(a,b)=>canonical(a)===canonical(b)});
})();
