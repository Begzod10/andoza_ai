/**
 * The brand loading screen: the stepladder logo builds itself from its pieces
 * while renovation and design tools gather into it (the same idea as the
 * mobile app's splash). One source for both places it appears:
 *   - `BrandLoader` (components/BrandLoader.tsx), the Suspense fallback;
 *   - the pre-boot copy inside index.html's #root, shown while the JS bundle
 *     downloads. A test keeps that copy identical to these strings — change
 *     them here and re-paste, or the test fails.
 * Plain CSS + inline SVG (no JS, no assets), so it can run before React does.
 */
export const BRAND_LOADER_CSS = `.bl{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#EDEFF3;font-family:Inter,system-ui,sans-serif;animation:bl-in .3s .2s both}
.bl svg{width:min(72vw,300px);height:auto;overflow:visible}
.bl-w{display:flex;flex-direction:column;align-items:center;gap:6px;animation:bl-fade .7s 2s both}
.bl-n{font-size:34px;font-weight:700;letter-spacing:-.8px;color:#0F172A;line-height:1}
.bl-n i{font-style:normal;color:#F97316}.bl-n b{font-weight:700;color:#2F55D4}
.bl-t{font-size:14px;color:#64748B}
.bl-bar{width:120px;height:3px;border-radius:2px;background:rgba(15,23,42,.08);overflow:hidden;animation:bl-fade .7s 2.2s both}
.bl-bar span{display:block;width:40%;height:100%;border-radius:2px;background:#F97316;animation:bl-slide 1.3s 2.2s ease-in-out infinite}
.bl-p{transform-box:fill-box;transform-origin:center;animation-fill-mode:both;animation-timing-function:cubic-bezier(.22,1,.36,1)}
.bl-rl{animation-name:bl-rl;animation-duration:.8s;animation-delay:.15s}
.bl-rr{animation-name:bl-rr;animation-duration:.8s;animation-delay:.3s}
.bl-r1{animation-name:bl-rung-l;animation-duration:.6s;animation-delay:.85s;animation-timing-function:cubic-bezier(.34,1.56,.64,1)}
.bl-r2{animation:bl-rung-r .6s 1.1s cubic-bezier(.34,1.56,.64,1) both,bl-glow 1.8s 2.7s ease-in-out infinite}
.bl-r3{animation-name:bl-rung-l;animation-duration:.6s;animation-delay:1.3s;animation-timing-function:cubic-bezier(.34,1.56,.64,1)}
.bl-cap{animation-name:bl-cap;animation-duration:.8s;animation-delay:1.5s;animation-timing-function:ease-out}
.bl-base{animation-name:bl-base;animation-duration:.5s;animation-delay:1.95s}
.bl-tool{animation:bl-tool 2.6s var(--d) both ease-in-out}
@keyframes bl-in{from{opacity:0}to{opacity:1}}
@keyframes bl-fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes bl-slide{0%{transform:translateX(-110%)}100%{transform:translateX(280%)}}
@keyframes bl-rl{from{opacity:0;transform:translate(-430px,90px)}to{opacity:1;transform:none}}
@keyframes bl-rr{from{opacity:0;transform:translate(430px,90px)}to{opacity:1;transform:none}}
@keyframes bl-rung-l{from{opacity:0;transform:translateX(-480px) scaleX(.3)}to{opacity:1;transform:none}}
@keyframes bl-rung-r{from{opacity:0;transform:translateX(480px) scaleX(.3)}to{opacity:1;transform:none}}
@keyframes bl-cap{0%{opacity:0;transform:translateY(-320px)}55%{opacity:1;transform:translateY(0)}72%{transform:translateY(-28px)}88%{transform:translateY(0)}94%{transform:translateY(-7px)}100%{opacity:1;transform:none}}
@keyframes bl-base{from{opacity:0;transform:scaleX(0)}to{opacity:1;transform:none}}
@keyframes bl-glow{0%,100%{filter:drop-shadow(0 0 0 rgba(249,115,22,0))}50%{filter:drop-shadow(0 0 9px rgba(249,115,22,.65))}}
@keyframes bl-tool{
0%{opacity:0;transform:rotate(calc(var(--a) + 50deg)) translateX(160px) rotate(calc((var(--a) + 50deg) * -1)) scale(.4)}
16%,52%{opacity:1;transform:rotate(var(--a)) translateX(118px) rotate(calc(var(--a) * -1)) scale(1)}
86%,100%{opacity:0;transform:rotate(calc(var(--a) - 60deg)) translateX(6px) rotate(calc((var(--a) - 60deg) * -1)) scale(.25)}}
@media (prefers-reduced-motion:reduce){.bl,.bl-w,.bl-bar,.bl-p,.bl-bar span{animation:none!important}.bl-tool{display:none}}`

