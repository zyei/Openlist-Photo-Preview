// ==UserScript==
// @name         Alist 沉浸式图廊 (Immersive Gallery) v20.3 Infinity
// @namespace    http://tampermonkey.net/
// @version      20.3
// @description  v20.3 "Infinity" - The final touch. This version pushes immersion to its absolute limit by removing scrollbars and enabling a true edge-to-edge display on mobile devices, breaking the final boundaries of the browser viewport.
// @author       Your Name & AI
// @license      MIT
// @include      /^https?://127\.0\.0\.1:5244/.*$/
// @include      /^https?://192\.168\.\d{1,3}\.\d{1,3}:5244/.*$/
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDI0IDIQNCI+PHBhdGggZmlsbD0iIzghYjNmZiIgZD0iTTIyIDE2VjRBMiAyIDAgMCAwIDIwIDJIOE0zIDZ2MTJhMiAyIDAgMCAwIDIgMmgxMmEyIDIgMCAwIDAgMi0yVjhsLTgtNEg1YTEgMSAwIDAgMSAwLTJoMTBWNmg0VjJsLTQgNEgzYTIEyIDAgMCAwLTIgMnYxOGEyIDIgMCAwIDAgMiAyaDE0YTIEyIDAgMCAwIDItMlY2aC0ydjEwaC04bC0yLTItMiAySDV2LTRoN2wtMy0zSDVhMSAxIDAgMCAxIDAtMmgzLjE3MmwzIDNIMTlWNkwzIDZtMi0yaDEwbDMgM0g1YTEgMSAwIDAgMSAwLTJtNSA5YTEuMSAxLjUgMCAxIDEgMC0zYTEuNSAxLjUgMCAwIDEgMCAzWiIvPjwvc3ZnPg==
// @grant        GM_addStyle
// @grant        GM_log
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Alist Gallery] Script v20.3 (Infinity) is running!');

    // --- 配置项 ---
    const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', 'avif', '.svg', '.JPG', '.jxl', '.JXL'];
    const TRIGGER_IMAGE_COUNT = 5;
    const GALLERY_BUTTON_ID = 'integrated-gallery-trigger-btn';
    const GALLERY_CONTAINER_ID = 'immersive-gallery-container';
    const API_LINK_ENDPOINT = '/api/fs/link';
    const API_GET_ENDPOINT = '/api/fs/get';
    const LARGE_FILE_THRESHOLD_MB = 15;
    const MAX_CONCURRENT_DOWNLOADS = 3;
    const LOAD_RETRY_COUNT = 2;

    let imageList = [];
    let loadObserver = null;
    let animationObserver = null;
    let galleryState = { isActive: false, lastScrollY: 0, controller: null, reprioritizeTimer: null, hideControlsTimeout: null, scrollHandler: null, clickHandler: null, progressScrollHandler: null };
    let originalViewport = ''; // [v20.3] 用于存储原始viewport值

    // --- [v20.3] 样式最终版 ---
    GM_addStyle(`
        :root { --ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1); }
        body.gallery-is-active { overflow: hidden; }
        body.gallery-is-active > #root { position: fixed; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; pointer-events: none; }
        #${GALLERY_CONTAINER_ID} { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 9999; overflow: hidden; opacity: 0; transition: opacity 0.5s ease-in-out; background-color: #f0f2f5; }
        html[data-theme="dark"] #${GALLERY_CONTAINER_ID} { background-color: #1a202c; }

        /* [v20.3] 无边框滚动 + 边到边沉浸 */
        #${GALLERY_CONTAINER_ID} .gallery-scroll-container {
            width: 100%; height: 100%; overflow-y: auto; scroll-behavior: smooth;
            /* Firefox */
            scrollbar-width: none;
            /* Webkit */
            &::-webkit-scrollbar { display: none; }
        }
        .gallery-back-btn, .gallery-toolbar, .gallery-progress-bar {
            /* 使用CSS变量和env()来适配安全区域 */
            --safe-area-top: env(safe-area-inset-top, 0px);
            --safe-area-left: env(safe-area-inset-left, 0px);
            --safe-area-right: env(safe-area-inset-right, 0px);
            --safe-area-bottom: env(safe-area-inset-bottom, 0px);
        }
        .gallery-back-btn { top: calc(20px + var(--safe-area-top)); left: calc(20px + var(--safe-area-left)); }
        .gallery-toolbar { top: calc(20px + var(--safe-area-top)); right: calc(20px + var(--safe-area-right)); }
        .gallery-progress-bar { bottom: calc(10px + var(--safe-area-bottom)); left: calc(10px + var(--safe-area-left)); right: calc(10px + var(--safe-area-right)); }


        #${GALLERY_CONTAINER_ID}::before, #${GALLERY_CONTAINER_ID}::after { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -2; pointer-events: none; background-repeat: no-repeat; transform-origin: center center;}
        #${GALLERY_CONTAINER_ID}::before { background: radial-gradient(circle at 10% 10%, rgba(220, 210, 255, 0.6), transparent 50%); animation: shimmer1 30s ease-in-out infinite alternate; }
        #${GALLERY_CONTAINER_ID}::after { background: radial-gradient(circle at 90% 90%, rgba(210, 255, 245, 0.6), transparent 50%); animation: shimmer2 25s ease-in-out infinite alternate; }
        @keyframes shimmer1 { from { transform: translate(-15%, -15%) scale(1.5); } to { transform: translate(15%, 15%) scale(1.5); } }
        @keyframes shimmer2 { from { transform: translate(15%, 15%) scale(1.5); } to { transform: translate(-15%, -15%) scale(1.5); } }
        #${GALLERY_CONTAINER_ID}.gallery-active { opacity: 1; }
        .gallery-back-btn, .gallery-toolbar, .gallery-progress-bar { transition: opacity 0.4s var(--ease-out-quart), visibility 0.4s var(--ease-out-quart), transform 0.4s var(--ease-out-quart) !important; z-index: 10001; }
        .gallery-back-btn, .gallery-toolbar { opacity: 0; visibility: hidden; transform: translateY(-20px); }
        .gallery-progress-bar { opacity: 0; visibility: hidden; transform: translateY(20px); }
        .gallery-back-btn.visible, .gallery-toolbar.visible, .gallery-progress-bar.visible { opacity: 1; visibility: visible; transform: translateY(0); }
        .gallery-back-btn{position:fixed;width:44px;height:44px;border-radius:50%;display:flex;justify-content:center;align-items:center;cursor:pointer; background:rgba(255,255,255,.5);backdrop-filter:blur(12px) saturate(180%);-webkit-backdrop-filter:blur(12px) saturate(180%);border:1px solid rgba(0,0,0,.08);color:#333;}.gallery-back-btn:hover{background:rgba(255,255,255,.7);transform:scale(1.1) translateY(0) !important}
        .gallery-toolbar{position:fixed;display:flex;gap:10px;padding:8px;border-radius:22px; background:rgba(255,255,255,.5);backdrop-filter:blur(12px) saturate(180%);-webkit-backdrop-filter:blur(12px) saturate(180%);border:1px solid rgba(0,0,0,.08);color:#333;}
        .toolbar-btn{width:36px;height:36px;border:none;background:transparent;color:#333;cursor:pointer;border-radius:50%;display:flex;justify-content:center;align-items:center;transition:background-color .2s, color .2s}.toolbar-btn:hover{background:rgba(0,0,0,.05)}.toolbar-btn.active{background:#8ec5fc;color:#fff !important}
        .gallery-image-list { display: flex; flex-direction: column; align-items: center; gap: 40px; padding: 10vh 0; }
        .gallery-card { width: 90%; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; position: relative; background-color: rgba(255,255,255,0.1); opacity: 0; transform: translateY(20px); will-change: opacity, transform; transition: opacity 0.8s var(--ease-out-quart), transform 0.8s var(--ease-out-quart), aspect-ratio 0.4s ease-out; aspect-ratio: 3 / 4; min-height: 200px; }
        .gallery-card.is-visible { opacity: 1; transform: translateY(0); }
        .card-placeholder { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; background-color: rgba(255,255,255,0.2); transition: opacity 1.2s var(--ease-out-quart); }
        html[data-theme="dark"] .card-placeholder { background-color: rgba(0,0,0,0.1); }
        .gallery-image-wrapper { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        .gallery-image { display: block; width: 100%; height: 100%; object-fit: contain; opacity: 0; will-change: opacity; transition: opacity 1.2s var(--ease-out-quart); }
        .gallery-image.loaded { opacity: 1; }
        .progress-indicator { position: absolute; width: 80px; height: 80px; display: flex; justify-content: center; align-items: center; opacity: 0; transform: scale(0.8); transition: all 0.3s ease; pointer-events: none; z-index: 5; }
        .progress-indicator.visible { opacity: 1; transform: scale(1); }
        .progress-indicator svg { transform: rotate(-90deg); } .progress-circle-bg { fill: none; stroke: rgba(0,0,0,0.1); }
        .progress-circle-bar { fill: none; stroke: #8ec5fc; stroke-linecap: round; transition: stroke-dashoffset 0.2s linear; }
        .progress-text { position: absolute; font-size: 16px; font-weight: 500; color: rgba(0,0,0,0.6); font-family: monospace; }
        .gallery-image-list.mode-standard .gallery-card { max-width: 1000px; } .gallery-image-list.mode-webtoon { gap: 0; } .gallery-image-list.mode-webtoon .gallery-card { width: 100%; max-width: 100%; border-radius: 0; box-shadow: none; background: transparent; } .gallery-image-list.mode-webtoon .gallery-image { object-fit: cover; } .gallery-image-list.mode-webtoon .card-filename { display: none; } .gallery-image-list.mode-full-width .gallery-card { width: 95vw; max-width: 95vw; }
        .card-filename{position:absolute;bottom:0;left:0;width:100%;padding:20px;box-sizing:border-box;background:linear-gradient(to top,rgba(0,0,0,.7),transparent);color:#fff;font-size:16px;opacity:0;transition:opacity .3s;pointer-events:none;text-shadow:0 1px 3px black; z-index: 4;}.gallery-card:hover .card-filename{opacity:1}
        #${GALLERY_BUTTON_ID} { color: #526781; } html[data-theme="dark"] #${GALLERY_BUTTON_ID} { color: #a1aab9; }
        .gallery-global-loader { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 10002; color: #8ec5fc; }
        .gallery-progress-bar { position: fixed; width: auto; height: 50px; display: flex; align-items: center; padding: 0 20px; box-sizing: border-box; background: rgba(0,0,0,0.3); border-radius: 25px; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
        .progress-track { flex-grow: 1; height: 6px; background-color: rgba(255,255,255,0.3); border-radius: 3px; position: relative; cursor: pointer; }
        .progress-thumb { position: absolute; top: -7px; height: 20px; width: 20px; background-color: #fff; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.3); transform: translateX(-50%); }
        .progress-label { color: white; text-shadow: 0 1px 2px black; font-size: 14px; margin-left: 15px; font-variant-numeric: tabular-nums; }
    `);

    // ... (ICONS, TEMPLATES, ToolbarManager, DownloadManager, preloadAllMetadata, debounce, scanForImages, and all observers remain identical to v20.2 - no changes needed there)
    const ICONS = { GALLERY: `<path fill="currentColor" d="M4 4h7L9 2L4 2c-1.1 0-2 .9-2 2v7l2-2V4zm16 0h-7l2-2h5c1.1 0 2 .9 2 2v5l-2-2V4zM4 20h7l-2 2H4c-1.1 0-2-.9-2-2v-5l2 2v5zm16 0h-7l2 2h5c1.1 0 2-.9 2-2v-5l-2 2v5z"></path>`, BACK: `<line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>`, STANDARD_MODE: `<rect x="2" y="3" width="20" height="18" rx="2"></rect>`, WEBTOON_MODE: `<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>`, FULLWIDTH_MODE: `<path d="M22 12H2m4-4-4 4 4 4M18 8l4 4-4 4"></path>`, LOADER: `<path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"></path><path d="M10.72,19.9a8,8,0,0,1-6.5-9.79A7.77,7.77,0,0,1,10.4,4.16a8,8,0,0,1,9.49,6.52A1.54,1.54,0,0,0,21.38,12h.13a1.37,1.37,0,0,0,1.38-1.54,11,11,0,1,0-12.7,12.39A1.54,1.54,0,0,0,12,21.34h0A1.47,1.47,0,0,0,10.72,19.9Z"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.75s" repeatCount="indefinite"></animateTransform></path>`, };
    const TEMPLATES = { PLACEHOLDER: `<div class="card-placeholder"><div class="progress-indicator"><svg width="80" height="80" viewBox="0 0 80 80"><circle class="progress-circle-bg" stroke-width="6" cx="40" cy="40" r="35"></circle><circle class="progress-circle-bar" stroke-width="6" cx="40" cy="40" r="35"></circle></svg><span class="progress-text">0%</span></div></div>`, };
    const ToolbarManager = {
        injectButton(){if(document.getElementById(GALLERY_BUTTON_ID))return;const t=document.querySelector('.left-toolbar-in'),e=t?.querySelector('svg[tips="refresh"]');if(!t||!e)return;const n=e.cloneNode(!0);n.id=GALLERY_BUTTON_ID,n.setAttribute("tips","沉浸式图廊"),n.innerHTML=ICONS.GALLERY,n.addEventListener("click",async()=>{await launchGallery(),toggleFullscreen(document.getElementById(GALLERY_CONTAINER_ID))}),t.prepend(n)},
        removeButton(){document.getElementById(GALLERY_BUTTON_ID)?.remove()}
    };
    const DownloadManager = {
        queue:[],activeDownloads:0,token:null,
        initialize(t){this.token=t,this.queue=[],this.activeDownloads=0},
        schedule(t){this.queue.some(e=>e.card===t)|| (this.queue.push({card:t,priority:9999}),this.processQueue())},
        reprioritizeQueue(){const t=window.innerHeight,e=[];document.querySelectorAll(".gallery-card[data-path]").forEach(n=>{const o=n.getBoundingClientRect();o.top<t&&o.bottom>0&&e.push({card:n,priority:o.top})}),e.sort((n,o)=>n.priority-o.priority),this.queue=e,this.processQueue()},
        async processQueue(){if(document.querySelector('.gallery-card[data-is-large="true"][data-loading="true"]'))return;for(const t of this.queue)if(!(this.activeDownloads>=MAX_CONCURRENT_DOWNLOADS)){const e=t.card;e.dataset.path&&!e.dataset.loading&&(this.queue=this.queue.filter(n=>n.card!==e),this.loadImageForCard(e,e.dataset.path))}},
        async loadImageForCard(t,e){const{signal:n}=galleryState.controller;t.dataset.loading="true",this.activeDownloads++;try{if(!t.dataset.size){const o=await fetch(API_GET_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json",Authorization:this.token},body:JSON.stringify({path:e}),signal:n});if(!o.ok)throw new Error(`API Get failed: ${o.status}`);const a=(await o.json()).data;t.dataset.size=a.size}const r=parseInt(t.dataset.size,10),i=r/1048576>LARGE_FILE_THRESHOLD_MB;if(t.dataset.isLarge=i,i&&this.activeDownloads>1)return t.dataset.loading="false",this.activeDownloads--,void this.schedule(t);let s=null;for(let l=1;l<=LOAD_RETRY_COUNT+1;l++)try{await this.fetchAndDecodeImage(t,e,r),s=null;break}catch(c){if(s=c,"AbortError"===c.name)break;console.warn(`[Alist Gallery] Attempt ${l} failed for ${e}:`,c),l<=LOAD_RETRY_COUNT&&await new Promise(d=>setTimeout(d,500*l))}if(s)throw s;t.removeAttribute("data-path")}catch(u){"AbortError"!==u.name? (console.error(`[Alist Gallery] Failed for ${e}.`,u),t.querySelector(".card-placeholder")&&(t.querySelector(".card-placeholder").textContent="加载失败")):console.log(`[Alist Gallery] Cancelled for ${e}.`)}finally{const m=t.querySelector(".progress-indicator");m&&m.classList.remove("visible"),t.dataset.loading="false",this.activeDownloads--,this.processQueue()}},
        async fetchAndDecodeImage(t,e,n){const{signal:o}=galleryState.controller,a=t.querySelector(".progress-indicator"),r=a.querySelector(".progress-circle-bar"),i=a.querySelector(".progress-text");if(!a||!r||!i)throw new Error("Progress elements not found.");const s=r.r.baseVal.value,l=2*Math.PI*s,c=d=>{r.style.strokeDashoffset=l-d/100*l,i.textContent=`${Math.floor(d)}%`};a.classList.add("visible"),c(0);const u=await fetch(API_LINK_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json",Authorization:this.token},body:JSON.stringify({path:e}),signal:o});if(!u.ok)throw new Error(`API Link failed: ${u.status}`);const g=(await u.json()).data.url;if(!g)throw new Error("Signed URL not found.");const p=await fetch(g,{signal:o});if(!p.body)throw new Error("Response body not readable.");const h=p.body.getReader();let w=0,v=[];for(;;){const{done:y,value:b}=await h.read();if(y)break;v.push(b),w+=b.length,c(w/n*100)}const f=new Blob(v);await this.performVisualLoad(t,f)},
        async performVisualLoad(t,e){let n;try{n=typeof createImageBitmap!="undefined"?await createImageBitmap(e):await new Promise((o,a)=>{const r=URL.createObjectURL(e),i=new Image;i.onload=async()=>{await i.decode(),o(i)},i.onerror=a,i.src=r,setTimeout(()=>URL.revokeObjectURL(r),1e3)})}catch(r){throw console.error("Image decoding failed:",r),r}t.style.aspectRatio=`${n.width} / ${n.height}`;const i=document.createElement("div");i.className="gallery-image-wrapper";const s=document.createElement("canvas");s.className="gallery-image",s.width=n.width,s.height=n.height,s.getContext("2d").drawImage(n,0,0),"function"==typeof n.close&&n.close(),i.appendChild(s),t.appendChild(i);const l=t.querySelector(".card-placeholder");l&&(l.style.opacity="0"),requestAnimationFrame(()=>{s.classList.add("loaded")})}
    };

    async function launchGallery() {
        if (galleryState.isActive) return;
        galleryState.isActive = true; galleryState.lastScrollY = window.scrollY; galleryState.controller = new AbortController();
        updateViewportMeta(true);
        document.body.classList.add('gallery-is-active');
        const galleryContainer = document.createElement("div"); galleryContainer.id = GALLERY_CONTAINER_ID; document.body.appendChild(galleryContainer);

        galleryContainer.innerHTML = `
            <div class="gallery-scroll-container">
                <button class="gallery-back-btn" title="返回 (Esc)"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${ICONS.BACK}</svg></button>
                <div class="gallery-toolbar"><button class="toolbar-btn active" data-mode="mode-standard" title="标准模式"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.STANDARD_MODE}</svg></button><button class="toolbar-btn" data-mode="mode-webtoon" title="Webtoon模式"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.WEBTOON_MODE}</svg></button><button class="toolbar-btn" data-mode="mode-full-width" title="全屏宽度"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.FULLWIDTH_MODE}</svg></button></div>
                <div class="gallery-image-list mode-standard"></div>
                <div class="gallery-progress-bar"><div class="progress-track"><div class="progress-thumb"></div></div><div class="progress-label">0 / 0</div></div>
            </div>`;

        const imageListContainer = galleryContainer.querySelector(".gallery-image-list");
        const loader = document.createElement('div'); loader.className = 'gallery-global-loader';
        loader.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${ICONS.LOADER}</svg>`;
        galleryContainer.appendChild(loader);
        await preloadAllMetadata();
        loader.remove();

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
                    image.aspectRatio = data.data.width && data.data.height ? `${data.data.width} / ${data.data.height}` : '3 / 4';
                } catch (e) { console.warn(`Metadata preload failed for ${image.path}`); image.aspectRatio = '3 / 4'; }
            })();
            promises.push(p);
            if (CONCURRENT_LIMIT <= imageList.length) { const e = p.finally(() => executing.splice(executing.indexOf(e), 1)); executing.push(e); if (executing.length >= CONCURRENT_LIMIT) await Promise.race(executing); }
        }
        await Promise.all(promises);
    }

    function setupEventListeners() {
        const container = document.getElementById(GALLERY_CONTAINER_ID); if (!container) return;
        const scrollContainer = container.querySelector('.gallery-scroll-container');
        const uiControls = [container.querySelector(".gallery-back-btn"), container.querySelector(".gallery-toolbar"), container.querySelector(".gallery-progress-bar")];

        const toggleControls = (event) => {
            if (event.target.closest('.gallery-back-btn, .gallery-toolbar, .gallery-progress-bar')) return;
            const y = event.clientY;
            const viewHeight = window.innerHeight;
            if (y < viewHeight / 4) {
                uiControls[0].classList.toggle('visible'); uiControls[1].classList.toggle('visible');
                uiControls[2].classList.remove('visible');
            } else if (y > viewHeight * 3 / 4) {
                uiControls[2].classList.toggle('visible');
                uiControls[0].classList.remove('visible'); uiControls[1].classList.remove('visible');
            } else {
                const isVisible = !uiControls[0].classList.contains('visible');
                uiControls.forEach(el => el.classList.toggle('visible', isVisible));
            }
            resetHideTimer();
        };

        const resetHideTimer = () => {
            clearTimeout(galleryState.hideControlsTimeout);
            galleryState.hideControlsTimeout = setTimeout(() => {
                uiControls.forEach(el => el.classList.remove('visible'));
            }, 3000);
        };
        galleryState.clickHandler = toggleControls;
        container.addEventListener('click', galleryState.clickHandler);
        setTimeout(() => { uiControls.forEach(el => el.classList.add('visible')); resetHideTimer(); }, 500);

        container.querySelector(".gallery-back-btn").addEventListener("click", closeGallery);
        document.addEventListener("keydown", handleKeyPress);
        document.addEventListener('fullscreenchange', updateFullscreenState);

        setupProgressBar(scrollContainer);
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
        setupLazyLoading(false);
    }

    function setupLazyLoading(isResuming = false, rootMargin = '100%') {
        const token = localStorage.getItem('token'); if (!token) return;
        const scrollContainer = document.querySelector(".gallery-scroll-container"); if (!scrollContainer) return;
        if (!isResuming) {
            DownloadManager.initialize(token);
            if (!scrollContainer.reprioritizeListener) {
                const debouncedReprioritize = debounce(() => DownloadManager.reprioritizeQueue(), 150);
                scrollContainer.addEventListener('scroll', debouncedReprioritize, { passive: true });
                scrollContainer.reprioritizeListener = debouncedReprioritize;
            }
        }
        if (loadObserver) loadObserver.disconnect();
        if (animationObserver) animationObserver.disconnect();

        loadObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.target.dataset.path) {
                    entry.target.classList.add('is-visible');
                    DownloadManager.schedule(entry.target);
                    loadObserver.unobserve(entry.target);
                }
            });
        }, { root: scrollContainer, rootMargin });
        animationObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const imageEl = entry.target;
                    const placeholder = imageEl.closest('.gallery-card')?.querySelector('.card-placeholder');
                    if(placeholder) placeholder.style.opacity = '0';
                    imageEl.classList.add('loaded');
                    observer.unobserve(imageEl);
                }
            });
        }, { root: scrollContainer, rootMargin: '0px' });

        document.querySelectorAll('.gallery-card[data-path]').forEach(card => loadObserver.observe(card));
        if (!isResuming) setTimeout(() => DownloadManager.reprioritizeQueue(), 100);
    }

    function setupProgressBar(scrollContainer) {
        const track = scrollContainer.querySelector('.progress-track'), thumb = scrollContainer.querySelector('.progress-thumb'), label = scrollContainer.querySelector('.progress-label');
        if (!track || !thumb || !label) return;
        const updateProgress = () => {
            const scrollableHeight = scrollContainer.scrollHeight - scrollContainer.clientHeight;
            if (scrollableHeight <= 0) { thumb.style.left = '0%'; label.textContent = imageList.length > 0 ? `1 / ${imageList.length}` : `0 / 0`; return; }
            const progress = scrollContainer.scrollTop / scrollableHeight;
            const currentIndex = Math.min(imageList.length, Math.max(1, Math.floor(progress * imageList.length) + 1));
            thumb.style.left = `${progress * 100}%`;
            label.textContent = `${currentIndex} / ${imageList.length}`;
        };
        galleryState.progressScrollHandler = updateProgress;
        scrollContainer.addEventListener('scroll', updateProgress, { passive: true });

        let isDragging = false;
        const getEventX = (e) => e.clientX || (e.touches && e.touches[0].clientX);
        const startDrag = (e) => { isDragging = true; seek(e); document.body.style.userSelect = 'none'; scrollContainer.style.pointerEvents = 'none'; };
        const endDrag = () => { isDragging = false; document.body.style.userSelect = ''; scrollContainer.style.pointerEvents = ''; };
        const drag = (e) => { if (isDragging) seek(e); };
        const seek = (e) => { const rect = track.getBoundingClientRect(); const clientX = getEventX(e); if (clientX === undefined) return; const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)); scrollContainer.scrollTop = percent * (scrollContainer.scrollHeight - scrollContainer.clientHeight); };

        track.addEventListener('mousedown', startDrag); document.addEventListener('mousemove', drag); document.addEventListener('mouseup', endDrag);
        track.addEventListener('touchstart', startDrag, { passive: true }); document.addEventListener('touchmove', drag, { passive: true }); document.addEventListener('touchend', endDrag);
        updateProgress();
    }

    function toggleFullscreen(element) { if (!document.fullscreenElement) { (element || document.documentElement).requestFullscreen().catch(err => { console.warn(`Fullscreen request failed: ${err.message}`); }); } else { document.exitFullscreen(); } }
    function updateFullscreenState() { /* Future use if needed */ }
    function debounce(func, wait) { let t; return function(...a) { clearTimeout(t); t = setTimeout(() => func.apply(this, a), wait); }; }
    function closeGallery() {
        if (!galleryState.isActive) return; if (galleryState.controller) galleryState.controller.abort(); if (document.fullscreenElement) document.exitFullscreen();
        const sc = document.querySelector(".gallery-scroll-container");
        if (sc) {
            if(galleryState.scrollHandler) sc.removeEventListener('scroll', galleryState.scrollHandler);
            if(galleryState.clickHandler) sc.removeEventListener('click', galleryState.clickHandler);
            if(galleryState.progressScrollHandler) sc.removeEventListener('scroll', galleryState.progressScrollHandler);
            if(sc.reprioritizeListener) sc.removeEventListener('scroll', sc.reprioritizeListener);
        }
        updateViewportMeta(false); // [v20.3] Restore viewport on exit
        clearTimeout(galleryState.hideControlsTimeout);
        DownloadManager.queue = []; galleryState.isActive = false;
        const gc = document.getElementById(GALLERY_CONTAINER_ID);
        if (gc) { gc.classList.remove("gallery-active"); gc.addEventListener("transitionend", () => { gc.remove(); document.body.classList.remove('gallery-is-active'); window.scrollTo(0, galleryState.lastScrollY); }, { once: true }); }
        document.removeEventListener("keydown", handleKeyPress);
        document.removeEventListener('fullscreenchange', updateFullscreenState);
        if (loadObserver) loadObserver.disconnect();
        if (animationObserver) animationObserver.disconnect();
    }
    function handleKeyPress(e) { if (e.key === "Escape") closeGallery(); }

    // [v20.3] New function to manage viewport meta tag
    function updateViewportMeta(enableEdgeToEdge) {
        let viewport = document.querySelector('meta[name="viewport"]');
        if (!viewport) {
            viewport = document.createElement('meta');
            viewport.name = 'viewport';
            document.head.appendChild(viewport);
        }
        if (enableEdgeToEdge) {
            originalViewport = viewport.content;
            viewport.content = `${originalViewport}, viewport-fit=cover`;
        } else if (originalViewport) {
            viewport.content = originalViewport;
        }
    }

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
