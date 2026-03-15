#!/bin/bash
# 下载 sherpa-onnx 语音模型到 resources/models/speech/
# 包含：流式 Paraformer ASR（中英双语）、Silero VAD、VITS TTS（中文）
#
# 用法：bash scripts/download-speech-models.sh

set -euo pipefail

MODELS_DIR="$(cd "$(dirname "$0")/.." && pwd)/resources/models/speech"
mkdir -p "$MODELS_DIR"
cd "$MODELS_DIR"

echo "=== 下载语音模型到 $MODELS_DIR ==="

# ── 1. Silero VAD ──
if [ ! -f "silero_vad.onnx" ]; then
  echo "[1/3] 下载 Silero VAD 模型..."
  curl -L -o silero_vad.onnx \
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx"
  echo "  ✓ Silero VAD 下载完成"
else
  echo "[1/3] Silero VAD 已存在，跳过"
fi

# ── 2. Streaming Paraformer（中英双语 ASR）──
ASR_DIR="sherpa-onnx-streaming-paraformer-bilingual-zh-en"
if [ ! -d "$ASR_DIR" ]; then
  echo "[2/3] 下载 Streaming Paraformer 模型..."
  ARCHIVE="$ASR_DIR.tar.bz2"
  curl -L -o "$ARCHIVE" \
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/$ARCHIVE"
  tar xjf "$ARCHIVE"
  rm -f "$ARCHIVE"
  echo "  ✓ Streaming Paraformer 下载完成"
else
  echo "[2/3] Streaming Paraformer 已存在，跳过"
fi

# ── 3. VITS TTS（中文，theresa 单说话人）──
TTS_DIR="vits-zh-hf-theresa"
if [ ! -d "$TTS_DIR" ]; then
  echo "[3/3] 下载 VITS TTS 模型..."
  ARCHIVE="$TTS_DIR.tar.bz2"
  curl -L -o "$ARCHIVE" \
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/$ARCHIVE"
  tar xjf "$ARCHIVE"
  rm -f "$ARCHIVE"
  echo "  ✓ VITS TTS 下载完成"
else
  echo "[3/3] VITS TTS 已存在，跳过"
fi

echo ""
echo "=== 所有模型下载完成 ==="
echo "目录结构："
ls -la "$MODELS_DIR"
echo ""
echo "ASR 模型文件："
ls -la "$MODELS_DIR/$ASR_DIR/" 2>/dev/null || echo "  (未下载)"
