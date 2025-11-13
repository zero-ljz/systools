// assets/pages/webshell.js
import { PageManager } from '../app.js';

function renderWebShellPage(container) {
  container.innerHTML = `
    <h2 class="title is-4">Web Shell</h2>
    <form id="form1">
      <div class="field is-grouped is-grouped-multiline">
        <div class="control">
          <label class="checkbox" title="用本程序启动时的Shell执行">
            <input type="checkbox" id="shell"> Shell
          </label>
        </div>
        <div class="control">
          <label class="checkbox">
            <input type="checkbox" id="capture_output" checked> Capture Output
          </label>
        </div>
      </div>

      <div class="field">
        <div class="control">
          <input class="input" type="text" id="cwd" placeholder="cwd">
        </div>
      </div>

      <div class="field">
        <label class="checkbox">
          <input id="uriComponentEncoding" type="checkbox"> Encoding
        </label>
      </div>

      <div class="buttons">
        <button class="button is-info" type="button" value="QueryMode">Query Mode</button>
        <button class="button is-link" type="button" value="PathMode">Path Mode</button>
      </div>

      <div class="field is-grouped">
        <div class="control is-expanded">
          <input class="input" type="text" list="optionList" id="0" placeholder="0">
          <datalist id="optionList">
            <option value="python">python</option>
            <option value="node">node</option>
            <option value="curl">curl</option>
          </datalist>
        </div>
        <div class="control">
          <button class="button is-light" type="button" value="ReSelect" tabindex="-1">ReSelect</button>
        </div>
        <div class="control">
          <button class="button is-success" type="button" value="AddParam" tabindex="-1">+</button>
        </div>
        <div class="control">
          <button class="button is-danger" type="button" value="RemoveParam" tabindex="-1">-</button>
        </div>
      </div>

    </form>
  `;

  textareaCount = 0; // 重新渲染页面后重置 textarea 计数器
  // 初始化逻辑
  loadFormData();
}

 function queryMode() {
            let q; q = prompt('Please confirm the jump target:', BASE_URL + genURL(1, document.getElementById('uriComponentEncoding').checked)); if (q == null) return; window.location.href = q;
        }
        function pathMode() {
            let q; q = prompt('Please confirm the jump target:', BASE_URL + genURL(2, document.getElementById('uriComponentEncoding').checked)); if (q == null) return; window.location.href = q;
        }
        function reSelect() {
            document.getElementById('0').value = '';
        }

