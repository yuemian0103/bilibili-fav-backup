// ==UserScript==
// @name         B站收藏夹备份 - 磨砂玻璃 UI（v1.0.5）
// @namespace    https://example.com/
// @version      1.0.5
// @description  v1.0.5：仅在 v1.0.4 基础上做 UI 布局调整：把【封面墙】【只看失效】移到导出 HTML 左侧，并把“按标题或UP主搜索”移到与“清空结果”同一行（用于搜索下方瀑布流）。其它行为与 v1.0.4 保持一致。
// @author       ChatGPT / 月眠
// @match        https://space.bilibili.com/*/favlist*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.bilibili.com
// @connect      www.bilibili.com
// @connect      biliplus.com
// @connect      biliplus.ipcjs.top
// @connect      jijidown.com
// @connect      jiji.moe
// @connect      xbeibeix.com
// @connect      beibeigame.com
// @connect      bbdownloader.com
// @connect      api.biliplus.ipcjs.top
// @run-at       document-idle
// ==/UserScript==

/* 说明：
 - UI 使用磨砂玻璃（中透明，blur 18px）
 - 面板宽 780px，高 820px，拖动记忆位置
 - v1.0.5 在 v1.0.4 基础上仅重排按钮与搜索框位置（不改样式/逻辑）
*/

