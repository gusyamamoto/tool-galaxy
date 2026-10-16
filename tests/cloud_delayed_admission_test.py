"""Pure SQL-generation/coordinator tests. No PostgreSQL, psql or network."""
import copy
from contextlib import ExitStack, redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

spec=importlib.util.spec_from_file_location('delayed_harness',Path(__file__).resolve().parents[1]/'scripts/cloud-delayed-admission-harness.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
SCOPE={'ownerUserId':'00000000-0000-4000-8000-000000000001','universeId':'00000000-0000-4000-8000-000000000002'}
OP='00000000-0000-4000-8000-000000000003';ORIGIN='http://127.0.0.1:5500'
META={'format':'cosmifold-cloud-metadata','projectionVersion':1,'storageVersion':5,
      'universe':{'id':SCOPE['universeId'],'owner_id':SCOPE['ownerUserId'],'revision':'0'},
      'snapshot_fields':dict.fromkeys(['connections','portals','constellations','archivedGalaxies'],True),
      'entries':[],'constellations':[],'constellation_members':[],'linked_placements':[]}
D={'origin':ORIGIN,'scope':SCOPE,'operationId':OP,'command':{'scope':SCOPE,'operationId':OP,'baseRevision':'0','type':'items.created','payload':{}},
   'commitURL':'https://example.invalid/rest/v1/rpc/cosmifold_commit_metadata','cacheKey':f"cosmifold:cloud-cache:v1:{SCOPE['ownerUserId']}:{SCOPE['universeId']}",
   'markerKey':'cosmifold:dev:cloud-recovery:v1','metadata0':META}
HOLDER={'pid':101,'xid':'1001'}
SAMPLE={'monitorPid':103,'readOnly':'on','holderActive':True,'exactServer':True,'originalReceiptCount':0,'requestDigest':'a'*64,
        'writers':[{'pid':102,'xid':None,'virtualXid':'6/3','queryStart':'2026-10-14T00:00:00Z','blockers':[101]}]}


class Client:
    def __init__(self,trace):
        self.target_id='writer';self.trace=trace;self.commits=[];self.finished=set();self.responses={};self.failures=[]
        self.cache=json.dumps({'acknowledged':{'revision':'0'},'pending':{'command':D['command']}})
        self.identity={'operationId':OP,'phase':'prepared'};self.busy=False

    def call(self,method,**params):
        self.trace.append(method)

    def evaluate(self,code):
        if code=='true':return True
        if code=="recoveryControls(); !document.getElementById('dispatch').disabled":return True
        if code=='recoveryDiagnostic.armDelayed()':self.trace.append('arm');return None
        if code.startswith('document.'):
            self.trace.append('dispatch');self.busy=True
            self.commits.append({'id':'request1','url':D['commitURL'],'postData':json.dumps({'p_command':D['command']})});return True
        if code.startswith('localStorage.getItem'):return self.cache
        if code.startswith('recoveryDiagnostic.detachDelayedWait('):
            self.trace.append('detach');proof=json.loads(code[len('recoveryDiagnostic.detachDelayedWait('):-1]);self.busy=False
            self.identity.update(phase='uncertain',delayedMissing=True,delayedAdmission=proof);return {'detached':True,'cacheRevision':'0'}
        if code=='recoveryBusy':return self.busy
        if code=='recoveryDiagnostic.identity()':return copy.deepcopy(self.identity)
        if code=='recoveryDiagnostic.checkBlocked()':self.trace.append('blocked')
        if code=='recoveryDiagnostic.reopenDelayed()':
            self.trace.append('recover');self.cache=json.dumps({'acknowledged':{'revision':'1'},'pending':None});return {'status':'loaded','revision':'1'}
        if code=='recoveryDiagnostic.verifyAgain()':self.trace.append('repeat')
        if code=='recoveryDiagnostic.dispose()':self.trace.append('dispose')


class Holder:
    identity=HOLDER
    def __init__(self,writer,trace):self.writer=writer;self.trace=trace
    def release(self):
        self.trace.append('release');self.writer.finished.add('request1');self.writer.responses['request1']=200
        return {'released':True}
    def close(self):self.trace.append('close')


class Monitor:
    pid=103
    def __init__(self,trace,patch=None):self.trace=trace;self.count=0;self.patch=patch
    def query(self,sql):
        self.trace.append('probe');self.count+=1;value=copy.deepcopy(SAMPLE)
        if self.count==2 and self.patch:value.update(self.patch)
        return value


class PrintSQLTests(unittest.TestCase):
    def isolated_main(self, extra=(), printer_error=None):
        """Fail on live entry points, even if main catches their exceptions."""
        boundaries=[(h.SQLSession,name) for name in ['query','release','close']]+[
            (h.native.SafeCDP,name) for name in ['__init__','call','evaluate']]+[
            (h,'SQLSession'),(h,'DelayedCDP'),(h,'descriptor'),(h,'coordinate'),(h,'original_request'),
            (h.native,'find_targets'),(h.subprocess,'Popen'),
            (h.native.urllib.request,'urlopen'),(h.native.socket,'create_connection'),
            (h.native.socket.socket,'connect'),(h.native.socket.socket,'connect_ex')]
        output=io.StringIO();original_cdp=h.native.SafeCDP
        with ExitStack() as stack:
            guards=[stack.enter_context(mock.patch.object(obj,name,side_effect=AssertionError('Live path: '+name)))
                    for obj,name in boundaries]
            stack.enter_context(mock.patch.object(sys,'argv',['harness','--origin',ORIGIN,'--debug-port','9222','--print-sql',*extra]))
            stack.enter_context(redirect_stdout(output))
            if printer_error:
                stack.enter_context(mock.patch.object(h,'print_sql_plan',side_effect=printer_error))
                with self.assertRaisesRegex(RuntimeError,'offline printer failed'):
                    h.main()
                result=None
            else:
                result=h.main()
            for guard in guards:guard.assert_not_called()
            self.assertIs(h.native.SafeCDP,original_cdp)  # No live CDP setup either.
        text=output.getvalue()
        for forbidden in ['STOPPED:','PASS:','PROVED:','DIAGNOSTIC:','DELAYED_ADMISSION_UNVERIFIED','Original may still commit']:
            self.assertNotIn(forbidden,text)
        return result,text

    def test_print_sql_succeeds_without_fixture_database_or_browser_and_is_repeatable(self):
        result,text=self.isolated_main()
        self.assertEqual(result,0)
        for expected in ['-- PRINT ONLY: offline SQL/operator plan','REVIEW TEMPLATES ONLY',
                         '-- Holder template','BEGIN;','SET LOCAL ROLE authenticated',
                         "idle_in_transaction_session_timeout='12s'",'public.cosmifold_read_universe',
                         'public.cosmifold_operation_receipt','-- Read-only monitor template',
                         'pg_blocking_pids','cosmifold_private.operation_receipts','sha256',
                         '<OWNER_USER_ID>','<UNIVERSE_ID>','<ORIGINAL_OPERATION_ID>',
                         '<EXACT_EMPTY_REVISION_0_METADATA_JSONB>','<EXACT_ORIGINAL_COMMAND_JSONB>',
                         'holder PID/XID 1 are examples','ONE original command']:
            self.assertIn(expected,text)
        self.assertEqual(self.isolated_main(),(result,text))

    def test_print_sql_ignores_live_connection_options(self):
        self.assertEqual(self.isolated_main(['--service','unused-service','--debug-port','1']),self.isolated_main())

    def test_print_failure_does_not_enter_live_error_handling_or_cleanup(self):
        result,text=self.isolated_main(printer_error=RuntimeError('offline printer failed'))
        self.assertIsNone(result);self.assertEqual(text,'')

    def test_documented_cli_exits_zero_with_network_and_database_processes_forbidden(self):
        # Execute the actual __main__/argparse/sys.exit path in a fresh Python
        # process. All network/process boundaries inside that child are denied.
        driver='''import contextlib, runpy, sys
from unittest import mock
sys.argv=sys.argv[1:]
with contextlib.ExitStack() as stack:
    guards=[stack.enter_context(mock.patch(target,side_effect=AssertionError(target))) for target in
            ['socket.create_connection','socket.socket.connect','socket.socket.connect_ex',
             'urllib.request.urlopen','subprocess.Popen']]
    try:
        runpy.run_path(sys.argv[0],run_name='__main__')
    finally:
        for guard in guards:guard.assert_not_called()
'''
        result=subprocess.run([sys.executable,'-B','-c',driver,str(h.ROOT/'scripts/cloud-delayed-admission-harness.py'),
                               '--origin',ORIGIN,'--debug-port','9222','--print-sql'],
                              capture_output=True,text=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stderr+result.stdout)
        self.assertEqual(result.stderr,'')
        self.assertEqual(result.stdout,self.isolated_main()[1])


class FailureDiagnosticsTests(unittest.TestCase):
    def test_both_loopbacks_refused_preserve_discovery_evidence_without_sql_cdp_or_dispatch(self):
        opener=mock.Mock()
        opener.open.side_effect=[h.native.urllib.error.URLError(ConnectionRefusedError('IPv4 refused')),
                                 h.native.urllib.error.URLError(ConnectionRefusedError('IPv6 refused'))]
        output=io.StringIO()
        with ExitStack() as stack:
            guards=[stack.enter_context(mock.patch(target,side_effect=AssertionError(target))) for target in
                    ['socket.create_connection','socket.socket.connect','socket.socket.connect_ex','subprocess.Popen']]
            stack.enter_context(mock.patch.object(h.native,'SafeCDP',h.native.SafeCDP))
            stack.enter_context(mock.patch.object(h.native.urllib.request,'build_opener',return_value=opener))
            sql=stack.enter_context(mock.patch.object(h,'SQLSession',side_effect=AssertionError('SQL forbidden')))
            cdp=stack.enter_context(mock.patch.object(h,'DelayedCDP',side_effect=AssertionError('CDP forbidden')))
            coordinate=stack.enter_context(mock.patch.object(h,'coordinate',side_effect=AssertionError('Dispatch forbidden')))
            stack.enter_context(mock.patch.object(sys,'argv',['harness','--origin',ORIGIN,'--run','--service','local-fake']))
            stack.enter_context(redirect_stdout(output))
            self.assertEqual(h.main(),2)
            for guard in guards:guard.assert_not_called()
            sql.assert_not_called();cdp.assert_not_called();coordinate.assert_not_called()
        self.assertEqual(opener.open.call_args_list,[mock.call('http://127.0.0.1:9222/json',timeout=5),
                                                   mock.call('http://[::1]:9222/json',timeout=5)])
        text=output.getvalue()
        self.assertIn('STOPPED: DELAYED_ADMISSION_UNVERIFIED',text);self.assertNotIn('PASS:',text)
        d=json.loads(next(line.removeprefix('DIAGNOSTIC: ') for line in text.splitlines() if line.startswith('DIAGNOSTIC: ')))
        self.assertEqual(d['evidence']['checkpoint'],'BROWSER_DISCOVERY')
        self.assertFalse(d['evidence']['dispatchAttempted']);self.assertFalse(d['evidence']['holderSetupCompleted'])
        self.assertEqual(d['errors'][0]['type'],'URLError')
        self.assertGreaterEqual(len(d['errors']),2)  # Retain both failed attempts.

    def run_main(self,discovery_error=None,probe_error=None,close_error=None,bad_sample=False):
        trace=[];writer=Client(trace);observer=Client(trace);observer.target_id='observer'
        writer.sock=mock.Mock();observer.sock=mock.Mock()
        evaluate=writer.evaluate
        writer.evaluate=lambda code:copy.deepcopy(D) if code=='recoveryDiagnostic.delayedDescriptor()' else evaluate(code)
        holder=Holder(writer,trace);holder.query=mock.Mock(return_value=copy.deepcopy(HOLDER))
        if close_error:holder.close=mock.Mock(side_effect=close_error)
        monitor=Monitor(trace);monitor.close=mock.Mock()
        sample={**SAMPLE,'originalReceiptCount':1} if bad_sample else SAMPLE
        monitor.query=mock.Mock(side_effect=[{'pid':103,'version':180006,'readOnly':'on'},probe_error or copy.deepcopy(sample)])
        output=io.StringIO()
        with ExitStack() as stack:
            # No network/process creation is allowed in these local fake runs.
            guards=[stack.enter_context(mock.patch(target,side_effect=AssertionError(target))) for target in
                    ['socket.create_connection','socket.socket.connect','socket.socket.connect_ex','urllib.request.urlopen','subprocess.Popen']]
            stack.enter_context(mock.patch.object(h.native,'SafeCDP',h.native.SafeCDP))
            find=stack.enter_context(mock.patch.object(h.native,'find_targets',return_value=(writer,observer),side_effect=discovery_error))
            sessions=stack.enter_context(mock.patch.object(h,'SQLSession',side_effect=[monitor,holder]))
            stack.enter_context(mock.patch.object(sys,'argv',['harness','--origin',ORIGIN,'--run','--service','local-fake']))
            stack.enter_context(redirect_stdout(output))
            self.assertEqual(h.main(),2)
            for guard in guards:guard.assert_not_called()
        text=output.getvalue()
        self.assertNotIn('PRIVATE',text);self.assertNotIn('PASS:',text);self.assertNotIn('PROVED:',text)
        diagnostic=json.loads(next(line.removeprefix('DIAGNOSTIC: ') for line in text.splitlines() if line.startswith('DIAGNOSTIC: ')))
        return diagnostic,trace,sessions,monitor,writer,observer

    def test_preflight_generic_error_reports_no_dispatch_or_holder_setup(self):
        d,trace,sessions,monitor,writer,observer=self.run_main(discovery_error=OSError('PRIVATE endpoint/token'))
        self.assertEqual(d['evidence']['checkpoint'],'BROWSER_DISCOVERY')
        self.assertFalse(d['evidence']['dispatchAttempted']);self.assertFalse(d['evidence']['holderSetupCompleted'])
        self.assertEqual(d['errors'][0]['type'],'OSError');self.assertIn('location',d['errors'][0])
        self.assertEqual(trace,[]);sessions.assert_not_called()

    def test_generic_post_dispatch_error_retains_identities_http_evidence_and_cleanup(self):
        d,trace,sessions,monitor,writer,observer=self.run_main(probe_error=TypeError('PRIVATE malformed SQL/JSON'))
        e=d['evidence']
        self.assertEqual(e['checkpoint'],'ADMISSION_PROBE');self.assertTrue(e['dispatchAttempted'])
        self.assertTrue(e['holderSetupCompleted']);self.assertEqual(e['holderPid'],HOLDER['pid'])
        self.assertEqual(e['holderXid'],HOLDER['xid']);self.assertEqual(e['monitorPid'],103)
        self.assertEqual(e['scope'],SCOPE);self.assertEqual(e['operationId'],OP)
        self.assertEqual(e['observedHTTPCommitCount'],1);self.assertEqual(e['observedHTTPFinishedCount'],0)
        self.assertTrue(e['writerDisposeCompleted']);self.assertEqual(e['sqlCloseCompleted'],['holder','monitor'])
        self.assertEqual(d['errors'][0]['type'],'TypeError');self.assertEqual(trace.count('dispatch'),1)
        self.assertNotIn('recover',trace);self.assertNotIn('release',trace)
        monitor.close.assert_called_once();writer.sock.close.assert_called_once();observer.sock.close.assert_called_once()

    def test_cleanup_error_does_not_erase_original_proof_failure_or_skip_monitor_close(self):
        d,trace,sessions,monitor,writer,observer=self.run_main(close_error=RuntimeError('PRIVATE cleanup SQL'),bad_sample=True)
        e=d['evidence']
        self.assertEqual(e['primaryFailure'][0]['code'],'HOLDER_OR_FIXTURE_CHANGED')
        self.assertEqual(d['errors'][0]['type'],'RuntimeError')
        self.assertIn('HOLDER_OR_FIXTURE_CHANGED',[error['code'] for error in d['errors']])
        self.assertEqual(e['cleanupErrors'][0]['resource'],'holder')
        self.assertEqual(e['lastSQLObservation']['originalReceiptCount'],1)
        monitor.close.assert_called_once();writer.sock.close.assert_called_once();observer.sock.close.assert_called_once()

    def test_monitor_evidence_omits_untrusted_text_and_wrong_types(self):
        e={}
        h.retain_observation(e,{**SAMPLE,'monitorPid':'PRIVATE','requestDigest':'PRIVATE',
                                'holderActive':'PRIVATE','sql':'PRIVATE','writers':[{'query':'PRIVATE'}]})
        self.assertEqual(e,{'lastSQLObservation':{'originalReceiptCount':0,'exactServer':True,'readOnly':'on','writerCount':1}})
        self.assertNotIn('PRIVATE',json.dumps(e))


class BoundaryDiagnosticsTests(unittest.TestCase):
    def test_sql_success_keeps_the_same_result_and_adds_no_failure_wait_or_sql(self):
        process=mock.Mock()
        process.stdin=io.StringIO();process.stdout=io.StringIO(json.dumps(HOLDER)+'\n');process.stderr=io.StringIO('')
        process.poll.return_value=None
        with mock.patch.object(h.shutil,'which',return_value='fake-psql'),mock.patch.object(h.subprocess,'Popen',return_value=process):
            session=h.SQLSession('local-fake')
            with mock.patch.object(session.stderr_reader,'join',side_effect=AssertionError('Unexpected failure wait')):
                self.assertEqual(session.query('SELECT planned_json;'),HOLDER)
                self.assertEqual(process.stdin.getvalue(),'SELECT planned_json;\n')
            session.close()

    def test_sql_failure_retains_only_sqlstate_exit_code_and_reader_failure(self):
        process=mock.Mock()
        process.stdin=io.StringIO();process.stdout=io.StringIO('{PRIVATE_INVALID_JSON}\n')
        process.stderr=io.StringIO('PRIVATE connection details\npsql:<stdin>:12: ERROR:  22P02\nPRIVATE context\n')
        process.poll.return_value=1
        with mock.patch.object(h.shutil,'which',return_value='fake-psql'),mock.patch.object(h.subprocess,'Popen',return_value=process) as popen:
            session=h.SQLSession('local-fake')
            # The stdout sentinel follows the worker's stored parse failure.
            self.assertIsNone(session.rows.get(timeout=1))
            with self.assertRaises(h.native.Unverified) as caught:session.query('PRIVATE SQL')
            detail=h.error_chain(caught.exception)[0]
            self.assertEqual(detail['sqlstate'],'22P02');self.assertEqual(detail['psqlExitCode'],1)
            self.assertEqual(detail['readerFailure'][0]['type'],'JSONDecodeError')
            self.assertNotIn('PRIVATE',json.dumps(detail))
            self.assertIn('VERBOSITY=sqlstate',popen.call_args.args[0])
            session.close()

    def test_stderr_text_without_sqlstate_is_not_misidentified_or_logged(self):
        process=mock.Mock()
        process.stdin=io.StringIO();process.stdout=io.StringIO('')
        process.stderr=io.StringIO('ERROR:  PRIVATE token=SECRET\n')
        process.poll.return_value=1
        with mock.patch.object(h.shutil,'which',return_value='fake-psql'),mock.patch.object(h.subprocess,'Popen',return_value=process):
            session=h.SQLSession('local-fake')
            with self.assertRaises(h.native.Unverified) as caught:session.query('PRIVATE SQL')
            detail=h.error_chain(caught.exception)[0]
            self.assertNotIn('sqlstate',detail);self.assertNotIn('PRIVATE',json.dumps(detail));self.assertNotIn('SECRET',json.dumps(detail))
            session.close()

    def test_browser_failure_reads_only_allowlisted_own_code_without_getters_or_raw_errors(self):
        client=object.__new__(h.DelayedCDP)
        client.call=mock.Mock(side_effect=[{'exceptionDetails':{'exception':{'objectId':'opaque','description':'PRIVATE stack'}}},
            {'result':[{'name':'message','value':{'value':'PRIVATE SQL/token'}},
                       {'name':'code','value':{'value':'DELAYED_PREFLIGHT_CHANGED'}}]}])
        with self.assertRaises(h.native.Unverified) as caught:client.evaluate('original expression')
        detail=h.error_chain(caught.exception)[0]
        self.assertEqual(detail['code'],'DIAGNOSTIC_EVALUATION_FAILED')
        self.assertEqual(detail['diagnosticCode'],'DELAYED_PREFLIGHT_CHANGED');self.assertNotIn('PRIVATE',json.dumps(detail))
        self.assertEqual(client.call.call_args_list,[mock.call('Runtime.evaluate',expression='original expression',returnByValue=True,awaitPromise=True),
                                                     mock.call('Runtime.getProperties',objectId='opaque',ownProperties=True)])

    def test_unknown_browser_code_is_redacted_and_property_inspection_cannot_mask_failure(self):
        for properties in [{'result':[{'name':'code','value':{'value':'PRIVATE_TOKEN'}},
                                      {'name':'code','get':{'description':'PRIVATE getter'}}]},OSError('PRIVATE details')]:
            client=object.__new__(h.DelayedCDP)
            client.call=mock.Mock(side_effect=[{'exceptionDetails':{'exception':{'objectId':'opaque'}}},properties])
            with self.assertRaises(h.native.Unverified) as caught:client.evaluate('expression')
            detail=h.error_chain(caught.exception)[0]
            self.assertEqual(detail['code'],'DIAGNOSTIC_EVALUATION_FAILED');self.assertNotIn('diagnosticCode',detail)
            self.assertNotIn('PRIVATE',json.dumps(detail))

    def test_browser_success_does_not_add_any_diagnostic_roundtrip(self):
        client=object.__new__(h.DelayedCDP);client.call=mock.Mock(return_value={'result':{'value':123}})
        self.assertEqual(client.evaluate('expression'),123)
        client.call.assert_called_once_with('Runtime.evaluate',expression='expression',returnByValue=True,awaitPromise=True)


class PostmortemInstructionsTests(unittest.TestCase):
    def test_documented_console_capture_is_read_only_and_retains_original_ids_and_bytes(self):
        source=(h.ROOT/'docs/cloud-delayed-admission-race.md').read_text(encoding='utf-8')
        expression=source.split('```javascript\n',1)[1].split('\n```',1)[0]
        driver=r'''
const assert=require('node:assert/strict'),fs=require('node:fs');
const {setup,scope,plain}=require('./tests/fake-cloud-gateway');
const e=setup(),global=e.get('globalThis');
e.load('persistence/cloud-cache-store.js');e.load('dev/cloud-recovery-plan.js');
const p=e.get('cloudRecoveryPlan'),denied=()=>{throw Error('Forbidden live action');};
const markerKey='cosmifold:dev:cloud-recovery:v1',cacheKey=`cosmifold:cloud-cache:v1:${scope.ownerUserId}:${scope.universeId}`;
const expression=JSON.parse(fs.readFileSync(0,'utf8'));
for(const pending of [true,false]){
  const m={format:'cosmifold-phase-c',fixtureVersion:1,scope,operationId:'00000000-0000-4000-8000-000000000003',
           case:'delayed-admission',phase:pending?'dispatched':'prepared'};
  const command=plain(p.command(m));
  const record={format:'cosmifold-cloud-cache',cacheVersion:1,storageVersion:5,scope,
    writer:{contextId:'retained',generation:1},sequence:1,acknowledged:{revision:'0',snapshot:plain(p.snapshot(m,'0'))},presentation:null,
    pending:pending?{pendingVersion:1,command,intendedSnapshot:plain(p.snapshot(m,'1')),presentation:null,intent:{type:'items.created'}}:null};
  const map=new Map([[markerKey,JSON.stringify(m)],[cacheKey,JSON.stringify(record)]]),before=[...map],reads=[];
  Object.assign(global,{
    localStorage:{getItem(key){assert.ok(map.has(key)||key===markerKey);reads.push(key);return map.get(key)??null;},
                  setItem:denied,removeItem:denied,clear:denied},
    location:{origin:'http://127.0.0.1:5500',reload:denied},window:{name:'cosmifold-inflight-writer'},
    document:{getElementById(id){assert.equal(id,'output');return {textContent:'Retained output'};}},
    recoveryBusy:false,recoveryDiagnostic:new Proxy({},{get:denied}),fetch:denied,XMLHttpRequest:denied,crypto:{randomUUID:denied}
  });
  const captured=JSON.parse(e.get(expression));
  assert.equal(captured.inspectionError,undefined);assert.equal(captured.stableRead,true);
  assert.equal(captured.markerText,map.get(markerKey));assert.equal(captured.cacheText,map.get(cacheKey));
  assert.equal(captured.expected.operationId,m.operationId);assert.deepEqual(captured.expected.command,command);
  assert.equal(captured.cacheSummary.acknowledgedRevision,'0');assert.equal(captured.cacheSummary.pending,pending);
  assert.equal(captured.cacheSummary.pendingMatchesPrepared,pending);assert.deepEqual([...map],before);
  assert.deepEqual(reads,[markerKey,cacheKey,markerKey,cacheKey]);
  map.delete(markerKey);
  const missing=JSON.parse(e.get(expression));assert.equal(missing.markerText,null);
  assert.equal(missing.inspectionError,'ORIGINAL_MARKER_MISSING');assert.equal(missing.expected,undefined);
  assert.equal(e.allocated(),0);assert.deepEqual(e.calls,[]);
}
'''
        result=subprocess.run(['node','-e',driver],input=json.dumps(expression),cwd=h.ROOT,capture_output=True,text=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stderr+result.stdout)


class LocalLocklabSafetyTests(unittest.TestCase):
    def setUp(self):
        spec=importlib.util.spec_from_file_location('local_locklab',h.ROOT/'scripts/cloud-delayed-admission-local-locklab.py')
        self.lab=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.lab)

    def test_remote_database_routing_arguments_are_not_accepted(self):
        for option in ['--service','--host','--dbname','--dsn','--data-directory']:
            argv=['locklab','--pg-bin',str(h.ROOT),'--output','unused.jsonl',option,'foreign']
            with mock.patch.object(sys,'argv',argv),mock.patch.object(self.lab,'experiment') as experiment, \
                 mock.patch('sys.stderr',new=io.StringIO()):
                with self.assertRaises(SystemExit) as caught:self.lab.main()
            self.assertEqual(caught.exception.code,2);experiment.assert_not_called()

    def test_wrong_major_version_refused_before_cluster_and_inherited_libpq_settings_removed(self):
        with mock.patch.dict(self.lab.os.environ,{'PGSERVICE':'forbidden','PGHOST':'foreign','PGPASSWORD':'PRIVATE'}), \
             mock.patch.object(self.lab.subprocess,'run',return_value=subprocess.CompletedProcess([],0,'postgres (PostgreSQL) 18.6','')) as run, \
             mock.patch.object(self.lab.tempfile,'mkdtemp',side_effect=AssertionError('must not create cluster')):
            with self.assertRaisesRegex(RuntimeError,'major 15'):
                self.lab.experiment(h.ROOT,h.ROOT/'unused.jsonl',True)
        env=run.call_args.kwargs['env']
        for key in ['PGSERVICE','PGHOST','PGPASSWORD']:self.assertNotIn(key,env)

    def test_existing_evidence_refused_before_initdb_and_preserved(self):
        with tempfile.TemporaryDirectory(prefix='locklab-safety-test-') as directory:
            output=Path(directory)/'existing.jsonl';output.write_text('KEEP FORENSIC\n',encoding='utf-8')
            with mock.patch.object(self.lab.subprocess,'run',return_value=subprocess.CompletedProcess([],0,'postgres (PostgreSQL) 15.19','')) as run, \
                 mock.patch.object(self.lab.tempfile,'mkdtemp',side_effect=AssertionError('must not create cluster')):
                with self.assertRaises(FileExistsError):self.lab.experiment(h.ROOT,output,True)
            run.assert_called_once();self.assertEqual(output.read_text(encoding='utf-8'),'KEEP FORENSIC\n')


