const express = require("express")
const fs = require("fs")
const QRCode = require("qrcode")
const axios = require("axios") // npm install axios

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys")

const app = express()
app.use(express.json())

let sock = null
let contacts = {}
let messageQueue = [] // 🆕 Rate limiting queue
let isProcessingQueue = false

// 🧠 message save (FIXED: better format)
function saveMessage(sender, number, text) {
    const timestamp = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })
    const entry = `[${timestamp}] ${number} (${sender}) : ${text}\n`
    
    let data = ""
    if (fs.existsSync("messages.txt")) {
        data = fs.readFileSync("messages.txt", "utf-8")
    }
    
    let lines = data.split("\n").filter(Boolean)
    lines.push(entry.trim())
    
    if (lines.length > 100) { // বাড়িয়ে দিলাম
        lines = lines.slice(-100)
    }
    
    fs.writeFileSync("messages.txt", lines.join("\n") + "\n")
}

// 🆕 RATE LIMITING: Queue system to prevent ban
async function processQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return
    isProcessingQueue = true
    
    while (messageQueue.length > 0) {
        const { jid, message, res } = messageQueue.shift()
        try {
            // ⏱️ 2-3 seconds delay between messages
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000))
            await sock.sendMessage(jid, message)
            if (res) res.json({ status: true, msg: "Sent" })
        } catch (err) {
            console.error("Queue send error:", err.message)
            if (res) res.json({ status: false, error: err.message })
        }
    }
    
    isProcessingQueue = false
}

function queueMessage(jid, message, res = null) {
    messageQueue.push({ jid, message, res })
    processQueue()
}

// 🚀 start bot (FIXED: better config)
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth")
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, console)
        },
        // 🆕 FIXED: Realistic browser to avoid detection
        browser: ["Ubuntu", "Chrome", "22.04.4"],
        printQRInTerminal: false,
        // 🆕 FIXED: Connection config
        markOnlineOnConnect: true,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false, // Don't sync old messages
        // 🆕 FIXED: Retry delay
        getMessage: async () => undefined,
        retryRequestDelayMs: 5000
    })

    sock.ev.on("creds.update", saveCreds)

    // contacts
    sock.ev.on("contacts.upsert", (data) => {
        data.forEach(c => {
            if (c.id) {
                contacts[c.id] = c.notify || c.name || c.id
            }
        })
    })

    // connection
    sock.ev.on("connection.update", async (update) => {
        const { connection, qr, lastDisconnect } = update

        if (qr) {
            await QRCode.toFile("qr.png", qr)
            console.log("📱 QR generated")
        }

        if (connection === "open") {
            console.log("✅ WhatsApp Connected")
            if (fs.existsSync("qr.png")) fs.unlinkSync("qr.png")
        }

        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode
            console.log("❌ Connection closed:", reason, DisconnectReason[reason])

            // 🆕 FIXED: Don't auto-reconnect too fast
            if (reason !== DisconnectReason.loggedOut) {
                const delay = reason === 403 ? 60000 : 10000 // Longer delay for ban
                console.log(`⏳ Reconnecting in ${delay/1000}s...`)
                setTimeout(startBot, delay)
            }
        }
    })

    // 🆕 FIXED: Presence update (shows online)
    sock.ev.on("presence.update", (m) => {
        // console.log("Presence:", m)
    })

    // incoming message (FIXED: proper number extraction)
    sock.ev.on("messages.upsert", async (m) => {
        try {
            const msg = m.messages[0]
            if (!msg.message) return
            if (msg.key.fromMe) return

            const sender = msg.key.remoteJid
            let displayNumber = sender
            let rawNumber = sender

            // 🆕 FIXED: Better number extraction
            if (sender.includes("@s.whatsapp.net")) {
                rawNumber = sender.split("@")[0]
                displayNumber = rawNumber.startsWith("880") ? "+" + rawNumber : rawNumber
                
                // Try to get name from contacts
                if (contacts[sender]) {
                    displayNumber = `${contacts[sender]} (${displayNumber})`
                }
            } 
            else if (sender.includes("@lid")) {
                // 🆕 FIXED: @lid handling - try to get real number
                rawNumber = sender.split("@")[0]
                displayNumber = `User_${rawNumber}`
                
                // Sometimes pushName is available
                if (msg.pushName) {
                    displayNumber = `${msg.pushName} [LID]`
                }
            }
            else if (sender.includes("@g.us")) {
                displayNumber = `Group: ${sender}`
                rawNumber = sender
            }

            const text =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption ||
                msg.message.videoMessage?.caption ||
                "Media message"

            console.log("📩", displayNumber, ":", text)
            console.log("🔍 Raw:", sender, "| PushName:", msg.pushName || "N/A")

            saveMessage(sender, displayNumber, text)

            // 🆕 FIXED: Auto-reply with delay (rate limit safe)
            const lowerText = text.toLowerCase()
            if (lowerText === "hi" || lowerText === "hello" || lowerText === "start") {
                // Add to queue instead of direct send
                queueMessage(sender, { 
                    text: "Hello! 👋 Welcome to our service.\n\nHow can I help you today?" 
                })
            }

        } catch (err) {
            console.error("Message handler error:", err)
        }
    })
}

