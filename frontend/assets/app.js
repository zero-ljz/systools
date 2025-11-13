
/* ===========================
   全局状态管理 useAppState（保持接口与行为）
   - getState / setState / subscribe / reset / log
   - 优化：subscribe 初次触发仍保留，但保证每个订阅者只被添加一次（Set）
   =========================== */
const useAppState = (() => {
    // 初始 state（与原始保持一致）
    const state = {
        currentPage: 'home',
        theme: 'light',
        user: null,
        notifications: [],
        windows: [],
        plugins: {},
    };

    const listeners = new Set();

    function getState() {
        // 返回浅拷贝，避免外部直接修改内部 state
        return { ...state };
    }

    function setState(partial, silent = false) {
        if (!partial || typeof partial !== 'object') return;
        Object.assign(state, partial);
        if (!silent) notify();
    }

    function subscribe(fn) {
        if (typeof fn !== 'function') return () => {};
        listeners.add(fn);
        try {
            fn(getState()); // 初次触发（保留原行为）
        } catch (err) {
            console.error('useAppState subscriber initial call error:', err);
        }
        return () => listeners.delete(fn);
    }

    function notify() {
        const snapshot = getState();
        // 用 for-of 保证同步调用并捕获每个 listener 的异常
        for (const fn of Array.from(listeners)) {
            try {
                fn(snapshot);
            } catch (err) {
                // 单个 listener 抛错不影响其他 listener
                console.error('useAppState subscriber error:', err);
            }
        }
    }

    function reset(keys = []) {
        if (!Array.isArray(keys)) return;
        keys.forEach(k => {
            if (k in state) state[k] = null;
        });
        notify();
    }

    function log() {
        console.log('🧠 AppState:', getState());
    }

    return {
        getState,
        setState,
        subscribe,
        reset,
        log,
    };
})();



/* -------- 导航数据（保持不变） -------- */
const navData = [
    { icon: '🏠', label: '首页', page: 'home' },
    { icon: '📂', label: 'File Explorer', page: 'fileexplorer' },
    { icon: '🌐', label: 'Web Shell', page: 'webshell' },
    { icon: '🔧', label: 'Service Manager', page: 'servicemanager' },
    { icon: '📊', label: 'Sysinfo', page: 'sysinfo' },
];

/* ===========================
   路由 Router（保持原逻辑）
   - parseHashRoute / handleHashChange / navigateTo / init
   - 优化：对 hash 解析增加健壮性
   =========================== */
const Router = (() => {
    const validPages = navData.map(item => item.page);
    const defaultPage = 'home';

    function parseHashRoute() {
        // 支持空 hash
        const rawHash = window.location.hash || '';
        const hash = rawHash.slice(2); // 去掉 "#/"
        if (!hash) return { page: defaultPage, subpath: null, params: {} };

        const [pathPart = '', queryPart = ''] = hash.split('?');
        const pathSegments = pathPart.split('/').filter(Boolean);
        const page = pathSegments[0] || defaultPage;
        const subpath = pathSegments[1] || null;

        const params = {};
        if (queryPart) {
            queryPart.split('&').forEach(pair => {
                const [key, value] = pair.split('=');
                if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || '');
            });
        }

        return { page, subpath, params };
    }

    function handleHashChange() {
        const { page, subpath, params } = parseHashRoute();
        const targetPage = validPages.includes(page) ? page : defaultPage;

        // 更新状态管理器（与原逻辑一致）
        useAppState.setState({
            currentPage: targetPage,
            subpath,
            routeParams: params,
        });

        // 关闭 Dock 菜单（原逻辑）
        document.getElementById('dock-menu')?.classList.add('hidden');
    }

    function navigateTo(page, params = {}, subpath = null) {
        // 保持你原来的 query 拼接方式
        const query = Object.entries(params)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        const path = `#/${page}${subpath ? '/' + subpath : ''}${query ? '?' + query : ''}`;
        window.location.hash = path;
    }

    function init() {
        window.addEventListener('hashchange', handleHashChange);
        handleHashChange(); // 首次加载触发（保留原行为）
    }

    return {
        init,
        navigateTo,
    };
})();


/* ===========================
   页面管理 PageManager（生命周期钩子保留）
   - registerHooks / showPage / handlePageChange / init
   - 优化：避免重复 showPage 操作
   =========================== */
