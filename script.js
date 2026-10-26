const initialEntries = galaxyModel.legacyEntries;

const entryRoles = galaxyModel.roles;
const sampleMode = galaxySample.isRequested(window.location.search);
const persistence = globalThis.cosmifoldStartupPersistence || createPersistence({sample: sampleMode, sampleSnapshot: sampleMode ? galaxySample.build() : null});
let localRestoreInProgress=false;
let restorePhysicsWasPaused=false;
const universeRepository = createUniverseRepository({persistence, canWrite: () => sampleMode || storageAvailable});
let applicationCommandTail=Promise.resolve(),applicationCommandsPending=0;
function orderedCommand(action){
    applicationCommandsPending++;
    const result=applicationCommandTail.then(action);
    applicationCommandTail=result.catch(()=>{}).finally(()=>applicationCommandsPending--);
    result.catch(()=>{});return result;
}

if (sampleMode) {
    // The query activates this page load only. Keeping it out of the address bar
    // means a normal refresh always returns to the user's persisted Galaxy.
    const realGalaxyUrl = new URL(window.location.href);
    realGalaxyUrl.searchParams.delete("sample");
    window.history.replaceState(null, "", realGalaxyUrl.href);
}

const galaxy = document.getElementById("galaxy");
const graphViewport = document.getElementById("graph-viewport");
const graphWorld = document.getElementById("graph-world");
const nodesLayer = document.getElementById("nodes-layer");
const zoomLevel = document.getElementById("zoom-level");
const hierarchyLayer = document.getElementById("hierarchy-paths");
const panel = document.getElementById("entry-panel");
let mobileContents=null, usableCanvasBounds=null;
const selectedTitleEditors=[];
const panelName = document.getElementById("panel-name");
const entryActions = document.getElementById("entry-actions");
const editEntryButton = document.getElementById("edit-entry-button");
const deleteEntryButton = document.getElementById("delete-entry-button");
const actionStatus = document.getElementById("entry-action-status");
const panelAncestry = document.getElementById("panel-ancestry");
panelAncestry.addEventListener('scroll', () => {
    panelAncestry.classList.toggle('has-clipped-ancestors', panelAncestry.scrollLeft > 1);
}, {passive:true});
const regionsLayer = document.getElementById("regions-layer");
const regions = new Map();
// Retained only as an empty compatibility input for archive/legacy diagnostics.
// Normal presentation never populates cloud regions.
const roleField = document.getElementById("entry-role");
const parentField = document.getElementById("entry-parent");
const formError = document.getElementById("entry-form-error");
const submitButton = document.getElementById("entry-submit");
const addEntryButton = document.getElementById("add-entry-button");
const addChildButton = document.getElementById("add-child-button");
const contextMenu = document.getElementById("entry-context-menu");
const creationContext = document.getElementById("creation-context");
const dialog = document.getElementById("add-entry-dialog");
const form = document.getElementById("add-entry-form");
const storageStatus = document.getElementById("storage-status");
const deleteDialog = document.getElementById("delete-entry-dialog");
const portalDialog = document.getElementById("portal-dialog");
const searchField = document.getElementById("entry-search");
const searchResults = document.getElementById("search-results");
const searchResultList = document.getElementById("search-result-list");
const sampleControls = document.getElementById("sample-controls");
const sampleModeLabel = document.getElementById("sample-mode-label");
const sampleModeCount = document.getElementById("sample-mode-count");
const loadSampleButton = document.getElementById("load-sample-button");
const removeSampleButton = document.getElementById("remove-sample-button");
const fields = ["entry-name", "entry-description", "entry-category"].map((id) =>
    document.getElementById(id)
);

// Plain entry data is kept separate from the rendered DOM.
const entries = new Map();
const archivedEntries = new Map(), archivedGalaxies = new Map();
const archiveDialog = document.getElementById('archive-galaxy-dialog');
const archivedSection=new NavigationSection({root:document.getElementById('archived-galaxies'),toggle:document.getElementById('archived-galaxies-toggle'),list:document.getElementById('archived-galaxy-list'),name:'Archived Galaxies',key:'archivedCollapsed',preferences:persistence.preferences,collapsed:true});
const archiveMotion = new GalaxyArchiveMotion(graphViewport);
let archivingGalaxyId = null, archiveConfirmationIds = null, archiveReturnFocus = null, archiveFeedbackTimer = null;
function allCanonicalEntries() { return galaxyArchives.join(entries, archivedEntries); }
const portals = new Map();
const constellations = new Map();
let activeConstellationId = null;
let activeConstellationMembers = new Set();
let activeConstellationGalaxyIds = new Set();
let pendingPortalArrival = null;
let constellationOverview = false;
// Parent-relative arrangement influences are separate from content.
let layout = new Map();
// Match partial v1/v2 saved positions to starter templates during loading only.
// Starter IDs never grant special permissions or deletion protection.
const starterIds = new Set(initialEntries.map((entry) => entry.id));
const nodes = new Map();
let taskStates = new Map();
let taskWritePending = false;
let creatingTaskList = false;
let pendingTaskPulses = null;
let terminalLabelIds = new Set();
const lines = [];
const orbitGuides = [];
let hoveredSystemId = null;
let hoveredEntryId = null, searchFocusId = null;
let selectedNode = null;
let nextEntryId = 1;
let storageAvailable = true;
let localDataRecovery = false;
let localSessionStale = false;
const staleSessionMessage = 'Cosmifold changed in another tab. Reload this tab to continue safely.';
const fileFailure=document.getElementById('file-failure');
const capacityWarning=document.getElementById('storage-capacity-warning');
function placeCapacityWarning(){
    const host=[...document.querySelectorAll('dialog[open]')].at(-1)||document.body;
    if(capacityWarning.parentElement!==host)host.append(capacityWarning);
}
const storageCapacity=cosmifoldStorageCapacity.create({
    notify(text){placeCapacityWarning();document.getElementById('storage-capacity-message').textContent=text;capacityWarning.hidden=false;},
    hide(){capacityWarning.hidden=true;},
    canShow:()=>!sampleMode&&!localSessionStale&&!localDataRecovery&&fileFailure.hidden
});
document.getElementById('dismiss-storage-capacity').addEventListener('click',()=>storageCapacity.dismiss());
document.getElementById('dismiss-file-failure').addEventListener('click',()=>{fileFailure.hidden=true;});
function placeFileFailure() {
    // Native previews occupy the top layer; keep their notification inside it.
    const host=[...document.querySelectorAll('dialog[open]')].at(-1)||document.body;
    if(fileFailure.parentElement!==host)host.append(fileFailure);
}
document.addEventListener('toggle',event=>{
    if(event.target.tagName!=='DIALOG')return;
    if(event.target.open)contentInspector.promoteFileFailure();
    if(!fileFailure.hidden)placeFileFailure();
    if(!capacityWarning.hidden)placeCapacityWarning();
},true);
function notifyFileFailure(text) {
    storageCapacity.failure();
    if(localSessionStale)return;
    placeFileFailure();
    fileFailure.hidden=false;
    document.getElementById('file-failure-message').textContent=text;
}
persistence.metadata.subscribeStale?.(() => {
    if(localSessionStale)return;
    localSessionStale=true;storageAvailable=false;
    storageCapacity.cancel();
    fileFailure.hidden=true;
    physics.pause();
    // Keep Backup/Help available, but stop stale graph/editor interactions.
    document.querySelectorAll('dialog[open]').forEach(dialog=>{
        if(!['backup-dialog','help-dialog','account-dialog'].includes(dialog.id))dialog.close();
    });
    document.querySelectorAll('#graph-viewport,#entry-panel,#mobile-body-actions,#universe-section,#tasks-section,#constellations-section,#archived-galaxies,#add-menu,#entry-context-menu,#first-use').forEach(element=>element.inert=true);
    document.getElementById('add-entry-button').disabled=true;
    reportStorageFailure(staleSessionMessage);
    hierarchySidebar.setCollapsed(false);
    const reload=document.getElementById('reload-local-data');reload.hidden=false;reload.focus();
});
document.getElementById('reload-local-data').addEventListener('click',()=>location.reload());
let graphNeedsSave = false;
let editingId = null;
let contextualParentId = null;
let deletingId = null;
let deleteConfirmationIds = null, crudActive = false;
let panelChangeActive = false;
let deletionBusy = false;
const deletingContentIds = new Set();
let contextEntryId = null, contextReturnFocus = null;
let contextCollectionId = null;
let contextPortalId = null, portalTargetId = null, portalParentId = null, portalResultsLimit = 8;
let searchOpen = false;
let keyboardNavigation = false;
document.addEventListener("keydown", event => {
    if (event.key === "Tab") keyboardNavigation = true;
});
document.addEventListener("pointerdown", event => { keyboardNavigation = false;cancelPendingBodyFocus();if(event.pointerType!=='touch'||!event.target.closest('.entry-node'))lastBodyTap=null; }, true);
let autoFitPending = true;
let baseNodeRadius = 13;
let cameraViewReady = false;
let semanticDetail = cosmosView.detail(1);
const focusRevealIds = new Set();
const hierarchySidebar = new HierarchySidebar({ host: galaxy, preferences: persistence.preferences,
    onTaskToggle:(id,value)=>changeTask(id,'completed',value), taskBlocked:()=>taskWritePending||(!sampleMode&&!storageAvailable),
    onRename:renameEntry, onRenameStart() { cancelPendingBodyFocus(); camera.stopAnimation(); closeContextMenu(); closeContentMenus(); },
    onNavigate: (id,options) => focusEntry(id,{...options,openInspector:!hierarchySidebar.narrow}), onSelectionEmpty:()=>clearSelection(), onCreate: (id, button) => toggleContentMenu(addMenu, button, id),
    onActivate:id=>selectEntry(entries.get(id),nodes.get(id),{reframe:false,openInspector:!hierarchySidebar.narrow}), onMove:moveSidebarEntries,
    onMenu(id, button) {
        toggleBodyActions(button,id,'sidebar');
    },
    moveBlocked:()=>deletionBusy||crudActive||activeNodeDrags||!!pan||!!pinch||(!sampleMode&&!storageAvailable), onDragEnd:()=>contentDrops.finish(),
    portals, onOpenPortal: id => openPortal(id), onPortalMenu: (id, x, y) => openPortalContextMenu(id, x, y),
    onViewportChange: animate => crudActive || panelChangeActive ? updateGraphViewport() : navigationViewportChanged(animate) });
const sidebarPaneSplit = new SidebarPaneSplit({preferences:persistence.preferences, mediaQuery:hierarchySidebar.mobileQuery});
const hierarchyClipboard=new HierarchyClipboard();
const tasksView = new TasksSecondaryView({preferences:persistence.preferences, onMenu:openTasksListMenu,
    navigate:id=>focusEntry(id,{openInspector:!hierarchySidebar.narrow}), complete:(id,value)=>changeTask(id,'completed',value),
    blocked:()=>taskWritePending||(!sampleMode&&!storageAvailable), onLayout(){if(cameraViewReady)updateGraphViewport();}});
const firstUse = new FirstUseOnboarding({
    root:document.getElementById('first-use'), hint:document.getElementById('first-use-hint'),
    preferences:persistence.preferences, create:()=>openEntryForm(),
    help:()=>document.getElementById('help-button').click(),
    obscured:()=>hierarchySidebar.narrow&&!hierarchySidebar.collapsed,
    coachTarget:()=>{
        const id=firstUse.state.phase==='child'?firstUse.state.rootId:selectedNode?.dataset.entryId;
        if(selectedNode?.dataset.entryId!==id||constellationOverview)return null;
        const buttons=hierarchySidebar.narrow?[panel.hidden?'mobile-body-add':'entry-add-button']:['entry-add-button'];
        let button=buttons.map(id=>document.getElementById(id)).find(button=>button.getClientRects().length);
        if(!button&&!hierarchySidebar.narrow)button=hierarchySidebar.rows.get(id)?.querySelector('.tree-add');
        return button?{button,name:entries.get(id)?.name,side:hierarchySidebar.narrow?'above':button.closest('#entry-panel')?'left':'right',edge:button.closest('#entry-panel')?panel.getBoundingClientRect().left:button.getBoundingClientRect().right}:null;
    }
});
function syncFirstUse() {
    firstUse.sync({empty:entries.size===0&&archivedEntries.size===0,
        available:!sampleMode&&storageAvailable, entries});
}
let pasteBusy=false;
const structureDialog=document.getElementById('duplicate-structure-dialog'),structureForm=document.getElementById('duplicate-structure-form'),structureName=document.getElementById('duplicate-structure-name'),structureError=document.getElementById('duplicate-structure-error');
let structureSourceId=null,structureReturnFocus=null,structureCommitted=false;
const smoothDetail = (scale, start, end) => cosmosView.smooth(scale, start, end);
const renderBackground = createUniverseBackground(galaxy);
const camera = new GraphCamera({
    onRest({travel=false}={}) {
        if(travel&&pendingPortalArrival===selectedNode?.dataset.entryId)motion.accent(selectedNode,'arrival');
        pendingPortalArrival=null;
        if (focusRevealIds.size) { focusRevealIds.clear(); renderGraph(); }
        playTaskCompletionPulses();
    },
    onChange({ x, y, scale }, { source = 'programmatic', previousScale = scale } = {}) {
        const viewport = readRenderViewport();
        // Expanded Contents/active editing owns its selection. Ordinary canvas
        // focus yields only to an actual user zoom-out, never navigation/Fit.
        if(selectedNode&&panel.hidden&&!crudActive&&cosmosView.releasesOverviewSelection(scale,previousScale,source)){
            const former=selectedNode,id=former.dataset.entryId;
            cancelPendingBodyFocus();lastBodyTap=null;
            motion.cancelElement(former);
            if(former.contains(document.activeElement))document.activeElement.blur();
            if(hoveredEntryId===id){hoveredEntryId=null;hoveredSystemId=null;}
            if(searchFocusId===id)searchFocusId=null;
            clearSelection({viewport});
        }
        archiveMotion.clear();
        graphWorld.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
        // SVG geometry stays in world space. Bodies are sized and projected in
        // screen space, so zoom paints gradients and text at native resolution
        // instead of magnifying a previously composited DOM world layer.
        graphViewport.style.setProperty("--camera-scale", scale);
        graphViewport.style.setProperty("--native-label-scale", Math.min(1, scale / 0.62));
        graphViewport.style.setProperty('--galaxy-diameter', `${cosmosView.galaxyDiameter(scale)}px`);
        graphViewport.style.setProperty('--overview-decoration', smoothDetail(scale, .28, .68));
        graphViewport.dataset.simpleBodies = String(scale <= .28);
        const detail = semanticDetail = cosmosView.detail(scale);
        updateCameraInspectionLimit(scale);
        for (const role of ['satellite', 'astronaut']) graphViewport.style.setProperty(`--${role}-inspection-cap`, `${cosmosView.renderCap(role, scale)}px`);
        for (const role of ["sun", "planet", "moon", "satellite", "astronaut"]) {
            graphViewport.style.setProperty(`--${role}-detail`, detail[role]);
            graphViewport.style.setProperty(`--${role}-render-scale`, scale * (.72 + detail[role] * .28));
            graphViewport.style.setProperty(`--${role}-label-detail`, detail.labels[role].opacity);
        }
        graphViewport.style.setProperty("--surface-detail", smoothDetail(scale, 0.5, 1));
        graphViewport.style.setProperty("--orbit-detail", detail.guides);
        graphViewport.style.setProperty('--task-ring-detail',smoothDetail(scale,.28,.65));
        graphViewport.style.setProperty("--galaxy-label-size", `${14 + 2 * (1 - smoothDetail(scale, .18, .50))}px`);
        graphViewport.style.setProperty('--galaxy-label-detail', detail.labels.galaxy.opacity);
        galaxy.dataset.detailLevel = detail.tier;
        zoomLevel.textContent = `${Math.round(scale * 100)}%`;
        entries.forEach(entry => renderNode(entry, nodes.get(entry.id), viewport));
        updateHierarchyPaths(viewport);
        updateOrbitGuides(viewport);
        constellationOverlay.update();
        requestLabelLayout();
    }
});

function updateCameraInspectionLimit(scale = camera.view.scale) {
    const entry = entries.get(selectedNode?.dataset.entryId);
    const moon = entry && (entry.role === 'moon' ? entry : galaxyModel.ancestors(entries, entry.id).find(parent => parent.role === 'moon'));
    const particle = moon && physics.particles.get(moon.id);
    const b = physics.bounds, center = camera.screenToWorld((b.left+b.right)/2, (b.top+b.bottom)/2);
    const moonContext = particle && Math.hypot(center.x-particle.x, center.y-particle.y) <= Math.max(90, particle.familyFootprint * 1.75);
    // Extra projection range inside existing close Moon ancestry only. There is
    // no new world/anchor, and changing selection never jumps the current view.
    camera.maxScale = moonContext && cosmosView.detail(scale).tier === 'close' ? 12 : Math.max(3, scale);
}
let pan = null;
let activeNodeDrags = 0;
const canvasTouches=new Map();let pinch=null,pinchFrame=null,suppressTouchClick=false,lastCanvasPointerType='mouse';
let pendingBodyFocusTimer=null,lastBodyTap=null;
function cancelPendingBodyFocus(){if(pendingBodyFocusTimer!==null)clearTimeout(pendingBodyFocusTimer);pendingBodyFocusTimer=null;}
document.addEventListener('keydown',()=>{cancelPendingBodyFocus();lastBodyTap=null;},true);
function isCanvasTouchClick(event){return event.pointerType==='touch'||event.sourceCapabilities?.firesTouchEvents||(!event.pointerType&&lastCanvasPointerType==='touch');}

function applyPinch(){
    if(!pinch)return;const a=canvasTouches.get(pinch.ids[0]),b=canvasTouches.get(pinch.ids[1]);if(!a||!b)return;
    const x=(a.x+b.x)/2-pinch.left,y=(a.y+b.y)/2-pinch.top;
    const scale=Math.max(camera.minScale,Math.min(camera.maxScale,pinch.scale*Math.pow(Math.hypot(a.x-b.x,a.y-b.y)/pinch.distance,1.18)));
    camera.setView({x:x-pinch.anchor.x*scale,y:y-pinch.anchor.y*scale,scale},false,{source:'user-zoom'});
}
function cancelCanvasTouches(){
    if(!canvasTouches.size)return;
    lastBodyTap=null;
    if(pinchFrame!==null){cancelAnimationFrame(pinchFrame);pinchFrame=null;}
    nodes.forEach(node=>node.cancelTouchDrag?.());
    if(pan&&canvasTouches.has(pan.id)){pan=null;graphViewport.classList.remove('is-panning');}
    const ids=[...canvasTouches.keys()];canvasTouches.clear();pinch=null;suppressTouchClick=true;
    ids.forEach(id=>{if(graphViewport.hasPointerCapture(id))graphViewport.releasePointerCapture(id);});
}
// Capture only canvas touches. Drawer, sheet, menu and modal events never enter this gesture.
graphViewport.addEventListener('pointerdown',event=>{
    lastCanvasPointerType=event.pointerType||'mouse';
    if(event.pointerType!=='touch')return;
    if(!canvasTouches.size&&!pinch)suppressTouchClick=false;
    canvasTouches.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(canvasTouches.size<2)return;
    lastBodyTap=null;cancelPendingBodyFocus();
    if(!pinch){
        if(pan&&!canvasTouches.has(pan.id))return;
        nodes.forEach(node=>node.cancelTouchDrag?.());if(activeNodeDrags)return;
        pan=null;graphViewport.classList.remove('is-panning');closeContextMenu();closeContentMenus();dismissTemporaryReveal();autoFitPending=false;camera.stopAnimation();
        const ids=[...canvasTouches.keys()].slice(0,2),a=canvasTouches.get(ids[0]),b=canvasTouches.get(ids[1]),rect=graphViewport.getBoundingClientRect();
        pinch={ids,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),scale:camera.view.scale,left:rect.left,top:rect.top,
            anchor:camera.screenToWorld((a.x+b.x)/2-rect.left,(a.y+b.y)/2-rect.top)};
        ids.forEach(id=>graphViewport.setPointerCapture(id));
    }
    event.preventDefault();event.stopPropagation();
},true);
graphViewport.addEventListener('pointermove',event=>{
    if(!canvasTouches.has(event.pointerId))return;
    canvasTouches.set(event.pointerId,{x:event.clientX,y:event.clientY});if(!pinch)return;
    event.preventDefault();event.stopPropagation();
    if(pinchFrame===null)pinchFrame=requestAnimationFrame(()=>{pinchFrame=null;applyPinch();});
},true);
function finishCanvasTouch(event){
    if(!canvasTouches.has(event.pointerId))return;
    if(event.type==='pointercancel'){cancelCanvasTouches();return;}
    if(pinch){
        if(pinchFrame!==null){cancelAnimationFrame(pinchFrame);pinchFrame=null;applyPinch();}
        canvasTouches.delete(event.pointerId);event.preventDefault();event.stopPropagation();
        if(!canvasTouches.size){pinch=null;suppressTouchClick=true;}
    }else canvasTouches.delete(event.pointerId);
}
graphViewport.addEventListener('pointerup',finishCanvasTouch,true);
graphViewport.addEventListener('pointercancel',finishCanvasTouch,true);
graphViewport.addEventListener('lostpointercapture',event=>{if(event.target===graphViewport&&canvasTouches.has(event.pointerId)){if(pinch)cancelCanvasTouches();else canvasTouches.delete(event.pointerId);}},true);
graphViewport.addEventListener('click',event=>{
    const touchClick=isCanvasTouchClick(event);
    if(event.detail&&(pinch||suppressTouchClick&&touchClick)){event.preventDefault();event.stopPropagation();}
},true);
window.addEventListener('blur',cancelCanvasTouches);
window.addEventListener('blur',cancelPendingBodyFocus);
window.addEventListener('pagehide',cancelPendingBodyFocus);
window.addEventListener('pagehide',cancelCanvasTouches);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&pinch){cancelCanvasTouches();event.preventDefault();event.stopImmediatePropagation();}},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelCanvasTouches();});

