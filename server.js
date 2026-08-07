const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// Enable CORS so Janitor AI can safely communicate with your Render server
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check route for Render's automatic deployment verification
app.get('/', (req, res) => {
    res.status(200).send('Proxy status: Online and running.');
});

// The core endpoint Janitor AI sends chat requests to
app.post('/v1/chat/completions', async (req, res) => {
    try {
        // FIXED: Added the mandatory API endpoint path required by OpenRouter
        const targetUrl = 'https://openrouter.ai';
        
        // Setup headers, embedding your private OpenRouter Key hidden in Render environment settings
        const headers = {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://render.com', 
            'X-Title': 'JanitorAI Custom Render Proxy'
        };

        // Check if Janitor AI requested streaming (real-time typing effect)
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

            // Stream chunked bits of model data right back to the client interface
            response.data.pipe(res);
        } else {
            // Standard static response fallback
            const response = await axios.post(targetUrl, req.body, { headers });
            res.status(200).json(response.data);
        }

    } catch (error) {
        console.error('Proxy Error:', error.message);
        const statusCode = error.response?.status || 500;
        const errorData = error.response?.data || { error: 'Internal proxy communication failure.' };
        res.status(statusCode).json(errorData);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Active proxy running on port ${PORT}`));
