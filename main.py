
import os, io
from bottle import Bottle, request, response, template, static_file, redirect, abort
from gevent.pywsgi import WSGIServer
from geventwebsocket.handler import WebSocketHandler

import web_shell.app as web_shell
import file_explorer.app as file_explorer
import service_manager.app as service_manager
import sysinfo.app as sysinfo

print('main.py Current working directory:', os.getcwd())

app = Bottle()

def echo():
    body = request.body.read().decode("utf-8") if request.body else ''
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