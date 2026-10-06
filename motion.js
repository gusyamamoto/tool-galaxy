// Bounded presentation cues only. Never writes entries, positions or storage.
class CosmosMotion {
    constructor({ wake = () => {} } = {}) {
        this.wake=wake;this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.animations=new Set();this.byElement=new WeakMap();this.ghosts=new Set();this.clouds=new Map();this.timers=new Set();
        this.constellationUntil=0;this.stats={portal:0,arrival:0,select:0,constellation:0,materialize:0,fileAdd:0,fileRemove:0,deletion:0,astronaut:0,cloud:0};
    }
    get constellationAnimating(){return performance.now()<this.constellationUntil;}
    play(element,frames,{duration=220,delay=0,group='interaction',done=()=>{}}={}) {
        if(this.reduced||document.hidden||!element?.animate||element.isConnected===false)return null;
        this.cancelElement(element);
        const animation=element.animate(frames,{duration,delay,easing:'cubic-bezier(.2,.7,.3,1)',fill:'backwards'}),record={element,animation,group};
        this.animations.add(record);this.byElement.set(element,record);let cleaned=false;
        const cleanup=()=>{if(cleaned)return;cleaned=true;this.animations.delete(record);if(this.byElement.get(element)===record)this.byElement.delete(element);animation.cancel();done();};
        animation.finished.then(cleanup,cleanup);return animation;
    }
    cancelElement(element){const record=this.byElement.get(element);if(record){record.animation.cancel();this.animations.delete(record);this.byElement.delete(element);}}
    cancelGroup(group){[...this.animations].filter(r=>r.group===group).forEach(r=>this.cancelElement(r.element));}
    accent(element,kind='arrival') {
        if(this.reduced||!element)return;
        this.stats[kind]++;
        const end=getComputedStyle(element).outline;
        this.play(element,[{outline:'1px solid rgba(209,226,241,.12)',outlineOffset:'3px'},
            {outline:'1px solid rgba(209,226,241,.65)',outlineOffset:'3px',offset:.35},{outline:end}],{duration:240});
    }
    portal(icon){if(this.reduced||!icon)return;this.stats.portal++;
        this.play(icon,[{transform:'rotate(0deg) scale(1)',opacity:.7},{transform:'rotate(12deg) scale(1.08)',opacity:1,offset:.4},{transform:'rotate(0deg) scale(1)',opacity:1}],{duration:240});}
    materialize(node){if(this.reduced)return;this.stats.materialize++;
        this.play(node,[{opacity:.2},{opacity:getComputedStyle(node).opacity}],{duration:220});}
    astronaut(node,release=false){if(this.reduced)return;const figure=node?.querySelector('.astronaut-figure');if(!figure)return;
        this.stats.astronaut++;this.play(figure,[{transform:`rotate(${release?-3:2}deg)`},{transform:'rotate(0deg)'}],{duration:release?240:180});}
    beginConstellation(nodes) {
        this.cancelGroup('constellation');this.clearGhosts();
        if(this.reduced){this.constellationUntil=0;return;}
        this.stats.constellation++;this.constellationUntil=performance.now()+400;
        const count=Math.min(nodes.length,96);
        nodes.slice(0,count).forEach((node,i)=>this.play(node,[{opacity:.5,outline:'1px solid rgba(214,195,162,0)',outlineOffset:'3px'},
            {opacity:1,outline:'1px solid rgba(214,195,162,.65)',outlineOffset:'3px',offset:.65},
            {opacity:1,outline:getComputedStyle(node).outline}],
            {duration:240,delay:count>1?i*150/(count-1):0,group:'constellation'}));
    }
    drawLine(line,index,count){if(this.reduced||index>=128)return;line.setAttribute('pathLength','1');
        this.play(line,[{strokeDasharray:'1 1',strokeDashoffset:'1',strokeOpacity:.6},
            {strokeDasharray:'1 1',strokeDashoffset:'0',strokeOpacity:getComputedStyle(line).strokeOpacity}],
            {duration:260,delay:count>1?index*125/Math.min(127,count-1):0,group:'constellation'});}
    cancelConstellationIntro(){this.cancelGroup('constellation');this.constellationUntil=0;}
    leaveConstellation(overlay,nodes) {
        if(!this.reduced&&overlay.children.length&&overlay.children.length<=128) {
            const ghost=document.createElementNS('http://www.w3.org/2000/svg','g');
            [...overlay.children].forEach(line=>{const copy=line.cloneNode(true),style=getComputedStyle(line);
                copy.classList.replace('constellation-line','constellation-exit-line');copy.style.strokeDasharray=style.strokeDasharray;copy.style.strokeDashoffset=style.strokeDashoffset;ghost.append(copy);});
            document.getElementById('motion-overlay').append(ghost);this.ghosts.add(ghost);
            this.play(ghost,[{opacity:.8},{opacity:0}],{duration:140,group:'exit',done:()=>{ghost.remove();this.ghosts.delete(ghost);}});
        }
        this.cancelGroup('constellation');this.constellationUntil=this.reduced?0:performance.now()+150;
        if(!this.reduced)nodes.slice(0,48).filter(n=>n.dataset.culled!=='true').forEach(node=>{
            this.play(node,[{outline:'1px solid rgba(214,195,162,.5)',outlineOffset:'3px'},
                {outline:'1px solid rgba(214,195,162,0)',outlineOffset:'3px'}],{duration:140,group:'exit'});
        });
    }
    clearGhosts(){this.cancelGroup('exit');this.ghosts.forEach(g=>{this.cancelElement(g);g.remove();});this.ghosts.clear();}
    // Freeze the rendered appearance, including procedural pseudo-element textures.
    // This detached snapshot owns no entry ID, handlers or data and never joins physics.
    captureDeletion(node) {
        if(this.reduced||document.hidden||!node||node.dataset.culled==='true')return null;
        const rect=node.getBoundingClientRect();if(!rect.width||!rect.height)return null;
        const freeze=(source)=>{
            const copy=source.cloneNode(false),style=getComputedStyle(source);
            for(const property of style)copy.style.setProperty(property,style.getPropertyValue(property));
            copy.removeAttribute('id');copy.removeAttribute('data-entry-id');copy.removeAttribute('tabindex');
            for(const child of source.children)if(!child.matches('.node-label,.node-hit-area'))copy.append(freeze(child));
            if(source.namespaceURI==='http://www.w3.org/1999/xhtml')for(const pseudo of ['::before','::after']){
                const paint=getComputedStyle(source,pseudo);
                if(paint.content==='none'||paint.content==='normal')continue;
                const layer=document.createElement('span');
                for(const property of paint)layer.style.setProperty(property,paint.getPropertyValue(property));
                layer.textContent=paint.content.replace(/^['"]|['"]$/g,'');
                if(pseudo==='::before')copy.prepend(layer);else copy.append(layer);
            }
            return copy;
        };
        let ghost;try{ghost=freeze(node);}catch{return null;} // Presentation failure must never block deletion.
        ghost.className='node-deletion-ghost';ghost.inert=true;ghost.setAttribute('aria-hidden','true');
        Object.assign(ghost.style,{position:'fixed',left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,
            margin:'0',transform:'none',transformOrigin:'center',pointerEvents:'none',outline:'none',transition:'none',zIndex:'8'});
        return ghost;
    }
    implode(ghost) {
        if(!ghost||this.reduced)return;
        document.body.append(ghost);this.ghosts.add(ghost);this.stats.deletion++;
        const opacity=Number(ghost.style.opacity)||1;
        let animation;try{animation=this.play(ghost,[{transform:'scale(1)',opacity},
            {transform:'scale(.72)',opacity:opacity*.75,offset:.45},{transform:'scale(.06)',opacity:0}],
            {duration:240,group:'deletion',done:()=>{ghost.remove();this.ghosts.delete(ghost);}});}catch{/* Static deletion already succeeded. */}
        if(!animation){ghost.remove();this.ghosts.delete(ghost);}
    }
    fileEnter(row){if(this.reduced)return;this.stats.fileAdd++;
        this.play(row,[{opacity:.3,transform:'translateY(3px)'},{opacity:1,transform:'translateY(0)'}],{duration:180});}
    fileExit(filename,rect,host){if(this.reduced||!rect.width||!rect.height)return;this.stats.fileRemove++;
        const ghost=document.createElement('div');ghost.className='file-removal-echo';ghost.ariaHidden='true';ghost.textContent=filename;
        Object.assign(ghost.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
        host.append(ghost);this.ghosts.add(ghost);
        this.play(ghost,[{opacity:.4,transform:'translateY(0)'},{opacity:0,transform:'translateY(-3px)'}],{duration:150,done:()=>{ghost.remove();this.ghosts.delete(ghost);}});
    }
    cloud(region){if(this.reduced||!region||region.renderOpacity<.03)return;this.stats.cloud++;
        const previous=this.clouds.get(region);if(previous){clearTimeout(previous.timer);this.timers.delete(previous.timer);}
        const state={start:performance.now()};this.clouds.set(region,state);
        state.timer=setTimeout(()=>{if(this.clouds.get(region)===state)this.clouds.delete(region);this.timers.delete(state.timer);this.wake();},260);this.timers.add(state.timer);}
    cloudFactor(region){const state=this.clouds.get(region);if(!state)return 1;
        const t=Math.min(1,(performance.now()-state.start)/260);return 1-.08*Math.sin(Math.PI*t);}
    setReducedMotion(value){this.reduced=value;if(value){this.animations.forEach(r=>r.animation.cancel());this.animations.clear();this.clearGhosts();this.timers.forEach(clearTimeout);this.timers.clear();this.clouds.clear();this.constellationUntil=0;this.wake();}}
    destroy(){this.setReducedMotion(true);this.timers.forEach(clearTimeout);this.timers.clear();}
}
