import OpenAI from "openai";
import fs from "fs";
import path from "path";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 辞書ファイル読み込み
const dictPath = path.join(process.cwd(), "dictionary.json");
let DICT = {};
try {
  DICT = JSON.parse(fs.readFileSync(dictPath, "utf8"));
} catch (error) {
  console.error("✅ dictionary.json の読み込みに失敗:", error);
}

// カタカナ + 英語略語を検出
const KATAKANA_RE = /[ァ-ヴー]+/g;
const ACRONYM_RE = /\b[A-Z]{2,6}\b/g;

/**
 * 文からカタカナ語・略語を取り出す関数
 */
function extractTerms(text) {
  const terms = new Set();
  let match;

  while ((match = KATAKANA_RE.exec(text)) !== null) {
    terms.add(match[0]);
  }
  while ((match = ACRONYM_RE.exec(text)) !== null) {
    terms.add(match[0]);
  }
  return [...terms];
}

/**
 * 辞書にない単語はAIに「短く日本語」で説明させる
 */
async function getMeaningFromAI(term) {
  const prompt = `ビジネス用語「${term}」の意味を、日本の高校生にもわかるように、やさしい日本語で1文で説明してください。`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 60,
  });

  return response.choices[0]?.message?.content?.trim() || "説明準備中";
}

/**
 * 音声データ(base64)をWhisperに渡して、文字起こし
 */
async function transcribeAudio(base64Audio) {
  const buffer = Buffer.from(base64Audio, "base64");
  const file = new File([buffer], "audio.webm", { type: "audio/webm" });

  const result = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "ja",
  });

  return result.text || "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { audioBase64 } = req.body;
  if (!audioBase64) {
    return res.status(400).json({ error: "audioBase64 is required" });
  }

  try {
    // ① 音声 → Whisperで文字起こし
    const text = await transcribeAudio(audioBase64);
    console.log("Whisper文字起こし:", text);

    // ② カタカナ＆略語を抽出
    const terms = extractTerms(text);

    // ③ 辞書 or AIで意味を取得
    const results = [];
    for (const term of terms) {
      if (DICT[term]) {
        results.push({ term, meaning: DICT[term], source: "dictionary" });
      } else {
        const meaning = await getMeaningFromAI(term);
        results.push({ term, meaning, source: "ai" });
      }
    }

    res.status(200).json({ terms: results, text });
  } catch (error) {
    console.error("❌ Server error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
