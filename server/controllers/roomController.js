const Room = require('../models/Room');
const User = require('../models/User');

// Get all rooms
exports.getRooms = async (req, res) => {
  try {
    const rooms = await Room.find({
      $or: [
        { isPrivate: false },
        { members: req.user.id }
      ]
    })
      .populate('createdBy', 'username avatar')
      .sort('name')
      .lean();
    
    res.status(200).json({
      success: true,
      rooms
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get a specific room
exports.getRoom = async (req, res) => {
  try {
    const { id } = req.params;
    
    const room = await Room.findById(id)
      .populate('members', 'username avatar isOnline lastSeen')
      .populate('admins', 'username avatar')
      .populate('createdBy', 'username avatar');
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }
    
    // Check if user can access private room
    if (room.isPrivate && !room.members.some(member => member._id.toString() === req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    res.status(200).json({
      success: true,
      room
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Create a new room
exports.createRoom = async (req, res) => {
  try {
    const { name, description, isPrivate, members } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Room name is required'
      });
    }
    
    // Create room
    const room = new Room({
      name,
      description,
      isPrivate: isPrivate || false,
      members: members ? [...members, req.user.id] : [req.user.id],
      admins: [req.user.id],
      createdBy: req.user.id
    });
    
    await room.save();
    
    // Populate creator info
    await room.populate('createdBy', 'username avatar');
    
    res.status(201).json({
      success: true,
      room
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Update a room
exports.updateRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, isPrivate } = req.body;
    
    // Find room
    const room = await Room.findById(id);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }
    
    // Check if user is an admin
    if (!room.admins.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this room'
      });
    }
    
    // Update room
    if (name) room.name = name;
    if (description !== undefined) room.description = description;
    if (isPrivate !== undefined) room.isPrivate = isPrivate;
    
    await room.save();
    
    res.status(200).json({
      success: true,
      room
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Delete a room
exports.deleteRoom = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find room
    const room = await Room.findById(id);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }
    
    // Check if user is an admin or creator
    if (room.createdBy.toString() !== req.user.id && !room.admins.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this room'
      });
    }
    
    await room.remove();
    
    res.status(200).json({
      success: true,
      message: 'Room deleted'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Add a user to a room
exports.addMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    // Find room
    const room = await Room.findById(id);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }
    
    // Check if user is an admin
    if (!room.admins.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add members'
      });
    }
    
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if user is already a member
    if (room.members.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: 'User is already a member of this room'
      });
    }
    
    // Add user to room
    room.members.push(userId);
    await room.save();
    
    res.status(200).json({
      success: true,
      message: 'User added to room'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Remove a user from a room
exports.removeMember = async (req, res) => {
  try {
    const { id, userId } = req.params;
    
    // Find room
    const room = await Room.findById(id);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }
    
    // Check if user is authorized to remove members
    const isAdmin = room.admins.includes(req.user.id);
    const isSelf = userId === req.user.id;
    
    if (!isAdmin && !isSelf) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to remove this member'
      });
    }
    
    // Check if user is a member
    if (!room.members.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: 'User is not a member of this room'
      });
    }
    
    // Remove user from room
    room.members = room.members.filter(member => member.toString() !== userId);
    
    // If user is an admin, remove from admins too
    if (room.admins.includes(userId)) {
      room.admins = room.admins.filter(admin => admin.toString() !== userId);
    }
    
    await room.save();
    
    res.status(200).json({
      success: true,
      message: 'User removed from room'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};