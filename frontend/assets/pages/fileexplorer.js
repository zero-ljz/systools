// pages/fileexplorer.js

import { Router, useAppState, PageManager, Toast } from '../app.js';

PageManager.registerHooks('fileexplorer', {
    onEnter(state) {
        console.log('进入fileexplorer页', state.routeParams);
        renderFileexplorerPage();

        window.addEventListener('hashchange', handleRouteChange);
        // 首次进入时主动执行一次
        fetchDiskList();
        handleRouteChange();

    },
    onLeave() {
        console.log('离开fileexplorer页');

        // 离开文件浏览器时解绑事件
        window.removeEventListener('hashchange', handleRouteChange);
    }
});

function renderFileexplorerPage() {
    const page = document.querySelector('.page[data-page="fileexplorer"]');
    if (!page) return;

    page.innerHTML = `
    
<h2 class="title is-4">File Explorer</h2>
    
<div class="field is-grouped">
  <div class="control">
    <input class="input" type="file" id="fileInput" multiple>
  </div>
  <div class="control">
    <button class="button is-primary" id="uploadBtn">Upload Local Files</button>
  </div>
</div>

<div class="field is-grouped">
  <div class="control is-expanded">
    <input class="input" type="text" id="remoteURL" placeholder="Remote URL">
  </div>
  <div class="control">
    <button class="button is-link" id="uploadRemoteBtn">Upload Remote File</button>
  </div>
</div>

<div id="diskLinks" style="display: flex; gap: 10px; align-items: center;"></div>

<div class="columns is-vcentered">
  <div class="column is-half">
    <div class="field is-grouped">
      <div class="control is-expanded">
        <input class="input" type="text" id="keyword" placeholder="Filter by name">
      </div>
      <div class="control">
        <div class="select">
          <select id="fileType">
            <option value="">All</option>
            <option value="file">File Only</option>
            <option value="dir">Folder Only</option>
          </select>
        </div>
      </div>
      <div class="control">
        <label class="checkbox">
          <input type="checkbox" id="showHidden"> Hidden
        </label>
      </div>
    </div>
  </div>

  <div class="column is-half has-text-right">
    <div class="field is-grouped is-grouped-right">
      <div class="control">
        <div class="select">
          <select id="sortBy">
            <option value="name">Name</option>
            <option value="size">Size</option>
            <option value="created_at">Created</option>
            <option value="modified_at">Modified</option>
          </select>
        </div>
      </div>
      <div class="control">
        <div class="select">
          <select id="order">
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
        </div>
      </div>
    </div>
  </div>
</div>


<div id="breadcrumb"></div>

<!-- 路径导航区 -->
<div style="display: flex; gap: 10px; align-items: center; margin-top: 10px;">
  <!-- 左边导航按钮 -->
  <button class="button" onclick="history.back()">
    <span class="icon"><i class="fas fa-arrow-left"></i></span>
  </button>
  <button class="button" onclick="history.forward()">
    <span class="icon"><i class="fas fa-arrow-right"></i></span>
  </button>
  <button class="button is-light" onclick="goToDirectory('/')">
    <span class="icon"><i class="fas fa-home"></i></span>
  </button>
  <button class="button is-light" onclick="goToParentDirectory()">
    <span class="icon"><i class="fas fa-level-up-alt"></i></span>
  </button>

  <!-- 右边输入框 + Go -->
  <div style="display:flex; gap:10px; margin-left:auto; flex:1;">
    <input class="input is-expanded" type="text" id="pathInput" placeholder="Enter path">
    <button class="button is-light" onclick="goToInputPath()">
      <span class="icon"><i class="fas fa-arrow-circle-right"></i></span>
    </button>
  </div>
</div>


<div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
  <!-- 左边多选操作按钮 -->
  <div class="buttons mb-0">
    <button class="button is-link" id="copySelected"><span class="icon"><i class="fas fa-copy"></i></span></button>
    <button class="button is-warning" id="moveSelected"><span class="icon"><i class="fas fa-arrows-alt"></i></span></button>
    <button class="button is-danger" id="deleteSelected"><span class="icon"><i class="fas fa-trash"></i></span></button>
    <button class="button is-link" id="packSelected"><span class="icon"><i class="fas fa-file-archive"></i></span></button>
  </div>

  <!-- 右边新建按钮 -->
  <div class="buttons mb-0">
    <button class="button is-primary" onclick="createFile()"><span class="icon"><i class="fas fa-file"></i></span></button>
    <button class="button is-primary" onclick="createDirectory()"><span class="icon"><i class="fas fa-folder"></i></span></button>
  </div>
</div>


<table style="width: 100%; border-collapse: collapse; margin-top: 10px;" class="table is-striped is-hoverable is-fullwidth" id="fileTable">
  <thead>
    <tr>
      <th><input type="checkbox" id="selectAll"></th>
      <th>Name</th>
      <th>Type</th>
      <th>Size</th>
      <th>Modified</th>
      <th>Created</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody></tbody>
</table>

<nav class="pagination is-centered" role="navigation" aria-label="pagination">
  <button class="pagination-previous" id="prevPage">&lt; Prev</button>
  <button class="pagination-next" id="nextPage">Next &gt;</button>
  <ul class="pagination-list">
    <li><span class="pagination-link is-current" id="pageInfo">Page 1 / 1</span></li>
  </ul>
</nav>

<div class="field is-grouped is-grouped-centered" style="margin-top: 10px;">
  <div class="control">
    <label class="label">Per page:</label>
  </div>
  <div class="control">
    <input class="input is-small" type="number" id="perPage" value="100" style="width: 80px;">
  </div>
</div>
<p class="has-text-centered">Total files: <span id="totalCount">0</span></p>

<div class="modal" id="editDialog">
  <div class="modal-background" onclick="cancelEdit()"></div>
  <div class="modal-card">
    <header class="modal-card-head">
      <p class="modal-card-title">Edit File</p>
      <button class="delete" aria-label="close" onclick="cancelEdit()"></button>
    </header>
    <section class="modal-card-body">
      <div class="field">
        <div class="control">
          <textarea class="textarea" id="editContent" rows="10"></textarea>
        </div>
      </div>
    </section>
    <footer class="modal-card-foot">
      <button class="button is-success" id="saveEdit">Save</button>
      <button class="button" onclick="cancelEdit()">Cancel</button>
    </footer>
  </div>
</div>
`;


// 初始化逻辑
    initializeFileExplorer();
}


