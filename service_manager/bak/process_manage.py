import sys, os, platform, subprocess
import fire, psutil

def find_process_by_command(command) -> list[int] | None:
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

if __name__ == '__main__':
    fire.Fire()
    
    # script_dir = os.path.dirname(os.path.realpath(__file__))
    # app_script = os.path.join(script_dir, 'app.py')
    # cmd = '"' + sys.executable + '" "' + app_script + '"'
    # print(cmd)

    # pid = find_process_by_command(cmd)
    # print(pid)

    # if pid:
    #     pass
    #     print(terminate_process_by_pid(pid))












    # pid = find_process_by_command(r'"C:\Users\LJZ\AppData\Local\Programs\Python\Python39\python.exe" "C:\Users\LJZ\repos\cron\app.py"')
    pid = find_process_by_command(r'"C:\Users\LJZ\AppData\Local\Programs\Python\Python39\python.exe" "api.py"')
    print(pid)