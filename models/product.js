// const mongoose = require("mongoose");

// const productSchema = new mongoose.Schema({
//   serialNumber: Number,
//   productName: String,
//   inputImageUrls: [String],
//   outputImageUrls: [String],
//   status: { type: String, default: "pending" },
//   requestId: String,
// });

// const Product = mongoose.model("Product", productSchema);

// module.exports = Product;
// product.js
// import mongoose from "mongoose";

// const productSchema = new mongoose.Schema({
//   serialNumber: Number,
//   productName: String,
//   inputImageUrls: [String],
//   outputImageUrls: [String],
//   status: { type: String, default: "pending" },
//   requestId: String,
// });

// export default Product = mongoose.model("Product", productSchema); // Named export
// product.js
import mongoose from "mongoose";

// Define the schema
const productSchema = new mongoose.Schema({
  serialNumber: Number,
  productName: String,
  inputImageUrls: [String],
  outputImageUrls: [String],
  status: { type: String, default: "pending" },
  requestId: String,
});

// Create the model
const Product = mongoose.model("Product", productSchema);

// Export the model as default
export default Product;
