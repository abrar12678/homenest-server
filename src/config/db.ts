const { MongoClient } = require("mongodb");
const env = require("./env");

const globalWithMongo = global as any;
let client: any = globalWithMongo._mongoClient;
let db: any = globalWithMongo._mongoDb;

async function connectDB(): Promise<typeof db> {
  if (client && db) {
    try {
      await client.db("homenest").command({ ping: 1 });
      return db;
    } catch {
      client = null;
      db = null;
    }
  }

  try {
    client = new MongoClient(env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 15000,
    });
    await client.connect();
    db = client.db("homenest");

    globalWithMongo._mongoClient = client;
    globalWithMongo._mongoDb = db;

    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("properties").createIndex({ postedBy: 1 });
    await db.collection("properties").createIndex({ "location.city": 1 });
    await db.collection("properties").createIndex({ propertyType: 1 });
    await db.collection("properties").createIndex({ isFeatured: 1 });
    await db.collection("properties").createIndex({ rating: -1 });
    await db.collection("properties").createIndex({ createdAt: -1 });
    await db.collection("reviews").createIndex({ propertyId: 1 });
    await db.collection("reviews").createIndex({ userId: 1 });
    await db
      .collection("reviews")
      .createIndex({ propertyId: 1, userId: 1 }, { unique: true });
    await db.collection("contactMessages").createIndex({ createdAt: -1 });
    await db
      .collection("favorites")
      .createIndex({ userId: 1, propertyId: 1 }, { unique: true });
    await db.collection("favorites").createIndex({ createdAt: -1 });
    await db
      .collection("inquiries")
      .createIndex({ fromUserId: 1, createdAt: -1 });
    await db
      .collection("inquiries")
      .createIndex({ toUserId: 1, createdAt: -1 });
    await db.collection("inquiries").createIndex({ propertyId: 1 });
    await db.collection("inquiries").createIndex({ status: 1 });
    await db.collection("visits").createIndex({ visitorId: 1, createdAt: -1 });
    await db.collection("visits").createIndex({ ownerId: 1, createdAt: -1 });
    await db.collection("visits").createIndex({ propertyId: 1 });
    await db.collection("visits").createIndex({ status: 1 });
    await db.collection("visits").createIndex({ preferredDate: 1 });
    await db.collection("deals").createIndex({ buyerId: 1, createdAt: -1 });
    await db.collection("deals").createIndex({ agentId: 1, createdAt: -1 });
    await db.collection("deals").createIndex({ propertyId: 1 });
    await db.collection("deals").createIndex({ status: 1 });
    await db
      .collection("deals")
      .createIndex({ buyerId: 1, propertyId: 1, status: 1 });
    await db
      .collection("deals")
      .createIndex({ stripePaymentId: 1 }, { sparse: true });

    console.log("MongoDB connected successfully");
    return db;
  } catch (error: any) {
    console.error("MongoDB connection error:", error.message);
    if (process.env.VERCEL) {
      throw error;
    }
    process.exit(1);
  }
}

function getDB(): any {
  if (!db) {
    throw new Error("Database not initialized. Call connectDB() first.");
  }
  return db;
}

async function disconnectDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    globalWithMongo._mongoClient = undefined;
    globalWithMongo._mongoDb = undefined;
    console.log("MongoDB disconnected");
  }
}

module.exports = { connectDB, getDB, disconnectDB };