const BASE_URL = location.origin + '/file_explorer' +location.pathname.replace(/\/[^/]*$/, '/') || '/';
const state = {
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
  selectedFiles: [],
  selectedFilePath: '',
  editedContent: '',
  supportedExtensions: ['.zip','.7z','.tar.gz','.tgz','.tar.xz','.txz','.tar.bz2','.gz','.xz','.zst']
};

function fetchDiskList() {
  axios.get(BASE_URL + 'disks').then(res => {
    const container = document.getElementById('diskLinks');
    container.innerHTML = 'Disks: ';
    res.data.disks.forEach(disk => {
      if (disk.mountpoint) {
        const a = document.createElement('a');
        a.href = '#/fileexplorer/directory/' + disk.mountpoint;
        a.textContent = disk.device;
        container.appendChild(a);
      }
    });
  });
}

function fetchFileList() {
  axios.get(BASE_URL + 'files', {
    params: {
      directory: state.currentDirectory,
      show_hidden: state.showHidden,
      page: state.page,
      per_page: state.perPage,
      sort_by: state.sortBy,
      order: state.order,
      type: state.fileType,
      keyword: state.keyword
    }
  }).then(res => {
    state.files = res.data.files;
    state.total = res.data.total;
    state.totalPages = res.data.pages;
    renderFileTable();
    renderPageInfo();
    renderBreadcrumb();
    document.getElementById('pathInput').value = state.currentDirectory;
  });
}

