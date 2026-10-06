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

// One directly scheduled, rare decorative pass. No physics/domain objects and
// no permanent RAF loop. Focused workflows are checked only when an event is due.
class CosmosAmbient {
    constructor({root,busy=()=>false,random=Math.random,setTimer=(callback,delay)=>setTimeout(callback,delay),clearTimer=id=>clearTimeout(id),
        visible=()=>!document.hidden&&document.hasFocus(),reduced=false}) {
        Object.assign(this,{root,busy,random,setTimer,clearTimer,visible,reduced});this.timer=null;this.active=null;this.opportunities=0;this.serial=0;
        this.ufoAt=8+Math.floor(random()*5);this.stats={comet:0,ufo:0,skipped:0};
        this.layer=document.createElement('div');this.layer.className='ambient-layer';this.layer.ariaHidden='true';root.append(this.layer);this.schedule();
    }
    schedule(){if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;
        if(this.destroyed||this.reduced||!this.visible())return;
        this.nextDelay=25000+this.random()*30000;
        this.timer=this.setTimer(()=>{this.timer=null;this.trigger();this.schedule();},this.nextDelay);
    }
    chooseKind(){if(++this.opportunities<this.ufoAt)return 'comet';this.opportunities=0;this.ufoAt=8+Math.floor(this.random()*5);return this.random()<.5?'ufo':'comet';}
    trigger(kind=null){if(this.destroyed||this.reduced||!this.visible()||this.busy()||this.active){this.stats.skipped++;return false;}
        const ns='http://www.w3.org/2000/svg',object=document.createElementNS(ns,'svg');kind ||= this.chooseKind();
        const comet=kind==='comet',origin=comet?80:10;
        object.classList.add('ambient-object',`ambient-${kind}`);object.setAttribute('width',comet?'90':'20');object.setAttribute('height','20');object.setAttribute('viewBox',comet?'-80 -10 90 20':'-10 -10 20 20');
        object.style.transformOrigin=`${origin}px 10px`;
        if(comet){const id=`ambient-tail-${++this.serial}`;
            object.innerHTML=`<defs><linearGradient id="${id}"><stop stop-color="#c5d9ef" stop-opacity="0"/><stop offset="1" stop-color="#c5d9ef" stop-opacity=".4"/></linearGradient></defs><path d="M-75 0H0" stroke="url(#${id})" stroke-width=".8"/><circle r="1.2" fill="#dfecfb"/>`;
        }else object.innerHTML='<path d="M-3 0Q0-5 3 0" fill="#91a5b2"/><ellipse rx="6" ry="2" fill="#657887"/><circle cx="-2" cy="1" r=".45" fill="#b6c4b4"/><circle cx="2" cy="1" r=".45" fill="#b6c4b4"/>';
        const {width:w,height:h}=this.root.getBoundingClientRect(),right=this.random()<.5,x=right?-90:w+90,end=right?w+90:-90,
            y=h*(.15+this.random()*.5),dy=(this.random()-.5)*h*.25,angle=Math.atan2(dy,end-x)*180/Math.PI;
        const heading=comet?angle:Math.atan2(dy,Math.abs(end-x))*180/Math.PI;
        const transform=(progress,wobble=0)=>`translate(${x+(end-x)*progress-origin}px,${y+dy*progress+wobble-10}px) rotate(${heading}deg)`;
        this.layer.append(object);this.stats[kind]++;const animation=object.animate([
            {transform:transform(0),opacity:0},{transform:transform(.1),opacity:comet ? .4 : .25,offset:.1},
            {transform:transform(.5,comet?0:4),opacity:comet ? .4 : .25,offset:.5},{transform:transform(.9),opacity:comet ? .4 : .25,offset:.9},
            {transform:transform(1),opacity:0}],{duration:1100+this.random()*700,easing:'linear'});
        this.active={object,animation};const cleanup=()=>{object.remove();if(this.active?.object===object)this.active=null;};animation.finished.then(cleanup,cleanup);return true;
    }
    refresh(){this.schedule();if(!this.visible()||this.reduced){this.active?.animation.cancel();this.active?.object.remove();this.active=null;}}
    setReducedMotion(value){this.reduced=value;this.refresh();}
    resume(){this.destroyed=false;if(!this.layer.isConnected)this.root.append(this.layer);this.refresh();}
    destroy(){this.destroyed=true;if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;this.active?.animation.cancel();this.active?.object.remove();this.active=null;this.layer.remove();}
}
