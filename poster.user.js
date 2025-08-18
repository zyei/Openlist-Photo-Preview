// ==UserScript==
// @name         Alist Poster Wall v6.0 Epsilon
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  v6.0 "Epsilon" - The definitive, rock-solid release. This version removes the Web Worker in favor of a hyper-reliable, main-thread asynchronous pipeline, completely eliminating all cross-origin and rendering race conditions. Stability and reliability are now absolute.
// @author       Your Name & AI
// @license      MIT
// @include      /^https?://127\.0\.0\.1:5244/.*$/
// @include      /^https?://192\.168\.\d{1,3}\.\d{1,3}:5244/.*$/
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Poster Wall] Script v6.0 (Epsilon) is running!');

    const API_FS_LINK_ENDPOINT = '/api/fs/link';
    const COVER_FILENAME = '000-Cover.jpg';
    const CACHE_KEY_PREFIX = 'alist_poster_cache_v6.0_';
    const MAX_CONCURRENT_SCANS = 3; // 主线程处理，并发数再保守一点

    let intersectionObserver = null;
    let galleryState = {};

    // --- 样式 (不变) ---
    GM_addStyle(`
        :root { --ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1); --ease-in-out-cubic: cubic-bezier(0.645, 0.045, 0.355, 1); }
        .poster-mode-active .hope-c-PJLV-ifZgGH-css { position: relative; z-index: 1; background-color: #f0f2f5; overflow: hidden; }
        html[data-theme="dark"] .poster-mode-active .hope-c-PJLV-ifZgGH-css { background-color: #1a202c; }
        .poster-mode-active .hope-c-PJLV-ifZgGH-css::before { content: ''; position: absolute; top: 50%; left: 50%; width: 200vmax; height: 200vmax; z-index: -1; --c1: #f0f8ff; --c2: #fff0f5; --c3: #f5fffa; --c4: #fffacd; background: conic-gradient(from 0deg at 50% 50%, var(--c1), var(--c2), var(--c3), var(--c4), var(--c1)); animation: aura-rotation 35s linear infinite; transform: translate(-50%, -50%); }
        @keyframes aura-rotation { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
        #root.poster-mode-active > .hope-c-PJLV-iicyfOA-css { max-width: 100% !important; }
        .poster-mode-active .hope-grid { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)) !important; gap: 30px !important; padding: 20px 3vw !important; }
        .grid-item.native-hidden { visibility: hidden !important; height: 0; overflow: hidden; margin: 0; padding: 0; border: none; }
        .poster-card-container { aspect-ratio: 2 / 3; position: relative; transition: transform 0.6s var(--ease-in-out-cubic); }
        .grid-item.is-skeleton { background-color: rgba(127, 127, 127, 0.1); border-radius: 8px; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
        .poster-card { display: block; width: 100%; height: 100%; border-radius: 8px; overflow: hidden; background-color: #f0f2f5; box-shadow: 0 8px 25px -5px rgba(0,0,0,0.15); transition: box-shadow 0.3s var(--ease-out-quart), transform 0.3s var(--ease-out-quart); position: relative; }
        html[data-theme="dark"] .poster-card { background-color: #2d3748; }
        .poster-card:hover { box-shadow: 0 15px 30px -5px rgba(0,0,0,0.25); transform: translateY(-5px); z-index: 10; }
        .poster-card-img-wrapper { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        .poster-card-img, .poster-blur-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover !important; will-change: opacity; transition: opacity 1.2s var(--ease-out-quart); }
        .poster-card-img { opacity: 0; }
        .poster-card-img.is-animating { opacity: 1; }
        .poster-blur-overlay { opacity: 1; filter: blur(10px) saturate(1.2); transform: scale(1.1); }
        .poster-blur-overlay.is-animating { opacity: 0; }
        .poster-card.no-cover { display: flex; flex-direction: column; justify-content: center; align-items: center; background-color: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
        .fallback-icon { font-size: 4em; color: rgba(127, 127, 127, 0.3); }
        .fallback-text { margin-top: 15px; padding: 0 15px; color: rgba(127, 127, 127, 0.8); text-align: center; }
        .poster-card-info { position: absolute; bottom: 0; left: 0; right: 0; padding: 25px 15px 15px; background: linear-gradient(to top, rgba(0,0,0,0.85), transparent); color: white !important; font-size: 1em; font-weight: 600; text-shadow: 0 2px 4px black; border-radius: 0 0 inherit; z-index: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    `);

    function debounce(func, wait) { let t; return function(...a) { clearTimeout(t); t = setTimeout(() => func.apply(this, a), wait); }; }
    function initializeState() { if (galleryState.controller) galleryState.controller.abort(); if (intersectionObserver) intersectionObserver.disconnect(); galleryState = { isActive: false, cards: new Map(), visibleSet: new Set(), activeScans: 0, controller: new AbortController(), }; }
    function isGridViewActive() { return !!document.querySelector('.obj-box .hope-grid'); }
    function togglePosterMode(isActive) { document.querySelector('#root')?.classList.toggle('poster-mode-active', isActive); }

    function syncAndScanFolders() {
        if (!isGridViewActive()) {
            if (galleryState.isActive) { togglePosterMode(false); document.querySelectorAll('.poster-card-container').forEach(c => c.remove()); document.querySelectorAll('.grid-item[data-poster-processed]').forEach(item => { item.classList.remove('native-hidden'); item.removeAttribute('data-poster-processed'); }); initializeState(); }
            return;
        }
        if (!galleryState.isActive) { galleryState.isActive = true; setupLazyLoading(); }
        togglePosterMode(true);
        const currentItems = new Set(document.querySelectorAll('.obj-box .grid-item'));
        for (const [path, task] of galleryState.cards.entries()) { if (!currentItems.has(task.el)) { task.el.posterContainer?.remove(); galleryState.cards.delete(path); } }
        currentItems.forEach(item => {
            if (item.dataset.posterProcessed) return;
            const path = decodeURIComponent(new URL(item.href).pathname); if (galleryState.cards.has(path)) return;
            const isFolder = item.querySelector('svg [d^="M496 152a56"]');
            const task = { id: path, state: isFolder ? 'idle' : 'done_file', el: item, path };
            galleryState.cards.set(path, task);
            if (isFolder) { intersectionObserver.observe(item); } else { item.dataset.posterProcessed = "true"; }
        });
        reprioritizeAndProcessQueue();
    }

    function reprioritizeAndProcessQueue() {
        const sortedVisible = Array.from(galleryState.visibleSet).map(path => galleryState.cards.get(path)).filter(task => task && task.state === 'idle').sort((a, b) => a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top);
        for (const task of sortedVisible) { if (galleryState.activeScans >= MAX_CONCURRENT_SCANS) break; transitionState(task, 'SCAN'); }
    }

    // [v6.0] The Mainframe processor
    async function scanAndProcessFolder(task) {
        galleryState.activeScans++;
        const { signal } = galleryState.controller;
        try {
            const cacheKey = `${CACHE_KEY_PREFIX}${task.path}`;
            const cachedData = JSON.parse(sessionStorage.getItem(cacheKey));
            if (cachedData) {
                if (cachedData.noCover) { transitionState(task, 'NO_COVER_FOUND'); }
                else {
                    task.thumbnailUrl = cachedData.thumbnailUrl;
                    task.dominantColor = cachedData.dominantColor;
                    const blob = await (await fetch(cachedData.signedUrl, { signal })).blob();
                    task.imageBitmap = await createImageBitmap(blob);
                    transitionState(task, 'PROCESS_SUCCESS');
                }
                return;
            }

            const coverPath = `${task.path.endsWith('/') ? task.path : task.path + '/'}${COVER_FILENAME}`;
            const linkResp = await fetch(API_FS_LINK_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') }, body: JSON.stringify({ path: coverPath }), signal });

            if (!linkResp.ok) {
                sessionStorage.setItem(cacheKey, JSON.stringify({ noCover: true }));
                transitionState(task, 'NO_COVER_FOUND');
                return;
            }

            const linkData = await linkResp.json();
            const signedUrl = linkData?.data?.url;
            if (!signedUrl) throw new Error("Signed URL is null.");

            const imageResp = await fetch(signedUrl, { signal });
            if (!imageResp.ok) throw new Error(`Fetch failed: ${imageResp.status}`);
            const imageBlob = await imageResp.blob();

            const imageBitmap = await createImageBitmap(imageBlob);
            const thumbCanvas = document.createElement('canvas');
            const thumbCtx = thumbCanvas.getContext('2d');
            thumbCanvas.width = 50; thumbCanvas.height = 50 / (imageBitmap.width / imageBitmap.height);
            thumbCtx.drawImage(imageBitmap, 0, 0, thumbCanvas.width, thumbCanvas.height);
            const thumbnailUrl = thumbCanvas.toDataURL("image/webp", 0.1);

            const colorCanvas = document.createElement('canvas');
            const colorCtx = colorCanvas.getContext('2d');
            colorCanvas.width = 20; colorCanvas.height = 20;
            colorCtx.drawImage(imageBitmap, 0, 0, 20, 20);
            const imageData = colorCtx.getImageData(0, 0, 20, 20).data;
            const colorMap = {};
            for (let i = 0; i < imageData.length; i += 4) {
                if (imageData[i + 3] < 128) continue;
                const rgb = `${imageData[i]},${imageData[i+1]},${imageData[i+2]}`;
                colorMap[rgb] = (colorMap[rgb] || 0) + 1;
            }
            const dominantColor = Object.keys(colorMap).reduce((a, b) => colorMap[a] > colorMap[b] ? a : b);

            task.imageBitmap = imageBitmap;
            task.dominantColor = dominantColor;
            task.thumbnailUrl = thumbnailUrl;

            sessionStorage.setItem(cacheKey, JSON.stringify({ signedUrl, thumbnailUrl, dominantColor }));
            transitionState(task, 'PROCESS_SUCCESS');

        } catch (error) {
            if (error.name !== 'AbortError') { console.error(`[Poster Wall] Process failed for ${task.path}:`, error); transitionState(task, 'PROCESS_ERROR'); }
        } finally { galleryState.activeScans--; reprioritizeAndProcessQueue(); }
    }

    function setupLazyLoading() {
        const gridContainer = document.querySelector('.obj-box'); if (!gridContainer) return;
        const debouncedProcessor = debounce(reprioritizeAndProcessQueue, 150);
        gridContainer.addEventListener('scroll', debouncedProcessor, { passive: true });
        if (intersectionObserver) intersectionObserver.disconnect();
        intersectionObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                try {
                    const path = decodeURIComponent(new URL(entry.target.href).pathname);
                    if (entry.isIntersecting) { galleryState.visibleSet.add(path); reprioritizeAndProcessQueue(); }
                    else { galleryState.visibleSet.delete(path); }
                } catch(e) {}
            });
        }, { root: gridContainer, rootMargin: '100% 0px' });
    }

    function transitionState(task, action) {
        if (!task || !task.el) return;
        switch (task.state) {
            case 'idle':
                if (action === 'SCAN') { task.state = 'scanning'; task.el.classList.add('is-skeleton'); scanAndProcessFolder(task); }
                break;
            case 'scanning':
                if (action === 'PROCESS_SUCCESS') { task.state = 'transforming'; animateCardTransformation(task, false); }
                else if (action === 'NO_COVER_FOUND' || action === 'PROCESS_ERROR') { task.state = 'done_no_cover'; animateCardTransformation(task, true); }
                break;
        }
    }

    function animateCardTransformation(task, isFallback) {
        const { el: originalElement, dominantColor, thumbnailUrl } = task;
        const folderName = originalElement.querySelector('p[class*="hope-text"]').textContent;
        const container = document.createElement('div'); container.className = 'poster-card-container';
        const cardLink = document.createElement('a'); cardLink.className = 'poster-card'; cardLink.href = originalElement.href;
        if (isFallback) {
            cardLink.classList.add('no-cover');
            cardLink.innerHTML = `<div class="fallback-icon">🗀</div><div class="fallback-text">${folderName}</div>`;
        } else {
            cardLink.style.boxShadow = `0 15px 30px -5px rgba(${dominantColor}, 0.4), 0 8px 15px -5px rgba(${dominantColor}, 0.2)`;
            cardLink.innerHTML = `<div class="poster-card-img-wrapper"><img class="poster-blur-overlay" src="${thumbnailUrl}"><canvas class="poster-card-img"></canvas></div><div class="poster-card-info">${folderName}</div>`;
        }
        container.appendChild(cardLink);
        const first = originalElement.getBoundingClientRect();
        originalElement.classList.add('native-hidden');
        originalElement.parentElement.insertBefore(container, originalElement);
        originalElement.posterContainer = container;
        const last = container.getBoundingClientRect();
        const deltaX=first.left-last.left, deltaY=first.top-last.top, deltaW=first.width/last.width, deltaH=first.height/last.height;
        container.style.transformOrigin = 'top left';
        container.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${deltaW}, ${deltaH})`;
        requestAnimationFrame(() => {
            container.style.transform = 'none';
            if (!isFallback && task.imageBitmap) {
                const finalImage = container.querySelector('.poster-card-img');
                const blurOverlay = container.querySelector('.poster-blur-overlay');
                finalImage.width = task.imageBitmap.width; finalImage.height = task.imageBitmap.height;
                finalImage.getContext('2d').drawImage(task.imageBitmap, 0, 0);
                if(typeof task.imageBitmap.close === 'function') task.imageBitmap.close();
                requestAnimationFrame(() => { finalImage.classList.add('is-animating'); blurOverlay.classList.add('is-animating'); });
            }
        });
        task.state = 'done'; originalElement.dataset.posterProcessed = "true";
    }

    function initialize() {
        initializeState();
        const rootObserver = new MutationObserver((_, obs) => {
            const mainContentArea = document.querySelector(".obj-box");
            if (mainContentArea) {
                const debouncedSync = debounce(syncAndScanFolders, 300);
                const observer = new MutationObserver(debouncedSync);
                observer.observe(mainContentArea, { childList: true, subtree: true });
                syncAndScanFolders();
                obs.disconnect();
            }
        });
        rootObserver.observe(document.body, { childList: true, subtree: true });
    }

    initialize();

})();
