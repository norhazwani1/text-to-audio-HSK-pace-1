
import { KokoroTTS } from "@uzen/kokoro-js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.1-zh-ONNX";

let tts = null;
let currentAudioUrl = null;

const section = document.createElement("section");
section.className = "max-w-3xl mx-auto my-10 p-6 rounded-2xl border";
section.innerHTML = `
  <h2 class="text-2xl font-bold mb-2">Kokoro Mandarin Audio</h2>
  <p class="text-sm mb-4">
    Jana audio Mandarin dan muat turun sebagai WAV.
  </p>

  <label class="block font-semibold mb-2" for="kokoroText">
    Teks Mandarin
  </label>
  <textarea id="kokoroText"
    class="w-full border rounded-xl p-3 mb-4"
    rows="5">你好！欢迎参加汉语听力考试。</textarea>

  <label class="block font-semibold mb-2" for="kokoroVoice">
    Pilih suara
  </label>
  <select id="kokoroVoice" class="w-full border rounded-xl p-3 mb-4">
    <option value="zf_001">Suara perempuan</option>
    <option value="zm_009">Suara lelaki</option>
  </select>

  <label class="block font-semibold mb-2" for="kokoroSpeed">
    Kelajuan: <span id="kokoroSpeedLabel">1.0</span>
  </label>
  <input id="kokoroSpeed" type="range" min="0.5" max="1.5"
    step="0.1" value="1" class="w-full mb-4">

  <button id="kokoroGenerate"
    class="bg-blue-600 text-white rounded-xl px-5 py-3 font-semibold">
    Jana Audio WAV
  </button>

  <p id="kokoroStatus" class="my-4 text-sm" aria-live="polite">
    Sedia untuk menjana audio.
  </p>

  <audio id="kokoroPlayer" controls class="w-full mb-3"></audio>

  <a id="kokoroDownload"
    class="hidden text-blue-700 underline font-semibold"
    download="mandarin-kokoro.wav">
    Muat turun audio WAV
  </a>
`;

document.body.appendChild(section);

const textInput = document.getElementById("kokoroText");
const voiceInput = document.getElementById("kokoroVoice");
const speedInput = document.getElementById("kokoroSpeed");
const speedLabel = document.getElementById("kokoroSpeedLabel");
const generateButton = document.getElementById("kokoroGenerate");
const status = document.getElementById("kokoroStatus");
const player = document.getElementById("kokoroPlayer");
const downloadLink = document.getElementById("kokoroDownload");

speedInput.addEventListener("input", () => {
  speedLabel.textContent = Number(speedInput.value).toFixed(1);
});

async function loadKokoro() {
  if (tts) return tts;

  status.textContent = "Memuatkan model Kokoro. Kali pertama mungkin mengambil masa...";

  try {
    tts = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: "fp32",
      device: "webgpu",
      voicePath: "/kokoro/voices"
    });
  } catch (webgpuError) {
    console.warn("WebGPU gagal; cuba WASM.", webgpuError);

    status.textContent = "Mencuba mod keserasian WASM...";

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
    const pcm = sample < 0 ? sample * 32768 : sample * 32767;
    view.setInt16(44 + i * 2, pcm, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

generateButton.addEventListener("click", async () => {
  const text = textInput.value.trim();

  if (!text) {
    status.textContent = "Sila masukkan teks Mandarin dahulu.";
    return;
  }

  generateButton.disabled = true;
  downloadLink.classList.add("hidden");

  try {
    const engine = await loadKokoro();

    status.textContent = "Menjana suara Mandarin...";
    const audio = await engine.generate(text, {
      voice: voiceInput.value,
      speed: Number(speedInput.value)
    });

    const wavBlob = makeWavBlob(audio.audio, audio.sampling_rate);

    if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = URL.createObjectURL(wavBlob);

    player.src = currentAudioUrl;
    downloadLink.href = currentAudioUrl;
    downloadLink.classList.remove("hidden");

    status.textContent = "Audio siap! Tekan Play untuk mendengar atau muat turun WAV.";
  } catch (error) {
    console.error(error);
    status.textContent =
      "Audio gagal dijana. Semak sambungan internet, fail suara dan Console jika masalah berterusan.";
  } finally {
    generateButton.disabled = false;
  }
});
