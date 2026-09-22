"""Probe a built production image using a disposable container and volume.

The probe talks directly to the container HTTP port and explicitly replays its
Secure cookie. Browser deployments must terminate HTTPS in front of madoc.
"""
import argparse
import http.cookiejar
import json
import subprocess
import time
import urllib.request
import uuid

suffix = uuid.uuid4().hex[:10]
volume = 'madoc-release-' + suffix
name = 'madoc-release-' + suffix
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('image', help='Locally built madoc image tag or digest')
image = parser.parse_args().image


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True).strip()


def request(path, data=None, headers=None):
    req = urllib.request.Request(
        base + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers={
            'Content-Type': 'application/json',
            'Cookie': '; '.join(c.name + '=' + c.value for c in jar),
            **(headers or {}),
        },
    )
    with opener.open(req, timeout=5) as response:
        return json.load(response)


def start():
    global base, opener, jar
    docker('run', '--rm', '-d', '--name', name, '-p', '127.0.0.1::3000', '-v', volume + ':/data', image)
    port = json.loads(docker('inspect', name))[0]['NetworkSettings']['Ports']['3000/tcp'][0]['HostPort']
    base = 'http://127.0.0.1:' + port
    # Direct container probe explicitly replays Secure cookies; real production browsers require HTTPS.
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    for _ in range(100):
        try:
            request('/healthz')
            return
        except Exception:
            time.sleep(0.1)
    raise RuntimeError('container health timeout')


docker('volume', 'create', volume)
try:
    start()
    assert request('/api/setup/status')['initialized'] is False
    credentials = {'email': 'release@example.test', 'password': 'release-test-password'}
    session = request('/api/setup/admin', {'name': 'Release test', **credentials})
    headers = {'Origin': base, 'x-madoc-csrf-token': session['csrfToken']}
    workspace = request('/api/workspaces', {'name': 'Persisted release workspace'}, headers)
    assert docker('exec', name, 'stat', '-c', '%a', '/data/server.secret') == '600'
    secret_before = docker('exec', name, 'sha256sum', '/data/server.secret').split()[0]
    docker('stop', name)
    start()
    assert request('/api/setup/status')['initialized'] is True
    request('/api/auth/sign-in', credentials)
    workspaces = request('/api/workspaces')
    assert any(w['id'] == workspace['id'] for w in workspaces)
    assert docker('exec', name, 'sha256sum', '/data/server.secret').split()[0] == secret_before
    print('PASS: Docker fresh setup, health, volume recreation persistence, login and secret mode/stability')
finally:
    subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    docker('volume', 'rm', volume)
