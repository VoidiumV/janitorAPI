const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
    res.status(200).send('Proxy status: Online and running.');
});

app.post(['/v1', '/v1/chat/completions', '/chat/completions'], async (req, res) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        let rawModel = req.body.model || 'gemini-2.0-flash';
        let modelName = rawModel.replace(/^google\//, '');

        const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const contents = (req.body.messages || []).map(msg => {
            let role = msg.role === 'assistant' ? 'model' : 'user';
            if (msg.role === 'system') role = 'user';
            return {
                role: role,
                parts: [{ text: msg.content || '' }]
            };
        });

        const nativePayload = {
            contents: contents,
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" }
            ],
            generationConfig: {
                temperature: req.body.temperature ?? 0.9,
                maxOutputTokens: req.body.max_tokens || 1500
            }
        };

        let response;
        try {
            response = await axios.post(targetUrl, nativePayload, {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (apiError) {
            // Catch Google API errors (like 429 rate limits or 400 bad requests) and format them nicely for JanitorAI
            console.error('Google API Error:', apiError.response?.data || apiError.message);
            const errorMsg = apiError.response?.data?.error?.message || 'Google API connection issue.';
            return res.status(200).json({
                choices: [{
                    message: { role: 'assistant', content: `[Proxy Intercept - Error: ${errorMsg}]` },
                    finish_reason: 'stop'
                }]
            });
        }

        const candidate = response.data.candidates?.[0];
        
        // If Google blocks the response text due to safety triggers, return a safe recovery message instead of crashing
        if (!candidate || !candidate.content?.parts?.[0]?.text) {
            return res.status(200).json({
                choices: [{
                    message: { role: 'assistant', content: "[OOC: The model hesitated on that phrasing. Try tweaking your message slightly or re-rolling.]" },
                    finish_reason: 'stop'
                }]
            });
        }

        const generatedText = candidate.content.parts[0].text;

        const openAiFormattedResponse = {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: modelName,
            choices: [
                {
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: generatedText
                    },
                    finish_reason: 'stop'
                }
            ]
        };

        res.status(200).json(openAiFormattedResponse);

    } catch (error) {
        console.error('Fatal Proxy Error:', error.message);
        // Always return HTTP 200 with an assistant message so JanitorAI never throws pgshag2
        res.status(200).json({
            choices: [{
                message: { role: 'assistant', content: "[Proxy Error Handled: A communication glitch occurred. Try sending your message again.]" },
                finish_reason: 'stop'
            }]
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Active proxy running on port ${PORT}`));
