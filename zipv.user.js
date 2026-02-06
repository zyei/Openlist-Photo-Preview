// ==UserScript==
// @name         OpenList Cinema V2.2 (Glass Unified)
// @namespace    http://tampermonkey.net/
// @version      2.2.0
// @description  Alist/OpenList 极致美化：全玻璃拟态海报墙 + 沉浸式阅读器 (统一视觉/无损缩放)
// @author       Advanced AI
// @match        *://*/*
// @include      *
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // --- 0. 全局开关 (悬浮按钮) ---
    const STATE_KEY = 'oz_enabled';
    const isEnabled = GM_getValue(STATE_KEY, true);

    const createToggle = () => {
        const btn = document.createElement('div');
        // 使用更优雅的圆角矩形设计，配合磨砂质感
        Object.assign(btn.style, {
            position: 'fixed', bottom: '30px', right: '30px', zIndex: '9999999',
            width: '44px', height: '44px', borderRadius: '14px',
            background: isEnabled ? 'rgba(0, 120, 212, 0.8)' : 'rgba(128, 128, 128, 0.5)',
            backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)', cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.2, 0, 0, 1)'
        });
        btn.innerHTML = isEnabled ?
            `<svg width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>` : // Close icon
            `<svg width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M2 12C2 6.48 6.48 2 12 2s10 4.48 10 10-4.48 10-10 10S2 17.52 2 12zm10 6c3.31 0 6-2.69 6-6s-2.69-6-6-6-6 2.69-6 6 2.69 6 6 6z"/></svg>`; // Eye icon

        btn.onclick = () => { GM_setValue(STATE_KEY, !isEnabled); location.reload(); };
        btn.onmouseenter = () => { btn.style.transform = 'scale(1.1)'; btn.style.boxShadow = '0 12px 40px rgba(0,120,212,0.4)'; };
        btn.onmouseleave = () => { btn.style.transform = 'scale(1)'; btn.style.boxShadow = '0 8px 32px rgba(0,0,0,0.2)'; };
        document.body.appendChild(btn);
    };

    if (!isEnabled) { window.addEventListener('load', createToggle); return; }

    // --- 1. 配置 ---
    const C = {
        CONCURRENCY: 6,
        PRELOAD_Y: "150% 0px",
        ZIP_RX: /\.(zip|cbz)$/i,
        IMG_RX: /\.(jpg|jpeg|png|webp|gif|bmp)$/i,
        COVER_RX: /cover|front|folder|index|^0+1\.|^000\.|^001\.|^01\./i,
        API: '/api/fs/archive/meta'
    };

    // --- 2. 视觉系统 (Glassmorphism & Windows 11 Fluent) ---
    GM_addStyle(`
        :root {
            /* 基础参数 */
            --c-w: 180px;
            --c-g: 24px;
            --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

            /* 玻璃拟态默认变量 (Light Mode) */
            --oz-glass-bg: rgba(255, 255, 255, 0.4);
            --oz-glass-border: 1px solid rgba(255, 255, 255, 0.4);
            --oz-glass-shd: 0 4px 24px -1px rgba(0, 0, 0, 0.05);
            --oz-glass-hover: rgba(255, 255, 255, 0.65);
            --oz-icon-opacity: 0.6;
        }

        /* 自动适配暗色模式 (Dark Mode) - 增强兼容性 */
        @media (prefers-color-scheme: dark) {
            :root {
                --oz-glass-bg: rgba(0, 0, 0, 0.3);
                --oz-glass-border: 1px solid rgba(255, 255, 255, 0.08);
                --oz-glass-shd: 0 8px 32px -4px rgba(0, 0, 0, 0.3);
                --oz-glass-hover: rgba(60, 60, 60, 0.5);
                --oz-icon-opacity: 0.8;
            }
        }
        /* 强制兼容 OpenList 自身的暗色类名 */
        body[class*="dark"] {
            --oz-glass-bg: rgba(0, 0, 0, 0.3);
            --oz-glass-border: 1px solid rgba(255, 255, 255, 0.08);
            --oz-glass-shd: 0 8px 32px -4px rgba(0, 0, 0, 0.3);
            --oz-glass-hover: rgba(60, 60, 60, 0.5);
            --oz-icon-opacity: 0.8;
        }

        /* 锁定 & 重置 */
        html.oz-lock, body.oz-lock { overflow: hidden !important; height: 100vh !important; }
        .header-row, .hope-stack.title, .list-header { display: none !important; }

        /* 布局劫持 - 强制统一 Grid */
        .list, .hope-stack.list, .obj-box>.list {
            display: grid !important;
            grid-template-columns: repeat(auto-fill, minmax(var(--c-w), 1fr)) !important;
            gap: var(--c-g) !important;
            padding: 40px 60px !important;
            width: 100% !important; box-sizing: border-box !important;
            background: transparent !important; /* 移除背景，透出原生壁纸 */
        }

        /* 统一卡片样式 (All Items) */
        .list-item, a.list-item, div[class*="list-item"] {
            display: flex !important; flex-direction: column !important;
            aspect-ratio: 2/3; height: auto !important;

            /* Glassmorphism Core */
            background: var(--oz-glass-bg) !important;
            backdrop-filter: blur(20px) saturate(120%); -webkit-backdrop-filter: blur(20px) saturate(120%);
            border: var(--oz-glass-border) !important;
            border-radius: 12px !important;
            box-shadow: var(--oz-glass-shd) !important;

            padding: 0 !important; margin: 0 !important;
            overflow: hidden !important; position: relative !important;
            transition: transform 0.4s var(--ease-spring), background 0.3s ease, box-shadow 0.3s ease !important;
            cursor: pointer !important; text-decoration: none !important;
            transform: translateZ(0); /* GPU accel */
        }

        .list-item:hover {
            transform: translateY(-6px) scale(1.02) !important;
            background: var(--oz-glass-hover) !important;
            box-shadow: 0 16px 48px rgba(0,0,0,0.15) !important;
            z-index: 10;
        }

        /* 隐藏原生杂项 */
        .list-item svg, .list-item .name, .list-item .size, .list-item .date, .list-item .checkbox { display: none !important; }

        /* 内容容器 */
        .oz-content { width: 100%; height: 100%; position: relative; display: flex; align-items: center; justify-content: center; }

        /* 1. ZIP 海报图片 */
        .oz-img { width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 0.5s ease; }
        .oz-img.loaded { opacity: 1; }

        /* 2. 普通文件图标展示 */
        .oz-icon-box {
            font-size: 64px; opacity: var(--oz-icon-opacity);
            filter: drop-shadow(0 4px 12px rgba(0,0,0,0.1));
            transition: transform 0.3s ease;
        }
        .list-item:hover .oz-icon-box { transform: scale(1.1); filter: drop-shadow(0 8px 16px rgba(0,0,0,0.2)); }

        /* 3. 统一 Loading 动画 (呼吸光晕) */
        .oz-loader {
            position: absolute; inset: 0;
            background: linear-gradient(135deg, rgba(255,255,255,0) 40%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0) 60%);
            background-size: 200% 200%;
            animation: oz-breath 3s infinite ease-in-out;
        }
        @keyframes oz-breath { 0% { opacity: 0.5; background-position: 100% 0; } 50% { opacity: 1; } 100% { opacity: 0.5; background-position: -100% 0; } }

        /* 4. 统一标题遮罩 (无论文件类型，统一美观) */
        .oz-meta {
            position: absolute; bottom: 0; left: 0; right: 0;
            padding: 50px 16px 14px;
            background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 50%, transparent 100%);
            color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.6);
            display: flex; flex-direction: column; justify-content: flex-end;
            pointer-events: none;
        }
        .oz-title {
            font-size: 13px; font-weight: 600; line-height: 1.4;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }

        /* --- 阅读器 (Reader) --- */
        #oz-reader {
            position: fixed; inset: 0; z-index: 999999;
            background: #000; display: flex; flex-direction: column;
            font-family: "Segoe UI", sans-serif;
        }
        .oz-r-view {
            flex: 1; overflow-y: auto; width: 100%; height: 100%;
            background: #0a0a0a; scroll-behavior: auto; scrollbar-width: none;
        }
        .oz-r-view::-webkit-scrollbar { display: none; }

        /* 极简 HUD */
        .oz-r-hud {
            position: fixed; top: 0; left: 0; right: 0; padding: 16px 24px;
            background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
            display: flex; justify-content: space-between; align-items: center;
            transition: transform 0.3s ease; pointer-events: none; z-index: 100;
        }
        .oz-r-hud.h { transform: translateY(-100%); }
        .oz-r-btn {
            pointer-events: auto; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.1);
            backdrop-filter: blur(10px); color: #fff; padding: 6px 14px; border-radius: 20px;
            font-size: 12px; cursor: pointer; transition: background 0.2s;
        }
        .oz-r-btn:hover { background: rgba(255,255,255,0.3); }

        /* 图片页 */
        .oz-r-page { width: 100%; margin: 0 auto; min-height: 200px; position: relative; display: block; }
        .oz-r-img { display: block; width: 100%; height: auto; opacity: 0; transition: opacity 0.3s; cursor: zoom-in; }
        .oz-r-img.v { opacity: 1; }

        /* 无损缩放层 */
        #oz-zoom {
            position: fixed; inset: 0; z-index: 1000000; background: rgba(0,0,0,0.95);
            display: none; overflow: auto; cursor: zoom-out;
        }
        #oz-zoom img { position: absolute; top: 0; left: 0; max-width: none; }
    `);

    // --- 3. 核心逻辑 ---
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
        flat: (n, p = "") => {
            let r = []; if (!n) return r;
            n.forEach(x => {
                let f = p + "/" + x.name;
                if (x.is_dir) r = r.concat(U.flat(x.children, f));
                else if (C.IMG_RX.test(x.name)) r.push({ n: x.name, p: f });
            });
            return r;
        }
    };

    class App {
        constructor() {
            this.q = 0;
            this.io = new IntersectionObserver(es => es.forEach(e => {
                if (e.isIntersecting) { this.io.unobserve(e.target); this.loadCover(e.target); }
            }), { rootMargin: '300px' });

            new MutationObserver(() => this.hydrate()).observe(document.body, { childList: true, subtree: true });
            createToggle();
            this.hydrate();
        }

        hydrate() {
            const items = document.querySelectorAll('.list-item:not([data-oz])');
            if (!items.length) return;

            items.forEach(el => {
                el.dataset.oz = "1";
                // 提取信息
                const nEl = el.querySelector('.name') || el.querySelector('.text-truncate');
                const rawName = nEl ? nEl.textContent.trim() : "File";
                const isZip = C.ZIP_RX.test(rawName);

                // 提取原生图标 (SVG) 用于非ZIP文件展示
                const svgIcon = el.querySelector('svg')?.outerHTML || '📄';

                let href = decodeURIComponent(el.getAttribute('href') || el.dataset.path || "");
                if (!href && el.querySelector('a')) href = decodeURIComponent(el.querySelector('a').getAttribute('href'));

                // --- 统一构建 HTML ---
                // 无论是什么文件，都放在 .oz-content 中，样式完全统一
                let innerHTML = '';

                if (isZip) {
                    // ZIP 模式：图片加载器 + 图片
                    innerHTML = `
                        <div class="oz-loader"></div>
                        <img class="oz-img" loading="lazy" data-path="${href}" alt="cover">
                    `;
                } else {
                    // 普通文件模式：大图标
                    innerHTML = `
                        <div class="oz-icon-box">${svgIcon}</div>
                    `;
                }

                // 注入 DOM
                el.innerHTML = `
                    <div class="oz-content">
                        ${innerHTML}
                        <div class="oz-meta">
                            <div class="oz-title">${U.esc(rawName)}</div>
                        </div>
                    </div>
                `;

                // --- 交互绑定 ---
                if (isZip) {
                    // ZIP: 拦截点击 -> 阅读器
                    const openReader = (e) => { e.preventDefault(); e.stopPropagation(); new Reader(rawName, href); };
                    el.addEventListener('click', openReader, true);
                    // 开始懒加载封面
                    this.io.observe(el.querySelector('.oz-img'));
                } else {
                    // 普通文件: 允许冒泡，触发 OpenList 原生跳转行为，但样式上保持统一
                    // 如果需要，可以在这里针对特定文件类型做处理，目前保持统一展示
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
                const cover = files.find(x => C.COVER_RX.test(x.n)) || files[0];

                if (cover) {
                    img.src = `${data.raw_url}?sign=${data.sign}&inner=${encodeURIComponent(cover.p)}`;
                    img.onload = () => {
                        img.classList.add('loaded');
                        img.previousElementSibling?.remove(); // 移除 Loader
                    };
                } else {
                    // 压缩包内无图片 -> 转为图标显示
                    img.parentElement.innerHTML = `<div class="oz-icon-box">📦</div>`;
                }
            } catch {
                // 加载失败 -> 图标显示
                img.parentElement.innerHTML = `<div class="oz-icon-box">🚫</div>`;
            } finally {
                this.q--;
            }
        }
    }

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
                    <span style="color:#fff;font-size:12px;opacity:0.7;font-family:monospace" id="oz-cnt"></span>
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

            // 自动隐藏 HUD
            let tm; const rst = () => { this.hud.classList.remove('h'); clearTimeout(tm); tm = setTimeout(() => this.hud.classList.add('h'), 2500); };
            this.el.onmousemove = e => { if (e.clientY < 100) rst(); };
            this.v.onscroll = () => { if (!this.hud.classList.contains('h')) this.hud.classList.add('h'); this.prog(); };

            // 键盘
            window.addEventListener('keydown', this.kh = e => {
                if (e.key === 'Escape') this.zm.style.display === 'block' ? this.zm.click() : this.die();
                else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.v.scrollBy({top: 300, behavior: 'smooth'});
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') this.v.scrollBy({top: -300, behavior: 'smooth'});
            });
            this.v.focus();
        }
        async ld() {
            try {
                const d = await U.req(C.API, { path: this.p, password: "" });
                this.base = d;
                this.pgs = U.flat(d.content).sort((a, b) => a.n.localeCompare(b.n, undefined, { numeric: 1 }));
                if (!this.pgs.length) throw 0;
                this.el.querySelector('#oz-cnt').innerText = `1 / ${this.pgs.length}`;

                const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? this.l_img(e.target) : this.u_img(e.target)), { root: this.v, rootMargin: C.PRELOAD_Y });
                this.pgs.forEach((f, i) => {
                    const d = document.createElement('div'); d.className = 'oz-r-page'; d.style.height = '600px';
                    d.f = f; d.idx = i; this.v.appendChild(d); io.observe(d);
                });
            } catch { alert('Load Error'); this.die(); }
        }
        l_img(div) {
            if (div.ok) return;
            const i = new Image();
            i.className = 'oz-r-img'; i.loading = 'lazy';
            i.onload = () => { div.ok = 1; div.style.height = 'auto'; div.style.aspectRatio = i.naturalWidth/i.naturalHeight; i.classList.add('v'); };
            i.onclick = e => {
                if (i.naturalWidth > window.innerWidth) {
                    this.zi.src = i.src; this.zm.style.display = 'block';
                    const rect = i.getBoundingClientRect();
                    const rx = (e.clientX - rect.left) / rect.width, ry = (e.clientY - rect.top) / rect.height;
                    const tx = (i.naturalWidth * rx) - window.innerWidth/2, ty = (i.naturalHeight * ry) - window.innerHeight/2;
                    if(this.zi.complete) this.zm.scrollTo(tx, ty); else this.zi.onload = () => this.zm.scrollTo(tx, ty);
                }
            };
            i.src = `${this.base.raw_url}?sign=${this.base.sign}&inner=${encodeURIComponent(div.f.p)}`;
            div.innerHTML = ''; div.appendChild(i);
        }
        u_img(div) {
            if (!div.ok) return;
            div.style.height = div.offsetHeight + 'px'; div.innerHTML = ''; div.ok = 0;
        }
        prog() {
            const m = this.v.scrollTop + window.innerHeight/2;
            for(let c of this.v.children) { if (c.offsetTop + c.offsetHeight > m) { this.el.querySelector('#oz-cnt').innerText = `${c.idx+1} / ${this.pgs.length}`; break; } }
        }
        die() {
            document.documentElement.classList.remove('oz-lock'); document.body.classList.remove('oz-lock');
            window.removeEventListener('keydown', this.kh); this.el.remove();
        }
    }

    new App();
})();
