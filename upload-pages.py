"""Upload already-built static assets with a short-lived Pages upload JWT."""
import base64
import hashlib
import json
import mimetypes
from pathlib import Path
import sys
import urllib.request

root = Path(sys.argv[1])
token = sys.stdin.read().strip()
assets, manifest = [], {}
for file in sorted(root.rglob('*')):
    if not file.is_file():
        continue
    data = file.read_bytes()
    key = hashlib.sha256(data).hexdigest()[:32]
    manifest['/' + file.relative_to(root).as_posix()] = key
    content_type = mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
    if file.suffix in ('.mjs', '.js'):
        content_type = 'application/javascript'
    assets.append(dict(base64=True, key=key, value=base64.b64encode(data).decode(), metadata=dict(contentType=content_type)))

for start in range(0, len(assets), 50):
    body = json.dumps(assets[start:start + 50]).encode()
    request = urllib.request.Request('https://api.cloudflare.com/client/v4/pages/assets/upload', body,
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(request, timeout=60) as response:
        result = json.load(response)
    if not result.get('success'):
        raise RuntimeError(str(result.get('errors')))
    print(f'Uploaded {min(start + 50, len(assets))}/{len(assets)} assets', flush=True)
Path('.pages-manifest.json').write_text(json.dumps(manifest))
