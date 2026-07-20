const jwt = require('jsonwebtoken');
const pool = require('../config/db');
require('dotenv').config();
const { encrypt } = require('../utils/crypto');

function setupSocket(io) {
  // Middleware: runs before every connection, checks the JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('No token provided'));

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error('Invalid token'));
      socket.user = decoded; // { id, username }
      next();
    });
  });

  io.on('connection', (socket) => {
    console.log(`✅ ${socket.user.username} connected`);
    const userId = socket.user.id;

    // Register all event listeners IMMEDIATELY (synchronously)
    socket.on('message:send', async ({ conversationId, content, attachment }) => {
  try {
    const [membership] = await pool.query(
      'SELECT left_at, rejoined_at FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );
    const m = membership[0];
    const isActive = !membership.length ? false : (!m.left_at || (m.rejoined_at && m.rejoined_at > m.left_at));

    if (!isActive) {
      return socket.emit('error', { message: 'You have left this group and cannot send messages' });
    }

    // Check for blocking on direct conversations
    const [conv] = await pool.query('SELECT type FROM conversations WHERE id = ?', [conversationId]);
    if (conv[0]?.type === 'direct') {
      const [otherMember] = await pool.query(
        'SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?',
        [conversationId, userId]
      );
      if (otherMember.length > 0) {
        const otherId = otherMember[0].user_id;
        const [blockCheck] = await pool.query(
          `SELECT 1 FROM blocked_users WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`,
          [userId, otherId, otherId, userId]
        );
        if (blockCheck.length > 0) {
          return socket.emit('error', { message: 'Cannot send message — this user is blocked' });
        }
      }
    }

    const attachmentUrl = attachment?.url || null;
    const attachmentType = attachment?.type || null;
    const attachmentName = attachment?.name || null;
    const plainContent = content || '';

    const [result] = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content, attachment_url, attachment_type, attachment_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [conversationId, userId, encrypt(plainContent), attachmentUrl, attachmentType, attachmentName]
    );

    const message = {
      id: result.insertId,
      conversation_id: conversationId,
      sender_id: userId,
      sender_name: socket.user.username,
      content: plainContent,
      message_type: 'text',
      attachment_url: attachmentUrl,
      attachment_type: attachmentType,
      attachment_name: attachmentName,
      status: 'sent',
      created_at: new Date()
    };

    io.to(`conversation_${conversationId}`).emit('message:receive', message);
  } catch (err) {
    console.error(err);
    socket.emit('error', { message: 'Failed to send message' });
  }
});


    socket.on('typing:start', ({ conversationId }) => {
  socket.to(`conversation_${conversationId}`).emit('typing:update', {
    conversationId,
    userId,
    username: socket.user.username,
    typing: true
  });
});

socket.on('typing:stop', ({ conversationId }) => {
  socket.to(`conversation_${conversationId}`).emit('typing:update', {
    conversationId,
    userId,
    username: socket.user.username,
    typing: false
  });
});

socket.on('messages:read', async ({ conversationId }) => {
  try {
    // Mark all messages in this conversation NOT sent by me as read
    await pool.query(
      `UPDATE messages SET status = 'read'
       WHERE conversation_id = ? AND sender_id != ? AND status != 'read'`,
      [conversationId, userId]
    );

    // Tell everyone else in the room that messages were read (so sender's UI updates)
    socket.to(`conversation_${conversationId}`).emit('messages:read-update', {
      conversationId,
      readBy: userId
    });
  } catch (err) {
    console.error('Error marking messages as read:', err);
  }
});

socket.on('group:member-added', ({ conversationId, addedUserIds, systemMessages }) => {
  // Force each newly-added user's active socket(s) to join the room right now —
  // this is what removes the need for a manual refresh
  addedUserIds.forEach((uid) => {
    io.in(`user_${uid}`).socketsJoin(`conversation_${conversationId}`);
  });

  // Broadcast the system message(s) to EVERYONE now in the room, including the new member
  (systemMessages || []).forEach((sysMsg) => {
    io.to(`conversation_${conversationId}`).emit('message:receive', sysMsg);
  });

  // Tell the newly-added user(s) specifically to refresh their sidebar (new conversation appears)
  addedUserIds.forEach((uid) => {
    io.to(`user_${uid}`).emit('conversation:new', { conversationId });
  });

  // Tell existing members to refresh their member list view (if group info modal is open)
  socket.to(`conversation_${conversationId}`).emit('group:updated', { conversationId });
});

socket.on('group:member-left', ({ conversationId, systemMessage }) => {
  socket.leave(`conversation_${conversationId}`);
  // Broadcast the "X left the group" message to everyone still in the room
  socket.to(`conversation_${conversationId}`).emit('message:receive', systemMessage);
  socket.to(`conversation_${conversationId}`).emit('group:updated', { conversationId });
});

socket.on('message:delete-everyone', ({ conversationId, messageId }) => {
  io.to(`conversation_${conversationId}`).emit('message:deleted', { conversationId, messageId });
});

socket.on('message:edited', ({ conversationId, messageId, content }) => {
  io.to(`conversation_${conversationId}`).emit('message:edit-update', { conversationId, messageId, content });
});

socket.on('reaction:toggle', ({ conversationId, messageId, reactions }) => {
  io.to(`conversation_${conversationId}`).emit('reaction:update', { conversationId, messageId, reactions });
});

socket.on('user:blocked', ({ conversationId }) => {
  io.to(`conversation_${conversationId}`).emit('conversation:blocked-updated', { conversationId });
});

socket.on('user:unblocked', ({ conversationId }) => {
  io.to(`conversation_${conversationId}`).emit('conversation:blocked-updated', { conversationId });
});
    // ---- DISCONNECT: mark offline + notify relevant conversations ----
    socket.on('disconnect', async () => {
      console.log(`❌ ${socket.user.username} disconnected`);
      try {
        await pool.query(
          'UPDATE users SET is_online = FALSE, last_seen = NOW() WHERE id = ?',
          [userId]
        );

        const [conversations] = await pool.query(
          'SELECT conversation_id FROM conversation_members WHERE user_id = ?',
          [userId]
        );
        conversations.forEach((c) => {
          socket.to(`conversation_${c.conversation_id}`).emit('user:status', {
            userId,
            isOnline: false
          });
        });
      } catch (err) {
        console.error('Error during disconnect handling:', err);
      }
    });

    // ---- ASYNC SETUP: mark online, join rooms, notify relevant conversations ----
    (async () => {
  try {
    socket.join(`user_${userId}`);

    await pool.query('UPDATE users SET is_online = TRUE WHERE id = ?', [userId]);
    const [conversations] = await pool.query(
      'SELECT conversation_id FROM conversation_members WHERE user_id = ? AND left_at IS NULL',
      [userId]
    );
    conversations.forEach((c) => {
      socket.join(`conversation_${c.conversation_id}`);
      socket.to(`conversation_${c.conversation_id}`).emit('user:status', { userId, isOnline: true });
    });
  } catch (err) {
    console.error('Error during socket setup:', err);
  }
})();


  });
}

module.exports = setupSocket;