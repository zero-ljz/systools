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

# 存放所有活跃 WebSocket 连接
connected_websockets = set()


class SystemProbeWebSocket:
    def __init__(self, ws, client_ip):
        self.ws = ws
        self.client_ip = client_ip
        self.running = True

    def send_system_info(self):
        try:
            os_name = platform.system()
            release = platform.release()
            version = platform.version()
            machine = platform.machine()
            node = platform.node()

            cpu_info = cpuinfo.get_cpu_info()
            ip_address = socket.gethostbyname(socket.gethostname())
            bits, linkage = platform.architecture()

            cpu_cores = psutil.cpu_count(logical=False)
            cpu_threads = psutil.cpu_count(logical=True)

            while self.running:
                system_info = {
                    "os": os_name,
                    "release": release,
                    "version": version,
                    "machine": machine,
                    "processor": cpu_info.get("brand_raw", "Unknown"),
                    "node": node,
                    "bits": bits,
                    "linkage": linkage,
                    "cpu_usage": psutil.cpu_percent(),
                    "cpu_freq": psutil.cpu_freq().current if psutil.cpu_freq() else 0,
                    "cpu_cores": cpu_cores,
                    "cpu_threads": cpu_threads,
                    "memory": psutil.virtual_memory()._asdict(),
                    "swap": psutil.swap_memory()._asdict(),
                    "disk": psutil.disk_usage("/")._asdict(),
                    "disk_io": psutil.disk_io_counters()._asdict(),
                    "network": psutil.net_io_counters()._asdict(),
                    "load_avg": psutil.getloadavg() if hasattr(psutil, "getloadavg") else (0, 0, 0),
                    "process_count": len(psutil.pids()),
                    "boot_time": int(psutil.boot_time()),
                    "ip_address": ip_address,
                    "tcp4_connection_count": len(psutil.net_connections(kind="tcp4")),
                    "tcp6_connection_count": len(psutil.net_connections(kind="tcp6")),
                    "timestamp": int(time.time()),
                    "current_time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "time_zone": datetime.datetime.now().astimezone().tzinfo.tzname(None),
                }

                json_data = json.dumps(system_info)

                try:
                    self.ws.send(json_data)
                except (WebSocketError, ConnectionResetError, BrokenPipeError) as e:
                    print(f"[{self.client_ip}] WebSocket closed: {e}")
                    break

                gevent.sleep(1)

        finally:
            # 确保清理工作
            self.close()

    def close(self):
        if self.ws in connected_websockets:
            connected_websockets.remove(self.ws)
        if not self.ws.closed:
            try:
                self.ws.close()
            except Exception:
                pass
        self.running = False
        print(f"[{self.client_ip}] Connection cleaned up.")


@app.route("/ws/")
def handle_websocket():
    wsock = request.environ.get("wsgi.websocket")
    if not wsock:
        abort(400, "Expected WebSocket request.")

    client_ip = request.environ.get("REMOTE_ADDR")
    print(f"New WebSocket connection from client: {client_ip}")

    connected_websockets.add(wsock)
    ws_handler = SystemProbeWebSocket(wsock, client_ip)

    try:
        ws_handler.send_system_info()
    finally:
        ws_handler.close()


@app.route("/")
@app.route("/index.html")
def index():
    return static_file("index.html", root=script_dir, mimetype="text/html")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Run the system probe server.")
    parser.add_argument("--host", "-H", default="0.0.0.0", help="Host to listen on (default: 0.0.0.0)")
    parser.add_argument("--port", "-p", type=int, default=8000, help="Port to listen on (default: 8000)")
    args = parser.parse_args()

    print(f"🚀 Starting server on {args.host}:{args.port}")
    try:
        server = WSGIServer((args.host, args.port), app, handler_class=WebSocketHandler)
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n🧹 Shutting down server...")
        # 主动关闭所有连接
        for ws in list(connected_websockets):
            try:
                ws.close()
            except Exception:
                pass
        print("✅ Server stopped cleanly.")


if __name__ == "__main__":
    main()
