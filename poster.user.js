// ==UserScript==
// @name         Alist Poster Wall v5.0 Synergy
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  v5.0 "Synergy" - A landmark update that synergizes with the Immersive Gallery. Features a lightning-fast "direct cover" loading strategy, a beautiful fallback for missing covers, and inherits the advanced "Aura Gradient" background and "Cross-fade" animations for a unified, state-of-the-art experience.
// @author       Your Name & AI
// @license      MIT
// @include      /^https?://127\.0\.0\.1:5244/.*$/
// @include      /^https?://192\.168\.\d{1,3}\.\d{1,3}:5244/.*$/
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Poster Wall] Script v5.0 (Synergy) is running!');

    const API_FS_LINK_ENDPOINT = '/api/fs/link';
    const COVER_FILENAME = '000-Cover.jpg'; // [v5.0] 指定封面文件名
    const CACHE_KEY_PREFIX = 'alist_poster_cache_v5.0_';
    const MAX_CONCURRENT_SCANS = 5;

    let intersectionObserver = null;
    let galleryState = {};

    // --- [v5.0] 样式最终版: 同步 Aura Gradient & 新增 Fallback 样式 ---
    GM_addStyle(`
        :root { --ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1); --ease-in-out-cubic: cubic-bezier(0.645, 0.045, 0.355, 1); }
        .poster-mode-active .hope-c-PJLV-ifZgGH-css {
            position: relative; z-index: 1; background-color: #f0f2f5;
            overflow: hidden; /* 防止伪元素溢出 */
        }
        html[data-theme="dark"] .poster-mode-active .hope-c-PJLV-ifZgGH-css { background-color: #1a202c; }
        .poster-mode-active .hope-c-PJLV-ifZgGH-css::before {
            content: ''; position: absolute; top: 50%; left: 50%; width: 200vmax; height: 200vmax;
            z-index: -1; --c1: #f0f8ff; --c2: #fff0f5; --c3: #f5fffa; --c4: #fffacd;
            background: conic-gradient(from 0deg at 50% 50%, var(--c1), var(--c2), var(--c3), var(--c4), var(--c1));
            animation: aura-rotation 35s linear infinite;
            transform: translate(-50%, -50%);
        }
        @keyframes aura-rotation { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }

        #root.poster-mode-active > .hope-c-PJLV-iicyfOA-css { max-width: 100% !important; }
        .poster-mode-active .hope-grid { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)) !important; gap: 30px !important; padding: 20px 3vw !important; }
        .grid-item.native-hidden { visibility: hidden !important; height: 0; overflow: hidden; margin: 0; padding: 0; }

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

        /* [v5.0] Fallback样式 */
        .poster-card.no-cover { display: flex; flex-direction: column; justify-content: center; align-items: center; background-color: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
        .fallback-icon { font-size: 4em; color: rgba(127, 127, 127, 0.3); }
        .fallback-text { margin-top: 15px; padding: 0 15px; color: rgba(127, 127, 127, 0.8); text-align: center; }

        .poster-card-info { position: absolute; bottom: 0; left: 0; right: 0; padding: 25px 15px 15px; background: linear-gradient(to top, rgba(0,0,0,0.85), transparent); color: white !important; font-size: 1em; font-weight: 600; text-shadow: 0 2px 4px black; border-radius: 0 0 inherit; z-index: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    `);

    // --- Web Worker [v5.0] 升级: 返回缩略图 ---
    const workerCode = `self.onmessage=async e=>{let{id:a,signedUrl:t}=e.data;try{let c=await fetch(t,{priority:"low"});if(!c.ok)throw new Error("Fetch failed");let s=await c.blob(),i=await createImageBitmap(s);let l=new OffscreenCanvas(50,50/(i.width/i.height)),r=l.getContext("2d");r.drawImage(i,0,0,l.width,l.height);let o=l.toDataURL("image/webp",.1);let n=new OffscreenCanvas(20,20),g=n.getContext("2d");g.drawImage(i,0,0,20,20);let d=g.getImageData(0,0,20,20).data,p={};for(let h=0;h<d.length;h+=4)if(d[h+3]>=128){let f=\`\${d[h]},\${d[h+1]},\${d[h+2]}\`;p[f]=(p[f]||0)+1}let m=Object.keys(p).reduce((u,b)=>p[u]>p[b]?u:b);self.postMessage({id:a,imageBitmap:i,dominantColor:m,thumbnailUrl:o},[i])}catch(w){self.postMessage({id:a,error:w.message})}}`;
    const workerBlob = new Blob([workerCode], { type: 'application/javascript' });

    function debounce(func, wait) { let t; return function(...a) { clearTimeout(t); t = setTimeout(() => func.apply(this, a), wait); }; }

    function initializeState() { if (galleryState.controller) galleryState.controller.abort(); if (intersectionObserver) intersectionObserver.disconnect(); galleryState = { isActive: false, cards: new Map(), visibleSet: new Set(), activeScans: 0, worker: galleryState.worker || null, controller: new AbortController(), }; }
    function ensureWorkerIsReady() { if (!galleryState.worker) { galleryState.worker = new Worker(URL.createObjectURL(workerBlob)); galleryState.worker.onmessage = handleWorkerMessage; } }
    function isGridViewActive() { return !!document.querySelector('.obj-box .hope-grid'); }
    function togglePosterMode(isActive) { document.querySelector('#root')?.classList.toggle('poster-mode-active', isActive); }

    function syncAndScanFolders() {
        if (!isGridViewActive()) {
            if (galleryState.isActive) { togglePosterMode(false); document.querySelectorAll('.poster-card-container').forEach(c => c.remove()); document.querySelectorAll('.grid-item[data-poster-processed]').forEach(item => { item.classList.remove('native-hidden'); item.removeAttribute('data-poster-processed'); }); initializeState(); }
            return;
        }
        if (!galleryState.isActive) { galleryState.isActive = true; ensureWorkerIsReady(); setupLazyLoading(); }
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
        requestIdleCallback(processScanQueue);
    }

    function processScanQueue() {
        if (galleryState.activeScans >= MAX_CONCURRENT_SCANS) return;
        let nextTask = Array.from(galleryState.visibleSet).map(path => galleryState.cards.get(path)).find(task => task && task.state === 'idle');
        if (!nextTask) nextTask = Array.from(galleryState.cards.values()).find(t => t && t.state === 'idle');
        if (nextTask) transitionState(nextTask, 'SCAN');
    }

    async function scanFolder(task) {
        galleryState.activeScans++;
        const { signal } = galleryState.controller;
        try {
            const cacheKey = `${CACHE_KEY_PREFIX}${task.path}`;
            const cachedCover = sessionStorage.getItem(cacheKey);
            if (cachedCover) { transitionState(task, 'SCAN_SUCCESS', { signedUrl: cachedCover === 'null' ? null : cachedCover }); return; }

            // [v5.0] Direct cover access logic
            const coverPath = `${task.path.endsWith('/') ? task.path : task.path + '/'}${COVER_FILENAME}`;
            const linkResp = await fetch(API_FS_LINK_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') }, body: JSON.stringify({ path: coverPath }), signal });
            if (linkResp.ok) {
                const linkData = await linkResp.json();
                const signedUrl = linkData?.data?.url;
                if (signedUrl) {
                    sessionStorage.setItem(cacheKey, signedUrl);
                    transitionState(task, 'SCAN_SUCCESS', { signedUrl });
                } else { throw new Error("Signed URL is null."); }
            } else {
                sessionStorage.setItem(cacheKey, 'null');
                transitionState(task, 'NO_COVER_FOUND');
            }
        } catch (error) {
            if (error.name !== 'AbortError') { console.error(`[Poster Wall] Scan failed for ${task.path}:`, error); transitionState(task, 'SCAN_ERROR'); }
        } finally { galleryState.activeScans--; requestIdleCallback(processScanQueue); }
    }

    function handleWorkerMessage({ data: { id, imageBitmap, dominantColor, thumbnailUrl, error } }) {
        const task = galleryState.cards.get(id); if (!task) return;
        if (error) { transitionState(task, 'WORKER_ERROR'); return; }
        task.imageBitmap = imageBitmap; task.dominantColor = dominantColor; task.thumbnailUrl = thumbnailUrl;
        transitionState(task, 'WORKER_SUCCESS');
    }

    function setupLazyLoading() {
        if (intersectionObserver) intersectionObserver.disconnect();
        intersectionObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                const path = decodeURIComponent(new URL(entry.target.href).pathname);
                const task = galleryState.cards.get(path); if (!task) return;
                if (entry.isIntersecting) { galleryState.visibleSet.add(path); if (task.state === 'idle') requestIdleCallback(processScanQueue); }
                else { galleryState.visibleSet.delete(path); }
            });
        }, { root: null, rootMargin: '100% 0px' });
    }

    function transitionState(task, action, payload = {}) {
        if (!task || !task.el) return;
        const card = task.el;
        switch (task.state) {
            case 'idle':
                if (action === 'SCAN') { task.state = 'scanning'; card.classList.add('is-skeleton'); scanFolder(task); }
                break;
            case 'scanning':
                if (action === 'SCAN_SUCCESS' && payload.signedUrl) {
                    task.state = 'pending_worker'; task.signedUrl = payload.signedUrl;
                    galleryState.worker.postMessage({ id: task.id, signedUrl: task.signedUrl });
                } else if (action === 'NO_COVER_FOUND' || action === 'SCAN_ERROR') {
                    task.state = 'done_no_cover';
                    animateCardTransformation(task, true); // Animate with fallback
                } else { // SCAN_SUCCESS with no URL
                    task.state = 'done_no_cover';
                    animateCardTransformation(task, true);
                }
                break;
            case 'pending_worker':
                if (action === 'WORKER_SUCCESS') { task.state = 'transforming'; animateCardTransformation(task, false); }
                else if (action === 'WORKER_ERROR') { task.state = 'done_no_cover'; animateCardTransformation(task, true); }
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
            const wrapper = document.createElement('div'); wrapper.className = 'poster-card-img-wrapper';
            const blurOverlay = new Image(); blurOverlay.className = 'poster-blur-overlay'; blurOverlay.src = thumbnailUrl;
            const finalImage = document.createElement('canvas'); finalImage.className = 'poster-card-img';
            wrapper.append(blurOverlay, finalImage);
            cardLink.append(wrapper);
            cardLink.innerHTML += `<div class="poster-card-info">${folderName}</div>`;
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
        requestAnimationFrame(() => { container.style.transform = 'none'; });

        if (!isFallback) {
            const finalImage = container.querySelector('.poster-card-img');
            const blurOverlay = container.querySelector('.poster-blur-overlay');
            finalImage.width = task.imageBitmap.width; finalImage.height = task.imageBitmap.height;
            finalImage.getContext('2d').drawImage(task.imageBitmap, 0, 0);
            if(typeof task.imageBitmap.close === 'function') task.imageBitmap.close();
            setTimeout(() => { // Delay to ensure FLIP animation is in progress
                finalImage.classList.add('is-animating');
                blurOverlay.classList.add('is-animating');
            }, 100);
        }

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
