// Run with: node --test tests/*.test.js (no test dependencies).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "..", "storage.js"), "utf8");
const legacyKey = "tool-galaxy:user-data";
const currentKey = "galaxy:user-data";
const backupKey = "galaxy:user-data:pre-hierarchy";
const layoutBackupKey = "galaxy:user-data:pre-layout";
const legacy = {
    version: 1,
    tools: [{ id: "custom-8", name: "Apple", description: "A fruit", category: "Food", x: 250, y: 300 }],
    connections: [{ from: "custom-8", to: "github" }],
    builtInPositions: [{ id: "github", x: 300, y: 250 }]
};

function makeStorage(records = []) {
    const data = new Map(records);
    const localStorage = {
        getItem(key) { return data.get(key) ?? null; },
        setItem(key, value) { data.set(key, value); }
    };
    const context = vm.createContext({ localStorage });
    vm.runInContext(source, context);
    return { data, localStorage, adapter: vm.runInContext("galaxyStorage", context) };
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }

test("an empty browser has no saved snapshot", () => {
    assert.equal(makeStorage().adapter.load(), null);
});

test("legacy snapshots become generic entries without changing IDs or the old key", () => {
    const raw = JSON.stringify(legacy);
    const { adapter, data } = makeStorage([[legacyKey, raw]]);
    const result = plain(adapter.load());
    assert.deepEqual(result, {
        version: 4, legacy: true, entries: [...legacy.tools, ...legacy.builtInPositions],
        connections: legacy.connections, layout: []
    });
    assert.equal(data.get(legacyKey), raw);
    assert.equal(data.has(currentKey), false);
});

test("new saves use generic entries and preserve roles and the legacy backup", () => {
    const raw = JSON.stringify(legacy);
    const { adapter, data } = makeStorage([[legacyKey, raw]]);
    const snapshot = {
        entries: [{ ...legacy.tools[0], role: "group" }],
        connections: legacy.connections
    };
    adapter.save(snapshot);
    assert.deepEqual(JSON.parse(data.get(currentKey)), { version: 4, ...snapshot, layout: [] });
    assert.equal(data.get(legacyKey), raw);
    assert.equal(Object.hasOwn(JSON.parse(data.get(currentKey)), "tools"), false);
    assert.deepEqual(plain(adapter.load()), { version: 4, legacy: false, entries: snapshot.entries, connections: snapshot.connections, layout: [] });
});

test("the current key wins over a stale legacy backup", () => {
    const current = { version: 2, entries: [], connections: [], builtInPositions: [] };
    const { adapter } = makeStorage([[legacyKey, JSON.stringify(legacy)], [currentKey, JSON.stringify(current)]]);
    assert.deepEqual(plain(adapter.load()), { version: 4, legacy: true, entries: [], connections: [], layout: [] });
});

test("broken current data is preserved rather than silently loading an older backup", () => {
    const { adapter, data } = makeStorage([[legacyKey, JSON.stringify(legacy)], [currentKey, "{broken"]]);
    assert.throws(() => adapter.load());
    assert.equal(data.get(currentKey), "{broken");
});

test("unknown versions and invalid containers are rejected", () => {
    for (const snapshot of [
        { version: 99, entries: [], connections: [], builtInPositions: [] },
        { version: 2, entries: {}, connections: [], builtInPositions: [] },
        { version: 2, entries: [], connections: null, builtInPositions: [] }
    ]) {
        const { adapter } = makeStorage([[currentKey, JSON.stringify(snapshot)]]);
        assert.throws(() => adapter.load(), /invalid saved galaxy/);
    }
});

test("storage failures propagate to the app's status handling", () => {
    const { adapter, localStorage } = makeStorage();
    localStorage.getItem = () => { throw new Error("blocked"); };
    assert.throws(() => adapter.load(), /blocked/);
    localStorage.getItem = () => null;
    localStorage.setItem = () => { throw new Error("quota"); };
    assert.throws(() => adapter.save({ entries: [], connections: [], builtInPositions: [] }), /quota/);
});

