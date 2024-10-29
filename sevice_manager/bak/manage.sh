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

    process_ids=($(pgrep -f "$command"))
    for process_id in "${process_ids[@]}"; do
        process_name=$(ps -p $process_id -o comm=)
        command_line=$(ps -p $process_id -o cmd=)
        
        echo "ID: $process_id"
        echo "Name: $process_name"
        echo "Command Line: $command_line"
        echo "---------------------------------"
    done
    
    if [ ${#process_ids[@]} -gt 0 ]; then
        return 0  # 表示应用正在运行
    else
        return 1  # 表示应用未运行
    fi
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
