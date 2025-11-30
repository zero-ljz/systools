// pages/sysinfo.js
import { PageManager, Toast } from '../app.js';

// --- 配置 ---
const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1) + 'sysinfo/ws/';

// --- 状态管理 ---
let ws = null;
let lastData = {}; // 用于计算速率
let domCache = {}; // DOM 缓存

// --- Page Hook ---
PageManager.registerHooks('sysinfo', {
    onEnter() {
        renderLayout();
        initCache();
        connectWebSocket();
    },
    onLeave() {
        if (ws) {
            ws.close();
            ws = null;
        }
        // 清理缓存引用
        domCache = {};
    }
});

// --- 渲染层 (Bootstrap 5) ---
function renderLayout() {
    const page = document.querySelector('.page[data-page="sysinfo"]');
    if (!page) return;

    page.innerHTML = `
    <style>
        /* 保留 SVG 圆环动画所需的最小 CSS */
        .circular-chart { display: block; margin: 0 auto; max-width: 100%; max-height: 100%; }
        .circle-bg { fill: none; stroke: var(--bs-border-color); stroke-width: 2.5; }
        .circle { fill: none; stroke-width: 2.5; stroke-linecap: round; transition: stroke-dasharray 0.6s ease; }
        .circle.cpu { stroke: var(--bs-primary); }
        .circle.mem { stroke: var(--bs-purple); }
        
        /* 进度条微调 */
        .progress-slim { height: 6px; border-radius: 3px; }
        
        /* 详情行样式 */
        .detail-item { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px dashed var(--bs-border-color); font-size: 0.85rem; }
        .detail-item:last-child { border-bottom: none; }
        
        /* 迷你统计块 */
        .mini-stat { background: var(--bs-tertiary-bg); border-radius: 8px; padding: 10px; text-align: center; height: 100%; transition: background 0.2s; }
        .mini-stat-label { font-size: 0.75rem; color: var(--bs-secondary-color); margin-bottom: 4px; }
        .mini-stat-value { font-size: 1rem; font-weight: 700; color: var(--bs-body-color); }
        .mini-stat-sub { font-size: 0.7rem; color: var(--bs-secondary-color); }
        
        .chart-wrapper { width: 100px; height: 100px; position: relative; flex-shrink: 0; }
    </style>

    <div class="container-fluid p-0">
        <!-- 标题头 -->
        <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
            <div>
                <h4 class="mb-1"><i class="fas fa-tachometer-alt text-primary me-2"></i>系统监控</h4>
                <div class="text-muted small">
                    <span id="node-name" class="fw-bold">连接中...</span> 
                    <span class="badge bg-light text-dark border ms-2" id="os-platform">-</span>
                </div>
            </div>
            <span class="badge bg-secondary" id="ws-status">未连接</span>
        </div>

        <!-- 核心指标 (CPU & RAM/Swap) -->
        <div class="row g-4 mb-4">
            <!-- CPU 卡片 -->
            <div class="col-xl-6">
                <div class="card border-0 shadow-sm h-100">
                    <div class="card-header bg-body border-bottom-0 pt-3">
                        <h6 class="text-muted mb-0"><i class="fas fa-microchip me-2"></i>处理器 (CPU)</h6>
                    </div>
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-4 mb-3">
                            <div class="chart-wrapper">
                                <svg viewBox="0 0 36 36" class="circular-chart">
                                    <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                    <path class="circle cpu" id="cpu-circle" stroke-dasharray="0, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                </svg>
                                <div class="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center fw-bold" id="cpu-val-center">0%</div>
                            </div>
                            <div class="flex-grow-1 min-width-0">
                                <div class="display-6 fw-bold mb-1" id="cpu-val-big">0%</div>
                                <div class="text-truncate text-secondary small mb-2" id="cpu-model" title="CPU 型号">-</div>
                                <div class="d-flex flex-wrap gap-2">
                                    <span class="badge bg-light text-dark border fw-normal">核心: <b id="cpu-cores">-</b></span>
                                    <span class="badge bg-light text-dark border fw-normal">线程: <b id="cpu-threads">-</b></span>
                                    <span class="badge bg-light text-dark border fw-normal">主频: <b id="cpu-freq">-</b></span>
                                </div>
                            </div>
                        </div>
                        <div class="detail-item border-top pt-2 mt-2">
                            <span class="text-secondary">当前进程数</span>
                            <span class="fw-bold"><span id="proc-count">-</span> <span class="small fw-normal text-muted">个</span></span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 内存与交换分区卡片 -->
            <div class="col-xl-6">
                <div class="card border-0 shadow-sm h-100">
                    <div class="card-header bg-body border-bottom-0 pt-3">
                        <h6 class="text-muted mb-0"><i class="fas fa-memory me-2"></i>内存与交换分区</h6>
                    </div>
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-4">
                            <div class="chart-wrapper">
                                <svg viewBox="0 0 36 36" class="circular-chart">
                                    <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                    <path class="circle mem" id="mem-circle" stroke-dasharray="0, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                </svg>
                                <div class="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center fw-bold" id="mem-val-center">0%</div>
                            </div>
                            <div class="flex-grow-1">
                                <!-- RAM -->
                                <div class="d-flex justify-content-between mb-1 small">
                                    <span class="fw-bold">物理内存 (RAM)</span>
                                    <span id="mem-text">0/0 GB</span>
                                </div>
                                <div class="progress progress-slim mb-3">
                                    <div class="progress-bar bg-primary" id="mem-bar" style="width: 0%"></div>
                                </div>
                                
                                <!-- SWAP -->
                                <div class="d-flex justify-content-between mb-1 small">
                                    <span class="fw-bold">交换分区 (Swap)</span>
                                    <span id="swap-text">0/0 GB</span>
                                </div>
                                <div class="progress progress-slim">
                                    <div class="progress-bar bg-purple" style="background-color: #6f42c1;" id="swap-bar" style="width: 0%"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 详细指标 (负载、网络、磁盘、系统) -->
        <div class="row g-4">
            
            <!-- 系统负载与环境 -->
            <div class="col-md-6">
                <div class="card border-0 shadow-sm h-100">
                    <div class="card-header bg-body border-bottom-0 pt-3">
                        <h6 class="text-muted mb-0"><i class="fas fa-server me-2"></i>系统状态</h6>
                    </div>
                    <div class="card-body">
                        <div class="row g-2 mb-3">
                            <div class="col-4">
                                <div class="mini-stat">
                                    <div class="mini-stat-label">负载 (1m)</div>
                                    <div class="badge bg-primary bg-opacity-10 text-primary" id="load-1">-</div>
                                </div>
                            </div>
                            <div class="col-4">
                                <div class="mini-stat">
                                    <div class="mini-stat-label">负载 (5m)</div>
                                    <div class="badge bg-primary bg-opacity-10 text-primary" id="load-5">-</div>
                                </div>
                            </div>
                            <div class="col-4">
                                <div class="mini-stat">
                                    <div class="mini-stat-label">负载 (15m)</div>
                                    <div class="badge bg-primary bg-opacity-10 text-primary" id="load-15">-</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="detail-item">
                            <span class="text-secondary">系统版本</span>
                            <span class="fw-bold text-end" id="os-detail">-</span>
                        </div>
                        <div class="detail-item">
                            <span class="text-secondary">系统架构</span>
                            <span class="fw-bold" id="os-arch">-</span>
                        </div>
                        <div class="detail-item">
                            <span class="text-secondary">运行时间</span>
                            <div class="text-end">
                                <div class="fw-bold" id="uptime">-</div>
                                <div class="mini-stat-sub">启动于: <span id="boot-time-str">-</span></div>
                            </div>
                        </div>
                        <div class="detail-item">
                            <span class="text-secondary">服务器时间</span>
                            <div class="text-end">
                                <div class="fw-bold" id="server-time">-</div>
                                <div class="mini-stat-sub" id="time-zone">-</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 网络 -->
            <div class="col-md-6">
                <div class="card border-0 shadow-sm h-100">
                    <div class="card-header bg-body border-bottom-0 pt-3">
                        <h6 class="text-muted mb-0"><i class="fas fa-network-wired me-2"></i>网络 I/O</h6>
                    </div>
                    <div class="card-body">
                        <div class="row g-2 mb-3">
                            <div class="col-6">
                                <div class="mini-stat">
                                    <div class="mini-stat-label"><i class="fas fa-arrow-down text-success me-1"></i> 下载速率</div>
                                    <div class="mini-stat-value" id="net-rx-speed">0 B/s</div>
                                    <div class="mini-stat-sub" id="net-rx-pps">0 pkts/s</div>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="mini-stat">
                                    <div class="mini-stat-label"><i class="fas fa-arrow-up text-info me-1"></i> 上传速率</div>
                                    <div class="mini-stat-value" id="net-tx-speed">0 B/s</div>
                                    <div class="mini-stat-sub" id="net-tx-pps">0 pkts/s</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="detail-item">
                            <span class="text-secondary">总流量统计</span>
                            <span class="fw-bold">
                                <span class="text-success"><i class="fas fa-arrow-down"></i> <span id="net-rx-total">-</span></span> &nbsp;
                                <span class="text-info"><i class="fas fa-arrow-up"></i> <span id="net-tx-total">-</span></span>
                            </span>
                        </div>
                        <div class="detail-item">
                            <span class="text-secondary">本机 IP</span>
                            <span class="fw-bold text-break" id="ip-addr">-</span>
                        </div>
                        <div class="detail-item">
                            <span class="text-secondary">活动连接数</span>
                            <span class="fw-bold">IPv4: <span id="tcp4-count">0</span> / IPv6: <span id="tcp6-count">0</span></span>
                        </div>
                        <div class="detail-item">
                            <span class="text-secondary">错误 / 丢包</span>
                            <span class="fw-bold" id="net-errors">0</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 磁盘 -->
            <div class="col-12">
                <div class="card border-0 shadow-sm">
                    <div class="card-header bg-body border-bottom-0 pt-3">
                        <h6 class="text-muted mb-0"><i class="fas fa-hdd me-2"></i>磁盘存储与 I/O</h6>
                    </div>
                    <div class="card-body">
                        <div class="row g-4">
                            <!-- 空间使用 -->
                            <div class="col-md-5">
                                <div class="d-flex justify-content-between mb-1 small">
                                    <span>空间使用率</span>
                                    <span class="fw-bold" id="disk-percent-text">0%</span>
                                </div>
                                <div class="progress progress-slim mb-2">
                                    <div class="progress-bar bg-warning" id="disk-bar" style="width: 0%"></div>
                                </div>
                                <div class="d-flex justify-content-between text-muted small">
                                    <span id="disk-used">已用: -</span>
                                    <span id="disk-total">总量: -</span>
                                </div>
                            </div>
                            
                            <!-- I/O 速率 -->
                            <div class="col-md-7 border-start-md ps-md-4">
                                <div class="row g-2">
                                    <div class="col-6">
                                        <div class="mini-stat">
                                            <div class="mini-stat-label">读取速度</div>
                                            <div class="mini-stat-value" id="disk-read-speed">0 B/s</div>
                                            <div class="mini-stat-sub" id="disk-read-iops">0 IOPS</div>
                                        </div>
                                    </div>
                                    <div class="col-6">
                                        <div class="mini-stat">
                                            <div class="mini-stat-label">写入速度</div>
                                            <div class="mini-stat-value" id="disk-write-speed">0 B/s</div>
                                            <div class="mini-stat-sub" id="disk-write-iops">0 IOPS</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="text-end text-muted small mt-2">
                                    总读取: <span id="disk-read-total">-</span> | 总写入: <span id="disk-write-total">-</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    </div>
    `;
}

