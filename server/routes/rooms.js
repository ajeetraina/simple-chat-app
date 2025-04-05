const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const auth = require('../middleware/auth');

// Get all rooms
router.get('/', auth, roomController.getRooms);

// Get a specific room
router.get('/:id', auth, roomController.getRoom);

// Create a new room
router.post('/', auth, roomController.createRoom);

// Update a room
router.put('/:id', auth, roomController.updateRoom);

// Delete a room
router.delete('/:id', auth, roomController.deleteRoom);

// Add a user to a room
router.post('/:id/members', auth, roomController.addMember);

// Remove a user from a room
router.delete('/:id/members/:userId', auth, roomController.removeMember);

module.exports = router;