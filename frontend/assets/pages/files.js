// pages/files.js

import { Router, useAppState, PageManager, Toast } from '../app.js';

PageManager.registerHooks('files', {
    onEnter(state) {
        console.log('🪵 进入日志页', state.routeParams);
        renderLogsPage();
    },
    onLeave() {
        console.log('🚪 离开日志页');
    }
});

function renderLogsPage() {
    const page = document.querySelector('.page[data-page="files"]');
    if (!page) return;

    page.innerHTML = `
        <h2>系统日志</h2>
        <div id="log-container" class="log-container">
            <p>加载日志中...</p>
        </div>
    `;

    // 模拟异步加载日志数据
    setTimeout(() => {
        const logs = [
            '2025-10-26 12:00:01 - 应用启动',
            '2025-10-26 12:00:05 - 用户登录成功',
            '2025-10-26 12:01:12 - 文件上传完成'
        ];
        const container = document.getElementById('log-container');
        container.innerHTML = logs.map(line => `<div class="log-line">${line}</div>`).join('');
    }, 800);
}
