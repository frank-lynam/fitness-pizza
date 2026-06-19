/**
 * Fitness Pizza — Secret Easter Eggs 🐰🌈🦄
 * Hidden surprises for curious users. Shh.
 */

// ── Inject animations once ────────────────────────────────────────────────
const _style = document.createElement('style');
_style.textContent = `
@keyframes fp-slide-across {
    from { transform: translateX(-160px); }
    to   { transform: translateX(calc(100vw + 160px)); }
}
@keyframes fp-bunny-hop {
    0%,100% { transform: translateY(0) scaleX(var(--sx,1)); }
    40%     { transform: translateY(-38px) scaleX(var(--sx,1)); }
    55%     { transform: translateY(-32px) scaleX(var(--sx,1)); }
}
@keyframes fp-float-up {
    0%   { transform: translate(0,0) rotate(0deg) scale(1); opacity:1; }
    100% { transform: translate(var(--dx,0px),var(--dy,-200px)) rotate(var(--rot,360deg)) scale(0.2); opacity:0; }
}
@keyframes fp-pop-in {
    0%   { transform: scale(0) translateY(30px); opacity:0; }
    55%  { transform: scale(1.25) translateY(-8px); opacity:1; }
    75%  { transform: scale(0.92) translateY(4px); }
    100% { transform: scale(1) translateY(0); opacity:1; }
}
@keyframes fp-pop-out {
    0%   { transform: scale(1) translateY(0); opacity:1; }
    35%  { transform: scale(1.15) translateY(-14px); opacity:1; }
    100% { transform: scale(0) translateY(50px); opacity:0; }
}
@keyframes fp-bubble-in {
    0%   { transform: scale(0) translateY(8px); opacity:0; }
    100% { transform: scale(1) translateY(0); opacity:1; }
}
@keyframes fp-fade-arc {
    0%   { opacity:0; }
    18%  { opacity:1; }
    82%  { opacity:1; }
    100% { opacity:0; }
}
@keyframes fp-rainbow-flash {
    0%   { opacity:0; }
    12%  { opacity:0.78; }
    88%  { opacity:0.78; }
    100% { opacity:0; }
}
@keyframes fp-logo-spin {
    0%   { transform: rotate(0deg) scale(1); }
    50%  { transform: rotate(180deg) scale(1.3); }
    100% { transform: rotate(360deg) scale(1); }
}
@keyframes fp-text-rainbow {
    0%   { filter: hue-rotate(0deg); }
    100% { filter: hue-rotate(360deg); }
}
@keyframes fp-wiggle {
    0%,100% { transform: rotate(-8deg); }
    50%     { transform: rotate(8deg); }
}
`;
document.head.appendChild(_style);

// ── Tiny helpers ──────────────────────────────────────────────────────────

function _div(css, html) {
    const d = document.createElement('div');
    d.style.cssText = css;
    if (html) d.innerHTML = html;
    return d;
}

function _gone(node, ms) { setTimeout(() => node?.remove(), ms); }

function _layer(css = '') {
    const d = _div(`position:fixed;inset:0;pointer-events:none;z-index:99999;overflow:hidden;${css}`);
    document.body.appendChild(d);
    return d;
}

// ── Animations ────────────────────────────────────────────────────────────

