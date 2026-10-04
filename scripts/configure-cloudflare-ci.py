#!/usr/bin/env python3
"""Owner-run credential setup: no credential is written to a file or printed."""
import getpass
import json
import re
import subprocess
import sys

REPO = '310709043/focustown-public'
ACCOUNT = '3e2d709ee58392acf40f607ebbbeb974'
DATABASE = '4d9c37d0-0e7a-478d-8373-a314d494a162'
EXPECTED_ACCOUNT = 'Focustown1314@gmail.com'

def cf_request(path, token, payload=None):
    config = f'header = "Authorization: Bearer {token}"\n'
    args = ['curl', '--silent', '--show-error', '--fail-with-body',
        '--connect-timeout', '10', '--max-time', '20', '--config', '-',
        'https://api.cloudflare.com/client/v4' + path]
    if payload is not None:
        args.extend(['--header', 'Content-Type: application/json', '--data', json.dumps(payload)])
    result = subprocess.run(args,
        input=config, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError('Cloudflare validation failed; check token permissions and account.')
    data = json.loads(result.stdout)
    if not data.get('success'):
        raise RuntimeError('Cloudflare rejected the token.')
    return data['result']

def main():
    print('This stores deployment credentials only in GitHub Actions secrets for ' + REPO)
    print('Use the new deployment token from focustown1314@gmail.com, never the old shared token.')
    login = subprocess.check_output(['gh', 'api', 'user', '--jq', '.login'], text=True).strip()
    if login != '310709043':
        raise RuntimeError('GitHub CLI is signed into an unexpected account; sign into the repository owner first.')
    token = getpass.getpass('New Cloudflare deployment token (hidden): ').strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]{20,200}', token):
        raise RuntimeError('Unexpected token format.')
    if cf_request('/user/tokens/verify', token).get('status') != 'active':
        raise RuntimeError('Token is not active.')
    account = cf_request('/accounts/' + ACCOUNT, token)
    if account.get('id') != ACCOUNT or EXPECTED_ACCOUNT.lower() not in account.get('name', '').lower():
        raise RuntimeError('Token does not belong to the expected Focus Town account.')
    # SELECT only: check the D1 query permission required by the migration job
    # before replacing a functioning GitHub deployment token.
    cf_request(f'/accounts/{ACCOUNT}/d1/database/{DATABASE}/query', token, {'sql': 'SELECT 1 AS ok'})
    for key, value in [('CLOUDFLARE_API_TOKEN', token), ('CLOUDFLARE_ACCOUNT_ID', ACCOUNT)]:
        subprocess.run(['gh', 'secret', 'set', key, '--repo', REPO],
            input=value, text=True, check=True)
    print('Both GitHub deployment secrets saved. No token was printed or saved locally.')
    token = None

if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as exc:
        print('Setup did not complete: ' + str(exc), file=sys.stderr)
        sys.exit(1)