// --- 逻辑处理 ---

function initCache() {
    const ids = [
        'node-name', 'os-platform', 'ws-status',
        // CPU
        'cpu-circle', 'cpu-val-center', 'cpu-val-big', 'cpu-model', 'cpu-cores', 'cpu-threads', 'cpu-freq', 'proc-count',
        // Memory & Swap
        'mem-circle', 'mem-val-center', 'mem-text', 'mem-bar',
        'swap-text', 'swap-bar',
        // Load & System
        'load-1', 'load-5', 'load-15', 
        'os-detail', 'os-arch', 'uptime', 'boot-time-str', 'server-time', 'time-zone',
        // Network
        'net-rx-speed', 'net-tx-speed', 'net-rx-pps', 'net-tx-pps', 
        'net-rx-total', 'net-tx-total', 'ip-addr', 'tcp4-count', 'tcp6-count', 'net-errors',
        // Disk
        'disk-percent-text', 'disk-bar', 'disk-used', 'disk-total', 
        'disk-read-speed', 'disk-write-speed', 'disk-read-iops', 'disk-write-iops',
        'disk-read-total', 'disk-write-total'
    ];
    ids.forEach(id => domCache[id] = document.getElementById(id));
}

function connectWebSocket() {
    if (ws) ws.close();
    updateStatus('连接中...', 'bg-warning text-dark');
    ws = new WebSocket(WS_URL);
    ws.onopen = () => updateStatus('实时监控', 'bg-success');
    ws.onclose = () => {
        updateStatus('连接断开', 'bg-danger');
        setTimeout(connectWebSocket, 3000);
    };
    ws.onerror = () => updateStatus('连接错误', 'bg-danger');
    ws.onmessage = (event) => {
        try {
            updateDashboard(JSON.parse(event.data));
        } catch (e) {
            console.error('Data Error', e);
        }
    };
}

