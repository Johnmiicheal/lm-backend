import express from "express";
import dotenv from 'dotenv';
import { Configuration, OpenAIApi } from "openai";
import { createWorker } from 'tesseract.js';
import { createRequire } from "module";
import { createClient } from '@supabase/supabase-js';
const require = createRequire(import.meta.url);
const userRoutes = require("./routes/userRoutes.cjs");
const pdf2img = require('pdf-img-convert');
const fs = require('fs');
const cors = require('cors');

const app = express();

const corsOptions = {
  origin: ['https://lecturemate.org', "https://api.greynote.app/lecture"], // Replace with your frontend's domain
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders: 'Authorization',
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Enable CORS for the '/api' route
app.use('/api', cors(corsOptions));

app.use( express.json() );
app.use( express.urlencoded({ extended: true}) );

dotenv.config();

app.use("/api/auth", userRoutes);

const supabaseURL = process.env.SUPA_URL
const supabaseAnonKey = process.env.SUPA_ANON_KEY

const supabase = createClient(supabaseURL, supabaseAnonKey);

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
        }else {
          console.log("It's working!!!");
        }
    
    // PDF CUSTOMIZATION (EMBEDDING)
    app.post("/api/upload/", async (req, res) => { 
      const url = req.body.url
      const fileName = req.body.fileName
      const userId = req.body.userId
      const EMBEDDING_MODEL = "text-embedding-ada-002"
      // console.log(url)
      // console.log(fileName)
      // console.log(userId)

      async function insertBook(bookName, userId) {
        try {
          const { data, error } = await supabase
                                        .from('booklist')
                                        .insert([{ book_name: bookName, user_id: userId, }]);
            
          if (error || data === null) {
            console.error('Error inserting book:', error);
            return res.status(404).json({Error: "Please check your internet connection"})
          } else {
            console.log('Book inserted successfully:', data);
            return true
          }
        } catch (error) {
          console.log('Error inserting pdf info:', error);
          return res.status(404).json({Error: "Error uploading file"})
        }
      }
  
      async function insertPage(userId, bookName, pageData, embedding, pageNumber) {
        try {
          const { data, error } = await supabase
                                        .from('pdfs')
                                        .insert([{ user_id: userId, pdf_name: bookName, page_text: pageData, vector_data: embedding, page_number: pageNumber }]);
            
          if (error || data === null) {
            console.error('Error inserting page:', error);
            return res.status(404).json({Error: "Please check your internet connection"})
          } else {
            console.log('Page inserted successfully:', data);
            return true
          }
        } catch (error) {
          console.log('Error inserting page:', error);
          return res.status(404).json({Error: "Error uploading file"})
        }
      }

      const extractTextEmbeddings = (urlData) => {

        try{
          const outputImages1 = pdf2img.convert(urlData).catch((err) => {
            console.log("Error converting to image: " + err)
            return res.status(405).json({Error: "Error upoading file. Please ensure the file name only contains anlphabets, numbers, spaces and dashes"})            
            });
        
          outputImages1.then(async function(outputImages) { 
            function delay(ms) {
              return new Promise(resolve => setTimeout(resolve, ms));
            }
            
            if(fileName && outputImages.length !== undefined){
              try {
                console.log(outputImages.length);
                for (var i = 0; i < (outputImages.length); i++){
                fs.writeFile("output" +fileName+i+".png", outputImages[i], function (error) {
                  if (error) { console.error("Error: " + error); }
                });
                  console.log("Page "+ i +" Done");
                  }
              } catch (error) {
                console.log("Error converting to images: " + error)
                return res.status(406).json({Error: "Error upoading file"})
              }

              try {
                //Initialize worker
                  const worker = await createWorker({
                    logger: m => console.log(m)
                  });
                  
                  //Store the pdf name
                  // insertBook(fileName, userId)
                  const insertBookReturn = await insertBook(fileName, userId)

                  //Loop through the images of each page and extract vector data from the text  
                  if(insertBookReturn === true) {
                    for(var i = 0; i<outputImages.length; i++){                        
                      await worker.loadLanguage('eng');
                      await worker.initialize('eng');                
                      var { data: { text } } = await worker.recognize('./output'+fileName+i+".png");


                      const pdfEmbedding = await openai.createEmbedding({
                                                        model: EMBEDDING_MODEL,
                                                        input: text,
                                                      });
                                                      
                                            
                      const pdfTextEmbedding = pdfEmbedding.data.data[0].embedding;
                      console.log(pdfTextEmbedding);

                      //Store each of the complete page data
                      insertPage(userId, fileName, text, pdfTextEmbedding, i+1);                      

                      console.log(text)
                      
                      if(i+1 === outputImages.length){
                        res.status(200).json({Success: "Upload Successful"})
                      }
                      delay(10000000).then(
                        async () => {                    
                      await worker.terminate();   
                    });
                    }         
                  }                       
              } catch (error) {
                console.log("Error extracting and storing data from each text : " + error)
                return res.status(404).json({message : "Check your network connection and try again"})
              }}                   
        }) 
        }catch(err){
          console.log("Error uploading file: " + err)
          return res.status(400).json({"Error uploading file": err})  
        }    
    }    

    if(url && fileName && userId){
    extractTextEmbeddings(url)
    } 
    })

app.listen(process.env.PORT, () => {
  console.log(`Server listening on port ${process.env.PORT}`);
});