import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

// Xác định môi trường phát triển
const dev = process.env.NODE_ENV !== 'production';

// Khởi tạo ứng dụng Next.js
const app = next({ dev });
const handle = app.getRequestHandler();

// Cổng mặc định cho server
const port = process.env.PORT || 3000;

// Chuẩn bị và chạy server Next.js
app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  }).listen(port, () => {
    console.log(`> Server đang chạy trên http://localhost:${port}`);
    console.log('> Bấm Ctrl+C để dừng');
  });
}).catch(err => {
  console.error('Lỗi khi khởi động server:', err);
});