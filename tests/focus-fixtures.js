// Deterministic, legitimate v5 trees for local-world tests and visual review.
// Coordinates are deliberately neutral: the real orbital layout owns spacing.
const focusFixtures = {
    make(kind = 'recipes100') {
        const records = [], createdAt = '2026-10-08T12:00:00.000Z';
        const add = (id, name, parentId = null) => {
            records.push({id, name, parentId, x: 640, y: 420, description: '', createdAt});
            return id;
        };
        const galaxy = add('focus-life', 'Everyday life');
        const sun = add('focus-recipes', 'Recipes', galaxy);
        const categories = kind==='sun14'?Array.from({length:14},(_,i)=>['Chicken','Beef','Pasta','Desserts','Vegetarian'][i%5]+(i>=5?` ${i+1}`:'')):
            kind==='sun3'?['Chicken','Beef','Pasta']:['Chicken', 'Beef', 'Pasta', 'Desserts', 'Vegetarian'];
        const planets = categories.map((name, index) => add(`focus-category-${index}`, name, sun));
        const recipeNames = ['Lemon roast', 'Weeknight bowl', 'Family favourite', 'Slow Sunday', 'Lunch prep', 'One-pot supper', 'Celebration dinner'];
        const dense = kind === 'siblings100';
        const target = ['recipes50','sun3'].includes(kind) ? 52 : kind === 'recipes100' ? 102 : kind === 'broad300' ? 202 : dense ? 112 : 107;
        if (kind === 'pathological100') {
            for (let i = 0; i < 100; i++) add(`focus-recipe-${i}`, `${recipeNames[i % recipeNames.length]} ${i + 1}`, planets[0]);
        } else {
            let index = 0;
            while (records.length < target - 5) {
                const parent = planets[index % (dense ? 2 : planets.length)];
                const recipe = add(`focus-recipe-${index}`, `${recipeNames[index % recipeNames.length]} ${index + 1}`, parent);
                if (records.length < target - 5) add(`focus-detail-${index}`, 'Ingredients and method', recipe);
                if (index % 3 === 0 && records.length < target - 5) add(`focus-tip-${index}`, 'Family notes', `focus-detail-${index}`);
                index++;
            }
            let parent = 'focus-detail-0';
            for (let i = 0; i < 5; i++) parent = add(`focus-deep-${i}`, ['Cooking class', 'Technique', 'Practice', 'Observation', 'Next attempt'][i], parent);
        }
        if(kind==='moonmany')for(let i=0;i<28;i++)add(`focus-moon-child-${i}`,`Technique ${i+1}`,'focus-recipe-0');
        if(kind==='moonfamilies'){
            const satelliteB=add('focus-satellite-b','Planning and supplies','focus-recipe-0');
            for(let i=0;i<4;i++)add(`focus-b-astronaut-${i}`,`Supply note ${i+1}`,satelliteB);
            add('focus-direct-moon','Quick reference','focus-recipe-0');
        }
        if(kind==='moonorbit'){
            const obsolete=new Set(['focus-detail-0','focus-tip-0',...Array.from({length:5},(_,i)=>`focus-deep-${i}`)]);
            for(let i=records.length-1;i>=0;i--)if(obsolete.has(records[i].id))records.splice(i,1);
            const a=add('focus-satellite-a','Satellite A','focus-recipe-0'),b=add('focus-satellite-b','Satellite B','focus-recipe-0');
            for(let i=1;i<=3;i++)add(`focus-a${i}`,`Astronaut A${i}`,a);
            add('focus-b1','Astronaut B1',b);
        }
        if (kind === 'broad300') {
            const projects = add('focus-projects', 'Projects and learning');
            const classes = add('focus-classes', 'Classes', projects);
            const courses = ['Photography', 'Language practice', 'Garden planning', 'Woodworking'].map((name, i) => add(`focus-course-${i}`, name, classes));
            let index = 0;
            while (records.length < 300) {
                const session = add(`focus-session-${index}`, `Session ${index + 1}`, courses[index % courses.length]);
                if (records.length < 300) add(`focus-session-notes-${index}`, 'Notes and practice', session);
                index++;
            }
        }
        const firstChild = 'focus-recipe-0', deepTarget = kind === 'pathological100' ? firstChild : kind==='moonorbit'?'focus-a3':'focus-deep-4';
        const childIds = records.filter(record => record.parentId === planets[0]).map(record => record.id);
        const otherChild = records.find(record => record.parentId === planets[1])?.id || planets[1];
        const snapshot = {version: 5, entries: records, connections: [], layout: [],
            constellations: [{id: 'focus-constellation', name: 'Shared favourites', memberEntryIds: [firstChild, otherChild, deepTarget], createdAt}],
            portals: [{id: 'focus-linked', targetEntryId: deepTarget, parentEntryId: planets[1], createdAt}], archivedGalaxies: []};
        return {kind, snapshot, ids: {galaxy, sun, planetA: planets[0], planetB: planets[1], firstChild, deepTarget,
            satellite: kind === 'pathological100' ? firstChild : kind==='moonorbit'?'focus-satellite-a':'focus-detail-0', deepWorld: kind === 'pathological100' ? firstChild : kind==='moonorbit'?'focus-a2':'focus-deep-2',
            offscreenChild: childIds[childIds.length - 1], childIds}, expectedTotal: records.length};
    }
};
if (typeof module !== 'undefined') module.exports = focusFixtures;
