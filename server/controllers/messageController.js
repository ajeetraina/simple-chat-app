const Message = require('../models/Message');
const Room = require('../models/Room');

// Get messages for a room
exports.getMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { limit = 50, before } = req.query;
    
    // Find room
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }
    
    // Check if user is a member of private room
    if (room.isPrivate && !room.members.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Build query
    const query = { room: roomId };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }
    
    // Get messages
    const messages = await Message.find(query)
      .sort('-createdAt')
      .limit(parseInt(limit))
      .populate('sender', 'username avatar')
      .lean();
    
    res.status(200).json({
      success: true,
      messages: messages.reverse()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Send a new message (HTTP fallback)
exports.sendMessage = async (req, res) => {
  try {
    const { roomId, content, type = 'text', fileUrl } = req.body;
    
    if (!roomId || !content) {
      return res.status(400).json({
        success: false,
        message: 'Room ID and content are required'
      });
    }
    
    // Find room
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }
    
    // Check if user is a member of private room
    if (room.isPrivate && !room.members.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Create message
    const message = new Message({
      content,
      sender: req.user.id,
      room: roomId,
      type,
      fileUrl
    });
    
    await message.save();
    
    // Populate sender info
    await message.populate('sender', 'username avatar');
    
    res.status(201).json({
      success: true,
      message
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Delete a message
exports.deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find message
    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }
    
    // Check if user is the sender
    if (message.sender.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this message'
      });
    }
    
    await message.remove();
    
    res.status(200).json({
      success: true,
      message: 'Message deleted'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};