function renderFileTable() {
  const tbody = document.querySelector('#fileTable tbody');
  tbody.innerHTML = '';
  state.files.forEach(file => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" data-path="${file.path}"></td>
      <td>${file.is_directory ? `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABt0lEQVR42oxStZoWQRCs2cXdHTLcHZ6EjAwnQWIkJyQlRt4Cd3d3d1n5d7q7ju1zv/q+mh6taQsk8fn29kPDRo87SDMQcNAUJgIQkBjdAoRKdXjm2mOH0AqS+PlkP8sfp0h93iu/PDji9s2FzSSJVg5ykZqWgfGRr9rAAAQiDFoB1OfyESZEB7iAI0lHwLREQBcQQKqo8p+gNUCguwCNAAUQAcFOb0NNGjT+BbUC2YsHZpWLhC6/m0chqIoM1LKbQIIBwlTQE1xAo9QDGDPYf6rkTpPc92gCUYVJAZjhyZltJ95f3zuvLYRGWWCUNkDL2333McBh4kaLlxg+aTmyL7c2xTjkN4Bt7oE3DBP/3SRz65R/bkmBRPGzcRNHYuzMjaj+fdnaFoJUEdTSXfaHbe7XNnMPyqryPcmfY+zURaAB7SHk9cXSH4fQ5rojgCAVIuqCNWgRhLYLhJB4k3iZfIPtnQiCpjAzeBIRXMA6emAqoEbQSoDdGxFUrxS1AYcpaNbBgyQBGJEOnYOeENKR/iAd1npusI4C75/c3539+nbUjOgZV5CkAU27df40lH+agUdIuA/EAgDmZnwZlhDc0wAAAABJRU5ErkJggg=="> <a class="dir" href="#/fileexplorer/directory/${file.path}">${file.name}</a>` : `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAABnRSTlMAAAAAAABupgeRAAABEElEQVR42nRRx3HDMBC846AHZ7sP54BmWAyrsP588qnwlhqw/k4v5ZwWxM1hzmGRgV1cYqrRarXoH2w2m6qqiqKIR6cPtzc3xMSML2Te7XZZlnW7Pe/91/dX47WRBHuA9oyGmRknzGDjab1ePzw8bLfb6WRalmW4ip9FDVpYSWZgOp12Oh3nXJ7nxoJSGEciteP9y+fH52q1euv38WosqA6T2gGOT44vry7BEQtJkMAMMpa6JagAMcUfWYa4hkkzAc7fFlSjwqCoOUYAF5RjHZPVCFBOtSBGfgUDji3c3jpibeEMQhIMh8NwshqyRsBJgvF4jMs/YlVR5KhgNpuBLzk0OcUiR3CMhcPaOzsZiAAA/AjmaB3WZIkAAAAASUVORK5CYII="> <a data-path="${file.path}" onclick="previewFile(this.dataset.path)">${file.name}</a>`}</td>
      <td>${file.is_directory ? 'Folder' : 'File'}</td>
      <td>${file.is_directory ? '' : formatSize(file.size)}</td>
      <td>${formatDate(file.modified_at)}</td>
      <td>${formatDate(file.created_at)}</td>
      <td>
        <button class="button is-small is-info" data-path="${file.path}" onclick="copyText(this.dataset.path)">Copy Path</button>
        <div class="select is-small">
        <select data-path="${file.path}" onchange="handleFileAction(this.value, this.dataset.path); this.value='';">
          <option disabled selected value="">More</option>
          ${!file.is_directory ? '<option value="fileAttr">Attributes</option>': '<option value="dirAttr">Attributes</option>'}
          <option value="renameFile">Rename</option>
          <option value="deleteFile">Delete</option>
          <option value="copyFile">Copy</option>
          <option value="moveFile">Move</option>
          ${!file.is_directory ? `
            <option value="previewFile">Preview</option>
            <option value="downloadFile">Download</option>
            <option value="editFile">Edit</option>
          ` : ''}
          ${state.supportedExtensions.some(ext => file.path.toLowerCase().endsWith(ext)) ? `
            <option value="unpackFiles">Unpack</option>
          ` : ''}
        </select>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPageInfo() {
  document.getElementById('pageInfo').textContent = `Page ${state.page} / ${state.totalPages}`;
  document.getElementById('totalCount').textContent = state.total;
}

function renderBreadcrumb() {
  const container = document.getElementById('breadcrumb');
  container.innerHTML = '';

  // 统一路径分隔符为 '/'
  const normalizedPath = state.currentDirectory.replace(/\\/g, "/");

  // 按 '/' 分割并过滤空字符串
  const parts = normalizedPath.split("/").filter(Boolean);

  // 当前累积路径
  let currentPath = normalizedPath.startsWith("/") ? "/" : "";

  parts.forEach((part, index) => {
    currentPath += part;

    const a = document.createElement("a");
    a.textContent = part;
    a.href = "#/fileexplorer/directory/" + currentPath;
    container.appendChild(a);

    // 在 a 标签之间添加分隔符
    if (index < parts.length - 1) {
      container.appendChild(document.createTextNode(" / "));
      currentPath += "/";
    }
  });
}

function formatSize(size) {
  if (size >= 1024**3) return (size/1024**3).toFixed(2) + ' GB';
  if (size >= 1024**2) return (size/1024**2).toFixed(2) + ' MB';
  if (size >= 1024) return (size/1024).toFixed(2) + ' KB';
  return size + ' bytes';
}

function formatDate(ts) {
  const d = new Date(ts * 1000);
  return d.toISOString().replace('T', ' ').split('.')[0];
}


function copyText(text) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      alert('Copied: ' + text)
    } else {
      const t = document.createElement('textarea');
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      alert('Copied: ' + text)
      document.body.removeChild(t);
    }
  }