// 🦄 A unicorn gallops full-width with a rainbow particle trail
function doUnicornGallop() {
    const layer = _layer();
    const y = window.innerHeight * 0.40;
    const colors = ['#ff3333','#ff9900','#ffee00','#44dd44','#3399ff','#9944ff','#ff44cc'];

    // Rainbow sparkle trail (dots left behind)
    for (let i = 0; i < 36; i++) {
        const dot = _div(`
            position:absolute;
            width:${10 + Math.random()*12}px; height:${10 + Math.random()*12}px;
            border-radius:50%;
            background:${colors[i % 7]};
            left:${i * 2.5 + 2}%;
            top:${y + Math.sin(i * 0.55) * 34}px;
            opacity:0;
            box-shadow:0 0 8px ${colors[i % 7]};
            animation:fp-fade-arc 0.45s ease ${i * 0.055}s both;
        `);
        layer.appendChild(dot);
    }

    // The unicorn itself
    const uni = _div(`
        position:absolute;
        top:${y - 60}px; left:0;
        font-size:96px; line-height:1;
        filter:drop-shadow(0 0 18px rgba(200,100,255,0.9));
        animation:fp-slide-across 2.4s cubic-bezier(0.25,0,0.75,1) forwards;
    `, '🦄');
    layer.appendChild(uni);

    // Floating banner
    const banner = _div(`
        position:absolute;
        top:${y - 116}px; left:50%;
        transform:translateX(-50%);
        font-size:22px; font-weight:900; white-space:nowrap;
        font-family:system-ui,sans-serif; letter-spacing:3px;
        background:linear-gradient(90deg,#ff0,#f0f,#0ff,#0f0,#ff0);
        background-size:200%;
        -webkit-background-clip:text; -webkit-text-fill-color:transparent;
        background-clip:text;
        opacity:0;
        animation:fp-fade-arc 2.4s ease 0.2s both, fp-text-rainbow 1.5s linear 0.2s infinite;
    `, '✨ UNICORN MODE ACTIVATED ✨');
    layer.appendChild(banner);

    _gone(layer, 3400);
}

// 🐰 A parade of bunnies bounces across the screen in a joyful procession
function doBunnyParade(count = 9) {
    const layer = _layer();
    const baseY = window.innerHeight * 0.72;

    for (let i = 0; i < count; i++) {
        const size = 42 + Math.random() * 28;
        const yOff = (Math.random() - 0.5) * 48;
        const speed = 1.6 + Math.random() * 0.7;
        const delay = i * 0.20;
        const hopSpeed = 0.32 + Math.random() * 0.18;
        const flipped = Math.random() > 0.5 ? -1 : 1;

        const b = _div(`
            position:absolute;
            font-size:${size}px;
            top:${baseY + yOff - size}px;
            left:-${size + 30}px;
            --sx:${flipped};
            filter:drop-shadow(0 4px 10px rgba(0,0,0,0.35));
            animation:
                fp-slide-across ${speed}s ease ${delay}s forwards,
                fp-bunny-hop ${hopSpeed}s ease-in-out ${delay}s infinite;
        `, '🐰');
        layer.appendChild(b);
    }

    _gone(layer, 5000);
}

// 🌈 A rainbow arc fills the top of the screen with bunnies at each foot
function doRainbowArc() {
    const layer = _layer('height:320px;top:0;bottom:auto;');
    const W = window.innerWidth;
    const H = 300;
    const colors = ['#ff2200','#ff8800','#ffee00','#33cc44','#2288ff','#4400bb','#aa00cc'];

    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio','none');
    svg.style.cssText = `position:absolute;top:0;left:0;width:100%;height:${H}px;
        opacity:0;animation:fp-fade-arc 3.0s ease forwards;`;

    colors.forEach((color, i) => {
        const ry = H * (1 - i * 0.09);
        const p = document.createElementNS('http://www.w3.org/2000/svg','path');
        p.setAttribute('d', `M 0,${H} A ${W / 2},${ry} 0 0 1 ${W},${H}`);
        p.setAttribute('fill','none');
        p.setAttribute('stroke',color);
        p.setAttribute('stroke-width','26');
        p.setAttribute('opacity','0.85');
        svg.appendChild(p);
    });
    layer.appendChild(svg);

    // Bunnies sitting at each end of the rainbow
    const leftBunny = _div(`
        position:absolute;left:6px;bottom:0;font-size:38px;
        animation:fp-pop-in 0.5s ease 0.4s both;
    `, '🐰');
    const rightBunny = _div(`
        position:absolute;right:6px;bottom:0;font-size:38px;
        transform:scaleX(-1);
        animation:fp-pop-in 0.5s ease 0.6s both;
    `, '🐰');
    layer.appendChild(leftBunny);
    layer.appendChild(rightBunny);

    _gone(layer, 3800);
}

