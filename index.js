// const express = require('express');
// const multer = require('multer');
// const ffmpeg = require('fluent-ffmpeg');
// const path = require('path');
// const fs = require('fs');
// const cors = require('cors');
// const axios = require('axios');

// const app = express();
// const PORT = process.env.PORT || 5000;

// // Enable CORS
// app.use(cors());

// // Setup storage engine for file uploads
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'uploads/');
//   },
//   filename: (req, file, cb) => {
//     cb(null, `${Date.now()}-${file.originalname}`);
//   },
// });

// const upload = multer({ storage });

// // Your AssemblyAI API Key
// const assemblyApiKey = "25e132d4976a476da12b619244155f22"; // Replace with your AssemblyAI API key

// // Route to upload and convert M4A to MP3
// app.post('/upload', upload.single('file'), async (req, res) => {
//   const uploadedFile = req.file;
//   if (!uploadedFile) {
//     return res.status(400).json({ error: 'No file uploaded' });
//   }

//   const outputFilePath = `uploads/${Date.now()}-converted.mp3`;

//   // Convert the uploaded M4A file to MP3 using FFmpeg
//   ffmpeg(uploadedFile.path)
//     .toFormat('mp3')
//     .on('end', async () => {
//       console.log('Conversion to MP3 completed');

//       // Remove the original M4A file after conversion
//       fs.unlink(uploadedFile.path, (err) => {
//         if (err) console.error('Error removing original file:', err);
//       });

//       // Upload the MP3 file to AssemblyAI for transcription
//       try {
//         const uploadResponse = await axios.post(
//           'https://api.assemblyai.com/v2/upload',
//           fs.createReadStream(outputFilePath),
//           {
//             headers: {
//               authorization: assemblyApiKey,
//               'Content-Type': 'application/json',
//             },
//           }
//         );

//         const audioUrl = uploadResponse.data.upload_url;

//         const transcriptResponse = await axios.post(
//           'https://api.assemblyai.com/v2/transcript',
//           {
//             audio_url: audioUrl,
//           },
//           {
//             headers: {
//               authorization: assemblyApiKey,
//             },
//           }
//         );

//         const transcriptId = transcriptResponse.data.id;

//         // Send back the transcript ID to the frontend
//         res.json({
//           success: true,
//           transcript_id: transcriptId,
//           mp3_url: `${req.protocol}://${req.get('host')}/${outputFilePath}`,
//         });
//       } catch (error) {
//         console.error('Error uploading to AssemblyAI:', error);
//         res.status(500).json({ error: 'Failed to upload to AssemblyAI' });
//       }
//     })
//     .on('error', (err) => {
//       console.error('Error during conversion:', err);
//       res.status(500).json({ error: 'Failed to convert file' });
//     })
//     .save(outputFilePath); // Save the output MP3 file to 'uploads'
// });

// // Serve static files from the 'uploads' directory
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// // Start the server
// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });



const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 5000;
require('dotenv').config();

// Enable CORS
app.use(cors());

// Setup storage engine for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });
const groq = new Groq();
const transcriptionModel = "distil-whisper-large-v3-en"; // Your transcription model
const chatModel = "llama3-groq-70b-8192-tool-use-preview"; // Your chat model

// Route to upload and convert audio to MP3
app.post('/upload', upload.single('file'), async (req, res) => {
  const uploadedFile = req.file;
  if (!uploadedFile) {
    console.error('No file uploaded');
    return res.status(400).json({ error: 'No file uploaded' });
  }

  console.log(`File uploaded: ${uploadedFile.path}`);
  
  const outputFilePath = `uploads/${Date.now()}-converted.mp3`;

  // Convert the uploaded audio file to MP3 using FFmpeg
  ffmpeg(uploadedFile.path)
    .toFormat('mp3')
    .on('end', async () => {
      console.log('Conversion to MP3 completed');

      // Remove the original audio file after conversion
      fs.unlink(uploadedFile.path, (err) => {
        if (err) {
          console.error('Error removing original file:', err);
        } else {
          console.log('Original audio file removed');
        }
      });

      // Transcribe audio using the first Groq model
      try {
        console.log(`Transcribing audio file: ${outputFilePath}`);
        const transcription = await groq.audio.transcriptions.create({
          file: fs.createReadStream(outputFilePath),
          model: transcriptionModel,
          prompt: "",
          response_format: 'verbose_json',
        });

        console.log('Transcription successful:', transcription.text);

        // Now send the transcription to the second Groq model
        try {
          console.log('Sending transcription to the second model...');
          const chatCompletion = await groq.chat.completions.create({
            messages: [
              {
                role: "system",
                content: "You are an app navigator. Users will give you voice commands, and you must map them to actions.\n\nThere are only four actions available: Dashboard, Services, Chat, Profile. If the query does not match any of these, respond with None.\n\nJust give a one-word answer, do not return anything else."
              },
              {
                role: "user",
                content: transcription.text
              }
            ],
            model: chatModel,
            temperature: 0.5,
            max_tokens: 1024,
            top_p: 0.65,
            stream: false, // Adjust as needed
          });

          console.log('Response from the second model:', chatCompletion.choices[0]?.message?.content);

          // Send back the final response to the frontend
          res.json({
            success: true,
            final_response: chatCompletion.choices[0]?.message?.content,
            mp3_url: `${req.protocol}://${req.get('host')}/${outputFilePath}`,
          });
        } catch (error) {
          console.error('Error processing text with the second Groq model:', error);
          res.status(500).json({ error: 'Failed to process text with second model' });
        }
      } catch (error) {
        console.error('Error transcribing audio with Groq:', error);
        res.status(500).json({ error: 'Failed to transcribe audio with Groq' });
      }
    })
    .on('error', (err) => {
      console.error('Error during conversion:', err);
      res.status(500).json({ error: 'Failed to convert file' });
    })
    .save(outputFilePath); // Save the output MP3 file to 'uploads'
});

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