export const BRAND_LOADER_HTML = `<div class="bl" role="status" aria-label="andoza.ai"><div><svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="blg" gradientUnits="userSpaceOnUse" x1="0" y1="96" x2="0" y2="400"><stop offset="0" stop-color="#1E3A8A"/><stop offset="1" stop-color="#2F55D4"/></linearGradient></defs><g transform="translate(150 150)"><g class="bl-tool" style="--a:-90deg;--d:0.0s"><circle r="17" fill="rgba(30,58,138,.07)" stroke="rgba(30,58,138,.22)"/><g transform="translate(-8.4 -8.4) scale(.7)" fill="none" stroke="#1E3A8A" stroke-opacity=".85" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="13" height="5" rx="1.5"/><path d="M17 5.5h2.5v5H11v3"/><rect x="9.5" y="13.5" width="3" height="7" rx="1"/></g></g><g class="bl-tool" style="--a:-45deg;--d:0.03s"><circle r="17" fill="rgba(30,58,138,.07)" stroke="rgba(30,58,138,.22)"/><g transform="translate(-8.4 -8.4) scale(.7)" fill="none" stroke="#1E3A8A" stroke-opacity=".85" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="11" height="5" rx="1" transform="rotate(35 8.5 6.5)"/><path d="M12.5 11.5l8 8"/></g></g><g class="bl-tool" style="--a:0deg;--d:0.06s"><circle r="17" fill="rgba(30,58,138,.07)" stroke="rgba(30,58,138,.22)"/><g transform="translate(-8.4 -8.4) scale(.7)" fill="none" stroke="#1E3A8A" stroke-opacity=".85" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="8" width="19" height="8" rx="1.5"/><path d="M6 8v3M10 8v4M14 8v3M18 8v4"/></g></g><g class="bl-tool" style="--a:45deg;--d:0.09s"><circle r="17" fill="rgba(30,58,138,.07)" stroke="rgba(30,58,138,.22)"/><g transform="translate(-8.4 -8.4) scale(.7)" fill="none" stroke="#1E3A8A" stroke-opacity=".85" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.6 0 2-1 1.5-2-.6-1.2.2-2.5 1.7-2.5H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15.5" cy="8" r="1"/></g></g><g class="bl-tool" style="--a:90deg;--d:0.12s"><circle r="17" fill="rgba(30,58,138,.07)" stroke="rgba(30,58,138,.22)"/><g transform="translate(-8.4 -8.4) scale(.7)" fill="none" stroke="#1E3A8A" stroke-opacity=".85" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></g></g><g class="bl-tool" style="--a:135deg;--d:0.15s"><circle r="17" fill="rgba(30,58,138,.07)" stroke="rgba(30,58,138,.22)"/><g transform="translate(-8.4 -8.4) scale(.7)" fill="none" stroke="#1E3A8A" stroke-opacity=".85" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v5M5 11h14v4H5zM7 15v5M17 15v5"/></g></g><g class="bl-tool" style="--a:180deg;--d:0.18s"><circle r="17" fill="rgba(30,58,138,.07)" stroke="rgba(30,58,138,.22)"/><g transform="translate(-8.4 -8.4) scale(.7)" fill="none" stroke="#1E3A8A" stroke-opacity=".85" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l6 17M12 3L6 20M8.5 14h7"/><circle cx="12" cy="3.5" r="1.2"/></g></g><g class="bl-tool" style="--a:225deg;--d:0.21s"><circle r="17" fill="rgba(30,58,138,.07)" stroke="rgba(30,58,138,.22)"/><g transform="translate(-8.4 -8.4) scale(.7)" fill="none" stroke="#1E3A8A" stroke-opacity=".85" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="18" rx="1.2"/><circle cx="15" cy="12.5" r="1"/></g></g></g><g transform="translate(150 148) scale(.42) translate(-256 -247)"><g class="bl-p bl-base"><ellipse cx="256" cy="436" rx="170" ry="13" fill="#1E3A8A" opacity=".16"/><path d="M84,436H428" stroke="#1E3A8A" stroke-width="12" stroke-linecap="round" opacity=".55" fill="none"/></g><path class="bl-p bl-rl" d="M216,96L112,400" stroke="url(#blg)" stroke-width="42" stroke-linecap="round" fill="none"/><path class="bl-p bl-rr" d="M296,96L400,400" stroke="url(#blg)" stroke-width="42" stroke-linecap="round" fill="none"/><path class="bl-p bl-r1" d="M184.9,187H327.1" stroke="#4F7DF3" stroke-width="32" stroke-linecap="round" fill="none"/><path class="bl-p bl-r2" d="M156.8,269H355.2" stroke="#F97316" stroke-width="32" stroke-linecap="round" fill="none"/><path class="bl-p bl-r3" d="M128.8,351H383.2" stroke="#4F7DF3" stroke-width="32" stroke-linecap="round" fill="none"/><rect class="bl-p bl-cap" x="186" y="58" width="140" height="38" rx="19" fill="url(#blg)"/></g></svg></div><div class="bl-w"><div class="bl-n">andoza<i>.</i><b>ai</b></div><div class="bl-t">Ta'mir va interyer loyihalaringiz bir joyda</div></div><div class="bl-bar"><span></span></div></div>`