// 💥 Emojis explode outward from a screen coordinate
function doConfettiExplosion(clientX, clientY) {
    const cast = ['🌈','🐰','🦄','✨','🌟','💫','🎉','🍭'];
    const N = 22;
    for (let i = 0; i < N; i++) {
        const angle = (i / N) * Math.PI * 2;
        const dist  = 70 + Math.random() * 90;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        const rot = (Math.random() - 0.5) * 720;
        const e = _div(`
            position:fixed;
            left:${clientX}px; top:${clientY}px;
            font-size:${18 + Math.random() * 16}px;
            pointer-events:none; z-index:99999;
            --dx:${dx}px; --dy:${dy}px; --rot:${rot}deg;
            animation:fp-float-up ${0.7 + Math.random() * 0.5}s ease-out ${i * 0.03}s both;
        `, cast[i % cast.length]);
        document.body.appendChild(e);
        _gone(e, 1600);
    }
}

// 🐰 A bunny pops up from near the element with a speech bubble
function doMagicBunny(anchorEl, message) {
    const rect = anchorEl.getBoundingClientRect();
    const left = Math.min(Math.max(rect.left - 30, 10), window.innerWidth - 220);
    const bottom = window.innerHeight - rect.top + 12;

    const wrap = _div(`
        position:fixed;
        left:${left}px; bottom:${bottom}px;
        pointer-events:none; z-index:99999;
        font-family:system-ui,sans-serif;
    `);

    const bubble = _div(`
        background:#1a0a2e;
        border:2px solid #bb66ff;
        border-radius:14px 14px 14px 2px;
        padding:10px 14px;
        font-size:13px; line-height:1.5;
        color:#e8d4ff; max-width:200px;
        box-shadow:0 4px 24px rgba(150,0,255,0.45);
        margin-bottom:8px;
        animation:fp-bubble-in 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards;
        white-space:pre-line;
    `, message);

    const bunny = _div(`
        font-size:54px;
        filter:drop-shadow(0 0 12px rgba(200,150,255,0.7));
        animation:fp-pop-in 0.4s cubic-bezier(0.34,1.56,0.64,1) 0.1s both;
    `, '🐰');

    wrap.appendChild(bubble);
    wrap.appendChild(bunny);
    document.body.appendChild(wrap);

    setTimeout(() => {
        bunny.style.animation = 'fp-pop-out 0.45s ease forwards';
        bubble.style.animation = 'fp-pop-out 0.4s ease 0.05s forwards';
        _gone(wrap, 600);
    }, 2400);
}