const PageManager = (() => {
    let currentPage = null;

    // 页面生命周期钩子（可选）
    const pageHooks = {
        // 'files': { onEnter: fn, onLeave: fn }
    };

    function registerHooks(page, { onEnter, onLeave }) {
        pageHooks[page] = { onEnter, onLeave };
    }

    function showPage(pageName) {
        // 只在页面实际有变更时操作 DOM（减少不必要操作）
        document.querySelectorAll('.page').forEach(p => {
            p.style.display = p.dataset.page === pageName ? 'block' : 'none';
        });
    }

    function handlePageChange(state) {
        const nextPage = state.currentPage;
        if (!nextPage || nextPage === currentPage) return;

        // 调用 onLeave 钩子（保持原行为）
        if (currentPage && pageHooks[currentPage]?.onLeave) {
            try { pageHooks[currentPage].onLeave(state); } catch (err) { console.error(err); }
        }

        // 切换页面视图
        showPage(nextPage);

        // 调用 onEnter 钩子（保持原行为）
        if (pageHooks[nextPage]?.onEnter) {
            try { pageHooks[nextPage].onEnter(state); } catch (err) { console.error(err); }
        }

        currentPage = nextPage;
    }

    function init() {
        useAppState.subscribe(handlePageChange);
    }

    return {
        init,
        registerHooks,
    };
})();





















/* ===========================
   渲染：左侧导航（renderSidebarNav）
   - 保持行为：点击项调用 Router.navigateTo(page)
   - 优化：缓存 container 检查、避免每次重复创建闭包函数
   =========================== */
function renderSidebarNav(container) {
    if (!container) return; // 健壮性检查

    // update 会在 state 变化时被调用
    function update(state) {
        container.innerHTML = ''; // 清空
        // 使用 DocumentFragment 批量插入，减少回流
        const frag = document.createDocumentFragment();

        navData.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `<i>${item.icon}</i><span>${item.label}</span>`;
            li.dataset.page = item.page;
            li.className = state.currentPage === item.page ? 'active' : '';

            // 事件绑定直接写在这里（与原逻辑一致）
            li.onclick = () => Router.navigateTo(item.page);

            frag.appendChild(li);
        });

        container.appendChild(frag);
    }

    // 首次渲染（使用当前快照）
    update(useAppState.getState());
    // 订阅状态变更（useAppState 会在 subscribe 时立即触发一次）
    useAppState.subscribe(update);
}


/* ===========================
   渲染：底部 Dock（renderDock）
   - 保留 overflow 与 "更多" 行为
   - 优化：缓存常量、使用 DocumentFragment、检查容器
   =========================== */
function renderDock(container) {
    if (!container) return;

    const max = 5;
    // visible 是第一组候选项（原逻辑）
    const visible = navData.slice(0, max);
    const hasOverflow = navData.length > max;

    function update(state) {
        container.innerHTML = '';
        const frag = document.createDocumentFragment();

        // 如果有 overflow：仅显示前 4 个 + 一个 more（符合原实现）
        const showCount = hasOverflow ? 4 : 5;
        visible.slice(0, showCount).forEach(item => {
            const el = document.createElement('div');
            el.className = 'icon';
            if (state.currentPage === item.page) el.classList.add('active');
            el.innerHTML = `<i title="${item.label}">${item.icon}</i>`;
            el.dataset.page = item.page;
            el.onclick = () => Router.navigateTo(item.page);
            frag.appendChild(el);
        });

        if (hasOverflow) {
            const more = document.createElement('div');
            more.className = 'icon';
            more.innerHTML = `<i title="更多">⋯</i>`;
            // 调用你原先的 toggleDockMenu（行为保持一致）
            more.onclick = toggleDockMenu;
            frag.appendChild(more);
        }

        container.appendChild(frag);
    }

    update(useAppState.getState());
    useAppState.subscribe(update);
}


/* ===========================
   Dock 菜单切换（toggleDockMenu）
   - 保留原有行为：显示剩余 nav 项，active 标识，点击跳转后隐藏菜单
   - 优化：健壮性检查、避免重复 DOM 查询
   =========================== */
