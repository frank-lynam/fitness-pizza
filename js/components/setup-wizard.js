import { db } from '../db.js';
import { calculateMacroCalories } from '../utils/calorie-calc.js';
import { getTodayDate } from '../utils/date-utils.js';

function mifflinBmr(sex, weightKg, heightCm, age) {
    return sex === 'female'
        ? 10 * weightKg + 6.25 * heightCm - 5 * age - 161
        : 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
}

function calcRecs(sex, weightLbs, heightTotalIn, age, weeklyGoalLbs = 0) {
    const weightKg = weightLbs * 0.453592;
    const heightCm = heightTotalIn * 2.54;
    const bmr = mifflinBmr(sex, weightKg, heightCm, age);
    const tdee = Math.round(bmr * 1.2);
    const goalCal = tdee + Math.round(weeklyGoalLbs * 500);
    const proteinG = Math.round(sex === 'female' ? weightLbs * 0.8 : weightLbs * 1.0);
    const fatG = Math.round(goalCal * (sex === 'female' ? 0.30 : 0.25) / 9);
    const remaining = Math.max(0, goalCal - proteinG * 4 - fatG * 9);
    const carbsG = Math.round(remaining / 4);
    return { tdee, goalCal, bmr: Math.round(bmr), proteinG, fatG, carbsG };
}

function goalLabel(v) {
    if (v === 0) return 'Maintain weight';
    const dir = v < 0 ? 'Lose' : 'Gain';
    const abs = Math.abs(v);
    return `${dir} ${abs} lb${abs !== 1 ? 's' : ''}/week`;
}

