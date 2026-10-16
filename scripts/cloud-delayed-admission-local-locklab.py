"""Isolated PostgreSQL 15 lock experiment; NEVER accepts a service/DSN/database.

Creates and stops its OWN temporary loopback-only cluster. Applies the unchanged
migration only there, with synthetic Auth/UUIDs. Retains JSONL observations and
the stopped temporary cluster. No browser, Supabase, libpq service or live data.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import queue
import socket
import subprocess
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('delayed', ROOT/'scripts/cloud-delayed-admission-harness.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
OWNER = '00000000-0000-4000-8000-000000000001'


class LocalSQL:
    def __init__(self, binary, port, env):
        self.process = subprocess.Popen([str(binary), '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1',
            '-h', '127.0.0.1', '-p', str(port), '-U', 'postgres', '-d', 'postgres'],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding='utf-8', env=env,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        self.rows = queue.Queue()
        self.errors = []
        def read():
            for line in self.process.stdout:
                if line.startswith('{'):
                    self.rows.put(json.loads(line))
            self.rows.put(None)
        def errors():
            for line in self.process.stderr:
                self.errors.append(line.rstrip())
        threading.Thread(target=read, daemon=True).start()
        threading.Thread(target=errors, daemon=True).start()

    def send(self, sql):
        self.process.stdin.write(sql+'\n')
        self.process.stdin.flush()

    def receive(self):
        row = self.rows.get(timeout=8)
        if row is None:
            raise RuntimeError('Local psql exited: '+repr(self.errors))
        return row

    def query(self, sql):
        self.send(sql)
        return self.receive()

    def close(self):
        if self.process.poll() is None:
            try:
                self.send('ROLLBACK;\n\\q')
                self.process.wait(timeout=3)
            except (OSError, subprocess.TimeoutExpired):
                self.process.kill()  # Only this script's own local psql process.
                self.process.wait(timeout=3)
        for stream in [self.process.stdin, self.process.stdout, self.process.stderr]:
            stream.close()


def auth_sql():
    return f"SET ROLE authenticated; SET request.jwt.claim.sub='{OWNER}';"


def raw_sql(universe, pids):
    ids = ','.join(str(pid) for pid in pids)
    return f"""SELECT jsonb_build_object('observedAt',clock_timestamp(),
 'target',(SELECT jsonb_build_object('database',(SELECT oid FROM pg_database WHERE datname=current_database()),
   'relation',tableoid,'ctid',ctid::text,'revision',revision) FROM cosmifold_private.universes WHERE id='{universe}'),
 'activity',coalesce((SELECT jsonb_agg(jsonb_build_object('pid',pid,'datid',datid,'state',state,
   'backend_start',backend_start,'xact_start',xact_start,'query_start',query_start,
   'backend_xid',backend_xid::text,'wait_event_type',wait_event_type,'wait_event',wait_event,
   'query',query,'blockers',pg_blocking_pids(pid))) FROM pg_stat_activity WHERE pid IN ({ids})),'[]'::jsonb),
 'locks',coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM pg_locks l WHERE pid IN ({ids})),'[]'::jsonb));"""


def predicate_audit(raw, writer_pid, holder_pid):
    a = next(a for a in raw['activity'] if a['pid'] == writer_pid)
    page, item = map(int, raw['target']['ctid'].strip('()').split(','))
    locks = [l for l in raw['locks'] if l['pid'] == writer_pid and l['locktype'] == 'tuple']
    return {'tuplePresent':bool(locks),
        'exactTuple':any(l['database'] == raw['target']['database'] and l['relation'] == raw['target']['relation']
                         and l['page'] == page and l['tuple'] == item for l in locks),
        'exclusiveGranted':any(l['mode'] == 'AccessExclusiveLock' and l['granted'] for l in locks),
        'active':a['state'] == 'active', 'transactionWait':a['wait_event_type'] == 'Lock' and a['wait_event'] == 'transactionid',
        'assignedXid':a['backend_xid'] is not None, 'commitQuery':'cosmifold_commit_metadata' in a['query'],
        'soleHolderBlocker':a['blockers'] == [holder_pid],
        'writerVirtualXids':sorted({l['virtualtransaction'] for l in raw['locks'] if l['pid'] == writer_pid})}


def experiment(pg_bin, output, expect_admission):
    # Remove ALL inherited libpq routing/password/service settings.
    env = {key:value for key,value in os.environ.items() if not key.upper().startswith('PG')}
    env.update(PGCONNECT_TIMEOUT='3', PGAPPNAME='cosmifold-local-locklab', PGCLIENTENCODING='UTF8')
    exe = '.exe' if os.name == 'nt' else ''
    binary = lambda name: pg_bin/(name+exe)
    def run(name, *args, input=None):
        # Windows server children can inherit pg_ctl's captured pipe handles,
        # preventing communicate() from returning after pg_ctl itself exits.
        if name == 'pg_ctl':
            return subprocess.run([str(binary(name)), *map(str,args)],
                stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT,
                check=True, timeout=20, env=env,
                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        return subprocess.run([str(binary(name)), *map(str,args)], input=input, text=True,
            encoding='utf-8', capture_output=True, check=True, timeout=35, env=env,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    version = run('postgres', '--version').stdout.strip()
    if not version.startswith('postgres (PostgreSQL) 15.'):
        raise RuntimeError('PostgreSQL major 15 binaries required; no existing server accepted')
    with output.open('x', encoding='utf-8') as evidence:
        started = time.monotonic()
        def emit(kind, **facts):
            evidence.write(json.dumps({'kind':kind, 'elapsedMs':round((time.monotonic()-started)*1000,3), **facts}, sort_keys=True)+'\n')
            evidence.flush()
        root = Path(tempfile.mkdtemp(prefix='cosmifold-local-locklab-')).resolve()
        data = root/'data'
        sessions = []
        try:
            run('initdb', '-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=C')
            with socket.socket() as sock:
                sock.bind(('127.0.0.1', 0))
                port = sock.getsockname()[1]
            run('pg_ctl', '-D', data, '-l', root/'server.log', '-w', '-t', '10', '-o',
                f"-h 127.0.0.1 -p {port} -c max_connections=12 -c statement_timeout=8000 -c idle_in_transaction_session_timeout=12000", 'start')
            def connect():
                session = LocalSQL(binary('psql'), port, env)
                sessions.append(session)
                return session
            admin = connect()
            identity = admin.query("SELECT jsonb_build_object('dataDirectory',current_setting('data_directory'),'version',current_setting('server_version_num')::int,'pid',pg_backend_pid());")
            if Path(identity['dataDirectory']).resolve() != data.resolve() or not 150000 <= identity['version'] < 160000:
                raise RuntimeError('Isolated cluster identity mismatch; no schema changes allowed')
            emit('isolatedCluster', binaryVersion=version, root=str(root), port=port, identity=identity)
            bootstrap = """CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated;
