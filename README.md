# Tool Galaxy

A visual playground for discovering, organizing, and connecting useful tools for building apps and websites.

This project is also being used to learn and practice web development, Git, and GitHub.

No install or build step is needed. For reliable persistence, serve this folder
with `python -m http.server 8000`, then open `http://localhost:8000` in a modern
browser. Always use the same address and port to access the same saved galaxy.
Opening `index.html` directly also works in browsers that allow file storage, but
[localStorage behavior for file URLs varies between browsers](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage#description).

Click **Add Tool**, enter a name, description, and category, and optionally check
one or more existing tools to connect to. Submit to create and select the new
node. Drag nodes to arrange the galaxy, or click them
(or focus them and press Enter/Space) to show their information. Cancel or Escape
closes the form without creating a tool.

Both built-in and newly created SVG connections follow either endpoint while
dragging. The connection checklist includes built-in tools and previously added
tools, and is refreshed each time the form opens. Leaving it empty is allowed.

Custom tools and their connections survive refresh using browser `localStorage`.
Node positions are saved on drag end and again when the graph settles, including
the positions of built-in tools. In-flight positions are also saved when leaving
or hiding the page. The built-in names, descriptions, categories, and connections still come from
the source code. Data stays in the same browser and site origin; it is not synced
to other browsers or devices. If storage cannot be read or written, a message
appears and the galaxy remains usable.

The app uses plain JavaScript and the browser's native dialog and form validation.
`createToolNode` shares rendering and pointer interactions between initial and added
tools, while `selectTool` updates highlighting and the detail panel. Nodes and
connections use stable IDs, so duplicate display names are supported.
`createConnection` shares SVG creation for built-in, added, and restored links.

`physics.js` wraps [D3 Force](https://d3js.org/d3-force). Link forces act like
springs, a many-body force repels nodes, and a circle collision force keeps space
between them. Weak forces toward the viewport center keep isolated tools nearby;
a viewport constraint keeps nodes clear of the controls and detail panel.
Dragging temporarily fixes a particle to the pointer and reheats the simulation.
Releasing it removes that constraint; velocity damping and gradual cooling stop
the graph after a few seconds. Adding a tool also reheats the layout. The graph
pauses while the form is open or the page is hidden, and reduced-motion settings
increase damping and shorten settling time.

The simulation has separate temporary particle/link objects. Simulation ticks
copy their coordinates into the app's tool records, then `renderGraph()` updates
node transforms and SVG endpoints together. Velocities, fixed drag positions,
and D3's object references never enter localStorage. Previously stored version 1
data remains compatible; saved coordinates are starting positions for the layout,
not permanently pinned locations.

The muted background, small star accents, shaded node surfaces, inset lighting,
and soft shadows create depth within a 2D graph. Selection uses a restrained ring
and slightly brighter incident connections. There is no continuous idle animation;
motion comes from the simulation reacting and settling.

`storage.js` isolates storage access behind `galaxyStorage.load()` and `.save()`.
The `tool-galaxy:user-data` key contains a versioned JSON snapshot:

```json
{
  "version": 1,
  "tools": [
    {
      "id": "custom-1",
      "name": "Example",
      "description": "A useful tool",
      "category": "Development",
      "x": 80,
      "y": 160
    }
  ],
  "connections": [{ "from": "custom-1", "to": "github" }],
  "builtInPositions": [
    { "id": "github", "x": 300, "y": 250 },
    { "id": "vs-code", "x": 550, "y": 380 },
    { "id": "codex", "x": 800, "y": 220 }
  ]
}
```

`initializeGalaxy()` in `script.js` loads the snapshot, merges positions into
the built-in tools, restores valid custom tools, then renders connections after
all nodes exist. Invalid tool entries, missing endpoints, self-connections, and
duplicate connections are ignored. Unreadable or unsupported snapshots are left
untouched and saving is disabled for that session.

The app keeps plain tool/connection records separate from DOM nodes and SVG
elements. A future backend can replace the storage adapter and make startup/save
asynchronous while reusing the same data model and rendering functions.

The only new runtime dependency is D3 Force 3.0.0, plus its required D3 dispatch,
quadtree, and timer modules. Pinned browser distributions are included in
`vendor/d3-force.bundle.min.js` (about 18 KB uncompressed), with upstream licenses,
source URLs, and checksums in `vendor/`. This avoids a build tool, a UI framework,
and runtime CDN access. There is no authentication or database.

Run the physics regression tests with `node --test tests/physics.test.js`.
