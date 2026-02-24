// ==UserScript==
// @name         OpenList Cinema V3.0 (Deep Glass)
// @namespace    http://tampermonkey.net/
// @version      3.0.0
// @description  Alist/OpenList 极致美化：智能封面引擎 + 视频解析 + 全端自适应玻璃墙
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
        COVER_RX: /cover|_cover|title|front|folder|index|^0+1\.|^000\.|^001\.|^01\./i,
        API: '/api/fs/archive/meta'
    };

    // --- 2. 视觉系统注入 (执行于 document-start 防止闪烁) ---
    GM_addStyle(`
        /* 屏蔽原站列表 UI，防止闪烁 (FOUC) */
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
            --oz-icon-opacity: 0.5;
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --oz-glass-bg: rgba(20, 20, 20, 0.35);
                --oz-glass-border: 1px solid rgba(255, 255, 255, 0.05);
                --oz-glass-shd: 0 12px 40px -8px rgba(0, 0, 0, 0.5);
                --oz-glass-hover: rgba(50, 50, 50, 0.6);
                --oz-icon-opacity: 0.8;
            }
        }
        body[class*="dark"] {
            --oz-glass-bg: rgba(20, 20, 20, 0.35); --oz-glass-border: 1px solid rgba(255, 255, 255, 0.05);
            --oz-glass-shd: 0 12px 40px -8px rgba(0, 0, 0, 0.5); --oz-glass-hover: rgba(50, 50, 50, 0.6); --oz-icon-opacity: 0.8;
        }

        html.oz-lock, body.oz-lock { overflow: hidden !important; height: 100vh !important; }

        /* 网格布局 */
        .list, .hope-stack.list, .obj-box>.list {
            display: grid !important;
            grid-template-columns: repeat(auto-fill, minmax(var(--c-w), 1fr)) !important;
            gap: var(--c-g) !important; padding: 40px 60px !important;
            width: 100% !important; box-sizing: border-box !important; background: transparent !important;
        }

        /* 响应式调整 */
        @media (max-width: 1024px) {
            .list, .hope-stack.list, .obj-box>.list { --c-w: 140px; padding: 24px !important; gap: 16px !important; }
        }
        @media (max-width: 768px) {
            .list, .hope-stack.list, .obj-box>.list {
                grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)) !important;
                padding: 12px !important; gap: 12px !important;
            }
        }

        /* 卡片样式 */
        .list-item, a.list-item, div[class*="list-item"] {
            display: flex !important; flex-direction: column !important;
            aspect-ratio: 2/3; height: auto !important;
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
        .list-item:hover { transform: translateY(-8px) scale(1.03) !important; background: var(--oz-glass-hover) !important; z-index: 10; }
        .list-item svg, .list-item .name, .list-item .size, .list-item .date, .list-item .checkbox { display: none !important; }

        .oz-content { width: 100%; height: 100%; position: relative; display: flex; align-items: center; justify-content: center; }
        .oz-img { width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 0.6s ease; }
        .oz-img.loaded { opacity: 1; }
        .oz-icon-box { font-size: 48px; opacity: var(--oz-icon-opacity); transition: transform 0.3s ease; }
        .list-item:hover .oz-icon-box { transform: scale(1.15); }

        /* 高级骨架屏加载动画 */
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

        /* Meta 底部信息 */
        .oz-meta {
            position: absolute; bottom: 0; left: 0; right: 0; padding: 40px 12px 12px;
            background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%);
            color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,0.8);
            display: flex; flex-direction: column; justify-content: flex-end; pointer-events: none;
        }
        .oz-title { font-size: 13px; font-weight: 600; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; letter-spacing: 0.3px; }

        /* 阅读器系统 */
        #oz-reader { position: fixed; inset: 0; z-index: 999999; background: #000; display: flex; flex-direction: column; font-family: system-ui, sans-serif; }
        .oz-r-view { flex: 1; overflow-y: auto; width: 100%; height: 100%; background: #050505; scroll-behavior: auto; scrollbar-width: none; }
        .oz-r-view::-webkit-scrollbar { display: none; }
        .oz-r-hud {
            position: fixed; top: 0; left: 0; right: 0; padding: 16px 24px; z-index: 100;
            background: linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0.4) 70%, transparent);
            display: flex; justify-content: space-between; align-items: center;
            transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1); pointer-events: none;
        }
        .oz-r-hud.h { transform: translateY(-100%); }
        .oz-r-btn {
            pointer-events: auto; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15);
            backdrop-filter: blur(12px); color: #fff; padding: 8px 16px; border-radius: 20px;
            font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s;
        }
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
                method: "POST", url: u,
                headers: { "Content-Type": "application/json", "Authorization": U.token() },
                data: JSON.stringify(d),
                onload: r => { try { const j = JSON.parse(r.responseText); j.code === 200 ? rv(j.data) : rj(j); } catch { rj(); } },
                onerror: rj
            });
        }),
        // 深度递归扁平化，记录层级与目录
        flat: (nodes, currentPath = "", depth = 0) => {
            let files = [];
            if (!nodes) return files;
            nodes.forEach(x => {
                let fullPath = currentPath ? `${currentPath}/${x.name}` : x.name;
                if (x.is_dir) {
                    files = files.concat(U.flat(x.children, fullPath, depth + 1));
                } else {
                    let isImg = C.IMG_RX.test(x.name);
                    let isVid = C.VID_RX.test(x.name);
                    if (isImg || isVid) {
                        files.push({
                            n: x.name, p: fullPath, d: depth, dir: currentPath,
                            type: isImg ? 'img' : 'vid'
                        });
                    }
                }
            });
            return files;
        },
        // 智能寻址海报
        getCover: (files) => {
            const imgs = files.filter(f => f.type === 'img');
            if (!imgs.length) return null;

            // 1. 根目录寻找显式封面
            const rootImgs = imgs.filter(f => f.d === 0).sort((a, b) => a.n.localeCompare(b.n, undefined, { numeric: true }));
            let cover = rootImgs.find(f => C.COVER_RX.test(f.n));
            if (cover) return cover;

            // 2. 根目录第一张图
            if (rootImgs.length > 0) return rootImgs[0];

            // 3. 遍历子文件夹 (按文件夹名字典序)
            const dirs = [...new Set(imgs.map(f => f.dir))].sort();
            for (let dir of dirs) {
                const dirImgs = imgs.filter(f => f.dir === dir).sort((a, b) => a.n.localeCompare(b.n, undefined, { numeric: true }));
                let dirCover = dirImgs.find(f => C.COVER_RX.test(f.n));
                if (dirCover) return dirCover;
                if (dirImgs.length > 0) return dirImgs[0];
            }
            return imgs[0]; // 终极回退
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
                const nEl = el.querySelector('.name') || el.querySelector('.text-truncate');
                const rawName = nEl ? nEl.textContent.trim() : "File";
                const isZip = C.ZIP_RX.test(rawName);
                const svgIcon = el.querySelector('svg')?.outerHTML || '📄';

                let href = decodeURIComponent(el.getAttribute('href') || el.dataset.path || "");
                if (!href && el.querySelector('a')) href = decodeURIComponent(el.querySelector('a').getAttribute('href'));

                let innerHTML = isZip ?
                    `<div class="oz-loader"></div><img class="oz-img" loading="lazy" data-path="${href}" alt="cover">` :
                    `<div class="oz-icon-box">${svgIcon}</div>`;

                el.innerHTML = `
                    <div class="oz-content">
                        ${innerHTML}
                        <div class="oz-meta"><div class="oz-title">${U.esc(rawName)}</div></div>
                    </div>
                `;

                if (isZip) {
                    el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); new Reader(rawName, href); }, true);
                    this.io.observe(el.querySelector('.oz-img'));
                }
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
                    img.parentElement.innerHTML = `<div class="oz-icon-box">📦</div>`;
                }
            } catch {
                img.parentElement.innerHTML = `<div class="oz-icon-box">🚫</div>`;
            } finally {
                this.q--;
            }
        }
    }

    // --- 5. 沉浸式阅读器与视频支持 ---
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

                // 图片与视频分离，分别做字典序排序 (包含路径的自然排序，解决多卷乱序)
                let imgs = files.filter(f => f.type === 'img').sort((a, b) => a.p.localeCompare(b.p, undefined, { numeric: true }));
                let vids = files.filter(f => f.type === 'vid').sort((a, b) => a.p.localeCompare(b.p, undefined, { numeric: true }));

                // 确保海报图绝对在第一张
                if (cover) {
                    imgs = imgs.filter(f => f.p !== cover.p);
                    imgs.unshift(cover);
                }

                this.pgs = [...imgs, ...vids]; // 拼接：图在上，视频在底部
                if (!this.pgs.length) throw 0;

                this.el.querySelector('#oz-cnt').innerText = `1 / ${this.pgs.length}`;

                const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? this.l_item(e.target) : this.u_item(e.target)), { root: this.v, rootMargin: C.PRELOAD_Y });

                this.pgs.forEach((f, i) => {
                    const d = document.createElement('div'); d.className = 'oz-r-page';
                    d.style.height = f.type === 'vid' ? 'auto' : '800px'; // 视频不预设固定占位高
                    d.f = f; d.idx = i; this.v.appendChild(d); io.observe(d);
                });
            } catch { alert('Read Error / No Media Found'); this.die(); }
        }

        l_item(div) {
            if (div.ok) return;
            const srcUrl = `${this.base.raw_url}?sign=${this.base.sign}&inner=${encodeURIComponent(div.f.p)}`;

            if (div.f.type === 'vid') {
                const v = document.createElement('video');
                v.className = 'oz-r-vid'; v.controls = true; v.preload = 'metadata';
                v.src = srcUrl;
                div.innerHTML = ''; div.appendChild(v);
                div.style.height = 'auto'; div.ok = 1;
            } else {
                const i = new Image();
                i.className = 'oz-r-img';
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
                i.src = srcUrl;
                div.innerHTML = ''; div.appendChild(i);
            }
        }

        u_item(div) {
            if (!div.ok || div.f.type === 'vid') return; // 重点：不卸载视频，防止缓冲和播放进度丢失
            div.style.height = div.offsetHeight + 'px'; // 严格锁定高度，抗抖动
            div.innerHTML = '';
            div.ok = 0;
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
            this.el.remove();
        }
    }

    // 初始化入口 (由于 run-at document-start，需确保执行时机)
    const init = () => document.documentElement ? new App() : requestAnimationFrame(init);
    init();

})();