function fileAttr(path) {
  axios.get(`${BASE_URL}files/${encodeURIComponent(path)}/attributes`).then(res => {
    const attrs = res.data;
    let msg = `Attributes for ${path}:\n\n`;
    for (const [key, value] of Object.entries(attrs)) {
      msg += `${key}: ${value}\n`;
    }
    alert(msg);
  });
}

function dirAttr(path) {
  axios.get(`${BASE_URL}directories/${encodeURIComponent(path)}/attributes`).then(res => {
    const attrs = res.data;
    let msg = `Attributes for ${path}:\n\n`;
    for (const [key, value] of Object.entries(attrs)) {
      msg += `${key}: ${value}\n`;
    }
    alert(msg);
  });
}

function renameFile(path) {
  const newName = prompt('Enter new filename:', path.split('/').pop());
  if (!newName) return;
  axios.post(`${BASE_URL}files/${encodeURIComponent(path)}/actions`, {
    action: 'rename',
    destination: newName
  }).then(res => {
    alert(res.data.message);
    fetchFileList();
  });
}

function deleteFile(path) {
  if (!confirm(`Are you sure you want to delete ${path}?`)) return;
  axios.delete(`${BASE_URL}files/${encodeURIComponent(path)}`).then(res => {
    alert(res.data.message);
    fetchFileList();
  });
}

function copyFile(path) {
  const dest = prompt('Enter destination path:', path);
  if (!dest) return;
  axios.post(`${BASE_URL}files/${encodeURIComponent(path)}/actions`, {
    action: 'copy',
    destination: dest
  }).then(res => {
    alert(res.data.message);
    fetchFileList();
  });
}

function moveFile(path) {
  const dest = prompt('Enter destination path:', path);
  if (!dest) return;
  axios.post(`${BASE_URL}files/${encodeURIComponent(path)}/actions`, {
    action: 'move',
    destination: dest
  }).then(res => {
    alert(res.data.message);
    fetchFileList();
  });
}

function previewFile(path) {
  window.open(`${BASE_URL}files/preview/${path}`, '_blank');
}

function downloadFile(path) {
  window.open(`${BASE_URL}files/download/${path}`, '_blank');
}

function editFile(path) {
  fetch(`${BASE_URL}files/content/${encodeURIComponent(path)}`)
    .then(res => res.json())
    .then(data => {
      if ('content' in data) {
        state.selectedFilePath = path;
        state.editedContent = data.content;
        document.getElementById('editContent').value = data.content;
        document.getElementById('editDialog').classList.add('is-active');
      }
    });
}

