import { GoogleGenAI } from '@google/genai';

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });
  }

  try {
    const ai = new GoogleGenAI({ 
      apiKey,
      httpOptions: { timeout: 55000 }
    });
    
    const systemInstruction = "أنت المساعد الذكي لمنصة تعليمية. دائماً في أول رسالة لك، يجب أن ترحب بالمستخدم وتقول: 'أهلاً وسهلاً بك، معك المساعد الذكي'. بعدها، قم بالرد على استفساره بلطف واحترافية وباللغة العربية.";

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: message,
      config: {
        systemInstruction: systemInstruction,
      }
    });

    return res.status(200).json({ text: response.text });
  } catch (error) {
    console.error('Gemini API Error:', error);
    return res.status(500).json({ error: 'Failed to generate content from Gemini' });
  }
}