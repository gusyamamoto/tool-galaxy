const test=require('node:test'),assert=require('node:assert/strict');
const time=require('../time-view-model.js');
const when=(start,end=null,clock=null)=>({startDate:start,endDate:end,time:clock});
function fixture(){return new Map([
    {id:'g',name:'Galaxy',parentId:null},
    {id:'travel-a',name:'Japan Trip',parentId:'g'},
    {id:'travel-b',name:'Mexico Trip',parentId:'g'},
    {id:'branch',name:'Reservations',parentId:'travel-a'},
    {id:'item',name:'Hotel',parentId:'branch',when:when('2026-10-28',null,'14:30')},
    {id:'list',name:'Checklist',taskList:true,parentId:'branch'},
    {id:'task',name:'Book ticket',parentId:'list',due:{date:'2026-10-29',time:'09:00'}},
    {id:'done',name:'Passport',parentId:'list',completed:true,due:{date:'2026-10-29',time:null}},
    {id:'past-task',name:'Old task',parentId:'list',due:{date:'2026-10-27',time:null}},
    {id:'range',name:'Ongoing trip',parentId:'travel-a',when:when('2026-10-25','2026-11-03')},
    {id:'past',name:'Old trip',parentId:'travel-a',when:when('2026-10-01','2026-10-03')},
    {id:'undated',name:'No date',parentId:'g'}
].map(entry=>[entry.id,entry]));}
test('canonical aggregation includes dated Items and individual Due Tasks only',()=>{
    const entries=fixture(),before=JSON.stringify([...entries]),events=time.aggregate(entries);
    assert.equal(events.length,6);assert.ok(events.find(e=>e.id==='item'));assert.ok(events.find(e=>e.id==='task').task);
    assert.ok(!events.find(e=>['list','undated'].includes(e.id)));assert.equal(JSON.stringify([...entries]),before);
});
test('completed tasks remain on Calendar; past entries remain in their dates',()=>{
    const events=time.aggregate(fixture());assert.ok(time.onDay(events,'2026-10-29').find(e=>e.id==='done').completed);
    assert.ok(time.onDay(events,'2026-10-27').find(e=>e.id==='past-task'));
    assert.ok(time.onDay(events,'2026-10-02').find(e=>e.id==='past'));
});
test('Upcoming excludes completed, past normal Items and undated; retains overdue tasks and ongoing ranges',()=>{
    assert.deepEqual(time.upcoming(time.aggregate(fixture()),'2026-10-28').map(e=>e.id),['past-task','item','range','task']);
});
test('overdue requires an incomplete canonical task with a past Due, not a dormant normal Item Due',()=>{
    const entries=fixture();entries.get('past').due={date:'2026-10-01',time:null};
    entries.get('done').due.date='2026-10-01';
    const events=time.aggregate(entries),today='2026-10-28',before=JSON.stringify(events);
    assert.deepEqual(events.filter(e=>time.isOverdue(e,today)).map(e=>e.id),['past-task']);
    assert.equal(time.isOverdue(events.find(e=>e.id==='item'),today),false);
    assert.equal(time.isOverdue(events.find(e=>e.id==='task'),today),false);
    assert.equal(time.isOverdue(events.find(e=>e.id==='done'),today),false);
    time.upcoming(events,today);assert.equal(JSON.stringify(events),before);
    assert.ok(events.every(e=>!Object.hasOwn(e,'overdue')));
});
test('Due today is never overdue, even with an early clock; the next local date makes it overdue',()=>{
    const events=time.aggregate(fixture()),task=events.find(e=>e.id==='task');task.time='00:01';
    assert.equal(time.isOverdue(task,'2026-10-29'),false);
    assert.equal(time.isOverdue(task,'2026-10-30'),true);
    assert.ok(time.upcoming(events,'2026-10-29').includes(task));
});
test('overdue group sorts by original Due before Today, Tomorrow and future chronology',()=>{
    const entries=fixture();entries.set('older',{id:'older',name:'Older',parentId:'list',due:{date:'2026-09-30',time:'17:00'}});
    entries.set('tomorrow',{id:'tomorrow',name:'Tomorrow',when:when('2026-10-29',null,'08:00')});
    assert.deepEqual(time.upcoming(time.aggregate(entries),'2026-10-28').map(e=>e.id),['older','past-task','item','range','tomorrow','task']);
});
test('completion, rescheduling and removal recompute Upcoming without stale overdue state',()=>{
    const entries=fixture(),task=entries.get('past-task'),today='2026-10-28';
    const upcoming=()=>time.upcoming(time.aggregate(entries),today);
    assert.equal(upcoming()[0].id,task.id);
    task.completed=true;assert.ok(!upcoming().some(e=>e.id===task.id));
    assert.ok(time.onDay(time.aggregate(entries),'2026-10-27').some(e=>e.id===task.id&&e.completed));
    task.completed=false;assert.equal(upcoming()[0].id,task.id);
    task.due={date:'2026-11-03',time:null};assert.equal(upcoming().at(-1).id,task.id);
    assert.equal(time.isOverdue(upcoming().at(-1),today),false);
    task.due=null;assert.ok(!time.aggregate(entries).some(e=>e.id===task.id));
});
test('overdue date-only comparisons retain year and leap-day boundaries across local zones',()=>{
    const previous=process.env.TZ;
    try{for(const zone of ['America/Vancouver','Pacific/Auckland','Asia/Tokyo','UTC']){
        process.env.TZ=zone;
        for(const [due,today] of [['2026-12-31','2027-01-01'],['2028-02-29','2028-03-01']]){
            const event={task:true,completed:false,start:due};
            assert.equal(time.isOverdue(event,time.key(time.localDate(due))),false);
            assert.equal(time.isOverdue(event,time.key(time.localDate(today))),true);
        }
    }}finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
test('timed entries precede date-only with deterministic ID ties and no input mutation',()=>{
    const entries=new Map(['z','c','b','a'].map(id=>[id,{id,name:id,parentId:null,when:when('2026-10-28',null,id==='z'?null:id==='c'?'15:00':'09:00')}]));
    assert.deepEqual(time.aggregate(entries).map(e=>e.id),['a','b','c','z']);
    assert.deepEqual(time.upcoming(time.aggregate(entries),'2026-10-28').map(e=>e.id),['a','b','c','z']);
});
for(const [name,start,end,today,included] of [
    ['one week','2026-10-20','2026-10-22','2026-10-20',true],
    ['cross week','2026-10-23','2026-10-28','2026-10-26',true],
    ['cross month','2026-10-25','2026-11-03','2026-10-28',true],
    ['past','2026-10-01','2026-10-03','2026-10-28',false],
    ['starts today','2026-10-28','2026-11-01','2026-10-28',true],
    ['ends today','2026-10-01','2026-10-28','2026-10-28',true],
    ['same day','2026-10-28','2026-10-28','2026-10-28',true]
])test(`inclusive range: ${name}`,()=>{
    const events=time.aggregate(new Map([['r',{id:'r',name:'Range',when:when(start,end)}]]));
    assert.equal(time.onDay(events,start).length,1);assert.equal(time.onDay(events,end).length,1);
    assert.equal(time.onDay(events,time.addDays(start,-1)).length,0);assert.equal(time.onDay(events,time.addDays(end,1)).length,0);
    assert.equal(time.upcoming(events,today).length,included?1:0);
    for(const days of time.month(start,0)){for(const segment of time.segments(events,days)){
        const actual=days.slice(segment.start,segment.end+1);assert.ok(actual.every(day=>day>=start&&day<=end));
        assert.equal(segment.before,start<days[0]);assert.equal(segment.after,end>days[6]);
    }}
});
test('range segments cover every date across weeks and months exactly once',()=>{
    const event={id:'range',range:true,start:'2026-10-25',end:'2026-11-03'};
    const covered=time.month('2026-10-01',0).flatMap(days=>time.segments([event],days).flatMap(s=>days.slice(s.start,s.end+1)));
    assert.deepEqual(covered,Array.from({length:7},(_,i)=>time.addDays(event.start,i)));
    const november=time.month('2026-11-01',0).flatMap(days=>time.segments([event],days).flatMap(s=>days.slice(s.start,s.end+1)));
    assert.deepEqual(november,['2026-11-01','2026-11-02','2026-11-03']);
});
test('context is highest branch below Galaxy; Tasks derive it through their owning list',()=>{
    const entries=fixture();for(const id of ['item','task','done','travel-a'])assert.equal(time.anchor(entries,entries.get(id)).id,'travel-a');
    assert.equal(time.anchor(entries,entries.get('g')).id,'g');
    assert.equal(time.context(entries,{id:'orphan',name:'Unknown',parentId:'absent'}).family,'general');
});
test('context family, variant and palette are stable; rename preserves identity style',()=>{
    const entries=fixture(),first=time.context(entries,entries.get('item'));
    assert.equal(first.family,'travel');assert.deepEqual(time.context(fixture(),fixture().get('task')),first);
    entries.get('travel-a').name='Brazil vacation';const renamed=time.context(entries,entries.get('item'));
    assert.equal(renamed.variant,first.variant);assert.equal(renamed.color,first.color);assert.equal(renamed.family,'travel');
    const second=time.context(entries,entries.get('travel-b'));assert.equal(second.family,'travel');
    assert.notEqual(second.variant,first.variant);assert.notEqual(second.color,first.color);
    assert.ok(time.palette.includes(first.color));
});
test('context classification recognizes named families and falls back to general',()=>{
    for(const [name,family] of [['School','education'],['Software project','technology'],['Client project','work'],['Dentist','health'],['Music','music'],['Unclear','general']])assert.equal(time.classify({name}),family);
});
test('dormant When/Due uses current Task architecture, excludes Task Lists, no duplicates',()=>{
    const entries=fixture();entries.get('task').when=when('2026-12-01');entries.get('item').due={date:'2026-12-01'};entries.get('list').when=when('2026-12-01');
    const events=time.aggregate(entries);assert.equal(events.filter(e=>e.id==='task').length,1);assert.equal(events.find(e=>e.id==='task').start,'2026-10-29');assert.equal(events.find(e=>e.id==='item').start,'2026-10-28');
});
for(const [value,days] of [['2026-02-01',28],['2028-02-01',29],['2026-04-01',30],['2026-01-01',31],['9999-12-01',31],['0001-01-01',31]])test(`month grid and locale alignment: ${value}`,()=>{
    for(const start of [0,1,6]){const weeks=time.month(value,start);assert.ok(weeks.length>=4&&weeks.length<=6);assert.ok(weeks.every(w=>w.length===7&&time.localDate(w[0]).getDay()===start));assert.equal(weeks.flat().filter(d=>d.startsWith(value.slice(0,7))).length,days);}
});
test('palette, text and focus accents have contrast independent of context hue',()=>{
    const luminance=hex=>{const c=hex.match(/[a-f\d]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
    const background=luminance('#101a28');
    for(const color of [...time.palette,'#dce6f2','#a3b6cc','#b2d2fa'])assert.ok((luminance(color)+.05)/(background+.05)>=4.5,color);
});
test('year transition, leap February and local clock/date survive DST in multiple zones',()=>{
    const previous=process.env.TZ;
    try{for(const zone of ['America/Vancouver','Pacific/Auckland','Asia/Tokyo','UTC']){
        process.env.TZ=zone;assert.equal(time.shiftMonth('2026-12-01',1),'2027-01-01');assert.equal(time.shiftMonth('2027-01-01',-1),'2026-12-01');
        for(const day of ['2026-03-08','2026-11-01','2028-02-29','0001-01-01','9999-12-31'])assert.equal(time.key(time.localDate(day)),day);
        assert.equal(time.addDays('2026-03-08',1),'2026-03-09');assert.match(time.clock('02:30','en-US'),/2:30/);assert.match(time.dateLabel('2026-03-08','en-US'),/Mar 8/);
        assert.equal(time.relative('2026-12-31','2026-12-31'),'Today');assert.equal(time.relative('2027-01-01','2026-12-31'),'Tomorrow');
    }}finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
