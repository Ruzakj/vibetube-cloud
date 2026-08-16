#!/data/data/com.termux/files/usr/bin/bash
cd "$(dirname "$0")"
python -m http.server 8080 --bind 127.0.0.1
