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
let started = false
let sleepTimer = null
let contacts = {}

// 🧠 save message (limit 50)
function saveMessage(text) {
    let data = fs.existsSync("messages.txt")
        ? fs.readFileSync("messages.txt", "utf-8")
        : ""

    let lines = data.split("\n").filter(Boolean)
    lines.push(text)

    if (lines.length > 50) {
        lines = lines.slice(-50)
    }

    fs.writeFileSync("messages.txt", lines.join("\n") + "\n")
}

// 🚀 START BOT (on-demand)
async function startBot() {
    if (started) return

    const { state, saveCreds } = await useMultiFileAuthState("auth")
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
        version,
        auth: state,
        browser: ["Railway", "Chrome", "1.0.0"],
        logger: { level: "silent" } // 🔥 CPU save
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("contacts.upsert", (data) => {
        data.forEach(c => {
            if (c.id) contacts[c.id] = c.notify || c.name || c.id
        })
    })

    sock.ev.on("connection.update", async (update) => {
        const { connection, qr, lastDisconnect } = update

        if (qr) {
            await QRCode.toFile("qr.png", qr)
        }

        if (connection === "open") {
            console.log("✅ Connected")
            if (fs.existsSync("qr.png")) fs.unlinkSync("qr.png")
        }

        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode

            // ❌ logout হলে restart করবে না
            if (reason === DisconnectReason.loggedOut) {
                started = false
                sock = null
                return
            }

            // 🔁 auto reconnect
            setTimeout(startBot, 5000)
        }
    })

    sock.ev.on("messages.upsert", async (m) => {
        try {
            const msg = m.messages[0]
            if (!msg.message || msg.key.fromMe) return

            const sender = msg.key.remoteJid
            let number = sender

            if (contacts[sender]) number = contacts[sender]
            else if (sender.includes("@s.whatsapp.net")) {
                number = sender.split("@")[0]
                if (number.startsWith("880")) number = "+" + number
            } else if (sender.includes("@lid")) {
                number = "Hidden User"
            }

            const text =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                "Media"

            console.log("📩", number, ":", text)
            saveMessage(`${number} : ${text}`)

        } catch (e) {}
    })

    started = true
}

// 😴 AUTO SLEEP
function resetSleepTimer() {
    if (sleepTimer) clearTimeout(sleepTimer)

    sleepTimer = setTimeout(() => {
        console.log("😴 Sleeping...")

        if (sock) {
            sock.ws.close()
        }

        process.exit(0) // 🔥 FULL STOP (no CPU)
    }, 20000) // 20 sec idle
}

// 🌐 Home
app.get("/", (req, res) => {
    res.send("API OK")
})

// 📱 QR
app.get("/qr", (req, res) => {
    if (fs.existsSync("qr.png")) {
        res.sendFile(__dirname + "/qr.png")
    } else {
        res.send("QR not ready")
    }
})

// 📩 Send message (MAIN)
app.post("/send", async (req, res) => {
    try {
        await startBot()

        if (!sock || !sock.user) {
            return res.json({ status: false, msg: "Not connected yet" })
        }

        const { number, message } = req.body

        const jid = number.includes("@s.whatsapp.net")
            ? number
            : number + "@s.whatsapp.net"

        await sock.sendMessage(jid, { text: message })

        resetSleepTimer() // 🔥 activity detected

        res.json({ status: true, msg: "Sent" })

    } catch (err) {
        res.json({ status: false, error: err.message })
    }
})

// 📄 Send doc
app.post("/send-doc", async (req, res) => {
    try {
        await startBot()

        const { number, url, filename } = req.body

        const jid = number + "@s.whatsapp.net"

        await sock.sendMessage(jid, {
            document: { url },
            mimetype: "application/pdf",
            fileName: filename || "file.pdf"
        })

        resetSleepTimer()

        res.json({ status: true })

    } catch (err) {
        res.json({ status: false, error: err.message })
    }
})

// 🔐 LOGOUT (FULL RESET)
app.get("/logout", async (req, res) => {
    try {
        if (sock) await sock.logout()

        if (fs.existsSync("auth")) {
            fs.rmSync("auth", { recursive: true, force: true })
        }

        if (fs.existsSync("qr.png")) fs.unlinkSync("qr.png")

        started = false
        sock = null

        res.send("✅ লগআউট + session delete done")
    } catch (e) {
        res.send("Error")
    }
})

app.listen(3000, () => console.log("Server running"))
