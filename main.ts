import GPTVisionLoader from "./gptVision.loader";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const OPENAI_API_KEY: string = process.env.OPENAI_API_KEY || "";
if (!OPENAI_API_KEY) {
  console.error(
    "❌ OPENAI_API_KEY is required. Please add it to your .env file"
  );
  process.exit(1);
}

async function processImages() {
  // Initialize the GPT Vision loader
  const visionLoader = new GPTVisionLoader(OPENAI_API_KEY);

  // Define the images directory
  const imagesDir = path.join(__dirname, "public", "images");

  try {
    // Check if directory exists
    if (!fs.existsSync(imagesDir)) {
      console.error(`❌ Directory not found: ${imagesDir}`);
      return;
    }

    // Get all image files from the directory
    const imageFiles = fs.readdirSync(imagesDir).filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return ext === ".jpg" || ext === ".jpeg" || ext === ".png";
    });

    console.log(`Found ${imageFiles.length} images to process`);

    // Process each image
    const results = [];
    let quotaExceeded = false;

    for (const imageFile of imageFiles) {
      // If quota is already exceeded, skip processing more images
      if (quotaExceeded) {
        results.push({
          image: imageFile,
          error: "Skipped due to API quota limit"
        });
        continue;
      }

      const imagePath = path.join(imagesDir, imageFile);
      console.log(`\n📷 Processing image: ${imageFile}`);

      try {
        const result = await visionLoader.analyzeImage(imagePath);

        // Try to parse the content as JSON
        let parsedResult;
        try {
          parsedResult = JSON.parse(result);
        } catch (parseError) {
          // If GPT didn't return valid JSON, use the raw text
          parsedResult = { rawText: result };
        }

        // Add the image filename to the result
        results.push({
          image: imageFile,
          analysis: parsedResult,
        });
      } catch (err: any) {
        // Check for quota exceeded error
        if (err.name === 'QuotaExceededError' || 
            (err.error?.type === 'insufficient_quota') || 
            (err.message && err.message.includes('quota'))) {
          
          console.error(`\n❌ OpenAI API QUOTA EXCEEDED ❌`);
          console.error(`You have reached your API usage limit.`);
          console.error(`Please check your billing details at: https://platform.openai.com/account/billing`);
          
          // Mark quota as exceeded to skip remaining images
          quotaExceeded = true;
          
          results.push({
            image: imageFile,
            error: "OpenAI API quota exceeded"
          });
        } else {
          console.error(`❌ Error analyzing ${imageFile}:`, err);
          results.push({
            image: imageFile,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // Output the final results as JSON
    console.log("\n===== ANALYSIS RESULTS =====\n");
    console.log(JSON.stringify(results, null, 2));

    // Save results to file
    const outputFile = path.join(__dirname, "results.json");
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    console.log(`\n✅ Results saved to ${outputFile}`);
    
    // Display additional message if quota was exceeded
    if (quotaExceeded) {
      console.log(`\n⚠️ Note: Some images were not processed due to API quota limitations.`);
    }
  } catch (error) {
    console.error("❌ Error reading images directory:", error);
  }
}

// Run the main function
processImages().catch((error) => {
  console.error("❌ Unhandled error:", error);
  
  // Check if the top-level error is a quota issue
  if (error.name === 'QuotaExceededError' || 
      (error.error?.type === 'insufficient_quota') || 
      (error.message && error.message.includes('quota'))) {
    console.error(`\n❌ OpenAI API QUOTA EXCEEDED ❌`);
    console.error(`You have reached your API usage limit.`);
    console.error(`Please check your billing details at: https://platform.openai.com/account/billing`);
  }
});