test("the first hierarchy save keeps the exact version 2 snapshot as a backup", () => {
    const old = JSON.stringify({ version: 2, entries: legacy.tools, connections: legacy.connections, builtInPositions: legacy.builtInPositions });
    const { adapter, data } = makeStorage([[currentKey, old]]);
    const snapshot = { entries: [{ ...legacy.tools[0], role: "entry", parentId: "planet-id" }], connections: [] };
    adapter.save(snapshot);
    assert.equal(data.get(backupKey), old);
    assert.deepEqual(JSON.parse(data.get(currentKey)), { version: 4, ...snapshot, layout: [] });
    adapter.save({ entries: [], connections: [] });
    assert.equal(data.get(backupKey), old, "later saves must never overwrite the migration backup");
});

test("version 3 restores hierarchy fields and built-in edits without legacy defaults", () => {
    const snapshot = { version: 3, entries: [
        { ...legacy.tools[0], role: "entry", parentId: "planet-id" },
        { id: "github", name: "Repositories", description: "Edited", category: "", role: "category", parentId: null, x: 500, y: 400 }
    ], connections: [] };
    const { adapter } = makeStorage([[currentKey, JSON.stringify(snapshot)]]);
    assert.deepEqual(plain(adapter.load()), { ...snapshot, version: 4, legacy: false, layout: [] });
});

test("a failed migration backup leaves the original snapshot untouched", () => {
    const old = JSON.stringify({ version: 2, entries: [], connections: [], builtInPositions: [] });
    const { adapter, data, localStorage } = makeStorage([[currentKey, old]]);
    localStorage.setItem = () => { throw new Error("quota"); };
    assert.throws(() => adapter.save({ entries: [], connections: [] }), /quota/);
    assert.equal(data.get(currentKey), old);
});

test("layout preferences round-trip separately from semantic entries", () => {
    const { adapter } = makeStorage();
    const snapshot = { entries: legacy.tools, connections: legacy.connections,
        layout: [{ id: "custom-8", x: 800, y: 430, pinned: false }, { id: "github", x: 400, y: 350, pinned: true }] };
    adapter.save(snapshot);
    assert.deepEqual(plain(adapter.load()), { version: 4, legacy: false, ...snapshot });
    adapter.save({ ...snapshot, layout: [] });
    assert.deepEqual(plain(adapter.load()).layout, [], "releasing a placement must survive refresh");
});

test("version 3 upgrades preserve hierarchy and keep an exact pre-layout backup", () => {
    const old = JSON.stringify({ version: 3, entries: legacy.tools, connections: legacy.connections });
    const { adapter, data } = makeStorage([[currentKey, old]]);
    const migrated = plain(adapter.load());
    assert.equal(migrated.legacy, false, "version 3 optional connections must not be seeded again");
    assert.deepEqual(migrated.layout, []);
    adapter.save({ entries: migrated.entries, connections: migrated.connections, layout: [{ id: "custom-8", x: 900, y: 400, pinned: true }] });
    assert.equal(data.get(layoutBackupKey), old);
    adapter.save({ entries: migrated.entries, connections: [], layout: [] });
    assert.equal(data.get(layoutBackupKey), old);
});

test("unsupported layout containers and failed layout backups preserve original data", () => {
    const { adapter: broken } = makeStorage([[currentKey, JSON.stringify({ version: 4, entries: [], connections: [], layout: {} })]]);
    assert.throws(() => broken.load(), /invalid saved galaxy/);
    const old = JSON.stringify({ version: 3, entries: [], connections: [] });
    const { adapter, data, localStorage } = makeStorage([[currentKey, old]]);
    localStorage.setItem = () => { throw new Error("quota"); };
    assert.throws(() => adapter.save({ entries: [], connections: [], layout: [] }), /quota/);
    assert.equal(data.get(currentKey), old);
});
