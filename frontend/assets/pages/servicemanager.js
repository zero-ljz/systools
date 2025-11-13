// pages/servicemanager.js

import { Router, useAppState, PageManager, Toast } from '../app.js';

PageManager.registerHooks('servicemanager', {
    onEnter(state) {
        console.log('进入servicemanager页', state.routeParams);
        renderServicemanagerPage();
    },
    onLeave() {
        console.log('离开servicemanager页');
    }
});

function renderServicemanagerPage() {
    const page = document.querySelector('.page[data-page="servicemanager"]');
    if (!page) return;

    page.innerHTML = `

          <section>
    <div class="container">
      <h1 class="title">服务管理器</h1>
      <!-- 测试启动 -->
      <form method="get" id="form2" class="box">
        <div class="field">
          <label class="label">Command</label>
          <div class="control">
            <input class="input" type="text" name="cmd" placeholder="Command">
          </div>
        </div>
        <div class="field">
          <label class="label">Working Directory</label>
          <div class="control">
            <input class="input" type="text" name="cwd" placeholder="Current Working Directory">
          </div>
        </div>
        <div class="field">
          <div class="control">
            <input class="button is-info" type="submit" value="Test Start">
          </div>
        </div>
      </form>

      
<!-- 查找进程 -->
      <form class="box" onsubmit="event.preventDefault(); openProcessModal();">
        <div class="field is-grouped">
          <div class="control is-expanded">
            <input class="input" type="text" id="cmdLineInput" placeholder="Command Line 或 PID">
          </div>
          <div class="control">
            <button class="button is-link" type="submit">查找进程</button>
          </div>
        </div>
      </form>

      <!-- 服务列表 -->
      <div>
        <h2 class="title is-4">服务列表</h2>
        <div class="level is-mobile">
  <div class="level-left">
    <div class="buttons">
      <button class="button is-success" value="Start">Start</button>
      <button class="button is-danger" value="Stop">Stop</button>
    </div>
  </div>
  <div class="level-right">
    <button class="button is-primary" value="Add">Add</button>
  </div>
</div>
        <div class="table-container">
          <table class="table is-striped is-fullwidth" id="serviceTable"></table>
        </div>
      </div>



    </div>
  </section>


<!-- 模态框：进程列表 -->
  <div class="modal" id="processModal">
    <div class="modal-background" onclick="closeProcessModal()"></div>
    <div class="modal-card" style="width: 95%;">
      <header class="modal-card-head">
        <p class="modal-card-title">进程列表</p>
        <button class="delete" aria-label="close" onclick="closeProcessModal()"></button>
      </header>
      <section class="modal-card-body">
        <div class="buttons">
          <button class="button is-danger" onclick="terminateSelected()">批量终止选中进程</button>
        </div>
        <div id="processTableContainer" class="table-container"></div>
      </section>
      <footer class="modal-card-foot">
        <button class="button" onclick="closeProcessModal()">关闭</button>
      </footer>
    </div>
  </div>
    `;
initPage();
}

   const BASE_URL = getBaseUrl() + 'service_manager/';
    console.log("BASE_URL:", BASE_URL);

   function createServiceTable(services) {
      let table = document.createElement('table');
      table.className = 'table is-striped is-fullwidth';
      table.innerHTML = `
        <thead>
          <tr>
            <th><input type="checkbox" onclick="document.querySelectorAll('table > tbody tr td input[type=checkbox]').forEach(cb => cb.checked = this.checked);"></th>
            <th>Name</th>
            <th>Command</th>
            <th>Working Directory</th>
            <th>Is Enable</th>
            <th>Status</th>
            <th>Actions</th>
            <th>Log</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      let tbody = table.querySelector('tbody');
      Object.entries(services).forEach(([name, service]) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><input type="checkbox" value="${name}"></td>
          <td><a href="#" onclick="location.href='${BASE_URL}update?name=${name}.json'; return false;">${name}</a></td>
          <td><textarea readonly class="textarea is-small">${service.cmd}</textarea></td>
          <td><textarea readonly class="textarea is-small">${service.cwd}</textarea></td>
          <td>${service.enabled ? '🟢' : '⚪'}</td>
          <td>${service.status}</td>
          <td>
            <button class="button is-small ${service.status.startsWith('running') ? 'is-danger' : 'is-success'}" onclick="
              this.disabled = true;
              (() => {
                fetch('${BASE_URL}${service.status.startsWith('running') ? 'stop' : 'start'}?name=' + encodeURIComponent('${name}'))
                .then(async resp => { alert(await resp.text()); this.disabled = false; location.reload(); });
              })();">${service.status.startsWith('running') ? 'Stop' : 'Start'}</button>
            <button class="button is-small is-danger" onclick="
              if (!confirm('你确定吗？')) return;
              this.disabled = true;
              (() => {
                fetch('${BASE_URL}delete?name=' + encodeURIComponent('${name}.json'))
                .then(async resp => { alert(await resp.text()); this.disabled = false; location.reload(); });
              })();">Delete</button>
          </td>
          <td>
            <a class="button is-small is-link" href="${BASE_URL}log_view?name=${name}.json">View</a>
            <button class="button is-small is-warning" onclick="
              if (!confirm('你确定吗？')) return;
              this.disabled = true;
              (() => {
                fetch('${BASE_URL}clear_log?name=' + encodeURIComponent('${name}.json'))
                .then(async resp => { alert(await resp.text()); this.disabled = false; location.reload(); });
              })();">Clear</button>
          </td>
        `;
        tbody.appendChild(row);
      });
      return table;
    }

    function getBaseUrl() {
      let { protocol, host, pathname } = window.location;
      if (!pathname.endsWith('/')) pathname += '/';
      const path = pathname.substring(0, pathname.lastIndexOf('/') + 1);
      return `${protocol}//${host}${path}`;
    }


