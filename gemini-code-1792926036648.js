const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// 1. الاتصال بقاعدة البيانات (استبدل الرابط برابط قاعدة بياناتك في MongoDB Atlas)
const MONGO_URI = process.env.MONGO_URI || "your_mongodb_connection_string_here";
mongoose.connect(MONGO_URI)
  .then(() => console.log("Database connected successfully"))
  .catch(err => console.error("Database connection error:", err));

// 2. الهياكل والأنماط (Schemas)
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  points: { type: Number, default: 0 },
  achievements: [String]
});

const MessageSchema = new mongoose.Schema({
  username: String,
  text: String,
  room: { type: String, default: "general" },
  timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Message = mongoose.model('Message', MessageSchema);

// 3. مسارات التسجيل والدخول (Auth APIs)
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.json({ success: true, message: "تم إنشاء الحساب بنجاح" });
  } catch (err) {
    res.status(400).json({ success: false, message: "اسم المستخدم مستخدم بالفعل" });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (user && await bcrypt.compare(password, user.password)) {
    res.json({
      success: true,
      user: {
        username: user.username,
        points: user.points,
        achievements: user.achievements
      }
    });
  } else {
    res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });
  }
});

// 4. الاتصال الفوري عبر Socket.io
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // إرسال الرسائل القديمة فور الاتصال
  socket.on('join_room', async (room) => {
    socket.join(room);
    const previousMessages = await Message.find({ room }).sort({ timestamp: 1 }).limit(50);
    socket.emit('load_messages', previousMessages);
  });

  // استقبال وإرسال الرسائل الحية وحفظها
  socket.on('send_message', async (data) => {
    const newMessage = new Message({
      username: data.username,
      text: data.text,
      room: data.room
    });
    await newMessage.save();
    io.to(data.room).emit('receive_message', newMessage);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));