export function showSetupWizard() {
    if (document.getElementById('setup-wizard-modal')) return;

    const STEPS = 5;
    let step = 1;
    let sex = 'male';
    let age = null;
    let heightTotalIn = null;
    let weightLbs = null;
    let weeklyGoalLbs = 0;
    let recProtein = 0, recFat = 0, recCarbs = 0, recTdee = 0, recGoalCal = 0;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'setup-wizard-modal';
    document.body.appendChild(modal);

    function stepDots() {
        return `<div class="wizard-steps">
            ${Array.from({ length: STEPS }, (_, i) => `
                <div class="wizard-step-dot ${i + 1 === step ? 'active' : i + 1 < step ? 'done' : ''}"></div>
            `).join('')}
        </div>`;
    }

    function renderStep1() {
        modal.innerHTML = `
            <div class="modal-content wizard-modal">
                ${stepDots()}
                <div class="wizard-hero">🍕</div>
                <h2 class="wizard-title">Setup Wizard</h2>
                <p class="wizard-subtitle">Enter your stats and we'll calculate your TDEE and suggest macro targets — takes about a minute.</p>
                <div class="wizard-body">
                    <button id="wiz-start" class="btn-primary wizard-full-btn">Get started →</button>
                    <button id="wiz-skip" class="wizard-skip-btn">Skip for now</button>
                </div>
            </div>
        `;
        document.getElementById('wiz-start').addEventListener('click', () => { step = 2; render(); });
        document.getElementById('wiz-skip').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    }

    function renderStep2() {
        modal.innerHTML = `
            <div class="modal-content wizard-modal">
                ${stepDots()}
                <h2 class="wizard-title">Biological sex</h2>
                <p class="wizard-subtitle">Used for BMR and macro recommendations.</p>
                <div class="wizard-sex-row">
                    <button id="wiz-male" class="wizard-sex-btn ${sex === 'male' ? 'selected' : ''}">
                        <span class="wizard-sex-icon">♂</span>
                        <span>Male</span>
                    </button>
                    <button id="wiz-female" class="wizard-sex-btn ${sex === 'female' ? 'selected' : ''}">
                        <span class="wizard-sex-icon">♀</span>
                        <span>Female</span>
                    </button>
                </div>
                <div class="wizard-nav">
                    <button id="wiz-back" class="btn-secondary wizard-nav-btn">← Back</button>
                    <button id="wiz-next" class="btn-primary wizard-nav-btn">Next →</button>
                </div>
            </div>
        `;
        document.getElementById('wiz-male').addEventListener('click', () => {
            sex = 'male';
            document.getElementById('wiz-male').classList.add('selected');
            document.getElementById('wiz-female').classList.remove('selected');
        });
        document.getElementById('wiz-female').addEventListener('click', () => {
            sex = 'female';
            document.getElementById('wiz-female').classList.add('selected');
            document.getElementById('wiz-male').classList.remove('selected');
        });
        document.getElementById('wiz-back').addEventListener('click', () => { step = 1; render(); });
        document.getElementById('wiz-next').addEventListener('click', () => { step = 3; render(); });
    }

    function renderStep3() {
        const ftVal = heightTotalIn ? Math.floor(heightTotalIn / 12) : '';
        const inVal = heightTotalIn !== null ? (heightTotalIn % 12) : '';
        modal.innerHTML = `
            <div class="modal-content wizard-modal">
                ${stepDots()}
                <h2 class="wizard-title">About you</h2>
                <p class="wizard-subtitle">Used to calculate your BMR and daily calorie needs.</p>
                <div class="wizard-body">
                    <div class="form-group-inline">
                        <label>Age</label>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <input type="number" id="wiz-age" value="${age || ''}" min="10" max="100" step="1" placeholder="30" style="width:72px;">
                            <span class="wizard-unit-label">years</span>
                        </div>
                    </div>
                    <div class="form-group-inline">
                        <label>Height</label>
                        <div style="display:flex;align-items:center;gap:6px;">
                            <input type="number" id="wiz-height-ft" value="${ftVal}" min="3" max="8" step="1" placeholder="5" style="width:58px;">
                            <span class="wizard-unit-label">ft</span>
                            <input type="number" id="wiz-height-in" value="${inVal}" min="0" max="11" step="1" placeholder="10" style="width:58px;">
                            <span class="wizard-unit-label">in</span>
                        </div>
                    </div>
                    <div class="form-group-inline">
                        <label>Weight</label>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <input type="number" id="wiz-weight" value="${weightLbs || ''}" min="50" max="700" step="0.1" placeholder="165" style="width:80px;">
                            <span class="wizard-unit-label">lbs</span>
                        </div>
                    </div>
                    <p id="wiz-step3-error" class="help-text" style="color:var(--accent-danger);display:none;margin-top:4px;"></p>
                </div>
                <div class="wizard-nav">
                    <button id="wiz-back" class="btn-secondary wizard-nav-btn">← Back</button>
                    <button id="wiz-next" class="btn-primary wizard-nav-btn">Next →</button>
                </div>
            </div>
        `;
        document.getElementById('wiz-back').addEventListener('click', () => { step = 2; render(); });
        document.getElementById('wiz-next').addEventListener('click', () => {
            const ageVal = parseFloat(document.getElementById('wiz-age').value);
            const ft = parseFloat(document.getElementById('wiz-height-ft').value) || 0;
            const extraIn = parseFloat(document.getElementById('wiz-height-in').value) || 0;
            const totalIn = ft * 12 + extraIn;
            const wt = parseFloat(document.getElementById('wiz-weight').value);
            const errorEl = document.getElementById('wiz-step3-error');

            if (!ageVal || ageVal < 10 || ageVal > 100) {
                errorEl.textContent = 'Please enter a valid age (10–100).';
                errorEl.style.display = '';
                return;
            }
            if (totalIn < 48 || totalIn > 96) {
                errorEl.textContent = 'Please enter a valid height (4–8 ft).';
                errorEl.style.display = '';
                return;
            }
            if (!wt || wt < 50 || wt > 700) {
                errorEl.textContent = 'Please enter a valid weight in lbs.';
                errorEl.style.display = '';
                return;
            }

            age = ageVal;
            heightTotalIn = totalIn;
            weightLbs = wt;

            // Compute base TDEE for display in the weight-goal step
            recTdee = Math.round(mifflinBmr(sex, wt * 0.453592, totalIn * 2.54, ageVal) * 1.2);

            step = 4;
            render();
        });
    }

    function renderStep4() {
        const adj = Math.round(weeklyGoalLbs * 500);
        const previewCal = recTdee + adj;
        modal.innerHTML = `
            <div class="modal-content wizard-modal">
                ${stepDots()}
                <h2 class="wizard-title">Weight goal</h2>
                <p class="wizard-subtitle">How fast do you want to change your weight?</p>
                <div class="wizard-body">
                    <div style="text-align:center;margin:12px 0 4px;">
                        <div id="wiz-goal-name" style="font-size:1.3em;font-weight:700;">${goalLabel(weeklyGoalLbs)}</div>
                        <div id="wiz-goal-cal" style="font-size:0.9em;color:var(--text-secondary);margin-top:4px;">
                            ${adj === 0 ? `${recTdee} kcal/day` : `${recTdee} ${adj > 0 ? '+' : '−'} ${Math.abs(adj)} = ${previewCal} kcal/day`}
                        </div>
                    </div>
                    <div style="padding:0 4px;margin:16px 0 4px;">
                        <input type="range" id="wiz-goal-slider" min="-2" max="2" step="0.5" value="${weeklyGoalLbs}"
                               style="width:100%;accent-color:var(--accent-primary);">
                        <div style="display:flex;justify-content:space-between;font-size:0.75em;color:var(--text-secondary);margin-top:2px;">
                            <span>−2 lbs/wk</span>
                            <span>−1</span>
                            <span>0</span>
                            <span>+1</span>
                            <span>+2 lbs/wk</span>
                        </div>
                    </div>
                    <p class="help-text" style="text-align:center;font-size:11px;margin-top:6px;">500 kcal/day ≈ 1 lb/week. Max safe loss is ~2 lbs/week.</p>
                </div>
                <div class="wizard-nav">
                    <button id="wiz-back" class="btn-secondary wizard-nav-btn">← Back</button>
                    <button id="wiz-next" class="btn-primary wizard-nav-btn">Next →</button>
                </div>
            </div>
        `;

        const slider = document.getElementById('wiz-goal-slider');
        const nameEl = document.getElementById('wiz-goal-name');
        const calEl  = document.getElementById('wiz-goal-cal');

        slider.addEventListener('input', () => {
            const v = parseFloat(slider.value);
            const a = Math.round(v * 500);
            const cal = recTdee + a;
            nameEl.textContent = goalLabel(v);
            calEl.textContent = a === 0
                ? `${recTdee} kcal/day`
                : `${recTdee} ${a > 0 ? '+' : '−'} ${Math.abs(a)} = ${cal} kcal/day`;
            calEl.style.color = v === 0 ? 'var(--text-secondary)' : v < 0 ? 'var(--accent-success)' : 'var(--accent-warning)';
        });

        document.getElementById('wiz-back').addEventListener('click', () => { step = 3; render(); });
        document.getElementById('wiz-next').addEventListener('click', () => {
            weeklyGoalLbs = parseFloat(slider.value);
            const recs = calcRecs(sex, weightLbs, heightTotalIn, age, weeklyGoalLbs);
            recTdee    = recs.tdee;
            recGoalCal = recs.goalCal;
            recProtein = recs.proteinG;
            recFat     = recs.fatG;
            recCarbs   = recs.carbsG;
            step = 5;
            render();
        });
    }

    function renderStep5() {
        const totalCal = recProtein * 4 + recFat * 9 + recCarbs * 4;
        const hasGoal = weeklyGoalLbs !== 0;
        modal.innerHTML = `
            <div class="modal-content wizard-modal">
                ${stepDots()}
                <h2 class="wizard-title">Your targets</h2>
                <div class="wizard-tdee-badge">
                    <span class="wizard-tdee-num">${recGoalCal}</span>
                    <span class="wizard-tdee-label">kcal/day goal</span>
                </div>
                <p class="wizard-subtitle" style="margin-top:6px;margin-bottom:16px;">
                    ${hasGoal
                        ? `${goalLabel(weeklyGoalLbs)} — TDEE ${recTdee} kcal${weeklyGoalLbs > 0 ? ' +' : ' −'}${Math.abs(Math.round(weeklyGoalLbs * 500))} kcal/day. Adjust activity in Settings → Body Stats.`
                        : 'Sedentary (1.2× BMR). Adjust activity level in Settings → Body Stats.'
                    }
                </p>
                <div class="wizard-body">
                    <div class="wizard-macro-row">
                        <span class="wizard-macro-label" style="color:var(--accent-primary)">Protein</span>
                        <input type="number" id="wiz-protein" class="wizard-macro-input" value="${recProtein}" min="0" step="1">
                        <span class="wizard-macro-unit">g</span>
                        <span id="wiz-protein-kcal" class="wizard-macro-kcal">${recProtein * 4} kcal</span>
                    </div>
                    <div class="wizard-macro-row">
                        <span class="wizard-macro-label" style="color:var(--accent-warning)">Fat</span>
                        <input type="number" id="wiz-fat" class="wizard-macro-input" value="${recFat}" min="0" step="1">
                        <span class="wizard-macro-unit">g</span>
                        <span id="wiz-fat-kcal" class="wizard-macro-kcal">${recFat * 9} kcal</span>
                    </div>
                    <div class="wizard-macro-row">
                        <span class="wizard-macro-label" style="color:var(--accent-success)">Carbs</span>
                        <input type="number" id="wiz-carbs" class="wizard-macro-input" value="${recCarbs}" min="0" step="1">
                        <span class="wizard-macro-unit">g</span>
                        <span id="wiz-carbs-kcal" class="wizard-macro-kcal">${recCarbs * 4} kcal</span>
                    </div>
                    <div class="wizard-total-row">
                        <span>Total</span>
                        <span id="wiz-total-kcal">${totalCal} kcal</span>
                    </div>
                    <p class="help-text" style="margin-top:8px;font-size:11px;">Adjust any value — carbs are set to fill your remaining TDEE.</p>
                </div>
                <div class="wizard-nav">
                    <button id="wiz-back" class="btn-secondary wizard-nav-btn">← Back</button>
                    <button id="wiz-save" class="btn-primary wizard-nav-btn">Save ✓</button>
                </div>
            </div>
        `;

        const updateTotals = () => {
            const p = parseFloat(document.getElementById('wiz-protein').value) || 0;
            const f = parseFloat(document.getElementById('wiz-fat').value) || 0;
            const c = parseFloat(document.getElementById('wiz-carbs').value) || 0;
            document.getElementById('wiz-protein-kcal').textContent = `${Math.round(p * 4)} kcal`;
            document.getElementById('wiz-fat-kcal').textContent = `${Math.round(f * 9)} kcal`;
            document.getElementById('wiz-carbs-kcal').textContent = `${Math.round(c * 4)} kcal`;
            document.getElementById('wiz-total-kcal').textContent = `${Math.round(p * 4 + f * 9 + c * 4)} kcal`;
        };
        ['wiz-protein', 'wiz-fat', 'wiz-carbs'].forEach(id => {
            document.getElementById(id).addEventListener('input', updateTotals);
        });

        document.getElementById('wiz-back').addEventListener('click', () => { step = 4; render(); });
        document.getElementById('wiz-save').addEventListener('click', async () => {
            const p = Math.round(parseFloat(document.getElementById('wiz-protein').value) || 0);
            const f = Math.round(parseFloat(document.getElementById('wiz-fat').value) || 0);
            const c = Math.round(parseFloat(document.getElementById('wiz-carbs').value) || 0);

            await db.setSetting('user_sex', sex);
            await db.setSetting('user_age', String(age));
            await db.setSetting('user_height_in', String(heightTotalIn));

            await db.addMeasurement({
                date: getTodayDate(),
                type: 'weight',
                value: weightLbs,
                unit: 'lbs',
            });

            const totalCal = calculateMacroCalories(p, c, f, 0);
            await db.setSetting('goal_protein', String(p));
            await db.setSetting('goal_fat', String(f));
            await db.setSetting('goal_carbs', String(c));
            await db.setSetting('goal_calories', String(totalCal));

            window.dispatchEvent(new CustomEvent('fp:data-changed'));

            renderDone();
        });
    }

    function renderDone() {
        modal.innerHTML = `
            <div class="modal-content wizard-modal" style="text-align:center;">
                <div class="wizard-hero">🎉</div>
                <h2 class="wizard-title">You're all set!</h2>
                <p class="wizard-subtitle">Your weight is saved and macro targets are ready. Fine-tune them anytime in <em>Settings → Daily Goals</em>.</p>
                <div class="wizard-body">
                    <button id="wiz-done" class="btn-primary wizard-full-btn">Let's go 🍕</button>
                </div>
            </div>
        `;
        document.getElementById('wiz-done').addEventListener('click', () => modal.remove());
    }

    function render() {
        if (step === 1) renderStep1();
        else if (step === 2) renderStep2();
        else if (step === 3) renderStep3();
        else if (step === 4) renderStep4();
        else if (step === 5) renderStep5();
    }

    render();
}
