const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
    res.status(200).send('Proxy status: Online and running.');
});

// Handles requests from JanitorAI
app.post(['/v1', '/v1/chat/completions', '/chat/completions'], async (req, res) => {
    try {
        // Google's official OpenAI-compatible endpoint
        const targetUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
        
        // Pass your Google AI Studio API Key
        const headers = {
            'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`,
            'Content-Type': 'application/json'
        };

        if (req.body.stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const response = await axios({
                method: 'post',
                url: targetUrl,
                data: req.body,
                headers: headers,
                responseType: 'stream'
            });

            response.data.pipe(res);
        } else {
            const response = await axios.post(targetUrl, req.body, { headers });
            res.status(200).json(response.data);
        }

    } catch (error) {
        console.error('Proxy Error:', error.response?.data || error.message);
        const statusCode = error.response?.status || 500;
        const errorData = error.response?.data || { error: 'Proxy communication failure.' };
        res.status(statusCode).json(errorData);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Active proxy running on port ${PORT}`));
