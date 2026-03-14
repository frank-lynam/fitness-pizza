/**
 * Fitness Tracker PWA - Google Gemini API Integration
 * Handles communication with Gemini API for macro estimation from photos
 * CORS-enabled for browser use
 */

const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

/**
 * Get API key from localStorage
 * @returns {string|null} API key or null if not set
 */
function getAPIKey() {
    return localStorage.getItem('gemini_api_key');
}

/**
 * Estimate macros from a food photo using Gemini Vision
 * @param {string} imageData - Base64 encoded image data
 * @param {string} context - Optional user-provided context about the food
 * @returns {Promise<Object>} Estimated macros {protein, carbs, fat, fiber, meal_name}
 */
export async function estimateMacrosFromPhoto(imageData, context = '') {
    const apiKey = getAPIKey();

    if (!apiKey) {
        throw new Error('Gemini API key not configured. Please add your API key in Settings.');
    }

    // Extract base64 data and media type
    const matches = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
        throw new Error('Invalid image data format');
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

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

Be conservative in your estimates. If you're unsure, provide a range and use the lower estimate.`;

    try {
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            text: prompt
                        },
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Data
                            }
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 1024,
                }
            })
        });

        if (!response.ok) {
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error?.message || errorMessage;

                // Provide helpful error messages for common issues
                if (response.status === 401 || response.status === 403) {
                    errorMessage = 'Invalid API key. Please check your Gemini API key in Settings.';
                } else if (response.status === 429) {
                    errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
                } else if (response.status === 400) {
                    errorMessage = `Bad request: ${errorMessage}`;
                }
            } catch (e) {
                // If we can't parse the error response, use the default message
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();

        // Extract text from Gemini response
        const text = data.candidates[0].content.parts[0].text;

        // Extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Could not parse macro data from API response');
        }

        const result = JSON.parse(jsonMatch[0]);

        // Validate the response
        if (!result.protein || !result.carbs || !result.fat) {
            throw new Error('Invalid macro data received from API');
        }

        return {
            meal_name: result.meal_name || 'AI Estimated Meal',
            protein: parseFloat(result.protein),
            carbs: parseFloat(result.carbs),
            fat: parseFloat(result.fat),
            fiber: parseFloat(result.fiber) || 0,
            confidence: result.confidence || 'medium',
            notes: result.notes || '',
            ai_estimated: true
        };

    } catch (error) {
        console.error('API Error:', error);

        // Provide specific error messages for network issues
        if (error.message === 'Failed to fetch') {
            throw new Error('Network error: Unable to reach Gemini API. Check your internet connection.');
        }

        throw new Error(`Failed to estimate macros: ${error.message}`);
    }
}

/**
 * Estimate macros from a nutrition label photo using Gemini Vision.
 * Returns per-serving values; sets is_per_100g: true only when no per-serving column exists.
 * @param {string} imageData - Base64 encoded image data (data-URL)
 * @returns {Promise<Object>} Label data {product_name, serving_size, serving_size_grams, calories, protein, carbs, fat, fiber, is_per_100g, confidence, notes, ai_estimated}
 */
export async function estimateMacrosFromLabel(imageData) {
    const apiKey = getAPIKey();

    if (!apiKey) {
        throw new Error('Gemini API key not configured. Please add your API key in Settings.');
    }

    const matches = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
        throw new Error('Invalid image data format');
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    const prompt = `Read this nutrition label image and extract the macronutrient values.

Prefer per-serving values if a "Per Serving" column exists. Only use per-100g values (set is_per_100g: true) if no per-serving column is present.

Provide your response in JSON format with these exact fields:
{
  "product_name": "name of the product",
  "serving_size": "serving size description (e.g. '1 cup (240ml)')",
  "serving_size_grams": number or null (grams equivalent of one serving),
  "calories": number,
  "protein": number (grams),
  "fat": number (grams, total fat),
  "is_per_100g": false,
  "confidence": "high" | "medium" | "low",
  "notes": "any relevant notes about the label or ambiguities"
}

Transcribe the numbers literally from the label. Do not estimate.`;

    try {
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Data
                            }
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 1024,
                }
            })
        });

        if (!response.ok) {
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error?.message || errorMessage;

                if (response.status === 401 || response.status === 403) {
                    errorMessage = 'Invalid API key. Please check your Gemini API key in Settings.';
                } else if (response.status === 429) {
                    errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
                } else if (response.status === 400) {
                    errorMessage = `Bad request: ${errorMessage}`;
                }
            } catch (e) {
                // use default message
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Could not parse label data from API response');
        }

        const result = JSON.parse(jsonMatch[0]);

        if (result.protein === undefined || result.fat === undefined) {
            throw new Error('Invalid label data received from API');
        }

        const calories = parseFloat(result.calories) || 0;
        const protein  = parseFloat(result.protein)  || 0;
        const fat      = parseFloat(result.fat)      || 0;
        // Derive carbs from the calorie remainder rather than trusting the
        // label's reported carb figure (avoids double-counting fibre rounding).
        // carbs_kcal = calories − fat×9 − protein×4  →  carbs_g = /4
        const carbs = Math.max(0, Math.round((calories - fat * 9 - protein * 4) / 4 * 10) / 10);

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
            ai_estimated: true
        };

    } catch (error) {
        console.error('Label API Error:', error);

        if (error.message === 'Failed to fetch') {
            throw new Error('Network error: Unable to reach Gemini API. Check your internet connection.');
        }

        throw new Error(`Failed to read label: ${error.message}`);
    }
}

