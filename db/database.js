const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

class Database {

    constructor(path) {
        if(fs.existsSync(path) || this.db) {
            this.db = new sqlite3.Database(path);
            console.log("Connection with SQLite has been established");
        } else {
            const db = new sqlite3.Database(path, (error) => {
              if (error) {
                throw new Error(error?.message);
              }
            });
            console.log("Connection with SQLite has been established");
            this.db = db;
        }
    }

    checkIfTableExists(tableName, callback) {
        this.db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [tableName], (err, row) => {
          if (err) {
            console.error(err.message);
            callback(err);
          } else {
            callback(null, !!row);
          }
        });
    }

    createTable() {
        this.checkIfTableExists('session', (err, exists) => {
            if(!exists) {
                this.db.exec(`
                    CREATE TABLE session
                    (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session TEXT
                    );
                `);
            }
        });
        this.checkIfTableExists('chat', (err, exists) => {
            if(!exists) {
                this.db.exec(`
                    CREATE TABLE chat
                    (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session TEXT,
                        content TEXT,
                        createdAt INTEGER,
                        mode VARCHAR(10)
                    );
                `);
            }
        });
    }

    async seedDb() {
        await Promise.all([this.addSession("test"), this.addChat({ session: "test", message: "test" })])
    }

    async addSession(session) {
        const query = `
            INSERT INTO session (session) VALUES (?)
        `
        const sessionId = await new Promise((resolve, reject) => {
            this.db.run(query, [session], function (error) {
                if(error) {
                    console.error(error?.message)
                    reject(error?.message);
                }
                resolve(this.lastID);
            });
        });
        return sessionId
    }

    async getSession(session) {
        if(!session) return {};
        const query = `SELECT * FROM session WHERE session = ?`

        const result = await new Promise((resolve, reject) => {
            this.db.get(query, [session], function (error, row) {
                if(error) {
                    console.error(error?.message)
                    reject(error?.message);
                }
                resolve(row)
            });
        });
        
        return result
    }

    async getSessions() {
        const query = `SELECT * FROM session`

        const result = await new Promise((resolve, reject) => {
            this.db.all(query, [], function (error, row) {
                if(error) {
                    console.error(error?.message)
                    reject(error?.message);
                }
                resolve(row)
            });
        });
        return result
    }

    async addChat({ session, content, mode }) {
        const query = `INSERT INTO chat (session, content, mode, createdAt) VALUES (?, ?, ?, ?)`;
        const result = await new Promise((resolve, reject) => {
            this.db.run(query, [session, JSON.stringify(content), mode, new Date().getTime()], function(error) {
                if(error) {
                    console.error(error?.message);
                    reject(error?.message);
                }
                resolve(this.lastID)
            })
        });
        return result;
    }
    
    async getChats(session) {
        const query = `SELECT * FROM chat WHERE session = ? ORDER BY createdAt ASC`

        const result = await new Promise((resolve, reject) => {
            this.db.all(query, [session], function (error, row) {
                if(error) {
                    console.error(error?.message)
                    reject(error?.message);
                }
                resolve(row?.map((dt) => ({ ...dt, content: JSON.parse(dt?.content) })))
            });
        });
        return result
    }
}

module.exports = Database;