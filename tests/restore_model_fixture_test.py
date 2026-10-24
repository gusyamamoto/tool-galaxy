"""Independent binary/ancestry assertions for the manual invalid-backup helper."""
import copy
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest

from restore_model_fixture import nested_task_list

HELPER = Path(__file__).with_name('restore_model_fixture.py')


def fixture(with_task=True, collision=False):
    entries = [{'id': 'root', 'name': 'Normal', 'parentId': None},
               {'id': 'list', 'name': 'Tasks', 'parentId': 'root', 'taskList': True}]
    if with_task:
        entries.append({'id': 'task', 'name': 'Existing task', 'parentId': 'list', 'completed': True})
    if collision:
        entries.append({'id': 'invalid-nested-task-list', 'name': 'Keep this Item', 'parentId': None})
    metadata = {'version': 5, 'entries': entries, 'layout': []}
    manifest = {'format': 'cosmifold-backup', 'backupVersion': 1, 'storageVersion': 5,
                'metadata': metadata, 'metadataText': json.dumps(metadata), 'counts': {'entries': len(entries)}}
    raw = json.dumps(manifest).encode('utf-8')
    # Opaque payload sentinel: this test checks byte preservation, independently
    # of the browser suite's full valid attachment-manifest fixture.
    return b'COSMIFOLD-BACKUP\n' + struct.pack('<II', 1, len(raw)) + hashlib.sha256(raw).digest() + raw + b'\x00original\xffthumbnail\x80'


def decode(data):
    # Do not use the helper's parser, mutation or application model to establish
    # invalidity. Read the documented offsets and raw parent/flag fields here.
    assert data[:17] == b'COSMIFOLD-BACKUP\n'
    assert struct.unpack_from('<I', data, 17)[0] == 1
    length = struct.unpack_from('<I', data, 21)[0]
    raw = data[57:57+length]
    assert hashlib.sha256(raw).digest() == data[25:57]
    manifest = json.loads(raw)
    assert json.loads(manifest['metadataText']) == manifest['metadata']
    return manifest, data[57+length:]


class RestoreModelFixtureTests(unittest.TestCase):
    def assert_nested_raw(self, manifest):
        entries = manifest['metadata']['entries']
        by_id = {entry['id']: entry for entry in entries}
        nested = [entry for entry in entries if entry.get('taskList') is True
                  and by_id.get(entry.get('parentId'), {}).get('taskList') is True]
        self.assertEqual(len(nested), 1, 'Helper must create a Task List whose direct parent is a Task List')
        self.assertEqual(len(by_id), len(entries), 'Helper must not introduce duplicate IDs instead')
        self.assertEqual(manifest['counts']['entries'], len(entries))
        return nested[0]

    def test_existing_task_changes_only_its_explicit_task_list_flag(self):
        source = fixture()
        before, payload = decode(source)
        expected = copy.deepcopy(before['metadata'])
        expected['entries'][2]['taskList'] = True
        changed, changed_payload = decode(nested_task_list(source))
        self.assertEqual(changed['metadata'], expected)
        self.assertEqual(self.assert_nested_raw(changed)['id'], 'task')
        self.assertEqual(changed_payload, payload)
        self.assertEqual(source, fixture(), 'Input bytes must remain unchanged')

    def test_empty_task_list_gets_one_new_nested_child_and_updated_count(self):
        source = fixture(with_task=False)
        before, payload = decode(source)
        changed, changed_payload = decode(nested_task_list(source))
        self.assertEqual(changed['metadata']['entries'][:2], before['metadata']['entries'])
        self.assertEqual(self.assert_nested_raw(changed)['parentId'], 'list')
        self.assertEqual(len(changed['metadata']['entries']), 3)
        self.assertEqual(changed_payload, payload)

    def test_generated_child_never_reuses_an_existing_item_id(self):
        changed, _ = decode(nested_task_list(fixture(with_task=False, collision=True)))
        self.assertEqual(self.assert_nested_raw(changed)['id'], 'invalid-nested-task-list-copy')

    def test_cli_writes_invalid_copy_without_overwriting_source_or_output(self):
        with tempfile.TemporaryDirectory(prefix='f5-fixture-test-') as directory:
            source, output = Path(directory)/'Backup A.cosmifold', Path(directory)/'Invalid C.cosmifold'
            original = fixture()
            source.write_bytes(original)
            result = subprocess.run([sys.executable, '-B', str(HELPER), str(source), str(output)], capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            generated = output.read_bytes()
            self.assert_nested_raw(decode(generated)[0])
            for target in [output, source]:
                result = subprocess.run([sys.executable, '-B', str(HELPER), str(source), str(target)], capture_output=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(source.read_bytes(), original)
                self.assertEqual(output.read_bytes(), generated)


if __name__ == '__main__':
    unittest.main()
