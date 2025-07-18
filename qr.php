<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>WhatsApp QR Code</title>
<style>
  body { font-family: Arial, sans-serif; padding: 20px; }
  #qr-code { margin-top: 20px; }
</style>
</head>
<body>
<h1>WhatsApp Login QR Code</h1>
<div id="qr-code">
    লোড হচ্ছে...
</div>

<script>
async function fetchQr() {
    try {
        const response = await fetch('http://localhost:3000/qr');
        const html = await response.text();
        document.getElementById('qr-code').innerHTML = html;
    } catch (error) {
        document.getElementById('qr-code').innerHTML = 'QR কোড আনতে সমস্যা হয়েছে।';
    }
}

// প্রতি ৫ সেকেন্ডে QR রিফ্রেশ করব
setInterval(fetchQr, 5000);
fetchQr();
</script>

</body>
</html>
