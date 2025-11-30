import { PageManager, Toast } from '../app.js';

const BASE_URL = location.origin + '/file_explorer' + location.pathname.replace(/\/[^/]*$/, '/') || '/';
const SUPPORTED_ARCHIVES = ['.zip', '.7z', '.tar.gz', '.tgz', '.tar.xz', '.txz', '.tar.bz2', '.gz', '.xz', '.zst'];

// --- 状态管理 ---
let state = {
    currentDirectory: '/',
    files: [],
    page: 1,
    perPage: 100,
    totalPages: 1,
    total: 0,
    keyword: '',
    fileType: '',
    showHidden: false,
    sortBy: 'name',
    order: 'asc',
    selectedFilePath: '',
    editorModalInstance: null
};

// --- Page Hook ---
PageManager.registerHooks('fileexplorer', {
    onEnter() {
        renderLayout();
        bindGlobalEvents();
        fetchDisks();
        handleHashChange();
    },
    onLeave() {
        unbindGlobalEvents();
        if (state.editorModalInstance) {
            state.editorModalInstance.dispose();
            state.editorModalInstance = null;
        }
    }
});

// --- API ---
const API = {
    getDisks: () => axios.get(`${BASE_URL}disks`),
    getFiles: (params) => axios.get(`${BASE_URL}files`, { params }),
    upload: (formData) => axios.post(`${BASE_URL}files/upload`, formData),
    uploadRemote: (data) => axios.post(`${BASE_URL}files/upload/remote`, data),
    createFile: (filename) => axios.post(`${BASE_URL}files`, { filename }),
    createDir: (directory) => axios.post(`${BASE_URL}directories`, { directory }),
    delete: (files) => axios.post(`${BASE_URL}files/delete`, { files }),
    rename: (path, dest) => axios.post(`${BASE_URL}files/${encodeURIComponent(path)}/actions`, { action: 'rename', destination: dest }),
    copy: (files, dest) => axios.post(`${BASE_URL}files/copy`, { files, destination: dest }),
    move: (files, dest) => axios.post(`${BASE_URL}files/move`, { files, destination: dest }),
    pack: (files, archiveName) => axios.post(`${BASE_URL}files/pack`, { files, archive_filename: archiveName }),
    unpack: (archive, dest) => axios.post(`${BASE_URL}files/unpack`, { archive_filename: archive, extract_directory: dest }),
    getContent: (path) => fetch(`${BASE_URL}files/content/${encodeURIComponent(path)}`).then(res => res.json()),
    saveContent: (formData) => fetch(`${BASE_URL}files/edit`, { method: 'POST', body: formData }).then(res => res.json()),
    getAttr: (path, isDir) => axios.get(`${BASE_URL}${isDir ? 'directories' : 'files'}/${encodeURIComponent(path)}/attributes`)
};

