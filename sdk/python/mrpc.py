"""
mRPC Client — Python SDK

Usage:
    from mrpc import mRPC

    api = mRPC('http://localhost:8088/api.php')
    result = api.call('get_products', state='active')
    print(result['data'])
"""

import json
import time
import urllib.request
import urllib.error


class mRPC:
    """mRPC/1.0 Python Client"""

    def __init__(self, endpoint: str, token: str = None, timeout: int = 30):
        self.endpoint = endpoint
        self.token = token
        self.timeout = timeout
        self.version = 'mRPC/1.0'

    def call(self, cmd: str, **params) -> dict:
        """Вызвать команду.

        Args:
            cmd: Имя команды
            **params: Параметры команды

        Returns:
            dict с ответом сервера
        """
        body = {'cmd': cmd, **params}
        data = json.dumps(body).encode('utf-8')

        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        req = urllib.request.Request(
            self.endpoint,
            data=data,
            headers=headers,
            method='POST'
        )

        start = time.time()
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return json.loads(res.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            try:
                body = json.loads(e.read().decode('utf-8'))
                return body
            except Exception:
                return {
                    'ok': False,
                    'cmd': cmd,
                    'error': {'code': 'http', 'message': f'HTTP {e.code}: {e.reason}'},
                    'v': self.version,
                    'ms': round((time.time() - start) * 1000, 2)
                }
        except Exception as e:
            return {
                'ok': False,
                'cmd': cmd,
                'error': {'code': 'network', 'message': str(e)},
                'v': self.version,
                'ms': round((time.time() - start) * 1000, 2)
            }

    def help(self) -> dict:
        """Получить список команд."""
        return self.call('help')

    def describe(self, command: str) -> dict:
        """Описание конкретной команды."""
        return self.call('describe', command=command)

    def ping(self) -> dict:
        """Health check."""
        return self.call('ping')

    def login(self, email: str, password: str) -> dict:
        """Авторизация. Сохраняет токен если успешно."""
        res = self.call('auth_login', email=email, password=password)
        if res.get('ok') and res.get('data', {}).get('token'):
            self.token = res['data']['token']
        return res

    def set_token(self, token: str) -> 'mRPC':
        """Установить токен."""
        self.token = token
        return self


if __name__ == '__main__':
    import sys
    endpoint = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8088/api.php'
    api = mRPC(endpoint)
    result = api.ping()
    print(json.dumps(result, indent=2, ensure_ascii=False))
