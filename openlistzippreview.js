// ==UserScript==
// @name         OpenList Cinema (V16 Rock Solid)
// @namespace    http://tampermonkey.net/
// @version      16.0
// @description  引入“高度锁定”技术，彻底解决条漫滚动跳动问题。最稳健的内存管理，Fluent UI。
// @author       Advanced AI
// @match        *://*/*
// @include      *
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 1. 全局配置
    // ==========================================
    const CONFIG = {
        // 封面墙并发数
        COVER_CONCURRENCY: 6,
        
        // 阅读器预加载窗口：
        // 范围越大越流畅，内存占用越高。
        // "200%" 表示预加载当前屏幕 上下各 2 屏 的内容。
        PRELOAD_MARGIN: "200% 0px 200% 0px", 
        
        // 卸载阈值：
        // 距离视口多远才卸载？(单位：像素)。设大一点防止来回滚动时反复加载。
        UNLOAD_DISTANCE: 3000, 

        ZIP_EXT: /\.(zip|cbz)$/i,
        IMG_EXT: /\.(jpg|jpeg|png|webp|gif|bmp)$/i,
        COVER_REGEX: /cover|front|folder|index|^0+1\.|^000\.|^001\.|^01\./i, 
        
        API_META: '/api/fs/archive/meta'
    };

    // ==========================================
    // 2. 样式系统 (Fluent UI - 稳健版)
    // ==========================================
    GM_addStyle(`
        :root {
            --mica-bg: #f3f3f3;
            --mica-card: #ffffff;
            --mica-accent: #0067c0;
            --mica-accent-hover: #005a9e;
            --mica-shadow: 0 2px 8px rgba(0,0,0,0.06);
            --mica-shadow-hover: 0 12px 32px rgba(0,0,0,0.15);
            
            --cin-card-width: 170px;
            --cin-gap: 24px;
        }

        /* === 1. 列表容器 === */
        .header-row, .hope-stack.title, .list-header, div[class*="title"][class*="stack"] { display: none !important; }

        .list, .hope-stack.list, .obj-box > .list, div[class*="list"][class*="stack"] {
            display: grid !important;
            grid-template-columns: repeat(auto-fill, minmax(var(--cin-card-width), 1fr)) !important;
            gap: var(--cin-gap) !important;
            padding: 32px 48px !important;
            width: 100% !important; box-sizing: border-box !important; background: transparent !important;
        }

        /* 卡片 */
        .list-item, a.list-item, div[class*="list-item"] {
            display: flex !important; flex-direction: column !important; height: auto !important;
            background: var(--mica-card) !important; 
            border-radius: 8px !important; 
            overflow: hidden !important;
            padding: 0 !important; 
            box-shadow: var(--mica-shadow) !important;
            border: none !important;
            transition: transform 0.2s, box-shadow 0.2s !important;
            position: relative !important; text-decoration: none !important; cursor: default !important;
        }
        .list-item:hover { transform: translateY(-4px); box-shadow: var(--mica-shadow-hover) !important; z-index: 5; }

        .ozs-poster-wrapper {
            position: relative; width: 100%; aspect-ratio: 2/3; background: #eef0f2; overflow: hidden;
        }
        .ozs-poster-img { 
            width: 100%; height: 100%; object-fit: cover; transition: opacity 0.3s; opacity: 0; display: block; 
        }
        .ozs-poster-img.loaded { opacity: 1; }

        .ozs-default-poster {
            width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
            background: linear-gradient(135deg, #e0e0e0 0%, #f0f0f0 100%); color: #aaa;
        }
        .ozs-def-icon { font-size: 32px; opacity: 0.5; margin-bottom: 5px; }

        .ozs-title-overlay {
            position: absolute; bottom: 0; left: 0; right: 0;
            background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 60%, transparent 100%);
            padding: 24px 10px 10px 10px; pointer-events: none;
        }
        .ozs-title-text {
            color: #fff; font-size: 13px; font-weight: 600; text-shadow: 0 1px 3px rgba(0,0,0,0.8);
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.35;
        }

        .ozs-action-btn {
            display: flex; align-items: center; justify-content: center;
            width: 100%; height: 40px; background: #fff; color: var(--mica-accent);
            border: none; border-top: 1px solid rgba(0,0,0,0.05);
            font-size: 12px; font-weight: 700; letter-spacing: 1px;
            cursor: pointer; transition: all 0.2s; text-transform: uppercase;
        }
        .ozs-action-btn:hover { background: var(--mica-accent); color: #fff; }

        .list-item svg, .list-item .size, .list-item .modified, .list-item .checkbox, .list-item .name { display: none !important; }

        /* === 2. 阅读器 UI (Stable) === */
        #ig-root { 
            position: fixed; inset: 0; z-index: 2147483647; 
            background: #fff; display: flex; flex-direction: column; 
            font-family: "Segoe UI", sans-serif;
        }
        
        .ig-toolbar {
            height: 50px; flex-shrink: 0; 
            background: rgba(255, 255, 255, 0.98); border-bottom: 1px solid #eee; 
            display: flex; align-items: center; justify-content: space-between;
            padding: 0 20px; z-index: 100;
        }
        .ig-title { font-weight: 600; font-size: 15px; color:#333; max-width: 60%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
        .ig-view { 
            flex: 1; overflow-y: auto; width: 100%; 
            display: flex; flex-direction: column; align-items: center;
            /* 关键：使用 transform 提升合成层，减少重绘 */
            will-change: scroll-position;
        }

        /* --- Webtoon 模式 --- */
        .ig-view.mode-webtoon { 
            background: #222; padding: 0; gap: 0; display: block;
        }
        .ig-view.mode-webtoon .ig-page {
            width: 100%; 
            /* 默认占位高度，防止初始渲染空列表 */
            min-height: 200px; 
            background: #222; 
            display: block; position: relative;
            margin: 0; border: none;
        }
        .ig-view.mode-webtoon .ig-img {
            display: block; width: 100%; height: auto;
        }

        /* --- Standard 模式 (垂直流) --- */
        .ig-view.mode-standard {
            background: #f4f4f4; padding: 40px 0; gap: 40px;
        }
        .ig-view.mode-standard .ig-page {
            /* 居中大图 */
            width: auto; max-width: 95vw;
            min-width: 300px; min-height: 400px;
            background: #fff;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            border-radius: 4px;
            display: flex; align-items: center; justify-content: center;
            position: relative;
        }
        .ig-view.mode-standard .ig-img {
            display: block; max-width: 100%; max-height: 95vh; 
            width: auto; height: auto;
        }

        /* 通用图片状态 */
        .ig-img { opacity: 0; transition: opacity 0.2s ease-in; }
        .ig-img.visible { opacity: 1; }

        /* 占位 loading */
        .ig-loading {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 40px; height: 40px; 
            border: 3px solid rgba(100,100,100,0.2); border-top-color: var(--mica-accent);
            border-radius: 50%; animation: spin 0.8s linear infinite;
            pointer-events: none;
        }
        @keyframes spin { to {transform: translate(-50%, -50%) rotate(360deg);} }

        /* 控件 */
        .ig-btn-group { display: flex; background: #eee; padding: 2px; border-radius: 6px; margin-right: 15px; }
        .ig-btn { border: none; background: transparent; padding: 5px 12px; border-radius: 4px; font-size: 13px; cursor: pointer; color: #666; }
        .ig-btn.active { background: #fff; color: #000; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .ig-close { padding: 5px 12px; background: transparent; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; color: #333; font-size: 13px; }
        .ig-close:hover { background: #e00; color: #fff; border-color: #e00; }
        .ig-error { color: red; font-size: 12px; padding: 20px; text-align: center; }
    `);

    // ==========================================
    // 3. 服务端 API
    // ==========================================
    const API = {
        getToken: () => localStorage.getItem('token') || localStorage.getItem('alist_token') || '',

        async fetchMeta(zipPath) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "POST",
                    url: CONFIG.API_META,
                    headers: { "Content-Type": "application/json", "Authorization": API.getToken() },
                    data: JSON.stringify({ path: zipPath, password: "" }),
                    onload: (res) => {
                        try {
                            const json = JSON.parse(res.responseText);
                            if (json.code === 200 && json.data) resolve(json.data);
                            else reject(json.message);
                        } catch (e) { reject("API Error"); }
                    },
                    onerror: () => reject("Network Error")
                });
            });
        },

        parseImages(dataContent) {
            let images = [];
            function traverse(nodes, parentPath) {
                if (!nodes || !Array.isArray(nodes)) return;
                nodes.forEach(node => {
                    const currentPath = parentPath + "/" + node.name;
                    if (node.is_dir) {
                        if (node.children) traverse(node.children, currentPath);
                    } else {
                        if (CONFIG.IMG_EXT.test(node.name)) {
                            images.push({ name: node.name, innerPath: currentPath });
                        }
                    }
                });
            }
            traverse(dataContent, "");
            return images;
        }
    };

    // ==========================================
    // 4. 海报墙 (Cinema Mode) - UI Only
    // ==========================================
    class CinemaMode {
        constructor() {
            this.queue = [];
            this.active = 0;
            this.initObserver();
        }
        init() {
            const ob = new MutationObserver(() => this.transform());
            ob.observe(document.body, { childList: true, subtree: true });
            this.transform();
        }
        transform() {
            document.querySelectorAll('.list-item').forEach(item => {
                if (item.dataset.cinema) return;
                item.dataset.cinema = "true";

                const nameEl = item.querySelector('.name') || item.querySelector('.text-truncate');
                const rawName = nameEl ? nameEl.textContent.trim() : "File";
                const isZip = CONFIG.ZIP_EXT.test(rawName);
                
                let path = item.getAttribute('href') || item.dataset.path;
                if (!path) { const l = item.querySelector('a'); if(l) path = l.getAttribute('href'); }
                path = decodeURIComponent(path || "");

                // 海报部分
                let posterHtml;
                if (isZip) {
                    posterHtml = `
                        <img class="ozs-poster-img" loading="lazy" data-path="${path}">
                        <div class="ozs-title-overlay"><div class="ozs-title-text">${rawName}</div></div>
                    `;
                } else {
                    const isDir = item.querySelector('svg[viewBox*="folder"]');
                    const icon = isDir ? "📁" : "📄";
                    posterHtml = `
                        <div class="ozs-default-poster"><div class="ozs-def-icon">${icon}</div></div>
                        <div class="ozs-title-overlay"><div class="ozs-title-text">${rawName}</div></div>
                    `;
                }

                // 按钮部分
                let btnHtml = isZip 
                    ? `<button class="ozs-action-btn">READ</button>`
                    : `<button class="ozs-action-btn" style="color:#bbb;cursor:default;">${isZip?'':'FILE'}</button>`;

                item.innerHTML = `<div class="ozs-poster-wrapper">${posterHtml}</div>${btnHtml}`;

                if (isZip) {
                    item.querySelector('.ozs-action-btn').onclick = (e) => {
                        e.preventDefault(); e.stopPropagation();
                        ReaderApp.open(rawName, path);
                    };
                    this.obs.observe(item.querySelector('.ozs-poster-img'));
                }
            });
        }
        initObserver() {
            this.obs = new IntersectionObserver((entries) => {
                entries.forEach(e => {
                    if (e.isIntersecting) { this.obs.unobserve(e.target); this.loadCover(e.target); }
                });
            }, { rootMargin: '200px' });
        }
        async loadCover(img) {
            if (this.active >= CONFIG.COVER_CONCURRENCY) { setTimeout(()=>this.loadCover(img), 200); return; }
            this.active++;
            try {
                const meta = await API.fetchMeta(img.dataset.path);
                const images = API.parseImages(meta.content);
                let target = images.find(e => CONFIG.COVER_REGEX.test(e.name)) || images[0];
                if (target) {
                    img.src = `${meta.raw_url}?sign=${meta.sign}&inner=${encodeURIComponent(target.innerPath)}`;
                    img.classList.add('loaded');
                } else {
                    img.style.display = 'none'; // 显示下方默认底图
                }
            } catch(e) { } 
            finally { this.active--; }
        }
    }

    // ==========================================
    // 5. 阅读器 (Robust Engine) - 核心修复
    // ==========================================
    class Reader {
        constructor() {
            this.files = [];
            this.meta = null;
            this.mode = 'mode-webtoon';
        }

        async open(title, path) {
            this.buildUI(title);
            try {
                this.meta = await API.fetchMeta(path);
                this.files = API.parseImages(this.meta.content).sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
                if (this.files.length === 0) throw new Error("No images");
                this.render();
            } catch(e) { alert("Error: " + e); this.close(); }
        }

        buildUI(title) {
            if(this.root) this.root.remove();
            this.root = document.createElement('div');
            this.root.id = 'ig-root';
            this.root.innerHTML = `
                <div class="ig-toolbar">
                    <div class="ig-title">${title}</div>
                    <div style="display:flex;align-items:center;">
                        <div class="ig-btn-group">
                            <button class="ig-btn ${this.mode==='mode-webtoon'?'active':''}" id="btn-web">条漫</button>
                            <button class="ig-btn ${this.mode==='mode-standard'?'active':''}" id="btn-std">翻页</button>
                        </div>
                        <button class="ig-close" id="ig-close">关闭</button>
                    </div>
                </div>
                <div class="ig-view ${this.mode}" id="ig-view"></div>
            `;
            document.body.appendChild(this.root);
            this.root.querySelector('#ig-close').onclick = () => this.close();
            this.root.querySelector('#btn-web').onclick = () => this.setMode('mode-webtoon');
            this.root.querySelector('#btn-std').onclick = () => this.setMode('mode-standard');
        }

        setMode(m) {
            this.mode = m;
            this.root.querySelector('#ig-view').className = `ig-view ${m}`;
            this.root.querySelector('#btn-web').classList.toggle('active', m==='mode-webtoon');
            this.root.querySelector('#btn-std').classList.toggle('active', m==='mode-standard');
            // 切换模式后，强制刷新布局（重新触发 Observer）
            this.render(); 
        }

        render() {
            const container = document.getElementById('ig-view');
            container.innerHTML = ''; // 清空旧内容
            
            // 独立的 Observer，确保不重用旧逻辑
            if (this.obs) this.obs.disconnect();
            
            this.obs = new IntersectionObserver((entries) => {
                entries.forEach(e => {
                    const file = e.target.fileRef;
                    if (e.isIntersecting) {
                        this.loadImage(file);
                    } else {
                        // 只有距离较远时才卸载，防止频繁闪烁
                        // 这里我们简单使用 intersectionRatio 为 0 且 boundingClientRect 距离较远判断
                        // 简化逻辑：离开即检查卸载
                        this.unloadImage(file, e.target);
                    }
                });
            }, { 
                root: container, 
                rootMargin: CONFIG.PRELOAD_MARGIN // 200% 预加载
            });

            this.files.forEach(file => {
                const page = document.createElement('div');
                page.className = 'ig-page';
                // 初始显示 Loading
                page.innerHTML = `<div class="ig-loading"></div><img class="ig-img" referrerpolicy="no-referrer">`;
                
                page.fileRef = file;
                file.el = page;
                
                // 重置状态
                file.loaded = false;
                file.height = 0; // 高度记录清零
                
                container.appendChild(page);
                this.obs.observe(page);
            });
        }

        loadImage(file) {
            if (file.loaded) return;
            
            const img = file.el.querySelector('.ig-img');
            const url = `${this.meta.raw_url}?sign=${this.meta.sign}&inner=${encodeURIComponent(file.innerPath)}`;
            
            // 加载逻辑
            img.onload = () => {
                // 1. 显示图片
                img.classList.add('visible');
                file.el.querySelector('.ig-loading')?.remove();
                
                // 2. 记录真实高度 (高度锁定核心)
                // 在 Webtoon 模式下，这个高度就是占位高度
                file.height = img.offsetHeight || img.naturalHeight; 
                
                // 3. 解除容器限制 (如果有的话)
                file.el.style.minHeight = 'auto';
                file.el.style.height = 'auto'; // 让内容撑开
                
                file.loaded = true;
            };
            
            img.onerror = () => {
                file.el.innerHTML = `<div class="ig-error">Error</div>`;
            };
            
            img.src = url;
        }

        unloadImage(file, targetEl) {
            if (!file.loaded) return;
            
            // 距离检测 (简单优化：如果还在预加载范围内，不要卸载)
            // 但 IntersectionObserver 已经在 rootMargin 外了，所以这里可以直接卸载
            
            const img = file.el.querySelector('.ig-img');
            if (img && file.height > 0) {
                // === 核心黑科技：高度锁定 ===
                // 在移除 src 之前，先把容器高度强制设置为刚才记录的图片高度
                // 这样 DOM 尺寸完全不变，滚动条就不会跳动了
                file.el.style.height = file.height + 'px';
                file.el.style.minHeight = file.height + 'px';
                
                // 移除图片数据，释放内存
                img.removeAttribute('src'); 
                img.classList.remove('visible');
                
                // 加回 Loading (为了下次划回来时的视觉反馈)
                if (!file.el.querySelector('.ig-loading')) {
                    const l = document.createElement('div'); l.className='ig-loading';
                    file.el.prepend(l);
                }
            }
            file.loaded = false;
        }

        close() { 
            if(this.root) this.root.remove(); 
            this.files = []; this.meta = null; 
            if(this.obs) this.obs.disconnect();
        }
    }

    const ReaderApp = new Reader();
    const Cinema = new CinemaMode();
    Cinema.init();

})();
