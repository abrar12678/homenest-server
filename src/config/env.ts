export {};

const dotenv = require('dotenv');
dotenv.config();

const env = {
  PORT: process.env.PORT || '5000',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/homenest',
  JWT_SECRET: process.env.JWT_SECRET || 'fallback_secret_key_change_me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  NODE_ENV: process.env.NODE_ENV || 'development',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000',
};

module.exports = env;