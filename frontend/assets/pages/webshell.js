import { PageManager, Toast } from '../app.js';

// --- 1. 基础配置 (沿用旧逻辑) ---
function getBaseUrl() {
    let { protocol, host, pathname } = window.location;
    if (!pathname.endsWith('/')) {
        pathname += '/';
    }
    const path = pathname.substring(0, pathname.lastIndexOf('/') + 1);
    return `${protocol}//${host}${path}web_shell/`;
}

const BASE_URL_PATH = getBaseUrl();

// --- 2. 状态管理 ---
let state = {
    cwd: '',
    command: '', 
    args: [],    
    useShell: false,
    captureOutput: true,
    encoding: false,
    urlMode: 1,  
    confirmModalInstance: null
};

// --- 3. 生命周期钩子 ---
PageManager.registerHooks('webshell', {
    onEnter() {
        renderLayout();
        bindGlobalEvents();
        
        // 恢复数据
        loadFormData();
        
        // 渲染界面并立即触发一次预览
        restoreDOMState();
        renderArgsInputs();
        updatePreview(); 
    },
    onLeave() {
        saveFormData();
        if (state.confirmModalInstance) {
            state.confirmModalInstance.dispose();
            state.confirmModalInstance = null;
        }
    }
});

// --- 4. 渲染层 (Bootstrap 5 UI) ---
function renderLayout() {
    const page = document.querySelector('.page[data-page="webshell"]');
    if (!page) return;

    page.innerHTML = `
    <style>
        .sticky-box { position: sticky; top: 20px; transition: all 0.3s; }
        .arg-row { animation: slideDown 0.2s ease-out; }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: 0; } }
        .preview-area { transition: background-color 0.2s; }
        .preview-area.highlight { background-color: #f0f9ff; }
    </style>

    <div class="container-fluid p-0">
        <!-- 标题头 -->
        <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
            <div>
                <h4 class="mb-1"><i class="fas fa-terminal text-primary me-2"></i>Web Shell</h4>
                <div class="text-muted small">远程命令执行生成器</div>
            </div>
            <button class="btn btn-light border text-danger" id="btnClear" title="清空所有设置">
                <i class="fas fa-trash-alt me-1"></i> 重置所有
            </button>
        </div>

        <div class="row g-4">
            <!-- 左侧：配置区域 -->
            <div class="col-lg-7 col-xl-8">
                
                <!-- 环境配置 -->
                <div class="card border-0 shadow-sm mb-4">
                    <div class="card-body">
                        <div class="row g-3">
                            <div class="col-12">
                                <div class="d-flex flex-wrap gap-3">
                                    <div class="form-check border rounded px-3 py-2 bg-light user-select-none cursor-pointer">
                                        <input class="form-check-input" type="checkbox" id="checkShell">
                                        <label class="form-check-label small" for="checkShell" title="用本程序启动时的Shell执行">
                                            Shell Mode
                                        </label>
                                    </div>
                                    <div class="form-check border rounded px-3 py-2 bg-light user-select-none cursor-pointer">
                                        <input class="form-check-input" type="checkbox" id="checkCapture" checked>
                                        <label class="form-check-label small" for="checkCapture">
                                            Capture Output
                                        </label>
                                    </div>
                                    <div class="form-check border rounded px-3 py-2 bg-light user-select-none cursor-pointer">
                                        <input class="form-check-input" type="checkbox" id="checkEncoding">
                                        <label class="form-check-label small" for="checkEncoding">
                                            URI Component Encoding
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-12">
                                <label class="form-label small fw-bold">Current Working Directory (cwd)</label>
                                <div class="input-group">
                                    <span class="input-group-text bg-light"><i class="fas fa-folder text-muted"></i></span>
                                    <input class="form-control" type="text" id="inputCwd" placeholder="Default">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 命令配置 -->
                <div class="card border-0 shadow-sm">
                    <div class="card-header bg-white border-bottom pt-3">
                        <h6 class="mb-0 text-muted"><i class="fas fa-code me-2"></i>命令构建</h6>
                    </div>
                    
                    <div class="card-body">
                        <!-- 主命令 -->
                        <div class="mb-4">
                            <label class="form-label small fw-bold">主命令 (Command)</label>
                            <div class="input-group">
                                <span class="input-group-text bg-light"><i class="fas fa-chevron-right"></i></span>
                                <input class="form-control fw-bold" type="text" id="inputCommand" list="cmdList" placeholder="e.g. python, node, cat" autocomplete="off">
                                <button class="btn btn-outline-secondary" type="button" id="btnClearCommand" title="Clear Command"><i class="fas fa-times"></i></button>
                                <datalist id="cmdList">
                                    <option value="python">
                                    <option value="node">
                                    <option value="curl">
                                    <option value="whoami">
                                    <option value="ls">
                                    <option value="cat">
                                </datalist>
                            </div>
                        </div>

                        <!-- 参数列表 -->
                        <div class="mb-3">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <label class="form-label small fw-bold mb-0">参数列表 (Arguments)</label>
                                <div class="btn-group btn-group-sm">
                                    <button class="btn btn-success text-white" id="btnAddArg" title="Add Parameter"><i class="fas fa-plus"></i></button>
                                    <button class="btn btn-danger text-white" id="btnRemoveArg" title="Remove Last Parameter"><i class="fas fa-minus"></i></button>
                                </div>
                            </div>
                            <div id="argsContainer" class="d-flex flex-column gap-2">
                                <!-- JS 动态生成 -->
                            </div>
                            <div id="emptyArgsPlaceholder" class="text-center py-3 text-muted border border-dashed rounded bg-light small">
                                无参数，点击上方 "+" 添加
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 右侧：执行与预览 -->
            <div class="col-lg-5 col-xl-4">
                <div class="card border-0 shadow-sm sticky-box bg-light">
                    <div class="card-body">
                         <div class="mb-3">
                            <label class="form-label small fw-bold">URL 生成模式</label>
                            <select class="form-select form-select-sm" id="selectUrlMode">
                                <option value="1">Mode 1: Query (?cmd=...)</option>
                                <option value="2">Mode 2: Path (/cmd/...)</option>
                            </select>
                        </div>

                        <div class="mb-3 position-relative">
                            <div class="d-flex justify-content-between align-items-end mb-1">
                                <label class="form-label small fw-bold mb-0">实时预览</label>
                                <button class="btn btn-link btn-sm p-0 text-decoration-none" id="btnCopyUrl">
                                    <i class="far fa-copy"></i> 复制链接
                                </button>
                            </div>
                            <textarea class="form-control form-control-sm font-monospace bg-white preview-area" id="previewUrl" readonly rows="8" style="font-size: 12px; white-space: pre-wrap; word-break: break-all;"></textarea>
                        </div>

                        <button class="btn btn-primary w-100 py-2 shadow-sm" id="btnRun">
                            <i class="fas fa-rocket me-2"></i> 执行跳转 (Run)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- 确认模态框 -->
    <div class="modal fade" id="confirmModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header py-2">
                    <h5 class="modal-title fs-6">跳转确认</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <p class="mb-2 text-muted small">即将访问以下 URL：</p>
                    <textarea class="form-control form-control-sm font-monospace bg-light" readonly id="confirmUrlDisplay" rows="5"></textarea>
                </div>
                <div class="modal-footer py-2">
                    <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">取消</button>
                    <button type="button" class="btn btn-sm btn-primary" id="btnConfirmRun">确认访问</button>
                </div>
            </div>
        </div>
    </div>
    `;

    const modalEl = document.getElementById('confirmModal');
    if (modalEl) {
        state.confirmModalInstance = new bootstrap.Modal(modalEl);
    }
}

