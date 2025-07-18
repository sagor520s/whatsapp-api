<?php
$url = 'http://localhost:3000/send';

$data = [
    'number' => '12029301424',  // দেশের কোডসহ WhatsApp নম্বর
    'message' => 'Hello! PHP থেকে WhatsApp মেসেজ পাঠানো হলো!'
];

$options = [
    'http' => [
        'header'  => "Content-Type: application/json",
        'method'  => 'POST',
        'content' => json_encode($data),
    ],
];

$context  = stream_context_create($options);
$response = file_get_contents($url, false, $context);

echo $response;
?>
