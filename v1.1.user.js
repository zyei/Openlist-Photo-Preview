// ==UserScript==
// @name         Alist 沉浸式图廊 (Immersive Gallery) v1.1 Clear
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  [正式版 v1.1] 修复UI层级错误导致的模糊和无法滚动问题。专为 Alist/OpenList 设计的高性能看图模式。
// @author       Your Name & Advanced AI
// @match        http*://*/*
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 1. 核心配置 (CONFIG)
    // ==========================================
    const CONFIG = {
        EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.avif', '.svg', '.jxl', '.heic'],
        TRIGGER_COUNT: 2,
        // 移动端并发降为 3 以防卡顿，PC 端保持 4
        CONCURRENCY: window.innerWidth < 768 ? 3 : 4,
        PRELOAD_MARGIN: '100% 0px 100% 0px',
        ENTRY_DELAY: 150,
        UI_AUTO_HIDE_DELAY: 2500,
        API_PATH: '/api/fs/link'
    };

    // ==========================================
    // 2. 极光 UI 系统 (CSS)
    // ==========================================
    GM_addStyle(`
        :root {
            --ig-bg: #0f0f11;
            --ig-card-bg: #1e1e24;
            --ig-primary: #6366f1;
            --ig-text-main: #f8fafc;
            --ig-text-sub: #94a3b8;
            --ig-radius: 16px;
            --ig-glass: rgba(255, 255, 255, 0.1);
            --ig-glass-border: rgba(255, 255, 255, 0.08);
            --ig-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.5);
            --ig-z-top: 2147483647;
        }

        /* === 主容器 === */
        #ig-root {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100dvh;
            background: var(--ig-bg);
            z-index: 2147483640;
            overflow-y: auto; overflow-x: hidden;
            display: flex; flex-direction: column; align-items: center;
            opacity: 0; transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            scrollbar-width: thin; scrollbar-color: #333 transparent;
        }
        #ig-root.active { opacity: 1; }
        body.ig-lock { overflow: hidden !important; }

        /* === 图片列表 === */
        .ig-list {
            width: 100%;
            display: flex; flex-direction: column; align-items: center;
            padding-bottom: 150px;
            will-change: transform;
        }

        /* 模式 A: 标准卡片 */
        .ig-list.mode-standard { padding-top: 100px; gap: 60px; }
        .ig-list.mode-standard .ig-card {
            width: 90%; max-width: 1200px;
            aspect-ratio: 2/3;
            border-radius: var(--ig-radius);
            box-shadow: var(--ig-shadow);
            background: var(--ig-card-bg);
            border: 1px solid var(--ig-glass-border);
        }

        /* 模式 B: Webtoon */
        .ig-list.mode-webtoon { padding-top: 0; gap: 0; }
        .ig-list.mode-webtoon .ig-card {
            width: 100vw; max-width: 100%;
            min-height: 50vh;
            background: transparent;
            border-radius: 0;
        }

        /* === 卡片与图片 === */
        .ig-card {
            position: relative; display: flex; align-items: center; justify-content: center;
            overflow: hidden; transition: transform 0.3s ease;
        }
        .ig-card.loaded {
            aspect-ratio: auto !important; min-height: auto !important;
            background: transparent; border: none; box-shadow: none;
        }

        .ig-image {
            width: 100%; height: auto; display: block;
            opacity: 0; transform: scale(0.98);
            transition: opacity 0.5s ease, transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
            user-select: none;
        }
        .ig-image.loaded { opacity: 1; transform: scale(1); }

        /* === 加载状态 === */
        .ig-status {
            position: absolute; inset: 0;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            gap: 15px; color: var(--ig-text-sub); pointer-events: none;
        }
        .ig-idx { font-size: 3em; font-weight: 800; opacity: 0.1; font-family: sans-serif; }
        .ig-spinner {
            width: 30px; height: 30px;
            border: 3px solid rgba(255,255,255,0.1);
            border-top-color: var(--ig-primary);
            border-radius: 50%;
            animation: ig-spin 0.8s linear infinite;
            opacity: 0; transition: opacity 0.3s;
        }
        .ig-card[data-state="loading"] .ig-spinner { opacity: 1; }
        @keyframes ig-spin { to { transform: rotate(360deg); } }

        /* === UI 控制层 === */
        .ig-ui-layer {
            position: fixed; inset: 0; pointer-events: none; z-index: var(--ig-z-top);
            transition: opacity 0.4s ease;
        }
        .ig-ui-layer.hidden { opacity: 0; }

        /* 只有带 ig-ui-element 的子元素才有交互和模糊背景 */
        .ig-ui-element { pointer-events: auto; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }

        /* 工具栏 */
        .ig-toolbar {
            position: absolute; top: 24px; right: 32px;
            display: flex; gap: 12px;
            background: var(--ig-glass); border: 1px solid var(--ig-glass-border);
            padding: 8px 16px; border-radius: 50px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        }

        /* 返回按钮 */
        .ig-back {
            position: absolute; top: 24px; left: 32px;
            width: 48px; height: 48px; border-radius: 50%;
            background: var(--ig-glass); border: 1px solid var(--ig-glass-border);
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; transition: all 0.2s;
            color: var(--ig-text-main);
        }
        .ig-back:hover { background: rgba(255,255,255,0.2); transform: scale(1.05); }

        /* 计数器 */
        .ig-counter {
            position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.6); color: var(--ig-text-main);
            padding: 6px 18px; border-radius: 20px; font-size: 13px; font-weight: 500;
            border: 1px solid var(--ig-glass-border);
        }

        .ig-btn {
            width: 36px; height: 36px; border: none; background: transparent;
            color: var(--ig-text-sub); border-radius: 8px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.2s;
        }
        .ig-btn:hover { color: var(--ig-text-main); background: rgba(255,255,255,0.1); }
        .ig-btn.active { color: #fff; background: var(--ig-primary); box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4); }

        /* 入口浮窗 */
        #ig-entry {
            position: fixed; bottom: 40px; right: 40px;
            width: 56px; height: 56px;
            background: var(--ig-primary); color: white;
            border-radius: 20px; border: none; cursor: pointer;
            box-shadow: 0 12px 30px rgba(99, 102, 241, 0.4);
            z-index: 9999;
            display: flex; align-items: center; justify-content: center;
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        #ig-entry:hover { transform: scale(1.1) rotate(-5deg); }

        /* 移动端适配 */
        @media (max-width: 768px) {
            .ig-list.mode-standard .ig-card { width: 100%; border-radius: 0; border-left: none; border-right: none; }
            .ig-list.mode-standard { padding-top: 80px; gap: 20px; }
            .ig-toolbar { top: auto; bottom: 30px; right: 20px; padding: 6px 12px; }
            .ig-back { top: auto; bottom: 30px; left: 20px; background: rgba(0,0,0,0.6); backdrop-filter: blur(20px); }
            .ig-counter { bottom: auto; top: 20px; background: rgba(0,0,0,0.4); }
            #ig-entry { width: 48px; height: 48px; bottom: 30px; right: 20px; border-radius: 50%; }
        }

        /* 4K 适配 */
        @media (min-width: 2560px) { .ig-list.mode-standard .ig-card { max-width: 1600px; } }
    `);

    // ==========================================
    // 3. 狙击手引擎 V2 (Sniper Engine)
    // ==========================================
    class SniperEngine {
        constructor(concurrency) {
            this.concurrency = concurrency;
            this.activeCount = 0;
            this.queue = new Set();
            this.controllers = new Map();
            this.blobUrls = new Set();
            this.domMap = new Map();
            this.entryTimers = new Map();
            this.retryCounts = new Map();
        }

        register(index, element) {
            this.domMap.set(index, element);
        }

        onEnter(index) {
            if (this.controllers.has(index)) return;
            const el = this.domMap.get(index);
            if (!el || el.dataset.state === 'loaded') return;

            if (!this.entryTimers.has(index)) {
                const timer = setTimeout(() => {
                    this.entryTimers.delete(index);
                    this.queue.add(index);
                    this.schedule();
                }, CONFIG.ENTRY_DELAY);
                this.entryTimers.set(index, timer);
            }
        }

        onExit(index) {
            if (this.entryTimers.has(index)) {
                clearTimeout(this.entryTimers.get(index));
                this.entryTimers.delete(index);
            }
            this.queue.delete(index);

            if (this.controllers.has(index)) {
                this.controllers.get(index).abort();
                this.controllers.delete(index);
                this.activeCount--;

                const el = this.domMap.get(index);
                if (el) {
                    el.dataset.state = 'idle';
                    el.querySelector('.ig-image')?.remove();
                }
                this.schedule();
            }
        }

        schedule() {
            if (this.activeCount >= this.concurrency) return;
            if (this.queue.size === 0) return;

            const centerY = window.innerHeight / 2;
            const candidates = [];

            this.queue.forEach(index => {
                const el = this.domMap.get(index);
                if (el) {
                    const rect = el.getBoundingClientRect();
                    const dist = Math.abs((rect.top + rect.height / 2) - centerY);
                    candidates.push({ index, dist });
                }
            });

            candidates.sort((a, b) => a.dist - b.dist);

            const best = candidates[0];
            if (best) {
                this.queue.delete(best.index);
                this.execute(best.index);
            }
        }

        async execute(index) {
            this.activeCount++;
            const controller = new AbortController();
            this.controllers.set(index, controller);
            const signal = controller.signal;
            const el = this.domMap.get(index);

            if (!el) { this.activeCount--; return; }
            el.dataset.state = 'loading';

            try {
                const path = el.dataset.path;
                const token = localStorage.getItem('token') || localStorage.getItem('alist_token') || '';

                const linkRes = await fetch(CONFIG.API_PATH, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': token },
                    body: JSON.stringify({ path, password: "" }),
                    signal
                });

                if (!linkRes.ok) throw new Error('API Error');
                const data = await linkRes.json();
                const url = data?.data?.url;
                if (!url) throw new Error('No URL');

                const imgRes = await fetch(url, { signal });
                if (!imgRes.ok) throw new Error('Image Fail');

                const blob = await imgRes.blob();
                const objectUrl = URL.createObjectURL(blob);
                this.blobUrls.add(objectUrl);

                const img = new Image();
                img.className = 'ig-image';
                img.src = objectUrl;

                img.onload = () => {
                    if (signal.aborted) return;
                    el.appendChild(img);
                    el.dataset.state = 'loaded';
                    el.classList.add('loaded');
                    requestAnimationFrame(() => img.classList.add('loaded'));

                    this.controllers.delete(index);
                    this.activeCount--;
                    this.schedule();
                };

            } catch (err) {
                if (signal.aborted) return;

                const retries = this.retryCounts.get(index) || 0;
                if (retries < 1) {
                    this.retryCounts.set(index, retries + 1);
                    this.activeCount--;
                    this.controllers.delete(index);
                    setTimeout(() => {
                        this.queue.add(index);
                        this.schedule();
                    }, 1000);
                } else {
                    el.innerHTML = `<div style="color:#ef4444">Load Failed</div>`;
                    this.controllers.delete(index);
                    this.activeCount--;
                    this.schedule();
                }
            }
        }

        reset() {
            this.controllers.forEach(c => c.abort());
            this.controllers.clear();
            this.queue.clear();
            this.entryTimers.forEach(t => clearTimeout(t));
            this.entryTimers.clear();
            this.activeCount = 0;
            this.retryCounts.clear();
            this.blobUrls.forEach(url => URL.revokeObjectURL(url));
            this.blobUrls.clear();
        }
    }

    const sniper = new SniperEngine(CONFIG.CONCURRENCY);

    // ==========================================
    // 4. 主应用逻辑 (App)
    // ==========================================
    class GalleryApp {
        constructor() {
            this.active = false;
            this.mode = localStorage.getItem('ig_mode') || 'mode-standard';
            this.images = [];
            this.uiTimer = null;
        }

        init() {
            let lastUrl = location.href;
            setInterval(() => {
                if (location.href !== lastUrl) {
                    lastUrl = location.href;
                    this.cleanupEntryBtn();
                }
                if (!this.active && !document.getElementById('ig-entry')) {
                    this.scan();
                }
            }, 1000);
            this.scan();
        }

        scan() {
            const hasImages = Array.from(document.querySelectorAll('a')).some(link => {
                const name = (link.querySelector('.name') || link).textContent.trim();
                return CONFIG.EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext));
            });
            if (hasImages) this.spawnEntryBtn();
        }

        cleanupEntryBtn() { document.getElementById('ig-entry')?.remove(); }

        spawnEntryBtn() {
            const btn = document.createElement('button');
            btn.id = 'ig-entry';
            btn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
            btn.onclick = () => this.launch();
            document.body.appendChild(btn);
        }

        fetchImageList() {
            return Array.from(document.querySelectorAll('a')).map(link => {
                const nameEl = link.querySelector('.name') || link;
                const name = nameEl.textContent.trim();
                if (!CONFIG.EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext))) return null;
                const href = link.getAttribute('data-src') || link.href;
                try {
                    return {
                        name: name,
                        path: decodeURIComponent(new URL(href, window.location.origin).pathname)
                    };
                } catch(e) { return null; }
            }).filter(Boolean);
        }

        launch() {
            this.images = this.fetchImageList();
            if (this.images.length < 1) return alert('当前目录未找到图片');

            this.active = true;
            sniper.reset();
            document.body.classList.add('ig-lock');

            const root = document.createElement('div');
            root.id = 'ig-root';

            // 修复：移除了容器上的 ig-ui-element 类，确保事件穿透
            const ui = document.createElement('div');
            ui.className = 'ig-ui-layer';
            ui.innerHTML = `
                <div class="ig-toolbar ig-ui-element">
                    <button class="ig-btn ${this.mode === 'mode-standard' ? 'active' : ''}" data-mode="mode-standard" title="Standard View">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                    </button>
                    <button class="ig-btn ${this.mode === 'mode-webtoon' ? 'active' : ''}" data-mode="mode-webtoon" title="Webtoon Flow">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
                    </button>
                </div>
                <button class="ig-back ig-ui-element">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                </button>
                <div class="ig-counter ig-ui-element">1 / ${this.images.length}</div>
            `;

            const list = document.createElement('div');
            list.className = `ig-list ${this.mode}`;
            const frag = document.createDocumentFragment();

            this.images.forEach((img, idx) => {
                const card = document.createElement('div');
                card.className = 'ig-card';
                card.dataset.path = img.path;
                card.dataset.idx = idx;
                card.dataset.state = 'idle';
                card.innerHTML = `
                    <div class="ig-status">
                        <span class="ig-idx">${idx + 1}</span>
                        <div class="ig-spinner"></div>
                    </div>
                `;
                sniper.register(idx, card);
                frag.appendChild(card);
            });
            list.appendChild(frag);
            root.appendChild(list);
            root.appendChild(ui);
            document.body.appendChild(root);

            this.container = root;
            this.uiLayer = ui;
            this.bindEvents();
            this.startObserver();
            this.resetUiTimer();

            requestAnimationFrame(() => root.classList.add('active'));
        }

        close() {
            this.active = false;
            document.body.classList.remove('ig-lock');
            sniper.reset();
            this.container.classList.remove('active');
            setTimeout(() => this.container.remove(), 400);
            if (this.observer) this.observer.disconnect();
        }

        startObserver() {
            this.observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    const idx = parseInt(entry.target.dataset.idx);
                    if (entry.isIntersecting) {
                        sniper.onEnter(idx);
                        this.container.querySelector('.ig-counter').textContent = `${idx + 1} / ${this.images.length}`;
                    } else {
                        sniper.onExit(idx);
                    }
                });
            }, { root: this.container, rootMargin: CONFIG.PRELOAD_MARGIN, threshold: 0 });
            this.container.querySelectorAll('.ig-card').forEach(el => this.observer.observe(el));
        }

        bindEvents() {
            this.container.querySelector('.ig-back').onclick = () => this.close();

            this.container.querySelector('.ig-toolbar').onclick = (e) => {
                const btn = e.target.closest('.ig-btn');
                if (!btn) return;

                const newMode = btn.dataset.mode;
                if (this.mode === newMode) return;

                this.mode = newMode;
                localStorage.setItem('ig_mode', newMode);

                const list = this.container.querySelector('.ig-list');
                list.className = `ig-list ${newMode}`;
                this.container.querySelectorAll('.ig-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                setTimeout(() => sniper.schedule(), 300);
            };

            const keyHandler = (e) => {
                if (!this.active) return document.removeEventListener('keydown', keyHandler);
                if (e.key === 'Escape') this.close();
            };
            document.addEventListener('keydown', keyHandler);

            const wakeUp = () => {
                this.uiLayer.classList.remove('hidden');
                this.resetUiTimer();
            };
            this.container.addEventListener('mousemove', wakeUp);
            this.container.addEventListener('touchstart', wakeUp);
            this.container.addEventListener('scroll', wakeUp);
        }

        resetUiTimer() {
            if (this.uiTimer) clearTimeout(this.uiTimer);
            this.uiTimer = setTimeout(() => {
                if (this.active) this.uiLayer.classList.add('hidden');
            }, CONFIG.UI_AUTO_HIDE_DELAY);
        }
    }

    const app = new GalleryApp();
    app.init();
    console.log('%c Alist Gallery v1.1 Clear Launched ', 'background: #6366f1; color: #fff; padding: 4px; border-radius: 4px;');

})();
