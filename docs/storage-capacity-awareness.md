# Browser storage capacity awareness (F7)

## Audit and scope

Previously there were no runtime `navigator.storage` calls or proactive quota estimates. F2 already caught actual quota failures: attachment preparation/write errors flow through `EntryContentInspector.job`, with inline feedback or its persistent file-failure notice; metadata failures retain their existing messages and rollback behavior.

Camera, gallery, generic picker, multiple selection and dropped files all reach `EntryContentInspector.upload`. It now checks one batch before preparation and the first durable write. Original file sizes are available without decoding. Files remain sequential: if a later file fails, earlier successful files remain saved and the failure names the failing file.

Attachment-bearing subtree copy reads originals and existing thumbnails, then performs one advisory check through an optional `beforeFileWrite` callback before `saveBatch`. F4 validation, journals, metadata callbacks, locking and compensation remain in place. Metadata-only moves, linked placements, structure copies, edits, selection, animation and rendering do not request estimates. Preview textures and object URLs are temporary resources, not added durable storage.

Backup reads saved records and builds a downloadable Blob; it does not save a second durable copy. No capacity check is added. Restore journals metadata, then clears/replaces attachments and commits its marker in one IndexedDB transaction with rollback. Browser transaction space/reclamation cannot be predicted reliably from backup size and current headroom. Restore therefore retains F3/F4/F5 handling without a new estimate or altered semantics. F6 ownership and download grace periods are unchanged.

## API and policy

