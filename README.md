# C3 Data Customer Survey

A publicly accessible ranking survey for C3 Data ERP compliance feedback.

## Features
- Drag-and-drop ranking with accessible up/down buttons and keyboard support
- Optional comments per question
- Shared persistent storage (JSON file, easy to swap for a database)
- Public results with scoring (1st=5pts ... 5th=1pt), averages, first-place counts
- Owner-only admin for viewing comments and CSV export (Bearer token auth)
- Duplicate prevention via client token
- Server-side validation
- Responsive navy/blue design
- Uses official C3 Data logo

## Local Run
```bash
node server.js
# Visit http://localhost:3000
```

Set `ADMIN_PASSWORD` env var for admin access (default: change-me-in-production).
Admin page: /admin.html

## Deployment Instructions (Render.com free tier recommended)

1. Create a free account at https://render.com
2. Create a new **Web Service**
3. Connect a GitHub repo (push this folder to a repo) or use manual deploy
4. Build Command: (leave empty, pure Node)
5. Start Command: `node server.js`
6. Environment Variables:
   - `ADMIN_PASSWORD` = (choose a strong password you will use)
   - `PORT` is set automatically by Render
7. For persistent data: Add a **Disk** mounted at `/data` and set env `DATA_FILE=/data/submissions.json`
   - Free tier disks are available; data persists across deploys
8. Deploy. Render provides a public URL like `https://your-service.onrender.com`

Alternative free hosts: Railway.app, Fly.io, or any Node host.

### Notes
- No user accounts required
- Comments and full export are private (require correct Bearer ADMIN_PASSWORD)
- Results page is public and auto-refreshes
- Logo is the official C3 Data logo downloaded from their site

After deploy, test:
- Submit from one browser, see in results on another
- Comments saved
- Invalid ranks rejected
- Retry same token rejected
- Admin protected
