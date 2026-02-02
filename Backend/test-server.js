console.log("Test 1");
import express from "express";
console.log("Test 2");
const app = express();
console.log("Test 3");
app.listen(5001, () => console.log("Test 4 - Server started"));
