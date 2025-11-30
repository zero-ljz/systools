import locale
from pathlib import Path
import re
import sys, os, datetime, time, platform, subprocess, json
import math
import atexit
from types import SimpleNamespace
from bottle import Bottle, request, response, template, static_file, redirect, abort, Response, url
import signal

import fire, psutil

import threading

import tracemalloc
tracemalloc.start()

script_dir = os.path.dirname(os.path.abspath(__file__))

app = Bottle()

config_dir = (Path(script_dir) / 'services').as_posix() + '/'
log_dir = (Path(script_dir) / 'logs').as_posix() + '/'
services = {}


def monitor_process(proc, cleanup_fn):
    proc.wait() # 阻塞等待进程结束
    print(f"Process PID: {proc.pid} has exited with return code: {proc.returncode}")
    cleanup_fn()

def init_service(file_path, name, always_start=False):
    '''
    根据服务的配置文件创建/更新服务对象并启动服务。
    服务从未启动过才启动, 不启动已经停止的服务
    '''
    with open(file_path, "r", encoding="utf-8") as f:
        config = json.load(f)
    
    if name in services:
        service = services[name]
        service.cmd = config["cmd"]
        service.cwd = config.get("cwd") or os.path.expanduser('~')
        service.env = os.environ.copy()
        service.env.update(config.get("env", {}))
        service.is_enabled = config["is_enabled"]
    else:
        service = Service(name=name, **config)
        services[name] = service

    if service.is_enabled and (not service.process or always_start):
        try:
            pid = service.start()
            msg = f"{service.name} Started with pid: {str(pid)}"
        except RuntimeError as e:
            msg = f"{service.name} Service failed: {str(e)}"
        print(msg)
        return msg

def load_configs():
    configs = [
        {"file_path": file_path, "stat": stat, "name": name, "filename": filename}
        for filename in os.listdir(config_dir) 
        if (
            os.path.isfile(file_path := os.path.join(config_dir, filename)) 
            and (stat := os.stat(file_path)) 
            and (name := os.path.splitext(os.path.basename(filename))[0])
        )
    ]
    print(f"Found {len(configs)} service configurations.\n\n")
    for config in configs:
        init_service(file_path=config["file_path"], name=config["name"])

def format_bytes(bytes):
    sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    if bytes == 0:
        return '0 Byte'
    
    # 计算要使用的单位
    i = int(math.floor(math.log(bytes, 1024)))
    # 使用 pow 计算对应单位的除数
    size = pow(1024, i)
    # 将字节数转换为相应的单位
    formatted_size = bytes / size
    
    # 将结果格式化为两位小数，并附加相应单位
    return f"{formatted_size:.2f} {sizes[i]}"

def find_process_by_command(command) -> list[int]:
    pid_list = []
    if platform.system() == 'Windows':
        completed_process = subprocess.run(['powershell', '-Command', "Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*" + command + "*' } | Select-Object -ExpandProperty ProcessId"], capture_output=True, text=True)
    elif platform.system() == 'Linux':
        completed_process = subprocess.run(['pgrep', '-f', command], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) # requires procps package
    if completed_process.returncode == 0 and completed_process.stdout:
        pid_list = list(map(int, completed_process.stdout.strip().split('\n')))
    return pid_list

def terminate_process_by_pid(pid):
    if platform.system() == 'Windows':
        command = f'taskkill /F /PID {pid}'
    elif platform.system() == 'Linux':
        command = f'kill -9 {pid}'
    try:
        output = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        return output.stdout.strip()
    except subprocess.CalledProcessError as e:
        return f"Error: {e.stderr.strip()}"

def split_with_quotes(string, sep='/'):
    parts = re.findall(r'(?:".*?"|[^' + sep + r'"]+)', string)
    return [part.strip('"') for part in parts]

