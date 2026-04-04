const express = require("express")
const app = express()

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys")
const qrcode = require("qrcode-terminal")

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth")
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ["Railway", "Chrome", "1.0.0"]
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", (update) => {
        const { connection, qr, lastDisconnect } = update

        if (qr) {
            console.log("\n📱 QR CODE:\n")
            qrcode.generate(qr, { small: true })
        }

        if (connection === "open") {
            console.log("✅ WhatsApp Connected")
        }

        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode

            console.log("❌ Connection closed")

            if (reason !== DisconnectReason.loggedOut) {
                console.log("🔁 Reconnecting in 5s...")
                setTimeout(startBot, 5000) // delay add করেছি (important)
            } else {
                console.log("❌ Logged out! Delete auth folder")
            }
        }
    })
}

startBot()

app.get("/", (req, res) => {
    res.send("WhatsApp API Running")
})

app.listen(3000, () => {
    console.log("Server running")
})