// --- 5. 事件绑定 (实时更新的核心) ---
function bindGlobalEvents() {
    // 监听所有静态输入框的 input 事件，实现实时更新
    const inputs = ['inputCwd', 'inputCommand', 'checkShell', 'checkCapture', 'checkEncoding', 'selectUrlMode'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener('input', () => {
                syncStateFromDOM();
                updatePreview();
            });
            // 针对 checkbox 的 change 事件也绑定
            if(el.type === 'checkbox' || el.tagName === 'SELECT') {
                el.addEventListener('change', () => {
                    syncStateFromDOM();
                    updatePreview();
                });
            }
        }
    });

    // 清空命令按钮
    document.getElementById('btnClearCommand').onclick = () => {
        document.getElementById('inputCommand').value = '';
        document.getElementById('inputCommand').focus();
        syncStateFromDOM();
        updatePreview();
    };

    // 重置所有
    document.getElementById('btnClear').onclick = () => {
        if(confirm('确定要重置所有输入内容吗？')) {
            resetState();
            restoreDOMState();
            renderArgsInputs();
            updatePreview();
            Toast.info('已重置');
        }
    };

    // 添加参数
    document.getElementById('btnAddArg').onclick = () => {
        state.args.push('');
        renderArgsInputs();
        updatePreview();
        // 自动聚焦到最新添加的输入框
        setTimeout(() => {
            const inputs = document.querySelectorAll('.arg-input');
            if(inputs.length) inputs[inputs.length-1].focus();
        }, 50);
    };

    // 移除最后一个参数
    document.getElementById('btnRemoveArg').onclick = () => {
        if(state.args.length > 0) {
            state.args.pop();
            renderArgsInputs();
            updatePreview();
        }
    };

    // 复制 URL
    document.getElementById('btnCopyUrl').onclick = () => {
        const url = document.getElementById('previewUrl').value;
        if(url) {
            navigator.clipboard.writeText(url).then(() => {
                const btn = document.getElementById('btnCopyUrl');
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-check text-success"></i> 已复制';
                setTimeout(() => btn.innerHTML = originalHtml, 2000);
            });
        }
    };

    // 运行按钮
    document.getElementById('btnRun').onclick = showConfirmModal;

    // 模态框确认
    document.getElementById('btnConfirmRun').onclick = () => {
        const url = document.getElementById('previewUrl').value;
        if (!url) return;
        saveFormData(); 
        window.location.href = url;
        if (state.confirmModalInstance) state.confirmModalInstance.hide();
    };
}

