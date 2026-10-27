// Read-only projections of canonical entries. Calendar strings never pass through UTC.
const cosmosTime = (() => {
    const palette=['#a7c7fa','#e8b98a','#bcb2ef','#8bd0c0','#e5a9c5','#c9cd8a','#9bcfdf','#d2bba9'];
    const families={
        travel:/\b(travel|trip|vacation|flight|holiday|journey)\b/i,
        education:/\b(school|class|course|study|university|exam|college|education)\b/i,
        technology:/\b(technology|code|software|dev|coding|programming)\b/i,
        work:/\b(work|office|client|job|project|business)\b/i,
        home:/\b(home|house|apartment)\b/i, health:/\b(health|doctor|dentist|medical)\b/i,
        fitness:/\b(fitness|gym|run|workout)\b/i, food:/\b(food|recipe|restaurant|cooking)\b/i,
        finance:/\b(finance|budget|bank|money)\b/i, music:/\b(music|guitar|piano)\b/i,
        shopping:/\b(shopping|buy|groceries)\b/i, social:/\b(social|friends|family|party)\b/i,
        creative:/\b(creative|art|design|drawing|writing)\b/i,
        exploration:/\b(exploration|explore|hike|adventure)\b/i
    };
    function hash(value){let h=2166136261;for(const char of String(value)){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
    function localDate(value){const [y,m,d]=value.split('-').map(Number),date=new Date(0);date.setFullYear(y,m-1,d);date.setHours(12,0,0,0);return date;}
    function key(date){return `${String(date.getFullYear()).padStart(4,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
    function addDays(value,n){const date=localDate(value);date.setDate(date.getDate()+n);return key(date);}
    function shiftMonth(value,n){const date=localDate(value);date.setDate(1);date.setMonth(date.getMonth()+n);return key(date);}
    function classify(anchor){const name=`${anchor.name||''} ${anchor.category||''}`;return Object.keys(families).find(family=>families[family].test(name))||'general';}
    function anchor(entries,entry){
        // Tasks enter through their owning list; normal items enter through themselves.
        let current=entries.get(entry.parentId)?.taskList===true?entries.get(entry.parentId):entry;
        const visited=new Set();
        while(current&&entries.has(current.parentId)&&!visited.has(current.id)){
            visited.add(current.id);const parent=entries.get(current.parentId);
            if(!entries.has(parent.parentId))return current; // highest branch under a Galaxy
            current=parent;
        }
        return current||entry;
    }
    function context(entries,entry){const root=anchor(entries,entry),identity=root.id||entry.id;return {id:identity,label:root.name||'Universe',family:classify(root),variant:hash(identity)%3,color:palette[hash(`color:${identity}`)%palette.length]};}
    const lexical=(a,b)=>a<b?-1:a>b?1:0;
    const compare=(a,b)=>lexical(a.start,b.start)||lexical(a.time||'~',b.time||'~')||lexical(a.id,b.id);
    function aggregate(entries){
        const result=[],contexts=new Map();
        for(const entry of entries.values()){
            if(entry.taskList===true)continue;
            const task=entries.get(entry.parentId)?.taskList===true,value=task?entry.due:entry.when;
            if(!value)continue;
            const start=task?value.date:value.startDate,end=(!task&&value.endDate)||start;
            const root=anchor(entries,entry);
            if(!contexts.has(root.id))contexts.set(root.id,context(entries,entry));
            result.push({id:entry.id,title:entry.name,start,end,time:value.time||null,range:!task&&!!value.endDate,task,completed:task&&entry.completed===true,context:contexts.get(root.id)});
        }
        return result.sort(compare);
    }
    function upcoming(events,today){return events.filter(event=>!event.completed&&event.end>=today).sort((a,b)=>{
        const aDate=a.start<today?today:a.start,bDate=b.start<today?today:b.start;
        return lexical(aDate,bDate)||lexical(a.time||'~',b.time||'~')||lexical(a.start,b.start)||lexical(a.id,b.id);
    });}
    function onDay(events,day){return events.filter(event=>event.start<=day&&day<=event.end);}
    function firstWeekday(locale){try{const l=new Intl.Locale(locale||new Intl.DateTimeFormat().resolvedOptions().locale);return (l.getWeekInfo?.()||l.weekInfo)?.firstDay%7||0;}catch{return 0;}}
    function month(value,weekStart=firstWeekday()){
        const first=value.slice(0,7)+'-01',date=localDate(first),start=addDays(first,-((date.getDay()-weekStart+7)%7));
        const end=localDate(first);end.setMonth(end.getMonth()+1,0);
        const count=Math.ceil((((date.getDay()-weekStart+7)%7)+end.getDate())/7),weeks=[];
        for(let index=0;index<count;index++)weeks.push(Array.from({length:7},(_,i)=>addDays(start,index*7+i)));
        return weeks;
    }
    function segments(events,days){return events.filter(e=>e.range&&e.start<=days[6]&&e.end>=days[0]).map(event=>({event,start:Math.max(0,days.findIndex(d=>d>=event.start)),end:days.reduce((last,d,i)=>d<=event.end?i:last,0),before:event.start<days[0],after:event.end>days[6]}));}
    function dateLabel(value,locale){return localDate(value).toLocaleDateString(locale,{month:'short',day:'numeric'});}
    function relative(value,today,locale){return value===today?'Today':value===addDays(today,1)?'Tomorrow':dateLabel(value,locale);}
    function clock(value,locale){if(!value)return '';const date=localDate('2000-01-01');date.setHours(...value.split(':').map(Number));return date.toLocaleTimeString(locale,{hour:'numeric',minute:'2-digit'});}
    return {palette,hash,localDate,key,addDays,shiftMonth,classify,anchor,context,aggregate,upcoming,onDay,firstWeekday,month,segments,dateLabel,relative,clock};
})();
if(typeof module!=='undefined')module.exports=cosmosTime;
