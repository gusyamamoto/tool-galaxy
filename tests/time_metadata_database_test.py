"""Time migration integration against a NEW temporary loopback-only cluster.

Requires --pg-bin; never accepts a DSN, existing data directory, or service.
Does not apply anything to Supabase or a running local database.
"""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
PG_BIN=None
OWNER='00000000-0000-4000-8000-000000000001'
UNIVERSE='00000000-0000-4000-8000-000000000011'


def literal(value):
    text=json.dumps(value,separators=(',',':'))
    assert '$time$' not in text
    return '$time$'+text+'$time$::jsonb'


class TimeMetadataDatabaseTests(unittest.TestCase):
    @classmethod
    def run_binary(cls,name,*args,input=None):
        result=subprocess.run([str(PG_BIN/(name+('.exe' if os.name=='nt' else ''))),*map(str,args)],
            input=input,text=True,encoding='utf-8',env=cls.env,timeout=45,
            stdout=subprocess.DEVNULL if name=='pg_ctl' else subprocess.PIPE,
            stderr=subprocess.STDOUT if name=='pg_ctl' else subprocess.PIPE,
            creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        if result.returncode:raise RuntimeError(f'{name} failed: {result.stderr}')
        return result

    @classmethod
    def sql(cls,text):
        result=cls.run_binary('psql','-X','-w','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1',
            '-p',cls.port,'-U','postgres','-d','postgres',input=text)
        return result.stdout.strip()

    @classmethod
    def setUpClass(cls):
        if PG_BIN is None:raise unittest.SkipTest('Pass --pg-bin with a complete PostgreSQL server installation for isolated SQL tests.')
        cls.env={key:value for key,value in os.environ.items() if not key.upper().startswith('PG')}
        cls.env.update(PGCONNECT_TIMEOUT='3',PGAPPNAME='cosmifold-time-isolated-test',PGCLIENTENCODING='UTF8')
        cls.temp=tempfile.TemporaryDirectory(prefix='cosmifold-time-postgres-')
        cls.addClassCleanup(cls.temp.cleanup)
        cls.root=Path(cls.temp.name).resolve();cls.data=cls.root/'data'
        cls.run_binary('initdb','-D',cls.data,'-U','postgres','-A','trust','--encoding=UTF8','--locale=C')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0));cls.port=sock.getsockname()[1]
        cls.addClassCleanup(lambda:cls.run_binary('pg_ctl','-D',cls.data,'-m','fast','-w','-t','15','stop') if (cls.data/'postmaster.pid').exists() else None)
        cls.run_binary('pg_ctl','-D',cls.data,'-l',cls.root/'server.log','-w','-t','15','-o',
            f'-h 127.0.0.1 -p {cls.port} -c max_connections=10 -c statement_timeout=12000','start')
        identity=cls.sql("select current_setting('data_directory')")
        if Path(identity).resolve()!=cls.data.resolve():raise RuntimeError('Temporary cluster identity mismatch')
        cls.sql('''CREATE ROLE anon; CREATE ROLE authenticated;
            CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
            CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
            $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
            GRANT USAGE ON SCHEMA auth TO anon,authenticated;''')
        for migration in ['202610120001_cloud_metadata.sql','202610130001_cloud_metadata_rpc_grants.sql','202610250001_time_metadata.sql']:
            cls.sql((ROOT/'supabase/migrations'/migration).read_text(encoding='utf-8'))

    def test_existing_cloud_database_regression_suite(self):
        self.sql((ROOT/'tests/database/cloud-metadata.sql').read_text(encoding='utf-8'))

    def test_strict_calendar_and_attribute_vectors_as_authenticated(self):
        def when(start='2026-11-12',end=None,time=None):return {'startDate':start,'endDate':end,'time':time}
        def due(date='2026-10-29',time=None):return {'date':date,'time':time}
        valid=[{}, {'when':None},{'due':None},{'when':when()},{'when':when('2000-02-29')},
            {'when':when('2028-02-29',time='00:00')},{'when':when('0001-01-01','9999-12-31')},
            {'when':when('2026-11-12','2026-11-12')},{'due':due()},{'due':due(time='23:59')},
            {'taskList':True},{'completed':False,'due':due()},{'when':when(),'due':due()}]
        invalid=[{'when':{}},{'due':{}},{'when':[]},{'due':'2026-10-29'},
            {'when':when('2026-11-25','2026-11-12')},{'when':when('2026-11-12','2026-11-25','14:30')},
            {'taskList':True,'when':when()},{'taskList':True,'due':due()},{'taskList':1},{'completed':'true'},
            {'when':dict(when(),extra=True)},{'due':dict(due(),extra=True)}]
        for date in ['0000-01-01','2026-02-29','1900-02-29','2026-04-31','2026-13-01','2026-00-01','2026-01-32','2026-01-00','2026-1-01','2026-01-01T00:00:00Z',None,123]:
            invalid.extend([{'when':when(date)},{'due':due(date)}])
            if date is not None:invalid.append({'when':when(end=date)})
        for clock in ['24:00','23:60','2:30','14:30:00','14:30Z',{},123]:
            invalid.extend([{'when':when(time=clock)},{'due':due(time=clock)}])
        vectors=[(value,True) for value in valid]+[(value,False) for value in invalid]
        results=self.sql('SET ROLE authenticated;SELECT jsonb_build_array('+','.join(
            'cosmifold_private.valid_attributes('+literal(value)+')' for value,_ in vectors)+');')
        self.assertEqual(json.loads(results),[expected for _,expected in vectors])
        print(f'{len(vectors)} authenticated SQL temporal validation vectors passed',flush=True)

    def test_rpc_roundtrip_replay_and_invalid_date_rollback(self):
        scope={'ownerUserId':OWNER,'universeId':UNIVERSE}
        attributes=[{'when':{'startDate':'2026-11-12','endDate':'2026-11-25','time':None}},
            {'taskList':True},{'completed':False,'due':{'date':'2026-10-29','time':'23:59'}}]
        rows=[dict(universe_id=UNIVERSE,id=str(i),parent_id=None if i==0 else str(i-1),
            parent_id_present=True,name=f'Item {i}',ordinal=i,attributes_json=value) for i,value in enumerate(attributes)]
        command={'scope':scope,'operationId':'00000000-0000-4000-8000-000000000021','baseRevision':'0',
            'type':'content.changed','payload':{'upsert':{'entries':rows}}}
        invalid=json.loads(json.dumps(command));invalid['operationId']='00000000-0000-4000-8000-000000000022';invalid['baseRevision']='1'
        invalid['payload']['upsert']['entries'][2]['attributes_json']['due']['date']='2026-02-29'
        sql=f'''BEGIN;
            INSERT INTO auth.users VALUES('{OWNER}','time-test@example.invalid');
            SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='{OWNER}';
            SELECT public.cosmifold_create_universe('{UNIVERSE}');
            SELECT public.cosmifold_commit_metadata({literal(command)});
            SELECT public.cosmifold_commit_metadata({literal(command)});
            DO $$ BEGIN
                BEGIN
                    PERFORM public.cosmifold_commit_metadata({literal(invalid)});
                    RAISE EXCEPTION 'Invalid time unexpectedly accepted';
                EXCEPTION WHEN SQLSTATE 'CM005' THEN NULL; END;
            END; $$;
            SELECT public.cosmifold_read_universe({literal(scope)});
            SELECT count(*) FROM cosmifold_private.operation_receipts WHERE universe_id='{UNIVERSE}';
            ROLLBACK;'''
        output=self.sql(sql).splitlines()
        ack=json.loads(output[1]);replay=json.loads(output[2]);result=json.loads(output[3])
        self.assertEqual(ack['revision'],'1');self.assertTrue(replay['replayed']);self.assertEqual(replay['revision'],'1')
        self.assertEqual(result['metadata']['universe']['revision'],'1')
        self.assertEqual([row['attributes_json'] for row in result['metadata']['entries']],attributes)
        self.assertEqual(output[4],'1','invalid temporal patch must not leave a receipt or revision')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--pg-bin',type=Path,required=True)
    args,remaining=parser.parse_known_args();PG_BIN=args.pg_bin.resolve()
    unittest.main(argv=[__file__,*remaining])