class Service:
    def __init__(self, name, cmd, cwd, env, is_enabled):
        self.name = name
        self.cmd = cmd
        self.cwd = cwd or os.path.expanduser('~')

        self.env = os.environ.copy()
        if env:
            self.env.update(env)

        self.is_enabled = is_enabled
        self.process = None

    def start(self) -> int:
        if self.process and self.process.poll() is None:
            raise RuntimeError(f"Service '{self.name}' is already running")

        if not os.path.exists(log_dir):
            os.makedirs(log_dir)
        try:
            self.log_file = open(f'{log_dir}{self.name}.log', 'ab')
            cmd_splits = split_with_quotes(self.cmd, sep=' ')
            # print(f"Starting service {self.name} with command:", cmd_splits, "in cwd:", self.cwd)
            self.process = subprocess.Popen(
                args=cmd_splits, cwd=self.cwd or os.getcwd(),
                stdin=subprocess.PIPE, stdout=self.log_file, stderr=self.log_file, # 运行python脚本时必须在其代码顶部加上sys.stdout.reconfigure(line_buffering=True) 或者用python.exe -u运行才能实时输出日志
                env=self.env, # win下传空字典会报winerror87
                shell=False, # shell=True，它会让系统用 shell 去解析命令，比如：Windows 下：cmd.exe /c "python my_script.py --arg value"  Linux/Mac 下：/bin/sh -c "python my_script.py --arg value"
                text=True, encoding='utf-8', errors='ignore',
            )
            
            # 后台线程监控进程退出，清理资源
            threading.Thread(target=monitor_process, args=(self.process, self.clean_up), daemon=True).start()
        except Exception as e:                
            raise RuntimeError(f"{str(e)}")
        return self.process.pid

    def stop(self):
        if not (self.process and self.process.poll() is None):
            return self.name + ' not running'

        try:
            # 终止进程
            self.process.terminate()
            # os.kill(self.process.pid, signal.SIGTERM) # 15
            
            # 等待进程结束（或者可以执行其他任务，不必等待）
            returncode = self.process.wait(timeout=5)
            
        except subprocess.TimeoutExpired:
            print(f"Process PID: {self.process.pid} has not exited within 5 seconds, terminating it forcefully...")
            # 强制终止进程
            self.process.kill()
            # os.kill(self.process.pid, signal.SIGKILL) # 9
        finally:
            # 清理资源
            self.clean_up()

    def restart(self) -> int | str:
        self.stop()
        return self.start()

    def status(self) -> str:
        if self.process:
            if self.process.poll() is None:
                return 'running, pid: {}'.format(self.process.pid)
            else:
                return f'stopped, return code: {self.process.returncode}'
        else:
            return 'not started'
        
    def clean_up(self):
        print(f"Cleaning up service {self.name}")
        if self.log_file and not self.log_file.closed:
            self.log_file.close()
        for stream in [self.process.stdin, self.process.stdout, self.process.stderr]:
            if stream and not stream.closed:
                try:
                    stream.close()
                except Exception:
                    pass

@app.route('/services')
def get_services():
    response.content_type = 'application/json'
    service_statuses = {
        name: {
            "name": name,
            "cmd": service.cmd,
            "cwd": service.cwd,
            "enabled": service.is_enabled,
            "status": service.status(),
        }
        for name, service in services.items()
    }
    return json.dumps(service_statuses, ensure_ascii=False, indent=2)


@app.route('/test_start', method=['GET', 'POST'])
def test_start():
    cmd = request.query.cmd or ''
    cwd = request.query.cwd or Path(os.path.expanduser('~')).as_posix() or os.getcwd()
    print('Test start command:', cmd, 'in cwd:', cwd)
    # 创建临时配置文件
    config = os.path.join(config_dir, 'test.json')
    data = {
        "cmd": cmd,
        "cwd": cwd,
        "env": {},
        "is_enabled": 1
    }
    with open(config, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)

    out = init_service(config, 'test', always_start=True)
    return (f'''\
        <html>
        <head><title>Test Start Result - redirecting...</title></head>
        <meta http-equiv="refresh" content="0.1;url={app.get_url('log_view') + '?name=test.json'}">
        <body>
        <script>
        alert("{out}");
        </script>
        </body>
        </html>
        ''')

