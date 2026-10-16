"""MANUAL SQL/CDP coordinator for one prepared disposable Phase C Universe.

Requires psql and an operator-configured libpq service (Primary, administrative
monitoring privileges). No credentials, SQL text or database error details are
logged. --print-sql prints offline review templates; --run explicitly authorizes
two SQL sessions and ONE original browser mutation. No SQL/RPC objects are added.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import queue
import re
import shutil
import subprocess
import sys
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('native', ROOT/'scripts/cloud-inflight-harness.py')
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
require = native.require
DELAYED_DIAGNOSTIC_CODES=set('''ACCOUNT_CONTEXT_CHANGED DIAGNOSTIC_BUSY DIAGNOSTIC_CONTROL_BUSY DIAGNOSTIC_DISPOSED
LOOPBACK_ONLY SIGN_IN_AT_THIS_ORIGIN_FIRST ORIGINAL_PHASE_C_OWNER_REQUIRED WEB_LOCKS_REQUIRED
DELAYED_PREPARED_REQUIRED DELAYED_PREFLIGHT_CHANGED DELAYED_REQUEST_NOT_PENDING ORIGINAL_PENDING_REQUIRED
INVALID_DELAYED_ADMISSION INVALID_PHASE_C_MARKER INVALID_PHASE_C_SCOPE INVALID_DELAYED_PHASE INVALID_DELAYED_MISSING
VALID_PHASE_C_CACHE_REQUIRED PHASE_C_CACHE_CHANGED PHASE_C_PENDING_CHANGED PHASE_C_SERVER_CHANGED PHASE_C_RECEIPT_CHANGED
PHASE_C_FIXTURE_ABSENT PHASE_C_COMMAND_CHANGED JOURNAL_MUST_PRECEDE_DISPATCH NO_MUTATION_RETRY NO_UNREVIEWED_DISPATCH
ONLINE_DELAYED_REQUEST_REQUIRED PREPARE_FIRST_NO_RETRY DISPATCH_REQUIRES_EMPTY_FIXTURE REAL_DELAYED_MISSING_REQUIRED
BLOCKED_CONTEXT_REQUIRED DEPENDENT_MUTATION_NOT_BLOCKED MISSING_RECEIPT_NOT_BLOCKED INVALID_CACHE INVALID_METADATA
INVALID_COMMAND OUTCOME_UNKNOWN NETWORK_UNAVAILABLE UNAUTHENTICATED FORBIDDEN'''.split())


def descriptor(value, origin, mock=False):
    require(isinstance(value, dict) and set(value)=={'origin','scope','operationId','command','commitURL','cacheKey','markerKey','metadata0'}, 'DELAYED_DESCRIPTOR_REQUIRED')
    native.validate_descriptor({k:v for k,v in value.items() if k!='metadata0'}, origin, mock)
    require(value['metadata0']=={
        'format':'cosmifold-cloud-metadata','projectionVersion':1,'storageVersion':5,
        'universe':{'id':value['scope']['universeId'],'owner_id':value['scope']['ownerUserId'],'revision':'0'},
        'snapshot_fields':{'connections':True,'portals':True,'constellations':True,'archivedGalaxies':True},
        'entries':[],'constellations':[],'constellation_members':[],'linked_placements':[]}, 'EXACT_EMPTY_FIXTURE_REQUIRED')
    return value


def literal(value):
    # SQL data literals only. Never accept SQL from the browser or shell-interpolate.
    return "E'"+json.dumps(value, separators=(',',':'), ensure_ascii=True).replace('\\','\\\\').replace("'", "''")+"'::jsonb"


def holder_sql(d):
    owner = d['scope']['ownerUserId']  # Canonical UUIDs already validated.
    return f"""BEGIN;
SET LOCAL statement_timeout='3s';
SET LOCAL lock_timeout='1s';
SET LOCAL idle_in_transaction_session_timeout='12s';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','{owner}',true) IS NOT NULL AS ignored;
SELECT set_config('request.jwt.claims',{literal({'sub':owner,'role':'authenticated'})}::text,true) IS NOT NULL AS ignored;
DO $guard$
BEGIN
 IF current_user<>'authenticated' OR auth.uid() IS DISTINCT FROM '{owner}'::uuid THEN RAISE EXCEPTION 'Wrong identity'; END IF;
 IF public.cosmifold_read_universe({literal(d['scope'])}) IS DISTINCT FROM
   jsonb_build_object('status','found','metadata',{literal(d['metadata0'])}) THEN RAISE EXCEPTION 'Fixture changed'; END IF;
 IF public.cosmifold_operation_receipt({literal(d['scope'])},'{d['operationId']}'::uuid)->>'status' IS DISTINCT FROM 'missing'
 THEN RAISE EXCEPTION 'Original receipt already exists'; END IF;
