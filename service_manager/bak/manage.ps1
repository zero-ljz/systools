# $command = "C:\Users\LJZ\AppData\Local\Programs\Python\Python39\python.exe C:\Users\LJZ\repos\cron\app.py"
# Invoke-Expression -Command "Start-Process $command"

# 启动powershell进程然后powershell再启动子进程，powershell进程被终止后子进程会脱离出来运行
# Start-Process powershell -ArgumentList "-NoExit -NoProfile -ExecutionPolicy Bypass -Command $command" # -WindowStyle Hidden
# $scriptBlock = [ScriptBlock]::Create($command)
# Start-Job -ScriptBlock $scriptBlock

# 检查是否存在本地虚拟环境
$venvPath = Join-Path -Path $PWD -ChildPath ".venv\Scripts\python.exe"
if (Test-Path $venvPath) {
    $command = "`"$($venvPath)`" `"$($PWD.Path)\app.py`""
}
else {
    $command = "`"$((Get-Command python).Path)`" `"$($PWD.Path)\app.py`""
}

# 检查是否有第二个启动参数
if ($args.Count -eq 2) {
    $command = $args[1]
}

# 命令拆分为路径和参数
$cmdParts = $command -split ' '
$FilePath = $cmdParts[0]
$ArgumentList = $cmdParts[1..($cmdParts.Length - 1)]

Write-Host "Command: $command"
Write-Host

function Find-ProcessByCommandLine {
    param (
        [string] $command
    )

    # 获取具有特定命令行参数的进程的 PID
    $processIds = (Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like "*$command*" } | Select-Object -ExpandProperty ProcessId)
    foreach ($processId in $processIds) {
        $process = Get-WmiObject -Class Win32_Process | Where-Object { $_.ProcessId -eq $processId }
        Write-Host "Id: $($processId)"
        Write-Host "Name: $($process.Name)"
        Write-Host "Command Line: $($process.CommandLine)"
        Write-Host "---------------------------------"
    }
    return $processIds
}

if ($args[0] -eq "start") {
    Write-Host "Starting app..."
    Start-Process -FilePath $FilePath -ArgumentList $ArgumentList
    if ($?) {
        Write-Host "App started successfully."
    }
    else {
        Write-Host "Failed to start app."
    }
}
elseif ($args[0] -eq "stop") {
    Write-Host "Stopping app..."
    $processIds = Find-ProcessByCommandLine -command $command
    foreach ($processId in $processIds) {
        Stop-Process -Id $processId -Force
    }
    Write-Host "App stopped."
}
elseif ($args[0] -eq "restart") {
    Write-Host "Restarting app..."
    $processIds = Find-ProcessByCommandLine -command $command
    foreach ($processId in $processIds) {
        Stop-Process -Id $processId -Force
    }
    Start-Process -FilePath $FilePath -ArgumentList $ArgumentList
    if ($?) {
        Write-Host "App restarted successfully."
    }
    else {
        Write-Host "Failed to restart app."
    }
}
elseif ($args[0] -eq "status") {
    $processIds = Find-ProcessByCommandLine -command $command
    if ($processIds) {
        Write-Host "App is running."
    }
    else {
        Write-Host "App is not running."
    }
}
else {
    Write-Host "Usage: $($MyInvocation.MyCommand.Name) {start|stop|restart|status}"
    exit 1
}
