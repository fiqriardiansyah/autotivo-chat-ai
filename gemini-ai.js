const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAICacheManager } = require("@google/generative-ai/server");
const { sanitizeBase64, convertExcelToJson, convertToParts, convertToPartsText } = require("./utils");
const { description } = require("./description");

const productCacheProperty = {
    displayName: "catalogue-products",
    model: 'models/gemini-1.5-flash-001',
    systemInstruction: "provide a list of products that are exact or similar to user input from existing data." +
    "return as JSON array of objects (maximal 5 object). example: [{ url, name, code1, brand, subbrand }], " +
    " if there is no matching product return an empty array []",
    ttlSeconds: 365 * 24 * 60 * 60, // satu tahun cache
}

const chatCacheProperty = {
    displayName: "chat",
    model: 'models/gemini-1.5-flash-001',
    systemInstruction: `
        anda adalah call center yang menangani produk berdasarkan deskripsi sebelumnya tentang PT. SEHATI PRIMA MAKMUR, Autotivo dan JSL. dan anda akan menjawab dan mengobrol dengan masukan selanjutnya dari pengguna sebagai call center. jika user menyakan tentang produk maka berikan rekomendasi produk diatas, contoh: 
        ----------------
        Agya/ayla Handle Cover Xtivo Blacktivo 
        AGHCXTBT
        https://s3.ap-southeast-1.amazonaws.com/crealoka/product/24/ORIGINAL/kyYsywBadnaWPDoUyXfg.jpg
        -----------------
    `,
    ttlSeconds: 365 * 24 * 60 * 60, // satu tahun cache
}

class GeminiAI {
    cacheManager;

    constructor() {
        this.cacheManager = new GoogleAICacheManager(process.env.API_KEY);
        this.datasets = [
            {
                text: "Recognize all this products with the attributes such as url, name, code1, brand, subbrand"
            }, 
            ...convertToParts(convertExcelToJson("data/data-ai.xlsx"))
        ];
        this.datasetsChat = [
            {
                text: "Berikan rekomendasi berdasarkan produk-produk dibawah ini"
            }, 
            ...convertToPartsText(convertExcelToJson("data/data-ai.xlsx"))
        ]
    }

    async initCache() {
        await this.listCache();
        if(!this.cache) {
            await this.createProductCache();
        }
    }

    async listCache() {
        const listResult = await this.cacheManager.list();
        listResult.cachedContents?.forEach((cache) => {
            this.cache = [...(this?.cache || []), cache].filter(Boolean);
        });
    }

    async createProductCache() {
        const cache = await this.cacheManager.create({
            model: productCacheProperty.model,
            displayName: productCacheProperty.displayName,
            systemInstruction: productCacheProperty.systemInstruction,
            ttlSeconds: productCacheProperty.ttlSeconds,
            contents: [
                {
                    role: "model",
                    parts: this.datasets,
                },
            ]
        });

        this.cache = [...(this?.cache || []), cache];
    
        return cache
    }

    async updateChace(options) {
        const cache = await this.cacheManager.update(productCacheProperty.displayName, options);
        return cache
    }

    async deleteCache(name) {
        await this.cacheManager.delete(name);
    }

    async getProducts(base64) {
        const cache = this.cache.find((c) => c.displayName === productCacheProperty.displayName);
        const genAI = new GoogleGenerativeAI(process.env.API_KEY);
        const model = genAI.getGenerativeModelFromCachedContent(cache);

        const parts = [
            {
                text: "Product:",
            },
            {
                inlineData: {
                    data: sanitizeBase64(base64),
                    mimeType: "image/jpeg",
                }
            }
        ];

        const result = await model.generateContent({
            contents: [
                {
                    role: "user",
                    parts,
                }
            ],
            generationConfig: {
                temperature: 0.1,
                topP: 0.95,
                topK: 32,
                maxOutputTokens: 1024 * 3,
                responseMimeType: "application/json",
            },
        });

        return result.response.text();
    }

    async chating(message) {
        if(!this.chat) {
            const genAI = new GoogleGenerativeAI(process.env.API_KEY);
            const chatModel = genAI.getGenerativeModel({
                model: chatCacheProperty.model,
                systemInstruction: chatCacheProperty.systemInstruction,
                generationConfig: {
                    temperature: 0.1,
                },
            });

            const chat = chatModel.startChat({ 
                history: [
                    {
                        role: "user",
                        parts: [ { text: description } ]
                    },
                    {
                        role: 'model',
                        parts: this.datasetsChat
                    }
                ],
            });

            this.chat = chat;
        }

        const result1 = await this.chat.sendMessage(message);

        return result1.response.text();
    }
}

module.exports = {
    GeminiAI,
}