/**
 * TTS Worker — 独立 Node.js 子进程执行 sherpa-onnx TTS
 *
 * Electron 40 的 V8 禁止 N-API external ArrayBuffer，
 * sherpa-onnx 的 OfflineTts.generate() 返回的 Float32Array 底层就是 external buffer，
 * 导致在 Electron 主进程中调用必定报 "External buffers are not allowed"。
 *
 * 解决方案：用独立的 Node.js 进程（不受 Electron V8 限制）执行 TTS，
 * 直接将结果写入 WAV 文件，主进程只传文件路径给渲染进程播放。
 *
 * 用法: node tts-worker.js <模型目录> <输出WAV路径> <文本>
 */

const path = require("path");
const fs = require("fs");

const args = process.argv.slice(2);
if (args.length < 3) {
  process.stderr.write("Usage: node tts-worker.js <ttsDir> <outputPath> <text>\n");
  process.exit(1);
}

const ttsDir = args[0];
const outputPath = args[1];
const text = args[2];

try {
  // 加载 sherpa-onnx-node
  const sherpa = require("sherpa-onnx-node");

  const ttsConfig = {
    model: {
      vits: {
        model: path.join(ttsDir, "theresa.onnx"),
        tokens: path.join(ttsDir, "tokens.txt"),
        lexicon: path.join(ttsDir, "lexicon.txt"),
      },
      numThreads: 2,
      provider: "cpu",
      debug: false,
    },
    maxNumSentences: 1,
  };

  const tts = new sherpa.OfflineTts(ttsConfig);
  const audio = tts.generate({ text, sid: 0, speed: 1.0 });

  const samples = audio.samples;
  const sampleRate = audio.sampleRate;
  const numSamples = samples.length;

  // 构造 WAV 文件（PCM 16-bit mono）
  const bitsPerSample = 16;
  const byteRate = sampleRate * 1 * (bitsPerSample / 8);
  const blockAlign = 1 * (bitsPerSample / 8);
  const dataSize = numSamples * (bitsPerSample / 8);
  const headerSize = 44;
  const wavBuf = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  wavBuf.write("RIFF", 0);
  wavBuf.writeUInt32LE(36 + dataSize, 4);
  wavBuf.write("WAVE", 8);
  // fmt chunk
  wavBuf.write("fmt ", 12);
  wavBuf.writeUInt32LE(16, 16);
  wavBuf.writeUInt16LE(1, 20); // PCM
  wavBuf.writeUInt16LE(1, 22); // mono
  wavBuf.writeUInt32LE(sampleRate, 24);
  wavBuf.writeUInt32LE(byteRate, 28);
  wavBuf.writeUInt16LE(blockAlign, 32);
  wavBuf.writeUInt16LE(bitsPerSample, 34);
  // data chunk
  wavBuf.write("data", 36);
  wavBuf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    wavBuf.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7FFF, headerSize + i * 2);
  }

  fs.writeFileSync(outputPath, wavBuf);

  // 输出 JSON 结果给父进程读取
  process.stdout.write(JSON.stringify({ ok: true, sampleRate, numSamples }));
} catch (err) {
  process.stdout.write(JSON.stringify({ ok: false, error: String(err) }));
  process.exit(1);
}
