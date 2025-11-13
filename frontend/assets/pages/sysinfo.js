// pages/sysinfo.js

import { Router, useAppState, PageManager, Toast } from '../app.js';

PageManager.registerHooks('sysinfo', {
    onEnter(state) {
        console.log('进入sysinfo页', state.routeParams);
        renderSysinfoPage();
    },
    onLeave() {
        console.log('离开sysinfo页');
    }
});


function renderSysinfoPage() {
    const page = document.querySelector('.page[data-page="sysinfo"]');
    if (!page) return;

    page.innerHTML = `
<style>
:root {
  --accent: #00d1b2;
  --muted: rgba(255,255,255,0.75);
  --glass-bg: rgba(255,255,255,0.04);
  --glass-border: rgba(255,255,255,0.12);
}

.sysinfo-body {
  height:100%;
  margin:0;
  background: linear-gradient(135deg,#1a2a6c,#b21f1f,#fdbb2d);
  background-size: 300% 300%;
  animation: gradientMove 12s ease infinite;
  font-family: "Segoe UI",sans-serif;
  color:#eef8ff;
}
@keyframes gradientMove {
 0% {background-position:0% 50%;}
 50%{background-position:100% 50%;}
 100%{background-position:0% 50%;}
}

h1.title {
  text-align:center;
  color:#fff;
  margin-bottom:24px;
  font-weight:600;
}

/* 卡片 */
.card {
  background: var(--glass-bg);
  border:1px solid var(--glass-border);
  border-radius:14px;
  box-shadow:0 8px 30px rgba(0,0,0,0.55);
  color:var(--muted);
  overflow:hidden;
  backdrop-filter: blur(8px);
}
.card-header {border-bottom:1px solid rgba(255,255,255,0.1);}
.card-header-title {color:#fff;gap:8px;font-size:.95rem;font-weight:600;}
.card-content {padding:18px;}

/* 圆环进度 */
.circular-box {
  text-align:center;
}
.circular-progress {
  width:100px;
  height:100px;
  position:relative;
  margin:0 auto;
}
.circular-progress svg {transform:rotate(-90deg);}
.circular-progress circle {fill:none;stroke-width:10;}
.circular-progress .bg {stroke:rgba(255,255,255,0.10);}
.circular-progress .progress {stroke:var(--accent);stroke-linecap:round;transition:.5s;}
.circular-progress .label {
  position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-size:1rem;color:#fff;font-weight:700;
}
.stat-title {margin-top:6px;font-size:.85rem;color:#fff;font-weight:600;}

/* Tags */
.tag.is-data {
  background:rgba(255,255,255,0.08);
  border:1px solid rgba(255,255,255,0.1);
  color:#dff;
}

/* Columns spacing */
.columns {margin-bottom:0!important;}
@media(max-width:768px){.column.is-half{flex:0 0 100%;max-width:100%;}}
</style>

<div class="sysinfo-body">
<section class="section">
<div class="container">
<h1 class="title">🚀 系统资源监控仪表盘</h1>
<div id="server-info-container" class="columns is-multiline"></div>
</div>
</section>
</div>
    `;



const urls=(new URLSearchParams(window.location.search).get("urls")||"")
 .split(",").filter(Boolean);
if(urls.length===0) createServerInfoDiv("ws://"+BASE_URL+"ws/","server1");
else urls.forEach((u,i)=>createServerInfoDiv(u,"server"+(i+1)));

}




// -------- 工具函数保持不变 --------
function getBaseUrl(){
 let {host,pathname}=window.location;
 if(!pathname.endsWith('/')) pathname+='/';
 return `${host}${pathname.substring(0,pathname.lastIndexOf('/')+1)}`;
}
  const BASE_URL = getBaseUrl() + 'sysinfo/';

