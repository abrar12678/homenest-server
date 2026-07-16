export {};

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const env = require('../config/env');
const { sanitizeUser, isValidEmail, sendError, sendSuccess } = require('../utils/helpers');

/**
 * POST /api/auth/register
 * Register a new user
 */
async function register(req: any, res: any): Promise<void> {
  try {
    const { name, email, password, role } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return sendError(res, 400, 'Name is required.');
    }

    if (!email || !email.trim()) {
      return sendError(res, 400, 'Email is required.');
    }

    if (!isValidEmail(email)) {
      return sendError(res, 400, 'Please provide a valid email address.');
    }

    if (!password || password.length < 8) {
      return sendError(res, 400, 'Password must be at least 8 characters long.');
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return sendError(res, 400, 'Password must contain at least one letter and one number.');
    }

    // Validate role (admin cannot register directly)
    const validRoles = ['user', 'agent'];
    const userRole = validRoles.includes(role) ? role : 'user';

    const db = getDB();
    const usersCollection = db.collection('users');

    // Check if email already exists
    const existingUser = await usersCollection.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return sendError(res, 400, 'An account with this email already exists.');
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user document
    const now = new Date().toISOString();
    const newUser = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: userRole,
      avatar: '',
      phone: '',
      isBanned: false,
      createdAt: now,
      updatedAt: now,
    };

    const result = await usersCollection.insertOne(newUser);

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: result.insertedId.toString(),
        email: newUser.email,
        role: newUser.role,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    const safeUser = sanitizeUser({
      ...newUser,
      _id: result.insertedId.toString(),
    });

    sendSuccess(res, { user: safeUser, token }, 201);
  } catch (error: any) {
    console.error('Register error:', error);
    sendError(res, 500, 'Server error during registration. Please try again.');
  }
}

/**
 * POST /api/auth/login
 * Login an existing user
 */
async function login(req: any, res: any): Promise<void> {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !email.trim()) {
      return sendError(res, 400, 'Email is required.');
    }

    if (!password) {
      return sendError(res, 400, 'Password is required.');
    }

    const db = getDB();
    const usersCollection = db.collection('users');

    // Find user by email
    const user = await usersCollection.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return sendError(res, 401, 'Invalid email or password.');
    }

    // Check if user is banned
    if (user.isBanned) {
      return sendError(res, 403, 'Your account has been suspended. Please contact support.');
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return sendError(res, 401, 'Invalid email or password.');
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    const safeUser = sanitizeUser({
      ...user,
      _id: user._id.toString(),
    });

    sendSuccess(res, { user: safeUser, token });
  } catch (error: any) {
    console.error('Login error:', error);
    sendError(res, 500, 'Server error during login. Please try again.');
  }
}

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
async function getMe(req: any, res: any): Promise<void> {
  try {
    const db = getDB();
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({
      _id: new ObjectId(req.user.userId),
    });

    if (!user) {
      return sendError(res, 404, 'User not found.');
    }

    const safeUser = sanitizeUser({
      ...user,
      _id: user._id.toString(),
    });

    sendSuccess(res, { user: safeUser });
  } catch (error: any) {
    console.error('Get me error:', error);
    sendError(res, 500, 'Server error. Please try again.');
  }
}

/**
 * POST /api/auth/google
 * Google OAuth authentication
 */
const googleAuth = async (req: any, res: any) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return sendError(res, 400, 'Google token is required');

    const { verifyGoogleToken } = require('../config/google');
    const googleUser = await verifyGoogleToken(idToken);

    const db = getDB();
    // Check if user exists
    let user = await db.collection('users').findOne({ email: googleUser.email });

    if (!user) {
      // Create new user
      const newUser = {
        name: googleUser.name,
        email: googleUser.email,
        password: '', // No password for Google users
        role: 'user',
        avatar: googleUser.picture,
        googleId: googleUser.googleId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const result = await db.collection('users').insertOne(newUser);
      user = { ...newUser, _id: result.insertedId };
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    res.status(200).json({
      success: true,
      data: { user: sanitizeUser(user), token },
    });
  } catch (error: any) {
    console.error('Google auth error:', error);
    res.status(400).json({ success: false, message: 'Google authentication failed' });
  }
};

/**
 * PUT /api/auth/profile
 * Update user profile (name, phone, avatar)
 */
async function updateProfile(req: any, res: any): Promise<void> {
  try {
    const { name, phone, avatar } = req.body;
    const db = getDB();
    const usersCollection = db.collection('users');

    const updateFields: any = { updatedAt: new Date().toISOString() };
    if (name && name.trim()) updateFields.name = name.trim();
    if (phone !== undefined) updateFields.phone = phone.trim();
    if (avatar !== undefined) updateFields.avatar = avatar.trim();

    await usersCollection.updateOne(
      { _id: new ObjectId(req.user.userId) },
      { $set: updateFields }
    );

    const updatedUser = await usersCollection.findOne({
      _id: new ObjectId(req.user.userId),
    });

    if (!updatedUser) {
      return sendError(res, 404, 'User not found.');
    }

    sendSuccess(res, { user: sanitizeUser({ ...updatedUser, _id: updatedUser._id.toString() }) });
  } catch (error: any) {
    console.error('Update profile error:', error);
    sendError(res, 500, 'Failed to update profile.');
  }
}

module.exports = { register, login, getMe, googleAuth, updateProfile };