function pointerInWorld(event) {
    const rect = graphViewport.getBoundingClientRect();
    return camera.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
}

graphViewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    cancelPendingBodyFocus();lastBodyTap=null;
    if (activeNodeDrags || pan || pinch) return;

    closeContextMenu();
    autoFitPending = false;
    dismissTemporaryReveal();
    const rect = graphViewport.getBoundingClientRect();
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
    const response=event.deltaY*units*.0024*(event.ctrlKey?1.15:1);
    const logStep=Math.max(-.42,Math.min(.42,response));
    camera.zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-logStep), {source:'user-zoom'});
}, { passive: false });

graphViewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || pan || pinch || activeNodeDrags || event.target.closest(".entry-node")) return;
    autoFitPending = false;
    dismissTemporaryReveal();
    camera.stopAnimation();
    const point = { x: event.clientX - graphViewport.getBoundingClientRect().left, y: event.clientY - graphViewport.getBoundingClientRect().top };
    // Background space pans; only the real root marker can identify a Galaxy.
    pan = { id: event.pointerId, type:event.pointerType, x: event.clientX, y: event.clientY, view: { ...camera.view }, galaxyId: galaxyAtScreen(point), moved: false };
    graphViewport.setPointerCapture(event.pointerId);
    graphViewport.classList.add("is-panning");
});
graphViewport.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pan?.id) return;
    if (Math.hypot(event.clientX - pan.x, event.clientY - pan.y) > (pan.type==='touch'?8:3)) {pan.moved = true;lastBodyTap=null;}
    if (!pan.moved) return;
    camera.panTo(pan.view.x + event.clientX - pan.x, pan.view.y + event.clientY - pan.y);
});
function endPan(event) {
    if (event.pointerId !== pan?.id) return;
    const clicked = event.type === "pointerup" && !pan.moved;
    const galaxyId = clicked ? pan.galaxyId : null;
    pan = null;
    graphViewport.classList.remove("is-panning");
    if (graphViewport.hasPointerCapture(event.pointerId)) graphViewport.releasePointerCapture(event.pointerId);
    if (galaxyId) focusEntry(galaxyId,{openInspector:!hierarchySidebar.narrow});
    else if (clicked) closeInspector();
}
["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => graphViewport.addEventListener(type, endPan));
function galaxyAtScreen(point) {
    return [...nodes].filter(([id, node]) => entries.get(id).depth === 0 && node.dataset.culled !== 'true' && node.dataset.semanticHidden !== 'true')
        .find(([, node]) => Math.hypot(point.x-node.renderX, point.y-node.renderY) <= node.renderDiameter/2)?.[0];
}
graphViewport.addEventListener("contextmenu", event => {
    if (event.defaultPrevented) return;
    const rect = graphViewport.getBoundingClientRect();
    const id = galaxyAtScreen({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    if (id) { event.preventDefault(); openContextMenu(id, event.clientX, event.clientY); }
});

function openContextMenu(id, x, y, {surface='canvas'}={}) {
    cancelPendingBodyFocus();lastBodyTap=null;
    if (activeNodeDrags || pan || pinch || !entries.has(id)) return;
    closeContextMenu();

    const entry = entries.get(id);
    contextReturnFocus = nodes.get(id);
    contextEntryId = id; contextMenu.dataset.entryId = id; contextMenu.dataset.surface = surface;
    contextPortalId = null;
    contextMenu.removeAttribute("data-portal-id");
    document.getElementById('constellation-memberships').hidden = true;
    closeContentMenus();
    const selectedGroup=surface==='sidebar'&&hierarchySidebar.getSelectedEntryIds().includes(id);
    contextMenu.dataset.copySelection=String(selectedGroup);
    if (!selectedGroup&&(selectedNode?.dataset.entryId !== id || constellationOverview)) selectEntry(entry, nodes.get(id), { openInspector: false });
    contextMenu.querySelector('[data-action=duplicate-structure]').disabled=hierarchySidebar.getSelectedEntryIds().length>1||(!sampleMode&&!storageAvailable);
    contextMenu.setAttribute("aria-label", `Actions for ${entry.name}`);
    document.getElementById("context-entry-name").textContent = entry.name;
    renderBodyActions();
    positionContextMenu(x, y);
}
function renderBodyActions() {
    const entry=entries.get(contextEntryId);
    contextMenu.dataset.view='full';
    contextMenu.querySelectorAll(':scope > button').forEach(button=>{
        const action=button.dataset.action;
        button.hidden=button.hasAttribute('data-tasks-action')||button.hasAttribute('data-portal-action')||button.hasAttribute('data-collection-context')||
            (button.hasAttribute('data-desktop-only')&&hierarchySidebar.narrow)||
            (button.hasAttribute('data-galaxy-only')&&entry.depth!==0)||
            (action==='paste'&&!canPasteHierarchy(contextEntryId))||
            (action==='constellation'&&constellations.size===0)||
            (contextMenu.dataset.surface==='contents'&&['add-child','add-task-list'].includes(action))||
            (action==='add-child'&&taskStates.get(entry.id)?.task)||
            (action==='add-task-list'&&(taskStates.get(entry.id)?.task||entry.taskList===true));
    });
    contextMenu.querySelectorAll(':scope > [role="separator"]').forEach(item=>item.hidden=item.hasAttribute('data-mobile-only')&&(!hierarchySidebar.narrow||constellations.size===0));
    contextMenu.querySelector('[data-action="add-child"]').textContent=entry.taskList===true?'Add task':'Add item';
}
function toggleBodyActions(button,id,surface='canvas') {
    if(!contextMenu.hidden&&contextEntryId===id&&contextReturnFocus===button){closeContextMenu(true);return;}
    const rect=button.getBoundingClientRect();
    openContextMenu(id,rect.right,rect.bottom,{surface});
    if(contextEntryId===id){contextReturnFocus=button;button.setAttribute('aria-expanded','true');positionBodyActions(button);}
}
// Completed-list dismissal uses the existing menu/focus/positioning machinery.
function openTasksListMenu(id,button) {
    if(!taskStates.get(id)?.list||!taskStates.get(id)?.complete||tasksView.dismissals.ids.has(id))return;
    if(!contextMenu.hidden&&contextMenu.dataset.tasksListId===id){closeContextMenu(true);return;}
    closeContextMenu();closeContentMenus();
    contextEntryId=id;contextReturnFocus=button;contextMenu.dataset.tasksListId=id;
    contextMenu.dataset.entryId=id;contextMenu.dataset.view='full';
    contextMenu.setAttribute('aria-label',`Actions for ${entries.get(id).name}`);
    document.getElementById('context-entry-name').textContent=entries.get(id).name;
    document.getElementById('constellation-memberships').hidden=true;
    contextMenu.querySelectorAll(':scope > button').forEach(item=>item.hidden=item.dataset.action!=='hide-from-tasks');
    contextMenu.querySelectorAll(':scope > [role="separator"]').forEach(item=>item.hidden=true);
    button.setAttribute('aria-expanded','true');contextMenu.hidden=false;positionBodyActions(button);
    contextMenu.querySelector('[data-action="hide-from-tasks"]').focus({preventScroll:true});
}
function positionBodyActions(button) {
    const rect=button.getBoundingClientRect();
    const v=cosmosVisibleViewport();
    // A full phone menu can be taller than either side of its trigger.
    // Scroll it on the roomier side instead of covering the trigger with an action.
    const maxHeight=hierarchySidebar.narrow?Math.max(rect.top-5-v.top-8,v.top+v.height-8-rect.bottom-5):null;
    positionCosmosMenu(contextMenu,rect.right-contextMenu.offsetWidth,rect.bottom+5,{above:rect.top-5,maxHeight});
}
function positionContextMenu(x, y) {
    contextMenu.hidden = false;
    positionCosmosMenu(contextMenu,x,y);
    contextMenu.querySelector('button:not([hidden]):not(:disabled)').focus({ preventScroll: true });
}
function openPortalContextMenu(id, x, y) {
    const portal = portals.get(id), target = entries.get(portal?.targetEntryId);
    if (!target || activeNodeDrags || pan || pinch) return;
    closeContextMenu(); closeContentMenus();
    const row = hierarchySidebar.rows.get(id), button = row?.querySelector('.tree-portal-actions');
    contextPortalId = id; contextReturnFocus = document.activeElement === button ? button : row;
    button?.setAttribute('aria-expanded', 'true');
    contextMenu.removeAttribute("data-entry-id"); contextMenu.dataset.portalId = id;
    contextMenu.setAttribute("aria-label", `Linked item actions for ${target.name}`);
    document.getElementById("context-entry-name").textContent = target.name;
    document.getElementById('constellation-memberships').hidden = true;
    contextMenu.querySelectorAll(":scope > button").forEach(button => { button.hidden = !button.hasAttribute("data-portal-action"); });
    contextMenu.querySelectorAll(':scope > [role="separator"]').forEach(item=>item.hidden=true);
    positionContextMenu(x, y);
}
function closeContextMenu(restoreFocus = false) {
    if (contextMenu.hidden) return;
    if (contextPortalId) hierarchySidebar.rows.get(contextPortalId)?.querySelector('.tree-portal-actions')?.setAttribute('aria-expanded','false');
    if(contextReturnFocus?.hasAttribute('aria-haspopup'))contextReturnFocus.setAttribute('aria-expanded','false');
    contextMenu.hidden = true; contextEntryId = null; contextPortalId = null; contextCollectionId=null;contextMenu.removeAttribute('data-constellation-id');contextMenu.removeAttribute('data-tasks-list-id');
    if (restoreFocus && contextReturnFocus?.isConnected) {
        // Returning keyboard focus must not launch a new Cosmos focus transition.
        keyboardNavigation = false; contextReturnFocus.focus({ preventScroll: true });
    }
    contextReturnFocus = null;
}
contextMenu.addEventListener("click", event => {
    const action = event.target.closest("button")?.dataset.action, id = contextEntryId;
    if(contextCollectionId){
        const collectionId=contextCollectionId;closeContextMenu(true);
        if(action==='collection-rename')constellationWorkspace.openName(collectionId);
        else if(action==='collection-delete')constellationWorkspace.openDelete(collectionId);
        return;
    }
    if (contextPortalId) {
        const portalId = contextPortalId;
        closeContextMenu();
        if (action === "open-portal") openPortal(portalId);
        else if (action === "remove-portal") removePortal(portalId);
        return;
    }
    if(action==='paste'){closeContextMenu(true);void pasteHierarchy(id);return;}
    if (!action || !entries.has(id)) return;
    if(action==='hide-from-tasks'){
        const allowed=contextMenu.dataset.tasksListId===id&&taskStates.get(id)?.complete;
        closeContextMenu();
        if(allowed)tasksView.hideCompleted(id);
        return;
    }
    if(action==='add-child'){
        if(hierarchySidebar.narrow)return;
        closeContextMenu(true);createChildEntry(id);return;
    }
    if(action==='add-task-list'){
        if(hierarchySidebar.narrow)return;
        closeContextMenu(true);createChildEntry(id, true);return;
    }
    if (action === 'constellation') { showConstellationMemberships(id); return; }
    if(action==='copy'){copyHierarchyItems(contextMenu.dataset.copySelection==='true'?hierarchySidebar.getSelectedEntryIds():[id]);closeContextMenu(true);return;}
    if(action==='duplicate-structure'){if(hierarchySidebar.getSelectedEntryIds().length>1)return;closeContextMenu(true);openDuplicateStructure(id);return;}
    closeContextMenu(action === "delete");
    if (action === "move") openEntryForm(entries.get(id),null,false,'move');
    else if (action === "archive") requestGalaxyArchive(id);
    else if (action === "edit") openEntryForm(entries.get(id));
    else if (action === "delete") requestEntryDelete(id);
});
contextMenu.addEventListener("keydown", event => {
    if (event.key === "Escape" || event.key === "Tab") {
        closeContextMenu(true); if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); } return;
    }
    const buttons = [...contextMenu.querySelectorAll('button:not([hidden]):not(:disabled)')].filter(button => button.getClientRects().length), index = buttons.indexOf(document.activeElement);
    const target = { ArrowDown: (index + 1) % buttons.length, ArrowUp: (index + buttons.length - 1) % buttons.length, Home: 0, End: buttons.length - 1 }[event.key];
    if (target !== undefined) { event.preventDefault(); buttons[target].focus(); }
});
document.addEventListener("pointerdown", event => {
    if (!event.target.closest("#entry-context-menu,#mobile-body-more,#entry-more-button,.tree-more")) closeContextMenu();
}, true);
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !contextMenu.hidden) { closeContextMenu(true); event.preventDefault(); }
});
// Reuse the same compact actions on tree rows, including keyboard context menus.
hierarchySidebar.tree.addEventListener("contextmenu", event => {
    const row = event.target.closest(".hierarchy-row");
    if (!row) return;
    event.preventDefault();
    if (row.dataset.portalId) openPortalContextMenu(row.dataset.portalId, event.clientX, event.clientY);
    else openContextMenu(row.dataset.entryId, event.clientX, event.clientY,{surface:'sidebar'});
    contextReturnFocus = row;
});
hierarchySidebar.tree.addEventListener("keydown", event => {
    const row = event.target.closest(".hierarchy-row");
    if (!row || !(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) return;
    event.preventDefault(); const rect = row.getBoundingClientRect();
    if (row.dataset.portalId) openPortalContextMenu(row.dataset.portalId, rect.left + 40, rect.top + rect.height / 2);
    else openContextMenu(row.dataset.entryId, rect.left + 40, rect.top + rect.height / 2,{surface:'sidebar'});
    contextReturnFocus = row;
});
function fitCurrentView(){
    cancelPendingBodyFocus();cancelCanvasTouches();lastBodyTap=null;
    if (hierarchySidebar.narrow) hierarchySidebar.setCollapsed(true);
    autoFitPending = !physics.settled;
    fitGalaxy();
}

document.getElementById('canvas-fit').addEventListener('click',fitCurrentView);
document.getElementById('universe-home').addEventListener('click',()=>{
    if(hierarchySidebar.narrow)mobileSidebarSections.toggle(hierarchySidebar.universeSection);
    else fitCurrentView();
});
for(const [id,factor] of [['canvas-zoom-in',1.35],['canvas-zoom-out',1/1.35]])document.getElementById(id).addEventListener('click',()=>{
    cancelPendingBodyFocus();cancelCanvasTouches();lastBodyTap=null;autoFitPending=false;closeContextMenu();
    const b=physics.bounds;camera.zoomAt((b.left+b.right)/2,(b.top+b.bottom)/2,factor,{source:'user-zoom'});
});

const physics = new GalaxyPhysics({
    onPlacementChange(id, placement) { if (placement) layout.set(id, placement); else layout.delete(id); },
    onTick(particles) {
        const viewport = readRenderViewport();
        if (!galaxy.classList.contains("is-settling")) galaxy.classList.add("is-settling");
        particles.forEach((particle, id) => {
            const entry = entries.get(id);
            if (entry.x !== particle.x || entry.y !== particle.y) {
                graphNeedsSave = true;
            }
            entry.x = particle.x;
            entry.y = particle.y;
        });
        renderGraph(viewport);
    },
    onSettle() {
        const viewport = readRenderViewport();
        galaxy.classList.remove("is-settling");
        renderGraph(viewport);
        if (graphNeedsSave) {
            saveGalaxy();
        }
        if (autoFitPending) { autoFitPending = false; fitGalaxy(); }
    }
});

const attachmentStore = persistence.files;
if (sampleMode) galaxySample.files().forEach(record => attachmentStore.save(record).catch(error=>console.error('Sample file unavailable:',error)));
function publishContent(id,updated){
    const entry=entries.get(id);if(!entry)return;
    if(updated.content)entry.content=updated.content;else delete entry.content;
    if(updated.updatedAt)entry.updatedAt=updated.updatedAt;else delete entry.updatedAt;
    graphNeedsSave=false;
    contentInspector.reconcilePreviews();
}
function saveEntryContent(id,value){return orderedCommand(async()=>{
    const entry=entries.get(id);if(!entry||deletingContentIds.has(id))throw new Error('This item is being deleted or no longer exists.');
    const updated=await universeRepository.updateContent(getGalaxySnapshot,id,typeof value==='function'?value(entry.content||galaxyModel.emptyContent()):value);
    publishContent(id,updated);return updated;
});}
function saveEntryLocation(id,value){return orderedCommand(async()=>{
    const entry=entries.get(id);if(!entry||deletingContentIds.has(id))throw new Error('This item is being deleted or no longer exists.');
    const updated=await universeRepository.updateLocation(getGalaxySnapshot,id,value);
    if(updated.location)entry.location=updated.location;else delete entry.location;entry.updatedAt=updated.updatedAt;graphNeedsSave=false;return updated;
});}
function refreshTaskMetadata() {
    taskStates=cosmosTasks.index(entries);
    entries.forEach(entry=>cosmosTasks.decorate(entry,nodes.get(entry.id),taskStates.get(entry.id)));
    renderTaskContents();
}
function renderTaskContents() {
    hierarchySidebar.refreshTaskControls();
    tasksView.render(entries,taskStates,selectedNode?.dataset.entryId);
    renderCompactTask();
    const id=selectedNode?.dataset.entryId, entry=entries.get(id), task=taskStates.get(id);
    const section=document.getElementById('content-task-section'), control=document.getElementById('content-task-control');
    section.hidden=!entry||!task?.enabled||constellationOverview;
    if(section.hidden)return;
    document.getElementById('task-heading').textContent=task.task?'Task':'Task progress';
    control.hidden=!task.task;
    const checkbox=document.getElementById('content-task-done');
    checkbox.checked=entry.completed===true;checkbox.disabled=taskWritePending||(!sampleMode&&!storageAvailable);
    checkbox.setAttribute('aria-label',`Done: ${entry.name}`);
    document.getElementById('content-task-progress').hidden=task.task;
    document.getElementById('content-task-count').textContent=task.total ? `${task.done} of ${task.total} completed (${Math.round(task.ratio*100)}%)` : '0 tasks';
    document.getElementById('content-task-meter').value=task.ratio;
}
function renderCompactTask() {
    const entry=entries.get(selectedNode?.dataset.entryId),state=taskStates.get(entry?.id);
    const quick=document.getElementById('mobile-task-quick'),wasHidden=quick.hidden;
    quick.hidden=!state?.enabled||constellationOverview;
    document.getElementById('mobile-task-control').hidden=!state?.task;
    const checkbox=document.getElementById('mobile-task-done');
    checkbox.checked=entry?.completed===true;checkbox.disabled=taskWritePending||(!sampleMode&&!storageAvailable);
    checkbox.setAttribute('aria-label',`Done: ${entry?.name||'task'}`);
    const progress=document.getElementById('mobile-task-progress');progress.hidden=!state?.list;
    progress.textContent=state?.list?(state.total?`${state.done} of ${state.total} completed`:'0 tasks'):'';
    if(wasHidden!==quick.hidden&&cameraViewReady&&hierarchySidebar.narrow)updateGraphViewport();
}
function playTaskCompletionPulses() {
    const pending=pendingTaskPulses;pendingTaskPulses=null;
    if(!pending||selectedNode?.dataset.entryId!==pending.id)return;
    pending.ids.filter(id=>taskStates.get(id)?.complete).forEach((id,index)=>motion.taskComplete(nodes.get(id),index*65));
}
function focusCompletedTask(id, ids) {
    const entry=entries.get(id),b=physics.bounds,p=camera.worldToScreen(entry.x,entry.y),scale=camera.view.scale;
    const minimum=entry.depth>=5?1.7:entry.depth===4?1.5:entry.depth===3?1.2:.9;
    const framed=selectedNode?.dataset.entryId===id&&scale>=minimum&&scale<=3&&p.x>b.left+20&&p.x<b.right-20&&p.y>b.top+20&&p.y<b.bottom-20;
    pendingTaskPulses=null;
    // A phone drawer can leave less than one body of canvas. Reveal the CB
    // through ordinary navigation rather than trying to frame that sliver.
    const keepSidebarOpen=!hierarchySidebar.narrow||hierarchySidebar.collapsed||b.right-b.left>=120;
    focusEntry(id,{openInspector:!panel.hidden,keepSidebarOpen,keepFraming:framed});
    pendingTaskPulses={id,ids};
    if(camera.frame===null)playTaskCompletionPulses();
}
function changeTask(id,field,value) {return orderedCommand(async()=>{
    taskWritePending=true;renderTaskContents();
    const errorElement=document.getElementById('content-task-error');errorElement.hidden=true;
    try {
        const before=taskStates;
        const updated=await universeRepository.updateTask(getGalaxySnapshot,id,field,value);
        const entry=entries.get(id);
        if(!entry)return;
        if(typeof updated.completed==='boolean')entry.completed=updated.completed;
        graphNeedsSave=false;refreshTaskMetadata();
        if(field==='completed'&&value){
            const completed=[id,entry.parentId]
                .filter(key=>taskStates.get(key)?.complete&&!before.get(key)?.complete);
            if(completed.includes(id))focusCompletedTask(id,completed);
        } else if(pendingTaskPulses?.id===id) {
            pendingTaskPulses=null;
        }
    } catch(error) {
        errorElement.textContent=error.message||'Task changes could not be saved.';errorElement.hidden=false;
        if(panel.hidden||document.getElementById('content-task-section').hidden)reportStorageFailure(errorElement.textContent);
        throw error;
    } finally {taskWritePending=false;renderTaskContents();}
});}
document.getElementById('content-task-done').addEventListener('change',event=>{
    const id=selectedNode?.dataset.entryId,value=event.target.checked;
    if(id)changeTask(id,'completed',value).catch(()=>{});
});
document.getElementById('mobile-task-done').addEventListener('change',event=>{
    const id=selectedNode?.dataset.entryId;if(id)changeTask(id,'completed',event.target.checked).catch(()=>{});
});
function addEntryAttachment(id,record,metadata){return orderedCommand(async()=>{
    if(!entries.has(id)||deletingContentIds.has(id))throw new Error('This item is being deleted or no longer exists.');
    const updated=await universeRepository.addAttachment(getGalaxySnapshot,id,record,metadata);publishContent(id,updated);return updated;
});}
function removeEntryAttachment(id,key){return orderedCommand(async()=>{
    const updated=await universeRepository.removeAttachment(getGalaxySnapshot,id,key);publishContent(id,updated);return updated;
});}
const motion = new CosmosMotion();
const imageViewer = new CosmifoldImageViewer({store:attachmentStore,getEntry:id=>entries.get(id),
    openExternal:(metadata,blob)=>contentInspector.openNativeFile(metadata,'application/pdf',blob)});
const contentInspector = new EntryContentInspector({ store: attachmentStore, motion, getEntry: id => entries.get(id),
    imageViewer,
    notifyFileFailure,isSessionStale:()=>localSessionStale,
    checkCapacity:(files,options)=>storageCapacity.check(files,options),
    capacityFailure:()=>storageCapacity.failure(),cancelCapacity:()=>storageCapacity.invalidate(),
    save: saveEntryContent, saveLocation:saveEntryLocation, addAttachment:addEntryAttachment,removeAttachment:removeEntryAttachment,
    onAction() { cancelPendingBodyFocus();autoFitPending = false; keyboardNavigation = false; camera.stopAnimation(); },
    onLayout() {
        if (!cameraViewReady) return;
        updateGraphViewport();
    } });
const backupUI=new CosmifoldBackupUI({repository:universeRepository,sample:sampleMode,
    maintenanceBlocked:()=>localDataRecovery||localSessionStale||localRestoreInProgress||!!globalThis.cosmifoldAttachmentRecoveryError,
    session:globalThis.cosmifoldRestoreSession,
    onRestoreStart:()=>{localRestoreInProgress=true;restorePhysicsWasPaused=physics.paused;physics.pause();},
    onRestoreEnd:(success,recoveryRequired=false)=>{
        if(success){contentInspector.hide();contentInspector.clearNativePreviews(true);galaxyAppearance.clearTextures();}
        else if(!recoveryRequired){localRestoreInProgress=false;if(!restorePhysicsWasPaused)physics.resume();}
    },
    blocked:()=>applicationCommandsPending>0||contentInspector.jobs.size>0||deletionBusy||pasteBusy});
const contentDrops=new CosmosContentDrops({host:galaxy,getEntry:id=>entries.get(id),
    tree:hierarchySidebar.tree,expandRow:id=>hierarchySidebar.expandForContentDrag(id),
    blocked:()=>!!document.querySelector('dialog[open]')||activeNodeDrags>0||!!pan||!!pinch||deletionBusy,
    backgroundTarget:event=>{
        if(!event.target.closest('#graph-viewport'))return null;
        const r=graphViewport.getBoundingClientRect(),id=galaxyAtScreen({x:event.clientX-r.left,y:event.clientY-r.top});
        return id?nodes.get(id):null;
    },
    async onDrop(id,transfer){
        if(contentInspector.hasJobs([id])){reportAction('Wait for the current file action to finish.',{reframe:false});return;}
        cancelPendingBodyFocus();autoFitPending=false;camera.stopAnimation();
        if(selectedNode?.dataset.entryId!==id||constellationOverview||panel.hidden)selectEntry(entries.get(id),nodes.get(id),{reframe:false});
        const files=[...transfer.files];
        if(files.length)await contentInspector.upload(files);
        else if(await contentInspector.saveBookmark(cosmosEveryday.droppedAddress(transfer)))contentInspector.renderLists();
    }});
const labelDensity = new LabelDensity();
function requestLabelLayout(force=false) {
    labelDensity.request(()=>{
        // Reuse projected body geometry only if a Galaxy name needs clearance.
        // Names stay attached to their roots; suppress an obscured ordinary
        // anchor instead of moving it around neighboring systems.
        let anchorObstacles=null;
        const getAnchorObstacles=()=>anchorObstacles??=Array.from(nodes.values())
            .filter(node=>node.dataset.culled!=='true'&&node.dataset.semanticHidden!=='true'&&node.dataset.renderSkipped!=='true')
            .map(node=>{const r=node.renderDiameter/2+3;return {left:node.renderX-r,right:node.renderX+r,top:node.renderY-r,bottom:node.renderY+r};});
        const candidates=[],labels=[],offsets=[],rank={galaxy:4,sun:5,planet:6,moon:7,satellite:8,astronaut:9};
        // Only normal orientation envelopes replace the old cutoff. Keep the
        // established Constellation lens disclosure/density behavior intact.
        const minimumOpacity=activeConstellationMembers.size ? .18 : 0;
        nodes.forEach((node,id)=>{
            const entry=entries.get(id),label=node.querySelector('.node-label');
            const muted=node.classList.contains('canvas-selection-muted');
            const selected=selectedNode===node&&!muted,interactive=(!muted&&(hoveredEntryId===id||document.activeElement===node))||node.classList.contains('dragging');
            const search=searchFocusId===id,context=activeConstellationGalaxyIds.has(id)&&entry.depth===0;
            const protectedLabel=selected||interactive||search||context||node.matches('.temporarily-revealed,.constellation-inspected');
            const eligible=node.dataset.culled!=='true'&&node.dataset.semanticHidden!=='true'&&(protectedLabel||node.labelOpacity>minimumOpacity);
            labels.push({id,label,eligible});if(!eligible)return;
            const fontSize=entry.role==='galaxy'?14+2*(1-smoothDetail(camera.view.scale,.18,.50)):
                entry.role==='sun'||node.matches('.temporarily-revealed,.selected-ancestor,.label-priority,.constellation-member,.constellation-inspected')?10:
                entry.role==='planet'?10:10*Math.min(1,camera.view.scale/.62);
            const metricKey=`${entry.name}:${entry.role}:${fontSize}:${selected}:${node.classList.contains('constellation-member')}:${hierarchySidebar.narrow}`;
            if(node.labelMetricKey!==metricKey){
                const measured=label.getBoundingClientRect();
                node.labelMetrics={width:measured.width,height:measured.height};node.labelMetricKey=metricKey;
            }
            const metrics=node.labelMetrics,old=label.edgeOffset||{x:0,y:0};
            const left=node.renderX-metrics.width/2+old.x;
            const top=node.renderY+node.renderDiameter/2+(['satellite','astronaut'].includes(entry.role)?5:4)+old.y;
            // Native fonts/width budgets stay stable while bodies move. Project
            // cached dimensions instead of forcing layout for every label on
            // each motion pass; rename/role/font changes still measure exactly.
            let rect={left,top,right:left+metrics.width,bottom:top+metrics.height,...metrics};const b=physics.bounds;
            if(hierarchySidebar.narrow&&entry.role!=='galaxy'){
                const old=label.edgeOffset||{x:0,y:0},base={left:rect.left-old.x,top:rect.top-old.y,width:rect.width,height:rect.height};
                const near=node.renderX>=b.left-56&&node.renderX<=b.right+56&&node.renderY>=b.top-56&&node.renderY<=b.bottom+56;
                const x=near&&(selected||interactive||search)?Math.max(-120,Math.min(120,Math.max(b.left,Math.min(b.right-base.width,base.left))-base.left)):0;
                const y=near&&(selected||interactive||search)?Math.max(-120,Math.min(120,Math.max(b.top,Math.min(b.bottom-base.height,base.top))-base.top)):0;
                offsets.push({label,x,y});rect={left:base.left+x,top:base.top+y,right:base.left+x+base.width,bottom:base.top+y+base.height,width:base.width,height:base.height};
                const visible=Math.max(0,Math.min(rect.right,b.right)-Math.max(rect.left,b.left))*Math.max(0,Math.min(rect.bottom,b.bottom)-Math.max(rect.top,b.top));
                if(entry.role!=='galaxy'&&!protectedLabel&&visible<rect.width*rect.height*.65)return;
            }else if(label.edgeOffset){offsets.push({label,x:0,y:0});}
            if(entry.role==='galaxy'){
                // Stable below-core anchor at every tier, including explicit
                // reveals. No cloud offsets, cardinal flips or collision nudges.
                rect={left:node.renderX-metrics.width/2,top:node.renderY+node.renderDiameter/2+4,...metrics};
                rect.right=rect.left+rect.width;rect.bottom=rect.top+rect.height;
                const obscured=!protectedLabel&&getAnchorObstacles().some(body=>
                    Math.max(0,Math.min(rect.right,body.right)-Math.max(rect.left,body.left))*
                    Math.max(0,Math.min(rect.bottom,body.bottom)-Math.max(rect.top,body.top))>rect.width*rect.height*.24);
                if(obscured){labels[labels.length-1].eligible=false;return;}
            }
            if(rect.right<b.left||rect.left>b.right||rect.bottom<b.top||rect.top>b.bottom)return;
            // Compact EVA families need a little breathing room between their
            // two-line names. Preserve the collision tolerance and hysteresis;
            // reserve two screen pixels around these local detail labels.
            if(entry.role==='astronaut')rect={left:rect.left-2,top:rect.top-2,right:rect.right+2,bottom:rect.bottom+2};
            const ordinaryRank=activeConstellationMembers.size?rank[entry.role]:cosmosView.labelPriority(entry.role,node.labelOpacity);
            candidates.push({id,rect,protected:protectedLabel,priority:selected?0:interactive?1:search?2:node.classList.contains('selected-ancestor')?3:ordinaryRank-(activeConstellationMembers.has(id) ? .25 : 0)});
        });offsets.forEach(({label,x,y})=>{const old=label.edgeOffset;if(old?.x===x&&old.y===y||!old&&x===0&&y===0)return;label.edgeOffset={x,y};label.style.setProperty('--label-edge-x',`${x}px`);label.style.setProperty('--label-edge-y',`${y}px`);});
        return {candidates,labels};
    },force);
}

const constellationOverlay = new ConstellationOverlay(document.getElementById('constellation-overlay'), id => {
    const node = nodes.get(id);
    return node ? { x: node.renderX, y: node.renderY } : null;
},{motion});
const constellationWorkspace = new ConstellationWorkspace({ entries, portals, collections: constellations,
    getActive: () => activeConstellationId, activate: activateConstellation, inspect: id => focusEntry(id),
    commit: commitConstellations, showMembershipMenu: showConstellationMemberships, overview: showConstellationOverview, onCollectionMenu:openCollectionContextMenu, preferences: persistence.preferences,
    onModal() { closeContextMenu(); closeContentMenus(); beginCrudOperation(); }, onModalClose: finishCrudOperation,
    onLayout() { if (cameraViewReady) updateGraphViewport(); } });

const mobileSidebarSections=new MobileSidebarSections(hierarchySidebar.mobileQuery,
    [hierarchySidebar.universeSection,tasksView.section,constellationWorkspace.section],
    ()=>{if(cameraViewReady)updateGraphViewport();});

function openCollectionContextMenu(id,x,y,trigger){
    cancelPendingBodyFocus();lastBodyTap=null;
    const collection=constellations.get(id);if(!collection||activeNodeDrags||pan||pinch||constellationWorkspace.isDialogOpen())return;
    closeContextMenu();closeContentMenus();contextCollectionId=id;contextReturnFocus=trigger;
    if(trigger?.hasAttribute('aria-haspopup'))trigger.setAttribute('aria-expanded','true');contextMenu.dataset.constellationId=id;
    contextMenu.removeAttribute('data-entry-id');contextMenu.removeAttribute('data-portal-id');
    contextMenu.setAttribute('aria-label',`Actions for Constellation ${collection.name}`);
    document.getElementById('context-entry-name').textContent=collection.name;
    document.getElementById('constellation-memberships').hidden=true;
    contextMenu.querySelectorAll(':scope > button').forEach(button=>button.hidden=!button.hasAttribute('data-collection-context'));
    contextMenu.querySelectorAll(':scope > [role="separator"]').forEach(item=>item.hidden=true);
    positionContextMenu(x,y);
}
constellationWorkspace.list.addEventListener('scroll',()=>{if(contextCollectionId)closeContextMenu();},{passive:true});

function showConstellationMemberships(id) {
    if (!entries.has(id)) return;
    const rect = contextMenu.hidden ? (hierarchySidebar.rows.get(id) || nodes.get(id)).getBoundingClientRect() : contextMenu.getBoundingClientRect();
    contextEntryId = id; contextPortalId = null;
    contextMenu.dataset.entryId = id;
    contextReturnFocus = contextReturnFocus || hierarchySidebar.rows.get(id) || nodes.get(id);
    contextMenu.setAttribute('aria-label', `Add ${entries.get(id).name} to Constellation`);
    document.getElementById('context-entry-name').textContent = 'Add to Constellation';
    contextMenu.querySelectorAll(':scope > button').forEach(button => { button.hidden = true; });
    contextMenu.querySelectorAll(':scope > [role="separator"]').forEach(item=>item.hidden=true);
    const container = document.getElementById('constellation-memberships');
    container.hidden = false; constellationWorkspace.renderMemberships(container, id);
    positionContextMenu(rect.left, rect.top);
}

function commitConstellations(next) {return orderedCommand(async()=>{
    next=typeof next==='function'?next():next;
    if (deletionBusy) throw new Error('Wait for item deletion to finish.');
    autoFitPending = false; keyboardNavigation = false; camera.stopAnimation();
    let records = galaxyConstellations.normalizeAll([...next.values()], allCanonicalEntries());
    if (records.length !== next.size) throw new Error('Choose a valid Constellation name and items.');
    // Publish only after persistence succeeds. Collection edits never rebuild or
    // reheat the graph and never frame the camera.
    records = await universeRepository.replaceConstellations(getGalaxySnapshot, records);
    constellations.clear(); records.forEach(record => constellations.set(record.id, record));
    graphNeedsSave = false;
    if (activeConstellationId && !constellations.has(activeConstellationId)) exitConstellation();
    else refreshConstellation();
});}

function entityPanelMode() {
    constellationOverview = false;
    const closeButton = document.getElementById('close-inspector-button');
    closeButton.setAttribute('aria-label', 'Close contents'); closeButton.title = 'Close contents';
    const panelKind = document.getElementById('panel-kind');
    panelKind.textContent = ''; panelKind.hidden = true;
    document.getElementById('panel-rich-content').hidden = false;
    document.getElementById('constellation-content').hidden = true;
    document.getElementById('constellation-count').hidden = true;
    entryActions.querySelectorAll('button').forEach(button => { button.hidden = button.hasAttribute('data-collection-action')||(button.hasAttribute('data-galaxy-only')&&entries.get(selectedNode?.dataset.entryId)?.depth!==0); });
    updateConstellationIndicator();
}

function updateConstellationIndicator() {
    const collection = constellations.get(activeConstellationId), indicator = document.getElementById('active-constellation-indicator');
    indicator.hidden = !collection || constellationOverview;
    document.getElementById('active-constellation-name').textContent = collection ? `✦ ${collection.name} active` : '';
    document.getElementById('active-constellation-name').title = collection ? `Open ${collection.name} overview` : '';
}
function showConstellationOverview() {
    if (!activeConstellationId || activeNodeDrags) return;
    closeContextMenu(); closeContentMenus(); constellationOverview = true; contentInspector.hide();
    updateConstellationIndicator(); setInspectorOpen(true);
}
document.getElementById('active-constellation-name').addEventListener('click', showConstellationOverview);
document.getElementById('deactivate-constellation-button').addEventListener('click', () => exitConstellation());

function refreshConstellation({animate=false}={}) {
    if(!animate)motion.cancelConstellationIntro();
    const collection = constellations.get(activeConstellationId);
    activeConstellationMembers = new Set((collection?.memberEntryIds || []).filter(id=>entries.has(id)));
    activeConstellationGalaxyIds = galaxyConstellations.galaxyIds(activeConstellationMembers, entries);
    galaxy.classList.toggle('constellation-active', !!collection);
    galaxy.classList.toggle('constellation-has-members', !!collection && activeConstellationMembers.size > 0);
    nodes.forEach((node, id) => node.classList.toggle('constellation-member', activeConstellationMembers.has(id)));
    renderGraph();
    // Only membership changes regenerate topology; tick/zoom/drag updates use
    // the existing n-1 edges and project each live endpoint.
    const points = [...activeConstellationMembers].map(id => ({ id, ...camera.screenToWorld(nodes.get(id).renderX, nodes.get(id).renderY) }));
    if(animate)motion.beginConstellation([...activeConstellationMembers].map(id=>nodes.get(id)));
    constellationOverlay.rebuild(points,{animate});
    constellationWorkspace.renderSidebar();
    updateConstellationIndicator();
    if (collection && constellationOverview) constellationWorkspace.renderPanel();
}

function activateConstellation(id) {
    cancelPendingBodyFocus();lastBodyTap=null;
    if(pinch)cancelCanvasTouches();
    if (activeNodeDrags || deletionBusy || !constellations.has(id)) return;
    if (activeConstellationId === id) { exitConstellation(); return; }
    closeContextMenu(); closeContentMenus(); autoFitPending = false; keyboardNavigation = false; camera.stopAnimation();
    activeConstellationId = id;
    constellationOverview = true;
    contentInspector.hide(); refreshConstellation({animate:true}); setInspectorOpen(true);
    const members = [...activeConstellationMembers];
    if (!members.length) return;
    const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    members.forEach(id => {
        const point = camera.screenToWorld(nodes.get(id).renderX, nodes.get(id).renderY), margin = getNodeRadius(entries.get(id)) + 24;
        bounds.left = Math.min(bounds.left, point.x-margin); bounds.right = Math.max(bounds.right, point.x+margin);
        bounds.top = Math.min(bounds.top, point.y-margin); bounds.bottom = Math.max(bounds.bottom, point.y+margin);
    });
    camera.setView(camera.boundsView(bounds, physics.bounds, { padding: 44, maxScale: members.length === 1 ? 1.7 : 1.1 }), true);
}

function exitConstellation({ restorePanel = true } = {}) {
    if (!activeConstellationId) return;
    const inspectingEntry = !constellationOverview && selectedNode && entries.has(selectedNode.dataset.entryId);
    motion.leaveConstellation(constellationOverlay.element,[...activeConstellationMembers].map(id=>nodes.get(id)));
    camera.stopAnimation(); activeConstellationId = null; refreshConstellation(); entityPanelMode();
    if (!restorePanel) return;
    // The indicator's × clears only the lens, preserving in-progress content
    // editing in an already visible entity panel.
    if (inspectingEntry) { updateGraphViewport(); return; }
    if (selectedNode && entries.has(selectedNode.dataset.entryId)) selectEntry(entries.get(selectedNode.dataset.entryId), selectedNode, { openInspector: !panel.hidden, scroll: false });
    else { panel.hidden = true; contentInspector.hide(); galaxy.classList.remove('inspector-open'); updateGraphViewport(); }
}

function reportStorageFailure(message) {
    storageCapacity.failure();
    storageStatus.textContent = localSessionStale ? staleSessionMessage : message;
    storageStatus.hidden = false;
}

function showLocalDataRecovery(error,{attachment=false}={}) {
    localDataRecovery=true;storageAvailable=false;graphNeedsSave=false;
    entries.clear();archivedEntries.clear();portals.clear();constellations.clear();archivedGalaxies.clear();layout.clear();
    console.error('Cosmifold saved local data could not be loaded:',error);
    galaxy.inert=true;galaxy.setAttribute('aria-hidden','true');
    const recovery=document.getElementById('local-data-recovery');recovery.hidden=false;
    if(attachment){
        document.getElementById('local-data-recovery-title').textContent='A file operation needs attention';
        document.getElementById('local-data-recovery-message').textContent="Cosmifold couldn't finish recovering a file operation. Your saved data has been left unchanged. Reload to try again, or restore a backup.";
    }
    const download=document.getElementById('download-recovery-data'),status=document.getElementById('recovery-status');
    let raw;
    try { raw=persistence.metadata.readForBackup().metadataText; }
    catch { /* Storage access may be denied; never substitute an empty export. */ }
    download.disabled=typeof raw!=='string';
    if(download.disabled){status.hidden=false;status.textContent='This browser is blocking access to the saved data. Allow site storage, then reload to try again.';}
    download.addEventListener('click',()=>{
        cosmifoldObjectUrls.download(new Blob([raw],{type:'application/json'}),`cosmifold-recovery-${new Date().toISOString().slice(0,10)}.json`);
    });
    const restore=document.getElementById('restore-recovery-backup');
    restore.addEventListener('click',()=>{
        backupUI.download.hidden=true;backupUI.trigger.click();backupUI.choose.focus();
    });
    backupUI.dialog.addEventListener('close',()=>restore.focus({preventScroll:true}));
    document.getElementById('reload-recovery-data').addEventListener('click',()=>location.reload());
    document.getElementById('local-data-recovery-title').focus({preventScroll:true});
}

function getGalaxySnapshot() {
    return universeRepository.snapshot({entries: allCanonicalEntries(), portals, constellations, layout, archivedGalaxies});
}

let layoutSavePending=null,layoutSaveAgain=false;
function saveGalaxy(){
    if(localRestoreInProgress||sampleMode||!storageAvailable)return Promise.resolve();
    if(layoutSavePending){layoutSaveAgain=true;graphNeedsSave=true;return layoutSavePending;}
    const result=(async()=>{
        do{
            layoutSaveAgain=false;
            await orderedCommand(async()=>{
                try{await universeRepository.saveLayout(getGalaxySnapshot);graphNeedsSave=layoutSaveAgain;storageStatus.hidden=true;}
                catch(error){graphNeedsSave=true;reportStorageFailure('Changes could not be saved in this browser. They may be lost on refresh.');throw error;}
            });
        }while(layoutSaveAgain);
    })();
    layoutSavePending=result;result.finally(()=>{layoutSavePending=null;}).catch(()=>{});return result;
}

function checkpointGalaxy(){
    if(localRestoreInProgress||applicationCommandsPending||sampleMode||!storageAvailable)return;
    try{if(universeRepository.checkpointLayout(getGalaxySnapshot)!==false)graphNeedsSave=false;}catch{graphNeedsSave=true;reportStorageFailure('Changes could not be saved in this browser. They may be lost on refresh.');}
}

function initializeGalaxy() {
    let saved = null;
    if (sampleMode) {
        saved = universeRepository.load();
    } else {
        try {
            saved = universeRepository.load();
        } catch (error) {
            showLocalDataRecovery(error);
            return;
        }
    }

    if(!sampleMode&&globalThis.cosmifoldAttachmentRecoveryError){showLocalDataRecovery(globalThis.cosmifoldAttachmentRecoveryError,{attachment:true});return;}
    if (saved?.needsCanonicalSave) graphNeedsSave = true;
    const records = saved?.entries || [];
    (saved?.legacy&&!sampleMode ? initialEntries : []).forEach((initialEntry) => {
        const stored = records.find((entry) => entry?.id === initialEntry.id);
        const entry = galaxyModel.normalizeEntry({ ...initialEntry, ...stored }) ||
            galaxyModel.normalizeEntry(initialEntry);
        entries.set(entry.id, entry);
    });
    records.forEach((record) => {
        const entry = galaxyModel.normalizeEntry(record);
        if (entry && !entries.has(entry.id)) entries.set(entry.id, entry);
        if (!entry && !(saved?.legacy && starterIds.has(record?.id)) && !sampleMode) {
            storageAvailable = false;
            reportStorageFailure("Some saved entries are invalid. The original saved data is preserved; changes are available for this session only.");
        }
    });
    if (!sampleMode && records.some(record => record && ["protected", "isProtected", "builtIn", "isBuiltIn"].some(key => Object.hasOwn(record, key)))) graphNeedsSave = true;
    if (!sampleMode && (!saved || saved.migrateTree)) {
        galaxyModel.migrateLegacy(entries, [...initialEntries, ...records]);
        graphNeedsSave = true;
    } else galaxyModel.normalizeHierarchy(entries);
    const savedPortals = saved?.portals || [], normalizedPortals = galaxyPortals.normalizeAll(savedPortals, entries);
    normalizedPortals.forEach(portal => portals.set(portal.id, portal));
    const savedConstellations = saved?.constellations || [], normalizedConstellations = galaxyConstellations.normalizeAll(savedConstellations, entries);
    normalizedConstellations.forEach(collection => constellations.set(collection.id, collection));
    if (!sampleMode && universeRepository.needsCanonicalSave(saved, {portals:normalizedPortals,constellations:normalizedConstellations})) graphNeedsSave = true;
    if (sampleMode) entries.forEach(entry => { entry.seedLayout = true; });
    layout = galaxyModel.normalizeLayout(saved?.layout || [], entries);
    if (!sampleMode && saved?.layout?.some(record => record?.pinned === true)) graphNeedsSave = true;
    try {
        galaxyArchives.normalize(saved?.archivedGalaxies || [], entries).forEach((record,id)=>archivedGalaxies.set(id,record));
        galaxyArchives.split(entries, archivedGalaxies).forEach((entry,id)=>archivedEntries.set(id,entry));
    } catch (error) {
        showLocalDataRecovery(error);
        return;
    }
    taskStates=cosmosTasks.index(entries);
    [...entries.values()].forEach(createEntryNode);
    renderArchivedGalaxies();
    rebuildHierarchyPaths();
    constellationWorkspace.renderSidebar();
}

loadSampleButton.addEventListener("click", async () => {
    if (sampleMode) return;
    // Finish the real graph's pending layout save before leaving it behind.
    physics.pause();
    try{await applicationCommandTail;if(graphNeedsSave)await saveGalaxy();}catch{return;}
    const url = new URL(window.location.href);
    url.searchParams.set("sample", galaxySample.queryValue);
    window.location.assign(url.href);
});
removeSampleButton.addEventListener("click", () => {
    if (sampleMode) window.location.reload();
});

function selectEntry(entry, node, { openInspector = true, reframe = false, scroll = true, preserveSidebarSelection = false } = {}) {
    entityPanelMode();
    closeContentMenus();
    const changingEntry = selectedNode?.dataset.entryId !== entry.id;

    if (selectedNode) {
        selectedNode.classList.remove("selected");
        selectedNode.setAttribute("aria-pressed", "false");
    }

    selectedNode = node;
    updateCameraInspectionLimit();
    document.getElementById('archive-galaxy-button').hidden=entry.depth!==0;
    node.classList.add("selected");
    node.setAttribute("aria-pressed", "true");
    if(changingEntry&&!activeNodeDrags){motion.accent(node,'select');if(entry.role==='astronaut')motion.astronaut(node);}
    refreshPanelHierarchy(entry);
    actionStatus.hidden = true;
    updateHierarchyEmphasis();
    hierarchySidebar.select(entry.id, { scroll, preserveMulti:preserveSidebarSelection });
    if (openInspector && !activeNodeDrags) setInspectorOpen(true, { reframe });
    else { contentInspector.select(entry, !panel.hidden); if (!activeNodeDrags) updateGraphViewport(); }
    if (changingEntry) {
        panel.scrollTop = 0;
        document.getElementById('panel-rich-content').scrollTop=0;
        // Keep the nearest ancestors in view when a deep path exceeds one line.
        panelAncestry.scrollLeft = panelAncestry.scrollWidth;
    }
    panelAncestry.classList.toggle('has-clipped-ancestors', panelAncestry.scrollLeft > 1);
    document.getElementById('content-task-error').hidden=true;
    renderTaskContents();
}

function refreshPanelHierarchy(entry) {
    panelName.textContent=entry.name;
    syncEntryAddControl(entry);
    document.getElementById('archive-galaxy-button').hidden=entry.depth!==0;
    panelAncestry.replaceChildren();
    [...galaxyModel.ancestors(entries,entry.id)].reverse().forEach(ancestor=>{
        const button=document.createElement('button');button.type='button';button.textContent=ancestor.name;button.title=ancestor.name;
        button.addEventListener('click',()=>focusEntry(ancestor.id));panelAncestry.appendChild(button);
    });
    panelAncestry.hidden=!entries.get(entry.parentId);
}

function syncEntryAddControl(entry=entries.get(selectedNode?.dataset.entryId)) {
    if(!entry||constellationOverview)return;
    const add=document.getElementById('entry-add-button');
    add.setAttribute('aria-label',add.title=`Add to ${entry.name}`);
    add.setAttribute('aria-haspopup','menu');
    add.setAttribute('aria-controls','add-menu');
}
function setInspectorOpen(open, { reframe = false } = {}) {
    if (activeNodeDrags || (open && !selectedNode && !activeConstellationId)) return;
    if (!open) closeContentMenus();
    if (open && hierarchySidebar.narrow) {
        panelChangeActive = true;
        try { hierarchySidebar.setCollapsed(true); } finally { panelChangeActive = false; }
    }
    const previous = { ...physics.bounds };
    const reopening = panel.hidden && open;
    panel.hidden = !open;
    if (open && activeConstellationId && constellationOverview) constellationWorkspace.renderPanel();
    else if (open && (reopening || contentInspector.entryId!==selectedNode.dataset.entryId)) contentInspector.select(entries.get(selectedNode.dataset.entryId), true);
    else if (!open) contentInspector.hide();
    galaxy.classList.toggle("inspector-open", open);
    if (reopening) {panel.scrollTop = 0;document.getElementById('panel-rich-content').scrollTop=0;}
    // Measure content geometry without rebuilding physics or navigating.
    // Explicit sidebar/breadcrumb focus uses these updated viewport bounds.
    if (!reframe) { updateGraphViewport(); return; }
    navigationViewportChanged(true, { keepSelectedVisible: open, previous });
}
function closeInspector(restoreFocus = false) {
    if (panel.hidden) return;
    const hadFocus = panel.contains(document.activeElement);
    setInspectorOpen(false);
    if (restoreFocus || hadFocus) {
        keyboardNavigation = false;
        const row = hierarchySidebar.rows.get(selectedNode?.dataset.entryId);
        const target = selectedNode && !selectedNode.inert && selectedNode.dataset.culled !== "true" ? selectedNode :
            !hierarchySidebar.collapsed && hierarchySidebar.tree.contains(row) ? row : hierarchySidebar.toggle;
        target.focus({ preventScroll: true });
    }
}
document.getElementById("close-inspector-button").addEventListener("click", () => {
    const wasOverview=constellationOverview;
    if (wasOverview) exitConstellation({ restorePanel: false });
    if(!wasOverview&&mobileContents?.mobile&&hierarchySidebar.collapsed)mobileContents.collapse();
    else closeInspector(true);
});

function updateHierarchyEmphasis(viewport = readRenderViewport()) {
    renderCompactTask();
    const id = selectedNode?.dataset.entryId, selected = physics.particles.get(id);
    const actions = document.getElementById('mobile-body-actions'), entry = entries.get(id);
    actions.hidden = !entry || constellationOverview;
    if (entry) {
        document.getElementById('mobile-body-name').textContent = entry.name;
        actions.setAttribute('aria-label', `Selected item: ${entry.name}`);
        document.getElementById('mobile-body-add').setAttribute('aria-label', `Add to ${entry.name}`);
        document.getElementById('mobile-body-more').setAttribute('aria-label', `Actions for ${entry.name}`);
    }
    regions.forEach((region, galaxyId) => region.classList.toggle('is-selected', galaxyId === id && selectedNode?.dataset.body === 'galaxy'));
    galaxy.classList.toggle("has-selection", !!selected);
    const ancestorIds = new Set(selected ? galaxyModel.ancestors(entries, id).map(entry => entry.id) : []);
    const relatedIds = new Set(ancestorIds);
    if (selected) {
        physics.children.get(id)?.forEach(node => relatedIds.add(node.id));
        if (selected.parent) physics.children.get(selected.parent.id).forEach(node => relatedIds.add(node.id));
    }
    nodes.forEach((element, nodeId) => {
        const particle = physics.particles.get(nodeId);
        element.classList.toggle("related", relatedIds.has(nodeId));
        element.classList.toggle("selected-ancestor", ancestorIds.has(nodeId));
        element.classList.toggle("in-system", !!selected && particle?.systemId === selected.systemId && !!selected.systemId);
        element.classList.toggle("in-galaxy", !!selected && particle?.galaxyId === selected.galaxyId);
    });
    lines.forEach(({ from, to, element }) => element.classList.toggle("selected", from === id || to === id));
    entries.forEach(entry => renderNode(entry, nodes.get(entry.id), viewport));
    updateHierarchyPaths(viewport); updateOrbitGuides(viewport);
    requestLabelLayout(true);
}

// Initial entries and form submissions share all rendering and interactions.
function createEntryNode(entry) {
    const viewport = readRenderViewport();
    const node = document.createElement("button");
    node.type = "button";
    node.classList.add("entry-node");
    const label = document.createElement("span");
    label.className = "node-label";
    node.appendChild(label);
    if(entry.depth>=2){const hit=document.createElement('span');hit.className='node-hit-area';hit.ariaHidden='true';node.append(hit);}
    updateEntryNode(entry, node);
    node.dataset.entryId = entry.id;
    node.setAttribute("aria-pressed", "false");
    node.addEventListener("click", event => {
        if (event.detail && didMove) return;
        if(event.detail&&isCanvasTouchClick(event)){
            const now=performance.now(),double=lastBodyTap?.id===entry.id&&now-lastBodyTap.time<=320&&Math.hypot(event.clientX-lastBodyTap.x,event.clientY-lastBodyTap.y)<=24;
            if(double){lastBodyTap=null;focusEntry(entry.id,{closeFocus:true,openInspector:false});return;}
            lastBodyTap={id:entry.id,time:now,x:event.clientX,y:event.clientY};selectEntry(entry,node,{openInspector:false});return;
        }
        if(event.detail>=2){cancelPendingBodyFocus();return;}
        if(event.detail&&(activeConstellationId||entry.depth<=1)){
            selectEntry(entry,node,{openInspector:!hierarchySidebar.narrow});pendingBodyFocusTimer=setTimeout(()=>{pendingBodyFocusTimer=null;if(selectedNode===node&&!crudActive&&!activeNodeDrags&&!pan&&!pinch)focusEntry(entry.id,{openInspector:!hierarchySidebar.narrow});},320);return;
        }
        if (activeConstellationId) { focusEntry(entry.id,{openInspector:!hierarchySidebar.narrow}); return; }
        if (entry.depth <= 1) focusEntry(entry.id,{openInspector:!hierarchySidebar.narrow});
        else selectEntry(entry, node, {openInspector:!hierarchySidebar.narrow});
    });
    node.addEventListener('dblclick',event=>{if(isCanvasTouchClick(event)||didMove)return;event.preventDefault();cancelPendingBodyFocus();lastBodyTap=null;focusEntry(entry.id,{closeFocus:true,openInspector:!hierarchySidebar.narrow});});
    node.addEventListener("contextmenu", event => {
        event.preventDefault(); event.stopPropagation();
        const rect = node.getBoundingClientRect();
        openContextMenu(entry.id, event.clientX || rect.left + rect.width / 2, event.clientY || rect.top + rect.height / 2);
    });
    node.addEventListener("keydown", event => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault(); const rect = node.getBoundingClientRect();
            openContextMenu(entry.id, rect.left + rect.width / 2, rect.top + rect.height / 2);
        }
    });
    node.addEventListener("focus", () => {
        // Browsers can restore old focus when a window receives pointer input.
        // Only intentional keyboard navigation should move the camera on focus.
        if (!crudActive && !activeNodeDrags && keyboardNavigation) focusEntry(entry.id);
        renderNode(entry,node);requestLabelLayout(true);updateHierarchyPaths();
    });
    node.addEventListener('blur',()=>{renderNode(entry,node);requestLabelLayout(true);updateHierarchyPaths();});
    node.addEventListener("pointerenter", () => {
        hoveredEntryId=entry.id;renderNode(entry,node);requestLabelLayout(true);updateHierarchyPaths();
        hoveredSystemId = physics.particles.get(entry.id)?.systemId || null;
        updateOrbitGuides();
    });
    node.addEventListener("pointerleave", () => {
        if(hoveredEntryId===entry.id)hoveredEntryId=null;renderNode(entry,node);requestLabelLayout(true);updateHierarchyPaths();
        hoveredSystemId = null;
        updateOrbitGuides();
    });

    let dragPointerId = null;
    let didMove = false;
    let offsetX = 0;
    let offsetY = 0;
    let dragPointerType=null;
    const browsingAnotherBody=()=>mobileContents?.mobile&&mobileContents.state==='browse'&&contentInspector.entryId!==entry.id;

    node.addEventListener("pointerdown", (event) => {

        if (event.button !== 0 || dragPointerId !== null || pan || pinch) return;
        dismissTemporaryReveal();
        camera.stopAnimation();
        const point = pointerInWorld(event);
        offsetX = point.x - entry.x;
        offsetY = point.y - entry.y;
        physics.beginDrag(entry.id);
        autoFitPending = false;
        activeNodeDrags++;
        dragPointerId = event.pointerId;
        dragPointerType=event.pointerType;
        didMove = false;
        node.classList.add("dragging");
        if(event.pointerType!=='touch'&&!browsingAnotherBody())selectEntry(entry, node);
        node.setPointerCapture(event.pointerId);
    });

    node.addEventListener("pointermove", (event) => {
        if (event.pointerId !== dragPointerId || !node.hasPointerCapture(event.pointerId)) return;
        const point = pointerInWorld(event);
        const x = point.x - offsetX;
        const y = point.y - offsetY;
        if (didMove || Math.hypot(x - entry.x, y - entry.y) * camera.view.scale > (dragPointerType==='touch'?8:3)) {
            lastBodyTap=null;
            if(!didMove&&dragPointerType==='touch'&&!browsingAnotherBody())selectEntry(entry,node);
            didMove = true;
            physics.moveDrag(entry.id, x, y);
        }
    });

    function endDrag(event,{handoff=false}={}) {
        if (event.pointerId !== dragPointerId) return;
        const viewport = readRenderViewport();
        dragPointerId = null;
        dragPointerType=null;
        activeNodeDrags--;
        const placement = physics.endDrag(entry.id, didMove);
        node.classList.remove("dragging");
        renderNode(entry, node, viewport);
        if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
        if (didMove) {
            if (placement) layout.set(entry.id, placement); else layout.delete(entry.id);
            saveGalaxy();
            // Mobile canvas gestures select/place bodies; View contents owns opening the sheet.
            if(!handoff&&!(hierarchySidebar.narrow&&hierarchySidebar.collapsed))setInspectorOpen(true);
            if(!handoff&&entry.role==='astronaut')motion.astronaut(node,true);
        }
    }
    ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => node.addEventListener(type, endDrag));
    node.cancelTouchDrag=()=>{
        if(dragPointerId===null||dragPointerType!=='touch')return;
        // Preserve a real drag already made; a stationary pinch origin changes no placement.
        endDrag({pointerId:dragPointerId,type:'pointercancel'},{handoff:true});
    };
    entries.set(entry.id, entry);
    nodes.set(entry.id, node);
    nodesLayer.appendChild(node);
    renderNode(entry, node, viewport);
    return node;
}

