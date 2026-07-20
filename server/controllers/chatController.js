const pool = require('../config/db');
const { encrypt, decrypt } = require('../utils/crypto');

// CREATE a new conversation (direct or group)
async function createConversation(req, res) {
  try {
    const { type, name, memberIds } = req.body;
    const currentUserId = req.user.id;

    if (!type || !['direct', 'group'].includes(type)) {
      return res.status(400).json({ message: 'type must be "direct" or "group"' });
    }
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ message: 'memberIds must be a non-empty array' });
    }

    // For direct chats, check if a conversation between these 2 users already exists
    if (type === 'direct' && memberIds.length === 1) {
      const otherUserId = memberIds[0];
      const [existing] = await pool.query(
        `SELECT c.id FROM conversations c
         JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
         JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
         WHERE c.type = 'direct'
         LIMIT 1`,
        [currentUserId, otherUserId]
      );

      if (existing.length > 0) {
        return res.status(200).json({
          message: 'Conversation already exists',
          conversationId: existing[0].id
        });
      }
    }

    // Create the conversation
    const [result] = await pool.query(
      'INSERT INTO conversations (type, name) VALUES (?, ?)',
      [type, name || null]
    );
    const conversationId = result.insertId;

    const allMemberIds = [...new Set([currentUserId, ...memberIds])];
    const values = allMemberIds.map((id) => [conversationId, id]);
    await pool.query(
      'INSERT INTO conversation_members (conversation_id, user_id) VALUES ?',
      [values]
    );

    res.status(201).json({ message: 'Conversation created', conversationId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error creating conversation' });
  }
}

