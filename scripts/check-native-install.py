#!/usr/bin/env python3
"""Install and discover a generated package with a real CLI in a disposable home.

No model request or credentials are needed. Missing CLIs skip locally; CI uses
--require to make absence a failure. Install/runtime errors always fail.
"""
import argparse
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import subprocess
import tempfile
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('host', choices=['codex', 'claude'])
parser.add_argument('--cli', help='Path to the native CLI')
parser.add_argument('--require', action='store_true')
args = parser.parse_args()
cli = shutil.which(args.cli or args.host)
if not cli:
    print(f'{"FAIL" if args.require else "SKIP"}: {args.host} CLI unavailable')
    raise SystemExit(1 if args.require else 0)
root = Path(__file__).resolve().parent.parent
host = 'codex' if args.host == 'codex' else 'claude-code'
source = root / 'harness/pstack' / host
manifest = '.agents/plugins/marketplace.json' if args.host == 'codex' else '.claude-plugin/marketplace.json'
market = json.loads((root / manifest).read_text())
plugin_id = 'pstack@' + market['name']
expected = {p.parent.name for p in (source / 'skills').glob('*/SKILL.md')}
expected_agents = {p.stem for p in (source / 'agents').glob('*.md')}


def inventory(directory):
    return {str(p.relative_to(directory)): (p.read_bytes(), bool(p.stat().st_mode & 0o111))
            for p in directory.rglob('*') if p.is_file()}


with tempfile.TemporaryDirectory(prefix='pstack-native-') as temp:
    temp = Path(temp)
    home = temp / 'home'
    home.mkdir()
    (home / ".codex").mkdir()
    (home / ".claude").mkdir()
    marketplace = temp / 'marketplace'
    (marketplace / manifest).parent.mkdir(parents=True)
    (marketplace / manifest).write_text(json.dumps(market))
    shutil.copytree(source, marketplace / 'harness/pstack' / host)
    env = dict(os.environ, HOME=str(home), CODEX_HOME=str(home / '.codex'),
               CLAUDE_CONFIG_DIR=str(home / '.claude'), NO_COLOR='1')
    for key in ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']:
        env.pop(key, None)

    def run(*command):
        result = subprocess.run([cli, *command], env=env, cwd=temp, text=True,
                                capture_output=True, timeout=120)
        if result.returncode:
            raise RuntimeError(f'{command}: {result.stdout}\n{result.stderr}')
        return result.stdout

    version = run('--version').strip()
    if args.host == 'claude':
        run('plugin', 'validate', str(marketplace / 'harness/pstack' / host))
        run('plugin', 'marketplace', 'add', str(marketplace))
        run('plugin', 'install', plugin_id)
        details = run('plugin', 'details', plugin_id)
        for label, names in [('Skills', expected), ('Agents', expected_agents)]:
            match = re.search(rf'{label} \((\d+)\)\s+([^\n]+)', details)
            assert match, details
            assert int(match[1]) == len(names), details
            assert set(match[2].strip().split(', ')) == names, details
        installed = json.loads((home / '.claude/plugins/installed_plugins.json').read_text())
        cache = Path(installed['plugins'][plugin_id][0]['installPath'])
    else:
        run('plugin', 'marketplace', 'add', str(marketplace), '--json')
        run('plugin', 'add', plugin_id, '--json')
        with (temp / 'app-server.stderr').open('w') as errors:
            child = subprocess.Popen([cli, 'app-server'], env=env, cwd=temp,
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=errors)
            selector = selectors.DefaultSelector()
            selector.register(child.stdout, selectors.EVENT_READ)
            buffered = bytearray()

            def send(message):
                child.stdin.write((json.dumps(message) + '\n').encode())
                child.stdin.flush()

            def response(request_id):
                deadline = time.monotonic() + 40
                while time.monotonic() < deadline:
                    if b'\n' not in buffered:
                        if not selector.select(timeout=1):
                            continue
                        chunk = os.read(child.stdout.fileno(), 65536)
                        if not chunk:
                            raise RuntimeError('app-server closed stdout')
                        buffered.extend(chunk)
                        continue
                    line, _, remaining = buffered.partition(b'\n')
                    buffered[:] = remaining
                    message = json.loads(line)
                    if message.get('id') == request_id:
                        assert 'error' not in message, message
                        return message['result']
                raise TimeoutError(f'app-server request {request_id}')

            try:
                send({'id': 1, 'method': 'initialize', 'params': {
                    'clientInfo': {'name': 'pstack-install-check', 'version': '1.0'}}})
                response(1)
                send({'method': 'initialized', 'params': {}})
                send({'id': 2, 'method': 'skills/list', 'params': {
                    'cwds': [str(temp)], 'forceReload': True}})
                entries = response(2)['data']
                assert all(not entry.get('errors') for entry in entries), entries
                skills = [s for entry in entries for s in entry['skills'] if s.get('pluginId') == plugin_id]
                assert {s['name'] for s in skills} == {'pstack:' + name for name in expected}
                assert all(s['enabled'] for s in skills)
                cache = Path(next(s['path'] for s in skills if s['name'] == 'pstack:poteto-mode')).parents[2]
            finally:
                child.terminate()
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
                selector.close()
                child.stdin.close()
                child.stdout.close()
    assert cache.is_relative_to(home), cache
    actual, wanted = inventory(cache), inventory(source)
    mismatches = sorted(name for name in actual.keys() | wanted.keys() if actual.get(name) != wanted.get(name))
    assert not mismatches, f'Installed files or executable bits differ: {mismatches}'
    print(json.dumps({'host': args.host, 'cli': version, 'skills': len(expected),
                      'installed_files_verified': len(inventory(cache)), 'result': 'PASS'}))
