// ==UserScript==
// @name         Alist Immersive Gallery v9.2 Aethel
// @namespace    http://tampermonkey.net/
// @version      9.2
// @description  The definitive Alist image gallery with a state-machine architecture, FLIP animations, predictive prefetching, and a fully off-thread rendering pipeline.
// @author       Your Name & AI
// @include      /^https?://127\.0\.0\.1:5244/.*$/
// @include      /^https?://192\.168\.\d{1,3}\.\d{1,3}:5244/.*$/
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';
    console.log('[Alist Gallery] Script v9.2 (Homecoming) is running!');
    const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.avif', '.svg', '.jxl']);
    const TRIGGER_IMAGE_COUNT = 3;
    const GALLERY_BUTTON_ID = 'immersive-gallery-trigger-btn';
    const GALLERY_CONTAINER_ID = 'immersive-gallery-container';
    const API_ENDPOINT = '/api/fs/link';
    const MAX_CONCURRENT_LOADS = 4;
    let imageList = [],
        intersectionObserver = null,
        galleryState = {};
    const initialGalleryState = () => ({
        isActive: !1,
        lastScrollY: 0,
        cards: [],
        visibleSet: new Set,
        loadQueue: new Set,
        activeLoads: 0,
        worker: null,
        prefetchController: new AbortController,
        maxConcurrentLoads: getAdaptiveConcurrency()
    });
    GM_addStyle(`:root{--ease-out-quart:cubic-bezier(0.165, 0.84, 0.44, 1);--ease-in-out-cubic:cubic-bezier(0.645, 0.045, 0.355, 1)}body.gallery-is-active{overflow:hidden}body.gallery-is-active>#root{position:fixed;top:0;left:0;width:100%;height:100%;overflow:hidden;pointer-events:none;filter:blur(5px);transition:filter .5s var(--ease-in-out-cubic)}#${GALLERY_CONTAINER_ID}{position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;overflow-y:auto;opacity:0;transition:opacity .5s ease-in-out;--gradient-color-1:#e0c3fc;--gradient-color-2:#8ec5fc;--gradient-color-3:#f0f2f5;background:linear-gradient(135deg,var(--gradient-color-1),var(--gradient-color-2),var(--gradient-color-3));background-size:400% 400%;animation:gradientAnimation 25s ease infinite}#${GALLERY_CONTAINER_ID}::after{content:'';position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;background-image:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAMAAAAp4XiDAAAAUVBMVEWFhYWDg4N3d3dtbW17e3t1dXWBgYGHh4d5eXlzc3OLi4ubm5uVlZWPj4+NjY19fX2JiYl/f39sbGxvb29xcXGTk5NpaWmRkZGtra2YmJikpKSnp6e6urqioqK7u7vBwcGRs20AAAAuSURBVDjL7dBEAQAgEMCwA/9/mB8jUr83AST9S7y9cwAAAAAAAAAAAAAAAAAA4G4A0x8AASs0GAAAAABJRU5ErkJggg==);background-repeat:repeat;opacity:.2;animation:grain 8s steps(10) infinite}@keyframes gradientAnimation{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}@keyframes grain{0%,100%{transform:translate(0,0)}10%{transform:translate(-5%,-10%)}20%{transform:translate(-15%,5%)}30%{transform:translate(7%,-25%)}40%{transform:translate(-5%,25%)}50%{transform:translate(-15%,10%)}60%{transform:translate(15%,0%)}70%{transform:translate(0%,15%)}80%{transform:translate(3%,35%)}90%{transform:translate(-10%,10%)}}#${GALLERY_CONTAINER_ID}.gallery-active{opacity:1}#${GALLERY_BUTTON_ID}{position:fixed;bottom:25px;right:25px;width:55px;height:55px;background:#fff;color:#333;border-radius:50%;border:none;cursor:pointer;z-index:9998;display:flex;justify-content:center;align-items:center;box-shadow:0 6px 20px rgba(0,0,0,.15);transition:transform .2s var(--ease-out-quart),box-shadow .2s;opacity:0;transform:scale(0);animation:fadeIn .5s .2s forwards}#${GALLERY_BUTTON_ID}:hover{transform:scale(1.1);box-shadow:0 8px 25px rgba(0,0,0,.2)}@keyframes fadeIn{to{opacity:1;transform:scale(1)}}#${GALLERY_BUTTON_ID} .btn-text{font-size:1.8em;line-height:1}.gallery-back-btn,.gallery-toolbar{background:rgba(255,255,255,.6);backdrop-filter:blur(16px) saturate(180%);-webkit-backdrop-filter:blur(16px) saturate(180%);border:1px solid rgba(255,255,255,.2);color:#333;transition:all .3s cubic-bezier(.645,.045,.355,1)}.gallery-back-btn{position:fixed;top:20px;left:20px;width:44px;height:44px;border-radius:50%;z-index:10001;display:flex;justify-content:center;align-items:center;cursor:pointer;font-size:1.2em;font-weight:700;font-family:monospace}.gallery-back-btn:hover{background:rgba(255,255,255,.8);transform:scale(1.1)}.gallery-toolbar{position:fixed;top:20px;right:20px;z-index:10001;display:flex;gap:10px;padding:8px;border-radius:22px;opacity:0;visibility:hidden;transform:translateY(-20px)}#${GALLERY_CONTAINER_ID}:hover .gallery-toolbar{opacity:1;visibility:visible;transform:translateY(0)}.toolbar-btn{width:40px;height:40px;border:none;background:transparent;color:#333;cursor:pointer;border-radius:50%;display:flex;justify-content:center;align-items:center;transition:background-color .2s,color .2s;font-size:.8em;font-weight:700}.toolbar-btn:hover{background:rgba(0,0,0,.05)}.toolbar-btn.active{background:#8ec5fc;color:#fff!important}.gallery-image-list{display:flex;flex-direction:column;align-items:center;gap:40px;padding:10vh 0;transition:gap .4s cubic-bezier(.645,.045,.355,1)}.gallery-card{width:90%;max-width:1000px;border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,.25);overflow:hidden;position:relative;background-color:rgba(255,255,255,.2);opacity:0;transform:translateY(60px) scale(.95);transition:transform .6s var(--ease-out-quart),opacity .6s var(--ease-out-quart),aspect-ratio .6s cubic-bezier(.645,.045,.355,1),border-radius .4s ease,width .6s cubic-bezier(.645,.045,.355,1),max-width .6s cubic-bezier(.645,.045,.355,1);aspect-ratio:3/4;min-height:300px;will-change:transform,opacity,aspect-ratio,width,max-width;overflow-anchor:none}.gallery-card.is-visible{opacity:1;transform:translateY(0) scale(1)}.card-placeholder{position:absolute;top:0;left:0;width:100%;height:100%;backdrop-filter:blur(40px) saturate(150%);-webkit-backdrop-filter:blur(40px) saturate(150%);transition:opacity .8s ease-out}.thumbnail-bg{position:absolute;top:0;left:0;width:100%;height:100%;background-size:cover;background-position:center;filter:blur(20px);transform:scale(1.2);will-change:clip-path}.gallery-image-wrapper{position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;will-change:opacity}.gallery-image{display:block;width:100%;height:100%;object-fit:contain}.gallery-image-list.mode-webtoon{gap:0}.gallery-image-list.mode-webtoon .gallery-card{width:100%;max-width:100%;border-radius:0;box-shadow:none;background:transparent}.gallery-image-list.mode-webtoon .gallery-image{object-fit:cover}.gallery-image-list.mode-webtoon .card-filename,.gallery-image-list.mode-webtoon .thumbnail-bg{display:none}.gallery-image-list.mode-full-width .gallery-card{width:95vw;max-width:95vw}.card-filename{position:absolute;bottom:0;left:0;width:100%;padding:20px;box-sizing:border-box;background:linear-gradient(to top,rgba(0,0,0,.7),transparent);color:#fff;font-size:16px;opacity:0;transition:opacity .3s;pointer-events:none;text-shadow:0 1px 3px #000}.gallery-card:hover .card-filename{opacity:1}`);

    const workerCode = `self.onmessage=async e=>{let{id:a,signedUrl:t}=e.data;try{let e=await fetch(t,{priority:"low"}),r=await e.blob(),i=await createImageBitmap(r),n=new OffscreenCanvas(100,100/(i.width/i.height)),s=n.getContext("2d");s.drawImage(i,0,0,n.width,n.height);let o=await n.convertToBlob({type:"image/jpeg",quality:.2});self.postMessage({id:a,thumbnailBlob:o,width:i.width,height:i.height,imageBitmap:i},[i])}catch(o){self.postMessage({id:a,error:o.message})}}`;
    const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
    function createWorker() { return new Worker(URL.createObjectURL(workerBlob)); }
    function getAdaptiveConcurrency() { return navigator.connection?.effectiveType === '4g' ? 6 : navigator.connection?.effectiveType === '3g' ? 4 : 2; }
    function scanForImages() { const links = Array.from(document.querySelectorAll("a.list-item")); imageList = links.map(link => { const nameElement = link.querySelector("p.name"); if (!nameElement) return null; const text = nameElement.textContent.trim(); const extension = ('.' + text.split('.').pop()).toLowerCase(); if (IMAGE_EXTENSIONS.has(extension)) { const rawPath = decodeURIComponent(new URL(link.href).pathname); return { name: text, path: rawPath } } return null }).filter(Boolean); const btn = document.getElementById(GALLERY_BUTTON_ID); if (imageList.length >= TRIGGER_IMAGE_COUNT) { if (!btn) createGalleryTriggerButton(); } else if (btn) { btn.remove(); } }
    function createGalleryTriggerButton() { const button = document.createElement("button"); button.id = GALLERY_BUTTON_ID; button.title = "进入图廊"; button.innerHTML = `<span class="btn-text">✨</span>`; button.addEventListener("click", launchGallery); document.body.appendChild(button); }

    function launchGallery() {
        if (galleryState.isActive) return;
        galleryState = initialGalleryState();
        galleryState.isActive = !0;
        galleryState.lastScrollY = window.scrollY;
        document.body.classList.add('gallery-is-active');
        galleryState.worker = createWorker();
        galleryState.worker.onmessage = handleWorkerMessage;
        const galleryContainer = document.createElement("div");
        galleryContainer.id = GALLERY_CONTAINER_ID;
        document.body.appendChild(galleryContainer);
        galleryContainer.innerHTML = `<button class="gallery-back-btn" title="返回 (Esc)">ESC</button><div class="gallery-toolbar"><button class="toolbar-btn active" data-mode="mode-standard" title="标准模式">STD</button><button class="toolbar-btn" data-mode="mode-webtoon" title="Webtoon模式">WEB</button><button class="toolbar-btn" data-mode="mode-full-width" title="全屏宽度">FULL</button></div><div class="gallery-image-list mode-standard"></div>`;
        const imageListContainer = galleryContainer.querySelector(".gallery-image-list");
        imageList.forEach((image, index) => {
            const card = document.createElement("div");
            card.className = "gallery-card";
            card.id = `gallery-card-${index}`;
            card.innerHTML = `<div class="card-placeholder"></div><div class="card-filename">${image.name}</div>`;
            imageListContainer.appendChild(card);
            galleryState.cards[index] = { state: 'idle', el: card, path: image.path };
        });
        requestAnimationFrame(() => galleryContainer.classList.add("gallery-active"));
        setupEventListeners();
        setupLazyLoading();
        startLoadLoop();
        prefetchNextImages();
    }

    function closeGallery() { if (!galleryState.isActive) return; const galleryContainer = document.getElementById(GALLERY_CONTAINER_ID); if (galleryContainer) { galleryContainer.style.opacity = '0'; galleryContainer.addEventListener("transitionend", () => { galleryContainer.remove(); document.body.classList.remove('gallery-is-active'); window.scrollTo(0, galleryState.lastScrollY); if (galleryState.worker) galleryState.worker.terminate(); if (galleryState.loadLoopId) cancelIdleCallback(galleryState.loadLoopId); galleryState.prefetchController.abort(); galleryState = {}; if (intersectionObserver) intersectionObserver.disconnect() }, { once: true }); } document.removeEventListener("keydown", handleKeyPress); }
    function setupEventListeners() { document.querySelector(".gallery-back-btn").addEventListener("click", closeGallery); document.addEventListener("keydown", handleKeyPress); const toolbar = document.querySelector(".gallery-toolbar"), imageListContainer = document.querySelector(".gallery-image-list"); if (toolbar && imageListContainer) { toolbar.addEventListener("click", e => { const button = e.target.closest(".toolbar-btn"); if (button) { const mode = button.dataset.mode;["mode-standard", "mode-webtoon", "mode-full-width"].forEach(m => imageListContainer.classList.remove(m)); imageListContainer.classList.add(mode); toolbar.querySelectorAll(".toolbar-btn").forEach(btn => btn.classList.remove("active")); button.classList.add("active") } }); } }
    function handleKeyPress(e) { if (e.key === "Escape") closeGallery(); }

    function startLoadLoop() {
        const loop = () => {
            if (!galleryState.isActive) return;
            
            while (galleryState.activeLoads < galleryState.maxConcurrentLoads) {
                // 简化逻辑：始终从整个队列中寻找下一个待办任务
                const nextTask = galleryState.cards.find(t => t && t.state === 'idle'); // <--- 关键修正1：我们寻找的是'idle'状态

                if (nextTask) {
                    // 关键修正2：由fetch函数自身来管理状态转换
                    galleryState.activeLoads++;
                    fetchSignedUrlAndProcess(nextTask); 
                } else {
                    break;
                }
            }
            
            galleryState.loadLoopId = requestIdleCallback(loop);
        };
        galleryState.loadLoopId = requestIdleCallback(loop);
    }
    async function fetchSignedUrlAndProcess(task) {
        // 关键修正3：在这里转换状态
        transitionState(task, 'FETCH'); 
        try {
            const isVisible = galleryState.visibleSet.has(galleryState.cards.indexOf(task));
            const token = localStorage.getItem('token');
            const response = await fetch(API_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': token }, body: JSON.stringify({ path: task.path, password: "" }), priority: isVisible ? 'high' : 'low' });
            if (!response.ok) throw new Error(`API failed: ${response.status}`);
            const data = await response.json();
            const signedUrl = data?.data?.url;
            if (!signedUrl) throw new Error("Signed URL not found.");
            
            task.signedUrl = signedUrl;
            transitionState(task, 'FETCH_SUCCESS');
            galleryState.worker.postMessage({ id: galleryState.cards.indexOf(task), signedUrl });
        } catch (error) {
            console.error(`Error for path ${task.path}:`, error);
            transitionState(task, 'FETCH_ERROR');
        }
    }

    // --- CORE FIX in handleWorkerMessage ---
    function handleWorkerMessage({ data: { id, thumbnailBlob, width, height, error, imageBitmap } }) {
        const task = galleryState.cards[id];
        if (!task) return;
        if (error) { transitionState(task, 'WORKER_ERROR'); return; }

        // --- FIX: Correctly assign the transferred ImageBitmap to the task object ---
        task.imageBitmap = imageBitmap;
        // --- END FIX ---

        task.thumbnailBlob = thumbnailBlob;
        task.width = width;
        task.height = height;
        transitionState(task, 'WORKER_SUCCESS');
    }

    function setupLazyLoading() { intersectionObserver = new IntersectionObserver(entries => { entries.forEach(entry => { const id = parseInt(entry.target.id.replace('gallery-card-', '')); const task = galleryState.cards[id]; if (entry.isIntersecting) { galleryState.visibleSet.add(id); if (task.state === 'idle' && !entry.target.classList.contains('is-visible')) { entry.target.classList.add('is-visible'); } prefetchNextImages(id); } else { galleryState.visibleSet.delete(id); } }); }, { root: null, rootMargin: '150% 0px', threshold: .01 }); galleryState.cards.forEach(task => intersectionObserver.observe(task.el)); }
    async function prefetchNextImages(currentIndex = 0) {
        for (let i = 1; i <= 2; i++) {
            const nextIndex = currentIndex + i;
            if (nextIndex < galleryState.cards.length) {
                const task = galleryState.cards[nextIndex];
                if (task && !task.prefetched) {
                    task.prefetched = !0;
                    try {
                        const token = localStorage.getItem('token');
                        const response = await fetch(API_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': token }, body: JSON.stringify({ path: task.path, password: "" }), priority: 'low' });
                        const data = await response.json();
                        const signedUrl = data?.data?.url;
                        if (signedUrl) {
                            const link = document.createElement('link');
                            link.rel = 'prefetch';
                            link.href = signedUrl;
                            link.signal = galleryState.prefetchController.signal;
                            document.head.appendChild(link);
                        }
                    } catch (e) {}
                }
            }
        }
    }
    function transitionState(task, action, payload = {}) {
        const card = task.el;
        switch (task.state) {
            case 'idle':
                if (action === 'FETCH') {
                    task.state = 'fetching';
                    // 不在这里增加 activeLoads，移到 fetchSignedUrlAndProcess 中
                    fetchSignedUrlAndProcess(task);
                }
                break;
            case 'fetching':
                if (action === 'FETCH_SUCCESS') {
                    task.state = 'pending_worker';
                    // fetch 成功后，立即将任务交给 worker
                    galleryState.worker.postMessage({ id: task.id, signedUrl: task.signedUrl });
                } else if (action === 'FETCH_ERROR') { 
                    task.state = 'error'; 
                    card.querySelector('.card-placeholder').textContent = 'Error';
                }
                break;
            case 'pending_worker':
                 if (action === 'WORKER_SUCCESS') {
                    task.state = 'animating';
                    // worker 成功后，才开始动画
                    animateCard(task);
                } else if (action === 'WORKER_ERROR') { 
                    task.state = 'error'; 
                    card.querySelector('.card-placeholder').textContent = 'Error';
                }
                break;
        }
    }

    function animateCard(task) {
        const { el: card, thumbnailBlob, width, height, imageBitmap } = task;
        if (!imageBitmap) { // Safety check
            console.error("animateCard called but imageBitmap is missing.", task);
            task.state = 'error';
            card.querySelector('.card-placeholder').textContent = 'Bitmap Error';
            galleryState.activeLoads--;
            return;
        }
        const aspectRatio = width / height;
        const isLandscape = width > height;
        const isPortraitScreen = window.innerHeight > window.innerWidth;
        const EASE = { quart: 'cubic-bezier(0.165, 0.84, 0.44, 1)', cubic: 'cubic-bezier(0.645, 0.045, 0.355, 1)' };
        const first = card.getBoundingClientRect();
        card.style.overflowAnchor = 'none';
        if (isLandscape && isPortraitScreen && !card.closest('.mode-full-width, .mode-webtoon')) {
            card.style.minHeight = 'auto';
            card.style.width = '95vw';
            card.style.maxWidth = '95vw';
        }
        card.style.aspectRatio = aspectRatio;
        const last = card.getBoundingClientRect();
        const deltaX = first.left - last.left;
        const deltaY = first.top - last.top;
        const deltaW = first.width / last.width;
        const deltaH = first.height / last.height;
        card.animate([{ transformOrigin: 'top left', transform: `translate(${deltaX}px, ${deltaY}px) scale(${deltaW}, ${deltaH})` }, { transformOrigin: 'top left', transform: 'none' }], { duration: 600, easing: EASE.cubic });
        const thumbnailUrl = URL.createObjectURL(thumbnailBlob);
        const thumbBg = document.createElement('div');
        thumbBg.className = 'thumbnail-bg';
        thumbBg.style.backgroundImage = `url(${thumbnailUrl})`;
        card.prepend(thumbBg);
        thumbBg.animate([{ clipPath: 'inset(50% 50% 50% 50% round 16px)' }, { clipPath: 'inset(0% 0% 0% 0% round 16px)' }], { duration: 800, delay: 100, easing: EASE.quart, fill: 'forwards' }).finished
            .then(() => {
                const finalCanvas = document.createElement('canvas');
                finalCanvas.className = 'gallery-image';
                finalCanvas.width = width;
                finalCanvas.height = height;
                const ctx = finalCanvas.getContext('2d');
                ctx.drawImage(imageBitmap, 0, 0);
                imageBitmap.close();
                const imageWrapper = document.createElement('div');
                imageWrapper.className = 'gallery-image-wrapper';
                imageWrapper.appendChild(finalCanvas);
                card.appendChild(imageWrapper);
                imageWrapper.animate([{ opacity: 0, filter: 'blur(20px)', transform: 'scale(1.1)' }, { opacity: 1, filter: 'blur(0px)', transform: 'scale(1)' }], { duration: 1200, easing: EASE.quart, fill: 'forwards' });
                const placeholder = card.querySelector('.card-placeholder');
                if (placeholder) placeholder.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 800, fill: 'forwards' }).onfinish = () => placeholder.remove();
                URL.revokeObjectURL(thumbnailUrl);
                task.state = 'done';
                galleryState.activeLoads--;
                card.style.overflowAnchor = 'auto';
            });
    }

    const observer = new MutationObserver(() => { setTimeout(() => { const listContainer = document.querySelector('.list.viselect-container') || document.querySelector('.obj-box .hope-grid'); if (listContainer) scanForImages(); else { const btn = document.getElementById(GALLERY_BUTTON_ID); if (btn) btn.remove(); } }, 500); });
    const rootObserver = new MutationObserver((_, obs) => { const mainContentArea = document.querySelector(".obj-box"); if (mainContentArea) { observer.observe(mainContentArea, { childList: true, subtree: true }); scanForImages(); obs.disconnect(); } });
    rootObserver.observe(document.body, { childList: true, subtree: true });
})();
