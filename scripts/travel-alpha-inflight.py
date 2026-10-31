"""Manual, explicitly authorized ONE-rename acceptance controller for local Alpha.

Native response interception only; no SQL, response fabrication, Auth extraction,
app monkeypatches, retries, profile deletion, or source/artifact modification.
The CLI cannot select synthetic services; that seam is private to local tests.
"""
import argparse
import copy
import importlib.util
import json
import re
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('alpha_native_transport', ROOT/'scripts/cloud-inflight-harness.py')
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
require, Unverified = native.require, native.Unverified
PROBE = (ROOT/'scripts/travel-alpha-inflight-probe.js').read_text(encoding='utf-8')
ROLES = ('cosmifold-alpha-interrupt-writer', 'cosmifold-alpha-interrupt-observer')


def validate_options(options, synthetic=False):
    options = dict(options)
    options['origin'] = native.validate_origin(options['origin'])
    project = urlsplit(options['project'])
    require(not project.username and not project.password and not project.query and not project.fragment and
            project.path in ('','/'), 'EXACT_PROJECT_ORIGIN_REQUIRED')
    if synthetic:
        require(options['project'] == 'https://alpha-fixture.invalid', 'SYNTHETIC_PROJECT_REQUIRED')
    else:
        require(project.scheme == 'https' and re.fullmatch(r'[a-z0-9-]+\.supabase\.co', project.hostname or '') and
                project.port is None, 'SUPABASE_PROJECT_REQUIRED')
    options['project'] = options['project'].rstrip('/')
    for field in ('owner','universe'):
        require(str(uuid.UUID(options[field])) == options[field], 'CANONICAL_SCOPE_UUID_REQUIRED')
    require(isinstance(options['entry'],str) and 0 < len(options['entry']) <= 150 and
            options['entry'].strip() == options['entry'], 'EXACT_ENTRY_REQUIRED')
    require(isinstance(options['name'],str) and 0 < len(options['name']) <= 60 and
            options['name'].strip() == options['name'], 'EXACT_NEW_NAME_REQUIRED')
    require(bool(re.fullmatch(r'0|[1-9][0-9]{0,18}', options['revision'])) and
            int(options['revision']) < 9223372036854775807, 'VALID_BASE_REVISION_REQUIRED')
    return options


class AlphaCDP(native.SafeCDP):
    """Retain only scoped RPC request identifiers/bodies; discard all Auth material."""
    def __init__(self, url):
        super().__init__(url)
        self.rpc_prefix = None
        self.commits = []
        self.read_count = 0

    def event(self, message):
        super().event(message)
        if message.get('method') == 'Network.requestWillBeSent':
            request = message['params'].get('request', {})
            if self.rpc_prefix and request.get('url') == self.rpc_prefix+'cosmifold_commit_metadata' and request.get('method') == 'POST':
                self.commits.append(message['params']['requestId'])
            if self.rpc_prefix and request.get('url') == self.rpc_prefix+'cosmifold_read_universe' and request.get('method') == 'POST':
                self.read_count += 1


def evaluate(client, expression):
    client.deadline = time.monotonic()+20
    return client.evaluate(expression)


def probe(client, options, action='state', operation=None):
    return evaluate(client, '('+PROBE+')('+json.dumps(options)+','+json.dumps(action)+','+json.dumps(operation)+')')


def validate_base(state, options, metadata):
    require(state['writeStatus'] == 'saved' and not state['readOnly'] and not state['writing'] and
            state['cache']['pending'] is None and state['cache']['acknowledged']['revision'] == options['revision'] and
            metadata == state['metadata'] and metadata['universe']['revision'] == options['revision'], 'EXACT_SERVER_BASE_REQUIRED')
    rows = [row for row in metadata['entries'] if row['id'] == options['entry']]
    require(len(rows) == 1 and rows[0]['name'] != options['name'], 'NEW_RENAME_REQUIRED')


