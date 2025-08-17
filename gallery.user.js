// ==UserScript==
// @name         Alist 沉浸式图廊 (Immersive Gallery) v12.2 Zenith
// @namespace    http://tampermonkey.net/
// @version      12.2
// @description  v12.2 "Zenith" - The final masterpiece. This version achieves perfection with a flawless off-screen Aura Gradient, meticulously timed animations, and robust, cross-browser optimized performance, representing the zenith of our collaborative development journey.
// @author       Your Name & AI
// @license      MIT
// @include      /^https?://127\.0\.0\.1:5244/.*$/
// @include      /^https?://192\.168\.\d{1,3}\.\d{1,3}:5244/.*$/
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBmaWxsPSIjOGFjNmZmIiBkPSJNMjIgMTZWNGEyIDIgMCAwIDAtMi0ySDhNMyA2djEyYTIgMiAwIDAgMCAyIDJoMTJhMiAyIDAgMCAwIDItMlY4bC04LTRINWExIDEgMCAwIDEgMC0yaDEwVjRoNFYybC00IDRIM2EyIDIgMCAwIDAtMiAydjE0YTIgMiAwIDAgMCAyIDJoMTRhMiAyIDAgMCAwIDItMlY2aC0ydjEwaC04bC0yLTItMiAySDV2LTRoN2wtMy0zSDVhMSAxIDAgMCAxIDAtMmgzLjE3MmwzIDNIMTlWNkwzIDZtMi0yaDEwbDMgM0g1YTEgMSAwIDAgMSAwLTJtNSA5YTEuMSAxLjUgMCAxIDEgMC0zYTEuNSAxLjUgMCAwIDEgMCAzWiIvPjwvc3ZnPg==
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Alist Gallery] Script v12.2 (Zenith) is running!');

    // --- 配置项 ---
    const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', 'avif', '.svg', '.JPG', '.jxl', '.JXL'];
    const TRIGGER_IMAGE_COUNT = 5;
    const GALLERY_BUTTON_ID = 'immersive-gallery-trigger-btn';
    const GALLERY_CONTAINER_ID = 'immersive-gallery-container';
    const API_LINK_ENDPOINT = '/api/fs/link';
    const API_GET_ENDPOINT = '/api/fs/get';
    const LARGE_FILE_THRESHOLD_MB = 10;
    const MAX_CONCURRENT_DOWNLOADS = 3;
    const LOAD_RETRY_COUNT = 2;

    let imageList = [];
    let loadObserver = null;
    let animationObserver = null;
    let galleryState = { isActive: false, lastScrollY: 0, controller: null };

    // --- [v12.2] 样式最终版: 优化背景和动画时序 ---
    GM_addStyle(`
        :root { --ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1); }
        body.gallery-is-active { overflow: hidden; }
        body.gallery-is-active > #root { position: fixed; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; pointer-events: none; }

        #${GALLERY_CONTAINER_ID} {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 9999;
            overflow: hidden; /* 防止伪元素溢出 */
            opacity: 0; transition: opacity 0.5s ease-in-out;
            background-color: #f0f2f5;
        }
        html[data-theme="dark"] #${GALLERY_CONTAINER_ID} { background-color: #1a202c; }

        #${GALLERY_CONTAINER_ID} .gallery-scroll-container {
             width: 100%; height: 100%; overflow-y: auto;
        }

        /* [v12.2] Aura Gradient 最终版 */
        #${GALLERY_CONTAINER_ID}::before {
            content: ''; position: fixed;
            top: 50%; left: 50%;
            width: 200vmax; height: 200vmax; /* 使用vmax确保覆盖所有屏幕比例 */
            z-index: -1;
            --c1: #f0f8ff; --c2: #fff0f5; --c3: #f5fffa; --c4: #fffacd;
            background: conic-gradient(from 0deg at 75% -50%, var(--c1), var(--c2), var(--c3), var(--c4), var(--c1)); /* 中心点在屏幕外 */
            animation: aura-rotation 28s linear infinite;
            transform: translate(-50%, -50%); /* 确保旋转中心是伪元素的中心 */
        }
        @keyframes aura-rotation { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }

        /* --- 通用组件样式 --- */
        #${GALLERY_CONTAINER_ID}.gallery-active { opacity: 1; }
        #${GALLERY_BUTTON_ID}{position:fixed;bottom:25px;right:25px;width:55px;height:55px;background:white;color:#333;border-radius:50%;border:none;cursor:pointer;z-index:9998;display:flex;justify-content:center;align-items:center;box-shadow:0 6px 20px rgba(0,0,0,.15);transition:transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .2s;opacity:0;transform:scale(0);animation:fadeIn .5s .2s forwards}#${GALLERY_BUTTON_ID}:hover{transform:scale(1.15);box-shadow:0 8px 25px rgba(0,0,0,.2)}@keyframes fadeIn{to{opacity:1;transform:scale(1)}}#${GALLERY_BUTTON_ID} svg{width:28px;height:28px;color:#8ec5fc;}
        .gallery-back-btn,.gallery-toolbar{background:rgba(255,255,255,.5);backdrop-filter:blur(12px) saturate(180%);-webkit-backdrop-filter:blur(12px) saturate(180%);border:1px solid rgba(0,0,0,.08);color:#333;transition:all .3s ease}.gallery-back-btn{position:fixed;top:20px;left:20px;width:44px;height:44px;border-radius:50%;z-index:10001;display:flex;justify-content:center;align-items:center;cursor:pointer}.gallery-back-btn:hover{background:rgba(255,255,255,.7);transform:scale(1.1)}.gallery-toolbar{position:fixed;top:20px;right:20px;z-index:10001;display:flex;gap:10px;padding:8px;border-radius:22px;opacity:0;visibility:hidden;transform:translateY(-20px)}#${GALLERY_CONTAINER_ID}:hover .gallery-toolbar{opacity:1;visibility:visible;transform:translateY(0)}.toolbar-btn{width:36px;height:36px;border:none;background:transparent;color:#333;cursor:pointer;border-radius:50%;display:flex;justify-content:center;align-items:center;transition:background-color .2s, color .2s}.toolbar-btn:hover{background:rgba(0,0,0,.05)}.toolbar-btn.active{background:#8ec5fc;color:#fff !important}

        .gallery-image-list { display: flex; flex-direction: column; align-items: center; gap: 40px; padding: 10vh 0; }
        .gallery-card { width: 90%; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; position: relative; background-color: rgba(255,255,255,0.1); opacity: 0; transform: translateY(30px); will-change: opacity, transform; transition: opacity 0.6s var(--ease-out-quart), transform 0.6s var(--ease-out-quart), aspect-ratio 0.4s ease-out; aspect-ratio: 3 / 4; min-height: 300px; }
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
    `);

    const DownloadManager = {
        queue: [], activeDownloads: 0, token: null,
        initialize(token) { this.token = token; this.queue = []; this.activeDownloads = 0; },
        schedule(card) { if (!card.dataset.path || this.queue.some(item => item.card === card)) return; this.queue.push({ card, priority: 9999 }); this.processQueue(); },
        reprioritizeQueue() { const vh = window.innerHeight; const nq = []; document.querySelectorAll('.gallery-card[data-path]').forEach(c => { const r = c.getBoundingClientRect(); if (r.top < vh && r.bottom > 0) nq.push({ card: c, priority: r.top }); }); nq.sort((a, b) => a.priority - b.priority); this.queue = nq; this.processQueue(); },
        async processQueue() { if (document.querySelector('.gallery-card[data-is-large="true"][data-loading="true"]')) return; for (const item of this.queue) { if (this.activeDownloads >= MAX_CONCURRENT_DOWNLOADS) break; const card = item.card; if (!card.dataset.path || card.dataset.loading === 'true') continue; this.queue = this.queue.filter(i => i.card !== card); this.loadImageForCard(card, card.dataset.path); } },
        async loadImageForCard(card, path) {
            const { signal } = galleryState.controller; card.dataset.loading = 'true'; this.activeDownloads++;
            try {
                const metaRes = await fetch(API_GET_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: this.token }, body: JSON.stringify({ path }), signal });
                if (!metaRes.ok) throw new Error(`API Get failed: ${metaRes.status}`);
                const metaData = await metaRes.json(); const totalSize = metaData.data.size;
                const isLargeFile = (totalSize / (1024 * 1024)) > LARGE_FILE_THRESHOLD_MB; card.dataset.isLarge = isLargeFile;
                if (isLargeFile && this.activeDownloads > 1) { card.dataset.loading = 'false'; this.activeDownloads--; this.schedule(card); return; }
                let lastError = null;
                for (let attempt = 1; attempt <= LOAD_RETRY_COUNT + 1; attempt++) {
                    try { await this.fetchAndDecodeImage(card, path, totalSize); lastError = null; break; }
                    catch (error) { lastError = error; if (error.name === 'AbortError') break; console.warn(`[Alist Gallery] Attempt ${attempt} failed for ${path}:`, error); if (attempt <= LOAD_RETRY_COUNT) await new Promise(resolve => setTimeout(resolve, 500 * attempt)); }
                }
                if (lastError) throw lastError;
                card.removeAttribute('data-path');
            } catch (error) {
                if (error.name !== 'AbortError') { console.error(`[Alist Gallery] Failed to load image for path ${path}.`, error); const placeholder = card.querySelector('.card-placeholder'); if(placeholder) placeholder.textContent = '加载失败'; }
                else { console.log(`[Alist Gallery] Load cancelled for path ${path}.`); }
            } finally { const progress = card.querySelector('.progress-indicator'); if(progress) progress.classList.remove('visible'); card.dataset.loading = 'false'; this.activeDownloads--; this.processQueue(); }
        },
        async fetchAndDecodeImage(card, path, totalSize) {
            const { signal } = galleryState.controller;
            const progressIndicator = card.querySelector('.progress-indicator'), progressCircle = card.querySelector('.progress-circle-bar'), progressText = card.querySelector('.progress-text');
            if (!progressIndicator || !progressCircle || !progressText) throw new Error("Progress elements not found.");
            const radius = progressCircle.r.baseVal.value, circumference = 2 * Math.PI * radius;
            const updateProgress = (p) => { progressCircle.style.strokeDashoffset = circumference-(p/100)*circumference; progressText.textContent = `${Math.floor(p)}%`; };
            progressIndicator.classList.add('visible'); updateProgress(0);
            const linkRes = await fetch(API_LINK_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: this.token }, body: JSON.stringify({ path }), signal });
            if (!linkRes.ok) throw new Error(`API Link failed: ${linkRes.status}`);
            const linkData = await linkRes.json(); const signedUrl = linkData?.data?.url; if (!signedUrl) throw new Error("Signed URL not found.");
            const response = await fetch(signedUrl, { signal }); if (!response.body) throw new Error("Response body not readable.");
            const reader = response.body.getReader(); let loadedSize = 0, chunks = [];
            while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); loadedSize += value.length; updateProgress((loadedSize / totalSize) * 100); }
            const blob = new Blob(chunks);
            await this.performVisualLoad(card, blob);
        },
        async performVisualLoad(card, blob) {
            let imageBitmap;
            try {
                if (typeof createImageBitmap !== 'undefined') { imageBitmap = await createImageBitmap(blob); }
                else { const objectURL = URL.createObjectURL(blob); try { const tempImg = new Image(); tempImg.src = objectURL; await tempImg.decode(); imageBitmap = tempImg; } finally { URL.revokeObjectURL(objectURL); }}
            } catch(e) { console.error("Image decoding/bitmap creation failed:", e); throw e; }
            card.style.aspectRatio = imageBitmap.width / imageBitmap.height;
            const imageWrapper = document.createElement('div'); imageWrapper.className = 'gallery-image-wrapper';
            const thumbCanvas = document.createElement('canvas'); const thumbCtx = thumbCanvas.getContext('2d');
            thumbCanvas.width = 50; thumbCanvas.height = 50 / (imageBitmap.width / imageBitmap.height);
            thumbCtx.drawImage(imageBitmap, 0, 0, thumbCanvas.width, thumbCanvas.height);
            const blurOverlay = new Image(); blurOverlay.className = 'blur-overlay';
            blurOverlay.src = thumbCanvas.toDataURL('image/webp', 0.1); imageWrapper.appendChild(blurOverlay);
            const finalImage = document.createElement('canvas'); finalImage.className = 'gallery-image';
            finalImage.width = imageBitmap.width; finalImage.height = imageBitmap.height;
            finalImage.getContext('2d').drawImage(imageBitmap, 0, 0);
            if (typeof imageBitmap.close === 'function') imageBitmap.close();
            imageWrapper.appendChild(finalImage);
            card.appendChild(imageWrapper);
            animationObserver.observe(finalImage);
        }
    };
    function debounce(func, wait) { let t; return function(...a) { clearTimeout(t); t = setTimeout(() => func.apply(this, a), wait); }; }
    function scanForImages() {
        const links = Array.from(document.querySelectorAll("a.list-item"));
        const foundImages = links.map(link => {
            const nameEl = link.querySelector("p.name"); if (!nameEl) return null;
            const text = nameEl.textContent.trim(); const isImage = IMAGE_EXTENSIONS.some(ext => text.toLowerCase().endsWith(ext.toLowerCase()));
            const rawPath = decodeURIComponent(new URL(link.href).pathname);
            return isImage ? { name: text, path: rawPath } : null;
        }).filter(Boolean);
        const btn = document.getElementById(GALLERY_BUTTON_ID);
        if (foundImages.length >= TRIGGER_IMAGE_COUNT) { imageList = foundImages; if (!btn) createGalleryTriggerButton(); }
        else { imageList = []; if (btn) btn.remove(); }
    }
    function createGalleryTriggerButton() {
        const button = document.createElement("button"); button.id = GALLERY_BUTTON_ID; button.title = "进入沉浸式图廊";
        button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
        button.addEventListener("click", launchGallery); document.body.appendChild(button);
    }
    function launchGallery() {
        if (galleryState.isActive) return;
        galleryState.isActive = true; galleryState.lastScrollY = window.scrollY; galleryState.controller = new AbortController();
        document.body.classList.add('gallery-is-active');
        const galleryContainer = document.createElement("div"); galleryContainer.id = GALLERY_CONTAINER_ID; document.body.appendChild(galleryContainer);
        // [v12.2] 插入滚动容器
        galleryContainer.innerHTML = `<div class="gallery-scroll-container">
            <button class="gallery-back-btn" title="返回 (Esc)"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg></button>
            <div class="gallery-toolbar"><button class="toolbar-btn active" data-mode="mode-standard" title="标准模式"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2" /></svg></button><button class="toolbar-btn" data-mode="mode-webtoon" title="Webtoon模式"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></button><button class="toolbar-btn" data-mode="mode-full-width" title="全屏宽度"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12H2m4-4-4 4 4 4M18 8l4 4-4 4"/></svg></button></div>
            <div class="gallery-image-list mode-standard"></div>
        </div>`;
        const imageListContainer = galleryContainer.querySelector(".gallery-image-list");
        imageList.forEach(image => {
            const card = document.createElement("div"); card.className = "gallery-card"; card.dataset.path = image.path;
            card.innerHTML = `<div class="card-placeholder"><div class="progress-indicator"><svg width="80" height="80" viewBox="0 0 80 80"><circle class="progress-circle-bg" stroke-width="6" cx="40" cy="40" r="35"></circle><circle class="progress-circle-bar" stroke-width="6" cx="40" cy="40" r="35"></circle></svg><span class="progress-text">0%</span></div></div><div class="card-filename">${image.name}</div>`;
            imageListContainer.appendChild(card);
        });
        requestAnimationFrame(() => galleryContainer.classList.add("gallery-active"));
        setupEventListeners(); setupLazyLoading();
    }
    function closeGallery() {
        if (!galleryState.isActive) return;
        if (galleryState.controller) galleryState.controller.abort();
        DownloadManager.queue = []; galleryState.isActive = false;
        const galleryContainer = document.getElementById(GALLERY_CONTAINER_ID);
        if (galleryContainer) {
            galleryContainer.classList.remove("gallery-active");
            galleryContainer.addEventListener("transitionend", () => { galleryContainer.remove(); document.body.classList.remove('gallery-is-active'); window.scrollTo(0, galleryState.lastScrollY); }, { once: true });
        }
        document.removeEventListener("keydown", handleKeyPress);
        if (loadObserver) loadObserver.disconnect(); if (animationObserver) animationObserver.disconnect();
    }
    function handleKeyPress(e) { if (e.key === "Escape") closeGallery(); }
    function setupEventListeners() {
        document.querySelector(".gallery-back-btn").addEventListener("click", closeGallery);
        document.addEventListener("keydown", handleKeyPress);
        const toolbar = document.querySelector(".gallery-toolbar"), imageListContainer = document.querySelector(".gallery-image-list");
        if (toolbar && imageListContainer) { toolbar.addEventListener("click", e => { const button = e.target.closest(".toolbar-btn"); if (!button) return; const mode = button.dataset.mode; ["mode-standard", "mode-webtoon", "mode-full-width"].forEach(m => imageListContainer.classList.remove(m)); imageListContainer.classList.add(mode); toolbar.querySelectorAll(".toolbar-btn").forEach(btn => btn.classList.remove("active")); button.classList.add("active"); }); }
    }
    function setupLazyLoading() {
        const token = localStorage.getItem('token'); if (!token) { console.warn('[Alist Gallery] Token not found.'); return; }
        DownloadManager.initialize(token);
        const scrollContainer = document.querySelector(".gallery-scroll-container");
        const debouncedReprioritize = debounce(() => DownloadManager.reprioritizeQueue(), 150);
        scrollContainer.addEventListener('scroll', debouncedReprioritize);
        loadObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); DownloadManager.schedule(entry.target); loadObserver.unobserve(entry.target); } });
        }, { root: scrollContainer, rootMargin: '100% 0px' });
        animationObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const imageEl = entry.target;
                    const blurOverlay = imageEl.previousElementSibling;
                    const placeholder = imageEl.closest('.gallery-card').querySelector('.card-placeholder');
                    if (placeholder) placeholder.style.opacity = '0';
                    imageEl.classList.add('is-animating');
                    if (blurOverlay && blurOverlay.classList.contains('blur-overlay')) { blurOverlay.classList.add('is-animating'); }
                    observer.unobserve(imageEl);
                }
            });
        }, { root: scrollContainer, rootMargin: '0px' });
        document.querySelectorAll('.gallery-card').forEach(card => loadObserver.observe(card));
        setTimeout(() => DownloadManager.reprioritizeQueue(), 100);
    }
    const observer = new MutationObserver(() => { setTimeout(() => { if (document.querySelector('.list.viselect-container')) { scanForImages(); } else { const btn = document.getElementById(GALLERY_BUTTON_ID); if (btn) btn.remove(); } }, 500); });
    const rootObserver = new MutationObserver((_, obs) => { const mainContentArea = document.querySelector(".obj-box"); if (mainContentArea) { observer.observe(mainContentArea, { childList: true, subtree: true }); scanForImages(); obs.disconnect(); } });
    rootObserver.observe(document.body, { childList: true, subtree: true });

})();
