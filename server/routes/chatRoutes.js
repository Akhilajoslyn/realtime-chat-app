const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const {
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
} = require('../controllers/chatController');

/**
 * @swagger
 * /api/conversations:
 *   post:
 *     summary: Create a new conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [direct, group]
 *               name:
 *                 type: string
 *               memberIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       201:
 *         description: Conversation created
 */
router.post('/conversations', verifyToken, createConversation);

/**
 * @swagger
 * /api/conversations:
 *   get:
 *     summary: Get all conversations for the logged-in user
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of conversations
 */
router.get('/conversations', verifyToken, getConversations);

/**
 * @swagger
 * /api/conversations/{id}/messages:
 *   get:
 *     summary: Get messages for a conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of messages
 *       403:
 *         description: Not part of this conversation
 */
router.get('/conversations/:id/messages', verifyToken, getMessages);


/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users (except yourself) to start a new conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/users', verifyToken, getAllUsers);


/**
 * @swagger
 * /api/conversations/{id}/members:
 *   get:
 *     summary: Get member list for a conversation (mainly for groups)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of members
 */
router.get('/conversations/:id/members', verifyToken, getConversationMembers);



/**
 * @swagger
 * /api/conversations/{id}/members:
 *   post:
 *     summary: Add members to a group
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               memberIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Members added
 */
router.post('/conversations/:id/members', verifyToken, addGroupMembers);

/**
 * @swagger
 * /api/conversations/{id}/leave:
 *   delete:
 *     summary: Leave a group conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Left group successfully
 */
router.delete('/conversations/:id/leave', verifyToken, leaveGroup);


/**
 * @swagger
 * /api/messages/{id}:
 *   delete:
 *     summary: Delete a message (for me or for everyone)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [me, everyone]
 *     responses:
 *       200:
 *         description: Message deleted
 */
router.delete('/messages/:id', verifyToken, deleteMessage);


/**
 * @swagger
 * /api/conversations/{id}/search:
 *   get:
 *     summary: Search messages within a conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Matching messages
 */
router.get('/conversations/:id/search', verifyToken, searchMessages);


/**
 * @swagger
 * /api/search/messages:
 *   get:
 *     summary: Search messages across all of the user's conversations
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Matching messages across conversations
 */
router.get('/search/messages', verifyToken, searchAllMessages);


/**
 * @swagger
 * /api/conversations/{id}/messages/{messageId}/context:
 *   get:
 *     summary: Get messages surrounding a specific message (for jump-to-search-result)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Messages around the target
 */
router.get('/conversations/:id/messages/:messageId/context', verifyToken, getMessageContext);


/**
 * @swagger
 * /api/messages/{id}:
 *   put:
 *     summary: Edit a message's content (sender only)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message edited
 */
router.put('/messages/:id', verifyToken, editMessage);


/**
 * @swagger
 * /api/messages/{id}/reactions:
 *   post:
 *     summary: Toggle/set a reaction on a message
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               emoji:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reaction toggled
 */
router.post('/messages/:id/reactions', verifyToken, toggleReaction);


/**
 * @swagger
 * /api/conversations/{id}/hide:
 *   delete:
 *     summary: Remove a conversation from your own sidebar (doesn't affect the other person)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Conversation hidden
 */
router.delete('/conversations/:id/hide', verifyToken, hideConversation);


/**
 * @swagger
 * /api/users/{id}/block:
 *   post:
 *     summary: Block a user
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User blocked
 */
router.post('/users/:id/block', verifyToken, blockUser);

/**
 * @swagger
 * /api/users/{id}/block:
 *   delete:
 *     summary: Unblock a user
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User unblocked
 */
router.delete('/users/:id/block', verifyToken, unblockUser);

/**
 * @swagger
 * /api/users/blocked:
 *   get:
 *     summary: Get list of users you've blocked
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of blocked users
 */
router.get('/users/blocked', verifyToken, getBlockedUsers);


module.exports = router;