// 🎊 Full party — everything at once (Konami reward)
function doFullParty() {
    // Full-screen rainbow flash
    const flash = _div(`
        position:fixed;inset:0;pointer-events:none;z-index:99997;
        background:linear-gradient(135deg,
            #ff000055,#ff880055,#ffee0055,
            #00cc4455,#2288ff55,#aa00cc55,#ff44aa55);
        animation:fp-rainbow-flash 3.5s ease forwards;
    `);
    document.body.appendChild(flash);
    _gone(flash, 3600);

    // Stagger the effects
    setTimeout(() => doRainbowArc(), 0);
    setTimeout(() => doUnicornGallop(), 200);
    setTimeout(() => doBunnyParade(14), 500);

    // Rain of party emojis from the top
    const cast = ['🌈','🐰','🦄','✨','🎉','💫','🌟','🍭','⭐'];
    for (let i = 0; i < 35; i++) {
        setTimeout(() => {
            const e = _div(`
                position:fixed;
                left:${5 + Math.random()*90}vw; top:-60px;
                font-size:${20 + Math.random()*22}px;
                pointer-events:none; z-index:99999;
                --dx:${(Math.random()-0.5)*60}px;
                --dy:${window.innerHeight + 80}px;
                --rot:${(Math.random()-0.5)*540}deg;
                animation:fp-float-up ${1.8 + Math.random()*1.2}s ease-in ${Math.random()*0.6}s both;
            `, cast[Math.floor(Math.random()*cast.length)]);
            // Invert the float-up to float-down by changing the dy sign above — actually
            // we want them to fall downward, so let's just use a separate approach:
            e.style.animationName = '';
            e.style.transition = `transform ${1.8 + Math.random()*1.2}s ease-in ${Math.random()*0.6}s, opacity 0.5s ease ${2.5}s`;
            e.style.transform = 'translateY(0)';
            document.body.appendChild(e);
            requestAnimationFrame(() => requestAnimationFrame(() => {
                e.style.transform = `translateY(${window.innerHeight + 80}px) rotate(${(Math.random()-0.5)*540}deg)`;
                e.style.opacity = '0';
            }));
            _gone(e, 3500);
        }, i * 70);
    }

    // Victory toast
    setTimeout(() => {
        const toast = _div(`
            position:fixed;
            top:50%;left:50%;
            transform:translate(-50%,-50%);
            background:linear-gradient(145deg,#1a0635,#2e0a55);
            border:2px solid #cc88ff;
            border-radius:24px;
            padding:28px 40px;
            text-align:center;
            pointer-events:none;
            z-index:99999;
            font-family:system-ui,sans-serif;
            box-shadow:0 0 60px rgba(180,60,255,0.6), 0 0 120px rgba(180,60,255,0.2);
            animation:fp-pop-in 0.55s cubic-bezier(0.34,1.56,0.64,1) forwards;
        `, `
            <div style="font-size:52px;line-height:1.3">🌈🐰🦄</div>
            <div style="margin-top:10px;font-size:18px;font-weight:900;letter-spacing:2px;
                background:linear-gradient(90deg,#ff0,#f0f,#0ff,#0f0,#ff0);
                background-size:200%;
                -webkit-background-clip:text;-webkit-text-fill-color:transparent;
                background-clip:text;
                animation:fp-text-rainbow 2s linear infinite;">
                SECRET UNLOCKED
            </div>
            <div style="margin-top:8px;font-size:13px;color:#cc99ff;">
                ↑↑↓↓←→←→BA — you absolute legend 🎮
            </div>
        `);
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'fp-pop-out 0.5s ease forwards';
            _gone(toast, 600);
        }, 3200);
    }, 600);
}

// 🌈 The dashboard nav icon spins and spits rainbows when rage-clicked
function doNavRainbow(navBtn) {
    // Temporarily animate the icon
    const icon = navBtn.querySelector('.nav-icon');
    if (!icon) return;
    const orig = icon.style.cssText;
    icon.style.cssText += ';animation:fp-logo-spin 0.8s ease forwards,fp-text-rainbow 0.8s linear infinite;display:inline-block;';
    setTimeout(() => { icon.style.cssText = orig; }, 900);

    // Spray emojis upward from the nav bar
    const rect = navBtn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top;
    const cast = ['🌈','🐰','🦄','✨','💫'];
    for (let i = 0; i < 12; i++) {
        const e = _div(`
            position:fixed;
            left:${cx}px; top:${cy}px;
            font-size:${16 + Math.random()*14}px;
            pointer-events:none; z-index:99999;
        `, cast[i % cast.length]);
        document.body.appendChild(e);
        const tx = (Math.random() - 0.5) * 120;
        const ty = -(60 + Math.random() * 120);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            e.style.transition = `transform 0.9s ease-out ${i*0.04}s, opacity 0.4s ease ${0.5+i*0.04}s`;
            e.style.transform = `translate(${tx}px,${ty}px) rotate(${(Math.random()-0.5)*360}deg)`;
            e.style.opacity = '0';
        }));
        _gone(e, 1400);
    }
}

// ── Click-counter & long-press helpers ───────────────────────────────────

function onRapidClicks(el, n, windowMs, cb) {
    if (!el) return;
    let count = 0, timer = null;
    el.addEventListener('click', e => {
        count++;
        if (count >= n) {
            count = 0; clearTimeout(timer); cb(e);
        } else {
            clearTimeout(timer);
            timer = setTimeout(() => { count = 0; }, windowMs);
        }
    });
}