// --- 6. 核心逻辑：UI 同步 ---

function syncStateFromDOM() {
    state.cwd = document.getElementById('inputCwd').value;
    state.command = document.getElementById('inputCommand').value;
    state.useShell = document.getElementById('checkShell').checked;
    state.captureOutput = document.getElementById('checkCapture').checked;
    state.encoding = document.getElementById('checkEncoding').checked;
    state.urlMode = parseInt(document.getElementById('selectUrlMode').value) || 1;
}

function restoreDOMState() {
    document.getElementById('inputCwd').value = state.cwd;
    document.getElementById('inputCommand').value = state.command;
    document.getElementById('checkShell').checked = state.useShell;
    document.getElementById('checkCapture').checked = state.captureOutput;
    document.getElementById('checkEncoding').checked = state.encoding;
    document.getElementById('selectUrlMode').value = state.urlMode;
}

function renderArgsInputs() {
    const container = document.getElementById('argsContainer');
    const placeholder = document.getElementById('emptyArgsPlaceholder');
    container.innerHTML = '';

    if (state.args.length === 0) {
        placeholder.classList.remove('d-none');
    } else {
        placeholder.classList.add('d-none');
    }

    state.args.forEach((val, index) => {
        const div = document.createElement('div');
        div.className = 'input-group input-group-sm arg-row';
        div.innerHTML = `
            <span class="input-group-text bg-light text-muted" style="width: 40px; justify-content: center;">${index + 1}</span>
            <input type="text" class="form-control arg-input" placeholder="参数 ${index + 1}" value="${escapeHtml(val)}">
            <button class="btn btn-outline-danger btn-remove-this-arg" type="button" title="移除此参数">
                <i class="fas fa-times"></i>
            </button>
        `;

        const input = div.querySelector('input');
        
        // 关键：参数输入框的实时监听
        input.oninput = (e) => {
            state.args[index] = e.target.value;
            updatePreview();
        };

        // 模拟旧代码逻辑：Input 中回车不提交表单，而是聚焦下一个或无操作
        input.addEventListener("keydown", function(event) {
            if (event.key === "Enter") {
                event.preventDefault();
            }
        });

        // 单个移除按钮
        div.querySelector('.btn-remove-this-arg').onclick = () => {
            state.args.splice(index, 1);
            renderArgsInputs();
            updatePreview();
        };

        container.appendChild(div);
    });
}

function updatePreview() {
    const url = genURL(state.urlMode, state.encoding);
    const textarea = document.getElementById('previewUrl');
    if(textarea) {
        textarea.value = url;
    }
}

function showConfirmModal() {
    const url = genURL(state.urlMode, state.encoding);
    document.getElementById('previewUrl').value = url;
    document.getElementById('confirmUrlDisplay').value = url;
    if (state.confirmModalInstance) state.confirmModalInstance.show();
}

