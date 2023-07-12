import express from "express";
import multer from "multer";
import cors from "cors";
import dotenv from 'dotenv';
import mongoose from "mongoose";
import { Configuration, OpenAIApi } from "openai";
import { PineconeClient } from "@pinecone-database/pinecone";
import { createWorker } from 'tesseract.js';
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const userRoutes = require("./routes/userRoutes.cjs");
const pdf2img = require('pdf-img-convert');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();

app.use(cors());
app.use( express.json() );
app.use( express.urlencoded({ extended: true}) );

dotenv.config();

app.use("/api/auth", userRoutes);


//Setup mongoose
mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log("DB Connection Successful");
})
.catch((err) => {
  console.log(err.message);
});

try{
      // Initialize Openai
      const configuration = new Configuration({
        apiKey: process.env.OPENAI_API_KEY,
        });
        const openai = new OpenAIApi(configuration);
    
        if (!configuration.apiKey) {
          res.status(500).json({
            err: {
              message: "OpenAI API key not properly configured",
            }
          });
          console.log("Error");
          // return ;
        }else {
          console.log("It's working!!!");
          // res.write("Please wait....");
        }
    
      
      
        // Initialize pinecone 
        const pinecone = new PineconeClient();
        await pinecone.init({
        environment: "us-central1-gcp",
        apiKey: process.env.PINECONE_API_KEY,
      });

      const client = new PineconeClient(); 
    
      await client.init({ 
        environment: "us-central1-gcp",
        apiKey: process.env.PINECONE_API_KEY, 
      });      
    
    // Declare constant
    const EMBEDDING_MODEL = "text-embedding-ada-002";
    
    const upload = multer({
      storage: multer.diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          cb(null, file.originalname);
        }
      })
    })
    
    // PDF CUSTOMIZATION (EMBEDDING)
    app.post("/api/upload/", upload.single("file"), async (req, res) => { 
         
      try {
      console.log(req.file);
      
      if(!req.file) {
        res.status(500).json({
          err: {
          message: "Upload failed"
        }
      });
        console.log("please upload your file");
        return;
      }

      // Pinecone Configuration     
      const list = await client.listIndexes();
            // console.log(list);
      
            if(list[0] !== "lecture-mate") {
              // delay(15000).then(
                // () => {
                  pinecone.createIndex({
                  createRequest: {
                    name: "lecture-mate",
                    dimension: 1536,
                  },
                });
                
                  console.log("Index created successfully");
                  return true;
                // }
              // )
            }else{
              console.log("There already exists that index");
            }  
      
        try{
            // Setup UUIDV4
            const uniqueId = uuidv4();
    
            //Setup the image converter and OCR
            const outputImages2 = pdf2img.convert(req.file.path).catch(err => {res.status(502).json({err: {message: "Ensure your file is not corrupted and try again"}}); console.log(err);});
    
            outputImages2.then(async function(outputImages) {           
                console.log(outputImages.length);
                function delay(ms) {
                  return new Promise(resolve => setTimeout(resolve, ms));
                }
                for (var i = 0; i < (outputImages.length); i++){
                  fs.writeFile("output" +uniqueId+i+".png", outputImages[i], function (error) {
                    if (error) { console.error("Error: " + error); }
                  });
                    console.log("Page "+ i +" Done");
                    }
                    
                    const worker = await createWorker({
                      logger: m => console.log(m)
                    });
                    
                    
                    for(var i = 0; i<outputImages.length; i++){                        
                          await worker.loadLanguage('eng');
                          await worker.initialize('eng');                
                          var { data: { text } } = await worker.recognize('./output'+uniqueId+i+".png");
    
                          //Populate index
                            try {
                              const pdfEmbedding = await openai.createEmbedding({
                                model: EMBEDDING_MODEL,
                                input: text,
                              });
                              console.log(text);
                    
                              const pdfTextEmbedding = pdfEmbedding.data.data[0].embedding;
                              console.log(pdfTextEmbedding);
                              
                              const pdfIndex = pinecone.Index("lecture-mate");
                              const upsertRequest = { vectors: [ {id: "vec" + i , values: pdfTextEmbedding, metadata: { text: text }} ] , namespace: `lecture-mate-${uniqueId}` };
                    
                              //initalizing.....this will take up to 2 mins
                    
                                try{
                                  pdfIndex.upsert({ upsertRequest });
                                  console.log("Upsert Successfull " + i);
                                  const completionPercentage = Math.floor((i+1)/outputImages.length*100);
                                  var count = "Uploading "+ completionPercentage + "%";
                                  console.log(count);
                                  }catch(err){
                                  console.log(err);
                                }
                              }catch(err){
                                  console.log(err);
                            }
    
                          console.log(text);
                          delay(10000000).then(
                            async () => {                    
                          await worker.terminate();   
                        }); 
                                        
                      }
                        res.json({uniqueId: uniqueId});                    
                    }).catch(err => {console.log(err)});
                  }catch(err) {
                      res.status(500).json({err: {message: "There was an error processing your request"}});
                  }

      }catch(err) {
        console.log(err);
          res.status(500).json({err: {message: "Check your internet connection and try again"}});     
      }
    });        
    
}catch(err){
  console.log(err);
}

app.listen(process.env.PORT, () => {
  console.log(`Server listening on port ${process.env.PORT}`);
});