END;
$guard$;
-- read_universe above holds FOR SHARE on this exact row until ROLLBACK.
SELECT jsonb_build_object('pid',pg_backend_pid(),'xid',(pg_current_xact_id()::xid)::text);
"""


def probe_sql(d, holder):
    require(set(holder)=={'pid','xid'} and type(holder['pid']) is int and holder['pid']>0 and
            isinstance(holder['xid'],str) and re.fullmatch('[1-9][0-9]*',holder['xid']), 'INVALID_HOLDER_IDENTITY')
    u, owner = d['scope']['universeId'], d['scope']['ownerUserId']
    return f"""WITH target AS (
 SELECT ctid FROM cosmifold_private.universes WHERE id='{u}'::uuid AND owner_id='{owner}'::uuid
), writers AS (
 SELECT a.pid,a.backend_xid::text AS xid,l.virtualtransaction AS "virtualXid",
   to_char(a.query_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "queryStart",
   pg_blocking_pids(a.pid) AS blockers
 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid CROSS JOIN target t
 WHERE l.locktype='tuple' AND l.relation='cosmifold_private.universes'::regclass
 AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND a.datid=l.database
 AND l.page=split_part(trim(both '()' from t.ctid::text),',',1)::bigint
 AND l.tuple=split_part(trim(both '()' from t.ctid::text),',',2)::smallint
 AND l.mode='AccessExclusiveLock' AND l.granted
 AND a.state='active' AND a.wait_event_type='Lock' AND a.wait_event='transactionid'
 AND a.query LIKE '%cosmifold_commit_metadata%'
 -- Permanent XID assignment can follow this row-lock wait.
 -- Correlate its owned virtual transaction and exact holder-XID wait instead.
 AND EXISTS(SELECT 1 FROM pg_locks v WHERE v.pid=a.pid AND v.locktype='virtualxid'
   AND v.virtualxid=l.virtualtransaction AND v.virtualtransaction=l.virtualtransaction
   AND v.mode='ExclusiveLock' AND v.granted)
 AND EXISTS(SELECT 1 FROM pg_locks x WHERE x.pid=a.pid AND x.locktype='transactionid'
   AND x.virtualtransaction=l.virtualtransaction AND x.transactionid::text='{holder['xid']}'
   AND x.mode='ShareLock' AND NOT x.granted)
)
SELECT jsonb_build_object('monitorPid',pg_backend_pid(),'readOnly',current_setting('default_transaction_read_only'),
 'holderActive',EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid={holder['pid']} AND backend_xid::text='{holder['xid']}' AND state='idle in transaction'),
 'exactServer',cosmifold_private.project_universe('{u}'::uuid)={literal(d['metadata0'])},
 'originalReceiptCount',(SELECT count(*) FROM cosmifold_private.operation_receipts WHERE universe_id='{u}'::uuid),
 'requestDigest',encode(sha256(convert_to(({literal(d['command'])})::text,'UTF8')),'hex'),
 'writers',coalesce((SELECT jsonb_agg(to_jsonb(w)) FROM writers w),'[]'::jsonb));
