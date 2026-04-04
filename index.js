const express = require("express")
const fs = require("fs")
const QRCode = require("qrcode")

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys")

const app = express()
app.use(express.json())

let sock = null

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth")
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
        version,
        auth: state,
        browser: ["Railway", "Chrome", "1.0.0"]
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", async (update) => {
        const { connection, qr, lastDisconnect } = update

        // 📱 QR generate PNG
        if (qr) {
            console.log("QR received")
            await QRCode.toFile("qr.png", qr)
            console.log("QR saved as qr.png")
        }

        // ✅ Connected
        if (connection === "open") {
            console.log("✅ WhatsApp Connected")

            if (fs.existsSync("qr.png")) {
                fs.unlinkSync("qr.png")
            }
        }

        // 🔁 reconnect
        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode

            console.log("❌ Connection closed")

            if (reason !== DisconnectReason.loggedOut) {
                console.log("🔁 Reconnecting in 5s...")
                setTimeout(startBot, 5000)
            } else {
                console.log("❌ Logged out")
            }
        }
    })

    // 📥 Incoming messages
    sock.ev.on("messages.upsert", async (m) => {
        try {
            const msg = m.messages[0]
            if (!msg.message) return

            const sender = msg.key.remoteJid
            const text =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text

            console.log("📩 New Message:")
            console.log("From:", sender)
            console.log("Text:", text)

            // 📝 Save message
            fs.appendFileSync("messages.txt", `${sender} : ${text}\n`)

            // 🤖 Auto reply
            await sock.sendMessage(sender, {
                text: "Auto reply 🤖"
            })

        } catch (err) {
            console.log(err)
        }
    })
}

startBot()

// 🌐 Home route
app.get("/", (req, res) => {
    res.send("WhatsApp API Running ✅")
})

// 📱 QR route
app.get("/qr", (req, res) => {
    if (fs.existsSync("qr.png")) {
        res.sendFile(__dirname + "/qr.png")
    } else {
        res.send("QR not ready or already scanned")
    }
})

// 📩 Send text message
app.post("/send", async (req, res) => {
    try {
        if (!sock || !sock.user) {
            return res.json({ status: false, msg: "WhatsApp not connected" })
        }

        const { number, message } = req.body

        if (!number || !message) {
            return res.json({ status: false, msg: "number & message required" })
        }

        const jid = number.includes("@s.whatsapp.net")
            ? number
            : number + "@s.whatsapp.net"

        await sock.sendMessage(jid, { text: message })

        res.json({ status: true, msg: "Message sent" })

    } catch (err) {
        console.log(err)
        res.json({ status: false, error: err.message })
    }
})

// 📄 Send document
app.post("/send-doc", async (req, res) => {
    try {
        if (!sock || !sock.user) {
            return res.json({ status: false, msg: "WhatsApp not connected" })
        }

        const { number, url, filename } = req.body

        if (!number || !url) {
            return res.json({ status: false, msg: "number & url required" })
        }

        const jid = number + "@s.whatsapp.net"

        await sock.sendMessage(jid, {
            document: { url: url },
            mimetype: "application/pdf",
            fileName: filename || "file.pdf"
            
        })

        res.json({ status: true, msg: "Document sent" })

    } catch (err) {
        console.log(err)
        res.json({ status: false, error: err.message })
    }
})

// 📜 View received messages
app.get("/messages", (req, res) => {
    if (fs.existsSync("messages.txt")) {
        const data = fs.readFileSync("messages.txt", "utf-8")
        res.send(`<pre>${data}</pre>`)
    } else {
        res.send("No messages yet")
    }
})

// 🔐 Logout route
app.get("/logout", async (req, res) => {
    try {
        if (sock) {
            await sock.logout()
        }

        if (fs.existsSync("auth")) {
            fs.rmSync("auth", { recursive: true, force: true })
        }

        res.send("Logged out successfully. Restart service.")

    } catch (err) {
        res.send("Error: " + err.message)
    }
})
app.get("/check", (req, res) => {
    res.send("NEW CODE ACTIVE")
})
// 🚀 Start server
app.listen(3000, () => {
    console.log("Server running on port 3000")
})
