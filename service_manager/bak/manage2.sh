#!/bin/bash

# 检查是否存在本地虚拟环境
if [ -f "$(pwd)/.venv/bin/python3" ]; then
    command="$(pwd)/.venv/bin/python3 $(pwd)/app.py"
else
    command="$(command -v python3) $(pwd)/app.py"
fi

if [ $# -ge 2 ]; then
    command="$2"
fi

logfile="$(pwd)/app.log"

find_process_by_command_line() {
    local command="$1"
    
    # 使用 pgrep 查找具有特定命令行参数的进程的 PID
    # 使用 -f 选项匹配整个命令行
    process_ids=$(pgrep -f "$command")
    
    # 如果找不到进程，输出提示信息并返回
    if [ -z "$process_ids" ]; then
        echo "No process found with command line: $command"
        return
    fi
    
    # 使用 ps 命令获取进程的详细信息
    processes=()
    while read -r process_id; do
        # 使用 ps 命令获取进程信息
        process_info=$(ps -p "$process_id" -o pid= -o comm= -o args=)
        
        # 将进程信息添加到数组中
        processes+=("$process_info")
    done <<< "$process_ids"
    
    # 输出进程信息
    echo "Processes:"
    for process in "${processes[@]}"; do
        echo "$process"
    done
}




if [ "$1" == "start" ]; then
    echo "Starting app..."
    nohup $command >> "$logfile" 2>&1 &
    if [ $? -eq 0 ]; then
        echo "App started successfully."
    else
        echo "Failed to start app."
    fi
elif [ "$1" == "stop" ]; then
    echo "Stopping app..."
    find_process_by_command_line "$command"
    pkill -f "$command"
    echo "App stopped."
elif [ "$1" == "restart" ]; then
    echo "Restarting app..."
    find_process_by_command_line "$command"
    pkill -f "$command"
    nohup $command >> "$logfile" 2>&1 &
    if [ $? -eq 0 ]; then
        echo "App restarted successfully."
    else
        echo "Failed to restart app."
    fi
elif [ "$1" == "status" ]; then
    find_process_by_command_line "$command"
    if pgrep -f "$command" > /dev/null; then
        echo "App is running."
    else
        echo "App is not running."
    fi
else
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
fi
