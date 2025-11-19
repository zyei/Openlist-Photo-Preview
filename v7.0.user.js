// ==UserScript==
// @name         Alist 沉浸式图廊 (Immersive Gallery) v9.0 Focus
// @namespace    http://tampermonkey.net/
// @version      9.0
// @description  专为 Alist/OpenList 设计的高性能看图模式。具备视口动态队列控制，彻底解决快速滑动卡顿问题。仅保留标准与Webtoon模式。
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
        EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.avif', '.svg', '.jxl'],
        TRIGGER_COUNT: 3,
        CONCURRENCY_LIMIT: 3, // 同时下载数
        API_PATH: '/api/fs/link'
    };

    // ==========================================
    // 2. 样式系统 (CSS System)
    // ==========================================
    GM_addStyle(`
        :root {
            --ig-z-index: 2147483640;
            --ig-bg: #f3f4f6;
            --ig-toolbar-bg: rgba(255, 255, 255, 0.95);
        }

        /* 容器与基础 */
        #ig-container {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: var(--ig-bg);
            z-index: var(--ig-z-index);
            overflow-y: auto;
            display: flex; flex-direction: column; align-items: center;
            opacity: 0; transition: opacity 0.25s ease;
            scrollbar-width: thin;
        }
        #ig-container.active { opacity: 1; }
        body.ig-lock { overflow: hidden !important; }

        /* 工具栏 - 修复布局错乱 */
        .ig-toolbar {
            position: fixed; top: 20px; right: 30px;
            display: flex; align-items: center; gap: 15px; /* 增加间距 */
            z-index: 2147483647;
            background: var(--ig-toolbar-bg);
            padding: 8px 16px;
            border-radius: 50px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.08);
            transform: translateY(-100px); transition: transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
        }
        #ig-container.active .ig-toolbar { transform: translateY(0); }

        .ig-btn {
            width: 42px; height: 42px;
            border: 1px solid transparent; background: transparent;
            color: #555; border-radius: 50%;
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            transition: all 0.2s ease;
            flex-shrink: 0; /* 防止被压缩 */
        }
        .ig-btn:hover { background: rgba(0,0,0,0.05); color: #000; transform: scale(1.05); }
        .ig-btn.active { background: #3b82f6; color: white; box-shadow: 0 4px 10px rgba(59, 130, 246, 0.4); }
        
        /* 分隔线 */
        .ig-divider { width: 1px; height: 24px; background: #e5e7eb; margin: 0 5px; }

        /* 返回按钮单独样式 */
        .ig-back-btn {
            position: fixed; top: 20px; left: 30px;
            width: 48px; height: 48px;
            background: white; box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            z-index: 2147483647;
        }

        /* 图片列表 */
        .ig-gallery-list {
            width: 100%;
            padding-top: 0; padding-bottom: 100px;
            display: flex; flex-direction: column; align-items: center;
            will-change: transform;
        }

        /* 图片卡片通用 */
        .ig-card {
            position: relative;
            background: #fff;
            overflow: hidden;
            display: flex; align-items: center; justify-content: center;
            min-height: 300px; /* 骨架屏最小高度 */
            transition: all 0.3s ease;
        }

        /* === 模式 1: 标准模式 (Standard) === */
        .ig-gallery-list.mode-standard { padding-top: 80px; gap: 30px; } /* 间距 */
        .ig-gallery-list.mode-standard .ig-card {
            width: 90%; max-width: 1000px;
            border-radius: 12px;
            box-shadow: 0 10px 30px -10px rgba(0,0,0,0.15);
        }

        /* === 模式 2: Webtoon模式 (Immersive) === */
        .ig-gallery-list.mode-webtoon { padding-top: 0; gap: 0; } /* 无间距 */
        .ig-gallery-list.mode-webtoon .ig-card {
            width: 100%; max-width: 100%; /* 全屏宽 */
            border-radius: 0;
            box-shadow: none;
        }

        /* 图片本身 */
        .ig-image {
            width: 100%; height: auto; display: block;
            opacity: 0; transition: opacity 0.4s ease-out;
        }
        .ig-image.loaded { opacity: 1; }

        /* 骨架屏加载态 */
        .ig-skeleton {
            position: absolute; inset: 0;
            background: #f3f4f6;
            display: flex; align-items: center; justify-content: center;
        }
        .ig-skeleton::after {
            content: "Loading..."; color: #9ca3af; font-size: 14px;
            animation: pulse 1.5s infinite;
        }
        @keyframes pulse { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
        .ig-error { color: #ef4444; font-size: 14px; padding: 20px; text-align: center; }

        /* 页码指示器 */
        .ig-counter {
            position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.7); color: white;
            padding: 6px 18px; border-radius: 30px;
            font-size: 14px; font-weight: 500; pointer-events: none;
            backdrop-filter: blur(4px); z-index: 2147483647;
        }

        /* 入口按钮 */
        #ig-entry-btn {
            position: fixed; bottom: 30px; right: 30px;
            width: 60px; height: 60px;
            background: #3b82f6; color: white; border-radius: 50%;
            border: none; cursor: pointer; z-index: 9999;
            box-shadow: 0 8px 25px rgba(59, 130, 246, 0.5);
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
            display: flex; align-items: center; justify-content: center;
        }
        #ig-entry-btn:hover { transform: scale(1.1) rotate(90deg); }
    `);

    // ==========================================
    // 3. 智能下载管理器 (Smart Load Manager)
    // ==========================================
    class ImageLoader {
        constructor(concurrency) {
            this.concurrency = concurrency;
            this.activeDownloads = 0;
            // pendingSet 仅存储当前视口内(Intersecting)且未加载的图片索引
            this.pendingSet = new Set();
            this.tasks = new Map(); // 存储 index -> task info
        }

        // 当图片进入视口
        enqueue(index, taskFn) {
            if (!this.tasks.has(index)) {
                this.tasks.set(index, { status: 'idle', run: taskFn });
            }
            const task = this.tasks.get(index);
            
            // 如果已经下载完或正在下载，忽略
            if (task.status !== 'idle') return;

            // 加入等待队列
            this.pendingSet.add(index);
            this.processQueue();
        }

        // 当图片离开视口 (关键修复：快速滑动时取消等待)
        dequeue(index) {
            // 只有当任务还在 idle 状态（未开始下载）时，才从队列移除
            // 这意味着如果你滑得太快，图片还没开始下就被移出队列了，节省了带宽
            if (this.pendingSet.has(index)) {
                this.pendingSet.delete(index);
            }
        }

        // 处理队列
        async processQueue() {
            if (this.activeDownloads >= this.concurrency) return;
            if (this.pendingSet.size === 0) return;

            // === 核心优化：始终优先下载 index 最小的（即屏幕上方）图片 ===
            // 将 Set 转为数组并排序，确保视觉顺序
            const sortedIndices = Array.from(this.pendingSet).sort((a, b) => a - b);
            const nextIndex = sortedIndices[0];

            // 移除队列，标记开始
            this.pendingSet.delete(nextIndex);
            const task = this.tasks.get(nextIndex);
            
            if (task && task.status === 'idle') {
                this.activeDownloads++;
                task.status = 'loading';

                try {
                    await task.run();
                    task.status = 'loaded';
                } catch (e) {
                    console.error(e);
                    task.status = 'error';
                } finally {
                    this.activeDownloads--;
                    // 递归处理下一个
                    this.processQueue();
                }
            }
        }
        
        reset() {
            this.activeDownloads = 0;
            this.pendingSet.clear();
            this.tasks.clear();
        }
    }

    const loader = new ImageLoader(CONFIG.CONCURRENCY_LIMIT);

    // ==========================================
    // 4. 业务逻辑 (Gallery Logic)
    // ==========================================
    class AlistGallery {
        constructor() {
            this.images = [];
            this.active = false;
            this.container = null;
            this.lastScrollPos = 0;
            // 默认模式：Standard
            this.currentMode = localStorage.getItem('ig_mode') || 'mode-standard';
        }

        init() {
            const check = () => {
                if (!document.querySelector('#ig-entry-btn')) this.scan();
            };
            // 简单的轮询检测，适应 SPA 页面切换
            setInterval(check, 1000);
            check();
        }

        scan() {
            const links = Array.from(document.querySelectorAll('a'));
            this.images = links.map(link => {
                const nameEl = link.querySelector('.name') || link;
                const name = nameEl.textContent.trim();
                const urlObj = new URL(link.href, window.location.origin);
                if (CONFIG.EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext))) {
                    return {
                        name: name,
                        path: decodeURIComponent(urlObj.pathname),
                        element: link
                    };
                }
                return null;
            }).filter(Boolean);

            if (this.images.length >= CONFIG.TRIGGER_COUNT) {
                this.createEntryButton();
            }
        }

        createEntryButton() {
            const btn = document.createElement('button');
            btn.id = 'ig-entry-btn';
            btn.innerHTML = `<svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`;
            btn.onclick = () => this.open();
            document.body.appendChild(btn);
        }

        open() {
            if (this.active) return;
            this.active = true;
            this.lastScrollPos = window.scrollY;
            document.body.classList.add('ig-lock');
            loader.reset(); // 重置下载器状态

            // 构建 DOM
            const html = `
                <button class="ig-btn ig-back-btn" title="退出">
                    <svg width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M15 19l-7-7 7-7"></path></svg>
                </button>

                <div id="ig-container">
                    <div class="ig-toolbar">
                        <button class="ig-btn ${this.currentMode === 'mode-standard' ? 'active' : ''}" data-mode="mode-standard" title="标准模式">
                            <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                        </button>
                        <div class="ig-divider"></div>
                        <button class="ig-btn ${this.currentMode === 'mode-webtoon' ? 'active' : ''}" data-mode="mode-webtoon" title="Webtoon 沉浸模式">
                            <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
                        </button>
                    </div>
                    
                    <div class="ig-gallery-list ${this.currentMode}">
                        ${this.images.map((img, idx) => `
                            <div class="ig-card" data-idx="${idx}" data-path="${img.path}">
                                <div class="ig-skeleton"></div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="ig-counter">1 / ${this.images.length}</div>
                </div>
            `;

            const wrapper = document.createElement('div');
            wrapper.innerHTML = html;
            // 先添加 Back Button，再添加 Container
            document.body.appendChild(wrapper.querySelector('.ig-back-btn'));
            document.body.appendChild(wrapper.querySelector('#ig-container'));
            
            this.container = document.getElementById('ig-container');
            
            // 绑定事件
            this.bindEvents();
            this.setupIntersectionObserver();

            // 动画显示
            requestAnimationFrame(() => this.container.classList.add('active'));
        }

        close() {
            this.active = false;
            document.body.classList.remove('ig-lock');
            
            const btn = document.querySelector('.ig-back-btn');
            if (btn) btn.remove();
            
            if (this.container) {
                this.container.classList.remove('active');
                setTimeout(() => this.container.remove(), 250);
            }
            window.scrollTo(0, this.lastScrollPos);
        }

        // 核心：建立 IntersectionObserver 并连接到 Loader
        setupIntersectionObserver() {
            const cards = this.container.querySelectorAll('.ig-card');
            
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    const card = entry.target;
                    const idx = parseInt(card.dataset.idx);

                    if (entry.isIntersecting) {
                        // === 进入视口：尝试加入队列 ===
                        loader.enqueue(idx, () => this.fetchAndLoadImage(card, idx));
                        
                        // 更新页码
                        this.container.querySelector('.ig-counter').innerText = `${idx + 1} / ${this.images.length}`;
                    } else {
                        // === 离开视口：从等待队列移除 ===
                        // 这就是解决"快速滑动加载以前图片"的关键
                        loader.dequeue(idx);
                    }
                });
            }, {
                root: this.container,
                rootMargin: '50% 0px 50% 0px', // 预加载上下半屏，不再一次性加载太远
                threshold: 0.01
            });

            cards.forEach(card => observer.observe(card));
        }

        async fetchAndLoadImage(card, idx) {
            const path = card.dataset.path;
            const token = localStorage.getItem('token') || localStorage.getItem('alist_token') || '';

            try {
                // 1. 获取直链
                const res = await fetch(CONFIG.API_PATH, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': token },
                    body: JSON.stringify({ path: path, password: "" })
                });
                const data = await res.json();
                const url = data?.data?.url;
                if (!url) throw new Error("URL invalid");

                // 2. 加载图片
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.src = url;
                    img.className = 'ig-image';
                    
                    img.onload = () => {
                        const skeleton = card.querySelector('.ig-skeleton');
                        if (skeleton) skeleton.remove();
                        card.appendChild(img);
                        // Webtoon 模式下图片高度自适应，去除最小高度限制
                        card.style.minHeight = 'auto';
                        requestAnimationFrame(() => img.classList.add('loaded'));
                        resolve();
                    };
                    
                    img.onerror = () => {
                        card.innerHTML = `<div class="ig-error">加载失败</div>`;
                        reject(new Error("Image load error"));
                    };
                });
            } catch (err) {
                card.innerHTML = `<div class="ig-error">API 错误</div>`;
                throw err;
            }
        }

        bindEvents() {
            // 退出
            document.querySelector('.ig-back-btn').addEventListener('click', () => this.close());
            
            // 模式切换
            const toolbar = this.container.querySelector('.ig-toolbar');
            const list = this.container.querySelector('.ig-gallery-list');
            
            toolbar.addEventListener('click', (e) => {
                const btn = e.target.closest('.ig-btn');
                if (!btn) return;

                const mode = btn.dataset.mode;
                if (mode) {
                    this.currentMode = mode;
                    localStorage.setItem('ig_mode', mode); // 记住选择
                    
                    list.className = `ig-gallery-list ${mode}`;
                    
                    toolbar.querySelectorAll('.ig-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }
            });

            // 键盘
            const onKey = (e) => {
                if (!this.active) return document.removeEventListener('keydown', onKey);
                if (e.key === 'Escape') this.close();
            };
            document.addEventListener('keydown', onKey);
        }
    }

    // 启动
    const app = new AlistGallery();
    app.init();
    console.log('Alist Gallery v9.0 Focus Started');

})();
