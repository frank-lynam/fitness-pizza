/**
 * Fitness Tracker PWA - AI Provider Integration
 * Supports Gemini (Google), GPT-4o mini (OpenAI), Claude Haiku (Anthropic), Llama Vision (Groq)
 */

export const PROVIDERS = {
    gemini: {
        name: 'Gemini Flash (Google)',
        model: 'gemini-2.0-flash',
        keyHint: 'AIza...',
        free: true,
        infoUrl: 'https://aistudio.google.com/apikey',
        infoText: 'Get a free API key at Google AI Studio',
    },
    openai: {
        name: 'GPT-4o mini (OpenAI)',
        model: 'gpt-4o-mini',
        keyHint: 'sk-...',
        free: false,
        infoUrl: 'https://platform.openai.com/api-keys',
        infoText: 'Get an API key at OpenAI Platform',
    },
    anthropic: {
        name: 'Claude Haiku (Anthropic)',
        model: 'claude-haiku-4-5-20251001',
        keyHint: 'sk-ant-...',
        free: false,
        infoUrl: 'https://console.anthropic.com/',
        infoText: 'Get an API key at Anthropic Console',
        note: 'Claude.ai Pro/Max subscriptions do not include API access — a separate Anthropic API account is required.',
    },
    groq: {
        name: 'Llama Vision (Groq)',
        model: 'llama-3.2-11b-vision-preview',
        keyHint: 'gsk_...',
        free: true,
        infoUrl: 'https://console.groq.com/keys',
        infoText: 'Get a free API key at Groq Console',
    },
};

export function getSelectedProvider() {
    const p = localStorage.getItem('ai_provider');
    return (p && PROVIDERS[p]) ? p : 'gemini';
}

export function getAPIKey(provider) {
    const prov = provider || getSelectedProvider();
    const key = localStorage.getItem(`ai_api_key_${prov}`);
    // Migrate legacy gemini_api_key on first access
    if (!key && prov === 'gemini') {
        const legacy = localStorage.getItem('gemini_api_key');
        if (legacy) {
            localStorage.setItem('ai_api_key_gemini', legacy);
            return legacy;
        }
    }
    return key || null;
}

export function saveAPIKey(apiKey, provider) {
    const prov = provider || getSelectedProvider();
    localStorage.setItem(`ai_api_key_${prov}`, apiKey);
}

// ─── Provider adapters ──────────────────────────────────────────────────────

async function callGemini(prompt, base64Data, mimeType, temperature = 0.4) {
    const apiKey = getAPIKey('gemini');
    const model = PROVIDERS.gemini.model;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const parts = [{ text: prompt }];
    if (base64Data) parts.push({ inline_data: { mime_type: mimeType, data: base64Data } });

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { temperature, maxOutputTokens: 1024 },
        }),
    });
    await throwIfNotOk(res);
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
}

async function callOpenAI(prompt, base64Data, mimeType, temperature = 0.4) {
    const apiKey = getAPIKey('openai');
    const model = PROVIDERS.openai.model;

    const content = [{ type: 'text', text: prompt }];
    if (base64Data) {
        content.push({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } });
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content }],
            max_tokens: 1024,
            temperature,
        }),
    });
    await throwIfNotOk(res);
    const data = await res.json();
    return data.choices[0].message.content;
}

async function callAnthropic(prompt, base64Data, mimeType, temperature = 0.4) {
    const apiKey = getAPIKey('anthropic');
    const model = PROVIDERS.anthropic.model;

    const content = [];
    if (base64Data) {
        content.push({ type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } });
    }
    content.push({ type: 'text', text: prompt });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content }],
            max_tokens: 1024,
        }),
    });
    await throwIfNotOk(res);
    const data = await res.json();
    return data.content[0].text;
}

async function callGroq(prompt, base64Data, mimeType, temperature = 0.4) {
    const apiKey = getAPIKey('groq');
    const model = PROVIDERS.groq.model;

    const content = [{ type: 'text', text: prompt }];
    if (base64Data) {
        content.push({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } });
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content }],
            max_tokens: 1024,
            temperature,
        }),
    });
    await throwIfNotOk(res);
    const data = await res.json();
    return data.choices[0].message.content;
}

async function throwIfNotOk(res) {
    if (res.ok) return;
    let msg = `API error ${res.status}`;
    try {
        const err = await res.json();
        // Gemini: err.error.message  OpenAI/Groq: err.error.message  Anthropic: err.error.message
        msg = err?.error?.message || err?.message || msg;
    } catch (_) {}
    if (res.status === 401 || res.status === 403) msg = `Invalid API key (HTTP ${res.status}). Check your key in Settings.`;
    else if (res.status === 429) msg = 'Rate limit exceeded — wait a moment and try again.';
    throw new Error(msg);
}