function unpackFiles(path) {
  const targetDir = prompt('Which directory should it be decompressed to?', state.currentDirectory);
  if (!targetDir || targetDir.trim() === '') return;
  axios.post(BASE_URL + 'files/unpack', {
    archive_filename: path,
    extract_directory: targetDir
  }).then(res => {
    alert(res.data.message);
    fetchFileList();
  });
}

function getSelectedFiles() {
  return Array.from(document.querySelectorAll('table#fileTable tbody input[type="checkbox"]:checked'))
    .map(cb => cb.dataset.path);
}


function cancelEdit() {
  document.getElementById('editDialog').classList.remove('is-active');
  state.selectedFilePath = '';
  state.editedContent = '';
}

function initializeFileExplorer() {
  document.getElementById('saveEdit').onclick = () => {
    const form = new FormData();
    form.append('file_path', state.selectedFilePath);
    form.append('content', document.getElementById('editContent').value);
    fetch(BASE_URL + 'files/edit', { method: 'POST', body: form })
      .then(res => res.json())
      .then(data => {
        alert(data.message);
        fetchFileList();
      });
  };

  document.getElementById('uploadBtn').onclick = () => {
    const input = document.getElementById('fileInput');
    const files = Array.from(input.files);
    if (files.length === 0) return alert('No files selected');
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    form.append('directory', state.currentDirectory);
    axios.post(BASE_URL + 'files/upload', form).then(res => {
      alert(res.data.message);
      fetchFileList();
      input.value = null;
    });
  };

  document.getElementById('uploadRemoteBtn').onclick = () => {
    const url = document.getElementById('remoteURL').value;
    if (!url) return alert('Enter a URL');
    axios.post(BASE_URL + 'files/upload/remote', {
      directory: state.currentDirectory,
      url: url
    }).then(res => {
      alert(res.data.message);
      fetchFileList();
    });
  };

  document.getElementById('selectAll').onchange = (e) => {
    const checked = e.target.checked;
    document.querySelectorAll('#fileTable tbody input[type="checkbox"]').forEach(cb => {
      cb.checked = checked;
    });
  };


  document.getElementById('copySelected').onclick = () => {
    const files = getSelectedFiles();
    if (files.length === 0) return alert('No files selected');
    const dest = prompt('Enter destination path:');
    if (!dest) return;
    axios.post(BASE_URL + 'files/copy', { files, destination: dest }).then(res => {
      alert(res.data.message);
      fetchFileList();
    });
  };

  document.getElementById('moveSelected').onclick = () => {
    const files = getSelectedFiles();
    if (files.length === 0) return alert('No files selected');
    const dest = prompt('Enter destination path:');
    if (!dest) return;
    axios.post(BASE_URL + 'files/move', { files, destination: dest }).then(res => {
      alert(res.data.message);
      fetchFileList();
    });
  };

  document.getElementById('deleteSelected').onclick = () => {
    const files = getSelectedFiles();
    if (files.length === 0) return alert('No files selected');
    if (!confirm(`Delete ${files.length} selected items?`)) return;
    axios.post(BASE_URL + 'files/delete', { files }).then(res => {
      alert(res.data.message);
      fetchFileList();
    });
  };

  document.getElementById('packSelected').onclick = () => {
    const files = getSelectedFiles();
    if (files.length === 0) return alert('No files selected');
    const archive = prompt('Enter archive filename:\n Supported extensions: ' + state.supportedExtensions.join(', '), state.currentDirectory + '/archive.zip');
    if (!archive) return;
    axios.post(BASE_URL + 'files/pack', {
      files,
      archive_filename: archive
    }).then(res => {
      alert(res.data.message);
      fetchFileList();
    });
  };

  document.getElementById('prevPage').onclick = () => {
    if (state.page > 1) {
      state.page--;
      goToDirectory(state.currentDirectory, state.page, state.perPage);
    }
  };

  document.getElementById('nextPage').onclick = () => {
    if (state.page < state.totalPages) {
      state.page++;
      goToDirectory(state.currentDirectory, state.page, state.perPage);
    }
  };

  document.getElementById('perPage').onchange = (e) => {
    state.perPage = parseInt(e.target.value) || 100;
    state.page = 1;
    goToDirectory(state.currentDirectory, state.page, state.perPage);
  };

  document.getElementById('keyword').oninput = (e) => {
    state.keyword = e.target.value;
    fetchFileList();
  };

  document.getElementById('fileType').onchange = (e) => {
    state.fileType = e.target.value;
    fetchFileList();
  };

  document.getElementById('showHidden').onchange = (e) => {
    state.showHidden = e.target.checked;
    fetchFileList();
  };

  document.getElementById('sortBy').onchange = (e) => {
    state.sortBy = e.target.value;
    fetchFileList();
  };

  document.getElementById('order').onchange = (e) => {
    state.order = e.target.value;
    fetchFileList();
  };

}


