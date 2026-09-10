const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
    res.status(200).send('Proxy status: Online and running (OpenRouter).');
});

// Helper function to flatten or extract system messages and normalize format
function extractSystemAndMessages(messages) {
    let systemInstruction = '';
    const formattedMessages = [];

    for (const msg of messages) {
        if (!msg || !msg.content) continue;

        const role = msg.role;
        const text =
            typeof msg.content === 'string'
                ? msg.content
                : Array.isArray(msg.content)
                    ? msg.content
                        .filter(part => part && part.type === 'text')
                        .map(part => part.text || '')
                        .join('')
                    : '';

        if (!text.trim()) continue;

        if (role === 'system') {
            systemInstruction += (systemInstruction ? '\n\n' : '') + text;
        } else {
            // OpenRouter expects standard OpenAI roles: 'user', 'assistant', 'system'
            formattedMessages.push({
                role: role === 'assistant' ? 'assistant' : 'user',
                content: text
            });
        }
    }

    return { systemInstruction, formattedMessages };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateWithRetry(targetUrl, payload, apiKey) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await axios.post(targetUrl, payload, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://janitorai.com', // Optional: Identifies app to OpenRouter
                    'X-Title': 'JanitorCustomProxy'         // Optional: Identifies app name
                },
                timeout: 120000,
                validateStatus: () => true
            });
        } catch (error) {
            const retryable =
                !error.response ||
                error.code === 'ECONNRESET' ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'ECONNABORTED';

            if (!retryable || attempt === maxAttempts) {
                throw error;
            }

            await sleep(1000 * attempt);
        }
    }
}

app.post(
    ['/v1', '/v1/chat/completions', '/chat/completions'],
    async (req, res) => {
        try {
            // Grab your OpenRouter API Key from Render environment variables
            const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;

            if (!apiKey) {
                return res.status(500).json({
                    error: {
                        message: 'API key is not configured on the server. Please set OPENROUTER_API_KEY in Render.'
                    }
                });
            }

            // Default to a strong free OpenRouter roleplay-friendly model if none specified, 
            // or accept whatever model Janitor AI passes over.
            const rawModel = req.body.model || 'deepseek/deepseek-chat:free';
            const modelName = rawModel
                .replace(/^google\//, '')
                .replace(/^models\//, '');

            const targetUrl = 'https://openrouter.ai/api/v1/chat/completions';

            const messages = Array.isArray(req.body.messages) ? req.body.messages : [];

            if (!messages.length) {
                return res.status(400).json({
                    error: {
                        message: 'No messages were supplied.'
                    }
                });
            }

            const { systemInstruction, formattedMessages } = extractSystemAndMessages(messages);

            // Reconstruct payload for OpenRouter's OpenAI-compatible schema
            const openAiPayload = {
                model: modelName,
                messages: [
                    ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
                    ...formattedMessages
                ],
                temperature: typeof req.body.temperature === 'number' ? req.body.temperature : 0.9,
                max_tokens: Number(req.body.max_tokens) > 0 ? Number(req.body.max_tokens) : 2000
            };

            const response = await generateWithRetry(targetUrl, openAiPayload, apiKey);

            if (response.status < 200 || response.status >= 300) {
                console.error(
                    'OpenRouter API error:',
                    response.status,
                    response.data
                );

                return res.status(response.status).json({
                    error: {
                        message:
                            response.data?.error?.message ||
                            `OpenRouter returned HTTP ${response.status}.`,
                        status: response.status
                    }
                });
            }

            // OpenRouter responds directly in OpenAI format, so we can forward it back cleanly
            return res.status(200).json(response.data);

        } catch (error) {
            console.error(
                'Proxy error:',
                error.response?.data || error.message
            );

            return res.status(502).json({
                error: {
                    message:
                        error.response?.data?.error?.message ||
                        error.message ||
                        'The proxy could not reach OpenRouter.'
                }
            });
        }
    }
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Active OpenRouter proxy running on port ${PORT}`);
});
