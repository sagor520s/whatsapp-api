const express = require("express")
const app = express()

const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys")

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("auth")

    const sock = makeWASocket({
        auth: state
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", (update) => {
        const { connection, qr } = update

        if (qr) {
            console.log("SCAN QR:", qr)
        }

        if (connection === "open") {
            console.log("✅ WhatsApp Connected")
        }
    })
}

startBot()

app.get("/", (req, res) => {
    res.send("WhatsApp API Running")
})

app.listen(3000, () => {
    console.log("Server running on port 3000")
})
