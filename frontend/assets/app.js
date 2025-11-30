/* ===========================
   1. 配置与静态数据 (Config & Data)
   =========================== */

/** 导航配置数据 */
const NAV_DATA = [
    { icon: '<i class="fas fa-home"></i>', label: '首页', page: 'home' },
    { icon: '<i class="fas fa-folder"></i>', label: '文件浏览', page: 'fileexplorer' },
    { icon: '<i class="fas fa-terminal"></i>', label: '命令执行', page: 'webshell' },
    { icon: '<i class="fas fa-server"></i>', label: '服务管理', page: 'servicemanager' },
    { icon: '<i class="fas fa-chart-pie"></i>', label: '资源监控', page: 'sysinfo' },
];

/** 全局常量 */
const CONSTANTS = {
    DEFAULT_PAGE: 'home',
    DOCK_MAX_ITEMS: 4, // 移动端底部显示4个，第5个为“更多”
    TOAST_DURATION: 3000,
};

/* ===========================
   2. 状态管理 (State Management)
   =========================== */

const useAppState = (() => {
    // 自动检测系统主题
    const preferDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    const initialState = {
        currentPage: CONSTANTS.DEFAULT_PAGE,
        subpath: null,    // 恢复：子路径支持
        routeParams: {},  // 恢复：URL查询参数 (?page=1&sort=name)
        theme: preferDark ? 'dark' : 'light',
        user: null,
    };

    const state = { ...initialState };
    const listeners = new Set();

    /** 获取当前状态副本 */
    function getState() {
        return { ...state };
    }

    /** 更新状态并触发通知 */
    function setState(partial, silent = false) {
        if (!partial || typeof partial !== 'object') return;

        let hasChanges = false;
        for (const key in partial) {
            if (state[key] !== partial[key]) {
                state[key] = partial[key];
                hasChanges = true;
            }
        }

        if (hasChanges && !silent) {
            notify();
        }
    }

    /** 订阅状态变更 */
    function subscribe(fn) {
        if (typeof fn !== 'function') return () => {};
        listeners.add(fn);
        // 首次订阅立即触发一次
        try { fn(getState()); } catch (err) { console.error(err); }
        return () => listeners.delete(fn);
    }

    function notify() {
        const snapshot = getState();
        listeners.forEach(fn => {
            try { fn(snapshot); } catch (err) { console.error(err); }
        });
    }

    return { getState, setState, subscribe };
})();

/* ===========================
   3. 路由管理 (Router) - 恢复完整解析逻辑
   =========================== */

