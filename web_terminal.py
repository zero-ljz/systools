import asyncio
import logging
import threading
import json
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from winpty import PtyProcess

# 尽可能减少 Python 自身的日志打印 I/O 带来的延迟
logging.basicConfig(level=logging.WARNING)

app = FastAPI()

class TurboPty:
    def __init__(self):
        self.pty = None
        self.running = False
        self.loop = None
        self.output_queue = asyncio.Queue()

    def start(self, cols=120, rows=30):
        # 技巧：使用 powershell 而不是 cmd，现代 powershell 的 I/O 管道性能略好
        # 且支持更多类 Linux 的快捷键
        self.pty = PtyProcess.spawn("powershell.exe", dimensions=(rows, cols))
        self.running = True
        self.loop = asyncio.get_running_loop()
        
        # 启动后台“真空”读取线程
        threading.Thread(target=self._reader_thread, daemon=True).start()

    def _reader_thread(self):
        """后台线程，纯阻塞读取，零 CPU 空转"""
        while self.running and self.pty.isalive():
            try:
                # 稍微增大单次读取 buffer，应对大量刷屏
                data = self.pty.read(8192)
                if data:
                    self.loop.call_soon_threadsafe(self.output_queue.put_nowait, data)
                else:
                    break
            except:
                break
        self.loop.call_soon_threadsafe(self.output_queue.put_nowait, None)

    def write(self, data):
        if self.pty.isalive():
            self.pty.write(data)

    def resize(self, cols, rows):
        if self.pty.isalive():
            self.pty.set_winsize(rows, cols)

    def stop(self):
        self.running = False
        if self.pty:
            self.pty.terminate()

@app.get("/")
async def get():
    return HTMLResponse(html_content)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    pty = TurboPty()
    pty.start()

    async def sender():
        """发送循环：从 Queue 取数据发给前端"""
        try:
            while True:
                data = await pty.output_queue.get()
                if data is None: break
                
                # --- 后端 Nagle 算法 (合并发送) ---
                # 如果队列里堆积了数据，一次性拼起来发，大幅减少网络帧数
                if not pty.output_queue.empty():
                    parts = [data]
                    # 贪婪获取，最多取 100 个包
                    for _ in range(100):
                        if pty.output_queue.empty(): break
                        item = pty.output_queue.get_nowait()
                        if item is None: break
                        parts.append(item)
                    data = "".join(parts)
                # --------------------------------
                
                await websocket.send_text(data)
        except: pass

    async def receiver():
        """接收循环"""
        try:
            while True:
                data = await websocket.receive_text()
                if data.startswith('{"type":"resize"'):
                    try:
                        obj = json.loads(data)
                        pty.resize(obj["cols"], obj["rows"])
                    except: pass
                    continue
                
                pty.write(data)
        except: pass

    try:
        await asyncio.wait(
            [asyncio.create_task(sender()), asyncio.create_task(receiver())],
            return_when=asyncio.FIRST_COMPLETED
        )
    finally:
        pty.stop()

html_content = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>High Speed Terminal</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css" />
    <style>body { background: #000; margin: 0; height: 100vh; overflow: hidden; }</style>
</head>
<body>
    <div id="terminal" style="width:100%;height:100%"></div>
    
    <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xterm-addon-webgl@0.16.0/lib/xterm-addon-webgl.js"></script>

    <script>
        const term = new Terminal({
            cursorBlink: true,
            fontSize: 15,
            fontFamily: 'Consolas, monospace',
            scrollback: 9999,
            windowsMode: true, // 关键：针对 Windows 的优化
            theme: { background: '#000000', foreground: '#cccccc' }
        });

        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        term.open(document.getElementById('terminal'));

        // 尝试开启 WebGL 加速，极大降低浏览器渲染延迟
        try {
            const webgl = new WebglAddon.WebglAddon();
            term.loadAddon(webgl);
        } catch(e) { console.log("WebGL not supported"); }

        fitAddon.fit();

        const ws = new WebSocket(`ws://${location.host}/ws`);
        
        ws.onopen = () => {
            term.focus();
            setTimeout(() => {
                const dims = fitAddon.proposeDimensions();
                ws.send(JSON.stringify({type:"resize", cols:dims.cols, rows:dims.rows}));
            }, 200);
        };
        ws.onmessage = e => term.write(e.data);

        // --- 核心优化：前端输入去抖动/聚合 ---
        let buf = "";
        let timer = null;
        
        term.onData(data => {
            if(ws.readyState !== 1) return;
            
            buf += data;
            if(timer) return; // 已经在排队了，不处理
            
            // 延迟 6ms 发送。
            // 效果：如果你 100ms 内按了 10 次退格，
            // 可能会被合并成 2-3 个网络包发送，而不是 10 个。
            // 这对后端 WinPty 的处理压力是指数级的降低。
            timer = setTimeout(() => {
                ws.send(buf);
                buf = "";
                timer = null;
            }, 6);
        });
        // --------------------------------

        window.addEventListener('resize', () => {
             fitAddon.fit();
             const dims = fitAddon.proposeDimensions();
             if(ws.readyState===1) ws.send(JSON.stringify({type:"resize", cols:dims.cols, rows:dims.rows}));
        });
    </script>
</body>
</html>
"""

if __name__ == "__main__":
    # 使用 0.0.0.0 允许局域网访问
    print("Running optimized terminal...")
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="error")