@app.route('/start')
def start():
    names = request.query.name.split(',')
    out = ''
    for name in names:
        service = services.get(name)
        if service is None:
            abort(404)
        try:
            pid = service.start()
            msg = f"{service.name} Started with pid: {str(pid)}"
        except RuntimeError as e:
            msg = f"{service.name} Service failed: {str(e)}"
        out += msg + '\n\n'
        out = out[:-1] if out.endswith('\n') else out
    print(out)
    return out

@app.route('/stop')
def stop():
    names = request.query.name.split(',')
    out = ''
    for name in names:
        service = services.get(name)
        if service is None:
            abort(404)
        out += str(service.stop()) + '\n'
    return out

@app.route('/restart')
def restart():
    name = request.query.name
    service = services.get(name)
    if service is None:
        abort(404)
    try:
        pid = service.restart()
        msg = f"{service.name} Started with pid: {str(pid)}"
    except RuntimeError as e:
        msg = f"{service.name} Service failed: {str(e)}"
    print(msg)
    return msg

@app.route('/update', method=['GET', 'POST'])
def update():
    name = request.query.name
    if not name.endswith('.json') or name.strip() == '.json':
        abort(400, 'Invalid service name')

    config = os.path.join(config_dir, name)
    if not os.path.isfile(config):
        with open(config, 'w', encoding='utf-8') as f: # 不存在时创建空的配置文件
            f.write('''\
{
    "cmd": "",
    "cwd": "",
    "env": {},
    "is_enabled": 1
}''')

    if request.method == 'POST':
        text = request.forms.text.replace('\r\n', '\n')
        
        with open(config, 'w', encoding='utf-8') as f:
            f.write(text)

        load_configs()
        return '保存成功，请重启服务'
    
    with open(config, 'r', encoding='utf-8') as f:
        text = f.read()

    return ('''\
<form action="" method="post" onsubmit="event.submitter.disabled = true; fetch(this.action, { method: this.method, body: new FormData(this)}).then(response => response.text()).then(text => { alert(text); event.submitter.disabled = false; }); return false;">'''
+ f'''\
<label for="text">配置文件: {config}</label><br/>
<textarea id="text" name="text" cols="60" rows="40" onchange="'''
+ '''\
try { this.value = JSON.stringify(JSON.parse(this.value), null, 4) } catch (error) { alert('格式错误: ' + error); }'''
+ f'''\
" required>{text}</textarea><br/>
<input type="submit" value="保存"/>
</form>''')

@app.route('/delete')
def delete():
    config = os.path.join(config_dir, request.query.name)
    if not os.path.isfile(config):
        abort(404)
    name = os.path.splitext(os.path.basename(config))[0]
    try:
        os.remove(config)
    except OSError as e:
        abort(500, f'Error: {str(e)}')

    if name in services:
        services[name].stop()
        services.pop(name)
    return 'OK'

@app.route('/log')
def log():
    config = os.path.join(config_dir, request.query.name)
    if not os.path.isfile(config): # 必须是配置文件目录下的文件
        abort(404)
    name = os.path.splitext(os.path.basename(config))[0]
    offset = int(request.query.offset or 0)
    
    if not os.path.isfile(f'{log_dir}{name}.log'):
        abort(404)

    with open(f'{log_dir}{name}.log', 'rb') as f:
        f.seek(offset)
        data = f.read()
        
    response.content_type = 'text/plain; charset=UTF-8'
    response.headers['X-Next-Offset'] = str(offset + len(data))  # 客户端下次从这里开始读
    return data.decode(encoding=locale.getpreferredencoding(False), errors='ignore')

