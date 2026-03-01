// ==UserScript==
// @name         OpenList Cinema V3.2 Lite (Mobile/Tablet)
// @namespace    http://tampermonkey.net/
// @version      3.2.0
// @description  Alist 移动端优化版：大幅提升性能，全屏沉浸阅读，放大海报占比，纯触控逻辑适配
// @author       Advanced AI
// @match        *://*/*
// @include      *
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      *
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // --- 1. 轻量化配置 ---
    const C = {
        CONCURRENCY: 3, // [优化] 降低移动端并发，防止网络与DOM渲染阻塞
        PRELOAD_Y: "0px 0px 1000px 0px", // 移动端视口较小，预加载范围适中即可
        ZIP_RX: /\.(zip|cbz)$/i,
        IMG_RX: /\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i,
        VID_RX: /\.(mp4|webm|mkv|mov|avi)$/i,
        COVER_RX: /(cover|title|poster|front|folder|index)/i, // 维持纯语义精准寻址
        API: '/api/fs/archive/meta'
    };

    // --- 2. 移动端/极速版 UI 注入 ---
    GM_addStyle(`
        /* 隐藏原生冗余头部，消除闪烁 */
        .header-row, .hope-stack.title, .list-header { display: none !important; }
        .hope-c-pjLVOS { opacity: 0; animation: oz-fade-in 0.4s ease forwards; }
        @keyframes oz-fade-in { to { opacity: 1; } }

        /* [优化] 暴力解除 HOPE-UI 的边距限制，让屏幕空间最大化 */
        .hope-c-PJLV-ijgOOXw-css, .hope-c-PJLV-iiHnaja-css, .hope-c-pjLVOS, .hope-main, #root {
            padding: 0 !important; margin: 0 !important; max-width: 100% !important;
        }

        /* 隐藏全局滚动条，营造原生App感 */
        body::-webkit-scrollbar { display: none; }
        body { -ms-overflow-style: none; scrollbar-width: none; -webkit-tap-highlight-color: transparent; }
        html.oz-lock, body.oz-lock { overflow: hidden !important; height: 100vh !important; }

        :root {
            --oz-bg: #ffffff;
            --oz-border: 1px solid #e5e7eb;
            --oz-shd: 0 2px 10px rgba(0, 0, 0, 0.05);
            --oz-icon-opacity: 0.4;
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --oz-bg: #1c1c1e; /* iOS 深色模式标准底色 */
                --oz-border: 1px solid #2c2c2e;
                --oz-shd: 0 4px 16px rgba(0, 0, 0, 0.4);
                --oz-icon-opacity: 0.8;
            }
        }
        body[class*="dark"] {
            --oz-bg: #1c1c1e; --oz-border: 1px solid #2c2c2e; --oz-shd: 0 4px 16px rgba(0, 0, 0, 0.4); --oz-icon-opacity: 0.8;
        }

        /* [优化] 放大海报占比与网格调整 */
        .list, .hope-stack.list, .obj-box>.list {
            display: grid !important;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)) !important; /* 平板/PC端默认稍大 */
            gap: 16px !important; padding: 16px !important;
            width: 100% !important; box-sizing: border-box !important; background: transparent !important;
        }

        /* 手机端极限双列布局，海报硕大，不卡顿 */
        @media (max-width: 768px) {
            .list, .hope-stack.list, .obj-box>.list {
                grid-template-columns: repeat(2, 1fr) !important;
                gap: 8px !important; padding: 8px !important;
            }
        }

        /* 卡片极简样式，废弃毛玻璃 */
        .oz-card {
            display: flex !important; flex-direction: column !important;
            aspect-ratio: 2/3 !important; height: auto !important;
            background: var(--oz-bg) !important;
            border: var(--oz-border) !important; border-radius: 12px !important;
            box-shadow: var(--oz-shd) !important;
            padding: 0 !important; margin: 0 !important;
            overflow: hidden !important; position: relative !important;
            transition: transform 0.15s ease, opacity 0.2s ease !important; /* 降低过渡时间 */
            cursor: pointer !important; text-decoration: none !important;
            transform: translateZ(0); will-change: transform;
        }
        /* 触控反馈替代 hover 悬浮 */
        .oz-card:active { transform: scale(0.96) !important; }

        .oz-content { position: absolute; inset: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; pointer-events: none; }
        .oz-img { width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 0.3s ease; }
        .oz-img.loaded { opacity: 1; }
        
        .oz-icon-box { font-size: 56px; opacity: var(--oz-icon-opacity); display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
        .oz-icon-box svg { width: 64px; height: 64px; fill: currentColor; }

        /*[优化] 极简性能版加载动画 */
        .oz-loader {
            position: absolute; inset: 0; background: rgba(128, 128, 128, 0.1);
            animation: oz-pulse 1.5s infinite ease-in-out alternate;
        }
        @keyframes oz-pulse { 0% { opacity: 0.3; } 100% { opacity: 1; } }

        .oz-meta {
            position: absolute; bottom: 0; left: 0; right: 0; padding: 40px 10px 10px;
            background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 60%, transparent 100%);
            color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.9);
            display: flex; flex-direction: column; justify-content: flex-end;
        }
        .oz-title { font-size: 13px; font-weight: 600; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; letter-spacing: 0.2px; }

        /* 移动端阅读器 */
        #oz-reader { position: fixed; inset: 0; z-index: 999999; background: #000; display: flex; flex-direction: column; font-family: system-ui, -apple-system, sans-serif; }
        .oz-r-view { flex: 1; overflow-y: auto; width: 100%; height: 100%; background: #000; scroll-behavior: smooth; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
        .oz-r-view::-webkit-scrollbar { display: none; }
        .oz-r-hud {
            position: fixed; top: 0; left: 0; right: 0; padding: 12px 16px; z-index: 100;
            background: linear-gradient(to bottom, rgba(0,0,0,0.9), transparent);
            display: flex; justify-content: space-between; align-items: center;
            transition: transform 0.3s ease; pointer-events: none; /* 让触摸穿透至下一层 */
        }
        .oz-r-hud.h { transform: translateY(-100%); }
        .oz-r-btn {
            pointer-events: auto; background: rgba(40,40,40,0.8); border: 1px solid rgba(255,255,255,0.2);
            color: #fff; padding: 8px 20px; border-radius: 20px; font-size: 14px; font-weight: 500; cursor: pointer;
        }

        .oz-r-page { width: 100%; margin: 0 auto; min-height: 200px; position: relative; display: block; }
        /* [优化] 移除 cursor: zoom-in */
        .oz-r-img { display: block; width: 100%; height: auto; opacity: 0; transition: opacity 0.3s; will-change: opacity; }
        .oz-r-img.v { opacity: 1; }
        .oz-r-vid { display: block; width: 100%; height: auto; outline: none; background: #000; margin-bottom: 20px; }
    `);

    // --- 全屏 API 封装 ---
    const FS = {
        enter: () => {
            const el = document.documentElement;
            try {
                if (el.requestFullscreen) el.requestFullscreen();
                else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
            } catch (e) {} // 忽略权限错误
        },
        exit: () => {
            try {
                if (document.fullscreenElement || document.webkitFullscreenElement) {
                    if (document.exitFullscreen) document.exitFullscreen();
                    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                }
            } catch (e) {}
        }
    };

    // --- 3. 核心算法库 (保持 V3.1.0 的高水准字典树解析) ---
    const U = {
        token: () => localStorage.getItem('token') || localStorage.getItem('alist_token') || '',
        esc: t => t ? t.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : t,
        req: (u, d) => new Promise((rv, rj) => {
            GM_xmlhttpRequest({
                method: "POST", url: u, headers: { "Content-Type": "application/json", "Authorization": U.token() }, data: JSON.stringify(d),
                onload: r => { try { const j = JSON.parse(r.responseText); j.code === 200 ? rv(j.data) : rj(j); } catch { rj(); } }, onerror: rj
            });
        }),
        flat: (nodes, currentPath = "") => {
            let files =[];
            if (!nodes) return files;
            nodes.forEach(x => {
                let fullPath = currentPath ? `${currentPath}/${x.name}` : x.name;
                if (x.is_dir) {
                    files = files.concat(U.flat(x.children, fullPath));
                } else {
                    let isImg = C.IMG_RX.test(x.name), isVid = C.VID_RX.test(x.name);
                    if (isImg || isVid) files.push({ n: x.name, p: fullPath, dir: currentPath, type: isImg ? 'img' : 'vid' });
                }
            });
            return files;
        },
        getCover: (files) => {
            const imgs = files.filter(f => f.type === 'img');
            if (!imgs.length) return null;
            const dirMap = {};
            for (let img of imgs) {
                if (!dirMap[img.dir]) dirMap[img.dir] = [];
                dirMap[img.dir].push(img);
            }
            const dirs = Object.keys(dirMap).sort((a, b) => {
                if (a === b) return 0;
                if (a === "") return -1;
                if (b === "") return 1;
                const pA = a.split('/'), pB = b.split('/');
                const len = Math.min(pA.length, pB.length);
                for (let i = 0; i < len; i++) {
                    if (pA[i] !== pB[i]) return pA[i].localeCompare(pB[i], undefined, { numeric: true });
                }
                return pA.length - pB.length;
            });
            for (let dir of dirs) {
                const dirImgs = dirMap[dir].sort((a, b) => a.n.localeCompare(b.n, undefined, { numeric: true }));
                let explicitCover = dirImgs.find(f => C.COVER_RX.test(f.n));
                if (explicitCover) return explicitCover;
                if (dirImgs.length > 0) return dirImgs[0];
            }
            return null;
        }
    };

    // --- 4. 列表渲染系统 ---
    class App {
        constructor() {
            this.q = 0;
            this.io = new IntersectionObserver(es => es.forEach(e => {
                if (e.isIntersecting) { this.io.unobserve(e.target); this.loadCover(e.target); }
            }), { rootMargin: '300px' }); // 缩减检测边界以节省性能

            this.hydrateTimer = null;
            this.mo = new MutationObserver(() => {
                clearTimeout(this.hydrateTimer);
                this.hydrateTimer = setTimeout(() => this.hydrate(), 50);
            });
            this.mo.observe(document.documentElement, { childList: true, subtree: true });
        }

        hydrate() {
            const items = document.querySelectorAll('.list-item:not([data-oz])');
            if (!items.length) return;

            items.forEach(el => {
                el.dataset.oz = "1";
                
                let rawName = "";
                const nameNode = el.querySelector('.name, .text-truncate, .hope-text, [title]');
                if (nameNode) rawName = nameNode.title || nameNode.textContent.trim();
                else rawName = el.textContent.trim().split('\n')[0];
                if (!rawName) rawName = "Unknown";

                const isZip = C.ZIP_RX.test(rawName);
                const isDir = !/\.[a-zA-Z0-9]{2,5}$/.test(rawName) && !isZip;
                
                const svgNode = el.querySelector('svg');
                let svgIcon = svgNode ? svgNode.outerHTML : (isDir ? '📁' : (C.VID_RX.test(rawName) ? '🎬' : (C.IMG_RX.test(rawName) ? '🖼️' : '📄')));

                let href = el.getAttribute('href') || el.dataset.path || "";
                if (!href && el.querySelector('a')) href = el.querySelector('a').getAttribute('href');
                href = decodeURIComponent(href || "");

                const ui = document.createElement('div');
                ui.className = 'oz-content';

                if (isZip) {
                    ui.innerHTML = `
                        <div class="oz-loader"></div><img class="oz-img" loading="lazy" data-path="${href}" alt="cover">
                        <div class="oz-meta"><div class="oz-title">${U.esc(rawName)}</div></div>
                    `;
                    // [优化] 绑定点击事件：触发全屏 API 并打开阅读器
                    el.addEventListener('click', e => { 
                        e.preventDefault(); e.stopPropagation(); 
                        FS.enter(); 
                        new Reader(rawName, href); 
                    }, true);
                    this.io.observe(ui.querySelector('.oz-img'));
                } else {
                    ui.innerHTML = `
                        <div class="oz-icon-box">${svgIcon}</div>
                        <div class="oz-meta"><div class="oz-title">${U.esc(rawName)}</div></div>
                    `;
                }

                Array.from(el.children).forEach(c => { c.style.display = 'none'; });
                el.classList.add('oz-card');
                el.appendChild(ui);
            });
        }

        async loadCover(img) {
            if (this.q >= C.CONCURRENCY) return setTimeout(() => this.loadCover(img), 200);
            this.q++;
            const path = img.dataset.path;
            try {
                const data = await U.req(C.API, { path: path, password: "" });
                const files = U.flat(data.content);
                const cover = U.getCover(files);

                if (cover) {
                    img.src = `${data.raw_url}?sign=${data.sign}&inner=${encodeURIComponent(cover.p)}`;
                    img.onload = () => { img.classList.add('loaded'); img.previousElementSibling?.remove(); };
                    img.onerror = () => { img.previousElementSibling?.remove(); img.parentElement.innerHTML += `<div class="oz-icon-box">⚠</div>`;};
                } else {
                    img.parentElement.innerHTML += `<div class="oz-icon-box">📦</div>`;
                    img.previousElementSibling?.remove(); img.remove();
                }
            } catch {
                img.parentElement.innerHTML += `<div class="oz-icon-box">🚫</div>`;
                img.previousElementSibling?.remove(); img.remove();
            } finally {
                this.q--;
            }
        }
    }

    // --- 5. 沉浸式富媒体阅读器 (全屏 & 纯触控) ---
    class Reader {
        constructor(t, p) {
            this.t = t; this.p = p; this.pgs =[];
            document.documentElement.classList.add('oz-lock'); document.body.classList.add('oz-lock');
            this.ui(); this.ld();
        }
        ui() {
            this.el = document.createElement('div'); this.el.id = 'oz-reader';
            this.el.innerHTML = `
                <div class="oz-r-hud" id="oz-hud">
                    <button class="oz-r-btn" id="oz-back">← 返回 (Back)</button>
                    <span style="color:#fff;font-size:13px;opacity:0.8;font-family:monospace;pointer-events:none" id="oz-cnt">Loading...</span>
                </div>
                <div class="oz-r-view" id="oz-view" tabindex="0"></div>
            `;
            document.body.appendChild(this.el);
            this.v = this.el.querySelector('#oz-view');
            this.hud = this.el.querySelector('#oz-hud');

            // 退出按钮
            this.el.querySelector('#oz-back').onclick = (e) => { e.stopPropagation(); this.die(); };

            // [优化] 初始显示2.5秒后自动隐藏HUD
            let hudTimer = setTimeout(() => this.hud.classList.add('h'), 2500);

            // [优化] 彻底移除滑动显示和鼠标移动显示逻辑。改为屏幕点击切换 HUD 显隐
            this.v.onclick = (e) => {
                // 如果点击的是原生的视频控件，不触发隐藏/显示
                if (e.target.closest('.oz-r-vid')) return;
                clearTimeout(hudTimer);
                this.hud.classList.toggle('h');
            };

            // 页码监控器
            let progTimer = null;
            this.v.onscroll = () => {
                clearTimeout(progTimer); progTimer = setTimeout(() => this.prog(), 150);
            };

            // 物理返回键/键盘Esc兼容
            window.addEventListener('keydown', this.kh = e => { if (e.key === 'Escape') this.die(); });
        }

        async ld() {
            try {
                const d = await U.req(C.API, { path: this.p, password: "" });
                this.base = d;
                const files = U.flat(d.content);
                const cover = U.getCover(files);

                let imgs = files.filter(f => f.type === 'img').sort((a, b) => a.p.localeCompare(b.p, undefined, { numeric: true }));
                let vids = files.filter(f => f.type === 'vid').sort((a, b) => a.p.localeCompare(b.p, undefined, { numeric: true }));

                if (cover) { imgs = imgs.filter(f => f.p !== cover.p); imgs.unshift(cover); }

                this.pgs = [...imgs, ...vids];
                if (!this.pgs.length) throw 0;

                this.el.querySelector('#oz-cnt').innerText = `1 / ${this.pgs.length}`;

                const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? this.l_item(e.target) : this.u_item(e.target)), { root: this.v, rootMargin: C.PRELOAD_Y });
                
                this.pgs.forEach((f, i) => {
                    const d = document.createElement('div'); d.className = 'oz-r-page'; 
                    d.style.height = f.type === 'vid' ? 'auto' : '600px'; 
                    d.f = f; d.idx = i; this.v.appendChild(d); io.observe(d);
                });
            } catch { alert('Read Error / No Media Found'); this.die(); }
        }

        l_item(div) {
            if (div.ok) return;
            const srcUrl = `${this.base.raw_url}?sign=${this.base.sign}&inner=${encodeURIComponent(div.f.p)}`;

            if (div.f.type === 'vid') {
                const v = document.createElement('video');
                v.className = 'oz-r-vid'; v.controls = true; v.preload = 'metadata'; v.src = srcUrl;
                v.setAttribute('playsinline', ''); // 兼容 iOS 内联播放
                div.innerHTML = ''; div.appendChild(v);
                div.style.height = 'auto'; div.ok = 1;
            } else {
                const i = new Image(); i.className = 'oz-r-img';
                // [优化] 添加 async 解码属性，提升移动端渲染性能
                i.decoding = 'async';
                i.onload = () => { div.ok = 1; div.style.height = 'auto'; div.style.aspectRatio = i.naturalWidth/i.naturalHeight; i.classList.add('v'); };
                i.onerror = () => { div.innerHTML = '<div style="color:red;padding:50px;text-align:center">Image Load Failed</div>'; div.style.height='auto'; div.ok=1; };
                // 移除了 V3.1.0 中的 i.onclick 放大逻辑，交给上层的 this.v.onclick 处理 HUD 切换
                i.src = srcUrl; div.innerHTML = ''; div.appendChild(i);
            }
        }

        u_item(div) {
            if (!div.ok || div.f.type === 'vid') return; 
            div.style.height = div.offsetHeight + 'px'; // 锁高抗抖动
            div.innerHTML = ''; div.ok = 0;
        }

        prog() {
            const m = this.v.scrollTop + window.innerHeight/3;
            for(let c of this.v.children) {
                if (c.offsetTop + c.offsetHeight > m) {
                    this.el.querySelector('#oz-cnt').innerText = `${c.idx+1} / ${this.pgs.length}`;
                    break;
                }
            }
        }

        die() {
            document.documentElement.classList.remove('oz-lock'); document.body.classList.remove('oz-lock');
            window.removeEventListener('keydown', this.kh);
            FS.exit(); // [优化] 关闭时退出全屏
            this.el.remove();
        }
    }

    const init = () => document.documentElement ? new App() : requestAnimationFrame(init);
    init();

})();
