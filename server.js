const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer for avatar uploads
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory users store: socketId -> userObj
const onlineUsers = new Map();

// Avatar upload endpoint
app.post('/upload-avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// Socket.io
io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // User joins with profile + location
  socket.on('user:join', (profile) => {
    const user = {
      id: socket.id,
      name: profile.name || 'Anonymous',
      bio: profile.bio || '',
      avatar: profile.avatar || null,
      lat: profile.lat,
      lng: profile.lng,
      joinedAt: Date.now()
    };
    onlineUsers.set(socket.id, user);

    // Send current users to new user
    socket.emit('users:list', Array.from(onlineUsers.values()));

    // Notify others
    socket.broadcast.emit('user:joined', user);
  });

  // Location update
  socket.on('user:location', ({ lat, lng }) => {
    const user = onlineUsers.get(socket.id);
    if (user) {
      user.lat = lat;
      user.lng = lng;
      io.emit('user:moved', { id: socket.id, lat, lng });
    }
  });

  // WebRTC signaling
  socket.on('call:request', ({ to }) => {
    const from = onlineUsers.get(socket.id);
    io.to(to).emit('call:incoming', { from: socket.id, caller: from });
  });

  socket.on('call:accept', ({ to }) => {
    io.to(to).emit('call:accepted', { from: socket.id });
  });

  socket.on('call:reject', ({ to }) => {
    io.to(to).emit('call:rejected', { from: socket.id });
  });

  socket.on('call:end', ({ to }) => {
    io.to(to).emit('call:ended', { from: socket.id });
  });

  // ── CHAT ──
  // Global chat message
  socket.on('chat:global', ({ text }) => {
    const user = onlineUsers.get(socket.id);
    if (!user || !text?.trim()) return;
    const msg = {
      id: uuidv4(),
      from: socket.id,
      name: user.name,
      avatar: user.avatar,
      text: text.trim().slice(0, 500),
      ts: Date.now()
    };
    io.emit('chat:global', msg);
  });

  // Private DM
  socket.on('chat:dm', ({ to, text }) => {
    const user = onlineUsers.get(socket.id);
    if (!user || !text?.trim()) return;
    const msg = {
      id: uuidv4(),
      from: socket.id,
      name: user.name,
      avatar: user.avatar,
      text: text.trim().slice(0, 500),
      ts: Date.now()
    };
    // Send to recipient and back to sender
    io.to(to).emit('chat:dm', msg);
    socket.emit('chat:dm', msg);
  });

  // Typing indicators
  socket.on('chat:typing', ({ to, isTyping }) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;
    if (to) {
      // DM typing — separate event so client can distinguish
      io.to(to).emit('chat:typing:dm', { from: socket.id, name: user.name, isTyping });
    } else {
      // Global typing
      socket.broadcast.emit('chat:typing', { from: socket.id, name: user.name, isTyping });
    }
  });

  socket.on('webrtc:offer', ({ to, offer }) => {
    io.to(to).emit('webrtc:offer', { from: socket.id, offer });
  });

  socket.on('webrtc:answer', ({ to, answer }) => {
    io.to(to).emit('webrtc:answer', { from: socket.id, answer });
  });

  socket.on('webrtc:ice', ({ to, candidate }) => {
    io.to(to).emit('webrtc:ice', { from: socket.id, candidate });
  });

  // Disconnect
  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('user:left', socket.id);
    console.log('Disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`SocialMap running on port ${PORT}`));
