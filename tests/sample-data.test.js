const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const context = vm.createContext({ URLSearchParams });
vm.runInContext(fs.readFileSync(path.join(root, "model.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "sample-data.js"), "utf8"), context);
const model = vm.runInContext("galaxyModel", context);
const sample = vm.runInContext("galaxySample", context);
function plain(value) { return JSON.parse(JSON.stringify(value)); }

test("large sample is explicitly activated by its development query", () => {
    assert.equal(sample.isRequested("?sample=large"), true);
    assert.equal(sample.isRequested("?sample=small"), false);
    assert.equal(sample.isRequested(""), false);
});

test("large sample builds seven realistic systems and 77 valid entries", () => {
    const snapshot = plain(sample.build());
    const entries = new Map(snapshot.entries.map((entry) => [entry.id, model.normalizeEntry(entry)]));
    assert.equal(entries.size, 77);
    assert.equal(new Set(entries.keys()).size, 77);
    assert.deepEqual([...entries.values()].reduce((counts, entry) => {
        counts[entry.role]++;
        return counts;
    }, { category: 0, subcategory: 0, entry: 0 }), { category: 7, subcategory: 21, entry: 49 });
    assert.deepEqual([...entries.values()].filter((entry) => entry.role === "category").map((entry) => entry.name),
        ["Technology", "Food", "Travel", "Books", "Fitness", "Business", "Music"]);
    entries.forEach((entry) => assert.equal(model.validateChange(entry, entries), ""));
    assert.ok([...entries.values()].filter((entry) => entry.role === "category")
        .every((sun) => model.childrenOf(entries, sun.id).length === 3));
    assert.ok([...entries.values()].filter((entry) => entry.role === "subcategory")
        .every((planet) => model.childrenOf(entries, planet.id).length >= 2));
    assert.equal(model.buildConnections(entries, snapshot.connections).length, 70);
    assert.deepEqual(snapshot.layout, []);
});

test("sample generation is deterministic and contains no persistence access", () => {
    assert.deepEqual(plain(sample.build()), plain(sample.build()));
    assert.equal(fs.readFileSync(path.join(root, "sample-data.js"), "utf8").includes("localStorage"), false);
});
