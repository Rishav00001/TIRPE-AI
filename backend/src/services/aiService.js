const axios = require('axios');
const OpenAI = require('openai');
const env = require('../config/env');

const aiClient = axios.create({
  baseURL: env.AI_SERVICE_URL,
  timeout: 8_000,
});

let openaiClient = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function withTimeout(promise, timeoutMs, message = 'Operation timed out') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

function getOpenAIClient() {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL || undefined,
    });
  }

  return openaiClient;
}

function extractOutputText(response) {
  if (typeof response?.output_text === 'string' && response.output_text.trim().length > 0) {
    return response.output_text.trim();
  }

  const textChunks = [];
  for (const output of response?.output || []) {
    for (const block of output?.content || []) {
      if (block?.type === 'output_text' && typeof block?.text === 'string') {
        textChunks.push(block.text);
      }
    }
  }

  return textChunks.join('\n').trim();
}

function parseJsonObject(text) {
  if (!text) {
    throw new Error('AI response text was empty');
  }

  try {
    return JSON.parse(text);
  } catch {
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd <= jsonStart) {
      throw new Error('AI response did not contain JSON');
    }

    return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  }
}

function fallbackPrediction(payload) {
  const baseline = Number(payload.rolling_mean || 200);
  const weatherImpact = 1 + Number(payload.weather_score || 0.5) * 0.15;
  const holidayImpact = payload.holiday_flag ? 1.2 : 1;
  const weekendImpact = payload.weekend_flag ? 1.12 : 1;
  const socialImpact = 0.85 + Number(payload.social_media_spike_index || 0.5) * 0.4;
  const trafficPenalty = 1 - Number(payload.traffic_index || 0.5) * 0.1;

  const predicted = Math.max(
    30,
    baseline * weatherImpact * holidayImpact * weekendImpact * socialImpact * trafficPenalty,
  );

  return {
    predicted_footfall: Number(predicted.toFixed(2)),
    confidence_score: 0.52,
    model_version: `fallback:${env.AI_PROVIDER}`,
    degraded_mode: true,
  };
}

async function predictFootfallViaOpenAI(payload) {
  const client = getOpenAIClient();

  const systemPrompt = [
    'You are a tourism forecasting engine.',
    'Predict next 6-12 hour footfall based on input factors.',
    'Return JSON ONLY with keys:',
    'predicted_footfall: number, confidence_score: number between 0 and 1.',
    'No markdown, no extra text.',
  ].join(' ');

  const userPrompt = `Input JSON: ${JSON.stringify(payload)}`;

  const response = await withTimeout(
    client.responses.create({
      model: env.OPENAI_MODEL,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemPrompt }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: userPrompt }],
        },
      ],
      max_output_tokens: env.OPENAI_MAX_OUTPUT_TOKENS,
    }),
    env.OPENAI_REQUEST_TIMEOUT_MS,
    `OpenAI prediction timed out after ${env.OPENAI_REQUEST_TIMEOUT_MS}ms`,
  );

  const responseText = extractOutputText(response);
  const parsed = parseJsonObject(responseText);

  const predicted = Number(parsed.predicted_footfall);
  const confidence = Number(parsed.confidence_score);

  if (!Number.isFinite(predicted) || !Number.isFinite(confidence)) {
    throw new Error('OpenAI response contained invalid numeric fields');
  }

  return {
    predicted_footfall: Number(Math.max(0, predicted).toFixed(2)),
    confidence_score: Number(clamp(confidence, 0.05, 0.99).toFixed(4)),
    model_version: `openai:${env.OPENAI_MODEL}`,
    degraded_mode: false,
  };
}

async function trainModel(rows) {
  if (env.AI_PROVIDER === 'openai') {
    return {
      trained: false,
      status: 'skipped',
      provider: 'openai',
      model_version: `openai:${env.OPENAI_MODEL}`,
    };
  }

  const response = await aiClient.post('/train', { rows });
  return response.data;
}

async function predictFootfall(payload) {
  if (env.AI_PROVIDER === 'openai') {
    try {
      return await predictFootfallViaOpenAI(payload);
    } catch (error) {
      return {
        ...fallbackPrediction(payload),
        reason: error.message,
      };
    }
  }

  const response = await aiClient.post('/predict', payload);
  return {
    ...response.data,
    degraded_mode: false,
  };
}

async function generateTextAnswer({ systemPrompt, userPrompt, maxOutputTokens = 700 }) {
  const client = getOpenAIClient();

  const response = await client.responses.create({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: userPrompt }],
      },
    ],
    max_output_tokens: maxOutputTokens,
  });

  const responseText = extractOutputText(response);
  if (!responseText) {
    throw new Error('OpenAI returned empty response');
  }

  return responseText;
}

module.exports = {
  trainModel,
  predictFootfall,
  generateTextAnswer,
};
