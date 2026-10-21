const {test} = require('node:test');
const assert = require('node:assert/strict');
const Split = require('../sidebar-split.js');

test('default keeps Universe dominant while allowing compact secondary content', () => {
    assert.equal(Split.layout(808, null, 70).top, 696);
    assert.equal(Split.layout(808, null, 700).top, 544);
});
test('numeric preferences clamp to usable pane minima; malformed values use the default', () => {
    assert.equal(Split.layout(808, -9).top, 160);
    assert.equal(Split.layout(808, 99).top, 696);
    for(const invalid of [null, undefined, '0.5', {}, NaN, Infinity]) assert.equal(Split.layout(808, invalid).top, 544);
});
test('short viewports proportionally scale both minimums without negative space', () => {
    for(const height of [0, 8, 50, 150, 264, 900]) {
        for(const ratio of [-1, .1, .8, 3]) {
            const result = Split.layout(height, ratio);
            assert.ok(result.top >= 0 && result.top <= result.available);
            assert.ok(result.top >= result.min && result.top <= result.max);
        }
    }
});
test('viewport clamping leaves the saved preference reusable on a larger viewport', () => {
    const ratio = .85;
    assert.equal(Split.layout(308, ratio).top, 196);
    assert.equal(Split.layout(1008, ratio).top, 850);
});
