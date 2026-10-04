const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "model.js"), "utf8"), context);
const model = vm.runInContext("galaxyModel", context);
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function entry(id, role, parentId = null) {
    return { id, name: id, description: "Description", category: "", role, parentId, x: 400, y: 350 };
}
function family() {
    return new Map([
        ["star", entry("star", "category")], ["star-2", entry("star-2", "category")],
        ["planet", entry("planet", "subcategory", "star")],
        ["planet-2", entry("planet-2", "subcategory", "star-2")],
        ["moon", entry("moon", "entry", "planet")]
    ]);
}

test("generic stored roles map to the Sun, Planet and Moon presentation", () => {
    assert.deepEqual(plain(Object.fromEntries(Object.entries(model.roles).map(([role, value]) =>
        [role, { name: value.name, body: value.body, scale: value.scale }]
    ))), {
        category: { name: "Sun", body: "sun", scale: 1.35 },
        subcategory: { name: "Planet", body: "planet", scale: 1 },
        entry: { name: "Moon", body: "moon", scale: 0.66 }
    });
});

test("valid three-level hierarchy and reparenting pass validation", () => {
    const entries = family();
    entries.forEach((record) => assert.equal(model.validateChange(record, entries), ""));
    assert.equal(model.validateChange({ ...entries.get("planet"), parentId: "star-2" }, entries), "");
    assert.equal(model.validateChange({ ...entries.get("moon"), parentId: "planet-2" }, entries), "");
});

test("suns reject parents and planets/moons require the correct role", () => {
    const entries = family();
    assert.match(model.validateChange(entry("new", "category", "star"), entries), /Sun cannot have a parent/);
    assert.match(model.validateChange(entry("new", "subcategory"), entries), /existing Sun/);
    for (const record of [entry("new", "subcategory"), entry("new", "subcategory", "moon"),
        entry("new", "entry", "star"), entry("new", "entry", "missing"), entry("new", "entry", "new")]) {
        assert.match(model.validateChange(record, entries), /Choose an existing/);
    }
});

test("role changes with incompatible children are blocked until reassigned", () => {
    const entries = family();
    assert.match(model.validateChange({ ...entries.get("star"), role: "entry", parentId: "planet-2" }, entries), /children/);
    assert.match(model.validateChange({ ...entries.get("planet"), role: "category", parentId: null }, entries), /children/);
    entries.get("moon").parentId = "planet-2";
    assert.equal(model.validateChange({ ...entries.get("planet"), role: "category", parentId: null }, entries), "");
});

test("hierarchy edges derive from parent IDs and replace old edges after reparenting", () => {
    const entries = family();
    const links = [{ from: "moon", to: "star-2" }];
    const before = plain(model.buildConnections(entries, links));
    assert.ok(before.some((edge) => edge.from === "planet" && edge.to === "moon" && edge.kind === "hierarchy"));
    entries.get("moon").parentId = "planet-2";
    const after = plain(model.buildConnections(entries, links));
    assert.ok(!after.some((edge) => edge.from === "planet" && edge.to === "moon"));
    assert.ok(after.some((edge) => edge.from === "planet-2" && edge.to === "moon" && edge.kind === "hierarchy"));
    assert.ok(after.some((edge) => edge.from === "moon" && edge.to === "star-2" && edge.kind === "relationship"));
    assert.deepEqual(links, [{ from: "moon", to: "star-2" }]);
});

test("duplicate, missing and self connections never create extra edges", () => {
    const entries = family();
    const edges = plain(model.buildConnections(entries, [
        { from: "planet", to: "star" }, { from: "star", to: "planet" },
        { from: "star", to: "star" }, { from: "star", to: "missing" }
    ]));
    assert.equal(edges.length, 3);
    assert.ok(edges.every((edge) => edge.kind === "hierarchy"));
});

test("legacy roles and absent/invalid parent IDs preserve unassigned entries", () => {
    const records = new Map([
        ["star", model.normalizeEntry({ ...entry("star", "group"), parentId: "moon" })],
        ["planet", model.normalizeEntry(entry("planet", "subcategory", "missing"))],
        ["moon", model.normalizeEntry({ ...entry("moon", "unknown"), parentId: "star" })]
    ]);
    model.normalizeHierarchy(records);
    assert.equal(records.get("star").role, "category");
    assert.equal(records.get("moon").role, "entry");
    records.forEach((record) => assert.equal(record.parentId, null));
    assert.equal(model.normalizeEntry({ ...entry("old", "entry"), category: undefined }).category, "");
});

test("children can be checked safely before deletion", () => {
    const entries = family();
    assert.deepEqual(plain(model.childrenOf(entries, "planet")).map((child) => child.id), ["moon"]);
    assert.equal(model.childrenOf(entries, "moon").length, 0);
    entries.delete("moon");
    assert.equal(model.childrenOf(entries, "planet").length, 0);
});

test("name search is case insensitive, ranks prefixes and preserves duplicate IDs", () => {
    const entries = new Map([
        ["a", { ...entry("a", "entry"), name: "Fresh Apple" }],
        ["b", { ...entry("b", "entry"), name: "Apple" }],
        ["c", { ...entry("c", "entry"), name: "Apple" }]
    ]);
    assert.deepEqual(plain(model.search(entries, " APP ")).map((record) => record.id), ["b", "c", "a"]);
    assert.equal(model.search(entries, "").length, 0);
    assert.equal(model.search(entries, "banana").length, 0);
});

test("layout normalization ignores invalid/stale coordinates without changing hierarchy", () => {
    const entries = family();
    const before = JSON.stringify([...entries]);
    const layout = model.normalizeLayout([
        { id: "planet", x: 900, y: 430, pinned: true },
        { id: "moon", x: 950, y: 600, pinned: "true" },
        { id: "missing", x: 250, y: 300, pinned: true },
        { id: "star", x: Infinity, y: 300 }, null, { id: "star-2", x: "400", y: 400 }
    ], entries);
    assert.deepEqual(plain([...layout]), [
        ["planet", { x: 900, y: 430, pinned: true }], ["moon", { x: 950, y: 600, pinned: false }]
    ]);
    assert.equal(JSON.stringify([...entries]), before);
});
