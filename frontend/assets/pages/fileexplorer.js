// pages/fileexplorer.js

import { Router, useAppState, PageManager, Toast } from '../app.js';

PageManager.registerHooks('fileexplorer', {
    onEnter(state) {
        console.log('进入fileexplorer页', state.routeParams);
        renderFileexplorerPage();
    },
    onLeave() {
        console.log('离开fileexplorer页');
    }
});

function renderFileexplorerPage() {
    const page = document.querySelector('.page[data-page="fileexplorer"]');
    if (!page) return;

    page.innerHTML = `
    
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

<hr>

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

<hr>

<div id="breadcrumb"></div>

<div style="display: flex; gap: 10px; align-items: center; margin-top: 10px;">
  <button class="button" onclick="history.back()">←</button>
  <button class="button" onclick="history.forward()">→</button>
  <button class="button is-light" onclick="goToParentDirectory()">../</button>
  <button class="button is-light" onclick="goToDirectory('/')">/</button>&nbsp;&nbsp;

  <button class="button is-link" id="copySelected">Copy</button>
  <button class="button is-warning" id="moveSelected">Move</button>
  <button class="button is-danger" id="deleteSelected">Delete</button>
  <button class="button is-link" id="packSelected">Pack</button>&nbsp;&nbsp;

  <input class="input" type="text" id="pathInput" style="flex: 1; min-width: 100px; max-width: 600px;" placeholder="Enter path">
  <button class="button is-light" onclick="goToInputPath()">Go</button>&nbsp;&nbsp;

  <button class="button is-primary" onclick="createFile()">New File</button>
  <button class="button is-primary" onclick="createDirectory()">New Folder</button>
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

<hr>

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
      <td>${file.is_directory ? `<a href="#/fileexplorer/directory/${file.path}">${file.name}</a>` : file.name}</td>
      <td>${file.is_directory ? 'Folder' : 'File'}</td>
      <td>${file.is_directory ? '' : formatSize(file.size)}</td>
      <td>${formatDate(file.modified_at)}</td>
      <td>${formatDate(file.created_at)}</td>
      <td>
        <button class="button is-small is-info" data-path="${file.path}" onclick="copyPath(this.dataset.path)">Copy Path</button>
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

function copyPath(path) {
  navigator.clipboard.writeText(path).then(() => alert('Copied: ' + path));
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
  return Array.from(document.querySelectorAll('#fileTable tbody input[type="checkbox"]:checked'))
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
  const hash = location.hash;
  const match = hash.match(/^#\/fileexplorer\/directory\/([^?]+)(\?(.*))?/);
  let path = match ? decodeURIComponent(match[1]) : '/';
  const query = match && match[3] ? new URLSearchParams(match[3]) : new URLSearchParams();

  path = path.replace(/\\/g, '/') // 统一路径分隔符
  path = path.endsWith('/') ? path : path + '/' // 确保以 '/' 结尾
  state.currentDirectory = path;
  state.page = parseInt(query.get('page')) || 1;
  state.perPage = parseInt(query.get('perPage')) || 100;

  fetchFileList();
}

window.addEventListener('hashchange', handleRouteChange);
window.addEventListener('DOMContentLoaded', () => {
  fetchDiskList();
  handleRouteChange();
});


window.goToParentDirectory = goToParentDirectory
window.goToDirectory = goToDirectory
window.goToInputPath = goToInputPath
window.createFile = createFile
window.createDirectory = createDirectory
window.cancelEdit = cancelEdit
window.handleFileAction = handleFileAction

window.fileAttr = fileAttr
window.dirAttr = dirAttr
window.renameFile = renameFile
window.deleteFile = deleteFile
window.copyFile = copyFile
window.moveFile = moveFile
window.previewFile = previewFile
window.downloadFile = downloadFile
window.editFile = editFile
window.unpackFiles = unpackFiles