function onLongPress(el, ms, cb) {
    if (!el) return;
    let t = null;
    let startX = 0, startY = 0;
    let didFire = false;

    const start = (x, y) => {
        startX = x; startY = y; didFire = false;
        t = setTimeout(() => {
            t = null; didFire = true; cb();
        }, ms);
    };
    const move = (x, y) => {
        // Only cancel if the pointer actually drifted (> 12px), not on tiny wobbles
        if (t && Math.hypot(x - startX, y - startY) > 12) {
            clearTimeout(t); t = null;
        }
    };
    const cancel = () => { if (t) { clearTimeout(t); t = null; } };

    el.addEventListener('pointerdown',  e => start(e.clientX, e.clientY));
    el.addEventListener('pointermove',  e => move(e.clientX, e.clientY));
    el.addEventListener('pointerup',    cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('contextmenu',  e => e.preventDefault());

    // Suppress the click that fires after a long-press so the form doesn't open
    el.addEventListener('click', e => {
        if (didFire) { didFire = false; e.stopImmediatePropagation(); }
    }, true);
}

// ── Konami code ───────────────────────────────────────────────────────────

function setupKonami() {
    const SEQ = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown',
                 'ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
    let i = 0;
    document.addEventListener('keydown', e => {
        if (e.key === SEQ[i]) { i++; if (i === SEQ.length) { i = 0; doFullParty(); } }
        else { i = (e.key === SEQ[0]) ? 1 : 0; }
    });
}

// ── Public init ───────────────────────────────────────────────────────────

export function initEasterEggs() {
    setupKonami();

    // 1. Triple-click 🍕 in About → unicorn gallops + unicorn mode unlocks mid-flight
    onRapidClicks(document.getElementById('secret-pizza'), 3, 1800, () => {
        doUnicornGallop();
        setTimeout(() => window.fitnessApp?.unlockPsychedelicTheme?.(), 900);
    });

    // 2. Click version text 5× in 3s → confetti explosion at click point
    onRapidClicks(document.getElementById('secret-version'), 5, 3000,
        e => doConfettiExplosion(e.clientX, e.clientY));

    // 3. Long-press food FAB (🍽️) 1.2s → magic bunny with "eat the rainbow"
    const foodFab = document.getElementById('fab-add-food');
    onLongPress(foodFab, 1200, () =>
        doMagicBunny(foodFab, '🌈 Eat the rainbow!\nYou found a secret bunny 🐰'));

    // 4. Long-press workout FAB (💪) 1.2s → buff bunny
    const workoutFab = document.getElementById('fab-add-workout');
    onLongPress(workoutFab, 1200, () =>
        doMagicBunny(workoutFab, '💪 Even bunnies\nneed gains!\n🌈🐰'));

    // 5. Tap Today button 4× in 2s → rainbow arc with bunnies at the ends
    onRapidClicks(document.getElementById('btn-today'), 4, 2000, () => {
        doRainbowArc();
        setTimeout(() => doBunnyParade(5), 350);
    });

    // 6. Tap the dashboard nav icon 6× in 3s → icon spin + rainbow spray + parade
    const dashNav = document.querySelector('.nav-item[data-screen="dashboard"]');
    onRapidClicks(dashNav, 6, 3000, () => {
        doNavRainbow(dashNav);
        setTimeout(() => doBunnyParade(8), 250);
    });

    // 7. Type the word "unicorn" into any focused text input → unicorn appears
    let typed = '';
    document.addEventListener('keydown', e => {
        // Only care about single printable characters typed into an input or textarea
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey) return;
        const active = document.activeElement;
        if (!active || !active.matches('input, textarea')) { typed = ''; return; }
        typed = (typed + e.key.toLowerCase()).slice(-7);
        if (typed === 'unicorn') { typed = ''; doUnicornGallop(); }
    });
}
