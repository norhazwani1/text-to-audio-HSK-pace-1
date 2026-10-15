
import { KokoroTTS } from "@uzen/kokoro-js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.1-zh-ONNX";

let tts = null;
let currentAudioUrl = null;

const section = document.createElement("section");
section.className = "max-w-3xl mx-auto my-10 p-6 rounded-2xl border";
section.innerHTML = `
  <h2 class="text-2xl font-bold mb-2">Kokoro Bilingual Audio Studio</h2>
  <p class="text-sm mb-4">
    Masukkan satu ayat bagi setiap baris. Sistem akan memilih
    suara berdasarkan bahasa ayat.
  </p>

  <label class="block font-semibold mb-2">Teks Mandarin dan English</label>
  <textarea id="kText" class="w-full border rounded-xl p-3 mb-4"
    rows="8" placeholder="大家好！欢迎参加听力考试。&#10;Hello, everyone! Welcome to the listening test."></textarea>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div>
      <label class="block font-semibold mb-2">Suara Mandarin</label>
      <select id="kZhVoice" class="w-full border rounded-xl p-3">
        <option value="zf_001">Perempuan</option>
        <option value="zm_009">Lelaki</option>
      </select>
    </div>
    <div>
      <label class="block font-semibold mb-2">Suara English</label>
      <select id="kEnVoice" class="w-full border rounded-xl p-3">
        <option value="af_maple">English perempuan — Maple</option>
        <option value="af_sol">English perempuan — Sol</option>
        <option value="bf_vale">English perempuan — Vale</option>
      </select>
    </div>
  </div>

  <div class="mt-5">
    <label class="block font-semibold mb-2">
      Kelajuan: <span id="kSpeedLabel">1.0x</span>
    </label>
    <input id="kSpeed" type="range" min="0.5" max="1.5"
      step="0.1" value="1" class="w-full">
  </div>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
    <div>
      <label class="block font-semibold mb-2">Jeda antara ayat (saat)</label>
      <input id="kSentenceGap" type="number" min="0" max="30"
        step="0.5" value="2" class="w-full border rounded-xl p-3">
    </div>
    <div>
      <label class="block font-semibold mb-2">Ulangan setiap ayat</label>
      <input id="kRepeats" type="number" min="1" max="10"
        step="1" value="1" class="w-full border rounded-xl p-3">
    </div>
    <div>
      <label class="block font-semibold mb-2">Jeda antara ulangan (saat)</label>
      <input id="kRepeatGap" type="number" min="0" max="30"
        step="0.5" value="2" class="w-full border rounded-xl p-3">
    </div>
  </div>

  <button id="kGenerate"
    class="mt-5 bg-blue-600 text-white rounded-xl px-5 py-3 font-semibold">
    Jana Audio WAV
  </button>

  <p id="kStatus" class="my-4 text-sm" aria-live="polite">
    Sedia untuk menjana audio.
  </p>
  <audio id="kPlayer" controls class="w-full mb-3"></audio>
  <a id="kDownload" class="hidden text-blue-700 underline font-semibold"
    download="bilingual-listening-test.wav">Muat turun WAV</a>
`;

document.body.appendChild(section);

const $ = id => document.getElementById(id);
const status = $("kStatus");
const button = $("kGenerate");

$("kSpeed").addEventListener("input", () => {
  $("kSpeedLabel").textContent =
    Number($("kSpeed").value).toFixed(1) + "x";
});

async function loadTTS() {
  if (tts) return tts;

  status.textContent = "Memuatkan model suara. Kali pertama mungkin mengambil masa...";

  try {
    tts = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: "fp32",
      device: "webgpu",
      voicePath: "/kokoro/voices"
    });
  } catch (error) {
    console.warn("WebGPU gagal; mencuba WASM.", error);
    tts = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: "fp32",
      device: "wasm",
      voicePath: "/kokoro/voices"
    });
  }

  return tts;
}

function makeWavBlob(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset, value) {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2,
      sample < 0 ? sample * 32768 : sample * 32767, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function silence(seconds, sampleRate) {
  return new Float32Array(Math.round(seconds * sampleRate));
}

function isChineseLine(text) {
  return /[\u3400-\u4DBF\u4E00-\u9FFF]/.test(text);
}

button.addEventListener("click", async () => {
  const lines = $("kText").value
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    status.textContent = "Sila masukkan teks dahulu.";
    return;
  }

  const sentenceGap = Math.max(0, Math.min(30,
    Number($("kSentenceGap").value) || 0));
  const repeatGap = Math.max(0, Math.min(30,
    Number($("kRepeatGap").value) || 0));
  const repeats = Math.max(1, Math.min(10,
    Math.floor(Number($("kRepeats").value) || 1)));
  const speed = Number($("kSpeed").value);
  const zhVoice = $("kZhVoice").value;
  const enVoice = $("kEnVoice").value;

  button.disabled = true;
  $("kDownload").classList.add("hidden");

  try {
    const engine = await loadTTS();
    const parts = [];
    let sampleRate = 24000;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const voice = isChineseLine(line) ? zhVoice : enVoice;

      status.textContent =
        `Menjana ayat ${i + 1} daripada ${lines.length}...`;

      const result = await engine.generate(line, {
        voice,
        speed
      });

      const samples = result.audio;
      sampleRate = result.sampling_rate;

      for (let r = 0; r < repeats; r++) {
        parts.push(samples);

        if (r < repeats - 1 && repeatGap > 0) {
          parts.push(silence(repeatGap, sampleRate));
        }
      }

      if (i < lines.length - 1 && sentenceGap > 0) {
        parts.push(silence(sentenceGap, sampleRate));
      }
    }

    const totalLength = parts.reduce(
      (sum, part) => sum + part.length, 0
    );
    const combined = new Float32Array(totalLength);
    let offset = 0;

    for (const part of parts) {
      combined.set(part, offset);
      offset += part.length;
    }

    const blob = makeWavBlob(combined, sampleRate);

    if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = URL.createObjectURL(blob);

    $("kPlayer").src = currentAudioUrl;
    $("kDownload").href = currentAudioUrl;
    $("kDownload").classList.remove("hidden");

    status.textContent =
      "Audio siap. Sila dengar dahulu sebelum memuat turun WAV.";
  } catch (error) {
    console.error(error);
    status.textContent =
      "Gagal menjana audio. Buka Console untuk melihat ralat.";
  } finally {
    button.disabled = false;
  }
});
