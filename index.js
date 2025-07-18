const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const app = express();

app.use(express.json());

// WhatsApp Client with session saving (LocalAuth)
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true }
});

// QR কোড আসলে টার্মিনালে দেখাবে
client.on('qr', (qr) => {
    console.log('📱 Scan this QR Code:');
    qrcode.generate(qr, { small: true });
});

// বট প্রস্তুত হলে
client.on('ready', () => {
    console.log('✅ WhatsApp is ready!');
});

client.initialize();

// API endpoint: POST /send
app.post('/send', async (req, res) => {
    const number = req.body.number;  // দেশের কোড সহ নম্বর, যেমন 88017XXXXXX
    const message = req.body.message;
    const chatId = number.includes('@c.us') ? number : number + '@c.us';

    try {
        await client.sendMessage(chatId, message);
        res.json({ status: 'success', to: number });
    } catch (error) {
        res.json({ status: 'error', message: error.message });
    }
});

// Express server চালু করা
app.listen(3000, () => {
    console.log('🚀 Server is running on http://localhost:3000');
});
