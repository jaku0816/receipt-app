export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = req.query.model || 'gemini-1.5-flash';

  // 1. 超級防呆：檢查密碼是否存在
  if (!apiKey) {
    console.error("Missing GEMINI_API_KEY in environment variables.");
    return res.status(500).json({ error: { message: "Vercel 找不到環境變數 GEMINI_API_KEY！請確認 Vercel 設定並重新 Deploy。" } });
  }

  try {
    // 確保 body 格式正確
    const requestBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: requestBody,
    });

    // 2. 攔截並印出 Google 的真實拒絕理由
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google API Failed:", response.status, errorText);
      return res.status(response.status).json({ error: { message: `Google 拒絕連線 (${response.status}): ${errorText}` } });
    }

    const data = await response.json();
    return res.status(200).json(data);
    
  } catch (error) {
    console.error("Vercel Fetch Error:", error.message);
    return res.status(500).json({ error: { message: `Vercel 伺服器內部崩潰: ${error.message}` } });
  }
}