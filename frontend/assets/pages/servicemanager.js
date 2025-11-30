// pages/servicemanager.js
import { PageManager, Toast } from '../app.js';

// --- 配置 ---
const BASE_URL = location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1) + 'service_manager/';

// --- 状态 ---
let state = {
    services: {},
    processes: [],
    loading: false,
    processModalInstance: null
};

// --- API ---
const API = {
    getServices: () => fetch(`${BASE_URL}services`).then(res => res.json()),
    startService: (names) => fetch(`${BASE_URL}start?name=${encodeURIComponent(names)}`),
    stopService: (names) => fetch(`${BASE_URL}stop?name=${encodeURIComponent(names)}`),
    deleteService: (name) => fetch(`${BASE_URL}delete?name=${encodeURIComponent(name)}`),
    clearLog: (name) => fetch(`${BASE_URL}clear_log?name=${encodeURIComponent(name)}`),
    getProcesses: (cmd) => fetch(`${BASE_URL}processes` + (cmd ? `?cmd_line=${encodeURIComponent(cmd)}` : '')).then(res => res.json()),
    terminateProcess: (pids) => fetch(`${BASE_URL}terminate_process?pid=${encodeURIComponent(pids)}`),
    testStart: (formData) => {
        const query = new URLSearchParams(formData).toString();
        return fetch(`${BASE_URL}test_start?${query}`); 
    }
};

// --- Page Hook ---
PageManager.registerHooks('servicemanager', {
    onEnter() {
        renderLayout();
        bindEvents();
        loadServices();
    },
    onLeave() {
        if (state.processModalInstance) {
            state.processModalInstance.dispose();
            state.processModalInstance = null;
        }
    }
});

// --- 渲染层 ---

