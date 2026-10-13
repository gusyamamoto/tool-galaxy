// Pure proposed row representation. Not loaded by the application; no SQL/SDK.
const cosmifoldCloudProjection = (()=>{
    const contract=cosmifoldCloudContract,fail=path=>contract.fail('INVALID_METADATA',path);
    const format='cosmifold-cloud-metadata',projectionVersion=1,storageVersion=5;
    const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
    const has=(value,key)=>Object.hasOwn(value,key);
    const id=(value,limit=100)=>typeof value==='string'&&!!value.trim()&&value.length<=limit;
    const timestamp=value=>typeof value==='string'&&!!value&&Number.isFinite(Date.parse(value));
    function fields(value,allowed,path){if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail(path);}
    function ordered(rows,path){
        if(!Array.isArray(rows))fail(path);
        const result=[...rows].sort((a,b)=>a?.ordinal-b?.ordinal);
        if(result.some((row,index)=>!object(row)||!Number.isSafeInteger(row.ordinal)||row.ordinal!==index))fail(path);
        return result;
    }
    const entryFields=['id','name','parentId','description','category','appearance','content','location','createdAt','updatedAt','x','y'];
    const attributeFields=entryFields.filter(key=>!['id','name','parentId','x','y'].includes(key));
    function validateStorageV5(input){
        const data=contract.json(input);
        if(data?.version!==storageVersion)contract.fail('UNSUPPORTED_VERSION','version');
        fields(data,['version','entries','connections','layout','portals','constellations','archivedGalaxies'],'metadata');
        if(!Array.isArray(data.entries)||!Array.isArray(data.layout)||has(data,'connections')&&(!Array.isArray(data.connections)||data.connections.length))fail('metadata');
        for(const key of ['portals','constellations','archivedGalaxies'])if(has(data,key)&&!Array.isArray(data[key]))fail(key);
        const entries=new Map();
        for(const [index,entry] of data.entries.entries()){
            const path='entries.'+index;fields(entry,entryFields,path);
            if(!id(entry.id)||entries.has(entry.id)||typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>60||
                has(entry,'parentId')&&entry.parentId!==null&&!id(entry.parentId))fail(path);
            if(has(entry,'description')&&(typeof entry.description!=='string'||entry.description.length>1000)||
                has(entry,'category')&&typeof entry.category!=='string')fail(path);
            for(const key of ['x','y'])if(has(entry,key)&&!Number.isFinite(entry[key]))fail(path+'.'+key);
            for(const key of ['createdAt','updatedAt'])if(has(entry,key)&&!timestamp(entry[key]))fail(path+'.'+key);
            if(has(entry,'appearance')&&!object(entry.appearance))fail(path+'.appearance');
            if(has(entry,'location')){
                fields(entry.location,['text'],path+'.location');const text=entry.location.text;
                if(typeof text!=='string'||!text||text!==text.trim()||text.length>1000||/[\u0000-\u001f\u007f]/.test(text))fail(path+'.location');
            }
            if(has(entry,'content')){
                const content=entry.content;fields(content,['version','notes','links','attachments'],path+'.content');
                if(!Array.isArray(content.attachments))fail(path+'.content.attachments');
                if(content.attachments.length)contract.fail('UNSUPPORTED_ATTACHMENTS',path+'.content.attachments');
                fields(content.notes,['format','text'],path+'.content.notes');
                if(content.version!==1||content.notes.format!=='plain'||typeof content.notes.text!=='string'||content.notes.text.length>100000||!Array.isArray(content.links))fail(path+'.content');
                const bookmarks=new Set();
                for(const link of content.links){
                    fields(link,['id','url','title'],path+'.content.links');
                    if(!id(link.id,150)||bookmarks.has(link.id)||typeof link.url!=='string'||link.url.length>2048||/[\u0000-\u001f\u007f]/.test(link.url)||has(link,'title')&&(typeof link.title!=='string'||link.title.length>200))fail(path+'.content.links');
                    try{const url=new URL(link.url);if(!['https:','http:'].includes(url.protocol)||!url.hostname)fail(path+'.content.links');}catch{fail(path+'.content.links');}
                    bookmarks.add(link.id);
                }
            }
            entries.set(entry.id,entry);
        }
        // Linear parent walk; derive roots without modifying any parent relationship.
        const roots=new Map();
        for(const start of entries.values()){
            const visiting=new Set(),path=[];let current=start;
            while(current&&!roots.has(current.id)){
                if(visiting.has(current.id))fail('entries.parentId');visiting.add(current.id);path.push(current);
                if(current.parentId!=null&&!entries.has(current.parentId))fail('entries.parentId');
                current=entries.get(current.parentId);
            }
            const root=current?roots.get(current.id):path.at(-1).id;path.forEach(entry=>roots.set(entry.id,root));
        }
        const identifiers=new Set(entries.keys()),pairs=new Map();
        for(const portal of data.portals||[]){
            fields(portal,['id','targetEntryId','parentEntryId','createdAt'],'portals');
            if(!id(portal.id,150)||identifiers.has(portal.id)||!entries.has(portal.targetEntryId)||!entries.has(portal.parentEntryId)||!timestamp(portal.createdAt))fail('portals');
            const targets=pairs.get(portal.parentEntryId)||new Set();if(targets.has(portal.targetEntryId))fail('portals');
            targets.add(portal.targetEntryId);pairs.set(portal.parentEntryId,targets);identifiers.add(portal.id);
        }
        for(const collection of data.constellations||[]){
            fields(collection,['id','name','memberEntryIds','createdAt','updatedAt'],'constellations');
            if(!id(collection.id,150)||identifiers.has(collection.id)||typeof collection.name!=='string'||!collection.name.trim()||collection.name!==collection.name.trim()||collection.name.length>60||
                !timestamp(collection.createdAt)||has(collection,'updatedAt')&&!timestamp(collection.updatedAt)||!Array.isArray(collection.memberEntryIds)||
                new Set(collection.memberEntryIds).size!==collection.memberEntryIds.length||collection.memberEntryIds.some(member=>!entries.has(member)))fail('constellations');
            identifiers.add(collection.id);
        }
        const archived=new Set();
        for(const record of data.archivedGalaxies||[]){
            fields(record,['galaxyId','archivedAt','expandedIds'],'archivedGalaxies');const root=entries.get(record.galaxyId);
            if(!root||root.parentId!=null||archived.has(root.id)||!timestamp(record.archivedAt)||has(record,'expandedIds')&&
                (!Array.isArray(record.expandedIds)||new Set(record.expandedIds).size!==record.expandedIds.length||record.expandedIds.some(member=>roots.get(member)!==root.id)))fail('archivedGalaxies');
            archived.add(root.id);
        }
        const placements=new Set();
        for(const placement of data.layout){
            fields(placement,['id','parentId','angle','radius'],'layout');const entry=entries.get(placement.id);
            if(!entry||placements.has(placement.id)||placement.parentId!==(entry.parentId??null)||!Number.isFinite(placement.angle)||!Number.isFinite(placement.radius)||placement.radius<0)fail('layout');
            placements.add(placement.id);
        }
        return data;
    }
    function toRelational(snapshot,scope){
        const data=validateStorageV5(snapshot),identity=contract.scope(scope),revision=contract.revision(scope.revision);
        const archives=new Map((data.archivedGalaxies||[]).map((record,ordinal)=>[record.galaxyId,{ordinal,...record}]));
        const metadata={format,projectionVersion,storageVersion,
            universe:{id:identity.universeId,owner_id:identity.ownerUserId,revision},
            // Representation flags preserve absent optional arrays/root parent fields.
            snapshot_fields:Object.fromEntries(['connections','portals','constellations','archivedGalaxies'].map(key=>[key,has(data,key)])),
            entries:data.entries.map((entry,ordinal)=>{
                const attributes_json=Object.fromEntries(attributeFields.filter(key=>has(entry,key)).map(key=>[key,entry[key]]));
                const row={universe_id:identity.universeId,id:entry.id,parent_id:entry.parentId??null,parent_id_present:has(entry,'parentId'),name:entry.name,ordinal,attributes_json};
                if(archives.has(entry.id)){const {galaxyId,...archive_json}=archives.get(entry.id);row.archive_json=archive_json;}
                return row;
            }),
            constellations:(data.constellations||[]).map((record,ordinal)=>({universe_id:identity.universeId,id:record.id,name:record.name,
                ordinal,created_at:record.createdAt,...(has(record,'updatedAt')?{updated_at:record.updatedAt}:{})})),
            constellation_members:(data.constellations||[]).flatMap(collection=>collection.memberEntryIds.map((entry_id,ordinal)=>({universe_id:identity.universeId,constellation_id:collection.id,entry_id,ordinal}))),
            linked_placements:(data.portals||[]).map((record,ordinal)=>({universe_id:identity.universeId,id:record.id,ordinal,
                target_entry_id:record.targetEntryId,parent_entry_id:record.parentEntryId,created_at:record.createdAt}))};
        const presentation={version:1,universe_id:identity.universeId,
            positions:data.entries.filter(entry=>has(entry,'x')||has(entry,'y')).map(entry=>({id:entry.id,...(has(entry,'x')?{x:entry.x}:{}),...(has(entry,'y')?{y:entry.y}:{})})),layout:data.layout};
        return {metadata,presentation};
    }
    function toStorageV5(input,sidecar=null){
        const data=contract.json(input);fields(data,['format','projectionVersion','storageVersion','universe','snapshot_fields','entries','constellations','constellation_members','linked_placements'],'projection');
        if(data.format!==format||data.projectionVersion!==projectionVersion||data.storageVersion!==storageVersion)contract.fail('UNSUPPORTED_VERSION','projection');
        fields(data.universe,['id','owner_id','revision'],'universe');contract.scope({universeId:data.universe.id,ownerUserId:data.universe.owner_id});contract.revision(data.universe.revision);
        fields(data.snapshot_fields,['connections','portals','constellations','archivedGalaxies'],'snapshot_fields');
        if(['connections','portals','constellations','archivedGalaxies'].some(key=>typeof data.snapshot_fields[key]!=='boolean'))fail('snapshot_fields');
        function scoped(row,allowed,path){fields(row,allowed,path);if(row.universe_id!==data.universe.id)fail(path+'.universe_id');}
        const archives=[],entries=ordered(data.entries,'entries').map(row=>{
            scoped(row,['universe_id','id','parent_id','parent_id_present','name','ordinal','attributes_json','archive_json'],'entries');
            fields(row.attributes_json,attributeFields,'entries.attributes_json');
            if(typeof row.parent_id_present!=='boolean'||!has(row,'parent_id')||!row.parent_id_present&&row.parent_id!==null)fail('entries.parent_id');
            if(has(row,'archive_json')){fields(row.archive_json,['ordinal','archivedAt','expandedIds'],'archive_json');const {ordinal,...record}=row.archive_json;archives.push({ordinal,galaxyId:row.id,...record});}
            return {id:row.id,name:row.name,...(row.parent_id_present?{parentId:row.parent_id}:{}),...row.attributes_json};
        });
        const members=new Map();
        if(!Array.isArray(data.constellation_members))fail('constellation_members');
        for(const row of data.constellation_members){
            scoped(row,['universe_id','constellation_id','entry_id','ordinal'],'constellation_members');
            const list=members.get(row.constellation_id)||[];list.push(row);members.set(row.constellation_id,list);
        }
        const collections=ordered(data.constellations,'constellations').map(row=>{
            scoped(row,['universe_id','id','name','created_at','updated_at','ordinal'],'constellations');
            const memberEntryIds=ordered(members.get(row.id)||[],'constellation_members').map(member=>member.entry_id);
            members.delete(row.id);return {id:row.id,name:row.name,createdAt:row.created_at,...(has(row,'updated_at')?{updatedAt:row.updated_at}:{}),memberEntryIds};
        });
        if(members.size)fail('constellation_members.constellation_id');
        const portals=ordered(data.linked_placements,'linked_placements').map(row=>{
            scoped(row,['universe_id','id','target_entry_id','parent_entry_id','created_at','ordinal'],'linked_placements');
            return {id:row.id,targetEntryId:row.target_entry_id,parentEntryId:row.parent_entry_id,createdAt:row.created_at};
        });
        const archivedGalaxies=ordered(archives,'archive_json').map(({ordinal,...record})=>record);
        const result={version:storageVersion,entries,layout:[]};
        for(const [key,value] of Object.entries({connections:[],portals,constellations:collections,archivedGalaxies})){
            if(!data.snapshot_fields[key]&&value.length)fail('snapshot_fields.'+key);
            if(data.snapshot_fields[key])result[key]=value;
        }
        if(sidecar!==null){
            const presentation=contract.json(sidecar,'presentation');fields(presentation,['version','universe_id','positions','layout'],'presentation');
            if(presentation.version!==1||presentation.universe_id!==data.universe.id||!Array.isArray(presentation.positions)||!Array.isArray(presentation.layout))fail('presentation');
            const byId=new Map(entries.map(entry=>[entry.id,entry])),seen=new Set();
            for(const position of presentation.positions){
                fields(position,['id','x','y'],'presentation.positions');const entry=byId.get(position.id);
                if(!entry||seen.has(position.id)||!has(position,'x')&&!has(position,'y'))fail('presentation.positions');
                seen.add(position.id);for(const key of ['x','y'])if(has(position,key))entry[key]=position[key];
            }
            result.layout=presentation.layout;
        }
        return validateStorageV5(result);
    }
    return Object.freeze({format,projectionVersion,storageVersion,validateStorageV5,toRelational,toStorageV5,
        validateRelational(metadata){toStorageV5(metadata);return contract.json(metadata);}});
})();
