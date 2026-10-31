"""Alpha notes over synthetic HTTP, including an independent browser context.

Reuses the interruption suite's disposable artifact/profile and HTTPS blocking.
No live Supabase, SQL, beta storage, deployment artifact or new framework.
"""
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import time
import unittest

spec=importlib.util.spec_from_file_location('alpha_http_fixture',Path(__file__).with_name('travel_alpha_inflight_browser.py'))
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
h=fixture.h


class NotesBrowser(unittest.TestCase):
    setUp=fixture.NativeAlpha.setUp
    stop_browser=fixture.NativeAlpha.stop_browser
    wait=fixture.NativeAlpha.wait

    def prepare(self):
        h.evaluate(self.writer,"document.getElementById('alpha-entry-cancel').click()")

    def peer(self):
        # A second actual process/profile keeps Auth/cache storage independent;
        # page-target CDP connections cannot create browser contexts on all Chrome versions.
        with socket.socket() as available:
            available.bind(('127.0.0.1',0));port=available.getsockname()[1]
        startup={}
        if os.name=='nt':
            info=subprocess.STARTUPINFO();info.dwFlags|=subprocess.STARTF_USESHOWWINDOW;info.wShowWindow=subprocess.SW_HIDE
            startup['startupinfo']=info
        process=subprocess.Popen([h.native.transport.find_browser(),'--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
            '--remote-debugging-address=127.0.0.1',f'--remote-debugging-port={port}',
            '--user-data-dir='+str(self.root/'peer-profile'),'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,**startup)
        def stop():
            if process.poll() is None:process.terminate();process.wait(timeout=8)
        self.addCleanup(stop)
        deadline=time.monotonic()+12
        while True:
            try:
                page=next(p for p in h.native.discover_pages(port) if p['type']=='page')
                break
            except (OSError,StopIteration):
                self.assertLess(time.monotonic(),deadline,'Independent browser startup timed out')
                time.sleep(.05)
        peer=h.AlphaCDP(page['webSocketDebuggerUrl']);self.addCleanup(peer.sock.close)
        peer.call('Network.enable');peer.call('Network.setBlockedURLs',urls=['https://*'])
        peer.call('Page.navigate',url=self.origin+'/')
        self.wait(lambda:h.evaluate(peer,"typeof travelAlpha!=='undefined'&&alphaAuth.getState().ready&&!!travelAlpha.getState().user"))
        self.assertEqual(h.evaluate(peer,'localStorage.length'),0)
        self.open(peer)
        return peer

    def open(self,client):
        h.evaluate(client,"document.getElementById('alpha-refresh').click()")
        self.wait(lambda:h.evaluate(client,"travelAlpha.getState().status==='universes-available'"))
        h.evaluate(client,"document.querySelector('#alpha-datasets button').click()")
        self.wait(lambda:h.evaluate(client,"travelAlpha.getState().writeStatus==='saved'&&!travelAlpha.getState().readOnly"))
        h.evaluate(client,"document.querySelector('.entry-node[data-entry-id=child]').click()")

    def save(self,client,text):
        h.evaluate(client,"document.getElementById('alpha-edit-notes').click();document.getElementById('alpha-notes-input').value="+
            json.dumps(text)+";document.getElementById('alpha-notes-form').requestSubmit()")

    def saved(self,client):
        self.wait(lambda:h.evaluate(client,"travelAlpha.getState().writeStatus==='saved'&&!document.getElementById('alpha-notes-dialog').open"))

    def test_notes_survive_refresh_and_independent_authenticated_context(self):
        self.prepare()
        text='  Private trip notes\nCheck-in 🧳\n<img src=x onerror=alert(1)>  '
        self.save(self.writer,text);self.saved(self.writer)
        self.assertEqual(h.evaluate(self.writer,"document.getElementById('alpha-notes-text').textContent"),text)
        self.assertFalse(h.evaluate(self.writer,"!!document.querySelector('#alpha-notes-text img')"))
        self.writer.call('Page.reload',ignoreCache=True)
        self.wait(lambda:h.evaluate(self.writer,"typeof travelAlpha!=='undefined'&&alphaAuth.getState().ready&&!!travelAlpha.getState().user"))
        self.open(self.writer)
        self.assertEqual(h.evaluate(self.writer,"document.getElementById('alpha-notes-text').textContent"),text)
        peer=self.peer()
        self.assertEqual(h.evaluate(peer,"document.getElementById('alpha-notes-text').textContent"),text)
        self.assertEqual(self.server.metadata['universe']['revision'],'4')
        self.assertEqual(sum(name=='cosmifold_commit_metadata' for name,_ in self.server.calls),1)
        self.assertEqual(h.evaluate(self.writer,"localStorage.getItem('galaxy:user-data')"),'BETA_SENTINEL')

    def test_stale_notes_fail_without_overwrite_and_explicit_reload_recovers(self):
        self.prepare();peer=self.peer()
        self.save(self.writer,'Winning note');self.saved(self.writer)
        self.save(peer,'Stale note')
        self.wait(lambda:h.evaluate(peer,"travelAlpha.getState().writeStatus==='failed'&&travelAlpha.getState().readOnly"))
        self.assertTrue(h.evaluate(peer,"document.getElementById('alpha-notes-save').disabled&&document.getElementById('alpha-notes-input').disabled"))
        self.assertEqual(self.server.metadata['entries'][1]['attributes_json']['content']['notes']['text'],'Winning note')
        self.assertEqual(self.server.metadata['universe']['revision'],'4')
        self.assertEqual(len(self.server.receipts),1)
        h.evaluate(peer,"document.getElementById('alpha-notes-cancel').click();document.getElementById('alpha-reload').click()")
        self.wait(lambda:h.evaluate(peer,"travelAlpha.getState().writeStatus==='saved'&&!travelAlpha.getState().readOnly"))
        h.evaluate(peer,"document.querySelector('.entry-node[data-entry-id=child]').click()")
        self.assertEqual(h.evaluate(peer,"document.getElementById('alpha-notes-text').textContent"),'Winning note')
        self.assertEqual(sum(name=='cosmifold_commit_metadata' for name,_ in self.server.calls),2)


if __name__=='__main__':unittest.main()