// --- 7. 核心逻辑：URL 生成算法 (完全复刻旧代码) ---
function genURL(method, isEncode) {
    let cwd = state.cwd;
    let shell = state.useShell ? 'on' : 'off';
    let capture_output = state.captureOutput ? 'on' : 'off';
    
    // 逻辑复刻：optionStr 拼接
    let optionStr = (cwd ? '&cwd=' + (isEncode ? encodeURIComponent(cwd) : cwd) : '')
        + (shell === 'on' ? '&shell=' + shell : '') 
        + (capture_output === 'on' ? '&capture_output=' + capture_output : '');

    let param0Str = state.command || '';
    let paramStr = '';
    let href = '';
    
    if (method == 1) {
        // Method 1: Query
        state.args.forEach((val, index) => {
            // 逻辑复刻：忽略最后一个空参数
            if (index === state.args.length - 1 && !val) return;

            let paramValue = val.replace(/&/g, '%26'); 
            if (paramValue.includes(' ')) {
                paramStr += ' "' + paramValue + '"';
            } else {
                paramStr += ' ' + paramValue;
            }
        });

        param0Str = param0Str.replace(/&/g, '%26');

        // 逻辑复刻：主命令引号处理
        let hasArgs = false;
        // 如果 args 数组长度 > 1，或者长度为1且不为空
        if (state.args.length > 1) hasArgs = true;
        if (state.args.length === 1 && state.args[0]) hasArgs = true;

        if (param0Str.includes(' ')) {
            if (hasArgs) {
                param0Str = '"' + param0Str + '"';
            }
        }

        const fullCmd = param0Str + paramStr;
        href = `?cmd=` + (isEncode ? encodeURIComponent(fullCmd) : fullCmd) + optionStr;

    } else if (method == 2) {
        // Method 2: Path
        state.args.forEach((val, index) => {
            if (index === state.args.length - 1 && !val) return;

            let paramValue = val;
            if (paramValue.includes('/') || paramValue.includes('\\')) {
                paramStr += '/"' + (isEncode ? encodeURIComponent(paramValue) : paramValue) + '"';
            } else {
                paramStr += '/' + (isEncode ? encodeURIComponent(paramValue) : paramValue);
            }
        });

        let hasArgs = false;
        if (state.args.length > 1) hasArgs = true;
        if (state.args.length === 1 && state.args[0]) hasArgs = true;

        if (param0Str.includes('/') || param0Str.includes('\\')) {
            if (hasArgs) {
                param0Str = '"' + param0Str + '"';
            }
        }

        href = (isEncode ? encodeURIComponent(param0Str) : param0Str) + paramStr + '?' + optionStr;
    }

    return BASE_URL_PATH + href;
}

// --- 8. 数据持久化 (复刻 SessionStorage 键名) ---
function saveFormData() {
    sessionStorage.setItem('cwd', state.cwd);
    sessionStorage.setItem('shell', state.useShell ? 'on' : 'off');
    sessionStorage.setItem('capture_output', state.captureOutput ? 'on' : 'off');
    sessionStorage.setItem('0', state.command); // id="0"

    // 清理旧参数
    let i = 1;
    while (sessionStorage.getItem(i.toString())) {
        sessionStorage.removeItem(i.toString());
        i++;
    }
    // 保存新参数
    state.args.forEach((val, index) => {
        sessionStorage.setItem((index + 1).toString(), val);
    });
    
    // UI状态
    sessionStorage.setItem('ui_encoding', state.encoding ? 'true' : 'false');
    sessionStorage.setItem('ui_urlMode', state.urlMode);
}

function loadFormData() {
    if (sessionStorage.getItem('cwd')) state.cwd = sessionStorage.getItem('cwd');
    if (sessionStorage.getItem('shell')) state.useShell = sessionStorage.getItem('shell') === 'on';
    if (sessionStorage.getItem('capture_output')) state.captureOutput = sessionStorage.getItem('capture_output') === 'on';
    if (sessionStorage.getItem('0')) state.command = sessionStorage.getItem('0');

    state.args = [];
    let i = 1;
    while (true) {
        const val = sessionStorage.getItem(i.toString());
        if (val === null) break;
        state.args.push(val);
        i++;
    }

    if (sessionStorage.getItem('ui_encoding')) state.encoding = sessionStorage.getItem('ui_encoding') === 'true';
    if (sessionStorage.getItem('ui_urlMode')) state.urlMode = parseInt(sessionStorage.getItem('ui_urlMode'));
}

function resetState() {
    state.cwd = '';
    state.command = '';
    state.args = [];
    state.useShell = false;
    state.captureOutput = true;
    state.encoding = false;
    state.urlMode = 1;
    sessionStorage.clear();
}

function escapeHtml(text) {
    if(!text) return '';
    return text.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}