// GET all conversations for the logged-in user (with other member's info + online status)
async function getConversations(req, res) {
  try {
    const userId = req.user.id;

    const [conversations] = await pool.query(
      `SELECT c.id, c.type, c.name, c.created_at,
              CASE
                WHEN cm.left_at IS NULL THEN NULL
                WHEN cm.rejoined_at IS NOT NULL AND cm.rejoined_at > cm.left_at THEN NULL
                ELSE cm.left_at
              END AS my_left_at,
              (SELECT content FROM messages m WHERE m.conversation_id = c.id
                 AND (
                   cm.left_at IS NULL
                   OR m.created_at <= cm.left_at
                   OR (cm.rejoined_at IS NOT NULL AND cm.rejoined_at > cm.left_at AND m.created_at >= cm.rejoined_at)
                 )
                 ORDER BY m.created_at DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM messages m WHERE m.conversation_id = c.id
                 AND (
                   cm.left_at IS NULL
                   OR m.created_at <= cm.left_at
                   OR (cm.rejoined_at IS NOT NULL AND cm.rejoined_at > cm.left_at AND m.created_at >= cm.rejoined_at)
                 )
                 ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
              (SELECT u.id FROM conversation_members cm2
                 JOIN users u ON u.id = cm2.user_id
                 WHERE cm2.conversation_id = c.id AND cm2.user_id != ? LIMIT 1) AS other_user_id,
              (SELECT u.username FROM conversation_members cm2
                 JOIN users u ON u.id = cm2.user_id
                 WHERE cm2.conversation_id = c.id AND cm2.user_id != ? LIMIT 1) AS other_username,
              (SELECT u.is_online FROM conversation_members cm2
                 JOIN users u ON u.id = cm2.user_id
                 WHERE cm2.conversation_id = c.id AND cm2.user_id != ? LIMIT 1) AS other_is_online,
                 (SELECT u.avatar_url FROM conversation_members cm2
   JOIN users u ON u.id = cm2.user_id
   WHERE cm2.conversation_id = c.id AND cm2.user_id != ? LIMIT 1) AS other_avatar_url,
              (SELECT COUNT(*) FROM conversation_members cm3
                 WHERE cm3.conversation_id = c.id
                 AND (cm3.left_at IS NULL OR (cm3.rejoined_at IS NOT NULL AND cm3.rejoined_at > cm3.left_at))
              ) AS member_count,
              (SELECT COUNT(*) FROM messages m2
                 WHERE m2.conversation_id = c.id AND m2.sender_id != ? AND m2.status != 'read'
                 AND (
                   cm.left_at IS NULL
                   OR m2.created_at <= cm.left_at
                   OR (cm.rejoined_at IS NOT NULL AND cm.rejoined_at > cm.left_at AND m2.created_at >= cm.rejoined_at)
                 )
              ) AS unread_count,
              (SELECT COUNT(*) FROM blocked_users WHERE blocker_id = ? AND blocked_id = (
                 SELECT u.id FROM conversation_members cm2
                 JOIN users u ON u.id = cm2.user_id
                 WHERE cm2.conversation_id = c.id AND cm2.user_id != ? LIMIT 1
               )) > 0 AS i_blocked_them,
              (SELECT COUNT(*) FROM blocked_users WHERE blocker_id = (
                 SELECT u.id FROM conversation_members cm2
                 JOIN users u ON u.id = cm2.user_id
                 WHERE cm2.conversation_id = c.id AND cm2.user_id != ? LIMIT 1
               ) AND blocked_id = ?) > 0 AS they_blocked_me
       FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
       WHERE cm.hidden_at IS NULL
          OR EXISTS (
            SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.created_at > cm.hidden_at
          )
       ORDER BY last_message_at DESC`,
      [userId, userId, userId, userId, userId, userId, userId, userId, userId, userId],
    );

    const decrypted = conversations.map((c) => ({
      ...c,
      last_message: c.last_message ? decrypt(c.last_message) : c.last_message
    }));

    res.json(decrypted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching conversations' });
  }
}

// GET messages for a specific conversation (paginated)
async function getMessages(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    const [membership] = await pool.query(
      'SELECT left_at, rejoined_at FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [id, userId]
    );
    if (membership.length === 0) {
      return res.status(403).json({ message: 'You are not part of this conversation' });
    }

    const { left_at, rejoined_at } = membership[0];
    const rejoinedAfterLeaving = left_at && rejoined_at && rejoined_at > left_at;
    const isActive = !left_at || rejoinedAfterLeaving;

    let query = `SELECT m.id, m.sender_id, u.username AS sender_name, m.content, m.status,
                    m.message_type, m.is_deleted, m.is_edited, m.attachment_url, m.attachment_type, m.attachment_name, m.created_at
   FROM messages m
   JOIN users u ON u.id = m.sender_id
   WHERE m.conversation_id = ?
   AND m.id NOT IN (SELECT message_id FROM message_deletions WHERE user_id = ?)`;
    const params = [id, userId];

    if (!isActive) {
      query += ' AND m.created_at <= ?';
      params.push(left_at);
    } else if (rejoinedAfterLeaving) {
      query += ' AND (m.created_at <= ? OR m.created_at >= ?)';
      params.push(left_at, rejoined_at);
    }

    query += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

const [messages] = await pool.query(query, params);

// Fetch reactions for all these messages in a single query
const messageIds = messages.map((m) => m.id);
let reactionsByMessage = {};
if (messageIds.length > 0) {
  const [allReactions] = await pool.query(
    `SELECT mr.message_id, mr.emoji, u.username FROM message_reactions mr
     JOIN users u ON u.id = mr.user_id
     WHERE mr.message_id IN (?)`,
    [messageIds]
  );
  allReactions.forEach((r) => {
    if (!reactionsByMessage[r.message_id]) reactionsByMessage[r.message_id] = [];
    reactionsByMessage[r.message_id].push({ emoji: r.emoji, username: r.username });
  });
}

const cleaned = messages.map((m) => ({
  ...m,
  content: m.is_deleted ? "This message was deleted" : decrypt(m.content),
  reactions: reactionsByMessage[m.id] || []
}));

res.json(cleaned.reverse());
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching messages' });
  }
}


// GET all users except the logged-in one (for starting new conversations)
async function getAllUsers(req, res) {
  try {
    const userId = req.user.id;
    const [users] = await pool.query(
      'SELECT id, username, is_online, avatar_url FROM users WHERE id != ? ORDER BY username',
      [userId]
    );
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching users' });
  }
}


