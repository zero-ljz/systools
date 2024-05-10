# $Command = "C:\Users\LJZ\AppData\Local\Programs\Python\Python39\python.exe C:\Users\LJZ\repos\cron\app.py"
# Invoke-Expression -Command "Start-Process $Command"

# 启动powershell进程然后powershell再启动子进程，powershell进程被终止后子进程会脱离出来运行
# Start-Process powershell -ArgumentList "-NoExit -NoProfile -ExecutionPolicy Bypass -Command $Command" # -WindowStyle Hidden
# $scriptBlock = [ScriptBlock]::Create($Command)
# Start-Job -ScriptBlock $scriptBlock

# 检查是否存在本地虚拟环境
$VenvPath = Join-Path -Path $PWD -ChildPath ".venv\Scripts\python.exe"
if (Test-Path $VenvPath) {
    $Command = "`"$($VenvPath)`" `"$($PWD.Path)\app.py`""
}
else {
    $Command = "`"$((Get-Command python).Path)`" `"$($PWD.Path)\app.py`""
}

# 检查是否有第二个启动参数
if ($Args.Count -eq 2) {
    $Command = $Args[1]
}

# 命令拆分为路径和参数
$CmdParts = $Command -split ' '
$FilePath = $CmdParts[0]
$ArgumentList = $CmdParts[1..($CmdParts.Length - 1)]

# Write-Host "Command: $Command"
Write-Host

function Find-ProcessByCommandLine {
    param (
        [string] $Command
    )
    # 获取具有特定命令行参数的进程的 PID
    $ProcessIds = (Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like "*$Command*" } | Select-Object -ExpandProperty ProcessId)
    $Processes = @()
    foreach ($ProcessId in $ProcessIds) {
        $Process = Get-WmiObject -Class Win32_Process | Where-Object { $_.ProcessId -eq $ProcessId }
        $Processes += @{Id=$ProcessId; Name=$Process.Name; CommandLine=$Process.CommandLine}
    }
    return @{Processes=$Processes}
}

if ($Args[0] -eq "start") {
    Write-Host "Starting app..."
    Start-Process -FilePath $FilePath -ArgumentList $ArgumentList
    if ($?) {
        Write-Host "App started successfully."
    }
    else {
        Write-Host "Failed to start app."
    }
}
elseif ($Args[0] -eq "stop") {
    Write-Host "Stopping app..."
    $Data = Find-ProcessByCommandLine -command $Command
    foreach ($Process in $Data.Processes) {
        Stop-Process -Id $Process.id -Force
    }
    Write-Host "App stopped."
}
elseif ($Args[0] -eq "restart") {
    Write-Host "Restarting app..."
    $Data = Find-ProcessByCommandLine -command $Command
    foreach ($Process in $Data.Processes) {
        Stop-Process -Id $Process.id -Force
    }
    Start-Process -FilePath $FilePath -ArgumentList $ArgumentList
    if ($?) {
        Write-Host "App restarted successfully."
    }
    else {
        Write-Host "Failed to restart app."
    }
}
elseif ($Args[0] -eq "status") {
    $Data = Find-ProcessByCommandLine -command $Command
    Write-Host $($Data | ConvertTo-Json)
}
else {
    Write-Host "Usage: $($MyInvocation.MyCommand.Name) {start|stop|restart|status}"
    exit 1
}