// --- 渲染层 (HTML结构保持不变) ---
// --- 渲染层 ---
function renderLayout() {
    const page = document.querySelector('.page[data-page="fileexplorer"]');
    if (!page) return;

    page.innerHTML = `
    <style>
        .breadcrumb-scroll { overflow-x: auto; white-space: nowrap; -webkit-overflow-scrolling: touch; }
        .file-explorer-table td { vertical-align: middle; }
        .file-name-col { cursor: pointer; font-weight: 500; }
        .file-name-col:hover { color: var(--color-primary); }
        .sort-icon { font-size: 0.8em; opacity: 0.5; margin-left: 4px; cursor: pointer; }
        .sort-icon:hover { opacity: 1; }

        /* --- 编辑器行号样式新增 --- */
        .editor-wrapper {
            display: flex;
            height: 100%;
            position: relative;
            background: var(--bs-body-bg);
        }
        .editor-line-numbers {
            width: 45px;
            background-color: var(--bs-light);
            border-right: 1px solid var(--bs-border-color);
            color: #adb5bd;
            text-align: right;
            padding: 10px 5px;
            font-family: var(--bs-font-monospace);
            font-size: 14px;
            line-height: 1.5;
            overflow: hidden; /* 隐藏滚动条 */
            user-select: none;
            flex-shrink: 0;
        }
        #editorTextarea {
            flex-grow: 1;
            border: none;
            outline: none;
            padding: 10px;
            font-family: var(--bs-font-monospace);
            font-size: 14px;
            line-height: 1.5; /* 必须与行号一致 */
            resize: none;
            white-space: pre; /* 关键：防止自动换行导致行号错位 */
            overflow: auto;
            color: var(--bs-body-color);
            background: transparent;
        }
    </style>

    <div class="file-explorer-page container-fluid p-0">
        <!-- ... (顶部导航、面包屑、工具栏、文件列表代码保持不变，省略以节省空间) ... -->
        <!-- 请保留原有的顶部导航到文件列表的所有 HTML 代码 -->
        <!-- 1. 顶部导航区 -->
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <div class="input-group flex-grow-1" style="max-width: 600px;">
                <button class="btn btn-light border" id="btnParentDir" title="上级目录"><i class="fas fa-level-up-alt"></i></button>
                <button class="btn btn-light border" id="btnHomeDir" title="根目录"><i class="fas fa-home"></i></button>
                <input type="text" class="form-control font-monospace" id="pathInput" placeholder="/path/to/dir">
                <button class="btn btn-primary" id="btnGoPath"><i class="fas fa-arrow-right"></i></button>
            </div>
            <div id="diskListContainer" class="d-flex gap-1 ms-auto"></div>
        </div>
        
        <nav aria-label="breadcrumb" class="breadcrumb-scroll mb-3">
            <ol class="breadcrumb mb-0" id="breadcrumbContainer"></ol>
        </nav>

        <!-- 2. 核心工具栏 -->
        <div class="card mb-3 border-0 shadow-sm">
            <div class="card-body p-2">
                <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <div class="d-flex flex-wrap gap-2 align-items-center">
                        <div class="dropdown">
                            <button class="btn btn-primary dropdown-toggle" type="button" data-bs-toggle="dropdown">
                                <i class="fas fa-plus"></i> <span class="d-none d-sm-inline">新建</span>
                            </button>
                            <ul class="dropdown-menu">
                                <li><a class="dropdown-item" id="btnNewFile"><i class="fas fa-file me-2 text-muted"></i> 文件</a></li>
                                <li><a class="dropdown-item" id="btnNewFolder"><i class="fas fa-folder me-2 text-warning"></i> 文件夹</a></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><a class="dropdown-item" onclick="document.getElementById('fileUploadInput').click()"><i class="fas fa-upload me-2 text-primary"></i> 上传文件</a></li>
                                <li><a class="dropdown-item" id="btnRemoteUpload"><i class="fas fa-cloud-download-alt me-2 text-info"></i> 远程下载</a></li>
                            </ul>
                        </div>
                        <input type="file" id="fileUploadInput" multiple style="display:none">

                        <div class="btn-group" role="group">
                            <button class="btn btn-outline-secondary" data-action="batch-copy" disabled title="复制"><i class="far fa-copy"></i></button>
                            <button class="btn btn-outline-secondary" data-action="batch-move" disabled title="移动"><i class="fas fa-expand-arrows-alt"></i></button>
                            <button class="btn btn-outline-secondary" data-action="batch-pack" disabled title="压缩"><i class="fas fa-file-archive"></i></button>
                            <button class="btn btn-outline-danger" data-action="batch-delete" disabled title="删除"><i class="far fa-trash-alt"></i></button>
                        </div>
                    </div>

                    <div class="d-flex flex-wrap gap-2 align-items-center flex-grow-1 justify-content-end">
                        <div class="input-group" style="min-width: 120px; width: auto; max-width: 200px;">
                            <span class="input-group-text bg-body"><i class="fas fa-search"></i></span>
                            <input type="text" class="form-control" id="searchInput" placeholder="搜索...">
                        </div>
                        <select class="form-select w-auto" id="filterType">
                            <option value="">全部</option>
                            <option value="file">文件</option>
                            <option value="dir">目录</option>
                        </select>
                         <select class="form-select w-auto" id="perPageSelect" title="每页数量">
                            <option value="50">50</option>
                            <option value="100" selected>100</option>
                            <option value="500">500</option>
                        </select>
                        <button class="btn btn-light border" id="btnRefresh" title="刷新"><i class="fas fa-sync-alt"></i></button>
                        <div class="dropdown">
                            <button class="btn btn-light border" data-bs-toggle="dropdown"><i class="fas fa-cog"></i></button>
                            <ul class="dropdown-menu dropdown-menu-end">
                                <li><div class="dropdown-item"><div class="form-check"><input class="form-check-input" type="checkbox" id="checkShowHidden"><label class="form-check-label" for="checkShowHidden">显示隐藏文件</label></div></div></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 3. 文件列表 -->
        <div class="card border-0 shadow-sm overflow-hidden">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0 file-explorer-table" id="fileTable">
                    <thead class="table-light">
                        <tr>
                            <th style="width: 40px;" class="text-center"><input class="form-check-input" type="checkbox" id="checkSelectAll"></th>
                            <th>名称 <i class="fas fa-sort sort-icon sort-btn" data-sort="name"></i></th>
                            <th class="d-none d-md-table-cell" style="width: 120px;">大小 <i class="fas fa-sort sort-icon sort-btn" data-sort="size"></i></th>
                            <th class="d-none d-md-table-cell" style="width: 180px;">修改时间 <i class="fas fa-sort sort-icon sort-btn" data-sort="modified_at"></i></th>
                            <th style="width: 60px;"></th>
                        </tr>
                    </thead>
                    <tbody id="fileListBody" class="border-top-0">
                        <tr><td colspan="5" class="text-center p-5 text-muted"><i class="fas fa-spinner fa-spin fa-2x"></i></td></tr>
                    </tbody>
                </table>
            </div>
            <div class="card-footer bg-body py-2">
                <div class="d-flex justify-content-between align-items-center">
                    <small class="text-muted" id="statusText">0 项</small>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary" id="btnPrevPage"><i class="fas fa-chevron-left"></i></button>
                        <button class="btn btn-outline-secondary disabled" id="pageInfoDisplay">1/1</button>
                        <button class="btn btn-outline-secondary" id="btnNextPage"><i class="fas fa-chevron-right"></i></button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- 编辑器模态框 (HTML 结构修改) -->
    <div class="modal fade" id="editorModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-scrollable" style="height: 90vh;">
            <div class="modal-content h-100">
                <div class="modal-header py-2">
                    <h5 class="modal-title fs-6">文本编辑器</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body p-0" style="overflow: hidden;">
                    <!-- 包装器 -->
                    <div class="editor-wrapper">
                        <!-- 行号容器 -->
                        <div id="editorLineNumbers" class="editor-line-numbers">1</div>
                        <!-- 文本域 -->
                        <textarea class="form-control rounded-0 shadow-none" id="editorTextarea" spellcheck="false"></textarea>
                    </div>
                </div>
                <div class="modal-footer py-2">
                    <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">取消</button>
                    <button type="button" class="btn btn-sm btn-primary" id="btnSaveEdit">保存修改</button>
                </div>
            </div>
        </div>
    </div>
    `;

    const modalEl = document.getElementById('editorModal');
    if (modalEl) {
        state.editorModalInstance = new bootstrap.Modal(modalEl, { backdrop: 'static' });
    }
}

