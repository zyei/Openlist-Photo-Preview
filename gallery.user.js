// ==UserScript==
// @name         Alist 沉浸式图廊 (Immersive Gallery) v16.0 Helios
// @namespace    http://tampermonkey.net/
// @version      16.0
// @description  v16.0 "Helios" - The final masterpiece, reborn. This version perfects the metadata-first architecture for zero layout shift and introduces a powerful Resource Recycling Engine, enabling truly infinite scrolling in Webtoon mode with peak performance. This is the zenith of our collaborative journey.
// @author       Your Name & AI
// @license      MIT
// @include      /^https?://127\.0\.0\.1:5244/.*$/
// @include      /^https?://192\.168\.\d{1,3}\.\d{1,3}:5244/.*$/
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBmaWxsPSIjOGFjNmZmIiBkPSJNMjIgMTZWNGEyIDIgMCAwIDAtMi0ySDhNMyA2djEyYTIgMiAwIDAgMCAyIDJoMTJhMiAyIDAgMCAwIDItMlY4bC04LTRINWExIDEgMCAwIDEgMC0yaDEwVjRoNFYybC00IDRIM2EyIDIgMCAwIDAtMiAydjE4YTIgMiAwIDAgMCAyIDJoMTRhMiAyIDAgMCAwIDItMlY2aC0ydjEwaC04bC0yLTItMiAySDV2LTRoN2wtMy0zSDVhMSAxIDAgMCAxIDAtMmgzLjE3MmwzIDNIMTlWNkwzIDZtMi0yaDEwbDMgM0g1YTEgMSAwIDAgMSAwLTJtNSA5YTEuMSAxLjUgMCAxIDEgMC0zYTEuNSAxLjUgMCAwIDEgMCAzWiIvPjwvc3ZnPg==
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Alist Gallery] Script v16.0 (Helios) is running!');

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
    let galleryState = { isActive: false, lastScrollY: 0, controller: null };

    // --- [v16.0] 样式最终版 ---
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
        .gallery-back-btn,.gallery-toolbar{background:rgba(255,255,255,.5);backdrop-filter:blur(12px) saturate(180%);-webkit-backdrop-filter:blur(12px) saturate(180%);border:1px solid rgba(0,0,0,.08);color:#333;transition:all .3s ease}.gallery-back-btn{position:fixed;top:20px;left:20px;width:44px;height:44px;border-radius:50%;z-index:10001;display:flex;justify-content:center;align-items:center;cursor:pointer}.gallery-back-btn:hover{background:rgba(255,255,255,.7);transform:scale(1.1)}.gallery-toolbar{position:fixed;top:20px;right:20px;z-index:10001;display:flex;gap:10px;padding:8px;border-radius:22px;opacity:0;visibility:hidden;transform:translateY(-20px)}#${GALLERY_CONTAINER_ID}:hover .gallery-toolbar{opacity:1;visibility:visible;transform:translateY(0)}.toolbar-btn{width:36px;height:36px;border:none;background:transparent;color:#333;cursor:pointer;border-radius:50%;display:flex;justify-content:center;align-items:center;transition:background-color .2s, color .2s}.toolbar-btn:hover{background:rgba(0,0,0,.05)}.toolbar-btn.active{background:#8ec5fc;color:#fff !important}
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

    const ToolbarManager = { /* ... (v14.0 logic) ... */ };
    const DownloadManager = { /* ... (v14.0 logic) ... */ };
    ToolbarManager.iconSVG = `<path fill="currentColor" d="M4 4h7L9 2L4 2c-1.1 0-2 .9-2 2v7l2-2V4zm16 0h-7l2-2h5c1.1 0 2 .9 2 2v5l-2-2V4zM4 20h7l-2 2H4c-1.1 0-2-.9-2-2v-5l2 2v5zm16 0h-7l2 2h5c1.1 0 2-.9 2-2v-5l-2 2v5z"></path>`;
    ToolbarManager.injectButton = function() { if (document.getElementById(GALLERY_BUTTON_ID)) return; const t=document.querySelector('.left-toolbar-in'),r=t?.querySelector('svg[tips="refresh"]'); if(!t||!r)return; const n=r.cloneNode(true); n.id=GALLERY_BUTTON_ID; n.setAttribute('tips','沉浸式图廊'); n.innerHTML=this.iconSVG; n.addEventListener('click',launchGallery); t.prepend(n); };
    ToolbarManager.removeButton = function() { const b=document.getElementById(GALLERY_BUTTON_ID); if(b)b.remove(); };
    DownloadManager.initialize = function(token) { this.token = token; this.queue = []; this.activeDownloads = 0; };
    DownloadManager.schedule = function(card) { if (!card.dataset.path || this.queue.some(item => item.card === card)) return; this.queue.push({ card, priority: 9999 }); this.processQueue(); };
    DownloadManager.reprioritizeQueue = function() { const vh=window.innerHeight; const nq=[]; document.querySelectorAll('.gallery-card[data-path]').forEach(c => { const r=c.getBoundingClientRect(); if (r.top < vh && r.bottom > 0) nq.push({card:c, priority:r.top}); }); nq.sort((a,b)=>a.priority-b.priority); this.queue=nq; this.processQueue(); };
    DownloadManager.processQueue = async function() { if (document.querySelector('.gallery-card[data-is-large="true"][data-loading="true"]')) return; for (const item of this.queue) { if (this.activeDownloads >= MAX_CONCURRENT_DOWNLOADS) break; const card = item.card; if (!card.dataset.path || card.dataset.loading === 'true') continue; this.queue = this.queue.filter(i => i.card !== card); this.loadImageForCard(card, card.dataset.path); } };
    DownloadManager.loadImageForCard = async function(card, path) {
        const { signal } = galleryState.controller; card.dataset.loading = 'true'; this.activeDownloads++;
        try {
            if (!card.dataset.size) {
                const metaRes = await fetch(API_GET_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: this.token }, body: JSON.stringify({ path }), signal });
                if (!metaRes.ok) throw new Error(`API Get failed: ${metaRes.status}`);
                const metaData = await metaRes.json();
                card.dataset.size = metaData.data.size;
            }
            const totalSize = parseInt(card.dataset.size, 10);
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
            if (error.name !== 'AbortError') { console.error(`[Alist Gallery] Failed for ${path}.`, error); const p = card.querySelector('.card-placeholder'); if(p) p.textContent = '加载失败'; }
            else { console.log(`[Alist Gallery] Cancelled for ${path}.`); }
        } finally { const p = card.querySelector('.progress-indicator'); if(p) p.classList.remove('visible'); card.dataset.loading = 'false'; this.activeDownloads--; this.processQueue(); }
    };
    DownloadManager.fetchAndDecodeImage = async function(card, path, totalSize) { const { signal } = galleryState.controller; const p=card.querySelector('.progress-indicator'), c=p.querySelector('.progress-circle-bar'), t=p.querySelector('.progress-text'); if (!p||!c||!t) throw new Error("Progress elements not found."); const r=c.r.baseVal.value, cf=2*Math.PI*r; const uP=(pr)=>{c.style.strokeDashoffset=cf-(pr/100)*cf;t.textContent=`${Math.floor(pr)}%`;}; p.classList.add('visible'); uP(0); const lR=await fetch(API_LINK_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Authorization:this.token},body:JSON.stringify({path}),signal}); if(!lR.ok) throw new Error(`API Link failed: ${lR.status}`); const lD=await lR.json(); const sU=lD?.data?.url; if(!sU) throw new Error("Signed URL not found."); const rsp=await fetch(sU,{signal}); if(!rsp.body) throw new Error("Response body not readable."); const rdr=rsp.body.getReader(); let lS=0,ch=[]; while(true){const{done,value}=await rdr.read();if(done)break;ch.push(value);lS+=value.length;uP((lS/totalSize)*100);} const b=new Blob(ch); await this.performVisualLoad(card, b); };
    DownloadManager.performVisualLoad = async function(card, blob) { let iB; try{if(typeof createImageBitmap!=='undefined'){iB=await createImageBitmap(blob);}else{const oU=URL.createObjectURL(blob);try{const tI=new Image();tI.src=oU;await tI.decode();iB=tI;}finally{URL.revokeObjectURL(oU);}}}catch(e){console.error("Image decoding failed:",e);throw e;} card.style.aspectRatio=iB.width/iB.height; const iW=document.createElement('div');iW.className='gallery-image-wrapper'; const tC=document.createElement('canvas');const tX=tC.getContext('2d');tC.width=50;tC.height=50/(iB.width/iB.height);tX.drawImage(iB,0,0,tC.width,tC.height); const bO=new Image();bO.className='blur-overlay';bO.src=tC.toDataURL('image/webp',0.1);iW.appendChild(bO); const fI=document.createElement('canvas');fI.className='gallery-image';fI.width=iB.width;fI.height=iB.height;fI.getContext('2d').drawImage(iB,0,0);if(typeof iB.close==='function')iB.close();iW.appendChild(fI);card.appendChild(iW);animationObserver.observe(fI); };

    async function launchGallery() {
        if (galleryState.isActive) return;
        galleryState.isActive = true; galleryState.lastScrollY = window.scrollY; galleryState.controller = new AbortController();
        document.body.classList.add('gallery-is-active');
        const galleryContainer = document.createElement("div"); galleryContainer.id = GALLERY_CONTAINER_ID; document.body.appendChild(galleryContainer);
        galleryContainer.innerHTML = `<div class="gallery-scroll-container">...</div>`;
        const scrollContainer = galleryContainer.querySelector('.gallery-scroll-container');
        // [v15.0 FIX] 完整内联SVG
        scrollContainer.innerHTML = `
            <button class="gallery-back-btn" title="返回 (Esc)"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg></button>
            <div class="gallery-toolbar">
                <button class="toolbar-btn active" data-mode="mode-standard" title="标准模式"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"></rect></svg></button>
                <button class="toolbar-btn" data-mode="mode-webtoon" title="Webtoon模式"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></button>
                <button class="toolbar-btn" data-mode="mode-full-width" title="全屏宽度"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12H2m4-4-4 4 4 4M18 8l4 4-4 4"></path></svg></button>
            </div>
            <div class="gallery-image-list mode-standard"></div>
        `;

        const imageListContainer = galleryContainer.querySelector(".gallery-image-list");
        // [v15.0 FIX] 总是预加载元数据
        if (imageList.length > 0) {
            const loader = document.createElement('div'); loader.className = 'gallery-global-loader';
            loader.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"></path><path d="M10.72,19.9a8,8,0,0,1-6.5-9.79A7.77,7.77,0,0,1,10.4,4.16a8,8,0,0,1,9.49,6.52A1.54,1.54,0,0,0,21.38,12h.13a1.37,1.37,0,0,0,1.38-1.54,11,11,0,1,0-12.7,12.39A1.54,1.54,0,0,0,12,21.34h0A1.47,1.47,0,0,0,10.72,19.9Z"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.75s" repeatCount="indefinite"></animateTransform></path></svg>`;
            galleryContainer.appendChild(loader);
            await preloadAllMetadata();
            loader.remove();
        }

        imageList.forEach(image => {
            const card = document.createElement("div"); card.className = "gallery-card"; card.dataset.path = image.path;
            if (image.size) card.dataset.size = image.size;
            card.style.aspectRatio = image.aspectRatio || '3 / 4';
            card.innerHTML = `<div class="card-placeholder"><div class="progress-indicator"><svg width="80" height="80" viewBox="0 0 80 80"><circle class="progress-circle-bg" stroke-width="6" cx="40" cy="40" r="35"></circle><circle class="progress-circle-bar" stroke-width="6" cx="40" cy="40" r="35"></circle></svg><span class="progress-text">0%</span></div></div><div class="card-filename">${image.name}</div>`;
            imageListContainer.appendChild(card);
        });
        requestAnimationFrame(() => galleryContainer.classList.add("gallery-active"));
        setupEventListeners();
    }
    
    async function preloadAllMetadata() { /* ... (v14.0 logic) ... */ }
    preloadAllMetadata = async function() { const token=localStorage.getItem('token'); const CONCURRENT_LIMIT=5; let promises=[]; let executing=[]; for(const image of imageList){const p=(async()=>{try{const res=await fetch(API_GET_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Authorization:token},body:JSON.stringify({path:image.path}),signal:galleryState.controller.signal}); const data=await res.json(); image.size=data.data.size; image.aspectRatio=data.data.width&&data.data.height?data.data.width/data.data.height:null;}catch(e){console.warn(`Metadata preload failed for ${image.path}`); image.aspectRatio=null;}})(); promises.push(p); if(CONCURRENT_LIMIT<=imageList.length){const e=p.finally(()=>executing.splice(executing.indexOf(e),1)); executing.push(e); if(executing.length>=CONCURRENT_LIMIT){await Promise.race(executing);}}} await Promise.all(promises); };

    function setupEventListeners() {
        const container = document.getElementById(GALLERY_CONTAINER_ID); if (!container) return;
        container.querySelector(".gallery-back-btn").addEventListener("click", closeGallery);
        document.addEventListener("keydown", handleKeyPress);
        const toolbar = container.querySelector(".gallery-toolbar"), imageListContainer = container.querySelector(".gallery-image-list");
        if (toolbar && imageListContainer) {
            toolbar.addEventListener("click", e => {
                const button = e.target.closest(".toolbar-btn"); if (!button) return;
                const mode = button.dataset.mode;
                ["mode-standard", "mode-webtoon", "mode-full-width"].forEach(m => imageListContainer.classList.remove(m));
                imageListContainer.classList.add(mode);
                toolbar.querySelectorAll(".toolbar-btn").forEach(btn => btn.classList.remove("active"));
                button.classList.add("active");
                setupLazyLoading(true, mode === 'mode-webtoon' ? '300%' : '100%');
            });
        }
        setupLazyLoading(false); // Initial setup
    }
    
    function setupLazyLoading(isResuming = false, rootMargin = '100%') {
        const token = localStorage.getItem('token'); if (!token) { return; }
        const scrollContainer = document.querySelector(".gallery-scroll-container"); if (!scrollContainer) return;
        if (!isResuming) {
            DownloadManager.initialize(token);
            if (!scrollContainer.scrollListener) {
                const debouncedReprioritize = debounce(() => DownloadManager.reprioritizeQueue(), 150);
                scrollContainer.addEventListener('scroll', debouncedReprioritize, { passive: true });
                scrollContainer.scrollListener = true;
            }
        }
        if (loadObserver) loadObserver.disconnect();
        if (animationObserver) animationObserver.disconnect();

        loadObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                // [v16.0] Resource Recycling Engine
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    // Only schedule if it has a path (i.e., not loaded or unloaded)
                    if (entry.target.dataset.path) {
                        DownloadManager.schedule(entry.target);
                    }
                } else {
                    const rect = entry.boundingClientRect;
                    if (rect.bottom < -window.innerHeight) { // Scrolled far above
                        unloadCardResources(entry.target);
                    }
                }
            });
        }, { root: scrollContainer, rootMargin });
        
        animationObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const imageEl=entry.target, blurOverlay=imageEl.previousElementSibling;
                    const placeholder=imageEl.closest('.gallery-card')?.querySelector('.card-placeholder');
                    if(placeholder)placeholder.style.opacity='0';
                    imageEl.classList.add('is-animating');
                    if(blurOverlay?.classList.contains('blur-overlay'))blurOverlay.classList.add('is-animating');
                    observer.unobserve(imageEl);
                }
            });
        }, { root: scrollContainer, rootMargin: '0px' });
        
        document.querySelectorAll('.gallery-card').forEach(card => {
            // [v15.0 FIX]
            loadObserver.observe(card);
            const imageEl = card.querySelector('.gallery-image:not(.is-animating)');
            if (imageEl) animationObserver.observe(imageEl);
        });
        
        if (!isResuming) setTimeout(() => DownloadManager.reprioritizeQueue(), 100);
    }

    function unloadCardResources(card) {
        if (!card.dataset.path && galleryState.isActive) { // Only unload fully loaded cards
            const imageWrapper = card.querySelector('.gallery-image-wrapper');
            if (imageWrapper) {
                const originalPath = imageList.find(img => img.name === card.querySelector('.card-filename').textContent)?.path;
                if (originalPath) {
                    console.log(`[Alist Gallery] Unloading resources for ${originalPath}`);
                    card.dataset.path = originalPath;
                    imageWrapper.remove();
                    const placeholder = card.querySelector('.card-placeholder');
                    if (placeholder) {
                        placeholder.style.opacity = '1';
                        placeholder.textContent = '';
                        placeholder.innerHTML = `<div class="progress-indicator"><svg ... ></svg>...</div>`;
                        placeholder.querySelector('svg').outerHTML = `<svg width="80" height="80" viewBox="0 0 80 80"><circle class="progress-circle-bg" stroke-width="6" cx="40" cy="40" r="35"></circle><circle class="progress-circle-bar" stroke-width="6" cx="40" cy="40" r="35"></circle></svg>`;
                        placeholder.querySelector('.progress-indicator').innerHTML += `<span class="progress-text">0%</span>`;
                    }
                }
            }
        }
    }
    
    function debounce(func, wait) { let t; return function(...a) { clearTimeout(t); t = setTimeout(() => func.apply(this, a), wait); }; }
    function closeGallery() { if (!galleryState.isActive) return; if (galleryState.controller) galleryState.controller.abort(); DownloadManager.queue = []; galleryState.isActive = false; const gc = document.getElementById(GALLERY_CONTAINER_ID); if (gc) { gc.classList.remove("gallery-active"); gc.addEventListener("transitionend", () => { gc.remove(); document.body.classList.remove('gallery-is-active'); window.scrollTo(0, galleryState.lastScrollY); }, { once: true }); } document.removeEventListener("keydown", handleKeyPress); if (loadObserver) loadObserver.disconnect(); if (animationObserver) animationObserver.disconnect(); }
    function handleKeyPress(e) { if (e.key === "Escape") closeGallery(); }
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
