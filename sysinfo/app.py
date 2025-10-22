import datetime
import platform
import json
import socket
import time
import os

import psutil
import cpuinfo
import gevent.monkey
from bottle import Bottle, request, abort, run, static_file
from gevent.pywsgi import WSGIServer
from geventwebsocket.handler import WebSocketHandler
from geventwebsocket.exceptions import WebSocketError

gevent.monkey.patch_all()

script_dir = os.path.dirname(os.path.abspath(__file__))

app = Bottle()

# WebSocket连接集合，用于存储所有已连接的客户端
connected_websockets = set()

# WebSocket处理类
class SystemProbeWebSocket:
    def __init__(self, ws):
        self.ws = ws

    def send_system_info(self):
        os = platform.system()
        release = platform.release()
        version = platform.version()
        machine = platform.machine()
        node = platform.node()

        cpu_info = cpuinfo.get_cpu_info()
        ip_address = socket.gethostbyname(socket.gethostname())
        bits, linkage = platform.architecture()

        cpu_cores = psutil.cpu_count(logical=False)
        cpu_threads = psutil.cpu_count(logical=True)

        while True:
            system_info = {
                "os": os,
                "release": release,
                "version": version,
                "machine": machine,
                "processor": cpu_info['brand_raw'],
                "node": node,
                "bits": bits,
                "linkage": linkage,
                "cpu_usage": psutil.cpu_percent(),
                "cpu_freq": psutil.cpu_freq().current,
                "cpu_cores": cpu_cores,
                "cpu_threads": cpu_threads,
                "memory": psutil.virtual_memory()._asdict(),
                "swap": psutil.swap_memory()._asdict(),
                "disk": psutil.disk_usage('/')._asdict(),
                "disk_io": psutil.disk_io_counters()._asdict(),
                "network": psutil.net_io_counters()._asdict(),
                "load_avg": psutil.getloadavg(),
                "process_count": len(psutil.pids()),
                "boot_time": int(psutil.boot_time()),
                "ip_address": ip_address,
                "tcp4_connection_count": len(psutil.net_connections(kind="tcp4")),
                "tcp6_connection_count": len(psutil.net_connections(kind="tcp6")),
                "timestamp": int(time.time()),
                "current_time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "time_zone": datetime.datetime.now().astimezone().tzinfo.tzname(None),
            }

            # 将系统信息转换为 JSON 字符串
            json_data = json.dumps(system_info)

            try:
                # 将 JSON 字符串发送给客户端
                self.ws.send(json_data)
            except WebSocketError as e:
                print(e)
                break

            # 每秒钟发送一次数据
            gevent.sleep(1)

    def run(self):
        self.send_system_info()

# WebSocket路由，用于接收WebSocket连接
@app.route('/ws/')
def handle_websocket():
    wsock = request.environ.get('wsgi.websocket')
    if not wsock:
        abort(400, 'Expected WebSocket request.')

    # 获取客户端的 IP 地址
    client_ip = request.environ.get('REMOTE_ADDR')
    print(f"New WebSocket connection from client IP: {client_ip}")

    # 创建并启动WebSocket处理类
    ws_handler = SystemProbeWebSocket(wsock)
    ws_handler.run()

@app.route('/')
@app.route('/index.html')
def index():
    return static_file('index.html', root=script_dir, mimetype='text/html')

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Run the server.')
    parser.add_argument('--host', '-H', default='0.0.0.0', help='Host to listen on (default: 0.0.0.0)')
    parser.add_argument('--port', '-p', type=int, default=8000, help='Port to listen on (default: 8000)')
    args = parser.parse_args()

    print(f"Starting server on {args.host}:{args.port}...")
    server = WSGIServer((args.host, args.port), app,
                        handler_class=WebSocketHandler)
    server.serve_forever()

if __name__ == '__main__':
    main()