`storage-capacity.js` is the only estimation service. It calls `navigator.storage.estimate()` with the native receiver. The [Storage Standard](https://storage.spec.whatwg.org/#dom-storagemanager-estimate) defines implementation-dependent estimates, not reservations or guarantees. Values stay local; no telemetry or permission requests are added, and `persist()` is never called.

Centralized policy constants:

| Policy | Value |
| --- | --- |
| General warning | Usage / quota >= 90% **and** available <= 100 MiB |
| Operation warning | Estimated operation budget > available; utilization need not be high |
| Operation budget | 1.25 × incoming bytes + 256 KiB per file + 1 MiB per batch |
| Copies | Include both existing original and thumbnail sizes in incoming bytes |
| Estimate deadline | 1 second; missing/late/failed result lets the write proceed |
| Repeat warning | After five minutes, half the prior remaining headroom, or an operation with twice the prior budget |

The product accepts ordinary files/photos up to 10 MiB and videos up to 100 MiB. A 100 MiB absolute threshold is relevant to those sizes while avoiding warnings for multi-gigabyte headroom. The 25% margin plus per-file/batch allowances accounts approximately for browser rounding, IndexedDB and metadata/journal overhead, and unknown derivatives (768-pixel image thumbnails and 240-pixel video posters). It is a heuristic, not an upper bound on thumbnail encoding or transaction requirements. No media is generated solely to predict storage.

Unsupported API, thrown/rejected estimates, missing/null/nonfinite/negative values, zero quota, values beyond safe arithmetic, or usage above quota give an unknown estimate. They produce no advisory. Batch totals and multiplied budgets also validate finite safe arithmetic; an unknown operation size does not predict failure. An independently valid low-capacity estimate can still produce a general advisory.

Estimates are fresh for each meaningful upload/copy batch; there is no cache, startup scan, notification history or metadata-save check. A dismissed warning stays suppressed under the repeat policy. A later healthy/unknown result hides the prior advisory and resets deduplication. Only one compact, polite status notice exists; it has Dismiss and never rejects the files or requires confirmation. Saving continues automatically. Existing file errors and storage-failure reports hide/invalidate the advisory so F2 remains authoritative. No deletion, cleanup, orphan sweep or corruption-state changes occur.

New requests invalidate older pending results. Picker opening, selection changes and Contents teardown invalidate pending notices while preserving the original captured upload destination. Already displayed capacity advice remains relevant across selection (including the selection change at successful Paste). Pending results never warn on a newer operation or hidden flow. A timed-out result is ignored.

## Safe manual check

Use a disposable test Galaxy or browser profile. No actual storage filling is needed. Load the updated app, open DevTools Console, and install this reversible mock once per page load:

```js
(() => {
  if (window.f7Mock) throw new Error('F7 mock already installed');
  const storage = navigator.storage;
  if (!storage) throw new Error('Use a current browser on localhost or HTTPS');
  const descriptor = Object.getOwnPropertyDescriptor(storage, 'estimate');
  const originalAdd = IDBObjectStore.prototype.add;
  const mock = window.f7Mock = {
    usage: 100 * 1024 ** 2,
    quota: 10 * 1024 ** 3,
    failNextFile: false,
    restore() {
      if (descriptor) Object.defineProperty(storage, 'estimate', descriptor);
      else delete storage.estimate;
      IDBObjectStore.prototype.add = originalAdd;
      delete window.f7Mock;
    }
  };
  Object.defineProperty(storage, 'estimate', {
    configurable: true,
    value: async () => ({usage: mock.usage, quota: mock.quota})
  });
  IDBObjectStore.prototype.add = function(record, ...args) {
    if (this.name === 'files' && mock.failNextFile) {
      mock.failNextFile = false;
      throw new DOMException('Synthetic F2 check', 'QuotaExceededError');
    }
    return originalAdd.call(this, record, ...args);
  };
})();
```

1. **Healthy:** add a small ordinary attachment. It saves with no capacity warning.
2. **Low:** run the following, then add another small attachment. A calm warning appears, saving is still attempted and normally succeeds under the real healthy storage underneath. Existing content stays intact. Dismiss hides the warning; another similar upload stays quiet under the repeat policy.

   ```js
   f7Mock.usage = 950 * 1024 ** 2;
   f7Mock.quota = 1000 * 1024 ** 2;
   ```

3. **Operation/batch:** first return to healthy values and add a tiny file to reset warning deduplication. Then run `f7Mock.usage = 0; f7Mock.quota = 4 * 1024 ** 2;` and select two ordinary files around 1.4 MB each. Their combined margin triggers one selected-files warning; both can still save. These values only mock quota reporting.
4. **F2 authoritative:** return to healthy values and set the one-shot rejection below. Add a disposable small file. The actual IndexedDB add throws; F2 reports insufficient storage, with no phantom attachment or competing F7 banner. Earlier successful files remain saved. The injection automatically disarms after that one file add.

   ```js
   f7Mock.usage = 100 * 1024 ** 2;
   f7Mock.quota = 10 * 1024 ** 3;
   f7Mock.failNextFile = true;
   ```

5. **Uninstall**, including the file-write injection, with this exact command (a page reload also removes the mock):

   ```js
   f7Mock.restore();
   ```

The mock never fills storage, modifies existing attachment bytes or sends anything externally. Files successfully added during testing are ordinary saved attachments and remain until removed through the normal UI. Avoid other concurrent file operations during the one-shot F2 check.

## Automated coverage and limitations

`node --test tests/storage-capacity.test.js` exercises policy, arithmetic, unavailable/failed/hung estimates, deduplication, races, copy sizes, and batch ordering. `python -B tests/browser-check.py --storage-capacity-only` uses a disposable profile for real uploads, copy, mobile picker routing, partial batches and actual IndexedDB quota rejection/compensation. Other attachment, mobile, F2/F4 and F6 suites cover the shared paths.

Browser-reported origin space need not match physical device free space or localStorage's separate limit. Another tab can consume space after estimation; small writes can still fail after a healthy estimate. Browsers may pad or round values and may not expose useful estimates in every context. Awareness happens at subsequent attachment growth, not continuously while idle. Advisory warnings cannot predict Restore's transactional peak usage or memory pressure. F2 remains the runtime safety net.
