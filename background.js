// Stable star fields at three depths. This renderer runs only on load/resize.
function createUniverseBackground(galaxy) {
    const layers = [...galaxy.querySelectorAll(".star-layer")];
    const settings = [
        { area: 15000, minimum: 35, maximum: 125, opacity: 0.28 },
        { area: 45000, minimum: 12, maximum: 40, opacity: 0.4 },
        { area: 140000, minimum: 4, maximum: 12, opacity: 0.58 }
    ];

    function render() {
        const { width, height } = galaxy.getBoundingClientRect();
        layers.forEach((layer, depth) => {
            let seed = 1947 + depth * 7919;
            const random = () => {
                seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                return seed / 4294967296;
            };
            const setting = settings[depth];
            const count = Math.max(setting.minimum, Math.min(setting.maximum,
                Math.round(width * height / setting.area)
            ));
            const stars = Array.from({ length: count }, () => {
                const x = Math.round(random() * width);
                const y = Math.round(random() * height);
                const opacity = (setting.opacity + random() * 0.24).toFixed(2);
                return `${x}px ${y}px 0 0 rgba(221, 231, 250, ${opacity})`;
            });
            layer.style.boxShadow = stars.join(",");
        });
    }

    render();
    return render;
}

// Two randomized one-shot schedules, one decorative pass at a time. No physics/domain objects and
// no permanent RAF loop. Focused workflows are checked only when an event is due.
class CosmosAmbient {
    constructor({root,busy=()=>false,random=Math.random,setTimer=(callback,delay)=>setTimeout(callback,delay),clearTimer=id=>clearTimeout(id),
        visible=()=>!document.hidden&&document.hasFocus(),reduced=false}) {
        Object.assign(this,{root,busy,random,setTimer,clearTimer,visible,reduced});this.timers={comet:null,ufo:null};this.delays={};this.active=null;this.debugActive=null;this.serial=0;
        this.stats={comet:0,ufo:0,skipped:0};
        this.layer=document.createElement('div');this.layer.className='ambient-layer';this.layer.ariaHidden='true';root.append(this.layer);this.schedule();
    }
    clearScheduled(kind){if(this.timers[kind]!==null)this.clearTimer(this.timers[kind]);this.timers[kind]=null;}
    schedule(kind=null){
        for(const type of kind?[kind]:['comet','ufo']){
            this.clearScheduled(type);
            if(this.destroyed||this.reduced||!this.visible()||this.active?.kind===type)continue;
            this.delays[type]=type==='comet'?12000+this.random()*23000:45000+this.random()*75000;
            this.timers[type]=this.setTimer(()=>{
                this.timers[type]=null;
                if(!this.trigger(type))this.schedule(type); // Busy: defer with a fresh random delay, never poll.
            },this.delays[type]);
        }
    }
    trigger(kind='comet'){if(this.destroyed||this.reduced||!this.visible()||this.busy()||this.active||this.debugActive){this.stats.skipped++;return false;}
        this.clearScheduled(kind);return this.spawn(kind);
    }
    debug(kind){
        if(this.destroyed)return 'Ambient renderer is unavailable.';
        if(this.reduced)return 'Ambient preview disabled: reduced motion is enabled.';
        if(document.hidden)return 'Ambient preview unavailable: the page is hidden.';
        if(this.active)return 'An ambient event is already active; try again after it finishes.';
        // DevTools focus and primary workflows do not block an intentional preview.
        // Preview calls never change timers. Due production attempts respect the single-pass guard.
        this.stopPass('debugActive');return this.spawn(kind,{debug:true});
    }
    spawn(kind,{debug=false}={}) {
        const ns='http://www.w3.org/2000/svg',object=document.createElementNS(ns,'svg');
        const comet=kind==='comet',origin=comet?116:14,centerY=comet?12:10;
        object.classList.add('ambient-object',`ambient-${kind}`);object.setAttribute('width',comet?'132':'28');object.setAttribute('height',comet?'24':'20');object.setAttribute('viewBox',comet?'-116 -12 132 24':'-14 -10 28 20');
        object.style.transformOrigin=`${origin}px ${centerY}px`;
        if(comet){const id=`ambient-tail-${++this.serial}`;
            object.innerHTML=`<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="-108" y1="0" x2="0" y2="0"><stop stop-color="#c5d9ef" stop-opacity="0"/><stop offset="1" stop-color="#c5d9ef" stop-opacity=".85"/></linearGradient></defs><path d="M-108 0H0" stroke="url(#${id})" stroke-width="1.2"/><circle r="3" fill="#dfecfb" opacity=".18"/><circle r="1.7" fill="#f1f7ff"/>`;
        }else object.innerHTML='<path d="M-4-1Q0-7 4-1" fill="#a6bfcb"/><ellipse rx="9" ry="2.8" fill="#7f94a5" stroke="#a7becc" stroke-width=".55"/><circle cx="-4" cy="1" r=".7" fill="#bfd0b8"/><circle cy="1.6" r=".65" fill="#d4e1eb"/><circle cx="4" cy="1" r=".7" fill="#bfd0b8"/>';
        const {width:w,height:h}=this.root.getBoundingClientRect(),right=debug||this.random()<.5,
            startMargin=debug?140:100+this.random()*80,endMargin=debug?140:100+this.random()*80,
            x=debug?w*.4:right?-startMargin:w+startMargin,end=right?w+endMargin:-endMargin,
            y=debug?h*.42:h*(.2+this.random()*.5),
            rise=debug?-h*.12:comet?(this.random()<.5?-1:1)*h*(.16+this.random()*.18):(this.random()-.5)*h*.08,
            dy=debug?rise:Math.max(h*.1,Math.min(h*.9,y+rise))-y,angle=Math.atan2(dy,end-x)*180/Math.PI;
        const heading=comet?angle:Math.atan2(dy,Math.abs(end-x))*180/Math.PI;
        const transform=progress=>`translate(${x+(end-x)*progress-origin}px,${y+dy*progress+(comet?-10*Math.sin(Math.PI*progress):4*Math.sin(4*Math.PI*progress))-centerY}px) rotate(${heading}deg)`;
        const strength=comet ? .72 : .55;
        if(debug){object.style.transform=transform(0);object.style.opacity=String(strength);}
        this.layer.append(object);if(!debug)this.stats[kind]++;const animation=object.animate([
            {transform:transform(0),opacity:debug?strength:0},{transform:transform(.1),opacity:strength,offset:.1},
            {transform:transform(.3),opacity:strength,offset:.3},{transform:transform(.5),opacity:strength,offset:.5},
            {transform:transform(.7),opacity:strength,offset:.7},{transform:transform(.9),opacity:strength,offset:.9},
            {transform:transform(1),opacity:0}],{duration:comet?(debug?1100:900+this.random()*500):(debug?3200:2800+this.random()*1200),easing:comet?'linear':'ease-in-out'});
        const slot=debug?'debugActive':'active';this[slot]={object,animation,kind};
        const cleanup=()=>{object.remove();if(this[slot]?.object===object){this[slot]=null;if(!debug)this.schedule(kind);}};animation.finished.then(cleanup,cleanup);return true;
    }
    stopPass(slot){this[slot]?.animation.cancel();this[slot]?.object.remove();this[slot]=null;}
    refresh(){this.schedule();if(!this.visible()||this.reduced)this.stopPass('active');
        if(document.hidden||this.reduced)this.stopPass('debugActive');}
    setReducedMotion(value){this.reduced=value;this.refresh();}
    resume(){this.destroyed=false;if(!this.layer.isConnected)this.root.append(this.layer);this.refresh();}
    destroy(){this.destroyed=true;['comet','ufo'].forEach(kind=>this.clearScheduled(kind));this.stopPass('active');this.stopPass('debugActive');this.layer.remove();}
}
