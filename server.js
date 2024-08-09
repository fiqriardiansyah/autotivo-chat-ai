const express = require("express");
const cors = require("cors");
const cookieParser = require('cookie-parser');
const { v4 : uuid } = require('uuid');
const path = require("path");
const { GeminiAI } = require("./gemini-ai");
const { parseIncompleteJsonArray, sanitizeProducts, saveImage } = require("./utils");
const Database = require("./db/database");
require('dotenv').config();

const geminiAI = new GeminiAI();
const db = new Database("db/chat-history.db");

const checkSession = async (req, res, next) => {
    let session = req.headers["session"];

    const findSession = await db.getSession(session);
    if(!findSession) {
        session = uuid();
        await db.addSession(session);
    }
    
    req.session = session;

    next();
}

const run = async () => {
    const app = express();

    app.use(cookieParser());
    app.use(cors({
        credentials:true,      
    }));
    app.use(express.json({ limit: '10mb' }));
    app.use('/', express.static(path.join(__dirname, 'images')));

    await geminiAI.initCache();
    db.createTable();

    app.get("/", (req, res) => {
        res.status(200).send('<h1 style="font-size: 30px; color: blue;">Searching any JSL product with just one photo!</h1>')
    });

    app.post("/", checkSession, async (req, res) => {
        const image = req.body?.image;

        try {

            if(!image) {
                res.status(400).send({ error: "Image required in body request!" });
                return;
            }

            const imageName = await saveImage(image);
            const pathImage = `${req.protocol}://${req.get("host")}/` + imageName

            await db.addChat({ session: req.session, content: { image: pathImage }, mode: "user" });

            const result = await geminiAI.getProducts(image);

            const products = sanitizeProducts(parseIncompleteJsonArray(result));

            await db.addChat({ session: req.session, content: { products }, mode: "model" });

            res.status(200).send({ products });

        } catch (e) {
            res.status(500).send({ error: e?.message });
        }

    });

    app.post("/chat", checkSession, async (req, res) => {
        const message = req.body?.message;

        if(!message) {
            res.status(400).send({ error: "Message required in body request!" });
            return;
        }

        await db.addChat({ session: req.session, content: { message }, mode: "user" });

        const result = await geminiAI.chating(message);

        await db.addChat({ session: req.session, content: { message: result }, mode: "model" });

        res.status(200).send({ message: result });
    })

    app.get("/history", checkSession, async (req, res) => {

        const chats = await db.getChats(req.session);
        let result;

        if(!chats.length) {
            result = await geminiAI.chating("haloo");

            await db.addChat({ session: req.session, content: { message: result }, mode: "model" });
        }

        const startChat = { 
            id: new Date().getTime().toString(),  
            mode: "model",
            session: req.session,
            content: {
                message: result,
            }
        }

        res.status(200).send({ session: req.session, chats: chats.length ? chats : [startChat] });

    });

    app.listen(process.env.PORT, () => {
        console.log(`server running at port ${process.env.PORT}`)
    });
}

run();