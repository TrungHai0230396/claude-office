#!/bin/sh
# Gỡ Văn phòng Claude chạy nền: tắt LaunchAgent, xoá tệp đăng ký và bản chép mã.
MA="com.vanphongclaude.maychu"
launchctl bootout "gui/$(id -u)/$MA" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$MA.plist"
rm -rf "$HOME/Library/Application Support/VanPhongClaude"
echo "Đã gỡ Văn phòng Claude chạy nền (nhật ký vẫn ở ~/Library/Logs/VanPhongClaude)."
