const express = require("express")
const app = express()

const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys")
const qrcode = require("qrcode-terminal")

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth")

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", (update) => {
        const { connection, qr } = update

        if (qr) {
            console.log("📱 Scan QR নিচে:")
            qrcode.generate(qr, { small: true })
        }

        if (connection === "open") {
            console.log("✅ WhatsApp Connected")
        }

        if (connection === "close") {
            console.log("❌ Connection closed, retrying...")
            startBot()
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
