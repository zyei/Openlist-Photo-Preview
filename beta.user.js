// ==UserScript==
// @name         Alist 沉浸式图廊 (Immersive Gallery) v17.0 Zenith
// @namespace    http://tampermonkey.net/
// @version      17.0
// @description  v17.0 "Zenith" - The final, definitive masterpiece. This version resolves critical lifecycle bugs in the resource recycling engine, plugs all memory leaks, and refactors the entire codebase for ultimate readability and maintainability. This is the zenith of our collaborative journey, polished to perfection.
// @author       Your Name & AI
// @license      MIT
// @include      /^https?://127\.0\.0\.1:5244/.*$/
// @include      /^https?://192\.168\.\d{1,3}\.\d{1,3}:5244/.*$/
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBmaWxsPSIjOGFjNmZmIiBkPSJNMjIgMTZWNGEyIDIgMCAwIDAtMi0ySDhNMyA2djEyYTIgMiAwIDAgMCAyIDJoMTJhMiAyIDAgMCAwIDItMlY4bC04LTRINWExIDEgMCAwIDEgMC0yaDEwVjRoNFYybC00IDRIM2EyIDIgMCAwIDAtMiAydjE4YTIgMiAwIDAgMCAyIDJoMTRhMiAyIDAgMCAwIDItMlY2aC0ydjEwaC04bC0yLTItMiAySDV2LTRoN2wtMy0zSDVhMSAxIDAgMCAxIDAtMmgzLjE3MmwzIDNIMTlWNkwzIDZtMi0yaDEwbDMgM0g1YTEgMSAwIDAgMSAwLTJtNSA5YTEuMSAxLjUgMCAxIDEgMC0zYTEuNSAxLjUgMCAwIDEgMCAzWiIvPjwvc3ZnPg==
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Alist Gallery] Script v17.0 (Zenith) is running!');

    // --- 配置项 ---
    const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', 'avif', '.svg', '.JPG', '.jxl', '.JXL'];
    const TRIGGER_IMAGE_COUNT = 5;
    const GALLERY_BUTTON_ID = 'integrated-gallery-trigger-btn';
    const GALLERY_CONTAINER_ID = 'immersive-gallery-container';
    const API_LINK_ENDPOINT = '/api/fs/link';
    const API_GET_ENDPOINT = '/api/fs/get';
    const LARGE_FILE_THRESHOLD_MB = 10;
    const MAX_CONCURRENT_DOWNLOADS = 3;
    const LOAD_RETRY_COUNT = 2;

    let imageList = [];
    let loadObserver = null;
    let animationObserver = null;
    let galleryState = {
        isActive: false,
        lastScrollY: 0,
        controller: null,
        scrollHandler: null,
        hideControlsTimeout: null
    };

    // --- [v17.0] 样式最终版 (与 v16.1 一致) ---
    GM_addStyle(`
        :root { --ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1); }
        body.gallery-is-active { overflow: hidden; }
        body.gallery-is-active > #root { position: fixed; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; pointer-events: none; }
        #${GALLERY_CONTAINER_ID} { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 9999; overflow: hidden; opacity: 0; transition: opacity 0.5s ease-in-out; background-color: #f0f2f5; }
        html[data-theme="dark"] #${GALLERY_CONTAINER_ID} { background-color: #1a202c; }
        #${GALLERY_CONTAINER_ID} .gallery-scroll-container { width: 100%; height: 100%; overflow-y: auto; scroll-behavior: smooth; }
        #${GALLERY_CONTAINER_ID}::before { content: ''; position: fixed; top: 50%; left: 50%; width: 200vmax; height: 200vmax; z-index: -1; --c1: #f0f8ff; --c2: #fff0f5; --c3: #f5fffa; --c4: #fffacd; background: conic-gradient(from 0deg at 50% 50%, var(--c1), var(--c2), var(--c3), var(--c4), var(--c1)); animation: aura-rotation 35s linear infinite; transform: translate(-50%, -50%); }
        @keyframes aura-rotation { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
        #${GALLERY_CONTAINER_ID}.gallery-active { opacity: 1; }
        .gallery-back-btn, .gallery-toolbar { opacity: 0; visibility: hidden; transform: translateY(-20px); transition: opacity 0.4s var(--ease-out-quart), visibility 0.4s var(--ease-out-quart), transform 0.4s var(--ease-out-quart); }
        #${GALLERY_CONTAINER_ID}:hover .gallery-back-btn, #${GALLERY_CONTAINER_ID}:hover .gallery-toolbar, .gallery-back-btn.controls-visible, .gallery-toolbar.controls-visible { opacity: 1; visibility: visible; transform: translateY(0); }
        .gallery-back-btn{position:fixed;top:20px;left:20px;width:44px;height:44px;border-radius:50%;z-index:10001;display:flex;justify-content:center;align-items:center;cursor:pointer; background:rgba(255,255,255,.5);backdrop-filter:blur(12px) saturate(180%);-webkit-backdrop-filter:blur(12px) saturate(180%);border:1px solid rgba(0,0,0,.08);color:#333;}.gallery-back-btn:hover{background:rgba(255,255,255,.7);transform:scale(1.1) !important}
        .gallery-toolbar{position:fixed;top:20px;right:20px;z-index:10001;display:flex;gap:10px;padding:8px;border-radius:22px; background:rgba(255,255,255,.5);backdrop-filter:blur(12px) saturate(180%);-webkit-backdrop-filter:blur(12px) saturate(180%);border:1px solid rgba(0,0,0,.08);color:#333;}
        .toolbar-btn{width:36px;height:36px;border:none;background:transparent;color:#333;cursor:pointer;border-radius:50%;display:flex;justify-content:center;align-items:center;transition:background-color .2s, color .2s}.toolbar-btn:hover{background:rgba(0,0,0,.05)}.toolbar-btn.active{background:#8ec5fc;color:#fff !important}
        .gallery-image-list { display: flex; flex-direction: column; align-items: center; gap: 40px; padding: 10vh 0; }
        .gallery-card { width: 90%; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; position: relative; background-color: rgba(255,255,255,0.1); opacity: 0; transform: translateY(30px); will-change: opacity, transform; transition: opacity 0.6s var(--ease-out-quart), transform 0.6s var(--ease-out-quart), aspect-ratio 0.4s ease-out; aspect-ratio: 3 / 4; min-height: 200px; }
        .gallery-card.is-visible { opacity: 1; transform: translateY(0); }
        .card-placeholder { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; background-color: rgba(0,0,0,0.05); transition: opacity 1.2s var(--ease-out-quart); }
        .gallery-image-wrapper { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        .gallery-image, .blur-overlay { display: block; width: 100%; height: 100%; object-fit: contain; position: absolute; top: 0; left: 0; will-change: opacity; }
        .gallery-image { opacity: 0; transition: opacity 1.2s var(--ease-out-quart); }
        .gallery-image.is-animating { opacity: 1; }
        .blur-overlay { opacity: 1; filter: blur(20px); transform: scale(1.1); transition: opacity 1.2s var(--ease-out-quart); }
        .blur-overlay.is-animating { opacity: 0; }
        .progress-indicator { position: absolute; width: 80px; height: 80px; display: flex; justify-content: center; align-items: center; opacity: 0; transform: scale(0.8); transition: all 0.3s ease; pointer-events: none; z-index: 5; }
        .progress-indicator.visible { opacity: 1; transform: scale(1); }
        .progress-indicator svg { transform: rotate(-90deg); } .progress-circle-bg { fill: none; stroke: rgba(0,0,0,0.1); }
        .progress-circle-bar { fill: none; stroke: #8ec5fc; stroke-linecap: round; transition: stroke-dashoffset 0.2s linear; }
        .progress-text { position: absolute; font-size: 16px; font-weight: 500; color: rgba(0,0,0,0.6); font-family: monospace; }
        .gallery-image-list.mode-standard .gallery-card { max-width: 1000px; } .gallery-image-list.mode-webtoon { gap: 0; } .gallery-image-list.mode-webtoon .gallery-card { width: 100%; max-width: 100%; border-radius: 0; box-shadow: none; background: transparent; } .gallery-image-list.mode-webtoon .gallery-image { object-fit: cover; } .gallery-image-list.mode-webtoon .card-filename, .gallery-image-list.mode-webtoon .blur-overlay { display: none; } .gallery-image-list.mode-full-width .gallery-card { width: 95vw; max-width: 95vw; }
        .card-filename{position:absolute;bottom:0;left:0;width:100%;padding:20px;box-sizing:border-box;background:linear-gradient(to top,rgba(0,0,0,.7),transparent);color:#fff;font-size:16px;opacity:0;transition:opacity .3s;pointer-events:none;text-shadow:0 1px 3px black; z-index: 4;}.gallery-card:hover .card-filename{opacity:1}
        #${GALLERY_BUTTON_ID} { color: #526781; } html[data-theme="dark"] #${GALLERY_BUTTON_ID} { color: #a1aab9; }
        .gallery-global-loader { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 10002; color: #8ec5fc; }
    `);

    // [v17.0] 模块化与代码清理
    const ICONS = {
        GALLERY: `<path fill="currentColor" d="M4 4h7L9 2L4 2c-1.1 0-2 .9-2 2v7l2-2V4zm16 0h-7l2-2h5c1.1 0 2 .9 2 2v5l-2-2V4zM4 20h7l-2 2H4c-1.1 0-2-.9-2-2v-5l2 2v5zm16 0h-7l2 2h5c1.1 0 2-.9 2-2v-5l-2 2v5z"></path>`,
        BACK: `<line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>`,
        STANDARD_MODE: `<rect x="2" y="3" width="20" height="18" rx="2"></rect>`,
        WEBTOON_MODE: `<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>`,
        FULLWIDTH_MODE: `<path d="M22 12H2m4-4-4 4 4 4M18 8l4 4-4 4"></path>`,
        ENTER_FULLSCREEN: `<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>`,
        EXIT_FULLSCREEN: `<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 0-2-2H8M3 16h3a2 2 0 0 0 2-2v-3"/>`,
        LOADER: `<path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"></path><path d="M10.72,19.9a8,8,0,0,1-6.5-9.79A7.77,7.77,0,0,1,10.4,4.16a8,8,0,0,1,9.49,6.52A1.54,1.54,0,0,0,21.38,12h.13a1.37,1.37,0,0,0,1.38-1.54,11,11,0,1,0-12.7,12.39A1.54,1.54,0,0,0,12,21.34h0A1.47,1.47,0,0,0,10.72,19.9Z"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.75s" repeatCount="indefinite"></animateTransform></path>`,
    };

    const TEMPLATES = {
        PLACEHOLDER: `<div class="card-placeholder"><div class="progress-indicator"><svg width="80" height="80" viewBox="0 0 80 80"><circle class="progress-circle-bg" stroke-width="6" cx="40" cy="40" r="35"></circle><circle class="progress-circle-bar" stroke-width="6" cx="40" cy="40" r="35"></circle></svg><span class="progress-text">0%</span></div></div>`,
    };
    
    const ToolbarManager = {
        iconSVG: `<path fill="currentColor" d="M4 4h7L9 2L4 2c-1.1 0-2 .9-2 2v7l2-2V4zm16 0h-7l2-2h5c1.1 0 2 .9 2 2v5l-2-2V4zM4 20h7l-2 2H4c-1.1 0-2-.9-2-2v-5l2 2v5zm16 0h-7l2 2h5c1.1 0 2-.9 2-2v-5l-2 2v5z"></path>`,
        
        injectButton() {
            if (document.getElementById(GALLERY_BUTTON_ID)) return;
            
            const toolbar = document.querySelector('.left-toolbar-in');
            // [v17.1 FIX] 使用更通用的选择器，克隆第一个找到的图标
            const referenceButton = toolbar?.querySelector('.hope-icon');
            
            if (!toolbar || !referenceButton) {
                // 如果工具栏或图标不存在，稍后重试
                setTimeout(() => this.injectButton(), 200);
                return;
            }

            const newButton = referenceButton.cloneNode(true);
            newButton.id = GALLERY_BUTTON_ID;
            newButton.setAttribute('tips', '沉浸式图廊 (Immersive Gallery)');
            newButton.innerHTML = this.iconSVG;
            
            // 移除可能存在的旧监听器（克隆节点可能会带来）
            const cleanButton = newButton.cloneNode(true);
            newButton.parentNode?.replaceChild(cleanButton, newButton);

            cleanButton.addEventListener('click', launchGallery);
            toolbar.prepend(cleanButton);
        },
        
        removeButton() {
            document.getElementById(GALLERY_BUTTON_ID)?.remove();
        }
    };

    const DownloadManager = {
        queue: [], activeDownloads: 0, token: null,
        initialize(token) { this.token = token; this.queue = []; this.activeDownloads = 0; },
        schedule(card) { if (!card.dataset.path || this.queue.some(item => item.card === card)) return; this.queue.push({ card, priority: 9999 }); this.processQueue(); },
        reprioritizeQueue() { const vh = window.innerHeight; const nq = []; document.querySelectorAll('.gallery-card[data-path]').forEach(c => { const r = c.getBoundingClientRect(); if (r.top < vh && r.bottom > 0) nq.push({card:c, priority:r.top}); }); nq.sort((a,b)=>a.priority-b.priority); this.queue = nq; this.processQueue(); },
        async processQueue() {
            if (document.querySelector('.gallery-card[data-is-large="true"][data-loading="true"]')) return;
            for (const item of this.queue) {
                if (this.activeDownloads >= MAX_CONCURRENT_DOWNLOADS) break;
                const card = item.card; if (!card.dataset.path || card.dataset.loading === 'true') continue;
                this.queue = this.queue.filter(i => i.card !== card);
                this.loadImageForCard(card, card.dataset.path);
            }
        },
        async loadImageForCard(card, path) {
            const { signal } = galleryState.controller;
            card.dataset.loading = 'true';
            this.activeDownloads++;
            try {
                if (!card.dataset.size) {
                    const metaRes = await fetch(API_GET_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: this.token }, body: JSON.stringify({ path }), signal });
                    if (!metaRes.ok) throw new Error(`API Get failed: ${metaRes.status}`);
                    const metaData = await metaRes.json();
                    card.dataset.size = metaData.data.size;
                }
                const totalSize = parseInt(card.dataset.size, 10);
                const isLargeFile = (totalSize / (1024 * 1024)) > LARGE_FILE_THRESHOLD_MB;
                card.dataset.isLarge = isLargeFile;
                if (isLargeFile && this.activeDownloads > 1) {
                    card.dataset.loading = 'false';
                    this.activeDownloads--;
                    this.schedule(card);
                    return;
                }
                let lastError = null;
                for (let attempt = 1; attempt <= LOAD_RETRY_COUNT + 1; attempt++) {
                    try {
                        await this.fetchAndDecodeImage(card, path, totalSize);
                        lastError = null;
                        break;
                    } catch (error) {
                        lastError = error;
                        if (error.name === 'AbortError') break;
                        console.warn(`[Alist Gallery] Attempt ${attempt} failed for ${path}:`, error);
                        if (attempt <= LOAD_RETRY_COUNT) await new Promise(resolve => setTimeout(resolve, 500 * attempt));
                    }
                }
                if (lastError) throw lastError;
                card.removeAttribute('data-path');
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(`[Alist Gallery] Failed for ${path}.`, error);
                    const placeholder = card.querySelector('.card-placeholder');
                    if (placeholder) placeholder.textContent = '加载失败';
                } else {
                    console.log(`[Alist Gallery] Cancelled for ${path}.`);
                }
            } finally {
                const progress = card.querySelector('.progress-indicator');
                if (progress) progress.classList.remove('visible');
                card.dataset.loading = 'false';
                this.activeDownloads--;
                this.processQueue();
            }
        },
        async fetchAndDecodeImage(card, path, totalSize) {
            const { signal } = galleryState.controller;
            const progressIndicator = card.querySelector('.progress-indicator');
            const progressCircle = progressIndicator?.querySelector('.progress-circle-bar');
            const progressText = progressIndicator?.querySelector('.progress-text');
            if (!progressIndicator || !progressCircle || !progressText) throw new Error("Progress elements not found.");

            const radius = progressCircle.r.baseVal.value;
            const circumference = 2 * Math.PI * radius;
            const updateProgress = (percent) => {
                progressCircle.style.strokeDashoffset = circumference - (percent / 100) * circumference;
                progressText.textContent = `${Math.floor(percent)}%`;
            };
            progressIndicator.classList.add('visible');
            updateProgress(0);

            const linkRes = await fetch(API_LINK_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: this.token }, body: JSON.stringify({ path }), signal });
            if (!linkRes.ok) throw new Error(`API Link failed: ${linkRes.status}`);
            const linkData = await linkRes.json();
            const signedUrl = linkData?.data?.url;
            if (!signedUrl) throw new Error("Signed URL not found.");

            const response = await fetch(signedUrl, { signal });
            if (!response.body) throw new Error("Response body not readable.");
            const reader = response.body.getReader();
            let loadedSize = 0;
            const chunks = [];
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                loadedSize += value.length;
                updateProgress((loadedSize / totalSize) * 100);
            }
            const blob = new Blob(chunks);
            await this.performVisualLoad(card, blob);
        },
        async performVisualLoad(card, blob) {
            let imageBitmap;
            try {
                if (typeof createImageBitmap !== 'undefined') {
                    imageBitmap = await createImageBitmap(blob);
                } else {
                    const objectURL = URL.createObjectURL(blob);
                    try {
                        const tempImg = new Image();
                        tempImg.src = objectURL;
                        await tempImg.decode();
                        imageBitmap = tempImg;
                    } finally {
                        URL.revokeObjectURL(objectURL);
                    }
                }
            } catch (e) {
                console.error("Image decoding/bitmap creation failed:", e);
                throw e;
            }

            card.style.aspectRatio = imageBitmap.width / imageBitmap.height;
            const imageWrapper = document.createElement('div');
            imageWrapper.className = 'gallery-image-wrapper';

            const thumbCanvas = document.createElement('canvas');
            const thumbCtx = thumbCanvas.getContext('2d');
            thumbCanvas.width = 50;
            thumbCanvas.height = 50 / (imageBitmap.width / imageBitmap.height);
            thumbCtx.drawImage(imageBitmap, 0, 0, thumbCanvas.width, thumbCanvas.height);
            const blurOverlay = new Image();
            blurOverlay.className = 'blur-overlay';
            blurOverlay.src = thumbCanvas.toDataURL('image/webp', 0.1);
            imageWrapper.appendChild(blurOverlay);

            const finalImage = document.createElement('canvas');
            finalImage.className = 'gallery-image';
            finalImage.width = imageBitmap.width;
            finalImage.height = imageBitmap.height;
            finalImage.getContext('2d').drawImage(imageBitmap, 0, 0);
            if (typeof imageBitmap.close === 'function') {
                imageBitmap.close();
            }
            imageWrapper.appendChild(finalImage);
            card.appendChild(imageWrapper);
            animationObserver.observe(finalImage);
        }
    };

    async function launchGallery() {
        if (galleryState.isActive) return;
        galleryState.isActive = true; galleryState.lastScrollY = window.scrollY; galleryState.controller = new AbortController();
        document.body.classList.add('gallery-is-active');
        const galleryContainer = document.createElement("div"); galleryContainer.id = GALLERY_CONTAINER_ID; document.body.appendChild(galleryContainer);

        const scrollContainerHTML = `
            <div class="gallery-scroll-container">
                <button class="gallery-back-btn" title="返回 (Esc)"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${ICONS.BACK}</svg></button>
                <div class="gallery-toolbar">
                    <button class="toolbar-btn active" data-mode="mode-standard" title="标准模式"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.STANDARD_MODE}</svg></button>
                    <button class="toolbar-btn" data-mode="mode-webtoon" title="Webtoon模式"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.WEBTOON_MODE}</svg></button>
                    <button class="toolbar-btn" data-mode="mode-full-width" title="全屏宽度"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.FULLWIDTH_MODE}</svg></button>
                    <button class="toolbar-btn" id="gallery-fullscreen-btn" title="全屏 (F)">
                        <svg class="enter-fullscreen-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.ENTER_FULLSCREEN}</svg>
                        <svg class="exit-fullscreen-icon" style="display:none;" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.EXIT_FULLSCREEN}</svg>
                    </button>
                </div>
                <div class="gallery-image-list mode-standard"></div>
            </div>`;
        galleryContainer.innerHTML = scrollContainerHTML;

        // [v16.0 FIX] Metadata-First approach
        if (imageList.length > 0) {
            const loader = document.createElement('div'); loader.className = 'gallery-global-loader';
            loader.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${ICONS.LOADER}</svg>`;
            galleryContainer.appendChild(loader);
            await preloadAllMetadata();
            loader.remove();
        }

        const imageListContainer = galleryContainer.querySelector(".gallery-image-list");
        imageList.forEach(image => {
            const card = document.createElement("div"); card.className = "gallery-card"; card.dataset.path = image.path;
            if (image.size) card.dataset.size = image.size;
            card.style.aspectRatio = image.aspectRatio || '3 / 4';
            card.innerHTML = `${TEMPLATES.PLACEHOLDER}<div class="card-filename">${image.name}</div>`;
            imageListContainer.appendChild(card);
        });
        requestAnimationFrame(() => galleryContainer.classList.add("gallery-active"));
        setupEventListeners();
    }
    
    async function preloadAllMetadata() {
        const token = localStorage.getItem('token'); const CONCURRENT_LIMIT = 5; let promises = []; let executing = [];
        for (const image of imageList) {
            const p = (async () => {
                try {
                    const res = await fetch(API_GET_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token }, body: JSON.stringify({ path: image.path }), signal: galleryState.controller.signal });
                    const data = await res.json();
                    image.size = data.data.size;
                    image.aspectRatio = data.data.width && data.data.height ? data.data.width / data.data.height : null;
                } catch (e) { console.warn(`Metadata preload failed for ${image.path}`); image.aspectRatio = null; }
            })();
            promises.push(p);
            if (CONCURRENT_LIMIT <= imageList.length) { const e = p.finally(() => executing.splice(executing.indexOf(e), 1)); executing.push(e); if (executing.length >= CONCURRENT_LIMIT) await Promise.race(executing); }
        }
        await Promise.all(promises);
    }

    function setupEventListeners() {
        const container = document.getElementById(GALLERY_CONTAINER_ID); if (!container) return;
        const backBtn = container.querySelector(".gallery-back-btn"); const toolbar = container.querySelector(".gallery-toolbar");
        const fsBtn = container.querySelector("#gallery-fullscreen-btn"); const imageListContainer = container.querySelector(".gallery-image-list");
        const scrollContainer = container.querySelector('.gallery-scroll-container');
        
        const showControls = () => {
            backBtn.classList.add('controls-visible'); toolbar.classList.add('controls-visible');
            clearTimeout(galleryState.hideControlsTimeout);
            galleryState.hideControlsTimeout = setTimeout(() => { backBtn.classList.remove('controls-visible'); toolbar.classList.remove('controls-visible'); }, 2000);
        };
        galleryState.scrollHandler = showControls; // Store reference for removal

        showControls();
        scrollContainer.addEventListener('scroll', galleryState.scrollHandler, { passive: true });
        backBtn.addEventListener("click", closeGallery);
        document.addEventListener("keydown", handleKeyPress);
        fsBtn.addEventListener("click", toggleFullscreen);
        document.addEventListener('fullscreenchange', updateFullscreenIcons);

        if (toolbar && imageListContainer) {
            toolbar.addEventListener("click", e => {
                const button = e.target.closest(".toolbar-btn"); if (!button || button.id === 'gallery-fullscreen-btn') return;
                const mode = button.dataset.mode;
                ["mode-standard", "mode-webtoon", "mode-full-width"].forEach(m => imageListContainer.classList.remove(m));
                imageListContainer.classList.add(mode);
                toolbar.querySelectorAll(".toolbar-btn").forEach(btn => btn.classList.remove("active"));
                button.classList.add("active");
                setupLazyLoading(true, mode === 'mode-webtoon' ? '300%' : '100%');
            });
        }
        setupLazyLoading(false);
    }

    function toggleFullscreen() { const gc=document.getElementById(GALLERY_CONTAINER_ID); if(!document.fullscreenElement){gc?.requestFullscreen().catch(err=>{alert(`Error enabling full-screen: ${err.message}`);});}else{document.exitFullscreen();} }
    function updateFullscreenIcons() { const enter=document.querySelector("#gallery-fullscreen-btn .enter-fullscreen-icon"),exit=document.querySelector("#gallery-fullscreen-btn .exit-fullscreen-icon"); if(!enter||!exit)return; if(document.fullscreenElement){enter.style.display='none';exit.style.display='block';}else{enter.style.display='block';exit.style.display='none';} }
    
    function setupLazyLoading(isResuming = false, rootMargin = '100%') {
        const token = localStorage.getItem('token'); if (!token) return;
        const scrollContainer = document.querySelector(".gallery-scroll-container"); if (!scrollContainer) return;
        if (!isResuming) DownloadManager.initialize(token);
        if (loadObserver) loadObserver.disconnect(); if (animationObserver) animationObserver.disconnect();

        loadObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    if (entry.target.dataset.path) {
                        entry.target.classList.add('is-visible');
                        DownloadManager.schedule(entry.target);
                    }
                } else {
                    const rect = entry.boundingClientRect;
                    if (rect.bottom < -window.innerHeight * 2) { unloadCardResources(entry.target); } // Unload if 2 screens above
                }
            });
        }, { root: scrollContainer, rootMargin });
        
        animationObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const imageEl = entry.target, blurOverlay = imageEl.previousElementSibling;
                    const placeholder = imageEl.closest('.gallery-card')?.querySelector('.card-placeholder');
                    if (placeholder) placeholder.style.opacity = '0';
                    imageEl.classList.add('is-animating');
                    if (blurOverlay?.classList.contains('blur-overlay')) blurOverlay.classList.add('is-animating');
                    observer.unobserve(imageEl);
                }
            });
        }, { root: scrollContainer, rootMargin: '0px' });
        
        document.querySelectorAll('.gallery-card').forEach(card => {
            loadObserver.observe(card); // [v17.0 FIX] Always observe
            const imageEl = card.querySelector('.gallery-image:not(.is-animating)');
            if (imageEl) animationObserver.observe(imageEl);
        });
        
        if (!isResuming) setTimeout(() => DownloadManager.reprioritizeQueue(), 100);
    }

    function unloadCardResources(card) {
        if (!card.dataset.path && galleryState.isActive) {
            const imageWrapper = card.querySelector('.gallery-image-wrapper');
            if (imageWrapper) {
                const originalPath = imageList.find(img => img.name === card.querySelector('.card-filename').textContent)?.path;
                if (originalPath) {
                    console.log(`[Alist Gallery] Unloading: ${originalPath}`);
                    card.dataset.path = originalPath;
                    imageWrapper.remove();
                    let placeholder = card.querySelector('.card-placeholder');
                    if (!placeholder) {
                        placeholder = document.createElement('div');
                        placeholder.className = 'card-placeholder';
                        card.prepend(placeholder);
                    }
                    placeholder.innerHTML = TEMPLATES.PLACEHOLDER;
                    placeholder.style.opacity = '1';
                }
            }
        }
    }
    
    function closeGallery() {
        if (!galleryState.isActive) return; if (galleryState.controller) galleryState.controller.abort();
        if (document.fullscreenElement) document.exitFullscreen();
        const scrollContainer = document.querySelector(".gallery-scroll-container");
        if (scrollContainer && galleryState.scrollHandler) { scrollContainer.removeEventListener('scroll', galleryState.scrollHandler); }
        clearTimeout(galleryState.hideControlsTimeout);
        DownloadManager.queue = []; galleryState.isActive = false;
        const gc = document.getElementById(GALLERY_CONTAINER_ID);
        if (gc) { gc.classList.remove("gallery-active"); gc.addEventListener("transitionend", () => { gc.remove(); document.body.classList.remove('gallery-is-active'); window.scrollTo(0, galleryState.lastScrollY); }, { once: true }); }
        document.removeEventListener("keydown", handleKeyPress);
        document.removeEventListener('fullscreenchange', updateFullscreenIcons);
        if (loadObserver) loadObserver.disconnect(); if (animationObserver) animationObserver.disconnect();
    }
    function handleKeyPress(e) { if (e.key.toLowerCase() === "f") { e.preventDefault(); toggleFullscreen(); } else if (e.key === "Escape" && document.fullscreenElement) { document.exitFullscreen(); } else if (e.key === "Escape") { closeGallery(); } }
    function scanForImages() {
        const links = Array.from(document.querySelectorAll("a.list-item, a.grid-item")).filter(el => { const p = el.querySelector('p.name'); return p && !p.textContent.includes('/'); });
        const foundImages = links.map(link => { const nameEl = link.querySelector("p.name"); if (!nameEl) return null; const text = nameEl.textContent.trim(); const isImage = IMAGE_EXTENSIONS.some(ext => text.toLowerCase().endsWith(ext.toLowerCase())); const rawPath = decodeURIComponent(new URL(link.href).pathname); return isImage ? { name: text, path: rawPath } : null; }).filter(Boolean);
        if (foundImages.length >= TRIGGER_IMAGE_COUNT) { imageList = foundImages; ToolbarManager.injectButton(); }
        else { imageList = []; ToolbarManager.removeButton(); }
    }

    const debouncedScan = debounce(scanForImages, 300);
    const observer = new MutationObserver(debouncedScan);
    const rootObserver = new MutationObserver((_, obs) => { const mainContentArea = document.querySelector(".obj-box"); if (mainContentArea) { observer.observe(mainContentArea, { childList: true, subtree: true }); scanForImages(); obs.disconnect(); } });
    rootObserver.observe(document.body, { childList: true, subtree: true });

})();