function formatBytes(b){
 if(!b&&b!==0) return "0 Bytes";
 if(b===0) return "0 Bytes";
 const u=['Bytes','KB','MB','GB','TB'];
 const i=Math.floor(Math.log(Math.abs(b))/Math.log(1024));
 return (b/Math.pow(1024,i)).toFixed(2)+' '+u[i];
}
function formatTime(s){
 s=Math.max(0,Math.floor(s));const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),ss=s%60;
 return `${d}天 ${h}小时 ${m}分钟 ${ss}秒`;
}
function delta(key,cur){const last=window[key]||cur;window[key]=cur;return Math.max(0,cur-last);}
function escapeHtml(str){ if(str===null||str===undefined) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
// -------- WebSocket + 渲染 --------
function connectWebSocket(url,id){
 let s=new WebSocket(url);
 s.onopen=()=>updateStatus(id,"已连接");
 s.onerror=()=>updateStatus(id,"连接出错");
 s.onclose=()=>updateStatus(id,"已断开");

 s.onmessage=e=>{
   const i=JSON.parse(e.data), el=document.getElementById(id);
   if(!el) return;

   let cpuCircle=282.6;
   let rD=delta(id+'-rd',i.disk_io?.read_bytes||0), wD=delta(id+'-wd',i.disk_io?.write_bytes||0);
   let rxD=delta(id+'-rx',i.network?.bytes_recv||0), txD=delta(id+'-tx',i.network?.bytes_sent||0);

   const cpu=(i.cpu_usage||0), mem=(i.memory?.percent||0);
   const cpuOff=(1-cpu/100)*cpuCircle, memOff=(1-mem/100)*cpuCircle;

   el.innerHTML=`
   <div class="card">
    <header class="card-header">
      <p class="card-header-title"><i class="fas fa-server"></i>🖥️服务器 — ${i.node||''}</p>
      <div class="ws-status" style="margin-right:12px;color:#8df">${"连接中"}</div>
    </header>
    <div class="card-content">

      <!-- 系统信息 -->
      <p><strong>主机:</strong> ${i.node||''}</p>
      <p><strong>系统:</strong> ${i.os||''} ${i.bits||''} ${i.version||''}</p>
      <p><strong>版本:</strong> ${i.release||''}</p>
      <p><strong><i class="fas fa-microchip"></i> 处理器:</strong> <span class="white-nowrap">${escapeHtml(i.processor||'-')}</span></p>
      <p><strong>启动时间:</strong> ${formatTime((i.timestamp||0)-(i.boot_time||0))}</p>
      <p><strong>当前时间:</strong> ${i.current_time||''} (${i.time_zone||''})</p>

      <hr>

        <!-- 第二排: CPU & 内存 -->
    <div class="columns is-vcentered">
      <div class="column circular-box">
        <div class="circular-progress">
          <svg width="100" height="100">
            <circle class="bg" cx="50" cy="50" r="45"></circle>
            <circle class="progress" cx="50" cy="50" r="45" stroke-dasharray="${cpuCircle}" stroke-dashoffset="${cpuOff}"></circle>
          </svg>
          <div class="label">${cpu.toFixed(1)}%</div>
        </div>
        <div class="stat-title"><i class="fas fa-tachometer-alt"></i> CPU 使用率</div>
        
        <p><strong>频率:</strong> ${(i.cpu_freq||0).toFixed(2)} MHz</p>

               <span class="tag is-data">核心: ${i.cpu_cores||''}</span>
          <span class="tag is-data">线程: ${i.cpu_threads||''}</span>
      </div>

      <div class="column circular-box">
        <div class="circular-progress">
          <svg width="100" height="100">
            <circle class="bg" cx="50" cy="50" r="45"></circle>
            <circle class="progress" cx="50" cy="50" r="45" stroke-dasharray="${cpuCircle}" stroke-dashoffset="${memOff}"></circle>
          </svg>
          <div class="label">${mem.toFixed(1)}%</div>
        </div>
        <div class="stat-title"><i class="fas fa-memory"></i> 内存使用率</div>
        <p><strong>已用:</strong> ${formatBytes(i.memory?.used||0)} / ${formatBytes(i.memory?.total||0)}</p>
        <span class="tag is-data">进程数: ${i.process_count||''}</span>
      </div>
    </div>

      <hr>
<div class="columns">
<div class="column">
          <p><strong><i class="fas fa-hdd"></i> 磁盘</strong></p>
          <progress class="progress is-info mt-2 mb-2 is-warning" value="${i.disk?.percent||0}" max="100"></progress>
          <p><strong>已用:</strong> ${formatBytes(i.disk?.used||0)} / ${formatBytes(i.disk?.total||0)}</p>
          <p><strong>读取:</strong> ${formatBytes(i.disk_io?.read_bytes||0)} (${formatBytes(rD)} /s)</p>
          <p><strong>写入:</strong> ${formatBytes(i.disk_io?.write_bytes||0)} (${formatBytes(wD)} /s)</p>
        </div>
<div class="column">
      <p><strong><i class="fas fa-network-wired"></i> 网络</strong></p>
      <p><strong>接收:</strong> ${formatBytes(i.network?.bytes_recv||0)} (${formatBytes(rxD)} /s)</p>
      <p><strong>发送:</strong> ${formatBytes(i.network?.bytes_sent||0)} (${formatBytes(txD)} /s)</p>
      <p><strong>IP:</strong> ${i.ip_address||''}</p>
      <span class="tag is-data">TCP4: ${i.tcp4_connection_count||''}</span>
      <span class="tag is-data">TCP6: ${i.tcp6_connection_count||''}</span>
</div></div>
      <hr>

      <p><strong>负载:</strong> ${i.load_avg?.map(x=>x.toFixed(2)).join(", ")}</p>

      
    </div>
   </div>
   `;
 };
}

function updateStatus(id,txt){
 const el=document.getElementById(id);
 if(!el) return;
 const s=el.querySelector('.ws-status');
 if(s) s.textContent=txt;
}

function createServerInfoDiv(url,id){
 const box=document.createElement("div");
 box.className="column is-half";
 box.id=id;
 box.innerHTML=`<div class="card"><div class="card-content">等待连接中: ${url}</div></div>`;
 document.getElementById("server-info-container").appendChild(box);
 connectWebSocket(url,id);
}