@app.route('/log_view', name='log_view')
def log_view():
    return '''
        <html>
        <head><title></title></head>
        <body style="font-family:monospace;background:gray;color:#eee;">
        <pre id="log" style=""></pre>
        <script>
        const name = new URLSearchParams(location.search).get("name");
        if (name) {
        document.title = "日志查看 - " + name;
        }
        const logElem = document.getElementById("log");
        let offset = 0;

        async function fetchLog() {
            try {
                baseUrl = '/' + window.location.pathname.replace(/\/+$/, '').split('/').slice(1, -1).join('/');
                if (baseUrl=='/') baseUrl = '';
                const res = await fetch(`${baseUrl}/log?name=${name}&offset=${offset}`);
                const text = await res.text();
                if (text) {
                    logElem.textContent += text;
                    window.scrollTo(0, document.body.scrollHeight);
                }
                const nextOffset = res.headers.get("X-Next-Offset");
                if (nextOffset) offset = parseInt(nextOffset);
            } catch (e) {
                logElem.textContent += "\\n[读取失败] " + e;
            }
        }
        setInterval(fetchLog, 1000);
        fetchLog();
        </script>
        </body>
        </html>
    '''

@app.route('/clear_log')
def clear_log():
    config = os.path.join(config_dir, request.query.name)
    if not os.path.isfile(config): # 必须是配置文件目录下的文件
        abort(404)
    name = os.path.splitext(os.path.basename(config))[0]
    if not os.path.isfile(f'{log_dir}{name}.log'):
        return '日志文件不存在'

    try:
        # os.remove(f'{log_dir}{name}.log')
        with open(f'{log_dir}{name}.log', 'w') as f: # 直接覆盖写入空内容
            pass  # 或 f.truncate(0)
    except OSError as e:
        return '你需要先停止服务:\n' + str(e)
    return 'OK'

def safe_process_info(p):
    try:
        return SimpleNamespace(**{
            'pid': p.pid,
            'name': p.name(),
            'cmdline': p.cmdline(),
            'cwd': p.cwd(),
            'status': p.status(),
            'num_threads': p.num_threads(),
            'exe': p.exe(),
            'username': p.username(),
            'create_time': datetime.datetime.fromtimestamp(p.create_time()).strftime("%Y-%m-%d %H:%M:%S"),
            'memory_usage': format_bytes(p.memory_info().rss),
        })
    except (psutil.AccessDenied, psutil.ZombieProcess, psutil.NoSuchProcess):
        return None

@app.route('/processes')
def search_process():
    cmd = request.query.cmd_line
    if cmd.isdecimal() and int(cmd) > 0:
        pid_list = [int(cmd)]
    else:
        pid_list = find_process_by_command(cmd)

    psutil_processes = []
    for pid in pid_list:
        try:
            psutil_processes.append(psutil.Process(pid))
        except psutil.NoSuchProcess:
            pass

    processes = list(filter(None, map(safe_process_info, psutil_processes)))

    response.content_type = 'application/json'
    return json.dumps([vars(p) for p in processes], ensure_ascii=False, indent=2)

@app.route('/terminate_process')
def terminate_process():
    pids = request.query.pid.split(',')
    out = ''
    for pid in pids:
        out += terminate_process_by_pid(pid) + '\n\n'
    return out

@atexit.register
def on_exit():
    # 停止所有服务
    for i, (name, service) in enumerate(services.items()):
        print(f"Stopping service {i+1}/{len(services)}: {service.name}")
        service.stop()

load_configs()

if __name__ == "__main__":
    
    import argparse
    parser = argparse.ArgumentParser(description='Run the development server.')
    parser.add_argument('--host', '-H', default='0.0.0.0', help='Host to listen on (default: 0.0.0.0)')
    parser.add_argument('--port', '-p', type=int, default=8000, help='Port to listen on (default: 8000)')
    args = parser.parse_args()

    app.run(host=args.host, port=args.port, debug=True, server='cheroot')