function updateStatus(text, cls) {
    if(domCache['ws-status']) {
        domCache['ws-status'].textContent = text;
        domCache['ws-status'].className = `badge ${cls}`;
    }
}

function updateDashboard(data) {
    if (!data) return;

    // 1. Header & Node Info
    setText('node-name', data.node);
    setText('os-platform', data.os);

    // 2. CPU
    const cpu = data.cpu_usage || 0;
    if (domCache['cpu-circle']) domCache['cpu-circle'].setAttribute('stroke-dasharray', `${cpu}, 100`);
    setText('cpu-val-center', cpu.toFixed(1) + '%');
    setText('cpu-val-big', cpu.toFixed(1) + '%');
    setText('cpu-model', data.processor);
    setText('cpu-cores', data.cpu_cores);
    setText('cpu-threads', data.cpu_threads); // 逻辑核心数
    setText('cpu-freq', (data.cpu_freq || 0).toFixed(0) + ' MHz');
    setText('proc-count', data.process_count);

    // 3. Memory
    const mem = data.memory || {};
    const memPct = mem.percent || 0;
    if (domCache['mem-circle']) domCache['mem-circle'].setAttribute('stroke-dasharray', `${memPct}, 100`);
    setText('mem-val-center', memPct.toFixed(1) + '%');
    setText('mem-text', `${formatBytes(mem.used)} / ${formatBytes(mem.total)}`);
    if (domCache['mem-bar']) domCache['mem-bar'].style.width = `${memPct}%`;

    // 3.1 Swap
    const swap = data.swap || {};
    const swapPct = swap.percent || 0;
    setText('swap-text', `${formatBytes(swap.used)} / ${formatBytes(swap.total)}`);
    if (domCache['swap-bar']) domCache['swap-bar'].style.width = `${swapPct}%`;

    // 4. Load Average
    if (data.load_avg && data.load_avg.length >= 3) {
        setText('load-1', data.load_avg[0].toFixed(2));
        setText('load-5', data.load_avg[1].toFixed(2));
        setText('load-15', data.load_avg[2].toFixed(2));
    }

    // 5. System Details
    const osVer = `${data.os} ${data.release} ${data.version}`; 
    setText('os-detail', osVer);
    setText('os-arch', `${data.machine} (${data.bits})`);
    
    const uptimeSec = (data.timestamp || 0) - (data.boot_time || 0);
    setText('uptime', formatDuration(uptimeSec));
    setText('boot-time-str', formatDate(data.boot_time)); 
    
    setText('server-time', data.current_time);
    setText('time-zone', data.time_zone);

    // 6. Network
    const net = data.network || {};
    const rxRate = calcDelta('rx_bytes', net.bytes_recv);
    const txRate = calcDelta('tx_bytes', net.bytes_sent);
    const rxPps = calcDelta('rx_pkts', net.packets_recv);
    const txPps = calcDelta('tx_pkts', net.packets_sent);
    const totalErrors = (net.errin || 0) + (net.errout || 0) + (net.dropin || 0) + (net.dropout || 0);

    setText('net-rx-speed', formatBytes(rxRate) + '/s');
    setText('net-tx-speed', formatBytes(txRate) + '/s');
    setText('net-rx-pps', formatNum(rxPps) + ' pkts/s');
    setText('net-tx-pps', formatNum(txPps) + ' pkts/s');
    setText('net-rx-total', formatBytes(net.bytes_recv));
    setText('net-tx-total', formatBytes(net.bytes_sent));
    setText('ip-addr', data.ip_address);
    setText('tcp4-count', data.tcp4_connection_count);
    setText('tcp6-count', data.tcp6_connection_count);
    setText('net-errors', totalErrors > 0 ? `${totalErrors}` : '0');
    if(domCache['net-errors']) {
        if(totalErrors > 0) domCache['net-errors'].classList.add('text-danger');
        else domCache['net-errors'].classList.remove('text-danger');
    }

    // 7. Disk
    const dsk = data.disk || {};
    const dskIo = data.disk_io || {};
    
    setText('disk-percent-text', (dsk.percent || 0) + '%');
    if (domCache['disk-bar']) domCache['disk-bar'].style.width = (dsk.percent || 0) + '%';
    setText('disk-used', formatBytes(dsk.used));
    setText('disk-total', formatBytes(dsk.total));

    const rRate = calcDelta('d_r_b', dskIo.read_bytes);
    const wRate = calcDelta('d_w_b', dskIo.write_bytes);
    const rIops = calcDelta('d_r_c', dskIo.read_count);
    const wIops = calcDelta('d_w_c', dskIo.write_count);

    setText('disk-read-speed', formatBytes(rRate) + '/s');
    setText('disk-write-speed', formatBytes(wRate) + '/s');
    setText('disk-read-iops', formatNum(rIops) + ' IOPS');
    setText('disk-write-iops', formatNum(wIops) + ' IOPS');
    setText('disk-read-total', formatBytes(dskIo.read_bytes));
    setText('disk-write-total', formatBytes(dskIo.write_bytes));
}

// --- 工具函数 ---

function setText(id, val) {
    if (domCache[id]) domCache[id].textContent = (val !== undefined && val !== null) ? val : '-';
}

function calcDelta(key, currentVal) {
    if (currentVal === undefined || currentVal === null) return 0;
    const lastVal = lastData[key]; 
    lastData[key] = currentVal;
    
    if (lastVal === undefined) return 0; 
    let delta = currentVal - lastVal;
    if (delta < 0) delta = 0; 
    return delta;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    if (!bytes) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatNum(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num;
}

function formatDuration(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}天 ${h}小时 ${m}分`;
    return `${h}小时 ${m}分`;
}

function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('zh-CN');
}