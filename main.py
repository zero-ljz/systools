
import os, io
from traceback import format_exc
from bottle import Bottle, request, response, template, static_file, redirect, abort
import bottle
from bottle import HTTPError
from gevent.pywsgi import WSGIServer
from geventwebsocket.handler import WebSocketHandler

import web_shell.app as web_shell
import file_explorer.app as file_explorer
import service_manager.app as service_manager
import sysinfo.app as sysinfo
# import importlib
# sysinfo = importlib.import_module("sysinfo.app")

print('main.py Current working directory:', os.getcwd())

# 对 Bottle 框架应用猴子补丁，修复在使用app.mount后URL 路径中的非 ASCII 字符处理问题(路径中出现中文报Invalid path string. Expected UTF-8)
# 参考自：https://stackoverflow.com/questions/23168292/python-bottle-utf8-path-string-invalid-when-using-app-mount
# ---- 1️⃣ 保留原版引用 ----
_original_handle = bottle.Bottle._handle

# ---- 2️⃣ 定义猴子补丁版本 ----
def _patched_handle(self, environ):
    converted = 'bottle.raw_path' in environ
    path = environ['bottle.raw_path'] = environ['PATH_INFO']
    if bottle.py3k and not converted and not environ.get('SCRIPT_NAME'):
        try:
            environ['PATH_INFO'] = path.encode('latin1').decode('utf8')
        except UnicodeError:
            return HTTPError(400, 'Invalid path string. Expected UTF-8')

    # 调用原来的主体逻辑（去掉路径部分的重复逻辑）
    try:
        environ['bottle.app'] = self
        bottle.request.bind(environ)
        bottle.response.bind()

        try:
            self.trigger_hook('before_request')
            route, args = self.router.match(environ)
            environ['route.handle'] = route
            environ['bottle.route'] = route
            environ['route.url_args'] = args
            return route.call(**args)
        finally:
            self.trigger_hook('after_request')

    except bottle.HTTPResponse:
        return bottle._e()
    except bottle.RouteReset:
        route.reset()
        return self._handle(environ)
    except (KeyboardInterrupt, SystemExit, MemoryError):
        raise
    except Exception:
        if not self.catchall:
            raise
        stacktrace = format_exc()
        environ['wsgi.errors'].write(stacktrace)
        return HTTPError(500, "Internal Server Error", bottle._e(), stacktrace)

# ---- 3️⃣ 替换 Bottle 类的 _handle 方法 ----
bottle.Bottle._handle = _patched_handle




app = Bottle()

def echo():
    try:
        body = request.body.read().decode("utf-8") if request.body else ''
    except Exception as e: # body可能是二进制数据
        body = str(e)
    request_line = f'{request.method} {request.path}{(request.query_string or "") and "?" + request.query_string} {request.environ.get("SERVER_PROTOCOL")}'
    headers = '\n'.join([f'{key}: {value}' for key, value in sorted(request.headers.items())])

    print(f'\n\n\n{request_line}\n{headers}\n\n{body}')
app.add_hook('before_request', echo)

app.mount('/web_shell', web_shell.app)
app.mount('/file_explorer', file_explorer.app)
app.mount('/service_manager', service_manager.app)
app.mount('/sysinfo', sysinfo.app)

@app.route('/')
def index():
    return template('''
    <h1>Welcome to SysTools</h1>
    <ul>
        <li><a href="/web_shell">Web Shell</a></li>
        <li><a href="/file_explorer">File Explorer</a></li>
        <li><a href="/service_manager">Service Manager</a></li>
        <li><a href="/sysinfo">System Info</a></li>
    </ul>
    ''')

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Run the server.')
    parser.add_argument('--host', '-H', default='0.0.0.0', help='Host to listen on (default: 0.0.0.0)')
    parser.add_argument('--port', '-p', type=int, default=8000, help='Port to listen on (default: 8000)')
    args = parser.parse_args()

    server = WSGIServer((args.host, args.port), app, handler_class=WebSocketHandler)
    server.serve_forever()