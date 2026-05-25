# 🗺️ SocialMap

A real-time social platform where users create a profile, appear on a live world map, and can video call each other.

## Features
- 👤 Profile creation with name, bio, and photo
- 🗺️ Live world map showing all online users by real GPS location
- 📍 Real-time location updates as people move
- 📹 Peer-to-peer WebRTC video calling
- 🔔 Live join/leave notifications
- 👥 Online users sidebar

## Tech Stack
- **Backend**: Node.js + Express + Socket.io
- **Frontend**: Vanilla JS + Leaflet.js map
- **Video**: WebRTC (peer-to-peer, no media server needed)
- **Realtime**: Socket.io for signaling and presence

---

## 🚀 Deploy on Railway

### Step 1: Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/socialmap.git
git push -u origin main
```

### Step 2: Deploy on Railway
1. Go to [railway.app](https://railway.app) and sign in
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `socialmap` repository
4. Railway auto-detects Node.js and deploys!
5. Click **Generate Domain** to get a public URL

### Step 3: Done! 🎉
Your site will be live at `https://your-app.up.railway.app`

---

## Local Development
```bash
npm install
npm start
# Open http://localhost:3000
```

## Notes
- Video calls use free Google STUN servers — works for most networks
- User data is in-memory only (resets on redeploy). For persistence, add MongoDB/PostgreSQL
- Uploaded avatars are stored on Railway's ephemeral filesystem — consider Cloudinary for production