function toggleDockMenu() {
    const menu = document.getElementById('dock-menu');
    if (!menu) return;

    // 如果已经展示就隐藏（与原逻辑一致）
    if (!menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
        return;
    }

    // 剩余项从第 5 个开始（原逻辑 slice(4)）
    const remaining = navData.slice(4);
    const state = useAppState.getState();

    menu.innerHTML = '';
    const ul = document.createElement('ul');

    remaining.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `<i>${item.icon}</i> ${item.label}`;
        if (state.currentPage === item.page) li.classList.add('active');
        li.onclick = () => {
            Router.navigateTo(item.page);
            menu.classList.add('hidden');
        };
        ul.appendChild(li);
    });

    menu.appendChild(ul);
    menu.classList.remove('hidden');
}

/* 点击其他区域关闭 Dock 菜单（原逻辑保留）
   - 优化：提前缓存 menu 元素引用（避免每次查找）
*/
(function setupDockMenuClose() {
    // 这里不 cache menu 永久引用，因为 menu 可能在 DOM 异步变更，但查一次 ok
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('dock-menu');
        if (!menu) return;
        if (!menu.contains(e.target) && !e.target.closest('.dock')) {
            menu.classList.add('hidden');
        }
    });
})();



/* ===========================
   Toast 通知系统（保持 API 与行为）
   - info / success / warning / error
   - 优化：缓存 container、异常安全处理
   =========================== */
const Toast = (() => {
    let container = null;

    function ensureContainer() {
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }
    }

    function show(message, type = 'info', duration = 3000) {
        ensureContainer();

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        // 使用 setTimeout 隐藏（与原实现一致）
        setTimeout(() => {
            toast.classList.add('fade-out');
            toast.addEventListener('transitionend', () => {
                toast.remove();
            });
        }, duration);
    }

    return {
        info: (msg, ms) => show(msg, 'info', ms),
        success: (msg, ms) => show(msg, 'success', ms),
        warning: (msg, ms) => show(msg, 'warning', ms),
        error: (msg, ms) => show(msg, 'error', ms),
    };
})();


/* ===========================
   页面交互：初始化与事件绑定（保持行为）
   - renderSidebarNav / renderDock / PageManager.init / Router.init
   - Toast 快速演示（保留你的调用）
   =========================== */
(function initApp() {
    // 缓存常用 DOM 节点（健壮性检查）
    const navListEl = document.getElementById('nav-list');
    const dockEl = document.getElementById('dock');

    // 渲染（这些函数内部会订阅 state）
    renderSidebarNav(navListEl);
    renderDock(dockEl);

    // 启动页面管理与路由
    PageManager.init();
    
    // ✅ 延后 Router.init() 到 DOM 完成渲染之后
    window.addEventListener('DOMContentLoaded', () => {
        Router.init();
    });

    // 保留你原有的 Toast 显示调用（示例用）
    Toast.info('这是一个信息提示');
    Toast.success('保存成功', 2000);
    Toast.warning('请检查输入');
    Toast.error('操作失败', 5000);

    // 原先的按钮绑定（保留）
    const notifyBtn = document.getElementById('notify');
    if (notifyBtn) {
        notifyBtn.onclick = () => {
            alert('你有 3 条新通知');
        };
    }

    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.onclick = () => {
            document.body.classList.toggle('dark-theme');
        };
    }

    const settingsBtn = document.getElementById('settings');
    if (settingsBtn) {
        settingsBtn.onclick = () => {
            alert('打开设置面板');
        };
    }

    // 用户菜单下拉（保留原行为）
    const userIcon = document.querySelector('.user-menu');
    const dropdown = document.querySelector('.user-dropdown');

    if (userIcon && dropdown) {
        userIcon.onclick = (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
        };

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.user-menu')) {
                dropdown.classList.add('hidden');
            }
        });
    }
})();

/* ===========================
   工具函数：添加通知（与原始 addNotification 保持完全一致）
   =========================== */
function addNotification(message, icon = '🔔') {
    const list = document.getElementById('notify-list');
    if (!list) return;
    const li = document.createElement('li');
    li.textContent = `${icon} ${message}`;
    list.prepend(li);
}



export {
    useAppState,
    Router,
    PageManager,
    Toast,
    addNotification
};


/* ===========================
   End of app.js
   =========================== */
