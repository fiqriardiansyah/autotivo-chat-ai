const xlsx = require("xlsx");
const path = require('path');
const fs = require("fs");
const { v4: uuid } = require("uuid");

var signatures = {
    JVBERi0: "application/pdf",
    R0lGODdh: "image/gif",
    R0lGODlh: "image/gif",
    iVBORw0KGgo: "image/png",
    "/9j/": "image/jpg"
};
  
const detectMimeType = (b64) => {
    for (var s in signatures) {
        if (b64.indexOf(s) === 0) {
        return signatures[s];
        }
    }
}

const convertExcelToJson = (name) => {

    const filePath = path.join(__dirname, name);

    const workbok = xlsx.readFile(filePath);
    const sheetname = workbok.SheetNames[0];
    const worksheet = workbok.Sheets[sheetname];

    const json = xlsx.utils.sheet_to_json(worksheet);
    return json.filter((item) => Boolean(item.BASE64))
};

const sanitizeBase64 = (base64) => base64.replace(/^data:image\/[a-z]+;base64,/, '');

const convertToParts = (dataset) => {
    return dataset.reduce((arr, obj) => {
        const inlineData = {
            data: sanitizeBase64(obj.BASE64),
            mimeType: "image/jpeg",
        }
        const text = Object.keys(obj).map((key) => {
            if(key === "BASE64") return null;
            return `${key}: ${obj[key]}`
        }).filter(Boolean).join(", ")

        return [...arr, { inlineData }, { text }]
    }, []);
}

const convertToPartsText = (dataset) => {
    return dataset.reduce((arr, obj) => {
        const text = Object.keys(obj).map((key) => {
            if(key === "BASE64") return null;
            return `${key}: ${obj[key]}`
        }).filter(Boolean).join(", ")

        return [...arr, { text }]
    }, []);
}

function parseIncompleteJsonArray(val) {
    const split = val.split('{').map((chunk) => {
      return chunk.split("},").join("").trim();
    });
    
    split.shift(); split.pop();
    const temp = [];
    split.forEach((str) => {
      try {
        const addCurly = "{" + str + "}";
        temp.push(JSON.parse(addCurly))
      } catch (e) {
        console.log(e?.message);
      }
    });
    
    return temp;
}

function sanitizeProducts(parseJson) {
    const filteringNull = parseJson.filter((res) => res?.url);
    
    // filtering the same name, code, url product;
    const filteringDuplicate = filteringNull.reduce((arr, curr) => {
        if(arr.find((p) => p?.url === curr?.url)) return arr;
        return [...arr, curr]
    }, []);

    // merge same product with multiple image;
    const grouping = filteringDuplicate.reduce((arr, curr) => {
        const sameProduct = arr.find((p) => p?.code1 === curr?.code1 && p?.name === curr?.name && p?.brand === curr?.brand);
        if(sameProduct) {
            return arr.map((p) => {
                if(sameProduct?.code1 !== p?.code1) return p;
                return {
                    ...p,
                    url: [...(p?.url || []), curr?.url].filter(Boolean),
                }
            });
        }
        return [...arr, { ...curr, url: [curr?.url] }]
    }, []);

    return grouping
}

async function saveImage(base64) {
 try {
    const filename = 'image-' + uuid() + '.jpg';

    if(!fs.existsSync(path.join(__dirname, "images"))) {
        fs.mkdirSync(path.join(__dirname, "images"));
    }

    const filepath = path.join(__dirname, "images", filename);

    const base64image = base64.split(';base64,').pop();

    return await new Promise((res, rej) => {
        fs.writeFile(filepath, base64image, { encoding: "base64" }, (err) => {
            if(err) {
                rej(new Error(err?.message));
            }
            res(filename);
        });
    });
 } catch (e) {
    console.log(e);
 }
}
  
module.exports = {
    convertExcelToJson,
    convertToPartsText,
    detectMimeType,
    convertToParts,
    sanitizeBase64,
    parseIncompleteJsonArray,
    sanitizeProducts,
    saveImage,
}