class DelayedAdmissionTests(unittest.TestCase):
    def test_expiry_retains_only_status_codes_and_network_failure_count_without_changing_proof(self):
        trace=[];writer=Client(trace);observer=Client(trace);observer.target_id='observer';evidence={}
        writer.responses={'request1':401,'unrelated-request':200}
        writer.failures=[{'requestId':'request1','errorText':'PRIVATE diagnostic text'}]
        monitor=Monitor(trace);monitor.query=mock.Mock(return_value={**copy.deepcopy(SAMPLE),'writers':[]})
        with mock.patch.object(h.time,'monotonic',side_effect=[0,0,6]),mock.patch.object(h.time,'sleep'):
            with self.assertRaises(h.native.Unverified) as caught:
                h.coordinate(writer,observer,D,Holder(writer,trace),monitor,evidence=evidence,report=lambda _:None)
        self.assertEqual(caught.exception.code,'ADMISSION_WINDOW_EXPIRED')
        self.assertEqual(evidence['observedCommitHTTPStatuses'],[401]);self.assertEqual(evidence['observedNetworkFailureCount'],1)
        self.assertEqual(evidence['observedHTTPFinishedCount'],0);self.assertNotIn('PRIVATE',json.dumps(evidence))
        self.assertNotIn('detach',trace);self.assertNotIn('recover',trace);self.assertEqual(trace.count('dispatch'),1)

    def test_zero_matching_writers_expires_without_detach_recovery_or_resend_and_disposes_before_close(self):
        trace=[];writer=Client(trace);observer=Client(trace);observer.target_id='observer'
        before=writer.cache;holder=Holder(writer,trace);monitor=Monitor(trace);evidence={}
        monitor.query=mock.Mock(return_value={**copy.deepcopy(SAMPLE),'writers':[]})
        with mock.patch.object(h.time,'monotonic',side_effect=[0,0,6]),mock.patch.object(h.time,'sleep'):
            with self.assertRaises(h.native.Unverified) as caught:
                h.coordinate(writer,observer,D,holder,monitor,evidence=evidence,report=lambda _:None)
        self.assertEqual(caught.exception.code,'ADMISSION_WINDOW_EXPIRED')
        self.assertEqual(evidence['checkpoint'],'ADMISSION_PROBE');self.assertTrue(evidence['dispatchAttempted'])
        self.assertEqual(evidence['lastSQLObservation']['writerCount'],0)
        self.assertTrue(evidence['lastSQLObservation']['holderActive'])
        self.assertEqual(evidence['observedHTTPCommitCount'],1);self.assertEqual(evidence['observedHTTPFinishedCount'],0)
        self.assertEqual(trace.count('dispatch'),1);monitor.query.assert_called_once()
        for action in ['detach','recover','repeat','release']:self.assertNotIn(action,trace)
        self.assertEqual(trace[-2:],['dispose','close']);self.assertEqual(writer.cache,before)

    def test_descriptor_requires_original_scope_and_exact_empty_metadata(self):
        h.descriptor(D,ORIGIN)
        for key,value in [('origin','https://foreign.invalid'),('metadata0',{}),('extra',True)]:
            with self.assertRaises(h.native.Unverified):h.descriptor({**D,key:value},ORIGIN)

    def test_holder_uses_real_rpc_share_lock_bounded_local_settings_and_no_mutations(self):
        sql=h.holder_sql(D)
        self.assertIn('public.cosmifold_read_universe',sql);self.assertIn("IS DISTINCT FROM 'missing'",sql)
        self.assertIn("idle_in_transaction_session_timeout='12s'",sql);self.assertIn('SET LOCAL ROLE authenticated',sql)
        self.assertIn('(pg_current_xact_id()::xid)::text',sql)
        self.assertNotIn('pg_stat_activity',sql)  # SET ROLE must not depend on administrative stats visibility.
        self.assertNotRegex(sql.lower(),r'\b(?:insert|update|delete|create|commit)\s')

    def test_probe_binds_exact_tuple_writer_transaction_blocker_and_command_digest(self):
        sql=h.probe_sql(D,HOLDER)
        for text in ["l.locktype='tuple'","l.mode='AccessExclusiveLock' AND l.granted","a.wait_event='transactionid'",
                     'pg_blocking_pids','a.backend_xid','t.ctid','cosmifold_commit_metadata','sha256','originalReceiptCount']:
            self.assertIn(text,sql)
        self.assertNotIn('a.backend_xid IS NOT NULL',sql)
        for text in ["l.database=(SELECT oid FROM pg_database WHERE datname=current_database())", 'a.datid=l.database',
                     "v.virtualxid=l.virtualtransaction", "x.virtualtransaction=l.virtualtransaction",
                     "x.transactionid::text='1001'", "x.mode='ShareLock' AND NOT x.granted"]:
            self.assertIn(text,sql)
        self.assertNotRegex(sql.lower(),r'\b(?:insert|update|delete|create|commit)\s')

    def test_sql_data_is_quoted_and_browser_cannot_provide_executable_sql(self):
        text="x\\'); COMMIT; -- $guard$"
        self.assertEqual(h.literal(text),"E'"+json.dumps(text).replace('\\','\\\\').replace("'","''")+"'::jsonb")
        with self.assertRaises(h.native.Unverified):h.descriptor({**D,'sql':'COMMIT;'},ORIGIN)
        with self.assertRaises(h.native.Unverified):h.probe_sql(D,{'pid':"1; COMMIT",'xid':'1'})

    def test_missing_requires_one_same_writer_and_unchanged_authoritative_base(self):
        h.admission(SAMPLE,D,HOLDER)
        for patch in [{'readOnly':'off'},{'holderActive':False},{'exactServer':False},{'originalReceiptCount':1},{'requestDigest':'bad'},
                      {'writers':[]},{'writers':SAMPLE['writers']*2},{'writers':[{**SAMPLE['writers'][0],'blockers':[999]}]},
                      {'writers':[{**SAMPLE['writers'][0],'xid':''}]},{'monitorPid':102}]:
            with self.assertRaises(h.native.Unverified):h.admission({**SAMPLE,**patch},D,HOLDER)

    def test_waiting_writer_identity_uses_virtual_transaction_before_permanent_xid_assignment(self):
        for xid in [None,'1002']:
            sample=copy.deepcopy(SAMPLE);sample['writers'][0]['xid']=xid
            proof=h.admission(sample,D,HOLDER)
            self.assertEqual(proof['proofVersion'],2)
            self.assertEqual(proof['writerVirtualXid'],'6/3');self.assertEqual(proof['writerXid'],xid)

    def test_absent_invalid_or_reused_virtual_transaction_never_identifies_writer(self):
        for virtual in [None,'','6/0','6','6/3/4',True,'-1/3','6/3; COMMIT']:
            sample=copy.deepcopy(SAMPLE);sample['writers'][0]['virtualXid']=virtual
            with self.assertRaises(h.native.Unverified):h.admission(sample,D,HOLDER)
        sample=copy.deepcopy(SAMPLE);del sample['writers'][0]['virtualXid']
        with self.assertRaises(h.native.Unverified):h.admission(sample,D,HOLDER)

    def test_coordinator_probes_before_detach_and_after_missing_then_releases_and_recovers_once(self):
        trace=[];writer=Client(trace);observer=Client(trace);observer.target_id='observer'
        proof=h.coordinate(writer,observer,D,Holder(writer,trace),Monitor(trace),report=lambda _:None)
        self.assertEqual(proof['writerPid'],102);self.assertEqual(trace.count('dispatch'),1)
        self.assertLess(trace.index('probe'),trace.index('detach'))
        self.assertLess(trace.index('blocked'),len(trace)-1-trace[::-1].index('probe'))
        self.assertLess(len(trace)-1-trace[::-1].index('probe'),trace.index('release'))
        self.assertLess(trace.index('release'),trace.index('recover'));self.assertEqual(trace.count('repeat'),2)
        self.assertFalse(any(x in trace for x in ['Fetch.failRequest','Fetch.fulfillRequest','Network.emulateNetworkConditions']))

    def test_holder_expiry_or_writer_replacement_cannot_earn_pass_and_always_closes_holder(self):
        for patch in [{'holderActive':False},{'monitorPid':104},{'writers':[{**SAMPLE['writers'][0],'xid':'1003'}]},
                      {'writers':[{**SAMPLE['writers'][0],'virtualXid':'6/4'}]},
                      {'writers':[{**SAMPLE['writers'][0],'queryStart':'2026-10-14T00:00:01Z'}]}]:
            trace=[];writer=Client(trace);observer=Client(trace);observer.target_id='observer'
            with self.assertRaises(h.native.Unverified):h.coordinate(writer,observer,D,Holder(writer,trace),Monitor(trace,patch),report=lambda _:None)
            self.assertNotIn('recover',trace);self.assertNotIn('release',trace)
            self.assertIn('dispose',trace);self.assertEqual(trace[-1],'close')

    def test_second_http_request_is_rejected(self):
        trace=[];writer=Client(trace);observer=Client(trace);observer.target_id='observer'
        writer.commits=[{'id':'unexpected'}]
        with self.assertRaises(h.native.Unverified):h.coordinate(writer,observer,D,Holder(writer,trace),Monitor(trace),report=lambda _:None)
        self.assertNotIn('detach',trace);self.assertEqual(trace[-1],'close')

    def test_psql_interface_never_accepts_connection_uri_password_or_sql_from_browser(self):
        source=(Path(__file__).resolve().parents[1]/'scripts/cloud-delayed-admission-harness.py').read_text()
        for text in ['--no-password','--no-psqlrc','ON_ERROR_STOP=1','default_transaction_read_only=on']:
            self.assertIn(text,source)
        self.assertNotIn('shell=True',source);self.assertNotIn('pg_cancel_backend(',source);self.assertNotIn('pg_terminate_backend(',source)


if __name__=='__main__':unittest.main()
