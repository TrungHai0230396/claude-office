#!/bin/sh
# Gỡ Claude Office chạy nền: tắt LaunchAgent, xoá tệp đăng ký và bản chép mã (cả bản cài tên cũ nếu còn).
for MA in com.claudeoffice.server com.vanphongclaude.maychu; do
  launchctl bootout "gui/$(id -u)/$MA" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/$MA.plist"
done
rm -rf "$HOME/Library/Application Support/ClaudeOffice" "$HOME/Library/Application Support/VanPhongClaude"
echo "Đã gỡ Claude Office chạy nền (nhật ký vẫn ở ~/Library/Logs/ClaudeOffice)."