async function getConversationMembers(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [membership] = await pool.query(
      'SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [id, userId]
    );
    if (membership.length === 0) {
      return res.status(403).json({ message: 'You are not part of this conversation' });
    }

    const [members] = await pool.query(
      `SELECT u.id, u.username, u.is_online, u.avatar_url, cm.joined_at
   FROM conversation_members cm
   JOIN users u ON u.id = cm.user_id
   WHERE cm.conversation_id = ?
     AND (cm.left_at IS NULL OR (cm.rejoined_at IS NOT NULL AND cm.rejoined_at > cm.left_at))
   ORDER BY cm.joined_at ASC`,
      [id],
    );

    res.json(members);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching members' });
  }
}


// ADD members to a group
async function addGroupMembers(req, res) {
  try {
    const { id } = req.params;
    const { memberIds } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ message: 'memberIds must be a non-empty array' });
    }

    const [conv] = await pool.query('SELECT type FROM conversations WHERE id = ?', [id]);
    if (conv.length === 0) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    if (conv[0].type !== 'group') {
      return res.status(400).json({ message: 'Can only add members to group conversations' });
    }
    const [membership] = await pool.query(
      'SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [id, userId]
    );
    if (membership.length === 0) {
      return res.status(403).json({ message: 'You are not part of this conversation' });
    }

    const [[me]] = await pool.query('SELECT username FROM users WHERE id = ?', [userId]);
    const [addedUsers] = await pool.query(
      `SELECT id, username FROM users WHERE id IN (?)`,
      [memberIds]
    );

    const values = memberIds.map((mid) => [id, mid]);
    await pool.query(
      `INSERT INTO conversation_members (conversation_id, user_id) VALUES ?
       ON DUPLICATE KEY UPDATE rejoined_at = NOW()`,
      [values]
    );

    // Create a system message for each person added, so it's visible in the chat
    const systemMessages = [];
    for (const u of addedUsers) {
  const content = `${me.username} added ${u.username} to the group`;
  const [result] = await pool.query(
    `INSERT INTO messages (conversation_id, sender_id, content, message_type) VALUES (?, ?, ?, 'system')`,
    [id, userId, encrypt(content)]
  );
  systemMessages.push({
    id: result.insertId,
    conversation_id: parseInt(id),
    sender_id: userId,
    sender_name: me.username,
    content, // plaintext for immediate broadcast
    message_type: 'system',
    created_at: new Date()
  });
}

    res.json({ message: 'Members added', systemMessages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error adding members' });
  }
}

