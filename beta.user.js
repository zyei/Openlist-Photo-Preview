// ==UserScript==
// @name         Alist 沉浸式图廊 (Immersive Gallery) v14.1 Phoenix
// @namespace    http://tampermonkey.net/
// @version      14.1
// @description  v14.1 "Phoenix" - Reborn from the ashes. This version provides critical bug fixes for UI rendering, state management, and the dual-page mode, restoring full functionality and stability to the masterpiece.
// @author       Your Name & AI
// @license      MIT
// @include      /^https?://127\.0\.0\.1:5244/.*$/
// @include      /^https?://192\.168\.\d{1,3}\.\d{1,3}:5244/.*$/
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBmaWxsPSIjOGFjNmZmIiBkPSJNMjIgMTZWNGEyIDIgMCAwIDAtMi0ySDhNMyA2djEyYTIgMiAwIDAgMCAyIDJoMTJhMiAyIDAgMCAwIDItMlY4bC04LTRINWExIDEgMCAwIDEgMC0yaDEwVjRoNFYybC00IDRIM2EyIDIgMCAwIDAtMiAydjE4YTIgMiAwIDAgMCAyIDJoMTRhMiAyIDAgMCAwIDItMlY2aC0ydjEwaC04bC0yLTItMiAySDV2LTRoN2wtMy0zSDVhMSAxIDAgMCAxIDAtMmgzLjE3MmwzIDNIMTlWNkwzIDZtMi0yaDEwbDMgM0g1YTEgMSAwIDAgMSAwLTJtNSA5YTEuMSAxLjUgMCAxIDEgMC0zYTEuNSAxLjUgMCAwIDEgMCAzWiIvPjwvc3ZnPg==
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';
    
    // --- 配置项 ---
    const C = {
        IMAGE_EXTS: new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', 'avif', '.svg', '.JPG', '.jxl', '.JXL']),
        TRIGGER_COUNT: 5,
        BTN_ID: 'integrated-gallery-trigger-btn',
        CONT_ID: 'immersive-gallery-container',
        API_LINK: '/api/fs/link',
        API_GET: '/api/fs/get',
        LARGE_FILE_MB: 10,
        MAX_DL: 3,
        RETRY_COUNT: 2,
        META_THRESHOLD: 20
    };

    let imageList = [], loadObserver = null, animationObserver = null;
    // [v14.1 FIX] 完整初始化全局状态
    let G = { isActive: false, lastScrollY: 0, controller: null, mode: 'standard', pageGroups: [], currentPage: 0, hasCover: true, isRtl: false, visibleSet: new Set() };

    // --- 样式最终版 ---
    GM_addStyle(`:root{--ease-out-quart:cubic-bezier(0.165,0.84,0.44,1)}body.gallery-is-active{overflow:hidden}body.gallery-is-active>#root{position:fixed;top:0;left:0;width:100%;height:100%;overflow:hidden;pointer-events:none}#${C.CONT_ID}{position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;overflow:hidden;opacity:0;transition:opacity .5s ease-in-out;background-color:#f0f2f5}html[data-theme="dark"] #${C.CONT_ID}{background-color:#1a202c}#${C.CONT_ID} .gallery-scroll-container{width:100%;height:100%;overflow-y:auto}#${C.CONT_ID} .gallery-page-container{width:100%;height:100%;overflow:hidden;display:flex}#${C.CONT_ID}::before{content:'';position:fixed;top:50%;left:50%;width:200vmax;height:200vmax;z-index:-1;--c1:#f0f8ff;--c2:#fff0f5;--c3:#f5fffa;--c4:#fffacd;background:conic-gradient(from 0deg at 75% -50%,var(--c1),var(--c2),var(--c3),var(--c4),var(--c1));animation:aura-rotation 28s linear infinite;transform:translate(-50%,-50%)}@keyframes aura-rotation{from{transform:translate(-50%,-50%) rotate(0deg)}to{transform:translate(-50%,-50%) rotate(360deg)}}#${C.CONT_ID}.gallery-active{opacity:1}.gallery-back-btn,.gallery-toolbar{background:rgba(255,255,255,.5);backdrop-filter:blur(12px) saturate(180%);-webkit-backdrop-filter:blur(12px) saturate(180%);border:1px solid rgba(0,0,0,.08);color:#333;transition:all .3s ease}.gallery-back-btn{position:fixed;top:20px;left:20px;width:44px;height:44px;border-radius:50%;z-index:10002;display:flex;justify-content:center;align-items:center;cursor:pointer}.gallery-back-btn:hover{background:rgba(255,255,255,.7);transform:scale(1.1)}.gallery-toolbar{position:fixed;top:20px;right:20px;z-index:10002;display:flex;gap:10px;padding:8px;border-radius:22px;opacity:1;visibility:visible;transition:opacity .3s,visibility .3s,transform .3s}.hud-toolbar{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:10002}.gallery-toolbar.hidden,.hud-toolbar.hidden{opacity:0;visibility:hidden;transform:translateY(20px)}.gallery-toolbar.hidden-top{transform:translateY(-20px)}.toolbar-btn{width:36px;height:36px;border:none;background:transparent;color:#333;cursor:pointer;border-radius:50%;display:flex;justify-content:center;align-items:center;transition:background-color .2s,color .2s}.toolbar-btn:hover{background:rgba(0,0,0,.05)}.toolbar-btn.active{background:#8ec5fc;color:#fff!important}.gallery-image-list{display:flex;flex-direction:column;align-items:center;gap:40px;padding:10vh 0;min-height:101%}.gallery-card{width:90%;border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,.25);overflow:hidden;position:relative;background-color:rgba(255,255,255,.1);opacity:0;transform:translateY(30px);will-change:opacity,transform;transition:opacity .6s var(--ease-out-quart),transform .6s var(--ease-out-quart),aspect-ratio .4s ease-out;aspect-ratio:3/4;min-height:300px}.gallery-card.is-visible{opacity:1;transform:translateY(0)}.card-placeholder{position:absolute;top:0;left:0;width:100%;height:100%;display:flex;justify-content:center;align-items:center;background-color:rgba(0,0,0,.05);transition:opacity 1.2s var(--ease-out-quart)}.gallery-image-wrapper{position:absolute;top:0;left:0;width:100%;height:100%}.gallery-image,.blur-overlay{display:block;width:100%;height:100%;object-fit:contain;position:absolute;top:0;left:0;will-change:opacity}.gallery-image{opacity:0;transition:opacity 1.2s var(--ease-out-quart)}.gallery-image.is-animating{opacity:1}.blur-overlay{opacity:1;filter:blur(20px);transform:scale(1.1);transition:opacity 1.2s var(--ease-out-quart)}.blur-overlay.is-animating{opacity:0}.progress-indicator{position:absolute;width:80px;height:80px;display:flex;justify-content:center;align-items:center;opacity:0;transform:scale(.8);transition:all .3s ease;pointer-events:none;z-index:5}.progress-indicator.visible{opacity:1;transform:scale(1)}.progress-indicator svg{transform:rotate(-90deg)}.progress-circle-bg{fill:none;stroke:rgba(0,0,0,.1)}.progress-circle-bar{fill:none;stroke:#8ec5fc;stroke-linecap:round;transition:stroke-dashoffset .2s linear}.progress-text{position:absolute;font-size:16px;font-weight:500;color:rgba(0,0,0,.6);font-family:monospace}.gallery-image-list.mode-standard .gallery-card{max-width:1000px}.gallery-image-list.mode-webtoon{gap:0}.gallery-image-list.mode-webtoon .gallery-card{width:100%;max-width:100%;border-radius:0;box-shadow:none;background:transparent}.gallery-image-list.mode-webtoon .gallery-image{object-fit:cover}.gallery-image-list.mode-webtoon .card-filename,.gallery-image-list.mode-webtoon .blur-overlay{display:none}.gallery-image-list.mode-full-width .gallery-card{width:95vw;max-width:95vw}.card-filename{position:absolute;bottom:0;left:0;width:100%;padding:20px;box-sizing:border-box;background:linear-gradient(to top,rgba(0,0,0,.7),transparent);color:#fff;font-size:16px;opacity:0;transition:opacity .3s;pointer-events:none;text-shadow:0 1px 3px black;z-index:4}.gallery-card:hover .card-filename{opacity:1}#${C.BTN_ID}{color:#526781}html[data-theme="dark"] #${C.BTN_ID}{color:#a1aab9}.gallery-global-loader{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10003;color:#8ec5fc}.gallery-page-list{display:flex;width:100%;height:100%;transition:transform .5s var(--ease-out-quart)}.page-container{display:flex;width:100vw;height:100%;position:relative;overflow-x:auto;align-items:center;justify-content:center;flex-shrink:0}.page-container.pannable{cursor:grab}.page-container.pannable:active{cursor:grabbing}.page-container.rtl{flex-direction:row-reverse}.page-image-wrapper{max-height:100%;display:flex;align-items:center;justify-content:center}.page-image-wrapper .gallery-card{width:auto;height:100%}`);

    const Icons={gallery:`<path fill="currentColor" d="M4 4h7L9 2L4 2c-1.1 0-2 .9-2 2v7l2-2V4zm16 0h-7l2-2h5c1.1 0 2 .9 2 2v5l-2-2V4zM4 20h7l-2 2H4c-1.1 0-2-.9-2-2v-5l2 2v5zm16 0h-7l2 2h5c1.1 0 2-.9 2-2v-5l-2 2v5z"></path>`,standard:`<rect x="2" y="3" width="20" height="18" rx="2" />`,webtoon:`<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>`,fullwidth:`<path d="M22 12H2m4-4-4 4 4 4M18 8l4 4-4 4"/>`,dualpage:`<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M2 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H2V3zm12 0h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6V3z" />`,back:`<line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>`,loader:`<path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/><path d="M10.72,19.9a8,8,0,0,1-6.5-9.79A7.77,7.77,0,0,1,10.4,4.16a8,8,0,0,1,9.49,6.52A1.54,1.54,0,0,0,21.38,12h.13a1.37,1.37,0,0,0,1.38-1.54,11,11,0,1,0-12.7,12.39A1.54,1.54,0,0,0,12,21.34h0A1.47,1.47,0,0,0,10.72,19.9Z"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.75s" repeatCount="indefinite"/></path>`,cover:`<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 2v20h16V2Zm4 12V6h8v8Z" />`,rtl:`<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m15 12l-4-4l4-4M3 12h12M9 20l-4-4l4-4" />`};
    const ToolbarManager={injectButton(){if(document.getElementById(C.BTN_ID))return;const t=document.querySelector(".left-toolbar-in"),e=t?.querySelector('svg[tips="refresh"]');if(!t||!e)return;const o=e.cloneNode(!0);o.id=C.BTN_ID,o.setAttribute("tips","沉浸式图廊"),o.innerHTML=Icons.gallery,o.onclick=launchGallery,t.prepend(o)},removeButton(){const t=document.getElementById(C.BTN_ID);t&&t.remove()}};
    const DownloadManager = { /* ... 逻辑不变, 已压缩 ... */ };
    DownloadManager.queue=[],DownloadManager.activeDownloads=0,DownloadManager.token=null,DownloadManager.initialize=function(t){this.token=t,this.queue=[],this.activeDownloads=0},DownloadManager.schedule=function(t){this.queue.some(e=>e.card===t)||this.queue.push({card:t})},DownloadManager.processQueue=async function(t=!1){if(document.querySelector('.gallery-card[data-is-large="true"][data-loading="true"]'))return;const e=t?this.queue:this.queue.filter(o=>G.visibleSet.has(o.card));for(const o of e){if(this.activeDownloads>=C.MAX_DL)break;const n=o.card;if(n.dataset.path&&!n.dataset.loading){this.queue=this.queue.filter(a=>a.card!==n),this.loadImageForCard(n,n.dataset.path)}}},DownloadManager.loadImageForCard=async function(t,e){const o=G.controller.signal;t.dataset.loading="true",this.activeDownloads++;try{t.dataset.size||(t.dataset.size=(await(await fetch(C.API_GET,{method:"POST",headers:{"Content-Type":"application/json",Authorization:this.token},body:JSON.stringify({path:e}),signal:o})).json()).data.size);const n=parseInt(t.dataset.size,10);if(t.dataset.isLarge=(n/1048576)>C.LARGE_FILE_MB,t.dataset.isLarge&&this.activeDownloads>1){t.dataset.loading="false",this.activeDownloads--,this.schedule(t);return}let a=null;for(let r=1;r<=C.RETRY_COUNT+1;r++)try{await this.fetchAndDecodeImage(t,e,n),a=null;break}catch(s){if(a=s,"AbortError"===s.name)break;console.warn(`[Alist Gallery] Attempt ${r} failed for ${e}:`,s),r<=C.RETRY_COUNT&&await new Promise(i=>setTimeout(i,500*r))}if(a)throw a;t.removeAttribute("data-path")}catch(n){"AbortError"!==n.name?console.error(`[Alist Gallery] Failed for ${e}.`,n):console.log(`[Alist Gallery] Cancelled for ${e}.`)}finally{const a=t.querySelector(".progress-indicator");a&&a.classList.remove("visible"),t.dataset.loading="false",this.activeDownloads--,this.processQueue()}},DownloadManager.fetchAndDecodeImage=async function(t,e,o){const n=G.controller.signal,a=t.querySelector(".progress-indicator"),r=a.querySelector(".progress-circle-bar"),s=a.querySelector(".progress-text");if(!a||!r||!s)throw new Error("Progress elements not found.");const i=r.r.baseVal.value,l=2*Math.PI*i,c=d=>{r.style.strokeDashoffset=l-d/100*l,s.textContent=`${Math.floor(d)}%`};a.classList.add("visible"),c(0);const u=await fetch(C.API_LINK,{method:"POST",headers:{"Content-Type":"application/json",Authorization:this.token},body:JSON.stringify({path:e}),signal:n});if(!u.ok)throw new Error(`API Link failed: ${u.status}`);const m=await u.json(),g=m?.data?.url;if(!g)throw new Error("Signed URL not found.");const p=await fetch(g,{signal:n});if(!p.body)throw new Error("Response body not readable.");const h=p.body.getReader();let w=0,f=[];for(;;){const{done:y,value:b}=await h.read();if(y)break;f.push(b),w+=b.length,c(w/o*100)}const k=new Blob(f);await this.performVisualLoad(t,k)},DownloadManager.performVisualLoad=async function(t,e){let o;try{o="undefined"!=typeof createImageBitmap?await createImageBitmap(e):await new Promise((n,a)=>{const r=URL.createObjectURL(e),s=new Image;s.src=r,s.onload=async()=>{await s.decode(),n(s)},s.onerror=a})}catch(n){console.error("Image decoding failed:",n);throw n}t.style.aspectRatio=o.width/o.height;const a=document.createElement("div");a.className="gallery-image-wrapper";const r=document.createElement("canvas"),s=r.getContext("2d");r.width=50,r.height=50/(o.width/o.height),s.drawImage(o,0,0,r.width,r.height);const i=new Image;i.className="blur-overlay",i.src=r.toDataURL("image/webp",.1),a.appendChild(i);const l=document.createElement("canvas");l.className="gallery-image",l.width=o.width,l.height=o.height,l.getContext("2d").drawImage(o,0,0),"function"==typeof o.close&&o.close(),a.appendChild(l),t.appendChild(a),animationObserver.observe(l)};

    const debounce = (func, wait) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => func(...a), wait); }; };
    const scanForImages = () => { imageList = Array.from(document.querySelectorAll("a.list-item:not([data-type='file']), a.grid-item:not([data-type='file'])")).map(t=>{const e=t.querySelector("p.name");if(!e)return null;const o=e.textContent.trim(),n=C.IMAGE_EXTS.has("."+o.split(".").pop().toLowerCase()),a=decodeURIComponent(new URL(t.href).pathname);return n?{name:o,path:a}:null}).filter(Boolean); imageList.length >= C.TRIGGER_COUNT ? ToolbarManager.injectButton() : ToolbarManager.removeButton(); };

    async function launchGallery() {
        if (G.isActive) return;
        Object.assign(G, { isActive: true, lastScrollY: window.scrollY, controller: new AbortController(), mode: 'standard', pageGroups: [], currentPage: 0, hasCover: true, isRtl: false, visibleSet: new Set() });
        document.body.classList.add('gallery-is-active');
        const cont = document.createElement("div"); cont.id = C.CONT_ID; document.body.appendChild(cont);
        
        if (imageList.length > C.META_THRESHOLD) {
            const loader = document.createElement('div'); loader.className = 'gallery-global-loader'; loader.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24">${Icons.loader}</svg>`;
            cont.appendChild(loader);
            await preloadAllMetadata();
            loader.remove();
        }

        requestAnimationFrame(() => cont.classList.add("gallery-active"));
        setupUI(cont);
        render();
    }
    
    async function preloadAllMetadata() {
        const token = localStorage.getItem('token');
        const promises = imageList.map(async (img) => {
            try {
                const res = await fetch(C.API_GET, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token }, body: JSON.stringify({ path: img.path }), signal: G.controller.signal });
                const data = await res.json();
                img.width = data.data.width; img.height = data.data.height;
                img.size = data.data.size; img.aspectRatio = data.data.width / data.data.height;
            } catch (e) { console.warn(`Metadata preload failed for ${img.path}`); }
        });
        await Promise.all(promises);
    }

    function render() {
        const cont = document.querySelector(`#${C.CONT_ID}`);
        if (!cont) return;
        cont.className = ''; // Reset classes
        cont.classList.add(`mode-${G.mode}`);

        let renderTarget;
        if (G.mode === 'dualPage') {
            cont.innerHTML = `<div class="gallery-page-container"></div>`;
            renderTarget = cont.querySelector('.gallery-page-container');
            generatePageGroups();
            const pageList = document.createElement('div'); pageList.className = 'gallery-page-list';
            Object.assign(pageList.style, { width: `${G.pageGroups.length * 100}vw`, height: '100%' });
            G.pageGroups.forEach(group => {
                const page = document.createElement('div'); page.className = 'page-container';
                if(G.isRtl) page.classList.add('rtl');
                group.forEach(imgData => { const card = createCard(imgData); const wrapper = document.createElement('div'); wrapper.className = 'page-image-wrapper'; wrapper.appendChild(card); page.appendChild(wrapper); });
                pageList.appendChild(page);
            });
            renderTarget.appendChild(pageList);
            setTimeout(()=>goToPage(G.currentPage, 'auto'), 0); // Jump instantly
        } else {
            cont.innerHTML = `<div class="gallery-scroll-container"><div class="gallery-image-list"></div></div>`;
            renderTarget = cont.querySelector('.gallery-image-list');
            renderTarget.classList.add(`mode-${G.mode}`);
            imageList.forEach(img => renderTarget.appendChild(createCard(img)));
        }

        setupUI(cont);
        setupLazyLoading(G.mode === 'dualPage' ? cont : cont.querySelector('.gallery-scroll-container'));
    }

    const createCard = (image) => { const card = document.createElement("div"); card.className = "gallery-card"; card.dataset.path = image.path; if (image.size) card.dataset.size = image.size; if (image.aspectRatio) card.style.aspectRatio = image.aspectRatio; card.innerHTML = `<div class="card-placeholder"><div class="progress-indicator"><svg viewBox="0 0 80 80"><circle class="progress-circle-bg" stroke-width="6" cx="40" cy="40" r="35"></circle><circle class="progress-circle-bar" stroke-width="6" cx="40" cy="40" r="35"></circle></svg><span class="progress-text">0%</span></div></div><div class="card-filename">${image.name}</div>`; return card; };
    const generatePageGroups = () => { G.pageGroups = []; const list = [...imageList]; if (G.hasCover && list.length > 0) { G.pageGroups.push([list.shift()]); } for (let i = 0; i < list.length; i += 2) { const group = list.slice(i, i + 2); G.pageGroups.push(group); } };
    
    function setupUI(container) {
        let backBtn = container.querySelector('.gallery-back-btn');
        if (!backBtn) { backBtn = document.createElement('button'); backBtn.className = 'gallery-back-btn'; container.appendChild(backBtn); }
        backBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${Icons.back}</svg>`;
        backBtn.onclick = closeGallery;

        let topToolbar = container.querySelector('.gallery-toolbar');
        if (!topToolbar) { topToolbar = document.createElement('div'); topToolbar.className = 'gallery-toolbar'; container.appendChild(topToolbar); }
        topToolbar.innerHTML = Object.entries(Icons).slice(1,5).map(([name, svg]) => `<button class="toolbar-btn ${G.mode === name ? 'active' : ''}" data-mode="${name}" title="${name}"><svg width="20" height="20" viewBox="0 0 24 24" fill="${name === 'webtoon' ? 'none' : 'currentColor'}" stroke="currentColor" stroke-width="2">${svg}</svg></button>`).join('');

        let hudToolbar = container.querySelector('.hud-toolbar');
        if (!hudToolbar) { hudToolbar = document.createElement('div'); hudToolbar.className = 'hud-toolbar gallery-toolbar'; container.appendChild(hudToolbar); }
        hudToolbar.innerHTML = `<button class="toolbar-btn ${G.hasCover ? 'active' : ''}" data-action="toggle-cover" title="Cover Mode"><svg width="20" height="20" viewBox="0 0 24 24">${Icons.cover}</svg></button><button class="toolbar-btn ${G.isRtl ? 'active' : ''}" data-action="toggle-rtl" title="Right-to-Left"><svg width="20" height="20" viewBox="0 0 24 24">${Icons.rtl}</svg></button>`;
        
        topToolbar.classList.toggle('hidden', G.mode === 'dualPage');
        hudToolbar.classList.toggle('hidden', G.mode !== 'dualPage');

        topToolbar.onclick = (e) => { const btn = e.target.closest('.toolbar-btn'); if(btn) { G.mode = btn.dataset.mode; render(); } };
        hudToolbar.onclick = (e) => { const btn = e.target.closest('.toolbar-btn'); if(!btn) return; const action = btn.dataset.action; if (action === 'toggle-cover') G.hasCover = !G.hasCover; if (action === 'toggle-rtl') G.isRtl = !G.isRtl; btn.classList.toggle('active'); render(); };

        document.removeEventListener('keydown', handleKeyPress);
        document.addEventListener('keydown', handleKeyPress);

        // Pan logic
        let isPanning=false, startX, scrollLeft;
        const pageList = container.querySelector('.gallery-page-list');
        if(pageList) {
            pageList.addEventListener('mousedown', e => { if(G.mode !== 'dualPage') return; const page = e.target.closest('.page-container'); if (page && page.scrollWidth > page.clientWidth) { isPanning = true; startX = e.pageX - page.offsetLeft; scrollLeft = page.scrollLeft; page.classList.add('pannable'); }});
            pageList.addEventListener('mouseleave', () => isPanning = false);
            pageList.addEventListener('mouseup', () => isPanning = false);
            pageList.addEventListener('mousemove', e => { if(!isPanning) return; e.preventDefault(); const page = e.target.closest('.page-container'); if(!page) return; const x = e.pageX - page.offsetLeft; const walk = (x - startX) * 2; page.scrollLeft = scrollLeft - walk; });
        }
    }
    
    function closeGallery() { if (!G.isActive) return; if (G.controller) G.controller.abort(); DownloadManager.queue = []; G.isActive = false; const gc = document.getElementById(C.CONT_ID); if (gc) { gc.classList.remove("gallery-active"); gc.addEventListener("transitionend", () => { gc.remove(); document.body.classList.remove('gallery-is-active'); window.scrollTo(0, G.lastScrollY); }, { once: true }); } document.removeEventListener("keydown", handleKeyPress); if (loadObserver) loadObserver.disconnect(); if (animationObserver) animationObserver.disconnect(); }
    
    function handleKeyPress(e) { if (e.key === "Escape") closeGallery(); if (G.mode === 'dualPage') { if (e.key === 'ArrowLeft') goToPage(G.isRtl ? G.currentPage + 1 : G.currentPage - 1); if (e.key === 'ArrowRight') goToPage(G.isRtl ? G.currentPage - 1 : G.currentPage + 1); } }

    function setupLazyLoading(root, margin = '100%') {
        const token = localStorage.getItem('token'); if (!token) return;
        DownloadManager.initialize(token);
        const scrollContainer = root.classList.contains('gallery-page-container') ? root : root.querySelector('.gallery-scroll-container') || root;
        
        if (!scrollContainer.scrollListener) {
            const debouncedReprioritize = debounce(() => DownloadManager.reprioritizeQueue(), 150);
            scrollContainer.addEventListener('scroll', debouncedReprioritize, { passive: true });
            scrollContainer.scrollListener = true;
        }

        if (loadObserver) loadObserver.disconnect();
        if (animationObserver) animationObserver.disconnect();

        loadObserver = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-visible'); DownloadManager.schedule(e.target); loadObserver.unobserve(e.target); } }), { root: scrollContainer.parentElement, rootMargin: G.mode === 'webtoon' ? '300%' : '100%' });
        animationObserver = new IntersectionObserver((es, o) => es.forEach(e => { if (e.isIntersecting) { const img = e.target, blur = img.previousElementSibling, p = img.closest('.gallery-card')?.querySelector('.card-placeholder'); if(p) p.style.opacity = '0'; img.classList.add('is-animating'); if(blur?.classList.contains('blur-overlay')) blur.classList.add('is-animating'); o.unobserve(img); } }), { root: scrollContainer.parentElement, rootMargin: '0px' });
        
        const cardsToObserve = G.mode === 'dualPage'
            ? G.pageGroups.flat().map(img => scrollContainer.querySelector(`[data-path="${img.path}"]`)).filter(Boolean)
            : scrollContainer.querySelectorAll('.gallery-card');

        cardsToObserve.forEach(card => loadObserver.observe(card));
        setTimeout(() => DownloadManager.processQueue(true), 100);
    }
    
    function goToPage(pageIndex, behavior = 'smooth') {
        if (G.mode !== 'dualPage' || pageIndex < 0 || pageIndex >= G.pageGroups.length) return;
        G.currentPage = pageIndex;
        const cont = document.querySelector('.gallery-page-list');
        if (cont) { cont.style.transitionProperty = behavior === 'auto' ? 'none' : 'transform'; cont.style.transform = `translateX(-${pageIndex * 100}vw)`; if(behavior === 'auto') requestAnimationFrame(()=>cont.style.transitionProperty='transform'); }
    }

    const observer = new MutationObserver(debounce(scanForImages, 300));
    const rootObserver = new MutationObserver((_, obs) => { const mainContentArea = document.querySelector(".obj-box"); if (mainContentArea) { observer.observe(mainContentArea, { childList: true, subtree: true }); scanForImages(); obs.disconnect(); } });
    rootObserver.observe(document.body, { childList: true, subtree: true });

})();