/**
 * Test API key validity
 * @returns {Promise<{valid: boolean, error?: string, status?: number}>} Test result with details
 */
export async function testAPIKey() {
    const apiKey = getAPIKey();

    console.log('testAPIKey - API key exists:', !!apiKey);
    console.log('testAPIKey - API key length:', apiKey ? apiKey.length : 0);

    if (!apiKey) {
        console.error('testAPIKey - No API key found in localStorage');
        return { valid: false, error: 'No API key found' };
    }

    try {
        console.log('testAPIKey - Making test request to:', GEMINI_API_ENDPOINT);
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: 'Hello'
                    }]
                }]
            })
        });

        console.log('testAPIKey - Response status:', response.status);
        console.log('testAPIKey - Response ok:', response.ok);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('testAPIKey - Error response:', errorText);

            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { error: { message: errorText } };
            }

            const errorMessage = errorData.error?.message || errorText || 'Unknown error';

            return {
                valid: false,
                error: errorMessage,
                status: response.status
            };
        }

        return { valid: true };
    } catch (error) {
        console.error('testAPIKey - Network error:', error);
        console.error('testAPIKey - Error name:', error.name);
        console.error('testAPIKey - Error message:', error.message);

        return {
            valid: false,
            error: `Network error: ${error.message}`
        };
    }
}

/**
 * Estimate macros from text description using Gemini
 * @param {string} foodDescription - Text description of food eaten
 * @returns {Promise<Object>} Estimated macros {protein, carbs, fat, fiber, meal_name}
 */
export async function estimateMacrosFromText(foodDescription) {
    const apiKey = getAPIKey();

    if (!apiKey) {
        throw new Error('Gemini API key not configured. Please add your API key in Settings.');
    }

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

Be conservative in your estimates. If you're unsure, provide a range and use the lower estimate.`;

    try {
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 1024,
                }
            })
        });

        if (!response.ok) {
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error?.message || errorMessage;

                if (response.status === 401 || response.status === 403) {
                    errorMessage = 'Invalid API key. Please check your Gemini API key in Settings.';
                } else if (response.status === 429) {
                    errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
                } else if (response.status === 400) {
                    errorMessage = `Bad request: ${errorMessage}`;
                }
            } catch (e) {
                // If we can't parse the error response, use the default message
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();

        // Extract text from Gemini response
        const text = data.candidates[0].content.parts[0].text;

        // Extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Could not parse macro data from API response');
        }

        const result = JSON.parse(jsonMatch[0]);

        // Validate the response
        if (!result.protein || !result.carbs || !result.fat) {
            throw new Error('Invalid macro data received from API');
        }

        return {
            meal_name: result.meal_name || 'AI Estimated Meal',
            protein: parseFloat(result.protein),
            carbs: parseFloat(result.carbs),
            fat: parseFloat(result.fat),
            fiber: parseFloat(result.fiber) || 0,
            confidence: result.confidence || 'medium',
            notes: result.notes || '',
            ai_estimated: true
        };

    } catch (error) {
        console.error('API Error:', error);

        if (error.message === 'Failed to fetch') {
            throw new Error('Network error: Unable to reach Gemini API. Check your internet connection.');
        }

        throw new Error(`Failed to estimate macros: ${error.message}`);
    }
}

/**
 * Save API key to localStorage
 * @param {string} apiKey - Gemini API key
 */
export function saveAPIKey(apiKey) {
    localStorage.setItem('gemini_api_key', apiKey);
}
