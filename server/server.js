const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const setupSocket = require('./sockets/socketHandler');
const path = require('path');
const uploadRoutes = require('./routes/uploadRoutes');

const app = express();
const httpServer = http.createServer(app);


app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}));

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/auth', authRoutes);
app.use('/api', chatRoutes);
app.use('/api', uploadRoutes);

setupSocket(io); // all our socket logic lives in this file

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});