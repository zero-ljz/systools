import os
import subprocess
import signal
import sys
import time
import platform

proc = None

def start_app():
    global proc

    script_dir = os.path.dirname(os.path.realpath(__file__))
    app_script = os.path.join(script_dir, 'app.py')

    if proc and proc.poll() is None:
        print("应用已经在运行，PID:", proc.pid)
        return
    
    print("启动应用...")
    proc = subprocess.Popen([sys.executable, app_script], stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.PIPE)
    print("应用已启动，PID:", proc.pid)

def stop_app():
    global proc
    if not proc or proc.poll() is not None:
        print("应用未运行")
        return
    
    print("停止应用...")
    if platform.system() == 'Windows':
        command = f'taskkill /F /PID {proc.pid}'
    elif platform.system() == 'Linux':
        command = f'kill -9 {proc.pid}'
    output = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
    print(output.stdout)

    print("应用已停止，退出码: ", proc.poll())

def check_status():
    global proc
    if proc and proc.poll() is None:
        print("应用正在运行，PID:", proc.pid)
    else:
        print("应用未运行")

def restart_app():
    stop_app()
    time.sleep(1)  # 等待一秒确保应用已经停止
    start_app()

if __name__ == "__main__":
    while True:
        print("\n可用命令:")
        print("1. 启动应用")
        print("2. 停止应用")
        print("3. 查看应用状态")
        print("4. 重启应用")
        print("5. 退出")
        
        choice = input("请输入命令编号: ")
        
        if choice == '1':
            start_app()
        elif choice == '2':
            stop_app()
        elif choice == '3':
            check_status()
        elif choice == '4':
            restart_app()
        elif choice == '5':
            break
        else:
            print("无效的命令，请重新输入")