function renderLayout() {
    const page = document.querySelector('.page[data-page="servicemanager"]');
    if (!page) return;

    page.innerHTML = `
    <style>
        /* 呼吸灯动画 */
        @keyframes pulse-green {
            0% { box-shadow: 0 0 0 0 rgba(25, 135, 84, 0.4); }
            70% { box-shadow: 0 0 0 6px rgba(25, 135, 84, 0); }
            100% { box-shadow: 0 0 0 0 rgba(25, 135, 84, 0); }
        }
        .status-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 8px; }
        .dot-running { background-color: #198754; animation: pulse-green 2s infinite; }
        .dot-stopped { background-color: #6c757d; opacity: 0.5; }

        /* 卡片样式优化 */
        .service-card { transition: all 0.2s; border: 1px solid var(--bs-border-color); }
        .service-card:hover { transform: translateY(-3px); box-shadow: 0 .5rem 1rem rgba(0,0,0,.08) !important; border-color: var(--bs-primary); }
        
        /* 侧边栏固定 */
        .sticky-tools { position: sticky; top: 1.5rem; z-index: 900; }

        /* 进程表格代码块 */
        .cmd-code { 
            background: var(--bs-tertiary-bg); 
            padding: 2px 6px; 
            border-radius: 4px; 
            font-family: var(--bs-font-monospace); 
            font-size: 0.85em; 
            color: var(--bs-body-color);
            display: block;
            max-width: 300px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            cursor: pointer;
        }
        .cmd-code:hover { background: var(--bs-secondary-bg); color: var(--bs-primary); }
        
        /* 统计块 */
        .stat-box { border-left: 4px solid transparent; }
        .stat-box.running { border-left-color: #198754; }
        .stat-box.stopped { border-left-color: #6c757d; }
    </style>

    <div class="container-fluid p-0">
        
        <!-- 1. 头部区域 & 统计 -->
        <div class="d-flex justify-content-between align-items-end mb-4 flex-wrap gap-3">
            <div>
                <h4 class="mb-1 fw-bold"><i class="fas fa-server text-primary me-2"></i>服务管理</h4>
                <div class="text-muted small">系统后台服务监控与控制台</div>
            </div>
            
            <div class="d-flex gap-3">
                <div class="card shadow-sm border-0 bg-light">
                    <div class="card-body py-2 px-3 d-flex align-items-center gap-3">
                        <div class="text-center">
                            <div class="small text-muted text-uppercase fw-bold" style="font-size:0.7rem;">Total</div>
                            <div class="fw-bold" id="stat-total">-</div>
                        </div>
                        <div class="vr"></div>
                        <div class="text-center text-success">
                            <div class="small text-uppercase fw-bold" style="font-size:0.7rem;">Running</div>
                            <div class="fw-bold" id="stat-running">-</div>
                        </div>
                        <div class="vr"></div>
                        <div class="text-center text-secondary">
                            <div class="small text-uppercase fw-bold" style="font-size:0.7rem;">Stopped</div>
                            <div class="fw-bold" id="stat-stopped">-</div>
                        </div>
                    </div>
                </div>
                <button class="btn btn-primary shadow-sm" id="btnRefreshServices" title="刷新列表">
                    <i class="fas fa-sync-alt"></i>
                </button>
            </div>
        </div>

        <div class="row g-4">
            
            <!-- 左侧：服务列表 -->
            <div class="col-lg-8 col-xl-9">
                
                <!-- 工具栏 -->
                <div class="card border-0 shadow-sm mb-4">
                    <div class="card-body p-2">
                        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
                            <div class="d-flex gap-2">
                                <button class="btn btn-success text-white btn-sm" id="btnNewService">
                                    <i class="fas fa-plus me-1"></i> 新建服务
                                </button>
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-outline-success" id="btnBatchStart" disabled title="启动选中">
                                        <i class="fas fa-play me-1"></i> 启动
                                    </button>
                                    <button class="btn btn-outline-danger" id="btnBatchStop" disabled title="停止选中">
                                        <i class="fas fa-stop me-1"></i> 停止
                                    </button>
                                </div>
                            </div>
                            
                            <div class="input-group input-group-sm" style="max-width: 300px;">
                                <span class="input-group-text bg-body border-end-0"><i class="fas fa-search text-muted"></i></span>
                                <input type="text" class="form-control border-start-0 ps-0" placeholder="筛选服务..." id="searchServiceInput">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 服务列表 Grid -->
                <div id="serviceListContainer">
                    <div class="text-center py-5">
                        <div class="spinner-border text-primary" role="status"></div>
                    </div>
                </div>
            </div>

            <!-- 右侧：侧边工具栏 (Sticky) -->
            <div class="col-lg-4 col-xl-3">
                <div class="sticky-tools">
                    
                    <!-- 进程查询 -->
                    <div class="card border-0 shadow-sm mb-4">
                        <div class="card-header bg-white border-bottom py-2">
                            <h6 class="mb-0 small fw-bold text-uppercase text-muted"><i class="fas fa-microchip me-2"></i>进程查询</h6>
                        </div>
                        <div class="card-body">
                            <div class="input-group">
                                <input type="text" class="form-control" id="cmdLineInput" placeholder="CMD 或 PID">
                                <button class="btn btn-primary" id="btnSearchProcess"><i class="fas fa-search"></i></button>
                            </div>
                            <div class="form-text small">支持模糊搜索命令行或精确PID</div>
                        </div>
                    </div>

                    <!-- 测试启动 -->
                    <div class="card border-0 shadow-sm">
                        <div class="card-header bg-white border-bottom py-2">
                            <h6 class="mb-0 small fw-bold text-uppercase text-muted"><i class="fas fa-vial me-2"></i>沙盒测试</h6>
                        </div>
                        <div class="card-body">
                            <form id="testStartForm">
                                <div class="mb-3">
                                    <label class="form-label small fw-bold">执行命令</label>
                                    <div class="input-group input-group-sm">
                                        <span class="input-group-text bg-light"><i class="fas fa-terminal"></i></span>
                                        <input type="text" class="form-control" name="cmd" placeholder="./app" required>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small fw-bold">工作目录</label>
                                    <div class="input-group input-group-sm">
                                        <span class="input-group-text bg-light"><i class="fas fa-folder"></i></span>
                                        <input type="text" class="form-control" name="cwd" placeholder="/path/to/dir">
                                    </div>
                                </div>
                                <button class="btn btn-info w-100 text-white btn-sm" type="submit" id="btnTestRun">
                                    <i class="fas fa-rocket me-1"></i> 运行测试
                                </button>
                            </form>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    </div>

    <!-- 进程模态框 (Bootstrap Modal) -->
    <div class="modal fade" id="processModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
            <div class="modal-content">
                <div class="modal-header py-2 bg-light">
                    <h5 class="modal-title fs-6"><i class="fas fa-list-alt me-2"></i>进程列表</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                
                <div class="modal-body p-0">
                    <!-- 工具条 -->
                    <div class="d-flex justify-content-between align-items-center px-3 py-2 border-bottom bg-white sticky-top">
                        <button class="btn btn-sm btn-outline-danger" id="btnBatchTerminate" disabled>
                            <i class="fas fa-skull me-1"></i> 结束选中
                        </button>
                        <span class="badge bg-secondary" id="processCountTag">0 processes</span>
                    </div>

                    <div class="table-responsive">
                        <table class="table table-striped table-hover table-sm align-middle mb-0 process-table">
                            <thead class="table-light">
                                <tr>
                                    <th style="width:40px;" class="text-center"><input class="form-check-input" type="checkbox" id="checkAllProcess"></th>
                                    <th style="width:80px;">PID</th>
                                    <th>Name</th>
                                    <th style="width:100px;">User</th>
                                    <th style="width:80px;">Status</th>
                                    <th style="width:100px;">Memory</th>
                                    <th style="width:40%;">Command Line</th>
                                    <th style="width:60px;" class="text-center">Act</th>
                                </tr>
                            </thead>
                            <tbody id="processListBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;

    // 初始化 Modal
    const modalEl = document.getElementById('processModal');
    if (modalEl) {
        state.processModalInstance = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    }
}

// --- 服务列表渲染 ---

function renderServiceList(filter = '') {
    const container = document.getElementById('serviceListContainer');
    container.innerHTML = '';

    const entries = Object.entries(state.services);
    
    // 更新顶部统计
    const total = entries.length;
    const running = entries.filter(([_, s]) => s.status.toLowerCase().startsWith('running')).length;
    const stopped = total - running;
    
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-running').textContent = running;
    document.getElementById('stat-stopped').textContent = stopped;

    // 过滤
    const filteredEntries = entries.filter(([name]) => 
        name.toLowerCase().includes(filter.toLowerCase())
    );

    if (filteredEntries.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-5 border rounded bg-light">
                <i class="far fa-folder-open fa-3x mb-3 opacity-25"></i>
                <p class="mb-0">未找到匹配的服务</p>
            </div>`;
        return;
    }

    const row = document.createElement('div');
    row.className = 'row g-3';

    filteredEntries.forEach(([name, service]) => {
        const isRunning = service.status.toLowerCase().startsWith('running');
        
        const col = document.createElement('div');
        col.className = 'col-12 col-md-6 col-xxl-4';
        
        // 动态样式：运行中为浅绿色背景，停止为浅灰色
        const cardBgClass = isRunning ? 'bg-success-subtle bg-opacity-10' : 'bg-light';
        const borderClass = isRunning ? 'border-success-subtle' : 'border-light';

        col.innerHTML = `
        <div class="card service-card h-100 ${borderClass}">
            <div class="card-body p-3 d-flex flex-column">
                
                <!-- Header -->
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <div class="d-flex align-items-center overflow-hidden">
                        <input class="form-check-input me-2 service-checkbox flex-shrink-0" type="checkbox" value="${name}">
                        <div>
                            <h6 class="mb-0 fw-bold text-truncate" title="${name}">${name}</h6>
                            <small class="text-muted" style="font-size: 0.75rem;">${isRunning ? 'Uptime: 检测中...' : 'Service stopped'}</small>
                        </div>
                    </div>
                    <span class="badge rounded-pill ${isRunning ? 'bg-success text-white' : 'bg-secondary text-white'} d-flex align-items-center ps-1 pe-2">
                        <span class="status-dot ${isRunning ? 'dot-running' : 'dot-stopped'} bg-white"></span>
                        ${isRunning ? 'Running' : 'Stopped'}
                    </span>
                </div>
                
                <!-- Info -->
                <div class="flex-grow-1 mb-3">
                    <div class="d-flex align-items-center mb-1">
                        <i class="fas fa-terminal text-muted me-2" style="width:16px; text-align:center;"></i>
                        <code class="text-truncate bg-white border rounded px-1 text-dark flex-grow-1" style="font-size:0.8rem;" title="${service.cmd || ''}">${service.cmd || '-'}</code>
                    </div>
                    <div class="d-flex align-items-center">
                        <i class="fas fa-folder text-muted me-2" style="width:16px; text-align:center;"></i>
                        <span class="text-truncate small text-secondary" title="${service.cwd || ''}">${service.cwd || '-'}</span>
                    </div>
                </div>

                <!-- Footer Actions -->
                <div class="d-flex justify-content-between align-items-center pt-2 border-top">
                    <button class="btn btn-sm ${isRunning ? 'btn-danger' : 'btn-success'} w-50 me-2 btn-toggle-service shadow-sm" 
                            data-name="${name}" 
                            data-action="${isRunning ? 'stop' : 'start'}">
                        <i class="fas fa-${isRunning ? 'stop' : 'play'} me-1"></i> ${isRunning ? '停止' : '启动'}
                    </button>
                    
                    <div class="btn-group">
                        <a href="${BASE_URL}update?name=${name}.json" class="btn btn-sm btn-outline-secondary border-0" title="配置">
                            <i class="fas fa-cog"></i>
                        </a>
                        <a href="${BASE_URL}log_view?name=${name}.json" class="btn btn-sm btn-outline-secondary border-0" title="日志">
                            <i class="far fa-file-alt"></i>
                        </a>
                        <div class="btn-group dropup">
                            <button class="btn btn-sm btn-outline-secondary border-0" data-bs-toggle="dropdown">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end shadow border-0">
                                <li><a class="dropdown-item btn-clear-log" href="javascript:;" data-name="${name}"><i class="fas fa-eraser me-2 text-warning"></i> 清空日志</a></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><a class="dropdown-item text-danger btn-delete-service" href="javascript:;" data-name="${name}"><i class="far fa-trash-alt me-2"></i> 删除服务</a></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
        row.appendChild(col);
    });
    
    container.appendChild(row);
}

// --- 事件绑定 ---

function bindEvents() {
    // 刷新按钮动画
    const refreshBtn = document.getElementById('btnRefreshServices');
    refreshBtn.onclick = async () => {
        const icon = refreshBtn.querySelector('i');
        icon.classList.add('fa-spin');
        await loadServices();
        setTimeout(() => icon.classList.remove('fa-spin'), 500);
    };
    
    document.getElementById('searchServiceInput').oninput = (e) => {
        renderServiceList(e.target.value);
    };

    const listContainer = document.getElementById('serviceListContainer');
    listContainer.addEventListener('click', async (e) => {
        const btnToggle = e.target.closest('.btn-toggle-service');
        if (btnToggle) {
            // Loading state
            const originalHtml = btnToggle.innerHTML;
            btnToggle.disabled = true;
            btnToggle.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
            
            await handleServiceAction(btnToggle.dataset.action, btnToggle.dataset.name);
            
            // Revert state (though list usually re-renders)
            btnToggle.disabled = false;
            btnToggle.innerHTML = originalHtml;
            return;
        }
        
        // Delegate other actions...
        const btnDelete = e.target.closest('.btn-delete-service');
        if (btnDelete) {
            if (confirm(`⚠️ 危险操作：确定永久删除服务 "${btnDelete.dataset.name}" 吗?`)) {
                await API.deleteService(btnDelete.dataset.name + '.json');
                Toast.success('服务已删除');
                loadServices();
            }
            return;
        }
        const btnClear = e.target.closest('.btn-clear-log');
        if (btnClear) {
             if (confirm(`清空 "${btnClear.dataset.name}" 的日志文件?`)) {
                await API.clearLog(btnClear.dataset.name + '.json');
                Toast.success('日志已清空');
            }
            return;
        }
    });

    listContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('service-checkbox')) {
            updateBatchButtons();
        }
    });

    document.getElementById('btnBatchStart').onclick = () => batchAction('start');
    document.getElementById('btnBatchStop').onclick = () => batchAction('stop');

    document.getElementById('btnNewService').onclick = () => {
        const name = prompt('请输入新服务名称 (英文, 无需后缀):');
        if (name) window.location.href = BASE_URL + 'update?name=' + name + '.json';
    };

    // 测试启动
    const testForm = document.getElementById('testStartForm');
    testForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnTestRun');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> 执行中...';

        const formData = new FormData(e.target);
        try {
            const res = await API.testStart(formData);
            const text = await res.text();
            alert('测试输出:\n\n' + text);
        } catch (err) {
            Toast.error('请求失败: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    };

    document.getElementById('btnSearchProcess').onclick = openProcessModal;
    document.getElementById('cmdLineInput').addEventListener('keydown', (e) => {
        if(e.key === 'Enter') openProcessModal();
    });

    // 进程列表操作
    const processBody = document.getElementById('processListBody');
    processBody.addEventListener('click', (e) => {
        const btnTerm = e.target.closest('.btn-terminate-pid');
        if (btnTerm) {
            terminateProcess([btnTerm.dataset.pid]);
        }
        
        // 点击代码块复制
        if (e.target.classList.contains('cmd-code')) {
            const text = e.target.title || e.target.innerText;
            navigator.clipboard.writeText(text).then(() => Toast.info('命令已复制'));
        }
    });
    
    document.getElementById('checkAllProcess').onchange = (e) => {
        document.querySelectorAll('.process-checkbox').forEach(cb => cb.checked = e.target.checked);
        updateProcessBatchBtn();
    };
    
    processBody.addEventListener('change', updateProcessBatchBtn);
    
    document.getElementById('btnBatchTerminate').onclick = () => {
        const pids = Array.from(document.querySelectorAll('.process-checkbox:checked')).map(cb => cb.value);
        terminateProcess(pids);
    };
}

// --- 逻辑处理 ---

async function loadServices() {
    try {
        const data = await API.getServices();
        state.services = data;
        renderServiceList(document.getElementById('searchServiceInput').value);
    } catch (e) {
        Toast.error('加载服务失败');
    }
}

async function handleServiceAction(action, name) {
    try {
        const res = await (action === 'start' ? API.startService(name) : API.stopService(name));
        const text = await res.text();
        if(res.ok) {
            Toast.success(text);
            loadServices();
        } else {
            Toast.error(text);
        }
    } catch (e) {
        Toast.error('操作失败: ' + e.message);
    }
}

function updateBatchButtons() {
    const checkedCount = document.querySelectorAll('.service-checkbox:checked').length;
    document.getElementById('btnBatchStart').disabled = checkedCount === 0;
    document.getElementById('btnBatchStop').disabled = checkedCount === 0;
}

async function batchAction(action) {
    const names = Array.from(document.querySelectorAll('.service-checkbox:checked')).map(cb => cb.value);
    if (names.length === 0) return;
    if (!confirm(`确定${action === 'start'?'启动':'停止'}选中的 ${names.length} 个服务?`)) return;

    try {
        const res = await (action === 'start' ? API.startService(names.join(',')) : API.stopService(names.join(',')));
        Toast.success(await res.text());
        loadServices();
    } catch (e) {
        Toast.error('批量操作失败');
    }
}

async function openProcessModal() {
    const cmd = document.getElementById('cmdLineInput').value.trim();
    if (state.processModalInstance) state.processModalInstance.show();
    
    const tbody = document.getElementById('processListBody');
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><div class="mt-2 text-muted">正在检索进程...</div></td></tr>`;
    document.getElementById('processCountTag').textContent = '-';

    try {
        const data = await API.getProcesses(cmd);
        renderProcessList(data);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4"><i class="fas fa-exclamation-triangle me-2"></i> 加载失败: ${e.message}</td></tr>`;
    }
}

function renderProcessList(list) {
    const tbody = document.getElementById('processListBody');
    tbody.innerHTML = '';
    document.getElementById('processCountTag').textContent = list.length;
    document.getElementById('checkAllProcess').checked = false;
    updateProcessBatchBtn();

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-5">未找到匹配进程</td></tr>`;
        return;
    }

    list.forEach(p => {
        // 安全处理
        const cmdText = p.cmdline && Array.isArray(p.cmdline) ? p.cmdline.join(' ') : (p.name || '');
        const memText = p.memory_usage ? formatBytes(p.memory_usage) : (p.memory_percent ? p.memory_percent.toFixed(1)+'%' : '-');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-center"><input class="form-check-input process-checkbox" type="checkbox" value="${p.pid}"></td>
            <td><span class="badge bg-light text-dark border font-monospace">${p.pid}</span></td>
            <td class="fw-bold text-primary text-truncate" style="max-width: 150px;" title="${p.name}">${p.name}</td>
            <td><span class="badge bg-secondary bg-opacity-10 text-secondary">${p.username}</span></td>
            <td>${p.status}</td>
            <td>${memText}</td>
            <td><span class="cmd-code" title="${cmdText}">${cmdText}</span></td>
            <td class="text-center">
                <button class="btn btn-sm btn-light border text-danger btn-terminate-pid" data-pid="${p.pid}" title="结束进程">
                    <i class="fas fa-power-off"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateProcessBatchBtn() {
    const count = document.querySelectorAll('.process-checkbox:checked').length;
    const btn = document.getElementById('btnBatchTerminate');
    btn.disabled = count === 0;
    if(count > 0) {
        btn.innerHTML = `<i class="fas fa-skull me-1"></i> 结束选中 (${count})`;
    } else {
        btn.innerHTML = `<i class="fas fa-skull me-1"></i> 结束选中`;
    }
}

async function terminateProcess(pids) {
    if (pids.length === 0) return;
    if (!confirm(`⚠️ 强制结束这 ${pids.length} 个进程吗? 此操作不可恢复。`)) return;

    try {
        const res = await API.terminateProcess(pids.join(','));
        Toast.success(await res.text());
        // 延时刷新
        setTimeout(openProcessModal, 500); 
    } catch (e) {
        Toast.error('结束进程失败');
    }
}

// 简单的字节格式化 helper
function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}