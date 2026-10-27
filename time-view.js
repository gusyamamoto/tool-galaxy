// Disposable view state only. Object selection/editing stays in the existing inspector.
class TimeWorkspace {
    constructor({getEntries,getSelection=()=>null,inspect,onOpen,onClose,onExit=()=>{},isDetailsOpen=()=>false,dismissDetails=()=>{}}){
        Object.assign(this,{getEntries,getSelection,inspect,onOpen,onClose,onExit,isDetailsOpen,dismissDetails});
        this.root=document.getElementById('time-workspace');this.nav=document.getElementById('time-open');
        this.calendar=document.getElementById('time-calendar');this.days=document.getElementById('time-selected-entries');
        this.upcomingList=document.getElementById('time-upcoming-entries');this.strip=this.root.querySelector('.time-upcoming-viewport');this.active=false;this.events=[];
        this.today=cosmosTime.key(new Date());this.month=this.today.slice(0,7)+'-01';this.selectedDay=null;
        this.nav.addEventListener('click',()=>this.open());
        document.getElementById('time-close').addEventListener('click',()=>{if(this.active){const id=this.getSelection();this.close();this.onExit(id);}});
        for(const [id,offset] of [['time-previous',-1],['time-next',1]])document.getElementById(id).addEventListener('click',()=>this.moveMonth(offset));
        document.getElementById('time-today').addEventListener('click',()=>{this.today=cosmosTime.key(new Date());this.month=this.today.slice(0,7)+'-01';this.selectedDay=this.today;this.refresh();});
        this.calendar.addEventListener('keydown',event=>this.keydown(event));
        this.bindDetailsBrowsing();
        // Reconcile local midnight on return to the app; no polling or animation.
        this.reconcileToday=()=>{if(this.active&&this.today!==cosmosTime.key(new Date()))this.refresh();};
        window.addEventListener('focus',this.reconcileToday);document.addEventListener('visibilitychange',this.reconcileToday);
    }
    open(){
        if(this.active){this.onOpen();return;}
        this.returnFocus=document.activeElement;this.active=true;this.root.hidden=false;this.nav.setAttribute('aria-current','page');
        if(this.narrow&&!this.selectedDay)this.selectedDay=this.today;
        document.getElementById('time-section').classList.remove('section-collapsed');
        this.onOpen();this.refresh();document.getElementById('time-title').focus({preventScroll:true});
    }
    close(restoreFocus=false){
        if(!this.active)return;
        this.active=false;this.root.hidden=true;this.nav.removeAttribute('aria-current');
        document.getElementById('time-section').classList.add('section-collapsed');this.onClose();
        if(restoreFocus)this.nav.focus({preventScroll:true});
    }
    refresh(){
        if(!this.active)return;
        this.today=cosmosTime.key(new Date());this.events=cosmosTime.aggregate(this.getEntries());this.render();
    }
    moveMonth(offset){const month=cosmosTime.shiftMonth(this.month,offset);if(month<'0001-01-01'||month>'9999-12-01')return;this.month=month;this.render();}
    button(className,label,action){const button=document.createElement('button');button.type='button';button.className=className;button.textContent=label;button.addEventListener('click',action);return button;}
    get narrow(){return matchMedia('(max-width:760px), (pointer:coarse) and (max-width:1024px) and (max-height:500px)').matches;}
    bindDetailsBrowsing(){
        const exposed=()=>this.active&&this.narrow&&!this.root.inert&&this.isDetailsOpen();
        const begin=event=>{
            this.detailsDrag=false;this.detailsPointer=null;this.detailsTouch=null;
            if(!exposed()||event.button!==0||event.isPrimary===false)return;
            if(!event.target.closest('[data-time-entry-id]')){this.dismissDetails();return;}
            this.detailsPointer={id:event.pointerId,x:event.clientX,y:event.clientY};
        };
        const move=(start,x,y)=>{
            if(!start||!exposed()||Math.hypot(x-start.x,y-start.y)<10)return;
            this.detailsDrag=true;this.detailsPointer=null;this.detailsTouch=null;
            this.dismissDetails();
        };
        // These listeners never cancel pointer/touch input or capture a pointer.
        // Native hit testing owns sheet controls; only this exposed sibling surface participates.
        this.root.addEventListener('pointerdown',begin,{capture:true,passive:true});
        this.root.addEventListener('pointermove',event=>{if(this.detailsPointer?.id===event.pointerId)move(this.detailsPointer,event.clientX,event.clientY);},{capture:true,passive:true});
        for(const type of ['pointerup','pointercancel'])this.root.addEventListener(type,()=>{this.detailsPointer=null;},{capture:true,passive:true});
        // Touch tracking survives the pointercancel that begins native panning on phones.
        this.root.addEventListener('touchstart',event=>{
            this.detailsDrag=false;this.detailsTouch=null;
            if(event.touches.length!==1){this.detailsPointer=null;return;}
            if(!exposed())return;
            if(!event.target.closest('[data-time-entry-id]')){this.dismissDetails();return;}
            const touch=event.touches[0];this.detailsTouch={id:touch.identifier,x:touch.clientX,y:touch.clientY};
        },{capture:true,passive:true});
        this.root.addEventListener('touchmove',event=>{
            if(event.touches.length!==1){this.detailsTouch=null;return;}
            const touch=event.touches[0];if(this.detailsTouch?.id===touch.identifier)move(this.detailsTouch,touch.clientX,touch.clientY);
        },{capture:true,passive:true});
        for(const type of ['touchend','touchcancel'])this.root.addEventListener(type,()=>{this.detailsTouch=null;},{capture:true,passive:true});
        this.root.addEventListener('wheel',()=>{if(exposed())this.dismissDetails();},{capture:true,passive:true});
        this.root.addEventListener('click',event=>{
            // A new real press resets this flag. Never consume the next intentional tap.
            if(this.detailsDrag&&event.detail){this.detailsDrag=false;event.preventDefault();event.stopImmediatePropagation();return;}
            this.detailsDrag=false;
            // Entry clicks keep the sheet open and use the normal canonical inspect callback.
            if(exposed()&&!event.target.closest('[data-time-entry-id]'))this.dismissDetails();
        },true);
    }
    setSelection(id){
        for(const button of this.root.querySelectorAll('[data-time-entry-id]')){
            button.dataset.selected=String(button.dataset.timeEntryId===id);
            button.setAttribute('aria-pressed',button.dataset.selected);
        }
    }
    description(event){return `${event.task?(event.completed?'Completed task':'Task'):'Item'}: ${event.title}; ${cosmosTime.dateLabel(event.start)}${event.range?` – ${cosmosTime.dateLabel(event.end)}`:''}; ${event.time?cosmosTime.clock(event.time):'All day'}; ${event.context.label}`;}
    eventButton(event,className='time-event',rangeText=''){
        const button=this.button(className,'',()=>{this.lastEventId=event.id;this.setSelection(event.id);this.inspect(event.id);});
        button.dataset.timeEntryId=event.id;button.dataset.family=event.context.family;button.dataset.variant=event.context.variant;
        button.style.setProperty('--time-context',event.context.color);button.classList.toggle('time-completed',event.completed);
        button.dataset.selected=String(event.id===this.getSelection());
        button.setAttribute('aria-pressed',button.dataset.selected);
        button.setAttribute('aria-label',this.description(event));button.title=this.description(event);
        const label=document.createElement('span');label.className='time-event-title';label.textContent=event.title;
        if(className.includes('time-upcoming-event'))button.append(cosmosTemporalAvatars.render(this.getEntries(),event.id));
        button.append(label);
        button.classList.toggle('time-event--date-only',!event.time&&!rangeText);
        if(event.time||rangeText){const clock=document.createElement('span');clock.className='time-clock';clock.textContent=event.time?cosmosTime.clock(event.time):rangeText;button.append(clock);}
        return button;
    }
    rangeLabel(event){
        const start=cosmosTime.localDate(event.start),end=cosmosTime.localDate(event.end);
        return `${cosmosTime.dateLabel(event.start)}–${event.start.slice(0,7)===event.end.slice(0,7)?end.getDate():cosmosTime.dateLabel(event.end)}${start.getFullYear()!==end.getFullYear()?` (${start.getFullYear()}–${end.getFullYear()})`:''}`;
    }
    mobileWeekRanges(segments,preferred){
        // Disposable paint lanes over the same canonical weekly segments as desktop.
        // Keep continuing ranges in their lane when possible; leave a third lane for singles.
        const ends=[-1,-1],shown=[];
        for(const segment of segments){
            const previous=preferred.get(segment.event.id);
            const lane=previous!==undefined&&ends[previous]<segment.start?previous:ends.findIndex(end=>end<segment.start);
            if(lane<0)continue;
            ends[lane]=segment.end;preferred.set(segment.event.id,lane);shown.push({...segment,lane});
        }
        return shown;
    }
    dateMarkers(events,ranges,day){
        const markers=document.createElement('span');markers.className='time-date-markers';markers.ariaHidden='true';
        const occupied=ranges.filter(s=>s.event.start<=day&&day<=s.event.end),free=[0,1,2].filter(lane=>!occupied.some(s=>s.lane===lane));
        const singles=events.filter(event=>!event.range).slice(0,free.length);
        markers.classList.toggle('time-date-markers--range',occupied.length>0);
        for(const [index,event] of singles.entries()){
            const bar=document.createElement('span');bar.className='time-date-bar';bar.dataset.timeIndicatorId=event.id;
            bar.style.setProperty('--time-context',event.context.color);bar.style.setProperty('--time-marker-lane',free[index]);markers.append(bar);
        }
        const hidden=events.length-occupied.length-singles.length;
        if(hidden>0){const count=document.createElement('span');count.className='time-date-overflow';count.textContent=`+${hidden}`;markers.append(count);}
        return markers;
    }
    render(){
        const focused=document.activeElement,focusDay=focused?.dataset.timeDay,focusEntry=focused?.dataset.timeEntryId;
        const scroll=this.strip.scrollLeft;
        const monthLabel=document.getElementById('time-month-label'),year=document.createElement('span');year.className='time-year';year.textContent=cosmosTime.localDate(this.month).toLocaleDateString(undefined,{year:'numeric'});
        monthLabel.replaceChildren(cosmosTime.localDate(this.month).toLocaleDateString(undefined,{month:'long'}),' ',year);
        document.getElementById('time-previous').disabled=this.month==='0001-01-01';document.getElementById('time-next').disabled=this.month==='9999-12-01';
        const weeks=cosmosTime.month(this.month),fragment=document.createDocumentFragment(),head=document.createElement('div');head.className='time-weekdays';head.setAttribute('role','row');
        this.root.style.setProperty('--time-weeks',weeks.length);
        for(const day of weeks[0]){const label=document.createElement('span');label.setAttribute('role','columnheader');label.textContent=cosmosTime.localDate(day).toLocaleDateString(undefined,{weekday:'short'});head.append(label);}fragment.append(head);
        const weekContainer=document.createElement('div');weekContainer.className='time-weeks';weekContainer.setAttribute('role','rowgroup');
        let rangeRows=0;const mobileRangeLanes=new Map();
        for(const days of weeks){
            const week=document.createElement('div');week.className='time-week';week.setAttribute('role','row');
            const segments=cosmosTime.segments(this.events,days),lanes=[-1,-1],shown=[];
            for(const segment of segments){const lane=lanes.findIndex(end=>end<segment.start);if(lane<0)continue;lanes[lane]=segment.end;shown.push({...segment,lane});}
            const mobileShown=this.mobileWeekRanges(segments,mobileRangeLanes);
            week.style.setProperty('--time-range-lanes',Math.max(0,...shown.map(s=>s.lane+1)));
            rangeRows+=Math.max(0,...shown.map(s=>s.lane+1));
            for(const day of days){
                const events=cosmosTime.onDay(this.events,day),cell=document.createElement('div');cell.className='time-day';cell.setAttribute('role','gridcell');cell.setAttribute('aria-selected',String(this.selectedDay===day));
                cell.classList.toggle('time-outside',!day.startsWith(this.month.slice(0,7)));cell.classList.toggle('time-is-today',day===this.today);
                const dayButton=this.button('time-day-select','',()=>this.selectDay(day)),number=document.createElement('span');
                number.className='time-day-number';number.textContent=String(Number(day.slice(-2)));dayButton.append(number);dayButton.dataset.timeDay=day;
                dayButton.tabIndex=day===(this.selectedDay||this.today)?0:-1;
                dayButton.setAttribute('aria-label',`${cosmosTime.localDate(day).toLocaleDateString(undefined,{dateStyle:'full'})}, ${events.length} ${events.length===1?'entry':'entries'}`);
                if(day===this.today)dayButton.setAttribute('aria-current','date');cell.append(dayButton);
                cell.classList.toggle('time-populated',events.length>0);
                if(events.length){const markers=this.dateMarkers(events,mobileShown,day);cell.classList.toggle('time-marker-overflow',!!markers.querySelector('.time-date-overflow'));dayButton.append(markers);}
                const singles=events.filter(e=>!e.range),compact=document.createElement('div');compact.className='time-day-events';
                // Prioritize one legible title/clock card over several microscopic rows.
                for(const event of singles.slice(0,1))compact.append(this.eventButton(event));
                const hidden=events.length-singles.slice(0,1).length-shown.filter(s=>s.event.start<=day&&s.event.end>=day).length;
                if(hidden>0){const more=this.button('time-more',`+${hidden}`,()=>this.selectDay(day));more.ariaLabel=`Show ${hidden} more ${hidden===1?'entry':'entries'} on ${cosmosTime.dateLabel(day)}`;cell.append(more);}
                cell.append(compact);cell.addEventListener('click',event=>{if(!event.target.closest('button'))this.selectDay(day);});week.append(cell);
            }
            const ranges=document.createElement('div');ranges.className='time-range-layer';
            for(const segment of shown){const button=this.eventButton(segment.event,'time-event time-range');button.style.gridColumn=`${segment.start+1} / ${segment.end+2}`;button.style.gridRow=segment.lane+1;button.classList.toggle('time-continues-before',segment.before);button.classList.toggle('time-continues-after',segment.after);ranges.append(button);}
            const mobileRanges=document.createElement('div');mobileRanges.className='time-mobile-range-layer';mobileRanges.ariaHidden='true';
            for(const segment of mobileShown){
                const bar=document.createElement('span');bar.className='time-mobile-range';bar.dataset.timeRangeId=segment.event.id;
                bar.style.gridColumn=`${segment.start+1} / ${segment.end+2}`;bar.style.gridRow=segment.lane+1;
                bar.style.setProperty('--time-context',segment.event.context.color);bar.style.setProperty('--time-range-columns',segment.end-segment.start+1);
                bar.classList.toggle('time-continues-before',segment.before);bar.classList.toggle('time-continues-after',segment.after);mobileRanges.append(bar);
            }
            week.append(ranges,mobileRanges);weekContainer.append(week);
        }
        fragment.append(weekContainer);
        this.calendar.replaceChildren(fragment);
        this.root.style.setProperty('--time-range-rows',rangeRows);
        // One keyboard stop even when the selected day/today is outside this month.
        if(!this.calendar.querySelector('[data-time-day][tabindex="0"]'))this.calendar.querySelector(`[data-time-day="${this.month}"]`).tabIndex=0;
        this.renderDay();
        const upcoming=cosmosTime.upcoming(this.events,this.today),groups=new Map(),cards=document.createDocumentFragment();
        for(const event of upcoming){const day=event.start<this.today?this.today:event.start;if(!groups.has(day))groups.set(day,[]);groups.get(day).push(event);}
        for(const [day,events] of groups){
            const group=document.createElement('li');group.className='time-date-group';group.dataset.timeGroup=day;group.classList.toggle('time-date-group--multiple',events.length>1);
            const date=document.createElement('span');date.className='time-upcoming-date';date.id=`time-group-${day}`;
            date.textContent=events.length===1&&events[0].range?`${events[0].start<this.today?'Ongoing · ':''}${this.rangeLabel(events[0])}`:cosmosTime.relative(day,this.today);
            date.title=date.textContent;
            const stack=document.createElement('div');stack.className='time-upcoming-events';stack.setAttribute('role','group');stack.setAttribute('aria-labelledby',date.id);
            for(const event of events)stack.append(this.eventButton(event,'time-event time-upcoming-event',event.range&&events.length>1?`${event.start<this.today?'Ongoing · ':''}${this.rangeLabel(event)}`:''));
            group.append(date,stack);cards.append(group);
        }
        this.upcomingList.replaceChildren(cards);this.upcomingList.style.setProperty('--time-last-group-width',upcoming.length&&[...groups.values()].at(-1).length>1?'128px':'124px');
        this.strip.scrollLeft=scroll;this.strip.hidden=!upcoming.length;document.getElementById('time-upcoming-empty').hidden=upcoming.length>0;
        if(focusDay)this.calendar.querySelector(`[data-time-day="${focusDay}"]`)?.focus({preventScroll:true});
        else if(focusEntry&&this.root.contains(focused))this.focusEvent(focusEntry);
    }
    selectDay(day){this.selectedDay=day;this.render();}
    renderDay(){
        this.days.hidden=!this.selectedDay;if(!this.selectedDay)return;
        document.getElementById('time-selected-label').textContent=`${this.selectedDay===this.today?'Today':cosmosTime.localDate(this.selectedDay).toLocaleDateString(undefined,{weekday:'long'})} — ${cosmosTime.dateLabel(this.selectedDay)}`;
        const entries=document.getElementById('time-day-entries'),events=cosmosTime.onDay(this.events,this.selectedDay);entries.replaceChildren();
        for(const event of events){const item=document.createElement('li');item.append(this.eventButton(event,'time-event time-selected-event'));entries.append(item);}
        document.getElementById('time-day-empty').hidden=events.length>0;
    }
    focusEvent(id=this.lastEventId){const target=[...this.root.querySelectorAll('[data-time-entry-id]')].find(button=>button.dataset.timeEntryId===id&&button.getClientRects().length);(target||document.getElementById('time-title')).focus({preventScroll:true});}
    keydown(event){
        const day=event.target.dataset.timeDay;if(!day)return;let next;
        const offset={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];
        if(offset!==undefined)next=cosmosTime.addDays(day,offset);
        if(event.key==='Home')next=cosmosTime.addDays(day,-((cosmosTime.localDate(day).getDay()-cosmosTime.firstWeekday()+7)%7));
        if(event.key==='End')next=cosmosTime.addDays(day,6-((cosmosTime.localDate(day).getDay()-cosmosTime.firstWeekday()+7)%7));
        if(event.key==='PageUp'||event.key==='PageDown')next=cosmosTime.shiftMonth(day,event.key==='PageUp'?-1:1);
        if(!next||next<'0001-01-01'||next>'9999-12-31')return;
        event.preventDefault();this.selectedDay=next;this.month=next.slice(0,7)+'-01';this.render();this.calendar.querySelector(`[data-time-day="${next}"]`)?.focus({preventScroll:true});
    }
}
