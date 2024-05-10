import sys, os, datetime, time, platform, subprocess, json
import math
import atexit
from types import SimpleNamespace
from bottle import Bottle, request, response, template, static_file, redirect, abort

import fire, psutil

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

    def start(self) -> int | str:
        if self.process and self.process.poll() is None:
            return 'already running'

        if not os.path.exists(f'logs/'):
            os.makedirs(f'logs/')
        self.log_file = open(f'logs/{self.name}.log', 'ab')
        try:
            self.process = subprocess.Popen(
                args=self.cmd, cwd=self.cwd or os.getcwd(),
                stdin=subprocess.PIPE, stdout=self.log_file, stderr=subprocess.PIPE,
                env=self.env, shell=True,
                text=True, encoding='utf-8', errors='ignore',
            )
        except Exception as e:
            self.log_file.close()
            return 'Error: ' + str(e)
        return self.process.pid

    def stop(self):
        if not (self.process and self.process.poll() is None):
            return 'not running'

        try:
            # 终止进程
            self.process.terminate()
            # os.kill(self.process.pid, signal.SIGTERM) # 15
            
            # 等待进程结束（或者可以执行其他任务，不必等待）
            returncode = self.process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            # 强制终止进程
            self.process.kill()
            # os.kill(self.process.pid, signal.SIGKILL) # 9

        self.log_file.close()

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

config_dir = 'services/'
services = {}

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
    for config in configs:
        with open(config["file_path"], "r", encoding="utf-8") as f:
            service = Service(name=config["name"], **json.load(f))
        services[service.name] = service

        if service.is_enabled and not service.process:
            print(f"Starting service: {service.name}")
            print(service.start())

app = Bottle()
load_services()

@app.route('/')
def index():
    return template('services.html', services=services)

@app.route('/start')
def start():
    names = request.query.name.split(',')
    out = ''
    for name in names:
        service = services.get(name)
        if service is None:
            abort(404)
        out += str(service.start()) + '\n'
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
    return service.restart()

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
    print(name)
    if not os.path.isfile(f'logs/{name}.log'):
        abort(404)

    with open(f'logs/{name}.log', 'r', encoding='utf-8', errors='ignore') as f:
        text = f.read()
        
    response.content_type = 'text/plain; charset=UTF-8'
    return text

@app.route('/clear_log')
def clear_log():
    config = os.path.join('services/', request.query.name)
    if not os.path.isfile(config): # 必须是配置文件目录下的文件
        abort(404)
    name = os.path.splitext(os.path.basename(config))[0]
    print(name)
    if not os.path.isfile(f'logs/{name}.log'):
        return '日志文件不存在'

    try:
        os.remove(f'logs/{name}.log')
    except OSError as e:
        return '你需要先停止服务:\n' + str(e)
    return 'OK'

@app.route('/find_process')
def find_process():
    cmd = request.query.cmd
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
        service.stop()

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Run the server.')
    parser.add_argument('--host', '-H', default='0.0.0.0', help='Host to listen on (default: 0.0.0.0)')
    parser.add_argument('--port', '-p', type=int, default=8000, help='Port to listen on (default: 8000)')
    args = parser.parse_args()

    app.run(host=args.host, port=args.port, debug=True, reloader=True, server='cheroot')