startBot()

// 🌐 Home
app.get("/", (req, res) => {
    res.send("WhatsApp API Running ✅")
})

// 📱 QR
app.get("/qr", (req, res) => {
    if (fs.existsSync("qr.png")) {
        res.sendFile(__dirname + "/qr.png")
    } else {
        res.send("QR not ready or already connected")
    }
})

// 📩 Send text (FIXED: queue system)
app.post("/send", async (req, res) => {
    try {
        if (!sock || !sock.user) {
            return res.json({ status: false, msg: "WhatsApp not connected" })
        }

        const { number, message } = req.body

        if (!number || !message) {
            return res.json({ status: false, msg: "number & message required" })
        }

        // 🆕 FIXED: Validate number format
        let cleanNumber = number.replace(/\D/g, '') // Remove non-digits
        if (cleanNumber.startsWith('0')) {
            cleanNumber = '88' + cleanNumber.substring(1) // Bangladesh fix
        }
        if (!cleanNumber.startsWith('880')) {
            cleanNumber = '880' + cleanNumber
        }

        const jid = cleanNumber + "@s.whatsapp.net"

        // 🆕 FIXED: Add to queue with response
        queueMessage(jid, { text: message }, res)

    } catch (err) {
        res.json({ status: false, error: err.message })
    }
})

// 📄 Send document (FIXED: queue + validation)
app.post("/send-doc", async (req, res) => {
    try {
        if (!sock || !sock.user) {
            return res.json({ status: false, msg: "WhatsApp not connected" })
        }

        const { number, url, filename, message } = req.body

        if (!number || !url) {
            return res.json({ status: false, msg: "number & url required" })
        }

        // 🆕 FIXED: Number validation
        let cleanNumber = number.replace(/\D/g, '')
        if (cleanNumber.startsWith('0')) {
            cleanNumber = '88' + cleanNumber.substring(1)
        }
        if (!cleanNumber.startsWith('880')) {
            cleanNumber = '880' + cleanNumber
        }

        const jid = cleanNumber + "@s.whatsapp.net"

        // 🆕 FIXED: Download and send (more stable)
        try {
            const response = await axios.get(url, { responseType: 'arraybuffer' })
            const buffer = Buffer.from(response.data)
            
            // Queue document
            queueMessage(jid, {
                document: buffer,
                mimetype: "application/pdf",
                fileName: filename || "document.pdf"
            })

            // Queue text if provided
            if (message) {
                queueMessage(jid, { text: message })
            }

            res.json({ status: true, msg: "Document queued for sending" })

        } catch (downloadErr) {
            // Fallback: send URL as text
            queueMessage(jid, { 
                text: `📄 Document: ${url}\n\n${message || ''}` 
            })
            res.json({ status: true, msg: "Sent as link (download failed)" })
        }

    } catch (err) {
        res.json({ status: false, error: err.message })
    }
})

// 📜 View messages (FIXED: better format)
app.get("/messages", (req, res) => {
    if (fs.existsSync("messages.txt")) {
        const data = fs.readFileSync("messages.txt", "utf-8")
        res.send(`<pre style="font-family:monospace;white-space:pre-wrap;">${data}</pre>`)
    } else {
        res.send("No messages yet")
    }
})

// 🧹 Clear
app.get("/clear", (req, res) => {
    fs.writeFileSync("messages.txt", "")
    res.send("Messages cleared ✅")
})

// 🔐 Logout
app.get("/logout", async (req, res) => {
    try {
        if (sock) await sock.logout()
        if (fs.existsSync("auth")) fs.rmSync("auth", { recursive: true, force: true })
        res.send("Logged out ✅")
    } catch (e) {
        res.json({ status: false, error: e.message })
    }
})

// 🧪 Check
app.get("/check", (req, res) => {
    res.json({ 
        status: "active", 
        connected: !!sock?.user,
        user: sock?.user?.id || null,
        queue: messageQueue.length
    })
})

app.listen(3000, () => {
    console.log("Server running on port 3000")
})