(async function () {
  'use strict';

  // ---------------------------
  // 基本配置与 API
  // ---------------------------
  const API = {
    LIST_FOLDERS: (up_mid) => `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${up_mid}`,
    FOLDER_ITEMS: (media_id, pn = 1, ps = 20) => `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${media_id}&pn=${pn}&ps=${ps}`,
    VIEW_BY_BVID: (bvid) => `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
    VIEW_BY_AID: (aid) => `https://api.bilibili.com/x/web-interface/view?aid=${aid}`,
  };

  const BEIBEI_DOMAINS = ['https://xbeibeix.com','https://beibeigame.com','https://bbdownloader.com'];

  const ENABLED_SOURCES = { official: true, biliplus: true, jijidown: true, beibei: true, cached: true };

  const PER_SOURCE_RETRY = 1;
  const PER_REQUEST_TIMEOUT = 15000;

  // ---------------------------
  // gmFetch Promise 封装
  // ---------------------------
  function gmFetch(url, opts = {}) {
    return new Promise((resolve, reject) => {
      let responded = false;
      GM_xmlhttpRequest({
        method: opts.method || 'GET',
        url,
        data: opts.data || null,
        responseType: 'json',
        timeout: PER_REQUEST_TIMEOUT,
        headers: Object.assign({ 'Accept': 'application/json, text/javascript, */*; q=0.01' }, opts.headers || {}),
        onload: (res) => {
          responded = true;
          const response = res.response || (res.responseText ? tryParseJSON(res.responseText) : res.responseText);
          resolve({ status: res.status, response, raw: res });
        },
        onerror: (err) => { if (!responded) reject(err); },
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }
  function tryParseJSON(txt) { try { return JSON.parse(txt); } catch (e) { return txt; } }

  // ---------------------------
  // 新 UI 风格（磨砂中透明）
  // ---------------------------
  const style = `
  /* container & glass */
  #bbk_panel { position: fixed; right: 24px; top: 60px; width: 780px; height: 820px; max-height: 90vh; background: rgba(255,255,255,0.75); backdrop-filter: blur(18px) saturate(120%); box-shadow: 0 20px 60px rgba(20,30,50,0.25); border-radius: 14px; border: 1px solid rgba(255,255,255,0.6); z-index: 999999; font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial; display:flex; flex-direction:column; overflow:hidden; }
  #bbk_panel .head { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom: 1px solid rgba(0,0,0,0.06); }
  #bbk_panel .title { font-weight:700; font-size:16px; color:#0b3b72; display:flex; gap:8px; align-items:center; }
  #bbk_panel .sub { font-size:12px; color:#51607a; opacity:0.9; }
  #bbk_panel .body { padding:14px 18px; overflow:auto; flex:1; }
  #bbk_panel .footer { padding:10px 18px; border-top:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:flex-end; gap:8px; background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.04)); }
  /* controls */
  .bbk-row { display:flex; gap:8px; align-items:center; margin-bottom:12px; }
  .bbk-col { display:flex; flex-direction:column; gap:8px; }
  .bbk-btn { padding:8px 12px; border-radius:10px; border: none; background:#f3f6fb; color:#0b3b72; cursor:pointer; box-shadow: 0 2px 6px rgba(10,20,40,0.06); }
  .bbk-btn.prim { background: linear-gradient(180deg,#2D8CFF,#1E6BDB); color:#fff; box-shadow: 0 8px 20px rgba(30,100,220,0.18); }
  .bbk-btn.ghost { background:transparent; border:1px solid rgba(10,20,40,0.06); color:#0b3b72; }
  .bbk-input { padding:8px 10px; border-radius:8px; border:1px solid rgba(10,20,40,0.06); background:rgba(255,255,255,0.85); min-width:120px; color:#0b3b72; }
  .bbk-select-small { padding:6px 8px; border-radius:6px; border:1px solid rgba(10,20,40,0.06); background:rgba(255,255,255,0.85); }
  .folder-list { max-height:220px; overflow:auto; border-radius:8px; border:1px dashed rgba(10,20,40,0.04); padding:10px; background: linear-gradient(180deg, rgba(255,255,255,0.6), rgba(255,255,255,0.5)); }
  .folder-item { display:flex; gap:10px; align-items:center; padding:8px; border-radius:8px; transition: background .12s; }
  .folder-item:hover { background: rgba(10,20,40,0.02); }
  .progress { height:12px; background: rgba(10,20,40,0.06); border-radius:8px; overflow:hidden; }
  .progress > i { display:block; height:100%; background: linear-gradient(90deg,#11b981,#06b6d4); width:0%; transition: width .25s ease; }
  .result-preview { margin-top:12px; max-height:340px; overflow:auto; border-radius:8px; padding:10px; background: rgba(255,255,255,0.55); border:1px solid rgba(10,20,40,0.03); }
  .bbk-item { padding:8px; border-bottom:1px dashed rgba(10,20,40,0.03); display:flex; gap:12px; align-items:center; }
  .bbk-thumb { width:140px; height:80px; object-fit:cover; border-radius:6px; background:#f0f0f0; }
  .bbk-meta { font-size:12px; color:#475569; }
  .bbk-invalid { color:#ef4444; font-weight:700; }
  /* responsive */
  @media (max-width:1000px) { #bbk_panel { width: 92vw; height: 86vh; right:8px; top:40px; } }
  `;

  function injectStyle() {
    if (document.getElementById('bbk_style')) return;
    const s = document.createElement('style');
    s.id = 'bbk_style';
    s.textContent = style;
    document.head.appendChild(s);
  }

  // ---------------------------
  // 状态
  // ---------------------------
  window.bbk_state = window.bbk_state || { folders: [], results: [], foldersLoaded: false };

  // ---------------------------
  // 拖拽并记住位置（适配新尺寸）
  // ---------------------------
  function makeDraggableElement(el, storageKey = 'backup_btn_pos_v104') {
    el.style.position = 'fixed';
    el.style.zIndex = 999999;
    const saved = GM_getValue(storageKey, null);
    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
      el.style.left = saved.left + 'px';
      el.style.top = saved.top + 'px';
      el.style.right = '';
    } else {
      el.style.right = '24px';
      el.style.top = '60px';
    }
    let dragging=false, startX=0, startY=0, origLeft=0, origTop=0;
    el.addEventListener('mousedown', (e)=>{ if(e.button!==0) return; dragging=true; startX=e.clientX; startY=e.clientY; origLeft=el.offsetLeft; origTop=el.offsetTop; if(el.style.right) el.style.right=''; e.preventDefault(); });
    document.addEventListener('mousemove', (e)=>{ if(!dragging) return; const dx=e.clientX-startX, dy=e.clientY-startY; el.style.left=(origLeft+dx)+'px'; el.style.top=(origTop+dy)+'px'; });
    document.addEventListener('mouseup', ()=>{ if(!dragging) return; dragging=false; GM_setValue(storageKey, {left:el.offsetLeft, top:el.offsetTop}); });
  }

  // ---------------------------
  // 启动器（更精致）
  // ---------------------------
  function addLauncher() {
    if (document.getElementById('bbk_launcher')) return document.getElementById('bbk_launcher');
    const btn = document.createElement('button');
    btn.id = 'bbk_launcher';
    btn.textContent = '收藏备份';
    btn.className = 'bbk-btn';
    document.body.appendChild(btn);
    makeDraggableElement(btn, 'backup_btn_pos_v104');
    btn.onclick = () => { const panel = createPanel(); panel.style.display='flex'; if(!window.bbk_state.foldersLoaded) initPanel(); };
    return btn;
  }

  // ---------------------------
  // 面板生成（磨砂布局） —— 修改点：把封面墙/只看失效移到导出左侧，把搜索框放到清空结果右侧
  // ---------------------------
  function createPanel() {
    injectStyle();
    if (document.getElementById('bbk_panel')) return document.getElementById('bbk_panel');
    const panel = document.createElement('div');
    panel.id = 'bbk_panel';
    panel.innerHTML = `
      <div class="head">
        <div class="title">
          <span>收藏备份</span>
          <span class="sub">v1.0.5 · 磨砂玻璃 UI</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button id="bbk_min" class="bbk-btn ghost">—</button>
          <button id="bbk_close" class="bbk-btn ghost">×</button>
        </div>
      </div>
      <div class="body">
        <div class="bbk-row" style="justify-content:flex-start;">
          <button id="bbk_fetch_folders" class="bbk-btn">获取收藏夹列表</button>
          <button id="bbk_select_all" class="bbk-btn">全选</button>
          <button id="bbk_scan" class="bbk-btn prim">开始扫描</button>
          <div style="flex:1"></div>
          <div class="bbk-meta">（仅在你的空间收藏页显示）</div>
        </div>

        <div class="bbk-row">
          <div style="flex:1">
            <div class="folder-list" id="bbk_folder_list">请点击“获取收藏夹列表”</div>
          </div>
          <div style="width:280px;padding-left:12px;display:flex;flex-direction:column;gap:10px;">
            <!-- 右侧设置栏：保留 ps/delay/选项，但移除封面墙/只看失效/搜索框（这些已移到下方工具栏） -->
            <div style="display:flex;gap:8px;align-items:center;">
              <select id="bbk_ps" class="bbk-select-small">
                <option value="20">ps=20（建议）</option>
                <option value="30">ps=30</option>
                <option value="50">ps=50（较快，易限流）</option>
              </select>
              <input id="bbk_delay" class="bbk-input" placeholder="每页延迟 ms（默认500）" />
            </div>
            <div style="display:flex;gap:8px;flex-direction:column;">
              <label><input type="checkbox" id="bbk_incremental" /> 增量扫描（只抓新收藏）</label>
              <label><input type="checkbox" id="bbk_only_invalid_multi" checked /> 仅对失效视频进行多源补全（默认）</label>
            </div>
            <!-- 右侧原本的封面墙/只看失效/搜索 已移除 -->
          </div>
        </div>

        <div style="margin-top:8px;" class="bbk-col">
          <!-- 主工具栏：封面墙、只看失效、导出 HTML、清空结果、搜索框（同一行） -->
          <div style="display:flex;gap:8px;align-items:center;">
            <button id="bbk_view_wall" class="bbk-btn">封面墙</button>
            <button id="bbk_filter_invalid" class="bbk-btn">只看失效</button>
            <button id="bbk_export_html" class="bbk-btn">导出 HTML</button>
            <button id="bbk_clear" class="bbk-btn">清空结果</button>
            <input id="bbk_search" class="bbk-input" placeholder="按标题或UP主搜索" style="flex:1;min-width:200px;" />
          </div>

          <div style="margin-top:8px;">
            <div class="progress"><i id="bbk_progress_bar"></i></div>
            <div id="bbk_progress_text" class="bbk-meta" style="margin-top:6px;">尚未开始</div>
          </div>

          <div id="bbk_result" class="result-preview"></div>
        </div>
      </div>
      <div class="footer">
        <div class="bbk-meta">提示：默认启用增量与仅失效补全以加速大收藏夹扫描</div>
      </div>
    `;
    document.body.appendChild(panel);

    document.getElementById('bbk_close').onclick = () => panel.remove();
    document.getElementById('bbk_min').onclick = () => {
      const body = panel.querySelector('.body');
      if (body.style.display === 'none') { body.style.display='block'; panel.style.height='820px'; } else { body.style.display='none'; panel.style.height='60px'; }
    };

    return panel;
  }

  // ---------------------------
  // 从 URL 提取 up_mid
  // ---------------------------
  function getUpMidFromUrl() {
    const m = location.pathname.match(/\/(\d+)(\/|$)/);
    return m ? m[1] : null;
  }

  // ---------------------------
  // 获取收藏夹列表
  // ---------------------------
  async function fetchFolders() {
    const up_mid = getUpMidFromUrl();
    if (!up_mid) throw new Error('无法从当前 URL 获取用户 UID（请在空间收藏页运行）');
    const url = API.LIST_FOLDERS(up_mid);
    const r = await gmFetch(url);
    if (r.status !== 200 || !r.response) throw new Error('获取收藏夹列表失败');
    const body = r.response;
    if (body.code !== 0) throw new Error('收藏夹接口返回错误 code=' + body.code);
    const folders = (body.data && body.data.list) ? body.data.list.map(f => ({
      id: f.id,
      title: f.title,
      media_count: f.media_count || 0,
      cover: f.cover || ''
    })) : [];
    window.bbk_state.folders = folders;
    window.bbk_state.foldersLoaded = true;
    return folders;
  }

  function renderFolderListToUI(folders) {
    const folderListEl = document.getElementById('bbk_folder_list');
    folderListEl.innerHTML = '';
    window._bbk_ui_favList = [];
    folders.forEach((f, idx) => {
      const row = document.createElement('div');
      row.className = 'folder-item';
      row.innerHTML = `
        <input type="checkbox" data-id="${f.id}" data-idx="${idx}" />
        <div style="flex:1;">
          <div style="font-weight:600;color:#0b3b72">${escapeHtml(f.title)} <span class="bbk-meta">(${f.media_count || 0})</span></div>
          <div class="bbk-meta">${f.cover ? `<img src="${f.cover}" style="width:72px;height:40px;object-fit:cover;border-radius:6px;margin-top:6px;" />` : ''}</div>
        </div>
      `;
      folderListEl.appendChild(row);
      const cb = row.querySelector('input[type=checkbox]');
      window._bbk_ui_favList.push({ id: f.id, title: f.title, media_count: f.media_count, checkbox: cb });
    });
  }

  // ---------------------------
  // 初始化面板并绑定事件
  // ---------------------------
  function initPanel() {
    const panel = createPanel();
    const folderListEl = document.getElementById('bbk_folder_list');
    const progressBar = document.getElementById('bbk_progress_bar');
    const progressText = document.getElementById('bbk_progress_text');
    const resultContainer = document.getElementById('bbk_result');
    const selectAllBtn = document.getElementById('bbk_select_all');
    const fetchFoldersBtn = document.getElementById('bbk_fetch_folders');

    let toggleSelectAll = false;
    selectAllBtn.onclick = () => {
      toggleSelectAll = !toggleSelectAll;
      if (window._bbk_ui_favList && window._bbk_ui_favList.length) {
        window._bbk_ui_favList.forEach(item => { if(item.checkbox) item.checkbox.checked = toggleSelectAll; });
      }
      selectAllBtn.innerText = toggleSelectAll ? '取消全选' : '全选';
    };

    fetchFoldersBtn.onclick = async () => {
      folderListEl.innerHTML = '正在获取收藏夹……';
      try {
        const folders = await fetchFolders();
        renderFolderListToUI(folders);
      } catch (e) {
        folderListEl.innerHTML = `<div style="color:#ef4444">获取收藏夹失败：${escapeHtml(e.message)}</div>`;
      }
    };

    document.getElementById('bbk_clear').onclick = () => {
      window.bbk_state.results = [];
      resultContainer.innerHTML = '';
      progressBar.style.width = '0%';
      progressText.textContent = '结果已清空';
    };

    document.getElementById('bbk_filter_invalid').onclick = () => {
      const btn = document.getElementById('bbk_filter_invalid');
      btn.dataset.filter = btn.dataset.filter === '1' ? '0' : '1';
      btn.style.background = btn.dataset.filter === '1' ? '#fff1f2' : '';
      renderResults();
    };

    document.getElementById('bbk_view_wall').onclick = () => {
      const btn = document.getElementById('bbk_view_wall');
      btn.dataset.wall = btn.dataset.wall === '1' ? '0' : '1';
      renderResults();
    };

    // 搜索仍然绑定到 bbk_search（现在位于工具栏同一行）
    document.getElementById('bbk_search').oninput = () => { renderResults(); };
    document.getElementById('bbk_export_html').onclick = exportHtml;

    // scan 按钮
    document.getElementById('bbk_scan').onclick = async () => {
      const selected = (window._bbk_ui_favList || []).filter(i => i.checkbox && i.checkbox.checked).map(i => ({ id: i.id, title: i.title }));
      if (!selected || selected.length === 0) { alert('请先选择至少一个收藏夹（或点击 全选）'); return; }
      const ps = Number(document.getElementById('bbk_ps').value || 20);
      const delayInput = Number(document.getElementById('bbk_delay').value || 500);
      const delay = Math.max(150, delayInput || 500);
      const incremental = !!document.getElementById('bbk_incremental').checked;
      const onlyInvalidMulti = !!document.getElementById('bbk_only_invalid_multi').checked;

      // 全量扫描时自动清除增量记录（无需用户手动清空）
      if (!incremental) {
        (window.bbk_state.folders || []).forEach(f => {
          GM_setValue('fav_last_time_' + f.id, 0);
          GM_setValue('fav_last_count_' + f.id, 0);
        });
      }

      progressText.textContent = `开始扫描 ${selected.length} 个收藏夹……`;
      progressBar.style.width = '2%';
      window.bbk_state.results = [];

      const expectedTotal = selected.reduce((s, it) => { const found = window.bbk_state.folders.find(f => f.id==it.id); return s + (found ? (found.media_count || 0) : 0); }, 0);
      let processedTotal = 0;

      try {
        const res = [];
        for (let i = 0; i < selected.length; i++) {
          const sel = selected[i];
          const folderResult = await scanSingleFolder(sel.id, sel.title, { ps, delay, incremental, onlyInvalidMulti, onProgress: (info)=> {
            processedTotal = info.processed || processedTotal;
            const percent = expectedTotal ? Math.min(99, Math.floor((processedTotal / Math.max(1, expectedTotal)) * 100)) : Math.min(99, processedTotal % 100);
            progressBar.style.width = percent + '%';
            progressText.textContent = `正在扫描：${sel.title || sel.id} — 已抓取 ${processedTotal} 条（估计 ${expectedTotal || '未知'}）`;
          }});
          res.push(folderResult);
          await sleep(200 + Math.floor(Math.random()*200));
        }
        window.bbk_state.results = res;
        progressBar.style.width = '100%';
        const totalCount = res.reduce((s,r)=> s + (r.list? r.list.length:0), 0);
        progressText.textContent = `扫描完成：共 ${totalCount} 条（分 ${res.length} 个收藏夹）`;

        renderResults();
      } catch (e) {
        console.error(e);
        progressText.textContent = '扫描出现异常：' + e.message;
      }
    };

    if (!window.bbk_state.foldersLoaded) fetchFoldersBtn.click();
  }

  // ---------------------------
  // 扫描单个收藏夹（含增量、只对失效补全逻辑）
  // ---------------------------
  async function scanSingleFolder(media_id, folderTitle='', opts={ ps:20, delay:500, incremental:false, onlyInvalidMulti:true, onProgress:()=>{} }) {
    const folderResult = { folderId: media_id, folderTitle, list: [] };
    const lastTimeKey = 'fav_last_time_' + media_id;
    const lastCountKey = 'fav_last_count_' + media_id;
    const lastScanTime = Number(GM_getValue(lastTimeKey, 0) || 0);
    const lastScanCount = Number(GM_getValue(lastCountKey, 0) || 0);

    let pn = 1, has_more = true, processed = 0;
    while (has_more) {
      const body = await fetchFolderPage(media_id, pn, opts.ps);
      if (!body || body.error) {
        console.warn('fetchFolderPage error', body);
        await sleep(800);
        const rb = await fetchFolderPage(media_id, pn, opts.ps);
        if (!rb || rb.error) break;
        Object.assign(body, rb);
      }
      if (body.code !== 0 || !body.data) break;
      const medias = body.data.medias || [];
      for (const m of medias) {
        const item = {
          title: m.title || m.title_format || '[无标题]',
          bvid: m.bvid || (m.id && m.id.bvid) || '',
          aid: m.id || m.aid || '',
          author: (m.upper && m.upper.name) ? m.upper.name : (m.creator && m.creator.name) || '',
          author_mid: (m.upper && m.upper.mid) ? m.upper.mid : (m.creator && m.creator.mid) || '',
          fav_time: m.fav_time || m.add_at || null,
          cover: m.cover || m.pic || '',
          origin: m,
          invalid: false,
          versions: [],
          selectedTitleSource: 'earliest',
          selectedCoverSource: 'earliest',
        };
        folderResult.list.push(item);
      }
      pn++;
      processed += medias.length;
      opts.onProgress({ folderId: media_id, folderTitle, pn, processed, itemCount: folderResult.list.length });
      if (body.data.has_more === 1 || body.data.has_more === true) has_more = true; else has_more = false;
      await sleep(opts.delay + Math.floor(Math.random()*160));
    }

    // 如果增量模式：只保留新增
    if (opts.incremental) {
      folderResult.list = folderResult.list.filter((it, idx, arr) => {
        const byTime = it.fav_time && Number(it.fav_time) > Number(lastScanTime);
        const byCount = (arr.length - idx) > Number(lastScanCount);
        return byTime || byCount;
      });
    }

    // 对每个视频：先快速官方判断有效性；根据 onlyInvalidMulti 决定是否再做多源补全
    for (let idx=0; idx<folderResult.list.length; idx++) {
      const it = folderResult.list[idx];
      let officialRes = null;
      try { officialRes = await trySourceWithRetry(()=> fetchOfficial(it), PER_SOURCE_RETRY); } catch(e){ officialRes=null; }
      if (officialRes) {
        it.versions.push(Object.assign({source:'official'}, officialRes));
        it.title = officialRes.title || it.title;
        it.cover = officialRes.cover || it.cover;
      }
      it.invalid = !(officialRes && officialRes.title && officialRes.title.indexOf('失效')===-1 && officialRes.title.trim() !== '');
      if (opts.onlyInvalidMulti && !it.invalid) {
        // skip heavy sources for valid items
      } else {
        const more = await fetchOtherSourcesForVideo(it);
        for (const v of more) it.versions.push(v);
        // dedupe & sort versions
        const unique = []; const seen = new Set();
        for (const v of it.versions) {
          const key = ((v.title||'') + '||' + (v.cover||'')).trim();
          if (!seen.has(key)) { seen.add(key); unique.push(v); }
        }
        unique.sort((a,b)=> (a.time||0)-(b.time||0));
        it.versions = unique;
        if (it.versions.length>0) {
          const earliest = it.versions[0];
          it.title = earliest.title || it.title;
          it.cover = earliest.cover || it.cover;
          it.selectedTitleSource = earliest.source;
          it.selectedCoverSource = earliest.source;
        }
      }
      opts.onProgress({ folderId: media_id, folderTitle, itemIndex: idx, processed: idx+1 });
      await sleep(80 + Math.floor(Math.random()*80));
    }

    // 更新增量记录（自动维护）
    try {
      const allFavTimes = folderResult.list.map(it => Number(it.fav_time||0));
      const maxTime = allFavTimes.length? allFavTimes.reduce((a,b)=>Math.max(a,b),0) : lastScanTime;
      const totalCountNow = (window.bbk_state.folders.find(f=>f.id==media_id) || {}).media_count || folderResult.list.length || lastScanCount;
      GM_setValue(lastTimeKey, maxTime);
      GM_setValue(lastCountKey, totalCountNow);
    } catch (e) { console.warn('save incremental fail', e); }

    return folderResult;
  }

  // ---------------------------
  // 非官方来源采集（BiliPlus / Jijidown / Beibei / Cached）
  // ---------------------------
  async function fetchOtherSourcesForVideo(item) {
    const collect = [];
    if (ENABLED_SOURCES.cached) {
      const cacheKey = 'cached_vid_' + (item.bvid || item.aid || (item.origin && item.origin.id) || 'unknown');
      const cached = GM_getValue(cacheKey, null);
      if (cached) {
        try {
          const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
          collect.push({ source: 'cached', title: parsed.title, cover: parsed.cover, time: parsed.time || Date.now() });
        } catch (e) {}
      }
    }
    if (ENABLED_SOURCES.biliplus) {
      const res = await trySourceWithRetry(()=> fetchBiliPlus(item), PER_SOURCE_RETRY);
      if (res) collect.push(Object.assign({source:'biliplus'}, res));
    }
    if (ENABLED_SOURCES.jijidown) {
      const res = await trySourceWithRetry(()=> fetchJiji(item), PER_SOURCE_RETRY);
      if (res) collect.push(Object.assign({source:'jijidown'}, res));
    }
    if (ENABLED_SOURCES.beibei) {
      for (const domain of BEIBEI_DOMAINS) {
        const res = await trySourceWithRetry(()=> fetchBeibei(item, domain), PER_SOURCE_RETRY);
        if (res) collect.push(Object.assign({source: domain.replace(/^https?:\/\//,'beibei:')}, res));
      }
    }
    return collect;
  }

  async function trySourceWithRetry(fn, retry=1) {
    for (let t=0; t<=retry; t++) {
      try {
        const r = await fn();
        if (r && (r.title || r.cover)) return r;
      } catch (e) {}
      await sleep(250 + Math.floor(Math.random()*180));
    }
    return null;
  }

  // ---------------------------
  // 各来源抓取实现
  // ---------------------------
  async function fetchOfficial(item) {
    let bvid = item.bvid || (item.origin && item.origin.bvid) || null;
    let aid = item.aid || (item.origin && item.origin.id) || null;
    try {
      if (bvid) {
        const r = await gmFetch(API.VIEW_BY_BVID(bvid));
        if (r && r.response && r.response.code === 0) {
          const data = r.response.data;
          return { title: data.title, cover: data.pic, time: Date.now() };
        }
      } else if (aid) {
        const r = await gmFetch(API.VIEW_BY_AID(aid));
        if (r && r.response && r.response.code === 0) {
          const data = r.response.data;
          return { title: data.title, cover: data.pic, time: Date.now() };
        }
      }
    } catch (e) {}
    return null;
  }

  async function fetchBiliPlus(item) {
    const bvid = item.bvid || (item.origin && item.origin.bvid) || null;
    if (!bvid) return null;
    try {
      const url = `https://www.biliplus.com/video/${encodeURIComponent(bvid)}`;
      const r = await gmFetch(url, { headers: { 'Accept': 'text/html' } });
      if (r && r.raw && (r.raw.responseText || r.raw.response)) {
        const txt = r.raw.responseText || (typeof r.raw.response === 'string' ? r.raw.response : '');
        const m = txt.match(/window\.__INITIAL_STATE__\s*=\s*(\{.+?\});/s);
        if (m && m[1]) {
          const json = tryParseJSON(m[1]);
          if (json && json.videoData) {
            const title = (json.videoData.title || json.title || '').toString();
            const pic = json.videoData.pic || (json.video && json.video.pic) || '';
            return { title, cover: pic, time: Date.now() };
          }
        }
        const m2 = txt.match(/"pic"\s*:\s*"([^"]+)"/);
        if (m2 && m2[1]) return { title: item.title || '', cover: decodeURIComponent(m2[1]), time: Date.now() };
      }
    } catch (e) {}
    return null;
  }

  async function fetchJiji(item) {
    const bvid = item.bvid || (item.origin && item.origin.bvid) || null;
    if (!bvid) return null;
    const apis = [
      `https://api.biliplus.ipcjs.top/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
      `https://jiji.moe/api/v1/video?bvid=${encodeURIComponent(bvid)}`,
    ];
    for (const url of apis) {
      try {
        const r = await gmFetch(url);
        if (r && r.response) {
          const body = r.response;
          if (body.code === 0 && body.data) return { title: body.data.title || item.title || '', cover: body.data.pic || '', time: Date.now() };
          else if (body.title || body.pic) return { title: body.title || item.title || '', cover: body.pic || '', time: Date.now() };
        }
      } catch (e) {}
    }
    return null;
  }

  async function fetchBeibei(item, domain) {
    const bvid = item.bvid || (item.origin && item.origin.bvid) || null;
    if (!bvid) return null;
    const url = `${domain.replace(/\/$/, '')}/video/${encodeURIComponent(bvid)}`;
    try {
      const r = await gmFetch(url, { headers: { 'Accept': 'text/html' } });
      if (r && r.raw && r.raw.responseText) {
        const txt = r.raw.responseText;
        try {
          const doc = new DOMParser().parseFromString(txt, 'text/html');
          const h5 = doc.querySelector('h5.fw-bold') || doc.querySelector('h5') || null;
          const title = h5 ? h5.textContent.trim() : (item.title || '');
          const img = doc.querySelector('.col-4 img') || doc.querySelector('img');
          const cover = img ? (img.src || img.getAttribute('data-src') || '') : '';
          return { title, cover, time: Date.now() };
        } catch (ee) {
          const mt = txt.match(/<h5[^>]*>([^<]+)<\/h5>/);
          const mi = txt.match(/<img[^>]+src=["']([^"']+)["']/);
          const title = mt ? mt[1].trim() : (item.title || '');
          const cover = mi ? mi[1] : '';
          return { title, cover, time: Date.now() };
        }
      }
    } catch (e) {}
    return null;
  }

  // ---------------------------
  // 渲染结果（含每条来源下拉）
  // ---------------------------
  function renderResults() {
    const wallMode = (document.getElementById('bbk_view_wall').dataset.wall === '1');
    const onlyInvalid = (document.getElementById('bbk_filter_invalid').dataset.filter === '1');
    const q = (document.getElementById('bbk_search').value || '').trim().toLowerCase();
    const container = document.getElementById('bbk_result');
    container.innerHTML = '';
    const results = window.bbk_state.results || [];
    if (!results || results.length === 0) { container.innerHTML = `<div class="bbk-meta">尚无结果，先扫描收藏夹。</div>`; return; }

    function buildSelectHTML(idPrefix, versions) {
      let html = `<select class="bbk-select-small" data-select-id="${idPrefix}">`;
      if (versions.length>0) {
        html += `<option value="earliest">最早可用</option>`;
        html += `<option value="latest">最新可用</option>`;
        for (const v of versions) {
          const label = `${v.source} ${v.time?('('+ new Date(v.time).toLocaleString()+')') : ''}`;
          html += `<option value="${escapeHtml(v.source)+'|||'+ (v.time||0)}">${escapeHtml(label)}</option>`;
        }
      } else { html += `<option value="none">无来源</option>`; }
      html += `</select>`;
      return html;
    }

    if (wallMode) {
      const grid = document.createElement('div');
      Object.assign(grid.style, { columnCount: 3, columnGap: '10px' });
      results.forEach(folder => {
        folder.list.forEach(it => {
          if (onlyInvalid && !it.invalid) return;
          if (q) { const s=((it.title||'') + ' ' + (it.author||'')).toLowerCase(); if (!s.includes(q)) return; }
          const el = document.createElement('div'); el.style.breakInside='avoid'; el.style.marginBottom='8px';
          const versions = it.versions || []; const coverSelectHTML = buildSelectHTML('cover_'+(it.bvid||it.aid||''), versions);
          el.innerHTML = `
            <div style="padding:10px;border-radius:10px;background:rgba(255,255,255,0.55);box-shadow:0 6px 18px rgba(10,20,30,0.04)">
              <div style="text-align:center;">
                <a href="https://www.bilibili.com/video/${encodeURIComponent(it.bvid||'')}" target="_blank">
                  <img class="bbk-thumb" src="${it.cover || ''}" alt="${escapeHtml(it.title)}" style="width:100%;height:auto;max-height:160px;border-radius:8px;"/>
                </a>
              </div>
              <div style="font-size:13px;color:#0b3b72;margin-top:8px;">${escapeHtml(it.title||'')}</div>
              <div class="bbk-meta">${escapeHtml(it.author||'')}</div>
              <div style="margin-top:8px;display:flex;justify-content:center;">${coverSelectHTML}</div>
            </div>
          `;
          grid.appendChild(el);
        });
      });
      container.appendChild(grid);
      container.querySelectorAll('select[data-select-id]').forEach(sel=> sel.onchange = function(){ handleSelectChange(this.dataset.selectId, this.value); });
      return;
    }

    // grouped view
    results.forEach(folder => {
      const group = document.createElement('div'); group.className='bbk-collapsible';
      const title = document.createElement('div'); title.className='title'; title.textContent = `${folder.folderTitle} （${folder.list.length}）`;
      group.appendChild(title);
      const list = document.createElement('div');
      folder.list.forEach(it => {
        if (onlyInvalid && !it.invalid) return;
        if (q) { const s=((it.title||'') + ' ' + (it.author||'')).toLowerCase(); if (!s.includes(q)) return; }
        const row = document.createElement('div'); row.className='bbk-item';
        const versions = it.versions || [];
        const titleSelect = buildSelectHTML('title_'+(it.bvid||it.aid||''), versions);
        const coverSelect = buildSelectHTML('cover_'+(it.bvid||it.aid||''), versions);
        row.innerHTML = `
          <img class="bbk-thumb" src="${it.cover || ''}" onerror="this.style.opacity=0.5;this.style.background='#eee';" />
          <div style="flex:1;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="font-weight:700;color:#0b3b72">${escapeHtml(it.title)}</div>
              <div style="font-size:12px">${it.invalid ? '<span class="bbk-invalid">已失效</span>' : ''}</div>
            </div>
            <div class="bbk-meta">UP：${escapeHtml(it.author)} (${it.author_mid || ''}) • 收藏时间：${formatTs(it.fav_time)}</div>
            <div class="bbk-meta">bvid/aid: ${escapeHtml(it.bvid || '')} / ${escapeHtml(it.aid || '')}</div>
            <div style="margin-top:8px; display:flex; gap:10px; align-items:center;">
              标题来源： ${titleSelect}
              封面来源： ${coverSelect}
            </div>
          </div>
        `;
        list.appendChild(row);
      });
      group.appendChild(list);
      title.onclick = ()=> { list.style.display = list.style.display==='none' ? 'block':'none'; };
      container.appendChild(group);
    });

    container.querySelectorAll('select[data-select-id]').forEach(sel=> sel.onchange = function(){ handleSelectChange(this.dataset.selectId, this.value); });
  }

  function handleSelectChange(selectId, val) {
    try {
      const parts = selectId.split('_'); const kind = parts[0]; const vid = parts.slice(1).join('_');
      for (const folder of (window.bbk_state.results||[])) {
        for (const it of folder.list) {
          const idMatch = (it.bvid || it.aid || '').toString();
          if (idMatch === vid || ('title_'+it.bvid)===selectId || ('title_'+it.aid)===selectId || ('cover_'+it.bvid)===selectId || ('cover_'+it.aid)===selectId) {
            const versions = it.versions || [];
            if (val === 'earliest') {
              if (versions.length>0) { const earliest=versions[0]; if(kind==='title'){ it.title=earliest.title||it.title; it.selectedTitleSource=earliest.source; } else { it.cover=earliest.cover||it.cover; it.selectedCoverSource=earliest.source; } }
            } else if (val === 'latest') {
              if (versions.length>0) { const latest=versions[versions.length-1]; if(kind==='title'){ it.title=latest.title||it.title; it.selectedTitleSource=latest.source; } else { it.cover=latest.cover||it.cover; it.selectedCoverSource=latest.source; } }
            } else if (val === 'none') {
              // nothing
            } else {
              const idx = val.indexOf('|||'); const src = idx>-1 ? val.slice(0,idx) : val;
              const match = versions.find(v => (v.source===src || (v.source && src.indexOf(v.source)!==-1)));
              if (match) { if (kind==='title'){ it.title = match.title || it.title; it.selectedTitleSource = match.source; } else { it.cover = match.cover || it.cover; it.selectedCoverSource = match.source; } }
            }
            try { const key = 'sel_' + (it.bvid || it.aid || idMatch); GM_setValue(key, JSON.stringify({ titleSrc: it.selectedTitleSource, coverSrc: it.selectedCoverSource })); } catch(e){}
            renderResults();
            return;
          }
        }
      }
    } catch (e) { console.warn('handleSelectChange error', e); }
  }

  // ---------------------------
  // 导出 HTML
  // ---------------------------
  function exportHtml() {
    const results = window.bbk_state.results || [];
    if (!results || results.length === 0) { alert('没有数据可导出，请先扫描收藏夹。'); return; }
    const rows = [];
    rows.push(`<html><head><meta charset="utf-8"><title>B站收藏夹备份</title><style>body{font-family:Arial,Helvetica,sans-serif} .item{border-bottom:1px solid #eee;padding:10px;display:flex;gap:12px} .thumb{width:160px;height:90px;object-fit:cover}</style></head><body>`);
    rows.push(`<h1>备份时间：${(new Date()).toLocaleString()}</h1>`);
    results.forEach(folder => {
      rows.push(`<h2>${escapeHtml(folder.folderTitle)} （${folder.list.length}）</h2>`);
      folder.list.forEach(it => {
        rows.push(`<div class="item">`);
        rows.push(`<div><img class="thumb" src="${(it.cover||'')}" /></div>`);
        rows.push(`<div><div style="font-weight:700">${escapeHtml(it.title)}</div>`);
        rows.push(`<div>UP：${escapeHtml(it.author)} (${it.author_mid || ''})</div>`);
        rows.push(`<div>bvid/aid：${escapeHtml(it.bvid || '')} / ${escapeHtml(it.aid || '')}</div>`);
        rows.push(`<div>收藏时间：${formatTs(it.fav_time)}</div>`);
        rows.push(`<div>失效：${it.invalid ? '是' : '否'}</div>`);
        rows.push(`<details><summary>所有版本（按时间）</summary><ul>`);
        (it.versions||[]).forEach(v=> { rows.push(`<li>${escapeHtml(v.source)} | ${v.time?new Date(v.time).toLocaleString():'-'} | 标题：${escapeHtml(v.title||'')} | 封面：${escapeHtml(v.cover||'')}</li>`); });
        rows.push(`</ul></details>`);
        rows.push(`</div></div>`);
      });
    });
    rows.push(`</body></html>`);
    const blob = new Blob([rows.join('\n')], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bili_fav_backup_${Date.now()}.html`; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
  }

  // ---------------------------
  // 工具函数
  // ---------------------------
  function escapeHtml(s) { if (!s && s!==0) return ''; return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }
  function formatTs(ts) { if (!ts) return ''; const t = Number(ts); if (t>1e12) return new Date(t).toLocaleString(); if (t>1e10) return new Date(t).toLocaleString(); if (t>1e9) return new Date(t*1000).toLocaleString(); return ''; }
  function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }

  // ---------------------------
  // 列页请求包装（含轻重试）
  // ---------------------------
  async function fetchFolderPage(media_id, pn, ps) {
    const url = API.FOLDER_ITEMS(media_id, pn, ps);
    try {
      const r = await gmFetch(url);
      if (r.status !== 200 || !r.response) return { error: true, raw: r };
      return r.response;
    } catch (e) { return { error:true, raw: e }; }
  }

  // ---------------------------
  // 暴露与启动
  // ---------------------------
  addLauncher();
  window._bbk_tools = { fetchFolders, fetchFolderPage, scanSingleFolder, renderResults, exportHtml, fetchOtherSourcesForVideo };

  // 自动初始化面板（若用户已打开）
  // end
})();
