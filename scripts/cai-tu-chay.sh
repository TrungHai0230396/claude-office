#!/bin/sh
# Cài (hay cập nhật) Văn phòng Claude chạy nền mỗi khi đăng nhập máy: chép mã sang
# ~/Library/Application Support/VanPhongClaude (macOS chặn tiến trình nền đọc ~/Documents),
# đăng ký một LaunchAgent tự bật lại nếu bị tắt, rồi khởi động lại nó. Chạy lại lệnh này sau mỗi lần sửa mã.
set -e
NGUON="$(cd "$(dirname "$0")/.." && pwd)"
NHA_APP="$HOME/Library/Application Support/VanPhongClaude"
MA="com.vanphongclaude.maychu"
PLIST="$HOME/Library/LaunchAgents/$MA.plist"
NHAT_KY="$HOME/Library/Logs/VanPhongClaude"
CONG="${PORT:-5230}"

# Node: ưu tiên bản mới nhất cài qua nvm, không có thì lấy node trong PATH (cần >= 16).
# (Không dùng biến NODE: npm tự đặt NODE = node đang chạy npm.) Chọn bản khác: VPC_NODE=/đường/node
moi_nhat() {
  for d in "$HOME"/.nvm/versions/node/v*/bin/node; do
    [ -x "$d" ] || continue
    v="${d#*/node/v}"
    echo "${v%%/*} $d"
  done | sort -t . -k1,1n -k2,2n -k3,3n | tail -1 | cut -d' ' -f2-
}
NODE_CHAY="${VPC_NODE:-$(moi_nhat)}"
[ -x "$NODE_CHAY" ] || NODE_CHAY="$(command -v node || true)"
[ -x "$NODE_CHAY" ] || { echo "Không tìm thấy node." >&2; exit 1; }

mkdir -p "$NHA_APP/app" "$NHAT_KY" "$HOME/Library/LaunchAgents"
rsync -a --delete --exclude .git --exclude .claude --exclude node_modules --exclude test --exclude scripts "$NGUON/" "$NHA_APP/app/"

cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$MA</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_CHAY</string>
    <string>server.js</string>
  </array>
  <key>WorkingDirectory</key><string>$NHA_APP/app</string>
  <key>EnvironmentVariables</key>
  <dict><key>PORT</key><string>$CONG</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$NHAT_KY/maychu.log</string>
  <key>StandardErrorPath</key><string>$NHAT_KY/maychu.log</string>
</dict>
</plist>
PL

# Nạp lại (lần đầu thì nạp mới) cho chắc chạy bản vừa chép. Gỡ bản cũ xong hẳn rồi mới nạp,
# nạp ngay khi launchd còn đang gỡ sẽ báo "Bootstrap failed: 5".
DV="gui/$(id -u)/$MA"
if launchctl print "$DV" >/dev/null 2>&1; then
  launchctl bootout "$DV" 2>/dev/null || true
  i=0
  while launchctl print "$DV" >/dev/null 2>&1 && [ $i -lt 50 ]; do
    sleep 0.2
    i=$((i + 1))
  done
fi
launchctl bootstrap "gui/$(id -u)" "$PLIST"

i=0
until curl -s -o /dev/null "http://127.0.0.1:$CONG/api/trang-thai"; do
  i=$((i + 1))
  if [ $i -gt 20 ]; then
    echo "Máy chủ chưa lên, xem $NHAT_KY/maychu.log" >&2
    exit 1
  fi
  sleep 0.5
done
echo "Văn phòng Claude đang chạy nền: http://127.0.0.1:$CONG (node: $NODE_CHAY)"