const Router = (() => {
    const validPages = new Set(NAV_DATA.map(item => item.page));

    /** 解析当前 URL Hash (支持 /page/subpath?query=1) */
    function parseHashRoute() {
        const rawHash = window.location.hash || '';
        const hash = rawHash.replace(/^#\/?/, ''); // 移除开头的 # 或 #/
        
        if (!hash) return { page: CONSTANTS.DEFAULT_PAGE, subpath: null, params: {} };

        const [pathPart = '', queryPart = ''] = hash.split('?');
        const pathSegments = pathPart.split('/').filter(Boolean);
        
        const page = pathSegments[0] || CONSTANTS.DEFAULT_PAGE;
        // 恢复：支持子路径 (例如 fileexplorer/directory/etc)
        const subpath = pathSegments.slice(1).join('/') || null;

        // 恢复：解析 URL 参数
        const params = {};
        if (queryPart) {
            const searchParams = new URLSearchParams(queryPart);
            searchParams.forEach((value, key) => {
                params[key] = value;
            });
        }

        return { page, subpath, params };
    }

    /** 处理 Hash 变更 */
    function handleHashChange() {
        const { page, subpath, params } = parseHashRoute();
        
        // 页面白名单校验
        const targetPage = validPages.has(page) ? page : CONSTANTS.DEFAULT_PAGE;

        useAppState.setState({
            currentPage: targetPage,
            subpath,
            routeParams: params,
        });

        // 路由跳转时自动关闭 Dock 菜单
        Dock.closeMenu();
    }

    /** 编程式导航 */
    function navigateTo(page, params = {}, subpath = null) {
        let url = `#/${page}`;
        if (subpath) url += `/${subpath}`;
        
        const queryString = new URLSearchParams(params).toString();
        if (queryString) url += `?${queryString}`;

        window.location.hash = url;
    }

    function init() {
        window.addEventListener('hashchange', handleHashChange);
        setTimeout(handleHashChange, 0); // 确保初始化时触发一次
    }

    return { init, navigateTo };
})();

/* ===========================
   4. 页面管理器 (PageManager) - 恢复 Hooks 机制
   =========================== */

const PageManager = (() => {
    let currentPageName = null;
    const pageHooks = {}; // 存储注册的钩子 { onEnter, onLeave }
    const pageCache = new Map();

    /** 注册页面生命周期钩子 (这是 fileexplorer.js 需要的关键) */
    function registerHooks(pageName, { onEnter, onLeave } = {}) {
        pageHooks[pageName] = { onEnter, onLeave };
    }

    /** 获取页面 DOM 元素 */
    function getPageElement(pageName) {
        if (!pageCache.has(pageName)) {
            const el = document.querySelector(`.page[data-page="${pageName}"]`);
            if (el) pageCache.set(pageName, el);
        }
        return pageCache.get(pageName);
    }

    /** 处理状态变更，触发钩子 */
    function handleStateChange(state) {
        const nextPageName = state.currentPage;
        if (!nextPageName || nextPageName === currentPageName) return;

        // 1. 触发旧页面的 onLeave
        if (currentPageName && pageHooks[currentPageName]?.onLeave) {
            try {
                pageHooks[currentPageName].onLeave(state);
            } catch (err) {
                console.error(`[PageManager] Error in ${currentPageName}.onLeave:`, err);
            }
        }

        // 2. 切换 DOM 显示
        // 先隐藏所有
        document.querySelectorAll('.page').forEach(el => el.style.display = 'none');

        const targetEl = getPageElement(nextPageName);
        if (targetEl) {
            targetEl.style.display = 'block';

            // 3. 触发新页面的 onEnter (关键恢复点)
            if (pageHooks[nextPageName]?.onEnter) {
                try {
                    pageHooks[nextPageName].onEnter(state);
                } catch (err) {
                    console.error(`[PageManager] Error in ${nextPageName}.onEnter:`, err);
                }
            } else {
                // 如果没有注册钩子，显示默认占位
                if (!targetEl.innerHTML.trim()) {
                    targetEl.innerHTML = `
                        <div class="d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                            <i class="fas fa-tools fa-3x mb-3 opacity-25"></i>
                            <h3 class="h5">${nextPageName.toUpperCase()}</h3>
                            <p class="small">Function under construction</p>
                        </div>
                    `;
                }
            }
        }

        currentPageName = nextPageName;
    }

    function init() {
        useAppState.subscribe(handleStateChange);
    }

    return { init, registerHooks };
})();

/* ===========================
   5. PC 侧边栏 (Sidebar) - Bootstrap 样式
   =========================== */

const Sidebar = (() => {
    let container = null;

    function render(state) {
        if (!container) return;

        const frag = document.createDocumentFragment();
        
        NAV_DATA.forEach(item => {
            const li = document.createElement('li');
            li.className = 'nav-item';
            
            // 构建 Bootstrap Nav Link
            // 注意：onclick 使用 Router.navigateTo
            const a = document.createElement('a');
            a.href = 'javascript:;';
            a.className = `nav-link ${state.currentPage === item.page ? 'active' : ''}`;
            a.innerHTML = `<span class="me-0 me-md-2 d-flex justify-content-center align-items-center icon-box">${item.icon}</span> <span class="nav-text">${item.label}</span>`;
            
            // 处理点击
            a.onclick = (e) => {
                e.preventDefault();
                Router.navigateTo(item.page);
            };

            li.appendChild(a);
            frag.appendChild(li);
        });

        container.innerHTML = '';
        container.appendChild(frag);
    }

    function init(elementId = 'nav-list') {
        container = document.getElementById(elementId);
        if (!container) return;
        useAppState.subscribe(render);
    }

    return { init };
})();

/* ===========================
   6. 移动端 Dock (Standard Tabs + Bottom Sheet)
   =========================== */

const Dock = (() => {
    let dockContainer, backdrop, sheet, sheetList;

    function renderDock(state) {
        if (!dockContainer) return;

        const max = CONSTANTS.DOCK_MAX_ITEMS;
        const visibleItems = NAV_DATA.slice(0, max);
        const hasOverflow = NAV_DATA.length > max;
        
        // 检查溢出菜单中是否有激活项
        const overflowItems = NAV_DATA.slice(max);
        const isOverflowActive = overflowItems.some(i => i.page === state.currentPage);

        let html = visibleItems.map(item => `
            <button class="dock-tab ${state.currentPage === item.page ? 'active' : ''}" 
                    onclick="window.Router.navigateTo('${item.page}')">
                ${item.icon}
                <span>${item.label}</span>
            </button>
        `).join('');

        // 渲染“更多”按钮
        if (hasOverflow) {
            html += `
                <button class="dock-tab ${isOverflowActive ? 'active' : ''}" onclick="window.Dock.openMenu()">
                    <i class="fas fa-ellipsis-h"></i>
                    <span>更多</span>
                </button>
            `;
        }

        dockContainer.innerHTML = html;
    }

    function renderSheetList(state) {
        if (!sheetList) return;
        const overflowItems = NAV_DATA.slice(CONSTANTS.DOCK_MAX_ITEMS);

        sheetList.innerHTML = overflowItems.map(item => `
            <div class="sheet-item cursor-pointer ${state.currentPage === item.page ? 'text-primary bg-primary-subtle rounded' : ''}"
                 onclick="window.Router.navigateTo('${item.page}')">
                ${item.icon}
                <span class="ms-3 fw-medium">${item.label}</span>
                ${state.currentPage === item.page ? '<i class="fas fa-check ms-auto fs-6"></i>' : ''}
            </div>
        `).join('');
    }

    function openMenu() {
        if (backdrop && sheet) {
            backdrop.classList.add('show');
            sheet.classList.add('show');
        }
    }

    function closeMenu() {
        if (backdrop && sheet) {
            backdrop.classList.remove('show');
            sheet.classList.remove('show');
        }
    }

    function init(dockId = 'dock') {
        dockContainer = document.getElementById(dockId);
        backdrop = document.getElementById('sheet-backdrop');
        sheet = document.getElementById('sheet-menu');
        sheetList = document.getElementById('sheet-list');

        if (backdrop) backdrop.onclick = closeMenu;
        const closeBtn = document.getElementById('sheet-close');
        if (closeBtn) closeBtn.onclick = closeMenu;

        // 暴露给 HTML onclick 使用
        window.Dock = { openMenu, closeMenu };
        window.Router = Router; // 确保 HTML onclick 能访问 Router

        useAppState.subscribe(state => {
            renderDock(state);
            renderSheetList(state);
        });
    }

    return { init, openMenu, closeMenu };
})();

/* ===========================
   7. 通知组件 (Toast) - 保持 Bootstrap 风格
   =========================== */

const Toast = (() => {
    let container = null;

    function createContainer() {
        container = document.getElementById('toast-container');
    }

    function show(message, type = 'info', duration = CONSTANTS.TOAST_DURATION) {
        if (!container) createContainer();

        const toast = document.createElement('div');
        toast.className = `custom-toast ${type}`; // 样式在 CSS 中定义
        
        let iconHtml = '';
        if (type === 'success') iconHtml = '<i class="fas fa-check-circle me-2 text-success"></i>';
        if (type === 'error') iconHtml = '<i class="fas fa-exclamation-circle me-2 text-danger"></i>';
        if (type === 'info') iconHtml = '<i class="fas fa-info-circle me-2 text-primary"></i>';
        if (type === 'warning') iconHtml = '<i class="fas fa-exclamation-triangle me-2 text-warning"></i>';

        toast.innerHTML = `${iconHtml}<span>${message}</span>`;
        container.appendChild(toast);

        // 动画
        requestAnimationFrame(() => toast.classList.add('show'));

        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => {
                if (toast.parentNode) toast.remove();
            });
        }, duration);
    }

    return {
        info: (msg) => show(msg, 'info'),
        success: (msg) => show(msg, 'success'),
        warning: (msg) => show(msg, 'warning'),
        error: (msg) => show(msg, 'error'),
    };
})();

