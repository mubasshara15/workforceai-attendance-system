import mysql from "mysql2";

const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "rura123",
  database: "workforce_ai",
});

export default db.promise();