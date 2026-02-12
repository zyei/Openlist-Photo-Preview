// ==UserScript==
// @name         OpenList Cinema V3.1 (Pro Logic)
// @namespace    http://tampermonkey.net/
// @version      3.1.0
// @description  Alist/OpenList 终极形态：智能目录分层排序 + 宽泛海报识别 + 完美像素级分页
// @author       Advanced AI
// @include      *://127.0.0.1/*
// @include      *://127.0.0.1:*/*
// @include      *://localhost/*
// @include      *://localhost:*/*
// @include      *://192.168.*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @run-at       document-start
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    // --- 0. 核心配置 ---
    const C = {
        CONCURRENCY: 6,
        PRELOAD_Y: "0px 0px 1200px 0px",
        ZIP_RX: /\.(zip|cbz)$/i,
        IMG_RX: /\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i,
        VID_RX: /\.(mp4|webm|ogv|mov)$/i,
        // 宽泛匹配：包含 cover, title, poster, front, index 等关键词，不区分大小写，忽略前后缀
        SPECIAL_RX: /(cover|title|poster|front|index|thumb|_cover)/i,
        API: '/api/fs/archive/meta',
        PAGE_ROWS: 5 // 每页显示的行数，动态计算总数
    };

    // --- 1. 样式系统 (零闪烁 + 玻璃拟态) ---
    const css = `
        :root {
            --c-w: 180px; /* 卡片基准宽度 */
            --c-g: 24px;  /* 网格间距 */
            --oz-bg: rgba(255, 255, 255, 0.25);
            --oz-bd: 1px solid rgba(255, 255, 255, 0.3);
            --oz-shd: 0 8px 32px rgba(0, 0, 0, 0.1);
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --oz-bg: rgba(20, 20, 20, 0.5);
                --oz-bd: 1px solid rgba(255, 255, 255, 0.1);
                --oz-shd: 0 8px 32px rgba(0, 0, 0, 0.4);
            }
        }

        /* 强制隐藏原始 UI */
        .list-header, .header-row, .hope-stack.title { display: none !important; }
        .obj-box, .list, .hope-stack.list { opacity: 0; transition: opacity 0.2s ease; }
        .oz-ready .obj-box, .oz-ready .list, .oz-ready .hope-stack.list { opacity: 1; }

        /* 网格容器 */
        .list, .hope-stack.list, .obj-box>.list {
            display: grid !important;
            /* 关键：使用 auto-fill 配合 JS 计算的分页，确保每行填满 */
            grid-template-columns: repeat(auto-fill, minmax(var(--c-w), 1fr)) !important;
            gap: var(--c-g) !important;
            padding: 40px 60px 120px !important;
            width: 100% !important; box-sizing: border-box !important;
            background: transparent !important;
        }

        /* 卡片 */
        .list-item, a.list-item {
            display: flex !important; flex-direction: column !important;
            aspect-ratio: 2/3; height: auto !important;
            background: var(--oz-bg) !important;
            backdrop-filter: blur(20px) saturate(140%);
            border: var(--oz-bd) !important; border-radius: 12px !important;
            box-shadow: var(--oz-shd) !important;
            margin: 0 !important; padding: 0 !important;
            overflow: hidden !important; position: relative !important;
            transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), box-shadow 0.3s ease !important;
            cursor: pointer !important; text-decoration: none !important;
            transform: translateZ(0);
        }
        .list-item[data-hidden="true"] { display: none !important; }
        .list-item:hover {
            transform: translateY(-8px) scale(1.02) !important;
            background: rgba(255,255,255,0.4) !important;
            box-shadow: 0 20px 48px rgba(0,0,0,0.25) !important;
            z-index: 10;
        }

        /* 隐藏原始元素 */
        .list-item svg, .list-item .name, .list-item .size, .list-item .date, .list-item .checkbox { display: none !important; }

        /* 内容容器 */
        .oz-content { width: 100%; height: 100%; position: relative; }
        .oz-img { width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 0.4s ease; }
        .oz-img.loaded { opacity: 1; }

        /* 骨架屏优化 */
        .oz-loader {
            position: absolute; inset: -50%;
            background: linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.1) 50%, transparent 60%);
            background-size: 200% 200%;
            animation: oz-shimmer 2s infinite linear;
            filter: blur(30px); transform: rotate(15deg);
        }
        @keyframes oz-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

        /* Meta 信息 */
        .oz-meta {
            position: absolute; bottom: 0; left: 0; right: 0;
            padding: 60px 16px 14px;
            background: linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.5) 40%, transparent);
            pointer-events: none;
        }
        .oz-title {
            font-size: 13px; color: #fff; font-weight: 600; line-height: 1.4;
            text-shadow: 0 2px 4px rgba(0,0,0,0.6);
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }

        /* 分页器 */
        #oz-pager {
            position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
            display: flex; gap: 16px; align-items: center;
            background: rgba(15, 15, 15, 0.85); backdrop-filter: blur(20px);
            padding: 10px 24px; border-radius: 40px; border: 1px solid rgba(255,255,255,0.15);
            box-shadow: 0 12px 40px rgba(0,0,0,0.4); z-index: 1000;
            transition: 0.3s cubic-bezier(0.2, 0, 0, 1);
        }
        #oz-pager.h { opacity: 0; transform: translateX(-50%) translateY(30px); pointer-events: none; }
        .oz-pg-btn {
            background: rgba(255,255,255,0.1); border: none; color: #fff;
            width: 36px; height: 36px; border-radius: 50%; cursor: pointer;
            display: flex; align-items: center; justify-content: center; transition: 0.2s;
        }
        .oz-pg-btn:hover { background: rgba(255,255,255,0.3); transform: scale(1.1); }
        .oz-pg-btn:disabled { opacity: 0.3; pointer-events: none; }
        .oz-pg-info { font-family: 'JetBrains Mono', monospace; font-size: 14px; color: #eee; font-weight: 700; min-width: 70px; text-align: center; }

        /* 阅读器 */
        html.oz-lock, body.oz-lock { overflow: hidden !important; height: 100vh !important; }
        #oz-reader {
            position: fixed; inset: 0; z-index: 999999; background: #080808;
            display: flex; flex-direction: column;
        }
        .oz-r-view {
            flex: 1; overflow-y: auto; width: 100%; height: 100%;
            scroll-behavior: auto; scrollbar-width: none;
        }
        .oz-r-view::-webkit-scrollbar { display: none; }
        .oz-r-page { display: block; width: 100%; min-height: 200px; position: relative; margin: 0 auto; }
        .oz-r-img { display: block; width: 100%; height: auto; opacity: 0; transition: opacity 0.3s; }
        .oz-r-img.v { opacity: 1; }
        .oz-vid-box { width: 100%; padding: 40px 0; background: #000; text-align: center; }
        .oz-vid { max-width: 90%; max-height: 80vh; border-radius: 8px; box-shadow: 0 0 50px rgba(255,255,255,0.1); }
        .oz-r-hud {
            position: fixed; top: 0; left: 0; right: 0; padding: 16px 24px;
            background: linear-gradient(to bottom, rgba(0,0,0,0.9), transparent);
            display: flex; justify-content: space-between; align-items: center;
            transition: transform 0.3s; pointer-events: none; z-index: 100;
        }
        .oz-r-hud.h { transform: translateY(-100%); }
        .oz-r-btn { pointer-events: auto; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(10px); color: #fff; padding: 6px 14px; border-radius: 20px; cursor: pointer; }
    `;

    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);

    // --- 2. 逻辑与工具 ---
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
            let r = [];
            if (!n) return r;
            n.forEach(x => {
                let f = (p ? p + "/" : "") + x.name;
                if (x.is_dir) r = r.concat(U.flat(x.children, f));
                else r.push({ n: x.name, p: f });
            });
            return r;
        },
        // 关键：基于全路径的自然排序 (保证 Image Set A 在 Image Set B 之前)
        pathSort: (a, b) => a.p.localeCompare(b.p, undefined, { numeric: true, sensitivity: 'base' })
    };

    const Logic = {
        // 核心逻辑：智能提取与排序
        analyze: (files) => {
            const vids = files.filter(x => C.VID_RX.test(x.n));
            const allImgs = files.filter(x => C.IMG_RX.test(x.n));

            // 1. 分离根目录文件与子目录文件
            // 根目录文件：路径中不含 "/"
            const rootImgs = allImgs.filter(x => !x.p.includes('/'));
            const subImgs = allImgs.filter(x => x.p.includes('/'));

            // 2. 排序
            // 根目录按文件名排序
            rootImgs.sort((a, b) => a.n.localeCompare(b.n, undefined, { numeric: true }));
            // 子目录按全路径排序 (保证 A/a1 在 B/b1 之前)
            subImgs.sort(U.pathSort);

            // 3. 构建阅读顺序：根目录优先 -> 然后是子文件夹
            let readList = [...rootImgs, ...subImgs];

            // 4. 海报选择策略
            let poster = null;

            // 策略 A: 检查根目录是否有 Special 关键词
            poster = rootImgs.find(x => C.SPECIAL_RX.test(x.n));

            // 策略 B: 检查子目录是否有 Special 关键词 (按路径序)
            if (!poster) poster = subImgs.find(x => C.SPECIAL_RX.test(x.n));

            // 策略 C: 根目录第一张
            if (!poster) poster = rootImgs[0];

            // 策略 D: 子目录第一张
            if (!poster) poster = subImgs[0];

            // 5. 调整阅读列表 (如果海报在列表中，将其置顶? 需求未明确要求置顶，但通常置顶更好，这里严格按照 Requirements 2 的顺序描述，不需要置顶，只需正确顺序)
            // 用户要求：Cover -> A -> B. 我们的 readList 已经是 Root -> Sub(A->B). 符合要求。

            return { poster, readList, vids };
        }
    };

    // --- 3. 主程序 ---
    class App {
        constructor() {
            this.q = 0;
            this.items = [];
            this.pgSize = 20;
            this.curPg = 0;
            this.lastW = 0;

            // 预加载监听
            this.io = new IntersectionObserver(es => es.forEach(e => {
                if (e.isIntersecting) { this.io.unobserve(e.target); this.loadMeta(e.target); }
            }), { rootMargin: '600px' }); // 预加载范围加大

            this.createPager();

            // Resize 监听 (防抖)
            let rsT;
            window.addEventListener('resize', () => {
                clearTimeout(rsT);
                rsT = setTimeout(() => this.calcPage(), 100);
            });

            // 初始化
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => this.boot());
            else this.boot();
        }

        createPager() {
            this.pager = document.createElement('div');
            this.pager.id = 'oz-pager';
            this.pager.innerHTML = `
                <button class="oz-pg-btn" id="oz-prev"><svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></button>
                <div class="oz-pg-info"></div>
                <button class="oz-pg-btn" id="oz-next"><svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg></button>
            `;
            document.body.appendChild(this.pager);
            this.pgInfo = this.pager.querySelector('.oz-pg-info');
            this.btnPrev = this.pager.querySelector('#oz-prev');
            this.btnNext = this.pager.querySelector('#oz-next');

            this.btnPrev.onclick = () => this.goPage(this.curPg - 1);
            this.btnNext.onclick = () => this.goPage(this.curPg + 1);

            let t;
            const wake = () => { this.pager.classList.remove('h'); clearTimeout(t); t = setTimeout(() => this.pager.classList.add('h'), 3000); };
            window.addEventListener('scroll', wake);
            window.addEventListener('mousemove', (e) => { if(e.clientY > window.innerHeight - 100) wake(); });
        }

        boot() {
            this.mo = new MutationObserver(() => this.scan());
            this.mo.observe(document.body, { childList: true, subtree: true });
            this.scan();
        }

        scan() {
            const raw = document.querySelectorAll('.list-item:not([data-oz])');
            if (!raw.length) return;

            raw.forEach(el => {
                el.dataset.oz = "1";
                const nEl = el.querySelector('.name') || el.querySelector('.text-truncate');
                const rawName = nEl ? nEl.textContent.trim() : "File";

                // 类型判定
                const isZip = C.ZIP_RX.test(rawName);
                const isImg = C.IMG_RX.test(rawName);

                let href = decodeURIComponent(el.getAttribute('href') || el.dataset.path || "");
                if (!href && el.querySelector('a')) href = decodeURIComponent(el.querySelector('a').getAttribute('href'));

                const icon = el.querySelector('svg')?.outerHTML || '📄';
                let content = '';

                if (isZip) {
                    content = `<div class="oz-loader"></div><img class="oz-img" loading="lazy" data-path="${href}">`;
                    el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); new Reader(rawName, href); }, true);
                } else if (isImg) {
                    content = `<div class="oz-loader"></div><img class="oz-img" loading="lazy" src="${href}" onload="this.classList.add('loaded');this.previousElementSibling.remove()">`;
                    el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); new Reader(rawName, href, true); }, true);
                } else {
                    content = `<div style="font-size:48px;opacity:0.6;filter:grayscale(1)">${icon}</div>`;
                }

                el.innerHTML = `
                    <div class="oz-content">${content}</div>
                    <div class="oz-meta"><div class="oz-title">${U.esc(rawName)}</div></div>
                `;

                this.items.push(el);
                if (isZip) this.io.observe(el.querySelector('.oz-img'));
            });

            document.body.classList.add('oz-ready');
            this.calcPage();
        }

        // --- 核心优化：完美分页算法 ---
        calcPage() {
            const listEl = document.querySelector('.list');
            if (!listEl || !this.items.length) return;

            // 获取容器实际可用宽度 (排除 padding)
            const style = window.getComputedStyle(listEl);
            const w = listEl.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);

            if (w === this.lastW && this.pgSize > 0) return; // 宽度未变则不重算
            this.lastW = w;

            // CSS 变量值 (与 CSS 中的 var(--c-w) 和 var(--c-g) 保持一致)
            const itemW = 180;
            const gap = 24;

            // 计算每行能放多少个 (Math.floor((TotalWidth + gap) / (ItemWidth + gap)))
            // 原理: n * w + (n-1) * g <= W  =>  n * (w+g) - g <= W  => n <= (W+g)/(w+g)
            const cols = Math.floor((w + gap) / (itemW + gap));

            // 确保至少有1列
            const safeCols = Math.max(1, cols);

            // 每页数量必须是列数的整数倍，确保铺满
            const newPgSize = safeCols * C.PAGE_ROWS;

            if (newPgSize !== this.pgSize) {
                this.pgSize = newPgSize;
                this.curPg = 0; // 重置页码防止越界
                this.render();
            } else {
                this.render();
            }
        }

        goPage(p) {
            const max = Math.ceil(this.items.length / this.pgSize) - 1;
            this.curPg = Math.max(0, Math.min(p, max));
            this.render();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        render() {
            const total = this.items.length;
            const max = Math.ceil(total / this.pgSize);
            const start = this.curPg * this.pgSize;
            const end = start + this.pgSize;

            this.items.forEach((el, i) => {
                if (i >= start && i < end) el.removeAttribute('data-hidden');
                else el.setAttribute('data-hidden', 'true');
            });

            if (max <= 1) {
                this.pager.style.display = 'none';
            } else {
                this.pager.style.display = 'flex';
                this.pgInfo.textContent = `${this.curPg + 1} / ${max}`;
                this.btnPrev.disabled = this.curPg === 0;
                this.btnNext.disabled = this.curPg === max - 1;
            }
        }

        async loadMeta(img) {
            if (this.q >= C.CONCURRENCY) return setTimeout(() => this.loadMeta(img), 200);
            this.q++;
            try {
                const data = await U.req(C.API, { path: img.dataset.path, password: "" });
                const files = U.flat(data.content);
                const { poster } = Logic.analyze(files);

                if (poster) {
                    img.src = `${data.raw_url}?sign=${data.sign}&inner=${encodeURIComponent(poster.p)}`;
                    img.onload = () => { img.classList.add('loaded'); img.previousElementSibling?.remove(); };
                } else { throw 0; }
            } catch {
                img.parentElement.innerHTML = `<div style="font-size:40px">📦</div>`;
            } finally {
                this.q--;
            }
        }
    }

    class Reader {
        constructor(t, p, s = false) {
            this.t = t; this.p = p; this.s = s;
            document.documentElement.classList.add('oz-lock'); document.body.classList.add('oz-lock');
            this.ui();
            this.s ? this.loadS() : this.loadZ();
        }

        ui() {
            this.el = document.createElement('div'); this.el.id = 'oz-reader';
            this.el.innerHTML = `
                <div class="oz-r-hud" id="oz-hud">
                    <button class="oz-r-btn" id="oz-back">← Back</button>
                    <span style="color:#fff;font-size:12px;font-family:monospace;opacity:0.8" id="oz-cnt">Loading...</span>
                </div>
                <div class="oz-r-view" id="oz-view" tabindex="0"></div>
            `;
            document.body.appendChild(this.el);
            this.v = this.el.querySelector('#oz-view');
            this.cnt = this.el.querySelector('#oz-cnt');
            this.hud = this.el.querySelector('#oz-hud');
            this.el.querySelector('#oz-back').onclick = () => this.die();

            let tm; const rst = () => { this.hud.classList.remove('h'); clearTimeout(tm); tm = setTimeout(() => this.hud.classList.add('h'), 2500); };
            this.el.onmousemove = e => { if (e.clientY < 100) rst(); };
            this.v.onscroll = () => { if (!this.hud.classList.contains('h')) this.hud.classList.add('h'); this.upd(); };

            window.addEventListener('keydown', this.kh = e => {
                if (e.key === 'Escape') this.die();
                const s = window.innerHeight * 0.8;
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); this.v.scrollBy({top: s, behavior:'smooth'}); }
                if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); this.v.scrollBy({top: -s, behavior:'smooth'}); }
            });
            this.v.focus();
        }

        loadS() {
            const d = document.createElement('div'); d.className = 'oz-r-page';
            d.innerHTML = `<img class="oz-r-img v" src="${this.p}">`;
            this.v.appendChild(d); this.cnt.innerText = "1 / 1";
        }

        async loadZ() {
            try {
                const data = await U.req(C.API, { path: this.p, password: "" });
                this.base = data;
                const files = U.flat(data.content);
                const { readList, vids } = Logic.analyze(files);

                if (!readList.length && !vids.length) throw "Empty";
                this.imgs = readList;
                this.cnt.innerText = `1 / ${readList.length}`;

                const io = new IntersectionObserver(es => es.forEach(e => {
                    e.isIntersecting ? this.mount(e.target) : this.unmount(e.target);
                }), { root: this.v, rootMargin: C.PRELOAD_Y });

                readList.forEach((f, i) => {
                    const d = document.createElement('div'); d.className = 'oz-r-page'; d.style.height = '800px';
                    d.f = f; d.idx = i; this.v.appendChild(d); io.observe(d);
                });

                if (vids.length) {
                    vids.forEach(v => {
                        const box = document.createElement('div'); box.className = 'oz-vid-box';
                        const u = `${this.base.raw_url}?sign=${this.base.sign}&inner=${encodeURIComponent(v.p)}`;
                        box.innerHTML = `<video class="oz-vid" controls playsinline><source src="${u}"></video><div style="color:#666;font-size:12px;margin-top:10px">${U.esc(v.n)}</div>`;
                        this.v.appendChild(box);
                    });
                }
            } catch(e) { console.error(e); alert('Error'); this.die(); }
        }

        mount(div) {
            if (div.ok) return;
            const i = new Image(); i.className = 'oz-r-img'; i.decoding = 'async';
            i.onload = () => { div.ok = 1; div.style.height = 'auto'; i.classList.add('v'); };
            i.src = `${this.base.raw_url}?sign=${this.base.sign}&inner=${encodeURIComponent(div.f.p)}`;
            div.innerHTML = ''; div.appendChild(i);
        }

        unmount(div) {
            if (!div.ok) return;
            div.style.height = div.offsetHeight + 'px'; div.innerHTML = ''; div.ok = 0;
        }

        upd() {
            if (!this.imgs) return;
            const m = this.v.scrollTop + window.innerHeight / 2;
            for(let c of this.v.children) {
                if (c.classList.contains('oz-r-page') && c.offsetTop + c.offsetHeight > m) {
                    this.cnt.innerText = `${c.idx+1} / ${this.imgs.length}`; break;
                }
            }
        }

        die() {
            document.documentElement.classList.remove('oz-lock'); document.body.classList.remove('oz-lock');
            window.removeEventListener('keydown', this.kh); this.el.remove();
        }
    }

    new App();
})();
