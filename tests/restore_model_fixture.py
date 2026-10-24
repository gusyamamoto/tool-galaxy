"""Make a valid-checksum, model-invalid copy of a disposable Cosmifold backup.

Usage: python -B tests/restore_model_fixture.py BackupA.cosmifold InvalidA.cosmifold
Never overwrites the input or an existing output. Original file payloads stay exact.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct

MAGIC = b'COSMIFOLD-BACKUP\n'
HEADER = len(MAGIC) + 8 + 32


def rewrite_manifest(data, mutate):
    assert data[:len(MAGIC)] == MAGIC, 'Not a Cosmifold backup'
    version, length = struct.unpack_from('<II', data, len(MAGIC))
    assert version == 1 and 0 < length <= len(data)-HEADER, 'Unsupported backup'
    raw = data[HEADER:HEADER+length]
    assert hashlib.sha256(raw).digest() == data[len(MAGIC)+8:HEADER], 'Damaged backup'
    manifest = json.loads(raw)
    mutate(manifest)
    raw = json.dumps(manifest, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return MAGIC + struct.pack('<II', version, len(raw)) + hashlib.sha256(raw).digest() + raw + data[HEADER+length:]


def nested_task_list(data):
    def mutate(manifest):
        assert manifest['backupVersion'] == 1 and manifest['storageVersion'] == 5, 'Unsupported schema'
        entries = manifest['metadata']['entries']
        task_list = next((e for e in entries if e.get('taskList') is True), None)
        assert task_list, 'Create a Task List before exporting the disposable backup'
        child = next((e for e in entries if e.get('parentId') == task_list['id']), None)
        if child is None:
            identifier = 'invalid-nested-task-list'
            identifiers = {e['id'] for e in entries}
            while identifier in identifiers:
                identifier += '-copy'
            child = {'id': identifier, 'name': 'Invalid nested Task List', 'parentId': task_list['id']}
            entries.append(child)
            manifest['counts']['entries'] += 1
        child['taskList'] = True
        manifest['metadataText'] = json.dumps(manifest['metadata'], ensure_ascii=False, separators=(',', ':'))
    return rewrite_manifest(data, mutate)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    result = nested_task_list(args.source.read_bytes())
    with args.output.open('xb') as output:
        output.write(result)
    print(f'Created {args.output}; original backup unchanged. This copy must fail Restore validation.')