// Editing reuses the same appearance renderer without duplicating DOM or handlers.
function updateEntryNode(entry, node) {
    renderCelestialBody(entry, node);
    cosmosTasks.decorate(entry,node,taskStates.get(entry.id));
}

function getNewEntryPosition(targetIds, role, sourceEntries=entries) {
    const targets = targetIds.map((id) => sourceEntries.get(id));
    const bounds = physics.bounds;
    const center = targets.length ? {
        x: targets.reduce((sum, entry) => sum + entry.x, 0) / targets.length,
        y: targets.reduce((sum, entry) => sum + entry.y, 0) / targets.length
    } : { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
    const radius = getNodeRadius({ role });
    const spacing = radius * 2 + 24;
    for (let ring = 1; ring <= 3; ring++) {
        for (let step = 0; step < 12; step++) {
            const angle = sourceEntries.size * 2.4 + step * Math.PI / 6;
            const point = { x: center.x + Math.cos(angle) * spacing * ring,
                y: center.y + Math.sin(angle) * spacing * ring };
            if ([...sourceEntries.values()].every((entry) =>
                Math.hypot(point.x - entry.x, point.y - entry.y) >= radius + getNodeRadius(entry) + 24
            )) {
                return point;
            }
        }
    }
    return center;
}

function getNodeRadius(entry) {
    return baseNodeRadius * (entry ? entryRoles[entry.role].scale : 1);
}

function syncPhysicsGraph({ updateUI = true, reheat = .55 } = {}) {
    galaxyModel.normalizeHierarchy(entries);
    refreshTaskMetadata();
    if (updateUI) entries.forEach(entry => updateEntryNode(entry, nodes.get(entry.id)));
    physics.setGraph([...entries.values()].map(({ id, role, depth, parentId, x, y, seedLayout }) =>
        ({ id, role, depth, parentId, x, y, seedLayout, sizeScale: entryRoles[role].scale })), layout, { reheat });
    // Seeding can move fresh particles synchronously. Use the
    // actual coordinates for the first render, save and Add/focus handoff.
    physics.particles.forEach((particle, id) => {
        const entry = entries.get(id);
        if (entry.x !== particle.x || entry.y !== particle.y) graphNeedsSave = true;
        entry.x = particle.x; entry.y = particle.y;
    });
    entries.forEach(entry => { entry.seedLayout = false; });
    // Reparenting invalidates only that entry's parent-relative influence.
    layout.forEach((placement, id) => {
        if (!archivedEntries.has(id)&&placement.parentId !== entries.get(id)?.parentId) layout.delete(id);
    });
    if (!updateUI) return;
    hierarchySidebar.setEntries(entries);
    hierarchySidebar.select(selectedNode?.dataset.entryId);
    rebuildOrbitGuides(); updateHierarchyEmphasis(); renderGraph();
}

function updateGraphViewport() {
    syncEntryAddControl();
    document.getElementById('mobile-body-contents').setAttribute('aria-expanded', String(!panel.hidden));
    document.getElementById('entry-more-button').setAttribute('aria-controls',constellationOverview?'entry-actions':'entry-context-menu');
    mobileContents?.sync({mobile:hierarchySidebar.narrow,open:!panel.hidden,available:!constellationOverview});
    selectedTitleEditors.forEach(editor=>editor.sync());
    const rect = galaxy.getBoundingClientRect(), narrow=hierarchySidebar.narrow;
    const viewportStyle=getComputedStyle(galaxy);
    const insets=narrow?Object.fromEntries(['top','right','bottom','left'].map(edge=>[edge,parseFloat(viewportStyle.getPropertyValue('--canvas-safe-'+edge))||0])):{};
    baseNodeRadius = parseFloat(viewportStyle.getPropertyValue("--node-size")) / 2;
    const measuredPanel=panel.hidden?null:panel.getBoundingClientRect();
    // Sheet animations translate visually; available bounds use its settled
    // layout edge, so preview loads cannot cache a mid-animation position.
    const panelRect=measuredPanel?{left:measuredPanel.left,top:rect.top+panel.offsetTop}:null;
    const card=document.getElementById('mobile-body-actions');
    const compact=narrow&&selectedNode&&panel.hidden&&!card.hidden&&hierarchySidebar.collapsed?card.getBoundingClientRect():null;
    usableCanvasBounds={...MobileContentsSheet.canvasBounds({viewport:rect,visible:cosmosVisibleViewport(),
        sidebar:hierarchySidebar.collapsed?null:hierarchySidebar.sidebar.getBoundingClientRect(),
        sheet:panelRect,sideSheet:!narrow,compact,insets}),
        contentsState:narrow?(panel.hidden?'compact':constellationOverview?'overview':'browse'):'desktop',sidebarOpen:!hierarchySidebar.collapsed};
    if(panelRect&&narrow)panel.style.setProperty('--sheet-header-height',`${panel.querySelector('.content-panel-header').offsetHeight+8}px`);
    const radius=getNodeRadius(),inset=radius+24,b=usableCanvasBounds;
    const bounds={left:b.left+inset,top:b.top+inset,right:Math.max(b.left+inset,b.right-inset),bottom:Math.max(b.top+inset,b.bottom-inset)};
    // Sidebar chrome changes the usable screen, never orbital targets or forces.
    if (physics.baseNodeRadius !== radius) physics.setViewport(bounds, radius);
    else physics.bounds = bounds;
}

function navigationViewportChanged(animate = true, { keepSelectedVisible = false, previous = physics.bounds } = {}) {
    cancelPendingBodyFocus();lastBodyTap=null;
    autoFitPending = false;
    const menuHadFocus=!!document.activeElement?.closest('#add-menu,#entry-context-menu');
    cancelCanvasTouches();closeContextMenu();closeContentMenus();closePanelItemMenus();dismissTemporaryReveal();
    if(menuHadFocus&&hierarchySidebar.narrow&&hierarchySidebar.collapsed)hierarchySidebar.toggle.focus({preventScroll:true});
    if (hierarchySidebar.narrow && !hierarchySidebar.collapsed) {
        panel.hidden = true; galaxy.classList.remove("inspector-open");
        closeContentMenus(); contentInspector.hide();
    }
    const before = { x: (previous.left + previous.right) / 2, y: (previous.top + previous.bottom) / 2 };
    updateGraphViewport();
    const bounds = physics.bounds;
    const view = { x: camera.view.x + (bounds.left + bounds.right) / 2 - before.x,
        y: camera.view.y + (bounds.top + bounds.bottom) / 2 - before.y, scale: camera.view.scale };
    const entry = entries.get(selectedNode?.dataset.entryId);
    if (keepSelectedVisible && entry?.depth > 0) {
        const margin = Math.max(24, getNodeRadius(entry) * view.scale);
        const padX = Math.min(margin, (bounds.right - bounds.left) / 3), padY = Math.min(margin, (bounds.bottom - bounds.top) / 3);
        const x = entry.x * view.scale + view.x, y = entry.y * view.scale + view.y;
        view.x += Math.max(bounds.left + padX, Math.min(bounds.right - padX, x)) - x;
        view.y += Math.max(bounds.top + padY, Math.min(bounds.bottom - padY, y)) - y;
    }
    if (view.x !== camera.view.x || view.y !== camera.view.y) camera.setView(view, animate);
}

function galaxyBounds() {
    if (!entries.size) return null;
    const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    // Include simplified/hidden descendants too: changing zoom must not crop them.
    entries.forEach(entry => {
        const radius = entry.depth === 0 ? 24 : getNodeRadius(entry);
        bounds.left = Math.min(bounds.left, entry.x - radius - 28);
        bounds.right = Math.max(bounds.right, entry.x + radius + 28);
        bounds.top = Math.min(bounds.top, entry.y - radius - 12);
        bounds.bottom = Math.max(bounds.bottom, entry.y + radius + 44);
    });
    return bounds;
}

function fitGalaxy(animate = true) {

    dismissTemporaryReveal();
    if(hierarchySidebar.narrow)syncMobileViewport();
    updateGraphViewport();
    if(hierarchySidebar.narrow){
        const viewport=mobileFitViewport();
        if(viewport)camera.fitBounds(galaxyBounds(),viewport,{padding:Math.min(16,viewport.width*.08,viewport.height*.08),animate});
        else camera.stopAnimation();
        return;
    }
    camera.fitBounds(galaxyBounds(), physics.bounds, { padding: 32, animate });
}

function mobileFitViewport() {
    const b=usableCanvasBounds;
    return b&&b.width>=120&&b.height>=96?b:null;
}

// A one-shot snapshot of the actual family, not its old normalized/cloud layout.
// Label budgets come from cached native metrics or existing CSS width budgets.
function mobileFamilyView(ids,viewport,maxScale) {
    const points=[...ids].map(id=>{
        const entry=entries.get(id),node=nodes.get(id),role=entry.role;
        const revealed=selectedNode===node||hoveredEntryId===id||document.activeElement===node||searchFocusId===id||focusRevealIds.has(id)||node.matches('.dragging,.temporarily-revealed');
        const maxWidth=role==='galaxy'?180:Math.max(64,46*entryRoles[role].scale+(selectedNode===node?52:22));
        return {id,role,x:entry.x,y:entry.y,radius:getNodeRadius(entry),revealed,member:activeConstellationMembers.has(id),
            labelWidth:Math.min(maxWidth,node.labelMetrics?.width*1.15||maxWidth),
            ring:!!node.querySelector('.planet-rings')};
    });
    return camera.projectedBoundsView(scale=>{
        const detail=cosmosView.detail(scale),lens=activeConstellationMembers.size>0;
        const bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
        for(const p of points){
            const renderedScale=Math.max(scale,lens&&(p.member||p.revealed) ? .38 : p.revealed ? .35 : 0);
            const diameter=p.role==='galaxy'?cosmosView.galaxyDiameter(scale):cosmosView.renderedDiameter(p.role,p.radius*2,renderedScale,p.revealed||lens&&p.member?1:detail[p.role]);
            const radius=diameter/2+4,halfWidth=p.ring&&scale>.28?Math.max(radius,diameter*.84):radius;
            const label=p.revealed||(lens?cosmosView.constellationVisibility(scale,p.role,{member:p.member},detail).label:cosmosView.labelDisclosure(p.role,scale,p.id,detail))>0;
            const x=p.x*scale,y=p.y*scale;
            bounds.left=Math.min(bounds.left,x-Math.max(halfWidth,label?p.labelWidth/2:0));
            bounds.right=Math.max(bounds.right,x+Math.max(halfWidth,label?p.labelWidth/2:0));
            bounds.top=Math.min(bounds.top,y-radius);
            bounds.bottom=Math.max(bounds.bottom,y+radius+(label?(p.role==='galaxy'?44:29):0));
        }
        return bounds;
    },viewport,{padding:16,maxScale});
}

function dismissTemporaryReveal() {
    focusRevealIds.clear();
    searchOpen = false;
    searchResults.hidden = true;
    renderGraph();
}

// CRUD may nudge a completely offscreen item to the nearest usable edge. Never
// change scale or center a whole family; partial visibility already suffices.
function revealEntry(entry) {
    if (activeNodeDrags) return;
    const bounds = physics.bounds;
    const rect = nodes.get(entry.id).getBoundingClientRect(), viewport = graphViewport.getBoundingClientRect();
    const left = rect.left-viewport.left, right = rect.right-viewport.left;
    const top = rect.top-viewport.top, bottom = rect.bottom-viewport.top;
    const dx = right<bounds.left ? bounds.left+12-left : left>bounds.right ? bounds.right-12-right : 0;
    const dy = bottom<bounds.top ? bounds.top+12-top : top>bounds.bottom ? bounds.bottom-12-bottom : 0;
    if (dx || dy) camera.panTo(camera.view.x+dx,camera.view.y+dy);
}

// Pass-local dimensions: sample before writes, never retain across frames or UI changes.
function readRenderViewport() {
    return { width: window.innerWidth, height: window.innerHeight };
}

// Screen-space arithmetic only. Retain a generous edge buffer for labels,
// glows and the next pan/zoom frame; never read body layout in this hot path.
function outsideRenderBounds(left, top, right, bottom, viewport, margin = 0) {
    return right + margin < 0 || bottom + margin < 0 ||
        left - margin > viewport.width || top - margin > viewport.height;
}

function setRenderSkipped(element, skipped) {
    if (element.dataset.renderSkipped !== String(skipped)) element.dataset.renderSkipped = String(skipped);
    return skipped;
}

function setRenderClass(element, name, enabled) {
    if (element.classList.contains(name) !== !!enabled) element.classList.toggle(name, enabled);
}

function hasRenderException(entry, node) {
    return selectedNode === node || hoveredEntryId === entry.id || document.activeElement === node ||
        searchFocusId === entry.id || focusRevealIds.has(entry.id) || physics.dragging.has(entry.id) ||
        node.matches('.dragging,.selected-ancestor') || (searchOpen && node.matches('.search-match,.search-ancestor')) ||
        activeConstellationMembers.has(entry.id) || (entry.depth === 0 && activeConstellationGalaxyIds.has(entry.id));
}

function relationshipOutside(start, end, viewport) {
    const a = camera.worldToScreen(start.x, start.y), b = camera.worldToScreen(end.x, end.y);
    // Include the quadratic tether's maximum slack as well as stroke/edge room.
    return outsideRenderBounds(Math.min(a.x,b.x), Math.min(a.y,b.y), Math.max(a.x,b.x), Math.max(a.y,b.y), viewport, 32 + 18 * camera.view.scale);
}

function renderNode(entry, node, viewport = readRenderViewport()) {
    const particle = physics.particles.get(entry.id);
    const point = camera.worldToScreen(entry.x, entry.y);
    // Subpixel settling should not invalidate an otherwise cached body layer
    // for imperceptible motion. Quarter-pixel projection keeps the live SVG
    // endpoints aligned within .18px without changing world/camera coordinates.
    point.x = Math.round(point.x * 4) / 4; point.y = Math.round(point.y * 4) / 4;
    // Explicit selection/search/focus stays discoverable at overview scales.
    const revealed = selectedNode===node || hoveredEntryId===entry.id || document.activeElement===node || searchFocusId===entry.id || focusRevealIds.has(entry.id) || node.classList.contains("dragging") ||
        (searchOpen && node.matches(".search-match,.search-ancestor"));
    const lens = activeConstellationMembers.size > 0;
    // Protection keeps interaction/context current even outside the viewport.
    node.renderProtected = hasRenderException(entry, node);
    const priority = selectedNode === node || node.classList.contains('dragging') || revealed;
    const visibility = lens ? cosmosView.constellationVisibility(camera.view.scale, entry.role,
        { member: activeConstellationMembers.has(entry.id), priority }, semanticDetail) : null;
    const galaxyContext = lens && entry.depth === 0 && activeConstellationGalaxyIds.has(entry.id);
    if (galaxyContext) {
        visibility.body = priority || activeConstellationMembers.has(entry.id) ? 1 : .68;
        visibility.label = 1;
    }
    // Logical visibility/accessibility stays current even while visual details
    // are suspended. These attributes only change at an actual state transition.
    const hidden = lens ? visibility.body < .02 : entry.depth > 0 && !revealed && semanticDetail[entry.role] < .02;
    if (node.dataset.semanticHidden !== String(hidden)) node.dataset.semanticHidden = String(hidden);
    if (node.inert !== hidden) node.inert = hidden;
    setRenderClass(node, 'canvas-selection-muted', false);
    setRenderClass(node, 'temporarily-revealed', revealed);
    setRenderClass(node, 'label-priority', selectedNode===node||hoveredEntryId===entry.id||document.activeElement===node||searchFocusId===entry.id||node.classList.contains('dragging'));
    setRenderClass(node, 'constellation-galaxy-context', galaxyContext);
    setRenderClass(node, 'constellation-inspected', lens && priority);
    setRenderClass(node, 'constellation-label-hidden', lens && visibility.label < .02);
    node.labelOpacity=visibility?visibility.label:revealed?1:cosmosView.labelDisclosure(entry.role,camera.view.scale,entry.id,semanticDetail,terminalLabelIds.has(entry.id));
    // Only terminal branches override shared role opacity. The lens and all
    // explicit reveal/priority rules retain their existing ownership.
    if(!lens&&terminalLabelIds.has(entry.id)){
        const value=String(node.labelOpacity);
        if(node.style.getPropertyValue('--terminal-label-opacity')!==value)node.style.setProperty('--terminal-label-opacity',value);
    }else if(node.style.getPropertyValue('--terminal-label-opacity'))node.style.removeProperty('--terminal-label-opacity');
    const diameter = entry.depth === 0 ? cosmosView.galaxyDiameter(camera.view.scale) : cosmosView.renderedDiameter(entry.role, getNodeRadius(entry) * 2,
        Math.max(camera.view.scale, lens && (activeConstellationMembers.has(entry.id) || priority) ? .38 : revealed ? .35 : 0),
        revealed || lens && activeConstellationMembers.has(entry.id) ? 1 : semanticDetail[entry.role]);
    const margin = Math.max(100, diameter + 64);
    const culled = outsideRenderBounds(point.x, point.y, point.x, point.y, viewport, margin);
    node.renderDiameter = diameter;
    if (node.dataset.culled !== String(culled)) node.dataset.culled = String(culled);
    if (setRenderSkipped(node, culled && !node.renderProtected)) return;
    // Ordinary role opacity is shared on the viewport. Deep names retain the
    // same CSS path as explicit reveals; logical opacity still feeds density.
    if(entry.role==='satellite'||entry.role==='astronaut')node.style.setProperty('--detail-label-opacity',node.labelOpacity);
    if (visibility) {
        node.style.setProperty('--constellation-body-opacity', visibility.body);
        node.style.setProperty('--constellation-label-opacity', visibility.label);
    }
    if (cameraViewReady && particle && !culled && !hidden && entry.depth > 0 && !["satellite", "astronaut"].includes(entry.role) && camera.view.scale >= .68) galaxyAppearance.prepareTextures(node, diameter);
    if (node.renderX === point.x && node.renderY === point.y) return;
    node.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`;
    node.renderX = point.x;
    node.renderY = point.y;
}

function renderGraph(viewport = readRenderViewport()) {
    entries.forEach((entry) => renderNode(entry, nodes.get(entry.id), viewport));
    updateHierarchyPaths(viewport);
    updateOrbitGuides(viewport);
    constellationOverlay.update();
    requestLabelLayout();
}

function rebuildOrbitGuides() {
    orbitGuides.forEach(({ element }) => element.remove());
    orbitGuides.length = 0;
    physics.particles.forEach(node => {
        if (!node.childOrbit) return;
        const element = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
        element.setAttribute("aria-hidden", "true");
        element.classList.add("orbit-guide");
        element.dataset.role = node.role;
        hierarchyLayer.prepend(element);
        orbitGuides.push({ id: node.id, element });
    });
}

function updateOrbitGuides(viewport = readRenderViewport()) {
    const selected = physics.particles.get(selectedNode?.dataset.entryId);
    const systemId = selected?.systemId || hoveredSystemId;
    const contextParents = new Set();
    if (selected?.systemId) contextParents.add(selected.systemId);
    if (selected && camera.view.scale >= cosmosView.tiers.close) {
        if (selected.childOrbit) contextParents.add(selected.id);
        if (selected.parent?.depth >= 2) contextParents.add(selected.parentId);
    }

    orbitGuides.forEach(({ id, element }) => {
        const parent = physics.particles.get(id);
        const active = !!parent && camera.view.scale > cosmosView.tiers.system && parent.systemId === systemId &&
            (selected ? contextParents.has(id) : parent.depth === 1);
        if (element.dataset.active !== String(active)) element.dataset.active = String(active);
        const point = parent && camera.worldToScreen(parent.x, parent.y), radius = (parent?.childOrbit || 0) * camera.view.scale;
        if (setRenderSkipped(element, !active || (!nodes.get(id)?.renderProtected &&
            outsideRenderBounds(point.x-radius, point.y-radius, point.x+radius, point.y+radius, viewport, 100)))) return;
        // One preferred band per parent, never a separate arc/ring per child.
        // Manual bodies can freely leave the band; guides do not constrain them.
        if (element.renderX !== parent.x || element.renderY !== parent.y || element.renderRadius !== parent.childOrbit) {
            element.setAttribute("cx", parent.x);
            element.setAttribute("cy", parent.y);
            element.setAttribute("rx", parent.childOrbit);
            element.setAttribute("ry", parent.childOrbit);
            element.renderX = parent.x;
            element.renderY = parent.y;
            element.renderRadius = parent.childOrbit;
        }
    });
}

function updateHierarchyPaths(viewport = readRenderViewport()) {
    const selected = physics.particles.get(selectedNode?.dataset.entryId);
    const ancestry = selected ? new Set([selected.id, ...galaxyModel.ancestors(entries, selected.id).map(entry => entry.id)]) : new Set();
    lines.forEach(link => {
        const { from, to, element } = link;
        const fromEntry = entries.get(from);
        const toEntry = entries.get(to);
        // Selection clears during deletion before the derived edge list rebuilds.
        if (!fromEntry || !toEntry) return;
        const start = fromEntry, end = toEntry;
        const tether = element.classList.contains('astronaut-tether');
        if (!tether) {
            const child = physics.particles.get(to);
            const selectedAncestry = selected?.depth >= 3 && ancestry.has(to) && ancestry.has(from) && fromEntry.depth > 0;
            const stretched = selected && (from === selected.id || to === selected.id) && child &&
                Math.hypot(toEntry.x - fromEntry.x, toEntry.y - fromEntry.y) > child.orbitRadius * 1.6;
            const active = camera.view.scale > cosmosView.tiers.system && (!!selectedAncestry || !!stretched || physics.dragging.has(to));
            element.classList.toggle('context-link', active);
            if (!active) { setRenderSkipped(element, true); return; }
        }
        // A crossing segment is retained even if both bodies are offscreen.
        // Context endpoints always retain geometry, independently of culling.
        if (setRenderSkipped(element, !nodes.get(from)?.renderProtected && !nodes.get(to)?.renderProtected && relationshipOutside(start,end,viewport))) return;
        if (element.renderFromX !== start.x || element.renderFromY !== start.y ||
            element.renderToX !== end.x || element.renderToY !== end.y) {
            element.setAttribute("x1", start.x);
            element.setAttribute("y1", start.y);
            element.setAttribute("x2", end.x);
            element.setAttribute("y2", end.y);
            if (element.classList.contains("astronaut-tether")) {
                const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy) || 1;
                const slack = Math.min(18, length * .18) * (galaxyAppearance.hash(`${from}:${to}`) % 2 ? 1 : -1);
                element.setAttribute("d", `M${start.x},${start.y} Q${(start.x+end.x)/2-dy/length*slack},${(start.y+end.y)/2+dx/length*slack} ${end.x},${end.y}`);
            }
            element.renderFromX = start.x;
            element.renderFromY = start.y;
            element.renderToX = end.x;
            element.renderToY = end.y;
        }
        if (element.classList.contains("astronaut-tether")) {
            const parentNode = nodes.get(from), childNode = nodes.get(to);
            const endpointsVisible = [parentNode, childNode].every(node => node.dataset.semanticHidden !== "true");
            const protectedRelationship=[from,to].some(id=>{
                const node=nodes.get(id),role=entries.get(id).role;
                return ['satellite','astronaut'].includes(role)&&
                    ((selectedNode===node&&!node.classList.contains('canvas-selection-muted'))||hoveredEntryId===id||searchFocusId===id||(searchOpen&&node.classList.contains('search-match'))||document.activeElement===node||node.classList.contains('dragging'));
            });
            const lens=activeConstellationMembers.size>0;
            const revealed=[parentNode,childNode].every(node=>node.classList.contains('temporarily-revealed'));
            const opacity = endpointsVisible ? (lens?(revealed?.23:semanticDetail.tethers*.18):cosmosView.deepTetherOpacity(camera.view.scale,to,protectedRelationship)) : 0;
            element.style.opacity = opacity;
            element.style.display = endpointsVisible ? "" : "none";
            element.style.strokeWidth = .65 / camera.view.scale;
        }
    });
}

function rebuildHierarchyPaths() {
    terminalLabelIds=cosmosView.terminalLabelIds(entries);
    syncFirstUse();
    hierarchyLayer.replaceChildren();
    lines.length = 0;
    galaxyModel.buildHierarchyEdges(entries).forEach(edge => {
        const { from, to } = edge;
        const tether = entries.get(to).role === "astronaut";
        const element = document.createElementNS("http://www.w3.org/2000/svg", tether ? "path" : "line");
        element.classList.add("hierarchy-line");
        if (tether) element.classList.add("astronaut-tether");
        element.dataset.kind = "hierarchy";
        element.setAttribute("aria-hidden", "true");
        hierarchyLayer.appendChild(element);
        lines.push({ ...edge, element });
    });
    updateHierarchyPaths();
}

function getNewEntryId() {
    const id=`entry-${cosmifoldIds.uuid()}`;
    if(!entries.has(id)&&!archivedEntries.has(id))return id;
    while (entries.has(`custom-${nextEntryId}`)||archivedEntries.has(`custom-${nextEntryId}`)) {
        nextEntryId++;
    }
    return `custom-${nextEntryId++}`;
}

function clearFormError() {
    formError.hidden = true;
    parentField.setCustomValidity("");
}

function updateFormRole() {
    const parent = entries.get(parentField.value), context = cosmosHierarchy.childContext(entries, parentField.value);
    const role = context?.role || galaxyModel.roleAtDepth(parent ? parent.depth+1 : 0);
    roleField.dataset.role = role;
    roleField.textContent = entryRoles[roleField.dataset.role].name;
    document.getElementById("parent-help").textContent = parent ? `Child of ${parent.name}. Its descendants move with this branch.` : "A top-level Galaxy in the Universe.";
    if (!editingId) {
        document.getElementById("add-entry-title").textContent = creatingTaskList ? 'Task List' : context?.action || 'Add item';
        submitButton.textContent = creatingTaskList ? 'Create' : parent?.taskList === true ? 'Add task' : parent ? 'Create item' : 'Create Galaxy';
    }
    creationContext.querySelector("span").textContent = parent ? `Item under ${parent.name}` : "A new Galaxy in the Universe";
}
function updateParentOptions(preferredId = parentField.value) {
    clearFormError(); parentField.required = false;
    parentField.replaceChildren(new Option("Universe", ""));
    const descendants = new Set(editingId ? [editingId] : []);
    entries.forEach(entry => {
        if (editingId && galaxyModel.ancestors(entries, entry.id).some(ancestor => ancestor.id === editingId)) descendants.add(entry.id);
    });
    [...entries.values()].filter(entry => !descendants.has(entry.id) && !galaxyModel.validateChange(editingId ? {...entries.get(editingId),parentId:entry.id} : {id:'',name:'New item',category:'',parentId:entry.id,...(creatingTaskList?{taskList:true}:{})},entries)).sort((a,b) => a.depth - b.depth || a.name.localeCompare(b.name)).forEach(entry => {
        const path = [...galaxyModel.ancestors(entries, entry.id)].reverse().map(ancestor => ancestor.name);
        parentField.add(new Option([...path, entry.name].join(" / "), entry.id));
    });
    parentField.value = entries.has(preferredId) && !descendants.has(preferredId) ? preferredId : "";
    updateFormRole();
}

const moveDestinationSearch=document.getElementById('move-destination-search');
const moveDestinationPicker=new MoveDestinationPicker({
    list:document.getElementById('move-destination-results'),search:moveDestinationSearch,
    universe:document.getElementById('move-to-universe'),current:document.getElementById('move-current-location'),
    selection:document.getElementById('move-destination-selection'),confirm:submitButton,getEntries:()=>entries,
    onSelect(id){
        const parentId=id===undefined?entries.get(editingId)?.parentId||null:id;
        parentField.replaceChildren(new Option(parentId?entries.get(parentId)?.name||'Unavailable destination':'Universe',parentId||''));
        updateFormRole();clearFormError();
    }
});
const structureLocation=document.getElementById('structure-location');
const structureDestinationPicker=new MoveDestinationPicker({
    list:document.getElementById('structure-destination-results'),search:document.getElementById('structure-destination-search'),
    universe:document.getElementById('structure-to-universe'),current:document.getElementById('structure-current-location'),
    confirm:structureForm.querySelector('button[type="submit"]'),getEntries:()=>entries,
    createIndex(data,id){
        const validate=hierarchyCopies.destinationValidator(data,[id],{structure:true});
        return new MoveDestinationIndex(data,id,entry=>validate(entry.parentId));
    },
    allowCurrent:true,
    onSelect(){structureError.hidden=true;}
});

function beginCrudOperation() {
    cancelPendingBodyFocus();lastBodyTap=null;
    cancelCanvasTouches();
    crudActive = true;
    keyboardNavigation = false;
    autoFitPending = false;
    camera.stopAnimation();
    physics.pause();

}

function finishCrudOperation() {
    if (dialog.open || deleteDialog.open || archiveDialog.open || portalDialog.open || pasteBusy || structureDialog.open || constellationWorkspace.isDialogOpen()) return;
    crudActive = false;
    if (!document.hidden&&!localSessionStale) physics.resume();
}

// Publish an acknowledged command: model/derived particles -> DOM/tree ->
// selection/inspector. No navigation helpers or global Fit participate.
function commitCrudMutation(mutate, { selectionId, topologyChanged = true, reveal = false,
    preserveScroll = true, inspectorOpen = !panel.hidden, persisted = false, animateCreation = true, preserveInspector = false, preserveSidebarSelection = false, changeIntent } = {}) {
    if(!persisted)throw new Error('CRUD publication requires a persisted command.');
    beginCrudOperation();
    const scroll = { top: hierarchySidebar.tree.scrollTop, left: hierarchySidebar.tree.scrollLeft };
    const previousSelection = selectedNode?.dataset.entryId;
    const materialized=[];
    mutate();
    contentInspector.reconcilePreviews();
    if (topologyChanged || selectionId !== previousSelection) focusRevealIds.clear();
    if (!entries.has(selectedNode?.dataset.entryId)) selectedNode = null;
    galaxyModel.normalizeHierarchy(entries);
    if (topologyChanged) syncPhysicsGraph({ updateUI: false, reheat: .12 });
    else refreshTaskMetadata();
    graphNeedsSave=false;
    nodes.forEach((node, id) => {
        if (entries.has(id)) return;
        node.remove(); nodes.delete(id); regions.get(id)?.remove(); regions.delete(id);
    });
    entries.forEach(entry => {
        const node = nodes.get(entry.id);
        if (!node) materialized.push(createEntryNode(entry));
        else if (entry.id === selectionId || node.dataset.role !== entry.role || Number(node.dataset.depth) !== entry.depth) updateEntryNode(entry, node);
    });
    rebuildHierarchyPaths();
    hierarchySidebar.setEntries(entries);
    const entry = entries.get(selectionId);
    if (entry && preserveInspector && entry.id === previousSelection) {
        hierarchySidebar.select(entry.id,{scroll:!preserveScroll,preserveMulti:preserveSidebarSelection});
        if(preserveSidebarSelection)refreshPanelHierarchy(entry);
        updateHierarchyEmphasis();updateGraphViewport();
    }
    else if (entry) selectEntry(entry, nodes.get(entry.id), { reframe: false, openInspector: inspectorOpen, scroll: !preserveScroll, preserveSidebarSelection });
    else clearSelection({ reframe: false });
    rebuildOrbitGuides(); refreshSearchResults(); renderGraph();
    refreshConstellation();
    if (preserveScroll) {
        hierarchySidebar.tree.scrollTop = scroll.top; hierarchySidebar.tree.scrollLeft = scroll.left;
    }
    if (reveal && entry) {
        revealEntry(entry);
        if (entry.depth > 0 && semanticDetail[entry.role] < .02) {
            focusRevealIds.add(entry.id);
            galaxyModel.ancestors(entries, entry.id).forEach(parent => focusRevealIds.add(parent.id));
            renderGraph();
        }
    }
    if(animateCreation)materialized.forEach(node=>motion.materialize(node));
}

function openDuplicateStructure(id) {
    if(!entries.has(id)||hierarchySidebar.getSelectedEntryIds().length>1||(!sampleMode&&!storageAvailable)||deletionBusy||activeNodeDrags||hierarchySidebar.moveDrag||document.querySelector('dialog[open]'))return;
    structureSourceId=id;structureReturnFocus=document.activeElement;structureCommitted=false;
    structureName.value=`${entries.get(id).name.slice(0,55)} copy`;
    document.getElementById('duplicate-structure-description').textContent=`Create a new empty structure based on “${entries.get(id).name}”.`;
    structureError.hidden=true;structureName.removeAttribute('aria-invalid');
    structureLocation.disabled=false;
    structureDestinationPicker.open(id);
    document.getElementById('structure-location-choices').hidden=entries.get(id).parentId==null;
    document.getElementById('structure-universe-location').hidden=entries.get(id).parentId!=null;
    beginCrudOperation();structureDialog.showModal();structureName.focus();structureName.select();
}
let structureBusy=false;
structureForm.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!structureDialog.open||structureBusy)return;
    const destination=structureDestinationPicker.destinationId;
    if(destination===undefined){structureError.textContent='Choose a location.';structureError.hidden=false;return;}
    structureBusy=true;structureName.disabled=true;structureLocation.disabled=true;structureForm.querySelector('button[type="submit"]').disabled=true;
    try{await orderedCommand(async()=>{
        const source=entries.get(structureSourceId);
        if(!source)throw new Error('This item no longer exists.');
        if(destination!==null&&!entries.has(destination))throw new Error('Choose a location in an active Galaxy.');
        const position=getNewEntryPosition(destination?[destination]:[],galaxyModel.roleAtDepth(destination?entries.get(destination).depth+1:0));
        const result=await universeRepository.duplicateStructure(getGalaxySnapshot,source.id,structureName.value,
            ()=>`structure:${cosmifoldIds.uuid()}`,{...position,destination});
        commitCrudMutation(()=>{
            result.copies.forEach(entry=>entries.set(entry.id,{...entry,seedLayout:true}));
        },{selectionId:result.rootIds[0],persisted:true,inspectorOpen:true,preserveScroll:false});
        storageStatus.hidden=true;structureCommitted=true;structureDialog.close();
    });}catch(error){
        structureError.textContent=`Nothing was added. ${error.message}`;structureError.hidden=false;
        structureName.setAttribute('aria-invalid','true');structureName.focus();
    }finally{structureBusy=false;structureName.disabled=false;structureLocation.disabled=false;structureForm.querySelector('button[type="submit"]').disabled=structureDestinationPicker.destinationId===undefined;if(structureDialog.open&&!structureError.hidden)structureName.focus();}
});
structureName.addEventListener('input',()=>{structureError.hidden=true;structureName.removeAttribute('aria-invalid');});
document.getElementById('duplicate-structure-cancel').addEventListener('click',()=>{if(!structureBusy)structureDialog.close();});
structureDialog.addEventListener('cancel',event=>{if(structureBusy)event.preventDefault();});
structureDialog.addEventListener('close',()=>{
    finishCrudOperation();
    const target=structureCommitted?hierarchySidebar.rows.get(hierarchySidebar.activeEntryId):structureReturnFocus;
    if(target?.isConnected)target.focus({preventScroll:true});
    structureSourceId=null;structureReturnFocus=null;
});

function copyHierarchyItems(ids=hierarchySidebar.getSelectedEntryIds()) {
    const count=hierarchyClipboard.copy(entries,ids);
    if(count){const message=`Copied ${count} ${count===1?'item':'items'}`;actionStatus.textContent=message;actionStatus.hidden=false;setTimeout(()=>{if(actionStatus.textContent===message)actionStatus.hidden=true;},2500);}
    return count;
}
function canPasteHierarchy(id) {
    return entries.has(id)&&(sampleMode||storageAvailable)&&!deletionBusy&&!pasteBusy&&!hierarchyClipboard.copyError(entries,id);
}
// Every Paste entry point executes the same independent-copy command.
async function pasteHierarchy(destination) {
    if(pasteBusy||(!sampleMode&&!storageAvailable)||deletionBusy||activeNodeDrags||hierarchySidebar.moveDrag||document.querySelector('dialog[open]'))return false;
    const roots=hierarchyClipboard.roots(entries),returnFocus=document.activeElement;
    pasteBusy=true;beginCrudOperation();let committed=false;
    try{
        await orderedCommand(async()=>{
            const validate=()=>{const error=hierarchyCopies.destinationValidator(entries,roots)(destination);if(error)throw new Error(error);};
            validate();
            const result=await universeRepository.copyEntries(getGalaxySnapshot,roots,destination,()=>`copy:${cosmifoldIds.uuid()}`,{
                readSnapshot:getGalaxySnapshot,
                beforeFileWrite:records=>storageCapacity.check(records,{copies:true,isCurrent:()=>pasteBusy&&!localSessionStale}),
                validate
            });
            commitCrudMutation(()=>{
                result.copies.forEach(entry=>entries.set(entry.id,{...entry,seedLayout:true}));
                result.links.forEach(link=>portals.set(link.id,link));
                hierarchySidebar.expanded.add(destination);galaxyModel.ancestors(entries,destination).forEach(e=>hierarchySidebar.expanded.add(e.id));
                hierarchySidebar.restoreMovedSelection(result.rootIds,result.rootIds[0]);
            },{selectionId:result.rootIds[0],persisted:true,preserveSidebarSelection:true});
        });
        if(!localSessionStale)storageStatus.hidden=true;
        committed=true;return true;
    }catch(error){
        notifyFileFailure(error.name==='QuotaExceededError'?'Nothing was added. This browser does not have enough local storage for these copies. Free some space and try again.':`Nothing was added. ${error.message}`);
        return false;
    }finally{
        pasteBusy=false;finishCrudOperation();
        if(!localSessionStale&&!document.querySelector('dialog[open]')&&(document.activeElement===document.body||document.activeElement===returnFocus)){
            const target=committed?hierarchySidebar.rows.get(hierarchySidebar.activeEntryId):returnFocus;
            if(target?.isConnected)target.focus({preventScroll:true});
        }
    }
}

document.addEventListener('keydown',event=>{
    if(event.defaultPrevented||hierarchySidebar.moveDrag||!(event.ctrlKey||event.metaKey)||event.altKey||event.shiftKey||!['c','v'].includes(event.key.toLowerCase()))return;
    if(event.target.closest('input,textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"],.tree-disclosure,.tree-add,.tree-more,.tree-portal-actions')||window.getSelection()?.toString()||document.querySelector('dialog[open]'))return;
    const row=event.target.closest('.hierarchy-row[data-entry-id],.entry-node[data-entry-id]'),menu=event.target.closest('#entry-context-menu');
    if(!row&&!menu)return;
    if(menu&&(contextPortalId||contextCollectionId))return;
    if(event.key.toLowerCase()==='c'){
        const ids=menu&&contextMenu.dataset.copySelection!=='true'?[contextEntryId]:hierarchySidebar.getSelectedEntryIds();
        if(ids.length){event.preventDefault();copyHierarchyItems(ids);}
    }else{
        const id=menu?contextEntryId:hierarchySidebar.activeEntryId;
        if(!menu&&row.dataset.entryId!==id)return;
        if(entries.has(id)&&hierarchyClipboard.roots(entries).length){event.preventDefault();if(menu)closeContextMenu();void pasteHierarchy(id);}
    }
});

function moveSidebarEntries(payload,destinationId) {return orderedCommand(async()=>{
    const plan=galaxyModel.movePlan(entries,payload.ids,destinationId);
    if(plan.error)return false;
    let result;
    try{result=await universeRepository.moveEntries(getGalaxySnapshot,payload.ids,destinationId);}
    catch(error){reportStorageFailure(`Items could not be moved. Their original parents are unchanged. ${error.message}`);return false;}
    if(result.changed.length)storageStatus.hidden=true;
    hierarchySidebar.restoreMovedSelection(payload.ids,payload.activeId);
    if(!result.changed.length)return true;
    commitCrudMutation(()=>{
        result.changed.forEach(id=>{entries.get(id).parentId=destinationId;layout.delete(id);});
    },{selectionId:payload.activeId,persisted:true,preserveInspector:true,preserveSidebarSelection:true,animateCreation:false});
    hierarchySidebar.activeId=destinationId;hierarchySidebar.updateTabStops();hierarchySidebar.rows.get(destinationId)?.focus({preventScroll:true});
    finishCrudOperation();return true;
});}

function restoreCrudFocus() {
    keyboardNavigation = false;
    const row = hierarchySidebar.rows.get(selectedNode?.dataset.entryId);
    const target = selectedNode && !selectedNode.inert && selectedNode.dataset.culled !== "true" ? selectedNode :
        row && !hierarchySidebar.collapsed && hierarchySidebar.tree.contains(row) ? row :
            hierarchySidebar.collapsed ? hierarchySidebar.toggle : addEntryButton;
    target.focus({ preventScroll: true });
}

function openEntryForm(entry = null, parentId = null, contextual = false, mode = "info", taskList = false) {
    if(localSessionStale)return;
    if (deletionBusy) return;
    if (!entry && parentId && (!cosmosHierarchy.childContext(entries,parentId) || (taskList && entries.get(parentId)?.taskList===true))) return;
    creatingTaskList = !entry && taskList;
    document.getElementById('task-list-fields').hidden = !creatingTaskList;
    beginCrudOperation();

    closeContextMenu();
    closeContentMenus();
    editingId = entry?.id || null;
    contextualParentId = contextual ? parentId : null;
    const moving=!!entry&&mode==='move';
    dialog.classList.toggle('move-destination-mode',moving);
    document.getElementById('parent-select-controls').hidden=moving;
    document.getElementById('move-destination-browser').hidden=!moving;
    creationContext.hidden = true;
    document.getElementById("parent-field").hidden = !entry || mode !== "move";
    document.getElementById("entry-info-fields").hidden = true;
    document.getElementById("entry-name-field").hidden = !!entry && mode === "move";
    form.reset();
    fields.forEach((field) => field.setCustomValidity(""));
    clearFormError();
    document.getElementById("add-entry-title").textContent = entry ? mode === "move" ? "Move to…" : "Rename item" : "Add item";
    submitButton.textContent = moving?'Move here':entry?'Save':'Add item';
    submitButton.disabled=false;
    if (entry) {
        fields[0].value = entry.name;
        fields[1].value = entry.description;
        fields[2].value = entry.category;
    }
    if(moving){
        document.getElementById('add-entry-title').textContent=`Move “${entry.name}” to…`;
        moveDestinationPicker.open(entry.id);
    }else updateParentOptions(entry ? entry.parentId || "" : parentId || "");
    document.getElementById('galaxy-starter-field').hidden=creatingTaskList||!!entry||!!parentField.value;
    starterDefaultName='';
    dialog.showModal();
    if(moving)moveDestinationSearch.focus({preventScroll:true});
}

function createChildEntry(parentId, taskList = false) {
    const context = cosmosHierarchy.childContext(entries, parentId);
    if (!context || !parentId || activeNodeDrags || deletionBusy) return;
    beginCrudOperation();
    selectEntry(entries.get(parentId), nodes.get(parentId), { reframe: false });
    openEntryForm(null, context.parentId, true, "info", taskList);
}

document.getElementById("change-creation-parent").addEventListener("click", () => {
    contextualParentId = null; creationContext.hidden = true;
    document.getElementById("parent-field").hidden = false; parentField.focus();
});

const addMenu = document.getElementById("add-menu"), moreButton = document.getElementById("entry-more-button");
let addMenuTargetId = null, addMenuTrigger = null;
function renderAddMenu() {
    const mobile = hierarchySidebar.narrow;
    const contents=!mobile&&addMenuTrigger?.id==='entry-add-button';
    const sidebar=mobile&&!!addMenuTrigger?.closest('#hierarchy-tree');
    addMenu.dataset.view = mobile ? 'quick' : 'desktop';
    addMenu.classList.toggle('capture-menu', mobile);
    addMenu.querySelectorAll('button').forEach(item => {
        const action = item.dataset.add;
        if(['camera','photo','capture-files'].includes(action))item.hidden=!mobile;
        else item.hidden=mobile&&(!sidebar||action==='files')&&item!==addChildButton&&action!=='task-list';
        if(action==='location')item.hidden=!sidebar;
        if(contents)item.hidden=item!==addChildButton&&action!=='task-list';
        if(item===addChildButton){item.hidden=taskStates.get(addMenuTargetId)?.task===true;item.textContent=entries.get(addMenuTargetId)?.taskList===true?'Add task':'Add item';}
        if(action==='task-list')item.hidden=taskStates.get(addMenuTargetId)?.enabled===true;
        if (action === 'paste') item.hidden=contents||mobile||!canPasteHierarchy(addMenuTargetId);
    });
    addMenu.setAttribute('aria-label', `Add to ${entries.get(addMenuTargetId).name}`);
    const rect = addMenuTrigger.getBoundingClientRect();
    positionCosmosMenu(addMenu,rect.left,rect.bottom+6,{above:rect.top-6});
    addMenu.querySelector('button:not([hidden]):not(:disabled)')?.focus({preventScroll:true});
}
function closeContentMenus() {
    addMenu.hidden = entryActions.hidden = true;
    addMenuTrigger?.setAttribute("aria-expanded", "false");
    addMenuTargetId = null; addMenuTrigger = null;
    moreButton.setAttribute("aria-expanded", "false");
}
function toggleContentMenu(menu, button, targetId = null) {
    cancelPendingBodyFocus();lastBodyTap=null;
    if (menu === addMenu && !entries.has(targetId)) return;
    closeContextMenu();
    const opening = menu.hidden || (menu === addMenu && addMenuTrigger !== button);
    closeContentMenus();
    if (!opening) return;
    menu.hidden = false; button.setAttribute("aria-expanded", "true");
    if (menu === addMenu) {
        addMenuTargetId = targetId; addMenuTrigger = button;
        renderAddMenu();
    } else {
        const rect=button.getBoundingClientRect();positionCosmosMenu(menu,rect.right-menu.offsetWidth,rect.bottom+5,{above:rect.top-5});
    }
    menu.querySelector("button:not([hidden]):not(:disabled)")?.focus({ preventScroll: true });
}
addEntryButton.addEventListener("click", () => openEntryForm());
moreButton.addEventListener("click", () => {
    if(constellationOverview){moreButton.setAttribute('aria-controls','entry-actions');toggleContentMenu(entryActions,moreButton);}
    else {moreButton.setAttribute('aria-controls','entry-context-menu');toggleBodyActions(moreButton,contentInspector.entryId,'contents');}
});
document.getElementById('mobile-body-add').addEventListener('click', event => toggleContentMenu(addMenu, event.currentTarget, selectedNode?.dataset.entryId));
document.getElementById('entry-add-button').addEventListener('click', event => {
    if(constellationOverview)constellationWorkspace.openPicker(activeConstellationId);
    else toggleContentMenu(addMenu, event.currentTarget, contentInspector.entryId);
});
document.getElementById('mobile-body-more').addEventListener('click', event => {
    toggleBodyActions(event.currentTarget,selectedNode?.dataset.entryId);
});
function openMobileContents() {
    if(hierarchySidebar.narrow)mobileContents.transition('browse');
    else setInspectorOpen(true);
}
document.getElementById('mobile-body-contents').addEventListener('click', openMobileContents);
mobileContents=new MobileContentsSheet({panel,card:document.getElementById('mobile-body-actions'),root:document.getElementById('panel-rich-content'),
    getEntryId:()=>selectedNode?.dataset.entryId,
    onResize(){if(cameraViewReady)updateGraphViewport();},
    enabled:()=>hierarchySidebar.narrow&&hierarchySidebar.collapsed&&!!selectedNode&&!constellationOverview&&!document.querySelector('dialog[open]'),
    onPage(){closeContentMenus();closeContextMenu();closePanelItemMenus();},
    onTransition(state){
        if(state==='compact')closeInspector(true);
        else {setInspectorOpen(true);panel.scrollTop=0;updateGraphViewport();}
    }});
for(const title of [document.getElementById('mobile-body-name'),panelName])selectedTitleEditors.push(new SelectedTitleRename({
    title,getEntry:()=>entries.get(selectedNode?.dataset.entryId),
    enabled:()=>hierarchySidebar.narrow&&!constellationOverview&&!!selectedNode&&!document.querySelector('dialog[open]'),
    onSave:renameEntry,onLayout(){closeContentMenus();closeContextMenu();cancelPendingBodyFocus();camera.stopAnimation();updateGraphViewport();}
}));
decorateInlineActions(document);
addChildButton.addEventListener("click", () => {
    const id = addMenuTargetId;
    closeContentMenus();
    if (entries.has(id)) createChildEntry(id);
});
addMenu.addEventListener("click", event => {
    const action = event.target.closest("[data-add]")?.dataset.add;
    const id = addMenuTargetId;
    if (action === 'paste') {closeContentMenus();void pasteHierarchy(id);return;}
    if (!action || !entries.has(id)) return;
    if (action === 'task-list') {closeContentMenus();createChildEntry(id,true);return;}
    openEntryContentAction(id, action);
});
function openEntryContentAction(id, action) {
    if (!entries.has(id)) return;
    closeContentMenus();
    if (['photo','gallery','camera','capture-files'].includes(action)) {
        // Keep the system picker in the tap's activation and retain its destination.
        // Cancelling does not open Contents or change the selected body.
        contentInspector.chooseFiles({source:action,entryId:id,onSelect() {
            if(hierarchySidebar.narrow)hierarchySidebar.setCollapsed(true);
            const alreadyInspecting=!panel.hidden&&contentInspector.entryId===id&&!constellationOverview;
            selectEntry(entries.get(id),nodes.get(id),{reframe:false,openInspector:true});
            if(!alreadyInspecting)mobileContents.setPage('files');
        }});
        return;
    }
    autoFitPending = false; keyboardNavigation = false; camera.stopAnimation();
    if(hierarchySidebar.narrow)hierarchySidebar.setCollapsed(true);
    // The lens and selection coexist. Even the already-selected entry must
    // leave the overview panel before its content editor can be shown.
    if (selectedNode?.dataset.entryId !== id || constellationOverview) selectEntry(entries.get(id), nodes.get(id), { reframe: false });
    if (panel.hidden) setInspectorOpen(true);
    if (action === "files") {mobileContents.setPage("files");contentInspector.chooseFiles();}
    else if (action === "note") {mobileContents.setPage('notes');contentInspector.editNotes();}
    else if (action === "bookmark") {mobileContents.setPage('links');contentInspector.editLink();}
    else if (action === "location") {mobileContents.setPage('location');contentInspector.editLocation();}
}
document.getElementById("move-entry-button").addEventListener("click", () => {
    const entry = entries.get(selectedNode?.dataset.entryId);
    if (entry) openEntryForm(entry, null, false, "move");
});
entryActions.addEventListener("click", () => closeContentMenus());
document.addEventListener("pointerdown", event => {
    if (!event.target.closest("#add-menu,.tree-add,#mobile-body-add,#entry-add-button,#entry-actions,#entry-more-button,#entry-context-menu")) closeContentMenus();
});
document.addEventListener("keydown", event => {
    const menu = !addMenu.hidden ? addMenu : !entryActions.hidden ? entryActions : null;
    if (!menu) return;
    const button = menu === addMenu ? addMenuTrigger : moreButton;
    if (event.key === "Escape" || event.key === "Tab") {
        closeContentMenus();
        if (event.key === "Escape") {
            event.preventDefault(); event.stopImmediatePropagation();
            // Restore the originating row/action without navigating the canvas.
            if(hierarchySidebar.narrow)button.closest('.hierarchy-row')?.focus({preventScroll:true});
            button.focus({ preventScroll: true });
        }
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        const items = [...menu.querySelectorAll("button:not([hidden]):not(:disabled)")];
        const index = items.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus({ preventScroll: true });
    }
}, true);
editEntryButton.addEventListener("click", () => {
    const entry = entries.get(selectedNode?.dataset.entryId);
    if (entry) openEntryForm(entry);
});
parentField.addEventListener("change", () => {
    clearFormError();
    updateFormRole();
});

dialog.addEventListener("close", () => {
    finishCrudOperation();
});

function cancelEntryForm() {
    if(formSaveBusy)return;
    dialog.close();
    restoreCrudFocus();
}
dialog.addEventListener("cancel", event => { event.preventDefault(); cancelEntryForm(); });
document.getElementById("cancel-add-entry").addEventListener("click", cancelEntryForm);

const galaxyStarter=document.getElementById('galaxy-starter');let starterDefaultName='';
cosmosEveryday.starters.forEach(starter=>galaxyStarter.add(new Option(starter.label,starter.id)));
galaxyStarter.addEventListener('change',()=>{
    const starter=cosmosEveryday.starters.find(item=>item.id===galaxyStarter.value);
    if(!fields[0].value.trim()||fields[0].value===starterDefaultName)fields[0].value=starter.name;
    starterDefaultName=starter.name;clearFormError();
});
fields.forEach((field) => {
    field.addEventListener("input", () => { field.setCustomValidity(""); clearFormError(); });
});

let formSaveBusy=false,formControlState=[];
function setFormBusy(value){
    formSaveBusy=value;
    if(value){formControlState=[...form.querySelectorAll('input,textarea,select,button')].map(control=>[control,control.disabled]);formControlState.forEach(([control])=>control.disabled=true);}
    else{formControlState.forEach(([control,disabled])=>control.disabled=disabled);formControlState=[];}
}
form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if(formSaveBusy)return;
    clearFormError();
    if(dialog.classList.contains('move-destination-mode')&&moveDestinationPicker.destinationId===undefined){
        formError.textContent='Choose a destination.';formError.hidden=false;moveDestinationSearch.focus();return;
    }
    if(editingId&&!entries.has(editingId)){formError.textContent='This item is no longer available.';formError.hidden=false;return;}
    fields.forEach((field, index) => {
        field.setCustomValidity(index !== 0 || field.value.trim() ? "" : "Please enter a value.");
    });
    const data = {
        ...(editingId ? entries.get(editingId) : creatingTaskList ? {taskList:true} : entries.get(contextualParentId || parentField.value)?.taskList===true ? {completed:false} : {}),
        id: editingId || getNewEntryId(),
        name: fields[0].value.trim(),
        description: editingId ? entries.get(editingId).description : fields[1].value.trim(),
        category: editingId ? entries.get(editingId).category : fields[2].value.trim(),
        parentId: contextualParentId || parentField.value || null
    };
    const error = galaxyModel.validateChange(editingId?{...data,description:'',category:''}:data, entries);
    if (error) {
        formError.textContent = error;
        formError.hidden = false;
        return;
    }
    if (!form.reportValidity()) return;
    if (editingId && document.getElementById('entry-name-field').hidden === false) {
        setFormBusy(true);
        try { await renameEntry(editingId,data.name); }
        catch (error) { formError.textContent=error.message;formError.hidden=false;return; }
        finally{setFormBusy(false);if(dialog.open&&!formError.hidden)(fields[0].getClientRects().length?fields[0]:parentField).focus();}
        dialog.close();restoreCrudFocus();finishCrudOperation();return;
    }
    setFormBusy(true);
    try{await orderedCommand(async()=>{
        const wasEmpty=entries.size===0&&archivedEntries.size===0;
        const creating=!editingId,staged=new Map([...entries].map(([id,record])=>[id,{...record}]));
        const entry=creating?{...getNewEntryPosition(data.parentId?[data.parentId]:[],roleField.dataset.role),seedLayout:true}:staged.get(data.id);
        if(!entry)throw new Error('This item no longer exists.');
        const requested=creating?data:{...entry,parentId:data.parentId};
        const error=galaxyModel.validateChange(requested,staged);if(error)throw new Error(error);
        const oldParentId=entry.parentId,now=new Date().toISOString(),changedIds=[data.id];
        Object.assign(entry,requested,{updatedAt:now},creating?{createdAt:now}:{});staged.set(entry.id,entry);
        const stagedLayout=new Map(layout);if(oldParentId!==data.parentId)stagedLayout.delete(entry.id);
        if(creating && creatingTaskList){
            galaxyModel.normalizeHierarchy(staged);
            const checklist=cosmosTasks.create(staged,entry,document.getElementById('task-list-tasks').value.split(/\r?\n/),getNewEntryId);
            for(const item of checklist.slice(1)){
                const depth=entry.depth+1,role=galaxyModel.roleAtDepth(depth);
                staged.set(item.id,{...item,role,depth,...getNewEntryPosition([data.id],role,staged),seedLayout:true});changedIds.push(item.id);
            }
        }else if(creating&&!data.parentId){
            galaxyModel.normalizeHierarchy(staged);
            for(const item of cosmosEveryday.starterItems(galaxyStarter.value,data.id,getNewEntryId)){
                const role=galaxyModel.roleAtDepth(galaxyModel.ancestors(staged,item.parentId).length+1);
                staged.set(item.id,{...item,description:'',category:'',createdAt:now,updatedAt:now,...getNewEntryPosition([item.parentId],role,staged),seedLayout:true});
                galaxyModel.normalizeHierarchy(staged);changedIds.push(item.id);
            }
        }
        const all=galaxyArchives.join(staged,archivedEntries);
        await universeRepository.save(universeRepository.snapshot({entries:all,portals,constellations,layout:stagedLayout,archivedGalaxies}),
            {type:creating?'items.created':oldParentId!==data.parentId?'items.moved':'items.renamed',ids:changedIds});
        commitCrudMutation(()=>{
            changedIds.forEach(id=>{
                // Retained DOM handlers share the canonical record with rendering and physics ticks.
                const current=entries.get(id),updated=staged.get(id);
                if(current)Object.assign(current,updated);else entries.set(id,updated);
            });
            if(oldParentId!==data.parentId)layout.delete(data.id);
        },
            {selectionId:data.id,topologyChanged:creating||oldParentId!==data.parentId,reveal:creating||oldParentId!==data.parentId,preserveScroll:!creating,inspectorOpen:creating||!panel.hidden,persisted:true});
        dialog.close();restoreCrudFocus();finishCrudOperation();
        if(creating&&!sampleMode)firstUse.created({wasEmpty,rootId:data.id,created:changedIds.map(id=>entries.get(id))});
    });}catch(error){formError.textContent=error.message;formError.hidden=false;}
    finally{setFormBusy(false);if(dialog.open&&!formError.hidden)(fields[0].getClientRects().length?fields[0]:dialog.classList.contains('move-destination-mode')?moveDestinationSearch:parentField).focus();}

});

// Menu and inline Rename share validation, staged persistence and UI publication.
function renameEntry(id, value) {return orderedCommand(async()=>{
    const entry = entries.get(id);
    if (!entry || deletionBusy) throw new Error('This item is unavailable.');
    const name = value.trim();
    const error = galaxyModel.validateChange({...entry,name,description:'',category:''}, entries);
    if (error) throw new Error(error);
    if (name === entry.name) return;
    const updatedAt = new Date().toISOString(), snapshot = getGalaxySnapshot();
    try { await universeRepository.save({...snapshot,entries:snapshot.entries.map(record=>record.id===id?{...record,name,updatedAt}:record)}, {type:'items.renamed',ids:[id]}); }
    catch (error) { throw new Error('The name could not be saved. Please try again.', {cause:error}); }
    commitCrudMutation(()=>Object.assign(entry,{name,updatedAt}), {selectionId:id,
        topologyChanged:false,persisted:true,preserveInspector:true,animateCreation:false});
    if (selectedNode?.dataset.entryId === id && !constellationOverview) panelName.textContent = name;
    finishCrudOperation();
});}

function clearSelection({ reframe = false, viewport } = {}) {
    focusRevealIds.clear();
    selectedNode = null;
    updateCameraInspectionLimit();
    contentInspector.select(null, false);
    setInspectorOpen(false, { reframe });
    hierarchySidebar.select(null);
    panelAncestry.replaceChildren();
    panelAncestry.hidden = true;
    panelName.textContent = "Select an item";
    [entryActions, actionStatus].forEach((element) => { element.hidden = true; });
    nodes.forEach((node) => {
        node.classList.remove("related", "selected");
        node.setAttribute("aria-pressed", "false");
    });
    lines.forEach(({ element }) => element.classList.remove("selected"));
    updateHierarchyEmphasis(viewport);
}

function reportAction(message, { reframe = true } = {}) {
    actionStatus.textContent = message;
    actionStatus.hidden = false;
    if (panel.hidden) setInspectorOpen(true, { reframe });
}

function showDeleteConfirmation(entry, ids) {
    deleteConfirmationIds = new Set(ids);
    document.getElementById("delete-entry-title").textContent = ids.size > 1 ?
        `Delete “${entry.name}” and its child items?` : "Delete item?";
    document.getElementById("delete-entry-message").textContent = ids.size > 1 ?
        `This will permanently delete ${ids.size} items and their content. This cannot be undone.` :
        `Delete “${entry.name}” and its content? This cannot be undone.`;
    document.getElementById("confirm-delete-entry").textContent = ids.size > 1 ? `Delete ${ids.size} items` : "Delete item";
}

function requestEntryDelete(id) {
    if (deletionBusy) return;
    const entry = entries.get(id);
    if (!entry) return;
    beginCrudOperation();
    const plan = galaxyModel.deletionPlan(entries, id, { subtree: true });
    if (plan.error) {
        reportAction(plan.error, { reframe: false }); finishCrudOperation();
        return;
    }
    deletingId = entry.id;
    showDeleteConfirmation(entry, plan.ids);
    deleteDialog.showModal();
}
deleteEntryButton.addEventListener("click", () => requestEntryDelete(selectedNode?.dataset.entryId));
document.getElementById("cancel-delete-entry").addEventListener("click", () => deleteDialog.close());
deleteDialog.addEventListener("close", () => {
    if (deleteDialog.open) return;
    deletingId = null; deleteConfirmationIds = null;
    finishCrudOperation();
});
deleteDialog.addEventListener("cancel", event => { if (deletionBusy) event.preventDefault(); });
document.getElementById("delete-entry-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (deletionBusy) return;
    const entry = entries.get(deletingId);
    const plan = galaxyModel.deletionPlan(entries, deletingId, { subtree: true });
    if (!entry || plan.error) {
        deleteDialog.close();
        reportAction(plan.error, { reframe: false }); finishCrudOperation();
        return;
    }
    if (!deleteConfirmationIds || plan.ids.size !== deleteConfirmationIds.size || [...plan.ids].some(id => !deleteConfirmationIds.has(id))) {
        showDeleteConfirmation(entry, plan.ids);
        return; // Changed branch: show its new impact and require another explicit click.
    }
    const selectedId = selectedNode?.dataset.entryId;
    const fallbackId = plan.ids.has(selectedId) ?
        galaxyModel.ancestors(entries, selectedId).find(parent => !plan.ids.has(parent.id))?.id : selectedId;
    const hasFiles = [...plan.ids].some(id => entries.get(id)?.content?.attachments.length) || contentInspector.hasJobs(plan.ids) || attachmentStore.hasEntries(plan.ids);
    deletionBusy = true;
    plan.ids.forEach(id => deletingContentIds.add(id));
    const confirm = document.getElementById("confirm-delete-entry"), cancel = document.getElementById("cancel-delete-entry");
    confirm.disabled = cancel.disabled = true;
    await orderedCommand(async()=>{
    let deletionSnapshot;
    try {
        deletionSnapshot = await universeRepository.deleteSubtree(getGalaxySnapshot(), plan.ids, {deleteFiles:hasFiles, readSnapshot:getGalaxySnapshot, validate() {
            const current = galaxyModel.deletionPlan(entries, entry.id, {subtree:true});
            if (current.error || current.ids.size !== plan.ids.size || [...current.ids].some(id => !plan.ids.has(id)))
                throw new Error("The branch changed. Cancel and review its new deletion count.");
        }});
    } catch (error) {
        document.getElementById("delete-entry-message").textContent = `Could not delete this item. Your items are unchanged. ${error.message || "Try again."}`;
        return;
    } finally {
        deletionBusy = false; deletingContentIds.clear(); confirm.disabled = cancel.disabled = false;
    }
    const deletionGhost=motion.captureDeletion(nodes.get(entry.id));
    commitCrudMutation(() => {
        portals.forEach((portal, id) => { if (plan.ids.has(portal.targetEntryId) || plan.ids.has(portal.parentEntryId)) portals.delete(id); });
        deletionSnapshot.constellations.forEach(collection => constellations.set(collection.id, collection));
        plan.ids.forEach(id => { entries.delete(id); layout.delete(id); focusRevealIds.delete(id); });
        if (plan.ids.has(hoveredSystemId)) hoveredSystemId = null;
    }, { selectionId: fallbackId, persisted: true });
    motion.implode(deletionGhost);
    deleteDialog.close();
    restoreCrudFocus(); finishCrudOperation();
    });
});

function renderArchivedGalaxies() {
    const list=document.getElementById('archived-galaxy-list');list.replaceChildren();
    document.getElementById('archived-galaxy-count').textContent=archivedGalaxies.size?`(${archivedGalaxies.size})`:'';
    archivedSection.root.hidden=archivedGalaxies.size===0;archivedSection.apply();
    archivedGalaxies.forEach((record,id)=>{
        const row=document.createElement('li'),name=document.createElement('span'),restore=document.createElement('button');
        row.dataset.archivedGalaxyId=id;name.textContent=archivedEntries.get(id).name;name.title=name.textContent;
        restore.type='button';restore.textContent='Restore';restore.ariaLabel=`Restore Galaxy ${name.textContent}`;
        restore.addEventListener('click',()=>restoreGalaxy(id));row.append(name,restore);list.append(row);
    });
}
function archiveFeedback(message) {
    const feedback=document.getElementById('archive-feedback');feedback.textContent=message;feedback.hidden=false;
    clearTimeout(archiveFeedbackTimer);archiveFeedbackTimer=setTimeout(()=>{feedback.hidden=true;},4500);
}
function showArchiveError(message) {
    const error=document.getElementById('archive-galaxy-error');error.textContent=message;error.hidden=false;
}
function requestGalaxyArchive(id) {
    const entry=entries.get(id);
    if (!entry||entry.depth!==0||entry.parentId||deletionBusy||activeNodeDrags||pan||pinch||document.querySelector('dialog[open]')) return;
    archiveReturnFocus=document.activeElement;beginCrudOperation();closeContextMenu();closeContentMenus();
    archivingGalaxyId=id;archiveConfirmationIds=galaxyModel.subtreeIds(entries,id);
    document.getElementById('archive-galaxy-title').textContent=`Archive Galaxy “${entry.name}”?`;
    document.getElementById('archive-galaxy-error').hidden=true;
    archiveDialog.showModal();document.getElementById('cancel-archive-galaxy').focus({preventScroll:true});
}
function cancelGalaxyArchive() {
    if(archiveBusy)return;
    archiveDialog.close();keyboardNavigation=false;
    if(archiveReturnFocus?.isConnected&&archiveReturnFocus.getClientRects().length)archiveReturnFocus.focus({preventScroll:true});
    else restoreCrudFocus();
}
document.getElementById('archive-galaxy-button').addEventListener('click',()=>requestGalaxyArchive(selectedNode?.dataset.entryId));
document.getElementById('cancel-archive-galaxy').addEventListener('click',cancelGalaxyArchive);
archiveDialog.addEventListener('cancel',event=>{event.preventDefault();cancelGalaxyArchive();});
archiveDialog.addEventListener('close',()=>{if(!archiveDialog.open){archivingGalaxyId=null;archiveConfirmationIds=null;finishCrudOperation();}});
let archiveBusy=false;
document.getElementById('archive-galaxy-form').addEventListener('submit',async event=>{
    event.preventDefault();if(archiveBusy)return;archiveBusy=true;
    try{await orderedCommand(async()=>{const root=entries.get(archivingGalaxyId);
    if(!root||root.depth!==0||root.parentId){showArchiveError('This Galaxy is no longer available.');return;}
    const ids=galaxyModel.subtreeIds(entries,root.id);
    if(ids.size!==archiveConfirmationIds?.size||[...ids].some(id=>!archiveConfirmationIds.has(id))){
        archiveConfirmationIds=ids;showArchiveError('The Galaxy changed. Review it and choose Archive Galaxy again.');return;
    }
    if(contentInspector.hasJobs(ids)){showArchiveError('Wait for the current file action to finish before archiving.');return;}
    if(ids.has(contentInspector.entryId)&&(!contentInspector.notesForm.hidden||!contentInspector.linkForm.hidden||!contentInspector.locationForm.hidden)){
        showArchiveError('Save or cancel the open note, link or location before archiving.');return;
    }
    const record={galaxyId:root.id,archivedAt:new Date().toISOString(),expandedIds:[...hierarchySidebar.expanded].filter(id=>ids.has(id))};
    const snapshot=getGalaxySnapshot();
    try {
        await universeRepository.archive(snapshot,record);
    } catch(error){showArchiveError(`Could not archive this Galaxy. Its items are unchanged. ${error.message}`);return;}
    let echo=null;
    try {echo=archiveMotion.capture(regions.get(root.id),[...ids].map(id=>nodes.get(id)),camera.worldToScreen(root.x,root.y));} catch { /* Data is safe even if presentation fails. */ }
    const selectedId=selectedNode?.dataset.entryId,overview=activeConstellationId&&constellationOverview&&!panel.hidden;
    commitCrudMutation(()=>{
        archivedGalaxies.set(root.id,record);
        ids.forEach(id=>{archivedEntries.set(id,entries.get(id));entries.delete(id);focusRevealIds.delete(id);});
        if(ids.has(hoveredEntryId))hoveredEntryId=null;if(ids.has(hoveredSystemId))hoveredSystemId=null;
        if(ids.has(searchFocusId))searchFocusId=null;pendingPortalArrival=null;
    },{selectionId:ids.has(selectedId)?null:selectedId,persisted:true,animateCreation:false,preserveInspector:true});
    if(overview)showConstellationOverview();
    renderArchivedGalaxies();archiveDialog.close();
    if(!selectedNode&&!hierarchySidebar.collapsed)archivedSection.toggle.focus({preventScroll:true});
    else restoreCrudFocus();
    finishCrudOperation();
    archiveMotion.implode(echo);archiveFeedback(`${root.name} archived. Restore it from Archived Galaxies in the sidebar.`);
    });}finally{archiveBusy=false;}
});
function restoreGalaxy(id) {return orderedCommand(async()=>{
    const record=archivedGalaxies.get(id),root=archivedEntries.get(id);
    if(!record||!root||deletionBusy||activeNodeDrags||pan||pinch||document.querySelector('dialog[open]'))return;
    const ids=galaxyModel.subtreeIds(archivedEntries,id),snapshot=getGalaxySnapshot();
    try {
        await universeRepository.restore(snapshot,id);
    } catch(error){archiveFeedback(`Could not restore ${root.name}. It remains archived. ${error.message}`);return;}
    const overview=activeConstellationId&&constellationOverview&&!panel.hidden;
    commitCrudMutation(()=>{
        ids.forEach(id=>{entries.set(id,archivedEntries.get(id));archivedEntries.delete(id);});archivedGalaxies.delete(id);
    },{selectionId:selectedNode?.dataset.entryId,persisted:true,animateCreation:false,preserveInspector:true});
    ids.forEach(id=>hierarchySidebar.expanded.delete(id));
    (record.expandedIds||[root.id]).forEach(id=>hierarchySidebar.expanded.add(id));hierarchySidebar.render();
    if(overview)showConstellationOverview();renderArchivedGalaxies();
    archiveMotion.restore([regions.get(id),...[...ids].map(id=>nodes.get(id))],camera.worldToScreen(root.x,root.y));
    if(!hierarchySidebar.collapsed){
        if(hierarchySidebar.universeSection.collapsed)hierarchySidebar.universeSection.toggle.focus({preventScroll:true});
        else{hierarchySidebar.scrollRow(id);hierarchySidebar.rows.get(id)?.focus({preventScroll:true});}
    }
    else hierarchySidebar.toggle.focus({preventScroll:true});
    finishCrudOperation();archiveFeedback(`${root.name} restored to the Universe.`);
});}

function openPortal(id) {
    const portal = portals.get(id), targetId = portal?.targetEntryId;
    if (entries.has(targetId)) {
        motion.portal(hierarchySidebar.rows.get(id)?.querySelector('.tree-portal-icon'));
        pendingPortalArrival=targetId;
        focusEntry(targetId, { travel: true, sourceId: selectedNode?.dataset.entryId || portal.parentEntryId });
        if (!hierarchySidebar.collapsed) hierarchySidebar.rows.get(targetId)?.focus({ preventScroll: true });
    }
}

// Reference-only writes publish the sidebar after a successful metadata save.
// They never rebuild/reheat physics or invoke camera navigation.
function commitPortalReferences(next) {return orderedCommand(async()=>{
    next=typeof next==='function'?next():next;
    autoFitPending = false; keyboardNavigation = false; camera.stopAnimation();
    await universeRepository.replacePlacements(getGalaxySnapshot, [...next.values()]);
    storageStatus.hidden = true;
    portals.clear(); next.forEach((portal, id) => portals.set(id, portal));
    graphNeedsSave = false;
    hierarchySidebar.setEntries(entries);
});}

async function removePortal(id) {
    const portal = portals.get(id);
    if (!portal) return;
    const next = new Map(portals); next.delete(id);
    try {
        await commitPortalReferences(()=>{const current=new Map(portals);current.delete(id);return current;});
        const parentRow = hierarchySidebar.rows.get(portal.parentEntryId);
        if (!hierarchySidebar.collapsed && hierarchySidebar.tree.contains(parentRow)) {
            hierarchySidebar.activeId = portal.parentEntryId; hierarchySidebar.updateTabStops(); parentRow.focus({ preventScroll: true });
        } else hierarchySidebar.toggle.focus({ preventScroll: true });
    } catch (error) { reportStorageFailure(`Linked item could not be removed. ${error.message}`); }
}
function portalLocation(id) {
    return [...galaxyModel.ancestors(entries, id)].reverse().map(entry => entry.name).concat(entries.get(id)?.name || []).join(" › ");
}
const portalPicker=new CanonicalSinglePicker({
    list:document.getElementById('portal-parent-results'),search:document.getElementById('portal-parent-search'),getEntries:()=>entries,
    included:id=>entries.get(id)?.parentId===portalParentId||[...portals.values()].some(portal=>portal.parentEntryId===portalParentId&&portal.targetEntryId===id),
    onSelect(id){
        portalTargetId=id;
        const error=id?galaxyPortals.placementError(entries,portals,id,portalParentId):'';
        document.getElementById('portal-form-error').textContent=error;document.getElementById('portal-form-error').hidden=!error;
        document.getElementById('create-portal').disabled=!id||!!error;
        document.getElementById('portal-placement').textContent=id?portalLocation(id):'';
        document.getElementById('portal-placement').title=id?portalLocation(id):'';
        document.getElementById('portal-placement').hidden=!id;
    }
});
function refreshPortalDestinations(){portalPicker.render();}
function openPortalDialog(parentId) {
    if (!entries.has(parentId) || deletionBusy || activeNodeDrags || dialog.open || deleteDialog.open || portalDialog.open || constellationWorkspace.isDialogOpen()) return;
    beginCrudOperation();closeContextMenu();closeContentMenus();
    portalParentId=parentId;portalTargetId=null;portalReturnFocus=hierarchySidebar.rows.get(parentId)?.querySelector('.tree-add')||document.activeElement;
    document.getElementById('portal-target-name').textContent=entries.get(parentId).name;
    portalPicker.reset();portalDialog.showModal();document.getElementById('portal-parent-search').focus({preventScroll:true});
}
let portalReturnFocus=null;
function cancelPortalDialog() {
    if(portalSaveBusy)return;
    portalDialog.close();keyboardNavigation=false;
    if(portalReturnFocus?.isConnected&&portalReturnFocus.getClientRects().length){
        // Touch Add controls reveal on row focus, including an unselected row.
        portalReturnFocus.closest('.hierarchy-row')?.focus({preventScroll:true});
        portalReturnFocus.focus({preventScroll:true});
    }else restoreCrudFocus();
}
document.getElementById("cancel-portal").addEventListener("click", cancelPortalDialog);
portalDialog.addEventListener("cancel", event => { event.preventDefault(); cancelPortalDialog(); });
portalDialog.addEventListener("close", () => {
    // A queued close from an earlier use must not clear a newly opened picker.
    if (portalDialog.open) return;
    portalTargetId = portalParentId = null; finishCrudOperation();
});
let portalSaveBusy=false;
document.getElementById("portal-form").addEventListener("submit", async event => {
    event.preventDefault();if(portalSaveBusy)return;portalSaveBusy=true;
    try{
    const error = portalPicker.included(portalTargetId)?'This item is already shown here.':galaxyPortals.placementError(entries, portals, portalTargetId, portalParentId);
    if (error) { document.getElementById("portal-form-error").textContent = error; document.getElementById("portal-form-error").hidden = false; return; }
    const portal = { id: `portal:${cosmifoldIds.uuid()}`, targetEntryId: portalTargetId, parentEntryId: portalParentId, createdAt: new Date().toISOString() };
    const next = new Map(portals); next.set(portal.id, portal);
    try {
        await commitPortalReferences(()=>{const current=new Map(portals);current.set(portal.id,portal);return current;});
        // Reveal the alternate location in the tree, preserving canonical selection.
        galaxyModel.ancestors(entries, portal.parentEntryId).forEach(parent => hierarchySidebar.expanded.add(parent.id));
        hierarchySidebar.expanded.add(portal.parentEntryId); hierarchySidebar.render();
        hierarchySidebar.scrollRow(portal.id); hierarchySidebar.activeId = portal.id; hierarchySidebar.updateTabStops();
        portalDialog.close();
        if (!hierarchySidebar.collapsed) hierarchySidebar.rows.get(portal.id).focus({ preventScroll: true }); else restoreCrudFocus();
    } catch (failure) {
        document.getElementById("portal-form-error").textContent = `Item could not be added here. ${failure.message}`;
        document.getElementById("portal-form-error").hidden = false;
    }

    }finally{portalSaveBusy=false;}
});

function focusEntry(id, { travel = false, closeFocus=false, sourceId = selectedNode?.dataset.entryId, preserveSidebarSelection = false, openInspector = true, keepSidebarOpen=false, keepFraming=false } = {}) {
    cancelPendingBodyFocus();
    const entry = entries.get(id);
    if(pinch)cancelCanvasTouches();
    if (!entry || activeNodeDrags || pan) return;
    if(!travel)pendingPortalArrival=null;
    const source = physics.particles.get(sourceId);


    if (hierarchySidebar.narrow&&!keepSidebarOpen) hierarchySidebar.setCollapsed(true);
    closeContextMenu();
    autoFitPending = false;
    focusRevealIds.clear();
    searchOpen = false;
    searchResults.hidden = true;
    searchField.blur();
    if (entry.depth >= 2) {
        focusRevealIds.add(id);
        galaxyModel.ancestors(entries, id).forEach(ancestor => focusRevealIds.add(ancestor.id));
    }
    if(hierarchySidebar.narrow)syncMobileViewport();
    // Selection refreshes shared geometry after sidebar/sheet state changes.
    selectEntry(entry, nodes.get(id), { reframe: false, preserveSidebarSelection, openInspector, scroll:!keepSidebarOpen });
    if(keepFraming)return;
    const viewport=hierarchySidebar.narrow?mobileFitViewport():physics.bounds;
    if(!viewport){camera.stopAnimation();return;}
    const { left, right, top, bottom } = viewport;
    const particle = physics.particles.get(id);
    const applyView = view => {if(!view)return;return travel ? camera.travelTo(view, viewport, {
        crossGalaxy: !!source && source.galaxyId !== particle.galaxyId,
        differentSystem: !!source && source.systemId !== particle.systemId
    }) : camera.setView(view);};
    const inspectionScale=entry.depth>=5?2.4:entry.depth===4?2.2:entry.depth===3?1.8:1.4;
    const usefulScale = closeFocus?(entry.depth===1?1.1:inspectionScale):Math.max(entry.depth>=3?inspectionScale:1,Math.min(1.8,camera.view.scale));
    if(hierarchySidebar.narrow){
        const family=galaxyModel.subtreeIds(entries,id);
        if(entry.depth<=1||family.size>1){
            applyView(mobileFamilyView(family,viewport,entry.depth===0?.58:entry.depth===1?.82:usefulScale));
            return;
        }
    }
    if (entry.depth === 0 || entry.depth===1&&!closeFocus) {
        const members = entry.depth === 0 ? physics.ordered.filter(node => node.galaxyId === id && node.depth > 0) : physics.systems.get(id).members;
        const positions = cosmosView.normalPositions(particle, members);
        const bounds = { left: entry.x - 48, right: entry.x + 48, top: entry.y - 48, bottom: entry.y + 48 };
        members.forEach(node => {
            const point = positions.get(node), margin = node.radius + 28;
            bounds.left = Math.min(bounds.left, point.x - margin); bounds.right = Math.max(bounds.right, point.x + margin);
            bounds.top = Math.min(bounds.top, point.y - margin); bounds.bottom = Math.max(bounds.bottom, point.y + margin + 20);
        });
        if (entry.depth === 1) {
            // Symmetric bounds keep the Sun at the center of its whole local tree.
            const rx = Math.max(entry.x - bounds.left, bounds.right - entry.x), ry = Math.max(entry.y - bounds.top, bounds.bottom - entry.y);
            Object.assign(bounds, { left: entry.x-rx, right: entry.x+rx, top: entry.y-ry, bottom: entry.y+ry });
        }
        applyView(camera.boundsView(bounds, physics.bounds, { padding: 36, maxScale: entry.depth === 0 ? .58 : .82 }));
        return;
    }
    // Center in the usable graph area, leaving the fixed panel and controls visible.
    applyView({ x: (left + right) / 2 - entry.x * usefulScale,
        y: (top + bottom) / 2 - entry.y * usefulScale, scale: usefulScale });
}

function refreshSearchResults() {
    const viewport = readRenderViewport();
    searchResultList.replaceChildren();
    const matches = galaxyModel.search(entries, searchField.value);
    hierarchySidebar.markSearch(matches);
    const revealed = new Set(matches.flatMap(entry => galaxyModel.ancestors(entries, entry.id).map(ancestor => ancestor.id)));
    nodes.forEach((node, id) => node.classList.toggle("search-ancestor", revealed.has(id)));
    const matchIds = new Set(matches.map(entry => entry.id));
    nodes.forEach((node, id) => node.classList.toggle("search-match", matchIds.has(id)));
    entries.forEach(entry => renderNode(entry, nodes.get(entry.id), viewport));
    updateHierarchyPaths(viewport);
    searchResults.hidden = !searchOpen || !searchField.value.trim();
    matches.slice(0, 8).forEach((entry) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.entryId=entry.id;
        const path = galaxyModel.ancestors(entries, entry.id).reverse().map(parent => parent.name).join(" › ") || "Universe";
        const name = document.createElement('span'), location = document.createElement('small');
        name.textContent = entry.name; location.textContent = path; button.append(name, location); button.title = `${entry.name}\n${path}`;
        button.addEventListener("click", () => focusEntry(entry.id));
        const reveal=()=>{searchFocusId=entry.id;const node=nodes.get(entry.id);if(node)renderNode(entry,node);requestLabelLayout(true);updateHierarchyPaths();};
        const dismiss=()=>{if(searchFocusId===entry.id)searchFocusId=null;const node=nodes.get(entry.id);if(node)renderNode(entry,node);requestLabelLayout(true);updateHierarchyPaths();};
        button.addEventListener('focus',reveal);button.addEventListener('pointerenter',reveal);button.addEventListener('blur',dismiss);button.addEventListener('pointerleave',dismiss);
        item.appendChild(button);
        searchResultList.appendChild(item);
    });
    document.getElementById("search-status").textContent = matches.length ?
        `${matches.length} ${matches.length === 1 ? "match" : "matches"}${matches.length > 8 ? " · showing the first 8" : ""}` : "No matching items.";
}
searchField.addEventListener("input", () => { searchOpen = true; refreshSearchResults(); });
searchField.addEventListener("focus", () => { searchOpen = true; refreshSearchResults(); });
searchField.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        const first = galaxyModel.search(entries, searchField.value)[0];
        if (first) focusEntry(first.id);
    } else if (event.key === "ArrowDown") {
        event.preventDefault();
        searchResultList.querySelector("button")?.focus();
    }
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector('dialog[open]')) {
        if (activeConstellationId) { exitConstellation(); event.preventDefault(); return; }
        if (camera.travel) { camera.stopAnimation();  event.preventDefault(); return; }
        const dismissingSearch = searchOpen;
        dismissTemporaryReveal();
        if (!dismissingSearch) closeInspector(true);
    }
});
document.addEventListener("pointerdown", (event) => {
    if (event.button === 2) return;
    if (!event.target.closest(".entry-search")) {
        dismissTemporaryReveal();
    }
});

initializeGalaxy();
syncFirstUse();
const sampleUtility = document.getElementById('sample-utility');
// Explicit Sample mode remains available to development/tests via its URL.
sampleUtility.hidden=!sampleMode;
hierarchySidebar.mobileQuery.addEventListener('change', event => {
    if (event.matches) sampleUtility.open = false;
});
if (sampleMode) {
    sampleUtility.open = !hierarchySidebar.narrow;
    document.getElementById("sample-indicator").hidden = false;
    sampleControls.classList.add("sample-active");
    sampleModeLabel.textContent = "Sample data";
    sampleModeCount.textContent = `(${entries.size} temporary items)`;
}
loadSampleButton.disabled = sampleMode;
removeSampleButton.disabled = !sampleMode;
updateGraphViewport();
syncPhysicsGraph();
fitGalaxy(false);
cameraViewReady = true;

const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
physics.setReducedMotion(motionPreference.matches);
camera.setReducedMotion(motionPreference.matches);
motion.setReducedMotion(motionPreference.matches);
archiveMotion.setReducedMotion(motionPreference.matches);
const ambient=new CosmosAmbient({root:document.querySelector('.universe-background'),reduced:motionPreference.matches,
    busy:()=>!!document.querySelector('dialog[open]')||(!panel.hidden&&!contentInspector.root.hidden&&(!contentInspector.notesForm.hidden||!contentInspector.linkForm.hidden||!contentInspector.locationForm.hidden))||
        !!camera.frame||!!pan||!!pinch||activeNodeDrags>0||contentInspector.quickBookmark.contains(document.activeElement)||motion.constellationAnimating||motion.animations.size>0||contentInspector.jobs.size>0||archiveMotion.transitions.size>0});
// Deterministic console previews share rendering, with independent production timing/state.
window.debugComet=()=>ambient.debug('comet');
window.debugUfo=()=>ambient.debug('ufo');
motionPreference.addEventListener("change", (event) => {
    physics.setReducedMotion(event.matches);
    camera.setReducedMotion(event.matches);
    motion.setReducedMotion(event.matches);archiveMotion.setReducedMotion(event.matches);ambient.setReducedMotion(event.matches);
});

window.addEventListener("resize", () => {
    const wasNarrow = hierarchySidebar.narrow;
    archiveMotion.clear();
    closeContextMenu(); closeContentMenus(); closePanelItemMenus(); hierarchySidebar.onWindowResize();syncMobileViewport();
    if (!wasNarrow && hierarchySidebar.narrow) sampleUtility.open = false;
    renderBackground();
    navigationViewportChanged(false);
    updateOrbitGuides();
});
function closePanelItemMenus(){panel.querySelectorAll('.content-item-menu[open]').forEach(menu=>{menu.open=false;if(menu.contains(document.activeElement))menu.querySelector('summary').focus({preventScroll:true});});}
panel.addEventListener('scroll',()=>{
    if(!hierarchySidebar.narrow)return;
    panel.querySelectorAll('.content-item-menu[open]').forEach(menu=>{const actions=menu.querySelector('.content-row-actions'),r=menu.querySelector('summary').getBoundingClientRect();positionCosmosMenu(actions,r.right-actions.offsetWidth,r.bottom+4,{above:r.top-4});});
    if(!entryActions.hidden){const r=moreButton.getBoundingClientRect();positionCosmosMenu(entryActions,r.right-entryActions.offsetWidth,r.bottom+5,{above:r.top-5});}
    if(!contextMenu.hidden&&contextReturnFocus===moreButton)positionBodyActions(moreButton);
}, {passive:true});
function syncMobileViewport(){
    const v=cosmosVisibleViewport(),layoutHeight=window.innerHeight,style=document.documentElement.style;
    const keyboardInset=Math.max(0,layoutHeight-v.top-v.height);
    style.setProperty('--mobile-visible-height',`${v.height}px`);
    style.setProperty('--mobile-viewport-top',`${v.top}px`);
    style.setProperty('--mobile-keyboard-inset',`${keyboardInset}px`);
    galaxy.classList.toggle('mobile-keyboard-open',hierarchySidebar.narrow&&layoutHeight-v.top-v.height>80);
}
syncMobileViewport();
function mobileViewportChanged(){
    if(!hierarchySidebar.narrow)return;
    cancelCanvasTouches();
    syncMobileViewport();closeContextMenu();closeContentMenus();closePanelItemMenus();updateGraphViewport();requestLabelLayout(true);
    if(panel.contains(document.activeElement)&&document.activeElement.matches('input,textarea'))document.activeElement.scrollIntoView({block:'nearest',inline:'nearest'});
}
window.visualViewport?.addEventListener('resize',mobileViewportChanged);
window.visualViewport?.addEventListener('scroll',mobileViewportChanged);
window.addEventListener("pagehide", () => {
    labelDensity.destroy();
    motion.destroy();archiveMotion.clear();clearTimeout(archiveFeedbackTimer);ambient.destroy();
    if (graphNeedsSave) {
        checkpointGalaxy();
    }
});
document.addEventListener("visibilitychange", () => {
    ambient.refresh();
    if (document.hidden) {
        archiveMotion.clear();
        physics.pause();
        if (graphNeedsSave) {
            checkpointGalaxy();
        }
    } else if (!localSessionStale && !localRestoreInProgress && !dialog.open && !deleteDialog.open && !archiveDialog.open && !portalDialog.open && !constellationWorkspace.isDialogOpen()) {
        physics.resume();
    }
});
window.addEventListener('blur',()=>ambient.refresh());window.addEventListener('focus',()=>ambient.refresh());
window.addEventListener('pageshow',event=>{if(event.persisted){motion.setReducedMotion(motionPreference.matches);ambient.setReducedMotion(motionPreference.matches);ambient.resume();requestLabelLayout(true);if(!panel.hidden&&!constellationOverview)contentInspector.render();}});
