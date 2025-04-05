const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Room = require('../models/Room');

module.exports = (wss) => {
  // Store connected clients
  const clients = new Map();
  
  wss.on('connection', async (ws, req) => {
    console.log('WebSocket connection established');
    
    // Handle authentication
    ws.isAlive = true;
    ws.authenticated = false;
    
    // Ping to keep connection alive
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    
    // Handle messages
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        
        // Handle different message types
        switch (data.type) {
          case 'auth':
            await handleAuthentication(ws, data.token);
            break;
            
          case 'message':
            if (!ws.authenticated) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Authentication required'
              }));
              return;
            }
            await handleChatMessage(ws, data);
            break;
            
          case 'join_room':
            if (!ws.authenticated) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Authentication required'
              }));
              return;
            }
            await handleJoinRoom(ws, data.roomId);
            break;
            
          case 'typing':
            if (!ws.authenticated) return;
            broadcastToRoom(ws.roomId, {
              type: 'typing',
              userId: ws.userId,
              username: ws.username,
              roomId: ws.roomId,
              isTyping: data.isTyping
            });
            break;
            
          default:
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Unknown message type'
            }));
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });
    
    // Handle disconnection
    ws.on('close', async () => {
      if (ws.authenticated && ws.userId) {
        // Update user status
        try {
          const user = await User.findById(ws.userId);
          if (user) {
            user.isOnline = false;
            user.lastSeen = Date.now();
            await user.save();
          }
          
          // Notify other users
          if (ws.roomId) {
            broadcastToRoom(ws.roomId, {
              type: 'user_left',
              userId: ws.userId,
              username: ws.username,
              roomId: ws.roomId,
              timestamp: new Date().toISOString()
            });
          }
          
          // Remove from clients map
          clients.delete(ws.userId);
        } catch (error) {
          console.error('Error handling disconnection:', error);
        }
      }
      console.log('WebSocket connection closed');
    });
  });
  
  // Authenticate user
  async function handleAuthentication(ws, token) {
    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      const user = await User.findById(decoded.id);
      
      if (!user) {
        ws.send(JSON.stringify({
          type: 'auth_error',
          message: 'User not found'
        }));
        return;
      }
      
      // Update user status
      user.isOnline = true;
      user.lastSeen = Date.now();
      await user.save();
      
      // Set authentication info
      ws.authenticated = true;
      ws.userId = user._id.toString();
      ws.username = user.username;
      
      // Add to clients map
      clients.set(ws.userId, ws);
      
      // Send successful auth response
      ws.send(JSON.stringify({
        type: 'auth_success',
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar
        }
      }));
      
      console.log(`User ${user.username} authenticated`);
    } catch (error) {
      console.error('Authentication error:', error);
      ws.send(JSON.stringify({
        type: 'auth_error',
        message: 'Invalid token'
      }));
    }
  }
  
  // Handle chat messages
  async function handleChatMessage(ws, data) {
    try {
      if (!data.roomId || !data.content) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Room ID and content are required'
        }));
        return;
      }
      
      // Find room
      const room = await Room.findById(data.roomId);
      if (!room) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Room not found'
        }));
        return;
      }
      
      // Check if user is a member of the room
      if (room.isPrivate && !room.members.includes(ws.userId)) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'You are not a member of this room'
        }));
        return;
      }
      
      // Create message
      const message = new Message({
        content: data.content,
        sender: ws.userId,
        room: data.roomId,
        type: data.type || 'text',
        fileUrl: data.fileUrl || null
      });
      
      await message.save();
      
      // Populate sender info
      await message.populate('sender', 'username avatar');
      
      // Broadcast to room
      broadcastToRoom(data.roomId, {
        type: 'new_message',
        message: {
          id: message._id,
          content: message.content,
          sender: {
            id: message.sender._id,
            username: message.sender.username,
            avatar: message.sender.avatar
          },
          roomId: message.room,
          createdAt: message.createdAt,
          messageType: message.type,
          fileUrl: message.fileUrl
        }
      });
      
    } catch (error) {
      console.error('Error handling chat message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to send message'
      }));
    }
  }
  
  // Handle join room
  async function handleJoinRoom(ws, roomId) {
    try {
      // Find room
      const room = await Room.findById(roomId);
      if (!room) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Room not found'
        }));
        return;
      }
      
      // Check if user can join private room
      if (room.isPrivate && !room.members.includes(ws.userId)) {
        // Add user to room members if not already a member
        room.members.push(ws.userId);
        await room.save();
      }
      
      // Set current room
      ws.roomId = roomId;
      
      // Notify user joined
      broadcastToRoom(roomId, {
        type: 'user_joined',
        userId: ws.userId,
        username: ws.username,
        roomId: roomId,
        timestamp: new Date().toISOString()
      });
      
      // Send room info and recent messages
      const messages = await Message.find({ room: roomId })
        .sort('-createdAt')
        .limit(50)
        .populate('sender', 'username avatar')
        .lean();
      
      ws.send(JSON.stringify({
        type: 'room_joined',
        room: {
          id: room._id,
          name: room.name,
          description: room.description,
          isPrivate: room.isPrivate
        },
        messages: messages.reverse().map(msg => ({
          id: msg._id,
          content: msg.content,
          sender: {
            id: msg.sender._id,
            username: msg.sender.username,
            avatar: msg.sender.avatar
          },
          roomId: msg.room,
          createdAt: msg.createdAt,
          messageType: msg.type,
          fileUrl: msg.fileUrl
        }))
      }));
      
    } catch (error) {
      console.error('Error handling join room:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to join room'
      }));
    }
  }
  
  // Broadcast message to all clients in a room
  function broadcastToRoom(roomId, message) {
    clients.forEach((client) => {
      if (client.authenticated && client.roomId === roomId) {
        client.send(JSON.stringify(message));
      }
    });
  }
  
  // Ping interval to detect stale connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
  
  wss.on('close', () => {
    clearInterval(interval);
  });
};