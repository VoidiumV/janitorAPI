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
        // Default to gemini-1.5-flash if model isn't recognized
        let rawModel = req.body.model || 'gemini-2.5-flash';
        let modelName = rawModel.replace(/^google\//, ''); // strip 'google/' prefix if sent

        // Native Gemini REST API endpoint
        const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        // Convert OpenAI messages format to Gemini contents format
        const contents = (req.body.messages || []).map(msg => {
            let role = msg.role === 'assistant' ? 'model' : 'user';
            // System prompt messages get passed as user role in basic contents array
            if (msg.role === 'system') role = 'user';
            return {
                role: role,
                parts: [{ text: msg.content || '' }]
            };
        });

        // Construct native Gemini payload with complete safety override
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
                maxOutputTokens: req.body.max_tokens ?? 2000
            }
        };

        const response = await axios.post(targetUrl, nativePayload, {
            headers: { 'Content-Type': 'application/json' }
        });

        const candidate = response.data.candidates?.[0];
        const generatedText = candidate?.content?.parts?.[0]?.text || '';

        // If Gemini hard-blocks at the safety evaluation stage before generating text
        if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
             return res.status(200).json({
                 choices: [{
                     message: { role: 'assistant', content: "[OOC: The model refused this specific prompt due to hard system safety guidelines.]" },
                     finish_reason: 'stop'
                 }]
             });
        }

        // Format Gemini response back into standard OpenAI structure for JanitorAI
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
        console.error('Proxy Error:', error.response?.data || error.message);
        const statusCode = error.response?.status || 500;
        const errorData = error.response?.data || { error: 'Proxy communication failure.' };
        res.status(statusCode).json(errorData);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Active proxy running on port ${PORT}`));