function addParam() {
            // 创建新的 textarea 元素
            const newTextArea = document.createElement('textarea');

            // 设置新的 textarea 的 name 和 placeholder 属性
            const paramName = (textareaCount + 1);
            newTextArea.id = paramName;
            newTextArea.placeholder = paramName;
            newTextArea.style.display = 'block';
            newTextArea.style.margin = '0.5rem 0';
            newTextArea.classList.add('textarea');
            newTextArea.rows = 1;
            // 禁止用户拖拽调整大小
            newTextArea.style.resize = 'none';
            newTextArea.style.overflow = 'hidden';
            // 拦截回车键
            newTextArea.addEventListener("keydown", function(event) {
              if (event.key === "Enter") {
                event.preventDefault(); // 阻止换行
              }
            });

            // 加载保存的记录
            newTextArea.value = sessionStorage.getItem(paramName)

            // 将新的 textarea 添加到表单中
            const form = document.getElementById('form1');
            form.insertBefore(newTextArea, form.lastElementChild.nextElementSibling);

            // 更新 textareaCount 值
            textareaCount++;
        }

        function removeParam() {
            // 获取最后一个参数控件
            const form = document.getElementById('form1');
            const lastParam = form.lastElementChild;

            if (lastParam.tagName === 'TEXTAREA') {
                // 从表单中删除最后一个参数控件
                form.removeChild(lastParam);

                // 更新 textareaCount 值
                textareaCount--;
            }
        }

        function saveFormData() {
            let form = document.getElementById('form1');

            sessionStorage.clear();

            sessionStorage.setItem('cwd', document.getElementById('cwd').value);
            sessionStorage.setItem('shell', document.getElementById('shell').checked ? 'on' : 'off');
            sessionStorage.setItem('capture_output', document.getElementById('capture_output').checked ? 'on' : 'off');

            let elements = getElementsWithNumberId(form);
            elements.forEach(element => {
                sessionStorage.setItem(element.id, element.value);
            });

            return false;
        }

        function loadFormData() {
            const form = document.getElementById('form1');

            if (sessionStorage.getItem('cwd')) {
                document.getElementById('cwd').value = sessionStorage.getItem('cwd')
            }
            if (sessionStorage.getItem('shell')) {
                document.getElementById('shell').checked = sessionStorage.getItem('shell') == 'on' ? true : false;
            }
            if (sessionStorage.getItem('capture_output')) {
                document.getElementById('capture_output').checked = sessionStorage.getItem('capture_output') == 'on' ? true : false;
            }

            for (let i = 0; i < form.elements.length; i++) {
                const element = form.elements[i];
                const value = sessionStorage.getItem(element.id);
                if (value) {
                    element.value = value;
                }
            }
        }

        function genURL(method = 1, isEncode = false) {
            const form = document.getElementById('form1');
            const textareas = form.getElementsByTagName('textarea');
            let cwd = document.getElementById('cwd').value;
            let shell = document.getElementById('shell').checked ? 'on' : 'off';
            let capture_output = document.getElementById('capture_output').checked ? 'on' : 'off';
            let optionStr = (cwd ? '&cwd=' + (isEncode ? encodeURIComponent(cwd) : cwd) : '')
                + (shell ? '&shell=' + shell : '')
                + (capture_output ? '&capture_output=' + capture_output : '');
            let param0Str = document.getElementById('0').value;
            let paramStr = '';
            let href = '';

            if (method == 1) {
                // 通过查询字符串传递参数
                for (let i = 0; i < textareas.length; i++) {
                    if (i == textareas.length - 1 && !textareas[i].value) { // 最后一个参数为空时跳过
                        continue;
                    }
                    const paramValue = textareas[i].value.replace('&', '%26'); // 参数中包含&时强制替换为&的编码%26
                    if (paramValue.includes(' ')) {
                        paramStr += ' "' + paramValue + '"';
                    } else {
                        paramStr += ' ' + paramValue;
                    }
                }
                param0Str = param0Str.replace('&', '%26'); // 参数中包含&时强制替换为&的编码%26
                if (param0Str.includes(' ')) { // 命令名称/路径不带参数时不自动加双引号
                    if ((textareas.length == 1 && textareas[0].value) || textareas.length > 1) {
                        param0Str = '"' + param0Str + '"';
                    }
                }

                href = `?cmd=` + (isEncode ? encodeURIComponent(param0Str + paramStr) : param0Str + paramStr)
                    + optionStr;
            }
            else if (method == 2) {
                // 通过路径传递参数，参数中包含了斜杠/时要用双引号"包括起来
                for (let i = 0; i < textareas.length; i++) {
                    if (i == textareas.length - 1 && !textareas[i].value) { // 最后一个参数为空时跳过
                        continue;
                    }
                    const paramValue = textareas[i].value;
                    if (paramValue.includes('/') || paramValue.includes('\\')) {
                        paramStr += '/"' + (isEncode ? encodeURIComponent(paramValue) : paramValue) + '"';
                    } else {
                        paramStr += '/' + (isEncode ? encodeURIComponent(paramValue) : paramValue);
                    }
                }
                if (param0Str.includes('/') || param0Str.includes('\\')) { // 命令名称/路径不带参数时不自动加双引号
                    if ((textareas.length == 1 && textareas[0].value) || textareas.length > 1) {
                        param0Str = '"' + param0Str + '"';
                    }
                }
                href = (isEncode ? encodeURIComponent(param0Str) : param0Str) + paramStr + '?'
                    + optionStr;
            }

            console.log(href);
            return href;
        }

        function getElementsWithNumberId(parentElement) {
            const elements = [];
            const children = parentElement.children;
            for (let i = 0; i < children.length; i++) {
                const element = children[i];
                if (element.id && element.id.match(/^\d+$/)) {
                    elements.push(element);
                }
                if (element.children.length > 0) {
                    elements.push(...getElementsWithNumberId(element));
                }
            }
            return elements;
        }

        function getBaseUrl() {
            let { protocol, host, pathname } = window.location;
            // pathname 未以/结尾时加上/
            if (!pathname.endsWith('/')) {
                pathname += '/';
            }
            const path = pathname.substring(0, pathname.lastIndexOf('/') + 1);
            return `${protocol}//${host}${path}`;
        }


// 定义全局变量用于记录已存在的 textarea 控件数量
let textareaCount = 0;
const BASE_URL = getBaseUrl() + 'web_shell/';

// 注册页面生命周期钩子
PageManager.registerHooks('webshell', {
  onEnter() {
    const container = document.querySelector('.page[data-page="webshell"]');
    renderWebShellPage(container);
    // alert('打开webshell面板');

    
const form = document.getElementById('form1');
        form.querySelector('button[value="QueryMode"]').addEventListener('click', queryMode);
        form.querySelector('button[value="PathMode"]').addEventListener('click', pathMode);
        form.querySelector('button[value="ReSelect"]').addEventListener('click', reSelect);
        form.querySelector('button[value="AddParam"]').addEventListener('click', addParam);
        form.querySelector('button[value="RemoveParam"]').addEventListener('click', removeParam);

  },
  onLeave() {
    // 可选：清理事件或 DOM
  }
});
