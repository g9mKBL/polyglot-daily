# Hướng dẫn Deploy 24/7 — Polyglot Daily

Dự án sử dụng **Node.js 24+** (`node:sqlite` tích hợp sẵn) và lưu dữ liệu học tập vào tệp SQLite (`app.db`). Vì vậy, khi đưa lên cloud 24/7 cần dùng nền tảng hỗ trợ **Docker** (hoặc Node 24) kèm **Volume / Persistent Disk** để không bị mất dữ liệu khi server khởi động lại.

> **Lưu ý:** Không deploy lên các host serverless thuần (như Vercel, Netlify, Cloudflare Workers) vì chúng không giữ được tệp SQLite bền vững.

---

## Bước 1: Đưa mã nguồn lên GitHub

Mở PowerShell tại `d:\Download\test dự án` và chạy:

```powershell
git init
git add .
git commit -m "Initial commit: Polyglot Daily"
git branch -M main
git remote add origin https://github.com/<ten-tai-khoan>/<ten-repo>.git
git push -u origin main
```

---

## Bước 2: Chọn 1 trong 3 cách deploy 24/7

### Cách A: Railway (Khuyên dùng — hỗ trợ Volume dễ nhất)
1. Truy cập https://railway.app và đăng nhập bằng GitHub.
2. Chọn **New Project** -> **Deploy from GitHub repo** -> chọn repo vừa tạo. Railway sẽ tự nhận `Dockerfile` (chạy Node 24).
3. Vào tab **Variables** của service, kiểm tra/thêm:
   - `NODE_ENV=production`
   - `HOST=0.0.0.0`
   - `DB_PATH=/app/data/app.db`
   - `AUTO_SEED=true`
4. Vào tab **Volumes** -> **Add Volume** -> đặt **Mount Path** là `/app/data` (giúp giữ toàn bộ tài khoản, tiến độ, nhóm học bền vững).
5. Vào tab **Settings** -> **Networking** -> **Generate Domain** để lấy link `https://...up.railway.app` gửi cho bạn bè cùng học.

### Cách B: Render (Dùng sẵn `render.yaml`)
1. Truy cập https://dashboard.render.com -> **New +** -> **Blueprint**.
2. Kết nối repo GitHub của bạn; Render sẽ đọc tệp `render.yaml` (dùng `Dockerfile`, healthcheck `/api/health`, gắn Persistent Disk tại `/var/data`).
3. Lưu ý gói cước trên Render:
   - **Starter (trả phí):** Có Persistent Disk `/var/data`, dữ liệu SQLite bền vững 100%.
   - **Free (miễn phí):** Nếu chỉ muốn test miễn phí trước, xóa phần `disk:` và đổi `plan: free` trong `render.yaml` (nhược điểm: web sẽ ngủ sau 15 phút không truy cập và DB reset về dữ liệu demo mỗi lần redeploy/restart).

### Cách C: Tự chạy bằng Docker trên VPS (Ubuntu/Debian)
```bash
docker build -t polyglot-daily .
docker run -d \
  --name polyglot-daily \
  --restart unless-stopped \
  -p 3000:3000 \
  -v polyglot_data:/app/data \
  polyglot-daily
```
Sau đó trỏ domain/Nginx (hoặc Cloudflare Tunnel) vào cổng `3000`.
