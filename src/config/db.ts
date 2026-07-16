const { MongoClient } = require("mongodb");
const env = require("./env");

let client: any = null;
let db: any = null;

async function connectDB() {
  // If cached, ping to check if alive
  if (client && db) {
    try {
      await client.db("homenest").command({ ping: 1 });
      return db;
    } catch {
      client = null;
      db = null;
    }
  }

  client = new MongoClient(env.MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
  await client.connect();
  db = client.db("homenest");

  // Indexes (idempotent)
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
  await db.collection("inquiries").createIndex({ toUserId: 1, createdAt: -1 });
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
}

function getDB() {
  if (!db) throw new Error("Database not initialized.");
  return db;
}

async function disconnectDB() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

module.exports = { connectDB, getDB, disconnectDB };
