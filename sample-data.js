// Temporary development tree. No persistence access, stable IDs and fresh copies.
const galaxySample = {
    queryValue: "large",
    isRequested(search) { return new URLSearchParams(search).get("sample") === this.queryValue; },
    build() {
        const entries = [];
        const add = (id, name, parentId = null) => {
            entries.push({ id, name, description: `Explore ${name}.`, category: "Development sample", parentId, x: 400, y: 350 });
            return id;
        };
        const domains = [
            ["Work", ["Development", "Business"], [["Software", "AI", "Hardware"], ["Strategy", "Operations", "Customers"]]],
            ["Food", ["Recipes", "Ingredients"], [["Italian", "Japanese", "Baking"], ["Produce", "Pantry", "Seasonal"]]],
            ["Travel", ["Destinations", "Planning"], [["Europe", "Asia", "Americas"], ["Transport", "Stays", "Experiences"]]],
            ["Personal", ["Learning", "Wellbeing"], [["Books", "Music", "Languages"], ["Fitness", "Recovery", "Habits"]]]
        ];
        const topics = [
            [["Editors", "Repositories"], ["Codex", "Local Models"], ["Laptop", "Experiments"]],
            [["Research", "Roadmap"], ["Processes", "Finance"], ["CRM", "Support"]],
            [["Chicken", "Pasta"], ["Rice", "Noodles"], ["Bread", "Pastry"]],
            [["Fruit", "Vegetables"], ["Grains", "Spices"], ["Summer", "Winter"]],
            [["Portugal", "Iceland"], ["Japan", "Vietnam"], ["Canada", "Mexico"]],
            [["Flights", "Rail"], ["Hotels", "Cabins"], ["Hiking", "Museums"]],
            [["Fiction", "Nonfiction"], ["Guitar", "Piano"], ["French", "Japanese"]],
            [["Strength", "Cardio"], ["Sleep", "Mobility"], ["Routines", "Reflection"]]
        ];
        domains.forEach(([domain, suns, planets], g) => {
            const galaxy = add(`sample-galaxy-${g}`, domain);
            suns.forEach((name, s) => {
                const sunIndex = g * 2 + s, sun = add(`sample-sun-${sunIndex}`, name, galaxy);
                planets[s].forEach((name, p) => {
                    const planet = add(`sample-planet-${sunIndex}-${p}`, name, sun);
                    topics[sunIndex][p].forEach((name, m) => {
                        const moon = add(`sample-moon-${sunIndex}-${p}-${m}`, name, planet);
                        const titles = sunIndex === 2 && p === 0 && m === 0 ? ["Chicken Parmigiana", "Chicken Piccata"] :
                            sunIndex === 0 && p === 1 && m === 0 ? ["Coding workflows", "Review habits"] : ["Reference", "Practice"];
                        titles.forEach((name, t) => add(`sample-satellite-${sunIndex}-${p}-${m}-${t}`, name, moon));
                    });
                });
            });
        });
        const deep = add("sample-deep-5", "Parmigiana techniques", "sample-satellite-2-0-0-0");
        const deeper = add("sample-deep-6", "Sauce preparation", deep);
        add("sample-deep-7", "Slow simmer notes", deeper);
        add("sample-deep-8", "Texture observations", "sample-deep-7");
        add("sample-eva-seasoning", "Seasoning balance", deep);
        add("sample-eva-crust", "Crust notes", deep);
        add("sample-eva-resting", "Resting time", deep);
        const rename = (id, name) => {
            const entry = entries.find(entry => entry.id === id);
            entry.name = name; entry.description = `Explore ${name}.`;
        };
        rename("sample-satellite-0-0-0-0", "VS Code");
        rename("sample-satellite-0-0-1-0", "GitHub");
        rename("sample-planet-3-2", "Protein");
        rename("sample-moon-3-2-0", "Chicken");
        rename("sample-moon-3-2-1", "Tofu");
        const recipe = entries.find(entry => entry.id === "sample-satellite-2-0-0-0");
        recipe.content = { version: 1, notes: { format: "plain", text: "Prep ahead: bread the chicken, then chill.\nFinish the sauce while the chicken rests." },
            links: [{ id: "sample-recipe-link", url: "https://www.seriouseats.com/", title: "Recipe inspiration" }],
            attachments: [{ id: "sample-recipe-file", kind: "upload", entryId: recipe.id, filename: "prep-notes.txt", mimeType: "text/plain",
                size: this.fileText.length, storageKey: "sample-recipe-file", createdAt: "2026-01-01T00:00:00.000Z" }] };
        entries.find(entry => entry.id === "sample-moon-0-1-0").content = { version: 1, notes: { format: "plain", text: "Keep prompts and review notes together.\nCheck changes before committing." }, links: [
            { id: "sample-codex-link", url: "https://openai.com/codex/", title: "Codex" },
            { id: "sample-github-link", url: "https://github.com/", title: "Repositories" }], attachments: [] };
        const portals = [
            { id: "sample-portal-recipe", targetEntryId: recipe.id, parentEntryId: "sample-galaxy-1" },
            { id: "sample-portal-codex", targetEntryId: "sample-moon-0-1-0", parentEntryId: "sample-galaxy-1" },
            { id: "sample-portal-deep", targetEntryId: "sample-deep-7", parentEntryId: "sample-galaxy-2" }
        ].map(portal => ({ ...portal, createdAt: "2026-01-01T00:00:00.000Z" }));
        const constellations = [
            { id: 'sample-constellation-meals', name: 'Weeknight Meals', memberEntryIds: [recipe.id, 'sample-satellite-2-0-0-1', 'sample-moon-3-2-0'] },
            { id: 'sample-constellation-trip', name: 'Trip & Prep', memberEntryIds: ['sample-moon-4-2-1', 'sample-moon-5-1-0', recipe.id, 'sample-moon-1-1-1'] },
            { id: 'sample-constellation-techniques', name: 'Recipe Experiments', memberEntryIds: [recipe.id, deep, 'sample-deep-7', 'sample-deep-8'] }
        ].map(collection => ({ ...collection, createdAt: '2026-01-01T00:00:00.000Z' }));
        return { entries, layout: [], portals, constellations };
    },
    fileText: "Parmigiana prep checklist\nBread the chicken and chill.\nPrepare sauce separately.\nRest briefly before serving.\n",
    files() { return [{ key: "sample-recipe-file", entryId: "sample-satellite-2-0-0-0", blob: new Blob([this.fileText], { type: "text/plain" }) }]; }
};