"""


def print_sql_plan():
    """Offline review only: no fixture lookup, connections or live finalization."""
    d={'scope':{'ownerUserId':'<OWNER_USER_ID>','universeId':'<UNIVERSE_ID>'},
       'operationId':'<ORIGINAL_OPERATION_ID>',
       'metadata0':'<EXACT_EMPTY_REVISION_0_METADATA_JSONB>',
       'command':'<EXACT_ORIGINAL_COMMAND_JSONB>'}
    holder=holder_sql(d)
    monitor=probe_sql(d,{'pid':1,'xid':'1'})
    # Display JSONB expression placeholders rather than JSON strings. These
    # templates are never passed to SQLSession; --run uses validated real data.
    for key in ['metadata0','command']:
        holder=holder.replace(literal(d[key]),d[key])
        monitor=monitor.replace(literal(d[key]),d[key])
    print('-- PRINT ONLY: offline SQL/operator plan; no browser or database connections.\n'
          '-- REVIEW TEMPLATES ONLY: <...> placeholders are not executable SQL.\n'
          '-- A separately authorized --run validates the existing WRITER descriptor and OBSERVER identity,\n'
          '-- opens a read-only monitor, acquires the holder, dispatches ONE original command,\n'
          '-- verifies missing receipt, releases the holder, and verifies original receipt recovery.\n'
          '-- Do not execute templates manually, prepare another fixture, or dispatch manually.\n'
          '-- Holder template; transaction stays open until coordinator ROLLBACK.\n'+holder)
    print('-- Read-only monitor template; holder PID/XID 1 are examples replaced during --run.\n'+monitor)


def error_chain(error):
    """Keep proof codes and traceback locations, never messages, SQL or locals."""
    result=[];seen=set()
    while error is not None and id(error) not in seen and len(result)<6:
        seen.add(id(error))
        code=error.code if isinstance(error,native.Unverified) and re.fullmatch('[A-Z_]{1,80}',error.code) else 'DELAYED_ADMISSION_UNVERIFIED'
        item={'code':code,'type':type(error).__name__}
        diagnostic_code=getattr(error,'diagnostic_code',None)
        if isinstance(diagnostic_code,str) and diagnostic_code in DELAYED_DIAGNOSTIC_CODES:item['diagnosticCode']=diagnostic_code
        sqlstate=getattr(error,'sqlstate',None)
        if isinstance(sqlstate,str) and re.fullmatch('[0-9A-Z]{5}',sqlstate):item['sqlstate']=sqlstate
        if type(getattr(error,'psql_exit_code',None)) is int:item['psqlExitCode']=error.psql_exit_code
        for attribute,key in [('reader_failure','readerFailure'),('inspection_failure','inspectionFailure')]:
            if hasattr(error,attribute):item[key]=getattr(error,attribute)
        tb=error.__traceback__
        if tb:
            while tb.tb_next:tb=tb.tb_next
            item['location']={'file':Path(tb.tb_frame.f_code.co_filename).name,
                              'function':tb.tb_frame.f_code.co_name,'line':tb.tb_lineno}
        result.append(item)
        error=error.__cause__ if error.__cause__ is not None else error.__context__
    return result


def checkpoint(evidence,name,**values):
    if evidence is not None:evidence.update(checkpoint=name,**values)


def retain_observation(evidence,sample):
    """Only bounded, typed monitor facts; never arbitrary SQL/JSON/error text."""
    if evidence is None or not isinstance(sample,dict):return
    kept={}
    for key in ['monitorPid','originalReceiptCount']:
        if type(sample.get(key)) is int:kept[key]=sample[key]
    for key in ['holderActive','exactServer']:
        if type(sample.get(key)) is bool:kept[key]=sample[key]
    if sample.get('readOnly') in ('on','off'):kept['readOnly']=sample['readOnly']
    digest=sample.get('requestDigest')
    if isinstance(digest,str) and re.fullmatch('[a-f0-9]{64}',digest):kept['requestDigest']=digest
    if isinstance(sample.get('writers'),list):kept['writerCount']=len(sample['writers'])
    evidence['lastSQLObservation']=kept


def admission(value, d, holder):
    require(isinstance(value,dict) and set(value)=={'monitorPid','readOnly','holderActive','exactServer','originalReceiptCount','requestDigest','writers'}, 'INVALID_SQL_OBSERVATION')
    require(value['readOnly']=='on' and value['holderActive'] is True and value['exactServer'] is True and value['originalReceiptCount']==0 and
            isinstance(value['requestDigest'],str) and re.fullmatch('[a-f0-9]{64}',value['requestDigest']), 'PRECOMMIT_STATE_NOT_PROVED')
    require(isinstance(value['writers'],list) and len(value['writers'])==1, 'ONE_EXACT_WAITING_WRITER_REQUIRED')
    w = value['writers'][0]
    require(set(w)=={'pid','xid','virtualXid','queryStart','blockers'} and type(w['pid']) is int and w['pid']>0 and
            len({w['pid'],holder['pid'],value['monitorPid']})==3 and w['blockers']==[holder['pid']] and
            (w['xid'] is None or isinstance(w['xid'],str) and re.fullmatch('[1-9][0-9]*',w['xid']) and w['xid']!=holder['xid']) and
            isinstance(w['virtualXid'],str) and re.fullmatch('[0-9]{1,10}/[1-9][0-9]{0,9}',w['virtualXid']) and
            isinstance(w['queryStart'],str) and len(w['queryStart'])<80, 'WRITER_BLOCKER_IDENTITY_UNVERIFIED')
    return {'proofVersion':2,'source':'share-holder-before-writer-lock','scope':d['scope'],'operationId':d['operationId'],
            'baseRevision':'0','revision':'0','holderPid':holder['pid'],'holderXid':holder['xid'],
            'writerPid':w['pid'],'writerXid':w['xid'],'writerVirtualXid':w['virtualXid'],
            'queryStart':w['queryStart'],'requestDigest':value['requestDigest']}


class SQLSession:
    """Persistent psql session. JSON stdout only; stderr content is discarded."""
    def __init__(self, service):
        require(re.fullmatch('[A-Za-z0-9_-]{1,80}',service) is not None, 'LIBPQ_SERVICE_NAME_REQUIRED')
        executable = shutil.which('psql')
        require(executable, 'PSQL_NOT_AVAILABLE')
        env = dict(os.environ, PGSERVICE=service, PGCONNECT_TIMEOUT='5', PGAPPNAME='cosmifold-delayed-admission')
        # Credentials must come from the operator's libpq service/password file.
        env.pop('PGPASSWORD',None)
        self.process = subprocess.Popen([executable,'--no-psqlrc','--no-password','--quiet','--tuples-only','--no-align','--set','ON_ERROR_STOP=1','--set','VERBOSITY=sqlstate'],
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',env=env,
            creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        self.rows = queue.Queue(maxsize=64)
        self.sqlstate=None;self.reader_failure=None
        def read():
            try:
                for line in self.process.stdout:
                    if line.lstrip().startswith('{'):
                        require(len(line)<131072,'BOUNDED_SQL_OUTPUT_REQUIRED')
                        self.rows.put(json.loads(line),timeout=1)
            except Exception as error:
                self.reader_failure=error_chain(error)
            finally:
                self.rows.put(None,timeout=1)
        def discard():
            for line in self.process.stderr:
                match=re.search(r'(?:^|:\s)(?:ERROR|FATAL|PANIC):\s+([0-9A-Z]{5})\s*$',line)
                if match:self.sqlstate=match.group(1)
        threading.Thread(target=read,daemon=True).start()
        self.stderr_reader=threading.Thread(target=discard,daemon=True)
        self.stderr_reader.start()

    def query(self, sql, seconds=3):
        try:
            require(self.process.poll() is None,'SQL_SESSION_CLOSED')
            self.process.stdin.write(sql+'\n');self.process.stdin.flush()
            try:
                result=self.rows.get(timeout=seconds)
            except queue.Empty:
                raise native.Unverified('BOUNDED_SQL_TIMEOUT')
            require(result is not None,'SQL_FAILED_RETAIN_FIXTURE')
            return result
        except Exception as error:
            # Failure only: allow stderr to catch up, bounded independently of
            # the live proof window. Never retain stderr text or JSON documents.
            self.stderr_reader.join(timeout=0.1)
            error.sqlstate=self.sqlstate;error.psql_exit_code=self.process.poll()
            if self.reader_failure:error.reader_failure=self.reader_failure
            raise

    def release(self):
        return self.query("ROLLBACK; SELECT jsonb_build_object('released',true);")

    def close(self):
        if self.process.poll() is None:
            try:
                self.process.stdin.write('ROLLBACK;\n\\q\n');self.process.stdin.flush()
                self.process.wait(timeout=2)
            except Exception:
                self.process.terminate()  # Closing the holder connection releases its transaction.
                self.process.wait(timeout=2)
        for stream in [self.process.stdin,self.process.stdout,self.process.stderr]:
            stream.close()


class DelayedCDP(native.SafeCDP):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,**kwargs)
        self.commits=[];self.finished=set();self.responses={}

    def evaluate(self,expression):
        response=self.call('Runtime.evaluate',expression=expression,returnByValue=True,awaitPromise=True)
        if 'exceptionDetails' not in response:return response.get('result',{}).get('value')
        failure=native.Unverified('DIAGNOSTIC_EVALUATION_FAILED')
        try:
            exception=response['exceptionDetails'].get('exception',{})
            object_id=exception.get('objectId')
            if isinstance(object_id,str):
                # Read own data properties only; never invoke getters, evaluate
                # another expression, or log exception descriptions/messages.
                properties=self.call('Runtime.getProperties',objectId=object_id,ownProperties=True)
                for prop in properties.get('result',[]):
                    value=prop.get('value',{}).get('value')
                    if prop.get('name')=='code' and isinstance(value,str) and value in DELAYED_DIAGNOSTIC_CODES:
                        failure.diagnostic_code=value
        except Exception as error:
            failure.inspection_failure=error_chain(error)
        raise failure

    def event(self,message):
        super().event(message)
        p=message.get('params',{});method=message.get('method')
        if method=='Network.requestWillBeSent':
            r=p.get('request',{})
            if r.get('url','').endswith(('/rest/v1/rpc/cosmifold_commit_metadata','/__phase_c_commit__')) and r.get('method')=='POST':
                self.commits.append({'id':p.get('requestId'),'url':r.get('url'),'postData':r.get('postData')})
        if method=='Network.responseReceived':
            self.responses[p.get('requestId')]=p.get('response',{}).get('status')
        if method=='Network.loadingFinished':
            self.finished.add(p.get('requestId'))


def original_request(writer,d,mock=False):
    require(len(writer.commits)==1,'ONE_ORIGINAL_HTTP_COMMIT_REQUIRED')
    r=writer.commits[0]
    native.validate_pause({'url':r['url'],'method':'POST','status':200,'requestId':r['id'],'networkId':r['id'],'postData':r['postData']},d,mock)
    return r['id']


def coordinate(writer,observer,d,holder,monitor,mock=False,report=print,evidence=None):
    """Holder acquired before dispatch. No browser Offline, reload or HTTP abort."""
    complete=False
    try:
        checkpoint(evidence,'CDP_ENABLE')
        require(writer.target_id!=observer.target_id,'INDEPENDENT_OBSERVER_REQUIRED')
        writer.call('Network.enable');writer.call('Runtime.enable');observer.call('Runtime.enable')
        observer.evaluate('recoveryDiagnostic.identity()')  # identity only; no preparation/dispatch
        checkpoint(evidence,'ARM_DELAYED')
        writer.evaluate('recoveryDiagnostic.armDelayed()')
        require(writer.evaluate("recoveryControls(); !document.getElementById('dispatch').disabled"),'DELAYED_DISPATCH_NOT_ARMED')
        # Snapshot all bytes after the journal is written, before detaching the await.
        checkpoint(evidence,'DISPATCH_CLICK',dispatchAttempted=True)
        writer.evaluate("document.getElementById('dispatch').click(); true")
        deadline=time.monotonic()+6
        h=holder.identity
        checkpoint(evidence,'ADMISSION_PROBE')
        while True:
            require(time.monotonic()<deadline,'ADMISSION_WINDOW_EXPIRED')
            sample=monitor.query(probe_sql(d,h))
            retain_observation(evidence,sample)
            require(sample['monitorPid']==monitor.pid,'MONITOR_SESSION_CHANGED')
            require(sample['holderActive'] is True and sample['exactServer'] is True and sample['originalReceiptCount']==0,'HOLDER_OR_FIXTURE_CHANGED')
            if sample['writers']:
                proof=admission(sample,d,h);break
            writer.evaluate('true')  # Drain request events; no RPC or mutation.
            time.sleep(0.02)
        if evidence is not None:
            evidence['admission']={k:proof[k] for k in ['holderPid','holderXid','writerPid','writerXid','writerVirtualXid','requestDigest']}
        checkpoint(evidence,'ORIGINAL_HTTP_VALIDATION')
        writer.evaluate('true');request_id=original_request(writer,d,mock)
        checkpoint(evidence,'PENDING_JOURNAL_VALIDATION',originalHTTPValidated=True)
        key=json.dumps(d['cacheKey'])
        before=writer.evaluate('localStorage.getItem('+key+')')
        cached=json.loads(before)
        require(cached['acknowledged']['revision']=='0' and cached['pending']['command']==d['command'],'EXACT_PENDING_JOURNAL_REQUIRED')
        checkpoint(evidence,'DETACH_DELAYED_WAIT')
        require(writer.evaluate('recoveryDiagnostic.detachDelayedWait('+json.dumps(proof)+')')=={'detached':True,'cacheRevision':'0'},'WAIT_NOT_DETACHED')
        checkpoint(evidence,'REAL_MISSING_VALIDATION')
        while writer.evaluate('recoveryBusy'):
            require(time.monotonic()<deadline,'MISSING_RECEIPT_DID_NOT_COMPLETE')
            time.sleep(0.02)
        identity=writer.evaluate('recoveryDiagnostic.identity()')
        require(identity['phase']=='uncertain' and identity.get('delayedMissing') is True and identity.get('delayedAdmission')==proof,'REAL_MISSING_NOT_OBSERVED')
        writer.evaluate('recoveryDiagnostic.checkBlocked()')
        require(writer.evaluate('localStorage.getItem('+key+')')==before,'MISSING_CHANGED_EXACT_CACHE')
        # Bracket the real missing HTTP result with the SAME backend transaction
        # still waiting. A released/expired holder cannot earn this checkpoint.
        checkpoint(evidence,'BRACKET_PROBE')
        after=monitor.query(probe_sql(d,h))
        retain_observation(evidence,after)
        require(after['monitorPid']==monitor.pid and admission(after,d,h)==proof,'WRITER_TRANSACTION_CHANGED')
        require(time.monotonic()<deadline,'RELEASE_WINDOW_EXPIRED')
        require(request_id not in writer.finished and not writer.failures,'ORIGINAL_HTTP_NOT_PENDING')
        report('PROVED: exact original HTTP command; same backend PID/virtual transaction blocked on share holder before commit; real original receipt missing; exact pending cache/base 0 and writes blocked.')
        checkpoint(evidence,'HOLDER_RELEASE',proved=True)
        require(holder.release()=={'released':True},'HOLDER_RELEASE_UNVERIFIED')
        checkpoint(evidence,'ORIGINAL_HTTP_COMPLETION')
        while request_id not in writer.finished:
            require(time.monotonic()<deadline+6,'ORIGINAL_HTTP_COMPLETION_UNVERIFIED')
            writer.evaluate('true');time.sleep(0.02)
        require(writer.responses.get(request_id)==200 and not writer.failures,'ORIGINAL_HTTP_SUCCESS_UNVERIFIED')
        require(writer.evaluate('localStorage.getItem('+key+')')==before,'LATE_ORIGINAL_REPLY_PUBLISHED')
        checkpoint(evidence,'ORIGINAL_RECEIPT_RECOVERY')
        recovered=writer.evaluate('recoveryDiagnostic.reopenDelayed()')
        require(recovered['status']=='loaded' and recovered['revision']=='1','ORIGINAL_RECEIPT_RECOVERY_UNVERIFIED')
        checkpoint(evidence,'REPEAT_RECOVERY_VALIDATION')
        writer.evaluate('recoveryDiagnostic.verifyAgain()');writer.evaluate('recoveryDiagnostic.verifyAgain()')
        require(original_request(writer,d,mock)==request_id,'SEMANTIC_RESEND_OBSERVED')
        complete=True
        report('PASS: released only holder; original HTTP request completed; SAME validated receipt recovered revision 1 once; two repeats idempotent; no resend. STOP for review before cleanup.')
        return proof
    except Exception as error:
        if evidence is not None:evidence['primaryFailure']=error_chain(error)
        raise
    finally:
        if evidence is not None:
            evidence['observedHTTPCommitCount']=len(writer.commits)
            evidence['observedHTTPFinishedCount']=sum(r['id'] in writer.finished for r in writer.commits)
            evidence['observedNetworkFailureCount']=len(writer.failures)
            statuses=[writer.responses.get(r['id']) for r in writer.commits]
            evidence['observedCommitHTTPStatuses']=sorted({status for status in statuses if type(status) is int and 100<=status<=599})
        if not complete:
            try:
                writer.evaluate('recoveryDiagnostic.dispose()')
                if evidence is not None:evidence['writerDisposeCompleted']=True
            except Exception as error:
                if evidence is not None:evidence['writerDisposeError']=error_chain(error)
        try:
            holder.close()  # Always release bounded test locks; never delete test data.
        except Exception as error:
            if evidence is not None:evidence['holderCloseError']=error_chain(error)
            raise


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin',required=True);parser.add_argument('--debug-port',type=int,default=9222)
    action=parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--print-sql',action='store_true');action.add_argument('--run',action='store_true')
    parser.add_argument('--service',help='Operator-configured libpq Primary service name; no URI or password')
    args=parser.parse_args()
    # Deliberately outside the live try/except/finally: printing needs neither a
    # browser fixture nor a libpq service and cannot earn a live-state result.
    if args.print_sql:
        print_sql_plan()
        return 0
    writer=observer=holder=monitor=failure=None
    evidence={'dispatchAttempted':False,'holderSetupCompleted':False}
    try:
        checkpoint(evidence,'BROWSER_DISCOVERY')
        native.SafeCDP=DelayedCDP
        origin=native.validate_origin(args.origin);writer,observer=native.find_targets(args.debug_port,origin)
        checkpoint(evidence,'WRITER_DESCRIPTOR')
        d=descriptor(writer.evaluate('recoveryDiagnostic.delayedDescriptor()'),origin)
        checkpoint(evidence,'OBSERVER_IDENTITY',scope=d['scope'],operationId=d['operationId'])
        require(observer.evaluate('recoveryDiagnostic.identity()')['operationId']==d['operationId'],'OBSERVER_SCOPE_CHANGED')
        require(args.service is not None,'EXPLICIT_LIBPQ_SERVICE_REQUIRED')
        checkpoint(evidence,'MONITOR_CONNECT')
        monitor=SQLSession(args.service)
        checkpoint(evidence,'MONITOR_SETUP')
        setup=monitor.query("SET default_transaction_read_only=on; SET statement_timeout='2s'; SET lock_timeout='1s'; SELECT jsonb_build_object('pid',pg_backend_pid(),'version',current_setting('server_version_num')::integer,'readOnly',current_setting('default_transaction_read_only'));")
        require(150000<=setup['version']<190000 and setup['readOnly']=='on','SUPPORTED_READ_ONLY_MONITOR_REQUIRED')
        monitor.pid=setup['pid']
        if type(monitor.pid) is int:evidence['monitorPid']=monitor.pid
        checkpoint(evidence,'HOLDER_CONNECT')
        holder=SQLSession(args.service)
        checkpoint(evidence,'HOLDER_SETUP')
        holder.identity=holder.query(holder_sql(d))
        checkpoint(evidence,'COORDINATOR_ENTRY',holderSetupCompleted=True)
        if isinstance(holder.identity,dict):
            if type(holder.identity.get('pid')) is int:evidence['holderPid']=holder.identity['pid']
            xid=holder.identity.get('xid')
            if isinstance(xid,str) and re.fullmatch('[1-9][0-9]{0,19}',xid):evidence['holderXid']=xid
        proof=coordinate(writer,observer,d,holder,monitor,evidence=evidence)
        print(json.dumps(proof,sort_keys=True))
        return 0
    except Exception as error:
        failure=error
        code=error.code if isinstance(error,native.Unverified) and re.fullmatch('[A-Z_]{1,80}',error.code) else 'DELAYED_ADMISSION_UNVERIFIED'
        print('STOPPED: '+code+'. No PASS. Original may still commit; holder release runs on exit. Retain original fixture/journal; do not redispatch or force cleanup.')
        return 2
    finally:
        for name,session in [('holder',holder),('monitor',monitor)]:
            if session:
                try:
                    session.close()
                    evidence.setdefault('sqlCloseCompleted',[]).append(name)
                except Exception as error:
                    if failure is None:raise
                    evidence.setdefault('cleanupErrors',[]).append({'resource':name,'errors':error_chain(error)})
        for name,client in [('writer',writer),('observer',observer)]:
            if client:
                try:
                    client.sock.close()
                except Exception as error:
                    if failure is None:raise
                    evidence.setdefault('cleanupErrors',[]).append({'resource':name,'errors':error_chain(error)})
        if failure is not None:
            print('DIAGNOSTIC: '+json.dumps({'errors':error_chain(failure),'evidence':evidence},sort_keys=True))


if __name__=='__main__':
    sys.exit(main())
