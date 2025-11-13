const startBtn = document.getElementById('startBtn');
const stopBtn  = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const cardsEl  = document.getElementById('cards');

// 重複カードを出さないように記録
const seen = new Set();

let mediaRecorder;
let chunks = [];

// ▼「開始」ボタンが押されたら
startBtn.onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.start(3000); // ← 3秒ごとに音声データを区切る

    statusEl.textContent = '🎙 録音中…';
    startBtn.disabled = true;
    stopBtn.disabled = false;

    // 音声をサーバーに送るループ
    sendLoop();
  } catch (err) {
    console.error(err);
    alert('マイクの使用が許可されていません');
  }
};

// ▼「停止」ボタンが押されたら
stopBtn.onclick = () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    statusEl.textContent = '⏹ 停止中';
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
};

// ▼ サーバーに音声を送り続ける処理
async function sendLoop() {
  if (!mediaRecorder || mediaRecorder.state !== 'recording') return;

  if (chunks.length > 0) {
    const blob = new Blob(chunks, { type: 'audio/webm' });
    chunks = [];

    const base64 = await blobToBase64(blob);

    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: base64 })
      });
      const data = await res.json();

      if (data.terms && Array.isArray(data.terms)) {
        data.terms.forEach((item) => {
          const key = item.term + ':' + item.meaning;
          if (!seen.has(key)) {
            seen.add(key);
            addCard(item.term, item.meaning);
          }
        });
      }
    } catch (err) {
      console.error(err);
    }
  }

  setTimeout(sendLoop, 1000); // 1秒ごとに次のチェック
}

// ▼ カードを画面に追加
function addCard(term, meaning) {
  const card = document.createElement('div');
  card.className = 'card';

  const t = document.createElement('div');
  t.className = 'term';
  t.textContent = term;

  const m = document.createElement('div');
  m.className = 'meaning';
  m.textContent = meaning;

  card.appendChild(t);
  card.appendChild(m);
  cardsEl.appendChild(card);

  card.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// ▼ Blob → Base64 変換（APIで送るため）
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
