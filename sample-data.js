// Development-only sample data. It is built in memory and never persisted.
const galaxySample = {
    queryValue: "large",

    isRequested(search) {
        return new URLSearchParams(search).get("sample") === this.queryValue;
    },

    build() {
        const systems = [
            {
                name: "Technology", description: "Software, devices and emerging technology.",
                planets: [
                    ["Software", "Applications and development tools.", [["Visual Studio Code", "Source-code editor."], ["GitHub", "Code hosting and collaboration."], ["Docker", "Container development platform."]]],
                    ["Artificial Intelligence", "AI products and research.", [["ChatGPT", "General-purpose AI assistant."], ["Local Models", "Models running on personal hardware."]]],
                    ["Hardware", "Computers and electronic devices.", [["Laptop", "Primary portable computer."], ["Raspberry Pi", "Small computer for experiments."]]]
                ]
            },
            {
                name: "Food", description: "Ingredients, cooking and places to eat.",
                planets: [
                    ["Ingredients", "Staples and ingredients to keep available.", [["Seasonal Fruit", "Fruit chosen by season."], ["Fresh Herbs", "Herbs for everyday cooking."], ["Whole Grains", "Rice, oats and other grains."]]],
                    ["Cooking", "Recipes and cooking techniques.", [["Sourdough", "Naturally leavened bread."], ["Weeknight Stir-fry", "Fast flexible evening meal."]]],
                    ["Restaurants", "Places and cuisines to explore.", [["Japanese", "Japanese restaurants to try."], ["Mediterranean", "Mediterranean restaurants to try."]]]
                ]
            },
            {
                name: "Travel", description: "Destinations, planning and experiences.",
                planets: [
                    ["Destinations", "Places for future trips.", [["Japan", "Cities, countryside and rail travel."], ["Iceland", "Landscapes and road trips."], ["Portugal", "Coastal cities and historic towns."]]],
                    ["Planning", "Practical travel preparation.", [["Flights", "Routes and fare research."], ["Accommodation", "Hotels and short stays."]]],
                    ["Activities", "Things to do while travelling.", [["Hiking", "Trails and day hikes."], ["Museums", "Art, history and design museums."]]]
                ]
            },
            {
                name: "Books", description: "Reading, authors and reference material.",
                planets: [
                    ["Fiction", "Novels and short fiction.", [["Dune", "Science-fiction novel by Frank Herbert."], ["Earthsea", "Fantasy series by Ursula K. Le Guin."], ["The Left Hand of Darkness", "Science-fiction novel by Ursula K. Le Guin."]]],
                    ["Nonfiction", "Ideas, history and practical subjects.", [["Sapiens", "A broad history of humankind."], ["The Design of Everyday Things", "Human-centered product design."]]],
                    ["Reading Lists", "Ways to organize future reading.", [["To Read", "Books queued for later."], ["Favorites", "Books worth revisiting."]]]
                ]
            },
            {
                name: "Fitness", description: "Training, movement and recovery.",
                planets: [
                    ["Strength", "Progressive resistance training.", [["Squat", "Lower-body compound lift."], ["Deadlift", "Posterior-chain compound lift."], ["Press", "Upper-body pressing movements."]]],
                    ["Cardio", "Aerobic conditioning.", [["Running", "Outdoor and treadmill running."], ["Cycling", "Road and indoor cycling."]]],
                    ["Recovery", "Practices that support consistent training.", [["Sleep", "Sleep schedule and quality."], ["Mobility", "Range-of-motion practice."]]]
                ]
            },
            {
                name: "Business", description: "Strategy, operations and customers.",
                planets: [
                    ["Strategy", "Direction and competitive choices.", [["Market Research", "Customer and competitor research."], ["Product Roadmap", "Planned product outcomes."], ["Pricing", "Packaging and pricing decisions."]]],
                    ["Operations", "How the organization runs.", [["Processes", "Repeatable operating procedures."], ["Finance", "Budgets and financial reporting."]]],
                    ["Customers", "Customer relationships and service.", [["CRM", "Customer relationship records."], ["Support", "Customer questions and issue resolution."]]]
                ]
            },
            {
                name: "Music", description: "Listening, playing and music practice.",
                planets: [
                    ["Instruments", "Instruments to play and learn.", [["Guitar", "Acoustic and electric guitar."], ["Piano", "Keyboard technique and repertoire."], ["Drums", "Rhythm and coordination practice."]]],
                    ["Genres", "Styles and listening paths.", [["Jazz", "Jazz artists and recordings."], ["Electronic", "Electronic music and production."]]],
                    ["Practice", "Structured ways to improve.", [["Scales", "Technique and ear training."], ["Repertoire", "Pieces currently being learned."]]]
                ]
            }
        ];
        const centers = [[220, 270], [520, 250], [850, 270], [1030, 520], [840, 750], [500, 760], [220, 650]];
        const planetOffsets = [[-120, -80], [125, -70], [0, 145]];
        const moonOffsets = [[-66, -34], [66, -30], [0, 72]];
        const entries = [];

        systems.forEach((system, systemIndex) => {
            const sunId = `sample-sun-${system.name.toLowerCase()}`;
            const [sunX, sunY] = centers[systemIndex];
            entries.push(this.entry(sunId, system.name, system.description, "category", null, sunX, sunY));
            system.planets.forEach(([name, description, moons], planetIndex) => {
                const planetId = `sample-planet-${systemIndex}-${planetIndex}`;
                const [planetDx, planetDy] = planetOffsets[planetIndex];
                const planetX = sunX + planetDx;
                const planetY = sunY + planetDy;
                entries.push(this.entry(planetId, name, description, "subcategory", sunId, planetX, planetY));
                moons.forEach(([moonName, moonDescription], moonIndex) => {
                    const [moonDx, moonDy] = moonOffsets[moonIndex];
                    entries.push(this.entry(`sample-moon-${systemIndex}-${planetIndex}-${moonIndex}`,
                        moonName, moonDescription, "entry", planetId, planetX + moonDx, planetY + moonDy));
                });
            });
        });

        return { entries, connections: [], layout: [] };
    },

    entry(id, name, description, role, parentId, x, y) {
        return { id, name, description, category: "Development sample", role, parentId, x, y };
    }
};
