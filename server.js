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

        // Using 'OFF' instead of 'BLOCK_NONE' to completely disable filter blocks
        const nativePayload = {
            contents: contents,
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
                { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "OFF" }
            ],
            generationConfig: {
                temperature: req.body.temperature ?? 0.9,
                maxOutputTokens: req.body.max_tokens || 2000
            }
        };

        const response = await axios.post(targetUrl, nativePayload, {
            headers: { 'Content-Type': 'application/json' }
        });

        const candidate = response.data?.candidates?.[0];
        
        // Pull text directly even if safety ratings flagged it, forcing raw text through
        let generatedText = '';
        if (candidate?.content?.parts) {
            generatedText = candidate.content.parts.map(p => p.text || '').join('');
        }

        // If it's completely blank, pass a simple dot instead of an error message so it never complains
        if (!generatedText) {
            generatedText = ".";
        }

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

        return res.status(200).json(openAiFormattedResponse);

    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
        const errDetails = error.response?.data?.error?.message || error.message;
        
        // Return the exact error block or a clean continuation so JanitorAI displays text instead of crashing
        return res.status(200).json({
            choices: [{
                message: { role: 'assistant', content: `[Error caught: ${errDetails}]` },
                finish_reason: 'stop'
            }]
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Active proxy running on port ${PORT}`));
