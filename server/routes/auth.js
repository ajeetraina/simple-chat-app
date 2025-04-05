const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

// Register a new user
router.post('/register', authController.register);

// Login user
router.post('/login', authController.login);

// Get current user profile
router.get('/me', auth, authController.getMe);

// Logout user
router.post('/logout', auth, authController.logout);

module.exports = router;