/* ===========================
   8. 应用入口 (Entry)
   =========================== */

function bindGlobalUIEvents() {
    // 1. 主题切换
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.onclick = () => {
            const current = useAppState.getState().theme;
            const next = current === 'light' ? 'dark' : 'light';
            useAppState.setState({ theme: next });
            
            // 应用到 HTML 标签
            document.documentElement.setAttribute('data-bs-theme', next);
            
            // 切换图标
            const icon = themeToggle.querySelector('i');
            if (icon) icon.className = next === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        };
    }
    
    // 初始化应用当前主题
    const initialTheme = useAppState.getState().theme;
    document.documentElement.setAttribute('data-bs-theme', initialTheme);
    if(themeToggle) {
        const icon = themeToggle.querySelector('i');
        if (icon) icon.className = initialTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }

    // 2. 通知按钮
    const notifyBtn = document.getElementById('notify');
    if (notifyBtn) {
        notifyBtn.onclick = () => Toast.info('你有 3 条新通知');
    }

    // 3. 用户下拉菜单
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    if (userMenuBtn && userDropdown) {
        userMenuBtn.onclick = (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('d-none');
            userDropdown.classList.toggle('show');
        };
        document.addEventListener('click', (e) => {
            if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.classList.add('d-none');
                userDropdown.classList.remove('show');
            }
        });
    }
}

// 启动
(function initApp() {
    PageManager.init();
    Sidebar.init('nav-list');
    Dock.init('dock');
    
    bindGlobalUIEvents();

    window.addEventListener('DOMContentLoaded', () => {
        Router.init();
    });
})();

/* ===========================
   Exports
   =========================== */
export {
    useAppState,
    Router,
    PageManager,
    Toast
};