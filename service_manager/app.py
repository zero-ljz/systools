import locale
from pathlib import Path
import re
import sys, os, datetime, time, platform, subprocess, json
import math
import atexit
from types import SimpleNamespace
from bottle import Bottle, request, response, template, static_file, redirect, abort, Response
import signal

import fire, psutil

import threading

import tracemalloc
tracemalloc.start()

app = Bottle()

config_dir = 'services/'
services = {}


def monitor_process(proc, cleanup_fn):
    proc.wait() # 阻塞等待进程结束
    print(f"Process PID: {proc.pid} has exited with return code: {proc.returncode}")
    cleanup_fn()

def start_config(file_path, name):
    with open(file_path, "r", encoding="utf-8") as f:
        service = Service(name=name, **json.load(f))
    services[service.name] = service

    if service.is_enabled and not service.process:
        try:
            pid = service.start()
            msg = f"{service.name} Started with pid: {str(pid)}"
        except RuntimeError as e:
            msg = f"{service.name} Service failed: {str(e)}"
        print(msg)

def load_services():
    configs = [
        {"file_path": file_path, "stat": stat, "name": name, "filename": filename}
        for filename in os.listdir(config_dir) 
        if (
            os.path.isfile(file_path := os.path.join(config_dir, filename)) 
            and (stat := os.stat(file_path)) 
            and (name := os.path.splitext(os.path.basename(filename))[0])
        )
    ]
    # print(f"Found {len(configs)} service configurations.\n\n")
    for config in configs:
        start_config(file_path=config["file_path"], name=config["name"])

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
        completed_process = subprocess.run(['pgrep', '-f', command], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
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

        if not os.path.exists('logs/'):
            os.makedirs('logs/')
        try:
            self.log_file = open(f'logs/{self.name}.log', 'ab')
            cmd_splits = split_with_quotes(self.cmd, sep=' ')
            # print(f"Starting service {self.name} with command:", cmd_splits, "in cwd:", self.cwd)
            self.process = subprocess.Popen(
                args=cmd_splits, cwd=self.cwd or os.getcwd(),
                stdin=subprocess.PIPE, stdout=self.log_file, stderr=subprocess.PIPE, # 运行python脚本时必须在其代码顶部加上sys.stdout.reconfigure(line_buffering=True) 或者用python.exe -u运行才能实时输出日志
                env=self.env, 
                shell=False, # shell=True，它会让系统用 shell 去解析命令，比如：Windows 下：cmd.exe /c "python my_script.py --arg value"  Linux/Mac 下：/bin/sh -c "python my_script.py --arg value"
                text=True, encoding='utf-8', errors='ignore',
            )
            
            # 后台线程监控进程退出，清理资源
            threading.Thread(target=monitor_process, args=(self.process, self.clean_up), daemon=True).start()
        except Exception as e:                
            raise RuntimeError(f"Error starting service '{self.name}': {str(e)}")
        
        # 读取一行输出，确认进程已启动
        # time.sleep(0.5)
        if self.process.poll() is not None:
            stderr = self.process.stderr.read() if self.process.stderr else ''
            self.clean_up()
            raise RuntimeError(f"Failed to start service '{self.name}'. Return code: {self.process.returncode}. Error: {stderr}")
        else:
            return self.process.pid

    def stop(self):
        if not (self.process and self.process.poll() is None):
            return 'not running'

        try:
            # 终止进程
            self.process.terminate()
            # os.kill(self.process.pid, signal.SIGTERM) # 15
            
            # 等待进程结束（或者可以执行其他任务，不必等待）
            returncode = self.process.wait(timeout=5)
            
            # if self.log_file and not self.log_file.closed:
            #     self.log_file.close()
        except subprocess.TimeoutExpired:
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

@app.route('/')
def index():
    return template('services.html', services=services)

@app.route('/test_start', method=['GET', 'POST'])
def test_start():
    cmd = request.query.cmd or ''
    cwd = request.query.cwd or Path(os.path.expanduser('~')).as_posix() or os.getcwd()
    
    # 创建临时配置文件
    config = os.path.join('services/', 'test.json')
    with open(config, 'w', encoding='utf-8') as f:
        f.write('''\
{
    "cmd": "''' + cmd + '''",
    "cwd": "''' + cwd + '''",
    "env": {},
    "is_enabled": 1
}''')
    start_config(config, 'test')
    redirect('/log_view?name=test.json')
    

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
        out += msg + '\n'
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

    config = os.path.join('services/', name)
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

        load_services()
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
    config = os.path.join('services/', request.query.name)
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

    load_services()
    return 'OK'

@app.route('/log')
def log():
    config = os.path.join('services/', request.query.name)
    if not os.path.isfile(config): # 必须是配置文件目录下的文件
        abort(404)
    name = os.path.splitext(os.path.basename(config))[0]
    offset = int(request.query.offset or 0)
    
    if not os.path.isfile(f'logs/{name}.log'):
        abort(404)

    with open(f'logs/{name}.log', 'rb') as f:
        f.seek(offset)
        data = f.read()
        
    response.content_type = 'text/plain; charset=UTF-8'
    response.headers['X-Next-Offset'] = str(offset + len(data))  # 客户端下次从这里开始读
    return data.decode(encoding=locale.getpreferredencoding(False), errors='ignore')

@app.route('/log_view')
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
                const res = await fetch(`/log?name=${name}&offset=${offset}`);
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
    config = os.path.join('services/', request.query.name)
    if not os.path.isfile(config): # 必须是配置文件目录下的文件
        abort(404)
    name = os.path.splitext(os.path.basename(config))[0]
    if not os.path.isfile(f'logs/{name}.log'):
        return '日志文件不存在'

    try:
        # os.remove(f'logs/{name}.log')
        with open(f'logs/{name}.log', 'w') as f: # 直接覆盖写入空内容
            pass  # 或 f.truncate(0)
    except OSError as e:
        return '你需要先停止服务:\n' + str(e)
    return 'OK'

@app.route('/find_process')
def find_process():
    cmd = request.query.cmd_line
    if cmd.isdecimal() and int(cmd) > 0:
        pid_list = [int(cmd)]
    else:
        pid_list = find_process_by_command(cmd)

    # print(pid_list)
    psutil_processes = []
    for pid in pid_list:
        try:
            psutil_processes.append(psutil.Process(pid))
        except psutil.NoSuchProcess:
            pass
    processes = list(map(lambda p: SimpleNamespace(**{
        'pid': p.pid,
        'name': p.name(),
        'cmdline': p.cmdline(),
        'cwd': p.cwd(),
        'status': p.status(),
        'num_threads': p.num_threads(),
        'exe': p.exe(),
        'username': p.username(),
        'create_time': datetime.datetime.fromtimestamp(p.create_time()).strftime("%Y-%m-%d %H:%M:%S"),
        'memory_percent': format_bytes(psutil.virtual_memory().total * 0.01 * p.memory_percent()),
    }), psutil_processes))
    return template('processes.html', processes=processes)

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

if __name__ == "__main__":
    load_services()
    
    import argparse
    parser = argparse.ArgumentParser(description='Run the development server.')
    parser.add_argument('--host', '-H', default='0.0.0.0', help='Host to listen on (default: 0.0.0.0)')
    parser.add_argument('--port', '-p', type=int, default=8000, help='Port to listen on (default: 8000)')
    args = parser.parse_args()

    app.run(host=args.host, port=args.port, debug=True, server='cheroot')