"""
            migration = (ROOT/'supabase/migrations/202610120001_cloud_metadata.sql').read_text(encoding='utf-8')
            admin.query(bootstrap+migration+f"INSERT INTO auth.users VALUES('{OWNER}','local-only@example.invalid'); SELECT jsonb_build_object('bootstrap',true);")
            for index, assigned in enumerate([False, True], 1):
                universe = f'00000000-0000-4000-8000-{index+10:012d}'
                operation = f'00000000-0000-4000-8000-{index+100:012d}'
                scope = {'ownerUserId':OWNER, 'universeId':universe}
                # Only synthetic UUIDs in this newly initialized, verified cluster.
                metadata = admin.query(auth_sql()+f"SELECT public.cosmifold_create_universe('{universe}'::uuid);")
                admin.query("RESET ROLE; SELECT jsonb_build_object('admin',true);")
                command = {'scope':scope,'operationId':operation,'baseRevision':'0','type':'items.created','payload':{'upsert':{'entries':[
                    {'universe_id':universe,'id':'phase-c-'+universe,'parent_id':None,'parent_id_present':True,
                     'name':'Phase C disposable recovery','ordinal':0,'attributes_json':{}}]}}}
                d = {'scope':scope,'operationId':operation,'metadata0':metadata,'command':command}
                holder, writer, reader = connect(), connect(), connect()
                holder_identity = holder.query(h.holder_sql(d))
                writer_pid = writer.query("SELECT jsonb_build_object('pid',pg_backend_pid());")['pid']
                admin.query("SET default_transaction_read_only=on; SELECT jsonb_build_object('readonly',true);")
                pids = [holder_identity['pid'],writer_pid]
                emit('beforeDispatch', assignedControl=assigned, raw=admin.query(raw_sql(universe,pids)))
                force = 'SELECT pg_current_xact_id();' if assigned else ''  # Local positive control ONLY.
                writer.send('BEGIN;'+auth_sql()+force+f"SELECT public.cosmifold_commit_metadata({h.literal(command)});")
                deadline = time.monotonic()+4
                while True:
                    raw = admin.query(raw_sql(universe,pids))
                    audit = predicate_audit(raw,writer_pid,holder_identity['pid'])
                    emit('awaitingBlock', assignedControl=assigned, raw=raw, predicates=audit)
                    if audit['transactionWait'] and audit['soleHolderBlocker']:
                        break
                    if time.monotonic() >= deadline:
                        raise RuntimeError('Synthetic writer did not reach holder wait')
                    time.sleep(0.02)
                assert all(audit[key] for key in ['tuplePresent','exactTuple','exclusiveGranted','active','transactionWait','commitQuery','soleHolderBlocker'])
                assert audit['assignedXid'] == assigned
                sql = h.probe_sql(d,holder_identity)
                before = admin.query(sql)
                emit('monitorBeforeMissing', assignedControl=assigned, observation=before, sql=sql)
                legacy = admin.query(sql.replace("a.query LIKE '%cosmifold_commit_metadata%'",
                    "a.query LIKE '%cosmifold_commit_metadata%' AND a.backend_xid IS NOT NULL"))
                assert len(legacy['writers']) == int(assigned)
                emit('legacyXidFilterControl', assignedControl=assigned, writerCount=len(legacy['writers']))
                missing = reader.query(auth_sql()+f"SELECT public.cosmifold_operation_receipt({h.literal(scope)},'{operation}'::uuid);")
                assert missing['status'] == 'missing'
                after = admin.query(sql)
                emit('monitorAfterMissing', assignedControl=assigned, observation=after, missing=missing,
                     raw=admin.query(raw_sql(universe,pids)))
                assert before['holderActive'] and before['exactServer'] and before['originalReceiptCount'] == 0
                if expect_admission:
                    assert len(before['writers']) == len(after['writers']) == 1
                    assert h.admission(before,d,holder_identity) == h.admission(after,d,holder_identity)
                    # Execute counterfactual monitor queries against the REAL
                    # blocked writer: no individual guard may silently pass.
                    mutations = {
                        'database':('a.datid=l.database','a.datid<>l.database'),
                        'tuple':("split_part(trim(both '()' from t.ctid::text),',',2)::smallint",
                                 "(split_part(trim(both '()' from t.ctid::text),',',2)::smallint+1)"),
                        'mode':("l.mode='AccessExclusiveLock'","l.mode='ExclusiveLock'"),
                        'granted':("l.mode='AccessExclusiveLock' AND l.granted","l.mode='AccessExclusiveLock' AND NOT l.granted"),
                        'state':("a.state='active'","a.state='idle in transaction'"),
                        'wait':("a.wait_event='transactionid'","a.wait_event='tuple'"),
                        'query':("a.query LIKE '%cosmifold_commit_metadata%'","a.query LIKE '%not_the_commit_rpc%'"),
                        'ownedVirtualTransaction':('v.virtualxid=l.virtualtransaction',"v.virtualxid='0/0'"),
                        'holderXidWait':(f"x.transactionid::text='{holder_identity['xid']}'","x.transactionid::text='0'")}
                    for name,(needle,replacement) in mutations.items():
                        assert needle in sql
                        rejected = admin.query(sql.replace(needle,replacement))
                        assert rejected['writers'] == [], name
                    emit('negativePredicates', assignedControl=assigned, rejected=list(mutations))
                # Without --expect-current-admission this is observation-only
                # for the current monitor, with the legacy exclusion checked.
                holder.query("ROLLBACK; SELECT jsonb_build_object('released',true);")
                ack = writer.receive()
                assert ack['status'] == 'committed' and ack['revision'] == '1' and ack['operationId'] == operation
                emit('afterHolderReleaseBeforeCommit', assignedControl=assigned, ack=ack, raw=admin.query(raw_sql(universe,pids)))
                writer.query("COMMIT; SELECT jsonb_build_object('committed',true);")
                state = admin.query(f"SELECT jsonb_build_object('revision',(SELECT revision FROM cosmifold_private.universes WHERE id='{universe}'), 'receiptCount',(SELECT count(*) FROM cosmifold_private.operation_receipts WHERE universe_id='{universe}'));")
                assert state == {'revision':1,'receiptCount':1}
                emit('afterCommit', assignedControl=assigned, state=state, raw=admin.query(raw_sql(universe,pids)))
                for session in [holder,writer,reader]:
                    session.close()
                    sessions.remove(session)
                admin.query("SET default_transaction_read_only=off; SELECT jsonb_build_object('admin',true);")
            emit('result', passed=True, expectCurrentAdmission=expect_admission)
        except BaseException as error:
            emit('failure', type=type(error).__name__, detail=str(error))
            raise
        finally:
            for session in reversed(sessions):
                session.close()
            # Only the newly created cluster's exact data directory is stopped.
            if (data/'postmaster.pid').exists():
                result = run('pg_ctl', '-D', data, '-m', 'fast', '-w', '-t', '10', 'stop')
                emit('clusterStopped', completed=result.returncode == 0, retainedRoot=str(root))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True, help='NEW JSONL evidence file; existing files refused')
    parser.add_argument('--expect-current-admission', action='store_true')
    args = parser.parse_args()
    experiment(args.pg_bin.resolve(), args.output, args.expect_current_admission)
    print('PASS: isolated PostgreSQL 15 observations retained; own cluster stopped. No live application connections.')


if __name__ == '__main__':
    main()
