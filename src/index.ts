export {};

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const { connectDB } = require('./config/db');

// Import routes
const authRoutes = require('./routes/auth');
const propertyRoutes = require('./routes/properties');
const reviewRoutes = require('./routes/reviews');
const contactRoutes = require('./routes/contact');
const uploadRoutes = require('./routes/upload');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const favoriteRoutes = require('./routes/favorites');
const inquiryRoutes = require('./routes/inquiries');
const visitRoutes = require('./routes/visits');
const dealRoutes = require('./routes/deals');
const { getStats } = require('./controllers/propertyController');
const { sanitizeMiddleware } = require('./middleware/sanitize');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Stripe webhook needs raw body (before JSON middleware)
// We'll handle this with a separate router that uses raw-body parser

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// XSS sanitization — strip all HTML from string inputs
app.use(sanitizeMiddleware);

// Rate limiting
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
      success: false,
      message: 'Too many requests from this IP, please try again later.',
    },
  })
);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/inquiries', inquiryRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/deals', dealRoutes);

// Public stats endpoint
app.get('/api/stats', getStats);

// Health check
app.get('/api/health', (_req: any, res: any) => {
  res.json({ success: true, message: 'HomeNest API is running!' });
});

// 404 handler
app.use((_req: any, res: any) => {
  res.status(404).json({
    success: false,
    message: 'Route not found.',
  });
});

// Global error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error.',
  });
});

// Start server
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    });
  })
  .catch((err: any) => {
    console.error('Failed to connect to DB:', err);
    process.exit(1);
  });

module.exports = app;