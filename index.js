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

    // ❌ IMPORTANT: auth delete remove করা হয়েছে
    // (না হলে বারবার QR scan লাগবে)

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

        // ✅ QR PNG generate
        if (qr) {
            console.log("QR received")
            await QRCode.toFile("qr.png", qr)
            console.log("QR saved")
        }

        // ✅ Connected
        if (connection === "open") {
            console.log("✅ WhatsApp Connected")

            if (fs.existsSync("qr.png")) {
                fs.unlinkSync("qr.png")
            }
        }

        // 🔁 reconnect system (safe)
        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode

            console.log("❌ Connection closed")

            if (reason !== DisconnectReason.loggedOut) {
                console.log("🔁 Reconnecting in 5s...")
                setTimeout(startBot, 5000)
            } else {
                console.log("❌ Logged out! Delete auth folder manually")
            }
        }
    })
}

startBot()

// 🌐 Home
app.get("/", (req, res) => {
    res.send("WhatsApp API Running ✅")
})

// 📱 QR endpoint
app.get("/qr", (req, res) => {
    if (fs.existsSync("qr.png")) {
        res.sendFile(__dirname + "/qr.png")
    } else {
        res.send("QR not ready or already scanned")
    }
})

// 📩 Send message API (improved)
app.post("/send", async (req, res) => {
    try {
        if (!sock) {
            return res.json({ status: false, msg: "WhatsApp not ready" })
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

// 🚀 Server start
app.listen(3000, () => {
    console.log("Server running on port 3000")
})
