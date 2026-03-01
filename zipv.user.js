// ==UserScript==
// @name         OpenList Cinema V3.1 (Deep Glass)
// @namespace    http://tampermonkey.net/
// @version      3.1.0
// @description  Alist/OpenList 极致美化：智能DFS封面寻址 + 无损路由渲染 + 全端玻璃墙
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

    // --- 1. 核心配置与正则 ---
    const C = {
        CONCURRENCY: 6,
        PRELOAD_Y: "0px 0px 1500px 0px", // 加大懒加载范围，防高速滚动白屏
        ZIP_RX: /\.(zip|cbz)$/i,
        IMG_RX: /\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i,
        VID_RX: /\.(mp4|webm|mkv|mov|avi)$/i,
        // 修正：彻底移除数字匹配，严格依靠语义寻找显式海报
        COVER_RX: /(cover|title|poster|front|folder|index)/i,
        API: '/api/fs/archive/meta'
    };

    // --- 2. 视觉系统注入 (执行于 document-start 防止 FOUC 闪烁) ---
    GM_addStyle(`
        .header-row, .hope-stack.title, .list-header { display: none !important; }
        .hope-c-pjLVOS { opacity: 0; animation: oz-fade-in 0.6s ease forwards; }
        @keyframes oz-fade-in { to { opacity: 1; } }

        :root {
            --c-w: 180px;
            --c-g: 24px;
            --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
            --oz-glass-bg: rgba(255, 255, 255, 0.45);
            --oz-glass-border: 1px solid rgba(255, 255, 255, 0.5);
            --oz-glass-shd: 0 10px 30px -10px rgba(0, 50, 100, 0.08);
            --oz-glass-hover: rgba(255, 255, 255, 0.75);
            --oz-icon-opacity: 0.6;
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --oz-glass-bg: rgba(20, 20, 20, 0.35);
                --oz-glass-border: 1px solid rgba(255, 255, 255, 0.05);
                --oz-glass-shd: 0 12px 40px -8px rgba(0, 0, 0, 0.5);
                --oz-glass-hover: rgba(50, 50, 50, 0.6);
                --oz-icon-opacity: 0.9;
            }
        }
        body[class*="dark"] {
            --oz-glass-bg: rgba(20, 20, 20, 0.35); --oz-glass-border: 1px solid rgba(255, 255, 255, 0.05);
            --oz-glass-shd: 0 12px 40px -8px rgba(0, 0, 0, 0.5); --oz-glass-hover: rgba(50, 50, 50, 0.6); --oz-icon-opacity: 0.9;
        }

        html.oz-lock, body.oz-lock { overflow: hidden !important; height: 100vh !important; }

        .list, .hope-stack.list, .obj-box>.list {
            display: grid !important;
            grid-template-columns: repeat(auto-fill, minmax(var(--c-w), 1fr)) !important;
            gap: var(--c-g) !important; padding: 40px 60px !important;
            width: 100% !important; box-sizing: border-box !important; background: transparent !important;
        }

        @media (max-width: 1024px) {
            .list, .hope-stack.list, .obj-box>.list { --c-w: 140px; padding: 24px !important; gap: 16px !important; }
        }
        @media (max-width: 768px) {
            .list, .hope-stack.list, .obj-box>.list {
                grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)) !important;
                padding: 12px !important; gap: 12px !important;
            }
        }

        /* 强制覆盖所有子节点布局为卡片 */
        .oz-card {
            display: flex !important; flex-direction: column !important;
            aspect-ratio: 2/3 !important; height: auto !important;
            background: var(--oz-glass-bg) !important;
            backdrop-filter: blur(24px) saturate(150%); -webkit-backdrop-filter: blur(24px) saturate(150%);
            border: var(--oz-glass-border) !important; border-radius: 14px !important;
            box-shadow: var(--oz-glass-shd) !important;
            padding: 0 !important; margin: 0 !important;
            overflow: hidden !important; position: relative !important;
            transition: transform 0.4s var(--ease-spring), background 0.3s ease, box-shadow 0.3s ease !important;
            cursor: pointer !important; text-decoration: none !important;
            transform: translateZ(0); will-change: transform;
        }
        .oz-card:hover { transform: translateY(-8px) scale(1.03) !important; background: var(--oz-glass-hover) !important; z-index: 10; }

        .oz-content { position: absolute; inset: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; pointer-events: none; }
        .oz-img { width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 0.6s ease; }
        .oz-img.loaded { opacity: 1; }

        /* 针对普通文件夹/文件的图标优化 */
        .oz-icon-box {
            font-size: 64px; opacity: var(--oz-icon-opacity); transition: transform 0.3s ease;
            display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;
        }
        .oz-icon-box svg { width: 72px; height: 72px; fill: currentColor; }
        .oz-card:hover .oz-icon-box { transform: scale(1.15); }

        .oz-loader {
            position: absolute; inset: 0;
            background: linear-gradient(110deg, transparent 20%, rgba(255,255,255,0.1) 40%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 60%, transparent 80%);
            background-size: 400% 100%; backdrop-filter: blur(8px);
            animation: oz-skeleton 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        body[class*="dark"] .oz-loader, @media (prefers-color-scheme: dark) {
            .oz-loader { background: linear-gradient(110deg, transparent 20%, rgba(255,255,255,0.03) 40%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 60%, transparent 80%); }
        }
        @keyframes oz-skeleton { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

        .oz-meta {
            position: absolute; bottom: 0; left: 0; right: 0; padding: 40px 12px 14px;
            background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%);
            color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,0.9);
            display: flex; flex-direction: column; justify-content: flex-end;
        }
        .oz-title { font-size: 14px; font-weight: 600; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; letter-spacing: 0.3px; }

        /* 阅读器 */
        #oz-reader { position: fixed; inset: 0; z-index: 999999; background: #000; display: flex; flex-direction: column; font-family: system-ui, sans-serif; }
        .oz-r-view { flex: 1; overflow-y: auto; width: 100%; height: 100%; background: #050505; scroll-behavior: auto; scrollbar-width: none; }
        .oz-r-view::-webkit-scrollbar { display: none; }
        .oz-r-hud {
            position: fixed; top: 0; left: 0; right: 0; padding: 16px 24px; z-index: 100;
            background: linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0.4) 70%, transparent);
            display: flex; justify-content: space-between; align-items: center;
            transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .oz-r-hud.h { transform: translateY(-100%); }
        .oz-r-btn { pointer-events: auto; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); backdrop-filter: blur(12px); color: #fff; padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
        .oz-r-btn:hover { background: rgba(255,255,255,0.25); transform: scale(1.05); }

        .oz-r-page { width: 100%; margin: 0 auto; min-height: 300px; position: relative; display: block; }
        .oz-r-img { display: block; width: 100%; height: auto; opacity: 0; transition: opacity 0.4s; cursor: zoom-in; will-change: opacity; }
        .oz-r-img.v { opacity: 1; }
        .oz-r-vid { display: block; width: 100%; height: auto; outline: none; background: #000; margin-bottom: 20px; }
        #oz-zoom { position: fixed; inset: 0; z-index: 1000000; background: rgba(0,0,0,0.95); display: none; overflow: auto; cursor: zoom-out; }
        #oz-zoom img { position: absolute; top: 0; left: 0; max-width: none; }
    `);

    // --- 3. 核心算法库 ---
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
            let files = [];
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
        // [算法重构] 基于字典树的严格文件夹遍历，完美贴合 Example 逻辑
        getCover: (files) => {
            const imgs = files.filter(f => f.type === 'img');
            if (!imgs.length) return null;

            // 分组归入文件夹
            const dirMap = {};
            for (let img of imgs) {
                if (!dirMap[img.dir]) dirMap[img.dir] = [];
                dirMap[img.dir].push(img);
            }

            // 对所有提取出的文件夹路径进行深度遍历排序 (相当于树前序遍历)
            const dirs = Object.keys(dirMap).sort((a, b) => {
                if (a === b) return 0;
                if (a === "") return -1; // 根目录最高优先级
                if (b === "") return 1;
                const pA = a.split('/'), pB = b.split('/');
                const len = Math.min(pA.length, pB.length);
                for (let i = 0; i < len; i++) {
                    if (pA[i] !== pB[i]) return pA[i].localeCompare(pB[i], undefined, { numeric: true });
                }
                return pA.length - pB.length;
            });

            // 严格按层级和字母序逐个文件夹扫描
            for (let dir of dirs) {
                // 当前目录图片自然排序
                const dirImgs = dirMap[dir].sort((a, b) => a.n.localeCompare(b.n, undefined, { numeric: true }));

                // 1. 尝试寻找当前目录的显式封面
                let explicitCover = dirImgs.find(f => C.COVER_RX.test(f.n));
                if (explicitCover) return explicitCover;

                // 2. 如果当前目录【包含图片】，则必须定出海报（首张图片），立即中断搜索子文件夹
                if (dirImgs.length > 0) return dirImgs[0];
            }
            return null; // 回退安全保护
        }
    };

    // --- 4. 列表渲染系统 ---
    class App {
        constructor() {
            this.q = 0;
            this.io = new IntersectionObserver(es => es.forEach(e => {
                if (e.isIntersecting) { this.io.unobserve(e.target); this.loadCover(e.target); }
            }), { rootMargin: '400px' });

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

                // 【修复核心】：无损提取文字与原生的路由链接，绝对不覆盖 innerHTML 破坏 <a> 标签
                let rawName = "";
                const nameNode = el.querySelector('.name, .text-truncate, .hope-text, [title]');
                if (nameNode) rawName = nameNode.title || nameNode.textContent.trim();
                else rawName = el.textContent.trim().split('\n')[0];
                if (!rawName) rawName = "Unknown";

                const isZip = C.ZIP_RX.test(rawName);
                const isDir = !/\.[a-zA-Z0-9]{2,5}$/.test(rawName) && !isZip; // 简单启发式判断是否为目录

                // 智能提取图标，如果没有原生 SVG，回退优质 Emoji
                const svgNode = el.querySelector('svg');
                let svgIcon = svgNode ? svgNode.outerHTML : (isDir ? '📁' : (C.VID_RX.test(rawName) ? '🎬' : (C.IMG_RX.test(rawName) ? '🖼️' : '📄')));

                let href = el.getAttribute('href') || el.dataset.path || "";
                if (!href && el.querySelector('a')) href = el.querySelector('a').getAttribute('href');
                href = decodeURIComponent(href || "");

                // 创建绝对定位叠加层 UI (完全脱离文档流遮挡原始内容)
                const ui = document.createElement('div');
                ui.className = 'oz-content';

                if (isZip) {
                    ui.innerHTML = `
                        <div class="oz-loader"></div><img class="oz-img" loading="lazy" data-path="${href}" alt="cover">
                        <div class="oz-meta"><div class="oz-title">${U.esc(rawName)}</div></div>
                    `;
                    // ZIP 接管点击事件开启阅读器，阻止原生路由
                    el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); new Reader(rawName, href); }, true);
                    this.io.observe(ui.querySelector('.oz-img'));
                } else {
                    ui.innerHTML = `
                        <div class="oz-icon-box">${svgIcon}</div>
                        <div class="oz-meta"><div class="oz-title">${U.esc(rawName)}</div></div>
                    `;
                }

                // 【巧妙操作】：隐藏全部原始子节点，但不摧毁 DOM 树，保留 Alist 原生前端路由点击能力
                Array.from(el.children).forEach(c => { c.style.display = 'none'; });

                // 赋予顶级弹性玻璃卡片 CSS
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

    // --- 5. 沉浸式富媒体阅读器 ---
    class Reader {
        constructor(t, p) {
            this.t = t; this.p = p; this.pgs = [];
            document.documentElement.classList.add('oz-lock'); document.body.classList.add('oz-lock');
            this.ui(); this.ld();
        }
        ui() {
            this.el = document.createElement('div'); this.el.id = 'oz-reader';
            this.el.innerHTML = `
                <div class="oz-r-hud" id="oz-hud">
                    <button class="oz-r-btn" id="oz-back">← Back</button>
                    <span style="color:#fff;font-size:13px;opacity:0.8;font-family:monospace" id="oz-cnt">Loading...</span>
                </div>
                <div class="oz-r-view" id="oz-view" tabindex="0"></div>
                <div id="oz-zoom"><img id="oz-z-img"></div>
            `;
            document.body.appendChild(this.el);
            this.v = this.el.querySelector('#oz-view');
            this.hud = this.el.querySelector('#oz-hud');
            this.zm = this.el.querySelector('#oz-zoom');
            this.zi = this.el.querySelector('#oz-z-img');

            this.el.querySelector('#oz-back').onclick = () => this.die();
            this.zm.onclick = () => { this.zm.style.display = 'none'; this.zi.src = ''; };

            let tm; const rst = () => { this.hud.classList.remove('h'); clearTimeout(tm); tm = setTimeout(() => this.hud.classList.add('h'), 2000); };
            this.el.onmousemove = e => { if (e.clientY < 120) rst(); };

            let progTimer = null;
            this.v.onscroll = () => {
                if (!this.hud.classList.contains('h')) this.hud.classList.add('h');
                clearTimeout(progTimer); progTimer = setTimeout(() => this.prog(), 100);
            };

            window.addEventListener('keydown', this.kh = e => {
                if (e.key === 'Escape') this.zm.style.display === 'block' ? this.zm.click() : this.die();
                else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.v.scrollBy({top: window.innerHeight * 0.8, behavior: 'smooth'});
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') this.v.scrollBy({top: -window.innerHeight * 0.8, behavior: 'smooth'});
            });
            this.v.focus();
        }

        async ld() {
            try {
                const d = await U.req(C.API, { path: this.p, password: "" });
                this.base = d;
                const files = U.flat(d.content);
                const cover = U.getCover(files);

                // 图片依照带目录的完整路径排自然序（完美解决A/B卷乱序）
                let imgs = files.filter(f => f.type === 'img').sort((a, b) => a.p.localeCompare(b.p, undefined, { numeric: true }));
                let vids = files.filter(f => f.type === 'vid').sort((a, b) => a.p.localeCompare(b.p, undefined, { numeric: true }));

                if (cover) {
                    imgs = imgs.filter(f => f.p !== cover.p);
                    imgs.unshift(cover);
                }

                this.pgs = [...imgs, ...vids];
                if (!this.pgs.length) throw 0;

                this.el.querySelector('#oz-cnt').innerText = `1 / ${this.pgs.length}`;

                const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? this.l_item(e.target) : this.u_item(e.target)), { root: this.v, rootMargin: C.PRELOAD_Y });

                this.pgs.forEach((f, i) => {
                    const d = document.createElement('div'); d.className = 'oz-r-page';
                    d.style.height = f.type === 'vid' ? 'auto' : '800px';
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
                div.innerHTML = ''; div.appendChild(v);
                div.style.height = 'auto'; div.ok = 1;
            } else {
                const i = new Image(); i.className = 'oz-r-img';
                i.onload = () => { div.ok = 1; div.style.height = 'auto'; div.style.aspectRatio = i.naturalWidth/i.naturalHeight; i.classList.add('v'); };
                i.onerror = () => { div.innerHTML = '<div style="color:red;padding:50px;text-align:center">Image Load Failed</div>'; div.style.height='auto'; div.ok=1; };
                i.onclick = e => {
                    if (i.naturalWidth > window.innerWidth) {
                        this.zi.src = i.src; this.zm.style.display = 'block';
                        const rect = i.getBoundingClientRect();
                        const rx = (e.clientX - rect.left) / rect.width, ry = (e.clientY - rect.top) / rect.height;
                        const tx = (i.naturalWidth * rx) - window.innerWidth/2, ty = (i.naturalHeight * ry) - window.innerHeight/2;
                        if(this.zi.complete) this.zm.scrollTo(tx, ty); else this.zi.onload = () => this.zm.scrollTo(tx, ty);
                    }
                };
                i.src = srcUrl; div.innerHTML = ''; div.appendChild(i);
            }
        }

        u_item(div) {
            if (!div.ok || div.f.type === 'vid') return; // 视频播放器不卸载，防丢失缓冲
            div.style.height = div.offsetHeight + 'px'; // 精准锁定高度抗跳动
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
            window.removeEventListener('keydown', this.kh); this.el.remove();
        }
    }

    const init = () => document.documentElement ? new App() : requestAnimationFrame(init);
    init();

})();
