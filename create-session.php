<?php
// CORS اور ہیڈرز تاکہ فرنٹ اینڈ سے ریکوئسٹ میں کوئی مسئلہ نہ آئے
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

header('Content-Type: application/json');

// اگر Composer استعمال کر رہے ہیں تو autoload لازمی ہے
require_once 'vendor/autoload.php';

// config.php سے اسٹرائپ کی سیک্রেট کی لوڈ کرنا
$config = include('config.php');
\Stripe\Stripe::setApiKey($config['stripe_secret_key']);

try {
    // فرنٹ اینڈ سے آنے والا ڈیٹا پڑھنا
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    $items = $data['items'] ?? [];

    if (empty($items) || !is_array($items)) {
        http_response_code(400);
        echo json_encode(['error' => 'Cart is empty or invalid data format.']);
        exit();
    }

    $lineItems = [];

    foreach ($items as $item) {
        // نام، قیمت اور مقدار سیٹ کرنا (Supabase یا فرنٹ اینڈ کے س്ട్రکچر کے مطابق)
        $productName = $item['product']['name'] ?? $item['name'] ?? 'Kids Coloring Book';
        $productPrice = floatval($item['product']['price'] ?? $item['price'] ?? 4.99);
        $quantity = intval($item['qty'] ?? 1);

        $lineItems[] = [
            'price_data' => [
                'currency'     => 'usd',
                'product_data' => [
                    'name' => $productName,
                ],
                'unit_amount'  => round($productPrice * 100), // سینٹس میں قیمت
            ],
            'quantity' => $quantity,
        ];
    }

    // Stripe Checkout Session بنانا
    $checkoutSession = \Stripe\Checkout\Session::create([
        'payment_method_types' => ['card'],
        'mode'                 => 'payment',
        'line_items'           => $lineItems,
        'allow_promotion_codes'=> true,
        'success_url'          => 'https://evernewkid.com/success.html?session_id={CHECKOUT_SESSION_ID}',
        'cancel_url'           => 'https://evernewkid.com/checkout.html',
    ]);

    // فرنٹ اینڈ کو سیشن آئی ڈی اور URL واپس بھیجنا
    echo json_encode([
        'id'  => $checkoutSession->id,
        'url' => $checkoutSession->url
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}