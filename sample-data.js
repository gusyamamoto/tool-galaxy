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
        return { entries, connections: [], layout: [] };
    }
};
