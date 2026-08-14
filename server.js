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
        let rawModel = req.body.model || 'gemini-1.5-flash';
        let modelName = rawModel.replace(/^google\//, '');

        const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        let messages = req.body.messages || [];
        
        // Map messages into Gemini's expected contents structure cleanly
        const contents = messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content || '' }]
        }));

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
                temperature: req.body.temperature ?? 1.0,
                maxOutputTokens: req.body.max_tokens || 2000
            }
        };

        const response = await axios.post(targetUrl, nativePayload, {
            headers: { 'Content-Type': 'application/json' }
        });

        const candidate = response.data?.candidates?.[0];
        let generatedText = '';
        
        if (candidate?.content?.parts) {
            generatedText = candidate.content.parts.map(p => p.text || '').join('');
        }

        // If it got blocked or came back empty, try to pass a subtle continuation instead of a canned fallback sentence
        if (!generatedText || generatedText.trim() === '') {
            generatedText = "[Response filtered by upstream provider. Please swipe or edit your message to bypass.]";
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
        
        // Pass the actual error message back to the logs so you can see what Google rejected
        const errorMsg = error.response?.data?.error?.message || error.message;
        
        return res.status(200).json({
            choices: [{
                message: { 
                    role: 'assistant', 
                    content: `[API Error Notice: ${errorMsg}]` 
                },
                finish_reason: 'stop'
            }]
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Active proxy running on port ${PORT}`));
