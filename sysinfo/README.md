# 跨平台系统探针

``` bash
# 克隆代码 && 进入项目目录
git clone https://github.com/zero-ljz/sysinfo.git && cd sysinfo

# 创建虚拟环境和安装依赖
python3 -m venv .venv
$(pwd)/.venv/bin/python3 -m pip install -r requirements.txt
# 或者 (python 11+)
apt install python3-bottle python3-gevent-websocket python3-py-cpuinfo python3-psutil

# 启动服务器并在后台运行
nohup $(pwd)/.venv/bin/python3 $(pwd)/app.py --port 8000 &

# 终止运行
pkill -f "$(pwd)/.venv/bin/python3 $(pwd)/app.py"
```

**使用说明**  
* index.html文件支持直接在本地用浏览器打开  
* 支持在一个页面查看多台服务器
* 访问静态文件时可以从url的参数中传入多个服务器的url  
http://127.0.0.1:8000/?urls=ws://your_host1:8000/ws/,ws://your_host2:8000/ws/

**Alpine 系统需要使用以下命令安装依赖**   
`pip3 install bottle==0.12.25 gevent-websocket py-cpuinfo==9.0.0 && apk add py3-psutil`  

bash fast.sh create_service sysinfo "python3 app.py --port 8100" "/root/repos/sysinfo/" \
&& systemctl enable sysinfo && systemctl start sysinfo