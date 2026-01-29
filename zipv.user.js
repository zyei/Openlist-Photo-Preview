// ==UserScript==
// @name         OpenList Cinema
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  High-performance, immersive poster wall and webtoon reader for OpenList.
// @author       Advanced AI
// @match        *://*/*
// @include      *
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    const C = {
        CONCURRENCY: 8,
        PRELOAD: "200% 0px 200% 0px",
        ZIP_RX: /\.(zip|cbz)$/i,
        IMG_RX: /\.(jpg|jpeg|png|webp|gif|bmp)$/i,
        FILE_RX: /\.[a-zA-Z0-9]{2,5}$/,
        COVER_RX: /cover|front|folder|index|^0+1\.|^000\.|^001\.|^01\./i,
        API: '/api/fs/archive/meta'
    };

    GM_addStyle(`:root{--c-bg:#fdfcff;--c-card:rgba(255,255,255,0.9);--c-text:#2d2a32;--c-sub:#7a7a85;--c-acc:#7b5cab;--c-acc-h:#6a4c9a;--c-shd:0 4px 20px rgba(123,92,171,0.06);--c-shd-h:0 12px 32px rgba(123,92,171,0.15);--c-w:175px;--c-g:28px}html.ozs-lock,body.ozs-lock{overflow:hidden!important;height:100vh!important}.header-row,.hope-stack.title,.list-header,div[class*="title"][class*="stack"]{display:none!important}.list,.hope-stack.list,.obj-box>.list,div[class*="list"][class*="stack"]{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(var(--c-w),1fr))!important;gap:var(--c-g)!important;padding:40px 60px!important;width:100%!important;box-sizing:border-box!important;background:0 0!important}.list-item,a.list-item,div[class*="list-item"]{display:flex!important;flex-direction:column!important;height:auto!important;background:var(--c-card)!important;backdrop-filter:blur(10px);border-radius:12px!important;overflow:hidden!important;padding:0!important;box-shadow:var(--c-shd)!important;border:1px solid rgba(255,255,255,.8)!important;position:relative!important;text-decoration:none!important;cursor:default!important;transition:transform .3s cubic-bezier(.2,0,0,1),box-shadow .3s ease!important;transform:translateZ(0);-webkit-font-smoothing:subpixel-antialiased}.list-item:hover{transform:translateY(-6px) translateZ(0)!important;box-shadow:var(--c-shd-h)!important;z-index:5}.ozs-wrap{position:relative;width:100%;aspect-ratio:2/3;background:linear-gradient(135deg,#2a2a2a 25%,#333 50%,#2a2a2a 75%);background-size:200% 100%;animation:ozs-s 2s infinite linear;overflow:hidden}.ozs-img{width:105%;height:105%;object-fit:cover;display:block;opacity:0;margin:-.25%;transition:opacity .6s ease-in-out,transform .6s cubic-bezier(.2,0,0,1);will-change:transform,opacity}.ozs-img.l{opacity:1}.list-item:hover .ozs-img{transform:scale(1.08)}.ozs-def{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(160deg,#fbfbfd 0,#f0ebf8 100%)}.ozs-ico{font-size:36px;margin-bottom:8px;opacity:.4}.ozs-tag{font-size:11px;color:#888;font-weight:700;letter-spacing:1px;text-transform:uppercase}.ozs-overlay{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,rgba(0,0,0,.9) 0,rgba(0,0,0,.5) 60%,transparent 100%);padding:30px 12px 10px;pointer-events:none;z-index:2}.ozs-txt{color:#fff;font-size:13px;font-weight:600;text-shadow:0 2px 6px rgba(0,0,0,.8);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.4}.ozs-btn{display:block;width:100%;height:38px;border:none;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;z-index:3;background:#fff;color:#b0b0b0;transition:background .4s ease,color .4s ease;position:relative}.ozs-btn.c{color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.3)}.ozs-btn:hover{filter:brightness(.95)}.list-item svg,.list-item .size,.list-item .modified,.list-item .checkbox,.list-item .name{display:none!important}@keyframes ozs-s{0%{background-position:100% 0}100%{background-position:-100% 0}}#ir{position:fixed;inset:0;z-index:2147483647;background:#fff;display:flex;flex-direction:column;font-family:"Segoe UI",sans-serif;user-select:none}.ir-hud-t,.ir-hud-b{position:fixed;left:0;right:0;background:rgba(255,255,255,.9);backdrop-filter:blur(20px);z-index:200;transition:transform .4s cubic-bezier(.2,0,0,1);padding:0 32px}.ir-hud-t{top:0;height:60px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 1px 10px rgba(0,0,0,.05)}.ir-hud-b{bottom:0;height:80px;display:flex;flex-direction:column;justify-content:center;box-shadow:0 -1px 10px rgba(0,0,0,.05)}.ir-hud-t.h{transform:translateY(-100%)}.ir-hud-b.h{transform:translateY(100%)}.ir-sli-box{display:flex;align-items:center;gap:20px;width:100%;max-width:600px;margin:0 auto}.ir-inf{font-family:monospace;font-size:14px;font-weight:600;color:var(--c-acc);min-width:60px;text-align:center}.ir-sli{flex:1;-webkit-appearance:none;height:4px;border-radius:2px;background:rgba(123,92,171,.2);outline:0;cursor:pointer}.ir-sli::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--c-acc);border:3px solid #fff;box-shadow:0 2px 8px rgba(123,92,171,.4);transition:transform .1s}.ir-sli::-webkit-slider-thumb:hover{transform:scale(1.3)}.ir-v{flex:1;overflow-y:auto;width:100%;height:100%;display:block;background:#222;scroll-behavior:auto}.ir-v::-webkit-scrollbar{display:none}.ir-p{width:100%;margin:0;padding:0;border:none;display:block;position:relative;background:#222;min-height:200px}.ir-img{display:block;width:100%;height:auto;opacity:0;transition:opacity .3s ease-in;will-change:transform}.ir-img.v{opacity:1}.ir-load{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;border:3px solid rgba(255,255,255,.1);border-top-color:var(--c-acc);border-radius:50%;animation:ir-s .8s linear infinite;z-index:1;pointer-events:none}@keyframes ir-s{to{transform:translate(-50%,-50%) rotate(360deg)}}.ir-cls{background:rgba(0,0,0,.05);color:#333;border:none;padding:8px 20px;border-radius:20px;cursor:pointer;font-weight:600;font-size:13px;transition:all .2s}.ir-cls:hover{background:#e81123;color:#fff}.ir-tit{font-weight:700;font-size:16px;color:#333;opacity:.8;max-width:80%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ir-err{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#d32f2f;font-size:12px;background:#fff0f0}`);

    const U = {
        token: () => localStorage.getItem('token') || localStorage.getItem('alist_token') || '',
        esc: t => t ? t.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : t,
        req: (u, d) => new Promise((rv, rj) => GM_xmlhttpRequest({ method: "POST", url: u, headers: { "Content-Type": "application/json", "Authorization": U.token() }, data: JSON.stringify(d), onload: r => { try { const j = JSON.parse(r.responseText); j.code === 200 ? rv(j.data) : rj(); } catch { rj(); } }, onerror: rj })),
        flat: (n, p = "") => { let r = []; if (!n) return r; n.forEach(x => { let f = p + "/" + x.name; x.is_dir && x.children ? r = r.concat(U.flat(x.children, f)) : C.IMG_RX.test(x.name) && r.push({ n: x.name, p: f }); }); return r; },
        col: (el, cb) => {
            if (el.dataset.c) return cb(el.dataset.c, el.dataset.l === '1');
            if (!el.complete) return el.addEventListener('load', () => U.col(el, cb), { once: 1 });
            try {
                const c = document.createElement('canvas'), x = c.getContext('2d');
                c.width = c.height = 1; x.drawImage(el, 0, 0, 1, 1);
                const [r, g, b] = x.getImageData(0, 0, 1, 1).data, l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                const h = `rgb(${r},${g},${b})`; el.dataset.c = h; el.dataset.l = l > 140 ? '1' : '0';
                cb(h, l > 140);
            } catch { cb(null, 0); }
        }
    };

    class App {
        constructor() { this.q = 0; this.io(); new MutationObserver(() => this.dom()).observe(document.body, { childList: 1, subtree: 1 }); this.dom(); }
        dom() {
            document.querySelectorAll('.list-item:not([data-oz])').forEach(el => {
                el.dataset.oz = "1";
                const nEl = el.querySelector('.name') || el.querySelector('.text-truncate');
                const raw = nEl ? nEl.textContent.trim() : "File", safe = U.esc(raw);
                const isZip = C.ZIP_RX.test(raw);
                let href = decodeURIComponent(el.getAttribute('href') || el.dataset.path || "");
                if (!href && el.querySelector('a')) href = decodeURIComponent(el.querySelector('a').getAttribute('href'));

                let html = isZip ? `<img class="ozs-img" loading="lazy" data-p="${href}"><div class="ozs-overlay"><div class="ozs-txt">${safe}</div></div>` :
                    `<div class="ozs-def"><div class="ozs-ico">${(el.querySelector('svg[viewBox*="folder"]')||(!isZip&&!C.FILE_RX.test(raw)))?'📁':'📄'}</div></div><div class="ozs-overlay"><div class="ozs-txt">${safe}</div></div>`;
                el.innerHTML = `<div class="ozs-wrap">${html}</div>${isZip?`<button class="ozs-btn">READ</button>`:''}`;

                if (isZip) {
                    const btn = el.querySelector('.ozs-btn'), img = el.querySelector('.ozs-img');
                    btn.onclick = e => { e.preventDefault(); e.stopPropagation(); new Reader(safe, href); };
                    this.obs.observe(img);
                    img.addEventListener('load', () => U.col(img, (c, l) => { if (c) { btn.style.backgroundColor = c; btn.classList.add('c'); if (l) btn.style.color = '#222'; } }));
                }
            });
        }
        io() { this.obs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { this.obs.unobserve(e.target); this.load(e.target); } }), { rootMargin: '300px' }); }
        async load(img) {
            if (this.q >= C.CONCURRENCY) return setTimeout(() => this.load(img), 200);
            this.q++;
            try {
                const d = await U.req(C.API, { path: img.dataset.p, password: "" });
                const f = U.flat(d.content), t = f.find(x => C.COVER_RX.test(x.n)) || f[0];
                if (t) { img.src = `${d.raw_url}?sign=${d.sign}&inner=${encodeURIComponent(t.p)}`; img.onload = () => img.classList.add('l'); }
                else img.style.display = 'none';
            } catch {} finally { this.q--; }
        }
    }

    class Reader {
        constructor(t, p) {
            document.documentElement.classList.add('ozs-lock'); document.body.classList.add('ozs-lock');
            this.bd(t); this.init(p);
        }
        async init(p) {
            try {
                this.m = await U.req(C.API, { path: p, password: "" });
                this.fs = U.flat(this.m.content).sort((a, b) => a.n.localeCompare(b.n, undefined, { numeric: 1 }));
                if (!this.fs.length) throw 0;
                this.sl.max = this.fs.length; this.tt.innerText = `/ ${this.fs.length}`;
                this.rnd(); this.t();
            } catch { this.cls(); }
        }
        bd(t) {
            this.el = document.createElement('div'); this.el.id = 'ir';
            this.el.innerHTML = `<div class="ir-hud-t" id="ht"><div class="ir-tit">${t}</div><button class="ir-cls">Close</button></div><div class="ir-v" id="iv"></div><div class="ir-hud-b" id="hb"><div class="ir-sli-box"><span class="ir-inf" id="ic">1</span><input type="range" class="ir-sli" id="is" min="1" step="1" value="1"><span class="ir-inf" id="it">/ 0</span></div></div>`;
            document.body.appendChild(this.el);
            this.v = this.el.querySelector('#iv'); this.sl = this.el.querySelector('#is'); this.cur = this.el.querySelector('#ic'); this.tt = this.el.querySelector('#it');
            this.ht = this.el.querySelector('#ht'); this.hb = this.el.querySelector('#hb');
            this.el.querySelector('.ir-cls').onclick = () => this.cls();
            this.v.onclick = e => { if (e.target.tagName !== 'INPUT') { this.ht.classList.toggle('h'); this.hb.classList.toggle('h'); } };
            this.v.addEventListener('scroll', () => { if (!this.ht.classList.contains('h')) { this.ht.classList.add('h'); this.hb.classList.add('h'); } window.requestAnimationFrame(() => this.upd()); }, { passive: 1 });
            this.el.onmousemove = e => { if (e.clientY < 80 || e.clientY > window.innerHeight - 80) { this.ht.classList.remove('h'); this.hb.classList.remove('h'); this.t(); } };
            this.sl.oninput = e => { const i = parseInt(e.target.value) - 1; if (this.fs[i] && this.fs[i].el) this.fs[i].el.scrollIntoView({ behavior: 'auto', block: 'start' }); };
            this.sl.onmousedown = this.sl.onclick = e => e.stopPropagation();
        }
        t() { clearTimeout(this.tm); this.tm = setTimeout(() => { this.ht.classList.add('h'); this.hb.classList.add('h'); }, 3000); }
        upd() {
            const c = this.v.scrollTop + this.v.clientHeight / 2;
            for (let i = 0; i < this.fs.length; i++) {
                if (this.fs[i].el.offsetTop + this.fs[i].el.offsetHeight > c) {
                    if (this.sl.value != i + 1) { this.sl.value = i + 1; this.cur.innerText = i + 1; } break;
                }
            }
        }
        rnd() {
            const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? this.ld(e.target.f) : this.uld(e.target.f)), { root: this.v, rootMargin: C.PRELOAD });
            this.fs.forEach(f => {
                const d = document.createElement('div'); d.className = 'ir-p'; d.innerHTML = `<div class="ir-load"></div><img class="ir-img" referrerpolicy="no-referrer">`;
                d.f = f; f.el = d; this.v.appendChild(d); io.observe(d);
            });
        }
        ld(f) {
            if (f.l) return;
            const i = f.el.querySelector('.ir-img'), u = `${this.m.raw_url}?sign=${this.m.sign}&inner=${encodeURIComponent(f.p)}`;
            i.onload = () => { i.classList.add('v'); f.el.querySelector('.ir-load')?.remove(); f.h = i.offsetHeight; f.l = 1; };
            i.onerror = () => { f.el.innerHTML = `<div class="ir-err">Error</div>`; }; i.src = u;
        }
        uld(f) {
            if (!f.l) return;
            const i = f.el.querySelector('.ir-img');
            if (i && f.h) {
                f.el.style.height = f.h + 'px'; i.removeAttribute('src'); i.classList.remove('v'); f.l = 0;
                if (!f.el.querySelector('.ir-load')) { const l = document.createElement('div'); l.className = 'ir-load'; f.el.prepend(l); }
            }
        }
        cls() { document.documentElement.classList.remove('ozs-lock'); document.body.classList.remove('ozs-lock'); this.el.remove(); this.fs = []; this.m = null; }
    }

    new App();
})();
