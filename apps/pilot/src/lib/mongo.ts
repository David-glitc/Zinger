import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("Missing MONGODB_URI environment variable");
}

const mongoOpts = {
  connectTimeoutMS: 5000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 10000,
};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
  var __zingerMongoClient: MongoClient | undefined;
  var __zingerMongoPromise: Promise<MongoClient> | undefined;
}

if (process.env.NODE_ENV === "development") {
  if (!global.__zingerMongoClient) {
    global.__zingerMongoClient = new MongoClient(uri, mongoOpts);
    global.__zingerMongoPromise = global.__zingerMongoClient.connect();
  }
  client = global.__zingerMongoClient!;
  clientPromise = global.__zingerMongoPromise!;
} else {
  client = new MongoClient(uri, mongoOpts);
  clientPromise = client.connect();
}

export async function getDb(): Promise<Db> {
  const c = await clientPromise;
  const dbName = new URL(uri!).pathname.replace("/", "") || "zinger-pilot";
  return c.db(dbName);
}

export async function getCollection(name: string) {
  const db = await getDb();
  return db.collection(name);
}
