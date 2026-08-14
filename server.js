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
        const apiKey = process.env.OPENROUTER_API_KEY;
        const targetUrl = 'https://openrouter.ai/api/v1/chat/completions';
        
        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://render.com',
            'X-Title': 'JanitorAI Custom Proxy'
        };

        const response = await axios.post(targetUrl, req.body, { headers });
        res.status(200).json(response.data);

    } catch (error) {
        console.error('Proxy Error:', error.response?.data || error.message);
        const statusCode = error.response?.status || 500;
        const errorData = error.response?.data || { error: 'OpenRouter proxy communication failure.' };
        res.status(statusCode).json(errorData);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Active proxy running on port ${PORT}`));