// LEAVE a group
async function leaveGroup(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [conv] = await pool.query('SELECT type FROM conversations WHERE id = ?', [id]);
    if (conv.length === 0) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    if (conv[0].type !== 'group') {
      return res.status(400).json({ message: 'Can only leave group conversations' });
    }

    const [[me]] = await pool.query(
      'SELECT username FROM users WHERE id = ?',
      [userId]
    );

    // Mark as left instead of deleting — preserves message history access
    await pool.query(
      'UPDATE conversation_members SET left_at = NOW() WHERE conversation_id = ? AND user_id = ?',
      [id, userId]
    );

    // Insert a system message so everyone sees "X left the group" in the chat itself
    const [result] = await pool.query(
  `INSERT INTO messages (conversation_id, sender_id, content, message_type)
   VALUES (?, ?, ?, 'system')`,
  [id, userId, encrypt(`${me.username} left the group`)]
);

    res.json({
      message: 'Left group successfully',
      systemMessage: {
        id: result.insertId,
        conversation_id: parseInt(id),
        sender_id: userId,
        sender_name: me.username,
        content: `${me.username} left the group`,
        message_type: 'system',
        created_at: new Date()
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error leaving group' });
  }
}



// DELETE a message — "for me" (hide only for the requester) or "for everyone" (only if you're the sender)
async function deleteMessage(req, res) {
  try {
    const { id } = req.params; // message id
    const { mode } = req.body; // 'me' | 'everyone'
    const userId = req.user.id;

    const [msgs] = await pool.query('SELECT * FROM messages WHERE id = ?', [id]);
    if (msgs.length === 0) {
      return res.status(404).json({ message: 'Message not found' });
    }
    const msg = msgs[0];

    // Confirm requester is actually part of this conversation
    const [membership] = await pool.query(
      'SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [msg.conversation_id, userId]
    );
    if (membership.length === 0) {
      return res.status(403).json({ message: 'You are not part of this conversation' });
    }

    if (mode === 'everyone') {
      if (msg.sender_id !== userId) {
        return res.status(403).json({ message: 'You can only delete your own messages for everyone' });
      }
      await pool.query('UPDATE messages SET is_deleted = TRUE WHERE id = ?', [id]);
      return res.json({ message: 'Deleted for everyone', mode: 'everyone', messageId: parseInt(id), conversationId: msg.conversation_id });
    }

    if (mode === 'me') {
      await pool.query(
        'INSERT IGNORE INTO message_deletions (message_id, user_id) VALUES (?, ?)',
        [id, userId]
      );
      return res.json({ message: 'Deleted for you', mode: 'me', messageId: parseInt(id) });
    }

    return res.status(400).json({ message: 'mode must be "me" or "everyone"' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error deleting message' });
  }
}

async function searchMessages(req, res) {
  try {
    const { id } = req.params;
    const { q } = req.query;
    const userId = req.user.id;

    if (!q || !q.trim()) {
      return res.status(400).json({ message: 'Search query (q) is required' });
    }

    const [membership] = await pool.query(
      'SELECT left_at, rejoined_at FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [id, userId]
    );
    if (membership.length === 0) {
      return res.status(403).json({ message: 'You are not part of this conversation' });
    }

    const { left_at, rejoined_at } = membership[0];
    const rejoinedAfterLeaving = left_at && rejoined_at && rejoined_at > left_at;
    const isActive = !left_at || rejoinedAfterLeaving;

    // Fetch candidate messages WITHOUT filtering by content in SQL (can't — it's encrypted).
    // We decrypt and filter in application code instead.
    let query = `SELECT m.id, m.sender_id, u.username AS sender_name, m.content, m.created_at
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ?
         AND m.message_type = 'text'
         AND m.is_deleted = FALSE
         AND m.id NOT IN (SELECT message_id FROM message_deletions WHERE user_id = ?)`;
    const params = [id, userId];

    if (!isActive) {
      query += ' AND m.created_at <= ?';
      params.push(left_at);
    } else if (rejoinedAfterLeaving) {
      query += ' AND (m.created_at <= ? OR m.created_at >= ?)';
      params.push(left_at, rejoined_at);
    }

    query += ' ORDER BY m.created_at DESC';

    const [rows] = await pool.query(query, params);

    const lowerQ = q.trim().toLowerCase();
    const results = rows
      .map((m) => ({ ...m, content: decrypt(m.content) }))
      .filter((m) => m.content.toLowerCase().includes(lowerQ))
      .slice(0, 50);

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error searching messages' });
  }
}

async function searchAllMessages(req, res) {
  try {
    const { q } = req.query;
    const userId = req.user.id;

    if (!q || !q.trim()) {
      return res.status(400).json({ message: 'Search query (q) is required' });
    }

    const [rows] = await pool.query(
      `SELECT m.id, m.conversation_id, m.sender_id, u.username AS sender_name,
              m.content, m.created_at,
              c.type AS conversation_type, c.name AS conversation_name,
              (SELECT u2.username FROM conversation_members cm2
                 JOIN users u2 ON u2.id = cm2.user_id
                 WHERE cm2.conversation_id = c.id AND cm2.user_id != ? LIMIT 1) AS other_username
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       JOIN conversations c ON c.id = m.conversation_id
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
       WHERE m.message_type = 'text'
         AND m.is_deleted = FALSE
         AND m.id NOT IN (SELECT message_id FROM message_deletions WHERE user_id = ?)
         AND (
           cm.left_at IS NULL
           OR m.created_at <= cm.left_at
           OR (cm.rejoined_at IS NOT NULL AND cm.rejoined_at > cm.left_at AND m.created_at >= cm.rejoined_at)
         )
       ORDER BY m.created_at DESC`,
      [userId, userId, userId]
    );

    const lowerQ = q.trim().toLowerCase();
    const results = rows
      .map((m) => ({ ...m, content: decrypt(m.content) }))
      .filter((m) => m.content.toLowerCase().includes(lowerQ))
      .slice(0, 50);

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error searching messages' });
  }
}



async function getMessageContext(req, res) {
  try {
    const { id, messageId } = req.params;
    const userId = req.user.id;

    const [membership] = await pool.query(
      'SELECT left_at, rejoined_at FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [id, userId]
    );
    if (membership.length === 0) {
      return res.status(403).json({ message: 'You are not part of this conversation' });
    }

    const [target] = await pool.query(
      'SELECT created_at FROM messages WHERE id = ? AND conversation_id = ?',
      [messageId, id]
    );
    if (target.length === 0) {
      return res.status(404).json({ message: 'Message not found' });
    }
    const targetTime = target[0].created_at;

    const { left_at, rejoined_at } = membership[0];
    const rejoinedAfterLeaving = left_at && rejoined_at && rejoined_at > left_at;
    const isActive = !left_at || rejoinedAfterLeaving;

    const buildVisibilityClause = (alias) => {
      if (!isActive) return `AND ${alias}.created_at <= ?`;
      if (rejoinedAfterLeaving) return `AND (${alias}.created_at <= ? OR ${alias}.created_at >= ?)`;
      return '';
    };
    const visParams = !isActive ? [left_at] : rejoinedAfterLeaving ? [left_at, rejoined_at] : [];

    const [before] = await pool.query(
      `SELECT m.id, m.sender_id, u.username AS sender_name, m.content, m.status,
              m.message_type, m.is_deleted, m.is_edited, m.attachment_url, m.attachment_type, m.attachment_name, m.created_at
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ? AND m.created_at <= ?
         AND m.id NOT IN (SELECT message_id FROM message_deletions WHERE user_id = ?)
         ${buildVisibilityClause('m')}
       ORDER BY m.created_at DESC LIMIT 20`,
      [id, targetTime, userId, ...visParams]
    );

    const [after] = await pool.query(
      `SELECT m.id, m.sender_id, u.username AS sender_name, m.content, m.status,
              m.message_type, m.is_deleted, m.is_edited, m.attachment_url, m.attachment_type, m.attachment_name, m.created_at
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ? AND m.created_at > ?
         AND m.id NOT IN (SELECT message_id FROM message_deletions WHERE user_id = ?)
         ${buildVisibilityClause('m')}
       ORDER BY m.created_at ASC LIMIT 20`,
      [id, targetTime, userId, ...visParams]
    );

    const combined = [...before.reverse(), ...after].map((m) => ({
      ...m,
      content: m.is_deleted ? "This message was deleted" : decrypt(m.content),
    }));

    // Fetch reactions for all these messages in one query
    const messageIds = combined.map((m) => m.id);
    let reactionsByMessage = {};
    if (messageIds.length > 0) {
      const [allReactions] = await pool.query(
        `SELECT mr.message_id, mr.emoji, u.username FROM message_reactions mr
         JOIN users u ON u.id = mr.user_id
         WHERE mr.message_id IN (?)`,
        [messageIds]
      );
      allReactions.forEach((r) => {
        if (!reactionsByMessage[r.message_id]) reactionsByMessage[r.message_id] = [];
        reactionsByMessage[r.message_id].push({ emoji: r.emoji, username: r.username });
      });
    }

    const withReactions = combined.map((m) => ({ ...m, reactions: reactionsByMessage[m.id] || [] }));

    res.json({ messages: withReactions, targetMessageId: parseInt(messageId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching message context' });
  }
}

async function editMessage(req, res) {
  try {
    const { id } = req.params; // message id
    const { content } = req.body;
    const userId = req.user.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Content is required' });
    }

    const [msgs] = await pool.query('SELECT * FROM messages WHERE id = ?', [id]);
    if (msgs.length === 0) {
      return res.status(404).json({ message: 'Message not found' });
    }
    const msg = msgs[0];

    if (msg.sender_id !== userId) {
      return res.status(403).json({ message: 'You can only edit your own messages' });
    }
    if (msg.is_deleted) {
      return res.status(400).json({ message: 'Cannot edit a deleted message' });
    }
    if (msg.message_type !== 'text') {
      return res.status(400).json({ message: 'Cannot edit this message type' });
    }

    const trimmed = content.trim();
    await pool.query(
      'UPDATE messages SET content = ?, is_edited = TRUE WHERE id = ?',
      [encrypt(trimmed), id]
    );

    res.json({
      message: 'Message edited',
      messageId: parseInt(id),
      conversationId: msg.conversation_id,
      content: trimmed
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error editing message' });
  }
}



async function toggleReaction(req, res) {
  try {
    const { id } = req.params; // message id
    const { emoji } = req.body;
    const userId = req.user.id;

    if (!emoji) {
      return res.status(400).json({ message: 'emoji is required' });
    }

    const [msgs] = await pool.query('SELECT conversation_id FROM messages WHERE id = ?', [id]);
    if (msgs.length === 0) {
      return res.status(404).json({ message: 'Message not found' });
    }
    const conversationId = msgs[0].conversation_id;

    const [membership] = await pool.query(
      'SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );
    if (membership.length === 0) {
      return res.status(403).json({ message: 'You are not part of this conversation' });
    }

    // Check if this user already reacted to this message
    const [existing] = await pool.query(
      'SELECT emoji FROM message_reactions WHERE message_id = ? AND user_id = ?',
      [id, userId]
    );

    let action;
    if (existing.length > 0 && existing[0].emoji === emoji) {
      // Same emoji tapped again — remove it
      await pool.query('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?', [id, userId]);
      action = 'removed';
    } else {
      // New reaction, or switching to a different emoji
      await pool.query(
        `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE emoji = ?`,
        [id, userId, emoji, emoji]
      );
      action = 'set';
    }

    // Return the full up-to-date reaction summary for this message
    const [reactions] = await pool.query(
      `SELECT mr.emoji, u.username FROM message_reactions mr
       JOIN users u ON u.id = mr.user_id
       WHERE mr.message_id = ?`,
      [id]
    );

    res.json({ messageId: parseInt(id), conversationId, action, reactions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error toggling reaction' });
  }
}

async function hideConversation(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [membership] = await pool.query(
      'SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [id, userId]
    );
    if (membership.length === 0) {
      return res.status(403).json({ message: 'You are not part of this conversation' });
    }

    await pool.query(
      'UPDATE conversation_members SET hidden_at = NOW() WHERE conversation_id = ? AND user_id = ?',
      [id, userId]
    );

    res.json({ message: 'Conversation removed from your list' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error hiding conversation' });
  }
}


async function blockUser(req, res) {
  try {
    const { id } = req.params; // user id to block
    const userId = req.user.id;

    if (parseInt(id) === userId) {
      return res.status(400).json({ message: 'You cannot block yourself' });
    }

    await pool.query(
      'INSERT IGNORE INTO blocked_users (blocker_id, blocked_id) VALUES (?, ?)',
      [userId, id]
    );

    res.json({ message: 'User blocked', blockedId: parseInt(id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error blocking user' });
  }
}

async function unblockUser(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await pool.query(
      'DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?',
      [userId, id]
    );

    res.json({ message: 'User unblocked', unblockedId: parseInt(id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error unblocking user' });
  }
}

async function getBlockedUsers(req, res) {
  try {
    const userId = req.user.id;
    const [blocked] = await pool.query(
      `SELECT u.id, u.username FROM blocked_users b
       JOIN users u ON u.id = b.blocked_id
       WHERE b.blocker_id = ?`,
      [userId]
    );
    res.json(blocked);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching blocked users' });
  }
}

module.exports = {
  createConversation,
  getConversations,
  getMessages,
  getAllUsers,
  getConversationMembers,
  addGroupMembers,
  leaveGroup,
  deleteMessage,
  searchMessages,
  searchAllMessages,
  getMessageContext,
  editMessage,
  toggleReaction,
  hideConversation,
  blockUser,
  unblockUser,
  getBlockedUsers
};