def validate_command(body, state, options, baseline):
    require(isinstance(body,dict) and set(body) == {'p_command'}, 'EXACT_COMMIT_BODY_REQUIRED')
    command = body['p_command']
    require(isinstance(command,dict) and set(command) == {'scope','operationId','baseRevision','type','payload'} and
            command['scope'] == {'ownerUserId':options['owner'],'universeId':options['universe']} and
            command['baseRevision'] == options['revision'] and command['type'] == 'items.renamed', 'EXACT_RENAME_COMMAND_REQUIRED')
    require(str(uuid.UUID(command['operationId'])) == command['operationId'], 'ORIGINAL_OPERATION_UUID_REQUIRED')
    require(state['cache']['pending']['command'] == command and state['writeStatus'] == 'saving' and
            state['metadata'] == baseline and state['cache']['acknowledged']['revision'] == options['revision'], 'ORIGINAL_JOURNAL_REQUIRED')
    expected = copy.deepcopy(baseline)
    old = next(row for row in baseline['entries'] if row['id'] == options['entry'])
    require(set(command['payload']) == {'upsert'} and set(command['payload']['upsert']) == {'entries'} and
            len(command['payload']['upsert']['entries']) == 1, 'ONLY_ONE_ENTRY_RENAME_REQUIRED')
    new = command['payload']['upsert']['entries'][0]
    allowed = copy.deepcopy(old)
    allowed['name'] = options['name']
    stamp = new.get('attributes_json',{}).get('updatedAt')
    require(isinstance(stamp,str) and bool(re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z',stamp)), 'RENAME_TIMESTAMP_REQUIRED')
    allowed['attributes_json']['updatedAt'] = stamp
    require(new == allowed, 'UNRELATED_ENTRY_CHANGE_REJECTED')
    expected['entries'][expected['entries'].index(old)] = new
    require(state['intended'] == expected, 'EXACT_INTENDED_RENAME_REQUIRED')
    expected['universe']['revision'] = str(int(options['revision'])+1)
    return command, expected


def validate_receipt(audit, command, expected, digest=None):
    receipt = audit.get('receipt')
    require(isinstance(receipt,dict) and receipt.get('status') == 'found', 'ORIGINAL_RECEIPT_NOT_FOUND')
    ack = {'scope':command['scope'],'operationId':command['operationId'],'baseRevision':command['baseRevision'],
           'revision':expected['universe']['revision'],'status':'committed','replayed':True,'result':None}
    require(set(receipt) == {'status','request_digest','acknowledgement'} and receipt['acknowledgement'] == ack and
            isinstance(receipt['request_digest'],str) and bool(re.fullmatch('[a-f0-9]{64}',receipt['request_digest'])) and
            (digest is None or digest == receipt['request_digest']) and audit['metadata'] == expected,
            'ORIGINAL_RECEIPT_OR_STATE_CHANGED')
    return receipt['request_digest']


class Controller:
    def __init__(self, writer, observer, options, report=print, *, _test_rpc_origin=None):
        self.writer, self.observer, self.options, self.report = writer, observer, options, report
        require(writer.target_id != observer.target_id, 'INDEPENDENT_OBSERVER_REQUIRED')
        if _test_rpc_origin is not None:
            require(options['project'] == 'https://alpha-fixture.invalid' and
                    native.validate_origin(_test_rpc_origin) == options['origin'], 'LOOPBACK_TEST_SEAM_ONLY')
        self.prefix = (_test_rpc_origin or options['project'])+'/rest/v1/rpc/'
        self.command = self.expected = self.baseline = self.paused_response = None
        self.request_allowed = self.response_count = self.receipts_blocked = self.receipts_allowed = 0
        self.release_receipts = False
        self.armed = False
        self.finished = False
        self.started = False
        self.operator_timeout = 120
        for client in (writer,observer):
            client.rpc_prefix = self.prefix

    def pump(self):
        for client in (self.writer,self.observer):
            evaluate(client,'0')
            while client.pauses:
                item = client.pauses.pop(0)
                try:
                    self.handle(client,item)
                except Exception:
                    # A rejected request must never be released by detach.
                    try:
                        client.call('Fetch.failRequest',requestId=item['requestId'],errorReason='InternetDisconnected')
                    except Exception:
                        pass
                    raise
        require(len(self.writer.commits) <= 1 and not self.observer.commits, 'DUPLICATE_OR_OBSERVER_COMMIT')

    def handle(self, client, item):
        # OPTIONS never carries an application command. No response body is read.
        if item['method'] == 'OPTIONS':
            client.call('Fetch.continueRequest',requestId=item['requestId'])
            return
        name = item['url'].removeprefix(self.prefix)
        require(item['url'] == self.prefix+name and name in ('cosmifold_commit_metadata','cosmifold_operation_receipt',
                'cosmifold_read_universe','cosmifold_list_universes'), 'UNAPPROVED_RPC_BLOCKED')
        require(item['method'] == 'POST', 'POST_RPC_REQUIRED')
        body = json.loads(item['postData'])
        if item['status'] is not None:
            require(client is self.writer and name == 'cosmifold_commit_metadata' and item['status'] == 200 and
                    self.request_allowed == 1 and self.response_count == 0 and body == {'p_command':self.command} and
                    item['networkId'] in self.writer.commits, 'EXACT_ONE_SUCCESS_RESPONSE_REQUIRED')
            self.response_count += 1
            self.paused_response = item
            return
        if name == 'cosmifold_commit_metadata':
            require(client is self.writer and self.started and self.request_allowed == 0, 'SECOND_OR_UNAUTHORIZED_COMMIT_BLOCKED')
            state = probe(self.writer,self.options)
            self.command,self.expected = validate_command(body,state,self.options,self.baseline)
            self.request_allowed += 1
        elif name == 'cosmifold_operation_receipt':
            require(self.command and body == {'p_scope':self.command['scope'],'p_operation_id':self.command['operationId']},
                    'WRONG_RECEIPT_OPERATION_BLOCKED')
            if client is self.writer and not self.release_receipts:
                self.receipts_blocked += 1
                client.call('Fetch.failRequest',requestId=item['requestId'],errorReason='InternetDisconnected')
                return
            if client is self.writer:
                self.receipts_allowed += 1
        elif name == 'cosmifold_read_universe':
            require(body == {'p_scope':{'ownerUserId':self.options['owner'],'universeId':self.options['universe']}}, 'WRONG_READ_SCOPE_BLOCKED')
        else:
            require(body == {}, 'EXACT_LIST_REQUIRED')
        client.call('Fetch.continueRequest',requestId=item['requestId'])

    def wait(self, condition, seconds=20):
        deadline = time.monotonic()+seconds
        while True:
            self.pump()
            value = condition()
            if value:
                return value
            require(time.monotonic() < deadline, 'BOUNDED_PHASE_TIMEOUT')
            time.sleep(.03)

    def unresolved(self):
        state = probe(self.writer,self.options)
        require(state['metadata'] == self.baseline and state['cache']['pending'] and
                state['cache']['pending']['command'] == self.command and
                state['cache']['acknowledged']['revision'] == self.options['revision'] and
                state['writeStatus'] in ('saving','unresolved'), 'PENDING_ID_BASE_OR_UI_CHANGED')
        if state['writeStatus'] == 'unresolved':
            require(state['readOnly'] and state['blocked'] and state['formBlocked'] and not state['writing'] and
                    state['uiStatus'].startswith('Unresolved') and self.receipts_blocked > 0, 'UNRESOLVED_EDIT_BLOCK_REQUIRED')
            return state

    def audit(self, operation):
        # Pump request-stage guards while the independent read RPCs run. A
        # transient result slot contains only domain proof, never Auth/session.
        slot = '__cosmifoldAlphaInflightAudit'
        expression = ("(()=>{if(Object.hasOwn(globalThis,"+json.dumps(slot)+"))throw Error('AUDIT_BUSY');const record={done:false};globalThis["+json.dumps(slot)+
            "]=record;("+PROBE+")("+json.dumps(self.options)+",'audit',"+json.dumps(operation)+
            ").then(value=>{record.value=value;record.done=true},()=>{record.error=true;record.done=true});return true})()")
        evaluate(self.observer,expression)
        try:
            self.wait(lambda:evaluate(self.observer,'globalThis.'+slot+'.done'),8)
            result = evaluate(self.observer,'globalThis.'+slot)
            require(not result.get('error'), 'INDEPENDENT_AUDIT_FAILED')
            return result['value']
        finally:
            evaluate(self.observer,'delete globalThis.'+slot)

    def run(self, restore_requested):
        try:
            for client in (self.writer,self.observer):
                client.call('Network.enable')
                require(probe(client,self.options,'identity')['owner'] == self.options['owner'], 'REAL_OWNER_REQUIRED')
            require(probe(self.observer,self.options,'identity')['preview'], 'OBSERVER_MUST_NOT_OPEN_DATASET')
            state = probe(self.writer,self.options)
            audit = probe(self.observer,self.options,'audit')
            validate_base(state,self.options,audit['metadata'])
            self.baseline = state['metadata']
            self.writer.call('Fetch.enable',patterns=[{'urlPattern':self.prefix+'*','requestStage':'Request'},
                {'urlPattern':self.prefix+'cosmifold_commit_metadata','requestStage':'Response'}])
            self.armed = True
            self.observer.call('Fetch.enable',patterns=[{'urlPattern':self.prefix+'*','requestStage':'Request'}])
            self.started = True
            dispatch_at = time.monotonic()
            self.report('ARMED: submitting the explicitly authorized UI rename ONCE.')
            probe(self.writer,self.options,'submit')
            self.wait(lambda:self.paused_response is not None,12)
            state = probe(self.writer,self.options)
            require(state['cache']['pending']['command'] == self.command and state['metadata'] == self.baseline and
                    state['writeStatus'] == 'saving', 'ACKNOWLEDGED_BEFORE_INDEPENDENT_PROOF')
            digest = validate_receipt(self.audit(self.command['operationId']),self.command,self.expected)
            require(time.monotonic()-dispatch_at < 12 and probe(self.writer,self.options)['writeStatus'] == 'saving',
                    'PROOF_BEFORE_ALPHA_TIMEOUT_REQUIRED')
            self.report('PROVED: independent original receipt and exact server state visible before response loss.')
            paused = self.paused_response
            self.writer.call('Fetch.failRequest',requestId=paused['requestId'],errorReason='InternetDisconnected')
            self.paused_response = None
            self.wait(self.unresolved)
            require(any(f['requestId'] == paused['networkId'] and f['errorText'] == 'net::ERR_INTERNET_DISCONNECTED'
                        for f in self.writer.failures), 'NATIVE_ORIGINAL_RESPONSE_FAILURE_REQUIRED')
            self.report('UNRESOLVED VERIFIED: original ID/base retained, editing blocked, no false Saved. Review writer UI.')
            self.report(json.dumps({'universeId':self.options['universe'],'operationId':self.command['operationId'],
                                   'baseRevision':self.options['revision'],'committedRevision':self.expected['universe']['revision']}))
            self.report('Press Enter here to restore receipts; then Cancel the dialog and click Reload from server ONCE in WRITER.')
            self.wait(lambda:restore_requested() and self.unresolved(),self.operator_timeout)
            self.release_receipts = True
            self.report('RESTORED: normal receipt responses allowed. Use the explicit Alpha Reload from server button now.')
            def recovered():
                current = probe(self.writer,self.options)
                if current['cache']['pending']:
                    require(current['cache']['pending']['command'] == self.command, 'ORIGINAL_PENDING_CHANGED')
                    return False
                require(self.receipts_allowed > 0 and current['metadata'] == self.expected and
                        current['cache']['acknowledged']['revision'] == self.expected['universe']['revision'] and
                        current['writeStatus'] == 'saved' and not current['readOnly'] and not current['writing'], 'EXACT_RECEIPT_RECOVERY_REQUIRED')
                return True
            # Explicit reload temporarily clears the selected dataset: observe only
            # after it has reopened, without treating that normal transition as failure.
            self.wait(lambda:self.writer_ready() and recovered(),self.operator_timeout)
            validate_receipt(self.audit(self.command['operationId']),self.command,self.expected,digest)
            before = self.writer_reads()
            self.report('RECOVERED: same original receipt, exact intended state, one revision increment. Click Reload from server ONCE more.')
            self.wait(lambda:self.writer_reads() > before and self.writer_ready() and recovered(),self.operator_timeout)
            validate_receipt(self.audit(self.command['operationId']),self.command,self.expected,digest)
            self.pump()
            require(len(self.writer.commits) == self.request_allowed == self.response_count == 1 and not self.observer.commits,
                    'EXACTLY_ONE_COMMIT_REQUIRED')
            self.finished = True
            self.report('PASS: native post-commit response loss; original receipt recovered; two explicit reloads; ONE commit and ONE revision increment.')
            return {'operationId':self.command['operationId'],'revision':self.expected['universe']['revision'],'commits':1}
        finally:
            self.close()

    def writer_ready(self):
        return evaluate(self.writer,'travelAlpha.getState().dataset.scope?.universeId === '+json.dumps(self.options['universe']))

    def writer_reads(self):
        return getattr(self.writer,'read_count',0)

    def close(self):
        if not self.armed:
            return
        # On a stopped run, do not accidentally release a paused success or let
        # automatic receipt recovery hide the uncertainty. Transport-only restore
        # is a separate explicit command; pending storage is never changed here.
        if not self.finished:
            try:
                self.writer.deadline = time.monotonic()+5
                self.writer.call('Network.emulateNetworkConditions',offline=True,latency=0,downloadThroughput=-1,uploadThroughput=-1)
            except Exception:
                pass
        for client in (self.writer,self.observer):
            for item in ([self.paused_response] if client is self.writer and self.paused_response else [])+client.pauses:
                try:
                    client.call('Fetch.failRequest',requestId=item['requestId'],errorReason='InternetDisconnected')
                except Exception:
                    pass
            try:
                client.call('Fetch.disable')
            except Exception:
                pass


def find_targets(port, origin):
    found = {}
    try:
        for page in native.discover_pages(port):
            if page.get('type') != 'page' or page.get('url') not in (origin+'/',origin+'/index.html'):
                continue
            client = AlphaCDP(page['webSocketDebuggerUrl'])
            role = evaluate(client,'window.name')
            if role in ROLES:
                require(role not in found, 'DUPLICATE_ALPHA_TAB_ROLE')
                found[role] = client
            else:
                client.sock.close()
        require(set(found) == set(ROLES), 'TWO_LABELLED_ALPHA_TABS_REQUIRED')
        return tuple(found[role] for role in ROLES)
    except Exception:
        for client in found.values():
            client.sock.close()
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for field in ('origin','project','owner','universe','entry','revision','name'):
        parser.add_argument('--'+field,required=True)
    parser.add_argument('--debug-port',type=int,default=9222)
    parser.add_argument('--authorize-one-rename',action='store_true',help='Explicitly authorize ONE normal UI rename in this disposable Universe')
    parser.add_argument('--restore-transport-only',action='store_true',help='After review: restore writer network only; no save/reload/storage change')
    args = parser.parse_args()
    clients = ()
    try:
        require(args.authorize_one_rename != args.restore_transport_only, 'EXPLICIT_SINGLE_ACTION_AUTHORIZATION_REQUIRED')
        options = validate_options({field:getattr(args,field) for field in ('origin','project','owner','universe','entry','revision','name')})
        clients = find_targets(args.debug_port,options['origin'])
        if args.restore_transport_only:
            require(probe(clients[1],options,'identity')['owner'] == options['owner'], 'OWNER_REVIEW_REQUIRED')
            clients[0].call('Network.emulateNetworkConditions',offline=False,latency=0,downloadThroughput=-1,uploadThroughput=-1)
            clients[0].call('Fetch.disable')
            print('TRANSPORT RESTORED ONLY: no save, reload, or pending-state change.')
        else:
            ready = threading.Event()
            def operator_input():
                try:
                    input()
                    ready.set()
                except EOFError:
                    pass
            # Start input only at the Unresolved checkpoint, not before dispatch.
            started = False
            def restore_requested():
                nonlocal started
                if not started:
                    threading.Thread(target=operator_input,daemon=True).start()
                    started = True
                return ready.is_set()
            Controller(*clients,options).run(restore_requested)
        return 0
    except Exception as error:
        code = error.code if isinstance(error,Unverified) and re.fullmatch('[A-Z_]{1,90}',error.code) else 'ALPHA_INTERRUPTION_UNVERIFIED'
        print('STOPPED: '+code+'. Preserve original pending operation; no retry or cleanup. Writer may remain offline; review before transport-only restore.')
        return 2
    finally:
        for client in clients:
            client.sock.close()


if __name__ == '__main__':
    raise SystemExit(main())
