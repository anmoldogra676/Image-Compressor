import express from "express";
import multer from "multer";
import csv from "csv-parser";
import fetch from "node-fetch";
import fs from "fs";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import { createObjectCsvWriter } from "csv-writer"; // Import csv-writer
import Product from "./models/product.js";
import axios from "axios"; // Import axios
const app = express();
const upload = multer({ dest: "uploads/" });

// MongoDB Connection

mongoose.connect("mongodb+srv://anmoldogra:anmoldogra676@cluster1.emjym.mongodb.net/", {

}).then(() => {
  console.log("Connected to MongoDB");
}).catch((error) => {
  console.error("Error connecting to MongoDB:", error.message);
});


// Helper function to validate CSV format
function validateCSV(row) {
  const requiredHeaders = ["SerialNumber", "ProductName", "InputImageUrls"];

  if (!Object.keys(row).every((header) => requiredHeaders.includes(header))) {
    return { isValid: false, error: "Invalid CSV headers." };
  }

  if (!row.SerialNumber || !row.ProductName || !row.InputImageUrls) {
    return { isValid: false, error: "Missing required fields in CSV." };
  }

  const urlPattern = /^(https?:\/\/[^\s/$.?#].[^\s]*)$/;
  const urls = row.InputImageUrls.split(",");

  for (const url of urls) {
    if (!urlPattern.test(url.trim())) {
      return { isValid: false, error: `Invalid URL format: ${url}` };
    }
  }

  return { isValid: true };
}

// Upload API
app.post("/upload", upload.single("file"), (req, res) => {
  const requestId = uuidv4();
  const products = [];
  let validationError = null;

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", (row) => {
      const validation = validateCSV(row);
      if (!validation.isValid) {
        validationError = validation.error;
        return;
      }

      const { SerialNumber, ProductName, InputImageUrls } = row;
      const product = new Product({
        serialNumber: SerialNumber,
        productName: ProductName,
        inputImageUrls: InputImageUrls.split(","),
        requestId,
      });
      products.push(product);
    })
    .on("end", async () => {
      if (validationError) {
        res.status(400).json({ error: validationError, requestId });
      } else {
        try {
          await Product.insertMany(products);
          res.json({ requestId });
          processImages(products, requestId); // Async Image Processing
        } catch (error) {
          console.error(`Error inserting products: ${error.message}`);
          await Product.updateMany({ requestId }, { status: "cancelled" });
          res.status(500).json({ error: "Error processing images.", requestId });
        }
      }
    })
    .on("error", (err) => {
      res.status(500).json({ error: "Error reading the CSV file.", requestId });
    });
});

// Status API
app.get("/status/:requestId", async (req, res) => {
  const { requestId } = req.params;

  try {
    const products = await Product.find(
      { requestId },
      "serialNumber productName status"
    );
    res.json(
      products.map((product) => ({
        serialNumber: product.serialNumber,
        productName: product.productName,
        status: product.status,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: "Error fetching status information", requestId });
  }
});


// Function to upload image to Imgur
async function uploadToImgur(imageBuffer) {
  try {
    const response = await axios.post("https://api.imgur.com/3/image", imageBuffer, {
      headers: {
        Authorization: `Client-ID 81692a07e7993f7`, // Use your Imgur Client ID
        "Content-Type": "application/octet-stream",
      },
    });

    return response.data.data.link; // Return Imgur URL
  } catch (error) {
    console.error("Error uploading to Imgur:", error.message);
    throw error;
  }
}

// Process images and upload to Imgur

async function processImages(products, requestId) {
  const csvData = []; // Array to store data for CSV

  try {
    for (const product of products) {
      const outputUrls = [];

      for (const url of product.inputImageUrls) {
        try {
          const response = await fetch(url);

          if (!response.headers.get("content-type").startsWith("image/")) {
            console.error(`Invalid content type for URL: ${url}`);
            throw new Error("Invalid content type");
          }

          const buffer = await response.buffer();
          const compressedBuffer = await sharp(buffer)
            .jpeg({ quality: 50 })
            .toBuffer();

          // Upload compressed image to Imgur
          const outputUrl = await uploadToImgur(compressedBuffer);
          outputUrls.push(outputUrl);

        } catch (error) {
          console.error(`Error processing image from URL: ${url} - ${error.message}`);
          throw error; // Throw error to cancel processing
        }
      }

      product.outputImageUrls = outputUrls;
      product.status = "completed";
      await product.save();

      // Prepare data for the output CSV file without clickable URLs
      csvData.push({
        serialNumber: product.serialNumber,
        productName: product.productName,
        inputImageUrls: product.inputImageUrls.join(", "),  // Plain text URLs
        outputImageUrls: outputUrls.join(", "), // Plain text URLs
      });
    }

    // Generate output CSV file after successful processing
    generateOutputCSV(csvData);
  } catch (error) {
    console.error(`Processing failed: ${error.message}`);
    await Product.updateMany({ requestId }, { status: "cancelled" });
  }
}


function generateOutputCSV(data) {
  const csvWriter = createObjectCsvWriter({
    path: "./compressed-images/output.csv",
    header: [
      { id: "serialNumber", title: "Serial Number" },
      { id: "productName", title: "Product Name" },
      { id: "inputImageUrls", title: "Input Image Urls" },
      { id: "outputImageUrls", title: "Output Image Urls" },
    ],
  });

  csvWriter
    .writeRecords(data)
    .then(() => console.log("The output CSV file has been created successfully."));
}

app.listen(3000, () => {
  console.log("Server running on port 3000");
});


