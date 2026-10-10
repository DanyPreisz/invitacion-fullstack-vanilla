import { MongoClient, ObjectId } from "mongodb";
const uri = process.env.MONGODB_URI || "";
const dbName = process.env.MONGODB_DB || "invitacion";
let db;
export function isReady() { return Boolean(db); }
export async function connect() {
  if (!uri) throw new Error("Falta MONGODB_URI");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  db = client.db(dbName);
  await db.collection("users").createIndex({ username: 1 }, { unique: true });
  await db.collection("events").createIndex({ userId: 1, day: 1 });
  console.log(`MongoDB conectado (${dbName})`);
  return db;
}
export const users = () => db.collection("users");
export const events = () => db.collection("events");
export function toId(value) { return ObjectId.isValid(value) ? new ObjectId(String(value)) : null; }
export function mapEvent(doc) { return { id: String(doc._id), title: doc.title, place: doc.place || "", day: doc.day, rsvp: doc.rsvp || "pendiente" }; }
