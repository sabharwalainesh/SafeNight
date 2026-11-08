#!/bin/bash
# Burn captions into the recording and produce the final MP4.
# Usage: FFMPEG=/path/to/ffmpeg ./render.sh <input.webm> <captions.srt> <output.mp4>
set -euo pipefail
IN="$1"; SRT="$2"; OUT="$3"
FFMPEG="${FFMPEG:-ffmpeg}"
# libass measures FontSize/MarginV against PlayResY=288 for SRT input, so 10 ≈ 37 px at 1080p.
STYLE="FontName=Helvetica Neue,FontSize=10,Bold=1,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,OutlineColour=&H99000000,BorderStyle=4,Outline=3,Shadow=0,MarginV=9,MarginL=40,MarginR=40,Alignment=2"
"$FFMPEG" -hide_banner -loglevel error -y -i "$IN" \
  -vf "fps=30,format=yuv420p,subtitles=filename='$SRT':force_style='$STYLE'" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -movflags +faststart -an "$OUT"