function goToDirectory(path, page = state.page, perPage = state.perPage) {
  path = path.endsWith('/') ? path : path + '/';
  const query = `page=${page}&perPage=${perPage}`;
  location.hash = `#/fileexplorer/directory/${path}?${query}`;
}

function goToParentDirectory() {
  let path = state.currentDirectory.replace(/\\/g, '/') // 统一路径分隔符
  path = path.endsWith('/') ? path : path + '/' // 确保以 '/' 结尾
  const parts = path.split('/');
  parts.pop();
  parts.pop();
  const parent = parts.join('/') || '/';
  goToDirectory(parent);
}

function goToInputPath() {
  const input = document.getElementById('pathInput').value.trim();
  if (input) goToDirectory(input);
}

function createFile() {
  const name = prompt('Enter new file name:', 'file.txt');
  if (!name) return;
  axios.post(BASE_URL + 'files', {
    filename: state.currentDirectory + '/' + name
  }).then(res => {
    alert(res.data.message);
    fetchFileList();
  });
}

function createDirectory() {
  const name = prompt('Enter new folder name:', 'folder');
  if (!name) return;
  axios.post(BASE_URL + 'directories', {
    directory: state.currentDirectory + '/' + name
  }).then(res => {
    alert(res.data.message);
    fetchFileList();
  });
}

function handleFileAction(action, path) {
  const fn = window[action];
  if (typeof fn === 'function') {
    fn(path);
  } else {
    alert(`Unknown action: ${action}`);
  }
}

function handleRouteChange() {
  let hash = location.hash;
  let match = hash.match(/^#\/fileexplorer\/directory\/([^?]+)(\?(.*))?/);

  if (match)
  {
    // 持久化当前hash
    localStorage.setItem('currentDirectoryHash', hash);
    console.log('持久化当前hash', hash);
  }
  else {
    // 恢复上次hash
    hash = localStorage.getItem('currentDirectoryHash') || '#/fileexplorer';
    location.hash = hash;
    match = hash.match(/^#\/fileexplorer\/directory\/([^?]+)(\?(.*))?/);
  }

  let path = match ? decodeURIComponent(match[1]) : '/';
  const query = match && match[3] ? new URLSearchParams(match[3]) : new URLSearchParams();

  path = path.replace(/\\/g, '/') // 统一路径分隔符
  path = path.endsWith('/') ? path : path + '/' // 确保以 '/' 结尾

  state.currentDirectory = path;
  state.page = parseInt(query.get('page')) || 1;
  state.perPage = parseInt(query.get('perPage')) || 100;

  fetchFileList();
}




window.goToParentDirectory = goToParentDirectory;
window.goToDirectory = goToDirectory;
window.goToInputPath = goToInputPath;
window.createFile = createFile;
window.createDirectory = createDirectory;
window.cancelEdit = cancelEdit;
window.handleFileAction = handleFileAction;

window.copyText = copyText;
window.fileAttr = fileAttr;
window.dirAttr = dirAttr;
window.renameFile = renameFile;
window.deleteFile = deleteFile;
window.copyFile = copyFile;
window.moveFile = moveFile;
window.previewFile = previewFile;
window.downloadFile = downloadFile;
window.editFile = editFile;
window.unpackFiles = unpackFiles;