function renderTableRows() {
    const tbody = document.getElementById('fileListBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (state.files.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-5 text-muted"><i class="far fa-folder-open fa-3x mb-3 d-block opacity-25"></i>当前目录为空</td></tr>`;
        return;
    }

    state.files.forEach(file => {
        const tr = document.createElement('tr');
        const iconClass = file.is_directory ? 'fa-folder text-warning' : getFileIconClass(file.name);
        const dateStr = new Date(file.modified_at * 1000).toLocaleString('zh-CN', { hour12: false }); 

        tr.innerHTML = `
            <td class="text-center"><input class="form-check-input" type="checkbox" data-path="${file.path}" data-type="${file.is_directory ? 'dir' : 'file'}"></td>
            <td>
                <div class="d-flex align-items-center gap-2 file-name-col" data-path="${file.path}" data-isdir="${file.is_directory}">
                    <i class="fas ${iconClass} fs-5"></i>
                    <span class="text-truncate" style="max-width: 300px;" title="${file.name}">${escapeHtml(file.name)}</span>
                </div>
            </td>
            <td class="d-none d-md-table-cell small text-muted">${file.is_directory ? '-' : formatSize(file.size)}</td>
            <td class="d-none d-md-table-cell small text-muted">${dateStr}</td>
            <td class="text-end">
                <div class="dropdown">
                    <button class="btn btn-sm btn-light border-0 text-muted" data-bs-toggle="dropdown"><i class="fas fa-ellipsis-v"></i></button>
                    <ul class="dropdown-menu dropdown-menu-end shadow">
                        <li><a class="dropdown-item" href="javascript:;" data-action="copyPath" data-path="${file.path}"><i class="far fa-copy me-2 text-muted"></i> 复制路径</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item" href="javascript:;" data-action="rename" data-path="${file.path}">重命名</a></li>
                        <li><a class="dropdown-item" href="javascript:;" data-action="copy" data-path="${file.path}">复制到...</a></li>
                        <li><a class="dropdown-item" href="javascript:;" data-action="move" data-path="${file.path}">移动到...</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item text-danger" href="javascript:;" data-action="delete" data-path="${file.path}">删除</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item" href="javascript:;" data-action="attr" data-path="${file.path}" data-isdir="${file.is_directory}">属性</a></li>
                        ${!file.is_directory ? `<li><a class="dropdown-item" href="javascript:;" data-action="download" data-path="${file.path}">下载</a></li>` : ''}
                        ${!file.is_directory ? `<li><a class="dropdown-item" href="javascript:;" data-action="edit" data-path="${file.path}">编辑</a></li>` : ''}
                        ${isArchive(file.name) ? `<li><a class="dropdown-item" href="javascript:;" data-action="unpack" data-path="${file.path}">解压</a></li>` : ''}
                    </ul>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    const checkAll = document.getElementById('checkSelectAll');
    if(checkAll) checkAll.checked = false;
    updateBatchButtonsState();
}

// 核心修复：兼容 Windows 盘符作为根节点的面包屑
function updateBreadcrumb() {
    const container = document.getElementById('breadcrumbContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    // 分割路径，但忽略空字符串
    // Linux: /etc/nginx -> ['', 'etc', 'nginx']
    // Windows: C:/Program Files -> ['C:', 'Program Files']
    const parts = state.currentDirectory.split('/').filter(Boolean);
    
    // 判断是否是 Windows 路径
    const isWindows = /^[a-zA-Z]:/.test(state.currentDirectory);
    
    // 根节点
    const rootLi = document.createElement('li');
    rootLi.className = `breadcrumb-item ${parts.length === 0 ? 'active' : ''}`;
    
    if (isWindows) {
        // Windows 下不显示 'Home' 图标，因为没有统一的根，我们通常不点击跳回 '/'
        // 这里的根逻辑略显复杂，通常 Windows 的根是具体的盘符。
        // 如果我们不在根目录，则显示 Home 图标跳回 '/' (Linux 风格的 view root)
        // 或者我们可以不显示 Home，直接从盘符开始
        // 这里为了兼容性，如果 parts 为空（代表 /），显示 Home。
        // 如果 parts 有内容（代表 C:/...），我们把第一个 part 当作根
    } else {
        // Linux 风格
        rootLi.innerHTML = state.currentDirectory === '/' ? '<i class="fas fa-home"></i>' : '<a href="javascript:;" class="text-decoration-none"><i class="fas fa-home"></i></a>';
        if(state.currentDirectory !== '/') rootLi.onclick = () => navigateTo('/');
        container.appendChild(rootLi);
    }

    let accum = '';
    
    parts.forEach((part, index) => {
        // 构建累加路径
        if (index === 0 && isWindows) {
            accum = part; // Windows 盘符开始不加 /
        } else {
            accum += '/' + part;
        }

        // 如果是 Windows 的第一部分 (C:)，后面需要补一个 / 才能正确跳转 (C:/)
        let targetPath = accum;
        if (isWindows && index === 0 && !targetPath.endsWith('/')) {
            targetPath += '/';
        }
        // 如果是 Linux，确保 accum 以 / 开头
        if (!isWindows && !targetPath.startsWith('/')) {
            targetPath = '/' + targetPath;
        }

        const isLast = index === parts.length - 1;
        const li = document.createElement('li');
        li.className = `breadcrumb-item ${isLast ? 'active' : ''}`;
        
        if (!isLast) {
            li.innerHTML = `<a href="javascript:;" class="text-decoration-none">${escapeHtml(part)}</a>`;
            li.onclick = () => navigateTo(targetPath);
        } else {
            li.textContent = part;
        }
        container.appendChild(li);
    });
}

function bindGlobalEvents() {
    window.addEventListener('hashchange', handleHashChange);
    
    const tbody = document.getElementById('fileListBody');
    if (tbody) {
        tbody.addEventListener('click', (e) => {
            const target = e.target;
            const actionItem = target.closest('.dropdown-item');
            if (actionItem) {
                const { action, path, isdir } = actionItem.dataset;
                executeFileAction(action, path, isdir === 'true');
                return;
            }
            const nameCol = target.closest('.file-name-col');
            if (nameCol) {
                const { path, isdir } = nameCol.dataset;
                if (isdir === 'true') navigateTo(path);
                else previewFile(path);
                return;
            }
            if (target.tagName === 'INPUT' && target.type === 'checkbox') {
                updateBatchButtonsState();
            }
        });
    }

    document.getElementById('btnGoPath').onclick = () => {
        const path = document.getElementById('pathInput').value.trim();
        if(path) navigateTo(path);
    };
    document.getElementById('pathInput').addEventListener('keypress', (e) => {
        if(e.key === 'Enter') document.getElementById('btnGoPath').click();
    });
    
    document.getElementById('btnHomeDir').onclick = () => navigateTo('/');
    
    // 核心修复：上级目录兼容 Windows
    document.getElementById('btnParentDir').onclick = () => {
        let path = state.currentDirectory;
        if (path.endsWith('/')) path = path.slice(0, -1); // 移除末尾斜杠
        
        const lastSlashIndex = path.lastIndexOf('/');
        
        // Windows 根目录情况 (C:/)
        if (lastSlashIndex === -1 || (path.includes(':') && lastSlashIndex === path.indexOf('/') && path.indexOf('/') === 2)) {
            // 如果是 C:/ 或 C:，无法再向上了，或者跳回 /
            if (!path.includes('/')) navigateTo('/'); 
            else navigateTo(path.substring(0, lastSlashIndex + 1)); // C:/Users -> C:/
            return;
        }
        
        const parent = path.substring(0, lastSlashIndex) || '/';
        navigateTo(parent);
    };

    document.getElementById('btnRefresh').onclick = () => fetchFiles();
    document.getElementById('searchInput').oninput = debounce((e) => { state.keyword = e.target.value; state.page = 1; fetchFiles(); }, 500);
    document.getElementById('filterType').onchange = (e) => { state.fileType = e.target.value; state.page = 1; fetchFiles(); };
    document.getElementById('perPageSelect').onchange = (e) => { state.perPage = parseInt(e.target.value); state.page = 1; fetchFiles(); }
    document.getElementById('checkShowHidden').onchange = (e) => { state.showHidden = e.target.checked; fetchFiles(); };
    
    document.getElementById('fileUploadInput').onchange = handleLocalUpload;
    document.getElementById('btnRemoteUpload').onclick = handleRemoteUpload;
    document.getElementById('btnNewFile').onclick = handleCreateFile;
    document.getElementById('btnNewFolder').onclick = handleCreateFolder;
    document.getElementById('checkSelectAll').onchange = (e) => {
        document.querySelectorAll('#fileListBody input[type="checkbox"]').forEach(cb => cb.checked = e.target.checked);
        updateBatchButtonsState();
    };
    ['copy','move','delete','pack'].forEach(act => {
        const btn = document.querySelector(`button[data-action="batch-${act}"]`);
        if(btn) btn.onclick = () => handleBatchAction('batch-'+act);
    });

    document.getElementById('btnPrevPage').onclick = () => changePage(-1);
    document.getElementById('btnNextPage').onclick = () => changePage(1);
    
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.onclick = () => {
            const field = btn.dataset.sort;
            state.sortBy = field;
            state.order = state.order === 'asc' ? 'desc' : 'asc';
            fetchFiles();
        };
    });

    document.querySelector('#btnSaveEdit').onclick = saveEditorContent;
}

function unbindGlobalEvents() {
    window.removeEventListener('hashchange', handleHashChange);
}

function fetchFiles() {
    const tbody = document.getElementById('fileListBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center py-5"><span class="spinner-border spinner-border-sm text-primary" role="status"></span> 加载中...</td></tr>`;
    
    // 更新 Input 显示当前路径
    const input = document.getElementById('pathInput');
    if(input && document.activeElement !== input) {
        input.value = state.currentDirectory;
    }

    updateBatchButtonsState(true);

    API.getFiles({
        directory: state.currentDirectory,
        show_hidden: state.showHidden,
        page: state.page,
        per_page: state.perPage,
        sort_by: state.sortBy,
        order: state.order,
        type: state.fileType,
        keyword: state.keyword
    }).then(res => {
        state.files = res.data.files;
        state.total = res.data.total;
        state.totalPages = res.data.pages;
        renderTableRows();
        document.getElementById('pageInfoDisplay').textContent = `${state.page} / ${state.totalPages}`;
        document.getElementById('statusText').textContent = `共 ${state.total} 个项目`;
        document.getElementById('btnPrevPage').disabled = state.page <= 1;
        document.getElementById('btnNextPage').disabled = state.page >= state.totalPages;
        updateBreadcrumb();
    }).catch(err => {
        if(tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Error: ${err.message}</td></tr>`;
        Toast.error(err.message);
    });
}

// 核心修复：处理 Hash 变化，兼容 Windows 路径
function handleHashChange() {
    let hash = location.hash;
    
    if (hash === '#/fileexplorer' || hash === '#/fileexplorer/' || hash === '') {
        const savedHash = localStorage.getItem('lastFileHash');
        if (savedHash && savedHash.startsWith('#/fileexplorer/directory/')) {
            location.hash = savedHash;
            return;
        }
    }

    const match = hash.match(/^#\/fileexplorer\/directory\/([^?]+)(\?(.*))?/);
    
    let path = '/';
    const params = new URLSearchParams();

    if (match) {
        localStorage.setItem('lastFileHash', hash);
        path = decodeURIComponent(match[1]);
        if (match[3]) {
            new URLSearchParams(match[3]).forEach((val, key) => params.set(key, val));
        }
    }

    // --- 路径规范化 (核心修复逻辑) ---
    path = path.replace(/\\/g, '/'); // 统一斜杠

    // 检测是否为 Windows 路径 (例如 C: 或 C:/)
    const isWindowsPath = /^[a-zA-Z]:/.test(path);

    if (isWindowsPath) {
        // 如果是 Windows 路径，确保开头没有 /
        if (path.startsWith('/')) path = path.slice(1);
    } else {
        // 如果是 Linux 路径，确保开头有 /
        if (!path.startsWith('/')) path = '/' + path;
    }

    // 移除末尾斜杠 (除非是根路径 / 或 C:/)
    if (path.length > 1 && path.endsWith('/')) {
        // C:/ 长度为3，保留
        if ( !(isWindowsPath && path.length === 3) ) {
            path = path.slice(0, -1);
        }
    }

    state.currentDirectory = path;
    state.page = parseInt(params.get('page')) || 1;
    state.perPage = parseInt(params.get('perPage')) || 100;
    
    const perPageSelect = document.getElementById('perPageSelect');
    if(perPageSelect) perPageSelect.value = state.perPage;

    fetchFiles();
}

function fetchDisks() {
    API.getDisks().then(res => {
        const div = document.getElementById('diskListContainer');
        if(res.data.disks && res.data.disks.length > 0) {
            div.innerHTML = res.data.disks.filter(d => d.mountpoint).map(d => 
                `<a class="badge bg-light text-dark border text-decoration-none" href="#/fileexplorer/directory/${d.mountpoint}">
                    <i class="fas fa-hdd me-1 text-secondary"></i>${d.device}
                </a>`
            ).join('');
        }
    });
}

function updateBatchButtonsState(forceDisable = false) {
    const count = forceDisable ? 0 : document.querySelectorAll('#fileListBody input[type="checkbox"]:checked').length;
    document.querySelectorAll('button[data-action^="batch-"]').forEach(btn => {
        btn.disabled = count === 0;
        if (count > 0) {
            if (btn.classList.contains('btn-outline-secondary')) {
                btn.classList.remove('btn-outline-secondary');
                btn.classList.add(btn.dataset.action === 'batch-delete' ? 'btn-danger' : 'btn-primary');
            }
        } else {
            if (btn.classList.contains('btn-primary') || btn.classList.contains('btn-danger')) {
                const isDelete = btn.dataset.action === 'batch-delete';
                btn.className = isDelete ? 'btn btn-outline-danger' : 'btn btn-outline-secondary';
            }
        }
    });
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => Toast.success('路径已复制'));
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try { document.execCommand('copy'); Toast.success('路径已复制'); } catch (err) { Toast.error('复制失败'); }
        document.body.removeChild(textArea);
    }
}

function executeFileAction(action, path, isDir) {
    switch (action) {
        case 'copyPath': copyToClipboard(path); break;
        case 'rename':
            const newName = prompt('重命名为:', path.split('/').pop());
            if (newName && newName !== path.split('/').pop()) {
                API.rename(path, newName).then(() => { Toast.success('重命名成功'); fetchFiles(); }).catch(e => Toast.error(e.message));
            }
            break;
        case 'delete':
            if (confirm('确定删除此项目吗？')) {
                API.delete([path]).then(() => { Toast.success('删除成功'); fetchFiles(); }).catch(e => Toast.error(e.message));
            }
            break;
        case 'download': window.open(`${BASE_URL}files/download/${path}`, '_blank'); break;
        case 'edit': openEditor(path); break;
        case 'attr': API.getAttr(path, isDir).then(res => alert(JSON.stringify(res.data, null, 2))); break;
        case 'copy': case 'move':
            const dest = prompt('目标路径:', state.currentDirectory);
            if (!dest) return;
            (action === 'copy' ? API.copy : API.move)([path], dest).then(() => { Toast.success('操作成功'); fetchFiles(); });
            break;
        case 'unpack':
            const unpackDest = prompt('解压到:', state.currentDirectory);
            if(unpackDest) API.unpack(path, unpackDest).then(() => { Toast.success('解压任务已提交'); fetchFiles(); });
            break;
    }
}

function handleBatchAction(actionType) {
    const selectedPaths = Array.from(document.querySelectorAll('#fileListBody input[type="checkbox"]:checked')).map(cb => cb.dataset.path);
    if (selectedPaths.length === 0) return;
    if (actionType === 'batch-delete') {
        if (confirm(`确定永久删除这 ${selectedPaths.length} 个项目吗？`)) {
            API.delete(selectedPaths).then(() => { Toast.success('批量删除成功'); fetchFiles(); });
        }
    } else if (actionType === 'batch-pack') {
        const name = prompt('压缩包名称:', 'archive.zip');
        if(name) API.pack(selectedPaths, state.currentDirectory + '/' + name).then(() => { Toast.success('压缩开始'); fetchFiles(); });
    } else {
        const dest = prompt('目标路径:', state.currentDirectory);
        if (!dest) return;
        const apiCall = actionType === 'batch-copy' ? API.copy : API.move;
        apiCall(selectedPaths, dest).then(() => { Toast.success('批量操作成功'); fetchFiles(); });
    }
}

function handleLocalUpload() {
    if (this.files.length === 0) return;
    const form = new FormData();
    Array.from(this.files).forEach(f => form.append('files', f));
    form.append('directory', state.currentDirectory);
    Toast.info('正在上传...');
    API.upload(form).then(res => { Toast.success(res.data.message); fetchFiles(); this.value = ''; })
        .catch(err => Toast.error(err.message));
}

function handleRemoteUpload() {
    const url = prompt('请输入远程文件 URL:');
    if (url) {
        Toast.info('任务提交中...');
        API.uploadRemote({ directory: state.currentDirectory, url }).then(res => { Toast.success(res.data.message); fetchFiles(); });
    }
}

function handleCreateFile() {
    const name = prompt('文件名:', 'new_file.txt');
    if (name) API.createFile(state.currentDirectory + '/' + name).then(() => { Toast.success('文件已创建'); fetchFiles(); });
}

function handleCreateFolder() {
    const name = prompt('文件夹名:', 'New Folder');
    if (name) API.createDir(state.currentDirectory + '/' + name).then(() => { Toast.success('文件夹已创建'); fetchFiles(); });
}

function openEditor(path) {
    API.getContent(path).then(data => {
        if (typeof data.content === 'string') {
            state.selectedFilePath = path;
            const textarea = document.getElementById('editorTextarea');
            const lineNumbers = document.getElementById('editorLineNumbers');
            
            textarea.value = data.content;

            // --- 行号逻辑开始 ---
            const updateLineNumbers = () => {
                // 计算行数
                const lines = textarea.value.split('\n').length;
                // 生成 1<br>2<br>3...
                // 使用 Array.from 性能稍好于 fill
                lineNumbers.innerHTML = Array.from({length: lines}, (_, i) => i + 1).join('<br>');
            };

            // 1. 初始化行号
            updateLineNumbers();

            // 2. 监听输入，更新行号
            // 移除旧的监听器防止重复绑定（虽然 renderLayout 每次都会重建 DOM，但这是好习惯）
            textarea.oninput = updateLineNumbers;

            // 3. 监听滚动，同步行号容器的 scrollTop
            textarea.onscroll = () => {
                lineNumbers.scrollTop = textarea.scrollTop;
            };
            
            // 4. 支持 Tab 键缩进 (可选优化，提升体验)
            textarea.onkeydown = (e) => {
                if (e.key === 'Tab') {
                    e.preventDefault();
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    textarea.value = textarea.value.substring(0, start) + "\t" + textarea.value.substring(end);
                    textarea.selectionStart = textarea.selectionEnd = start + 1;
                }
            };
            // --- 行号逻辑结束 ---

            if (state.editorModalInstance) {
                state.editorModalInstance.show();
                // 模态框完全显示后重置滚动位置，防止上次遗留
                setTimeout(() => {
                    textarea.scrollTop = 0;
                    lineNumbers.scrollTop = 0;
                }, 200);
            }
        } else {
            Toast.error('无法编辑此类型文件');
        }
    }).catch(e => Toast.error(e.message));
}

function saveEditorContent() {
    const content = document.getElementById('editorTextarea').value;
    const form = new FormData();
    form.append('file_path', state.selectedFilePath);
    form.append('content', content);
    API.saveContent(form).then(res => {
        Toast.success(res.message);
        if (state.editorModalInstance) {
            state.editorModalInstance.hide();
        }
        fetchFiles();
    }).catch(e => Toast.error(e.message));
}

function navigateTo(path) { location.hash = `#/fileexplorer/directory/${path}`; }
function changePage(delta) {
    const newPage = state.page + delta;
    if (newPage >= 1 && newPage <= state.totalPages) {
        state.page = newPage;
        // 保持 perPage
        location.hash = `#/fileexplorer/directory/${state.currentDirectory}?page=${newPage}&perPage=${state.perPage}`;
    }
}
function getFileIconClass(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg','jpeg','png','gif','webp'].includes(ext)) return 'fa-file-image text-info';
    if (['pdf'].includes(ext)) return 'fa-file-pdf text-danger';
    if (['zip','rar','7z','gz','tar'].includes(ext)) return 'fa-file-archive text-warning';
    if (['js','css','html','json','py','php','xml'].includes(ext)) return 'fa-file-code text-primary';
    if (['mp4','mkv','avi','mov'].includes(ext)) return 'fa-file-video text-danger';
    if (['mp3','wav','ogg'].includes(ext)) return 'fa-file-audio text-info';
    return 'fa-file text-secondary';
}
function escapeHtml(text) { return text.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
function isArchive(name) { return SUPPORTED_ARCHIVES.some(ext => name.toLowerCase().endsWith(ext)); }
function previewFile(path) {
    const ext = path.split('.').pop().toLowerCase();
    if (['jpg','jpeg','png','gif','webp','svg','pdf','mp4'].includes(ext)) {
        window.open(`${BASE_URL}files/preview/${path}`, '_blank');
    } else {
        openEditor(path);
    }
}
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}