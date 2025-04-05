const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const auth = require('../middleware/auth');

// Get messages for a room
router.get('/:roomId', auth, messageController.getMessages);

// Send a new message (HTTP fallback)
router.post('/', auth, messageController.sendMessage);

// Delete a message
router.delete('/:id', auth, messageController.deleteMessage);

module.exports = router;