async function callProvider(prompt, base64Data, mimeType, temperature = 0.4) {
    const provider = getSelectedProvider();
    const apiKey = getAPIKey(provider);
    if (!apiKey) throw new Error(`No API key configured for ${PROVIDERS[provider].name}. Add it in Settings → AI Provider.`);

    try {
        switch (provider) {
            case 'gemini':    return await callGemini(prompt, base64Data, mimeType, temperature);
            case 'openai':    return await callOpenAI(prompt, base64Data, mimeType, temperature);
            case 'anthropic': return await callAnthropic(prompt, base64Data, mimeType, temperature);
            case 'groq':      return await callGroq(prompt, base64Data, mimeType, temperature);
            default:          return await callGemini(prompt, base64Data, mimeType, temperature);
        }
    } catch (err) {
        if (err.message === 'Failed to fetch') throw new Error(`Network error: Could not reach ${PROVIDERS[provider].name}. Check your internet connection.`);
        throw err;
    }
}

function extractJSON(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Could not parse JSON from AI response');
    return JSON.parse(match[0]);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function estimateMacrosFromPhoto(imageData, context = '') {
    const matches = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) throw new Error('Invalid image data format');
    const [, mimeType, base64Data] = matches;

    const contextLine = context ? `\n\nUser context: ${context}` : '';
    const prompt = `Analyze this food image and estimate the macronutrients.${contextLine}

Provide your response in JSON format with these exact fields:
{
  "meal_name": "descriptive name of the food",
  "protein": number (grams),
  "carbs": number (grams),
  "fat": number (grams),
  "fiber": number (grams, 0 if unknown),
  "confidence": "high" | "medium" | "low",
  "notes": "any relevant details about portion size or assumptions"
}

Be conservative in your estimates. If unsure, use the lower estimate.`;

    const text = await callProvider(prompt, base64Data, mimeType, 0.4);
    const result = extractJSON(text);
    if (!result.protein && !result.carbs && !result.fat) throw new Error('Invalid macro data from AI response');

    return {
        meal_name: result.meal_name || 'AI Estimated Meal',
        protein: parseFloat(result.protein) || 0,
        carbs: parseFloat(result.carbs) || 0,
        fat: parseFloat(result.fat) || 0,
        fiber: parseFloat(result.fiber) || 0,
        confidence: result.confidence || 'medium',
        notes: result.notes || '',
        ai_estimated: true,
    };
}

export async function estimateMacrosFromText(foodDescription) {
    const prompt = `Analyze this food description and estimate the macronutrients.

Food description: ${foodDescription}

Provide your response in JSON format with these exact fields:
{
  "meal_name": "descriptive name of the meal",
  "protein": number (grams),
  "carbs": number (grams),
  "fat": number (grams),
  "fiber": number (grams, 0 if unknown),
  "confidence": "high" | "medium" | "low",
  "notes": "any relevant details about portion size or assumptions"
}

Be conservative in your estimates. If unsure, use the lower estimate.`;

    const text = await callProvider(prompt, null, null, 0.4);
    const result = extractJSON(text);
    if (!result.protein && !result.carbs && !result.fat) throw new Error('Invalid macro data from AI response');

    return {
        meal_name: result.meal_name || 'AI Estimated Meal',
        protein: parseFloat(result.protein) || 0,
        carbs: parseFloat(result.carbs) || 0,
        fat: parseFloat(result.fat) || 0,
        fiber: parseFloat(result.fiber) || 0,
        confidence: result.confidence || 'medium',
        notes: result.notes || '',
        ai_estimated: true,
    };
}

export async function estimateMacrosFromLabel(imageData) {
    const matches = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) throw new Error('Invalid image data format');
    const [, mimeType, base64Data] = matches;

    const prompt = `Read this nutrition label image and extract the macronutrient values.

Prefer per-serving values if a "Per Serving" column exists. Only use per-100g values (set is_per_100g: true) if no per-serving column is present.

Provide your response in JSON format with these exact fields:
{
  "product_name": "name of the product",
  "serving_size": "serving size description (e.g. '1 cup (240ml)')",
  "serving_size_grams": number or null,
  "calories": number,
  "protein": number (grams),
  "fat": number (grams, total fat),
  "is_per_100g": false,
  "confidence": "high" | "medium" | "low",
  "notes": "any relevant notes about the label or ambiguities"
}

Transcribe the numbers literally from the label. Do not estimate.`;

    const text = await callProvider(prompt, base64Data, mimeType, 0.1);
    const result = extractJSON(text);
    if (result.protein === undefined || result.fat === undefined) throw new Error('Invalid label data from AI response');

    const calories = parseFloat(result.calories) || 0;
    const protein  = parseFloat(result.protein)  || 0;
    const fat      = parseFloat(result.fat)      || 0;
    const carbs    = Math.max(0, Math.round((calories - fat * 9 - protein * 4) / 4 * 10) / 10);

    return {
        product_name: result.product_name || 'Unknown Product',
        serving_size: result.serving_size || '',
        serving_size_grams: result.serving_size_grams ? parseFloat(result.serving_size_grams) : null,
        calories,
        protein,
        carbs,
        fat,
        fiber: 0,
        is_per_100g: result.is_per_100g === true,
        confidence: result.confidence || 'medium',
        notes: result.notes || '',
        ai_estimated: true,
    };
}

export async function testAPIKey() {
    const provider = getSelectedProvider();
    const apiKey = getAPIKey(provider);
    if (!apiKey) return { valid: false, error: 'No API key configured' };

    try {
        await callProvider('Reply with the single word: OK', null, null, 0);
        return { valid: true };
    } catch (err) {
        return { valid: false, error: err.message };
    }
}
