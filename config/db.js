const { MongoClient, ServerApiVersion } = require("mongodb");

const uri = `mongodb+srv://aiPromptHubDB:J6HclvDEDu0gMuzS@cluster0.tumnydo.mongodb.net/?appName=Cluster0`;
// ⬆️ replace "cluster0.xxxxx" with your actual Atlas cluster address

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const connectDB = async () => {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
  }
};

module.exports = { client, connectDB };