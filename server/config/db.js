const mysql = require("mysql2/promise");
require("dotenv").config();

const config = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// Enable SSL ONLY when not using localhost
if (
  process.env.DB_HOST &&
  process.env.DB_HOST !== "localhost" &&
  process.env.DB_HOST !== "127.0.0.1"
) {
  config.ssl = {
    minVersion: "TLSv1.2",
    rejectUnauthorized: true,
  };
}

const pool = mysql.createPool(config);

module.exports = pool;