function initPage() {

 

    fetch(BASE_URL + `services`)
      .then(response => response.json())
      .then(data => {
        document.querySelector('#serviceTable').replaceWith(createServiceTable(data));
      })
      .catch(error => console.error('获取服务列表时出错', error));

    document.querySelector('button[value="Add"]').addEventListener('click', () => {
      const q = prompt('请输入服务名称：', '');
      if (!q || q.trim() === '') return;
      location.href = BASE_URL + 'update?name=' + q + '.json';
    });

    document.querySelector('button[value="Start"]').addEventListener('click', () => {
      const names = Array.from(document.querySelectorAll('table tbody input[type=checkbox]:checked')).map(cb => cb.value);
      if (names.length === 0) return alert('你还没有选择任何一项');
      if (!confirm(`已选择 ${names.length} 项，确定启动？`)) return;
      fetch(BASE_URL + 'start?name=' + encodeURIComponent(names.join(',')))
        .then(async resp => { alert(await resp.text()); location.reload(); });
    });

    document.querySelector('button[value="Stop"]').addEventListener('click', () => {
      const names = Array.from(document.querySelectorAll('table tbody input[type=checkbox]:checked')).map(cb => cb.value);
      if (names.length === 0) return alert('你还没有选择任何一项');
      if (!confirm(`已选择 ${names.length} 项，确定停止？`)) return;
      fetch(BASE_URL + 'stop?name=' + encodeURIComponent(names.join(',')))
        .then(async resp => { alert(await resp.text()); location.reload(); });
    });


    const form2 = document.getElementById('form2');
  if (form2) {
    form2.addEventListener('submit', function (e) {
      // 如果需要阻止默认行为，可以加上：
      // e.preventDefault();

      // 动态设置 action
      this.action = BASE_URL + 'test_start';
    });
  }

}


function openProcessModal() {
      document.getElementById('processModal').classList.add('is-active');
      loadProcessList();
    }

    function closeProcessModal() {
      document.getElementById('processModal').classList.remove('is-active');
    }

    window.openProcessModal = openProcessModal;
window.closeProcessModal = closeProcessModal;


    function loadProcessList() {
      const cmdLine = document.getElementById('cmdLineInput').value.trim();
      const url = BASE_URL + 'processes' + (cmdLine ? '?cmd_line=' + encodeURIComponent(cmdLine) : '');
      fetch(url)
        .then(resp => resp.json())
        .then(data => {
          const container = document.getElementById('processTableContainer');
          container.innerHTML = '';
          const table = document.createElement('table');
          table.className = 'table is-striped is-fullwidth';
          table.innerHTML = `
            <thead>
              <tr>
                <th><input type="checkbox" onclick="document.querySelectorAll('#processTableContainer tbody input[type=checkbox]').forEach(cb => cb.checked = this.checked);"></th>
                <th>PID</th>
                <th>Name</th>
                <th>Command Line</th>
                <th>Working Directory</th>
                <th>Status</th>
                <th>Threads</th>
                <th>Executable</th>
                <th>User</th>
                <th>Created</th>
                <th>RAM %</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${data.map(process => `
                <tr>
                  <td><input type="checkbox" value="${process.pid}"></td>
                  <td>${process.pid}</td>
                  <td>${process.name}</td>
                  <td><textarea class="textarea is-small" readonly>${process.cmdline.join(' ')}</textarea></td>
                  <td><textarea class="textarea is-small" readonly>${process.cwd}</textarea></td>
                  <td>${process.status}</td>
                  <td>${process.num_threads}</td>
                  <td><textarea class="textarea is-small" readonly>${process.exe}</textarea></td>
                  <td>${process.username}</td>
                  <td>${process.create_time}</td>
                  <td>${process.memory_percent}</td>
                  <td>
                    <button class="button is-small is-danger" onclick="terminateProcess('${process.pid}')">终止</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          `;
          container.appendChild(table);
        })
        .catch(err => {
          console.error('加载进程失败', err);
          document.getElementById('processTableContainer').innerHTML = '<div class="notification is-danger">无法加载进程列表</div>';
        });
    }

    function terminateProcess(pid) {
      if (!confirm(`确定终止进程 ${pid}？`)) return;
      fetch(BASE_URL + 'terminate_process?pid=' + encodeURIComponent(pid))
        .then(resp => resp.text())
        .then(text => {
          alert(text);
          loadProcessList();
        });
    }

    function terminateSelected() {
      const pids = Array.from(document.querySelectorAll('#processTableContainer tbody input[type=checkbox]:checked')).map(cb => cb.value);
      if (pids.length === 0) return alert('你还没有选择任何进程');
      if (!confirm(`已选择 ${pids.length} 项，确定终止？`)) return;
      fetch(BASE_URL + 'terminate_process?pid=' + encodeURIComponent(pids.join(',')))
        .then(resp => resp.text())
        .then(text => {
          alert(text);
          loadProcessList();
        });
    }
