import GPTVisionLoader from "./gptVision.loader";
import ImageProcessor from "./imageProcessor.service";
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

// Define types for our results
interface ImageAnalysisResult {
  image: string;
  analysis?: any;
  error?: string;
}

interface UserResults {
  [userFolder: string]: ImageAnalysisResult[];
}

async function processImages() {
  // Initialize the GPT Vision loader
  const visionLoader = new GPTVisionLoader(OPENAI_API_KEY);
  // Initialize the Image Processor
  const imageProcessor = new ImageProcessor();

  // Define the images directory
  const imagesDir = path.join(__dirname, "public", "images");

  try {
    // Check if directory exists
    if (!fs.existsSync(imagesDir)) {
      console.error(`❌ Directory not found: ${imagesDir}`);
      return;
    }

    // Get all user folders
    const userFolders = fs.readdirSync(imagesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    if (userFolders.length === 0) {
      console.error(`❌ No user folders found in ${imagesDir}`);
      return;
    }

    console.log(`Found ${userFolders.length} user folders to process: ${userFolders.join(', ')}`);

    // Process each user's folder
    const allResults: UserResults = {};
    let quotaExceeded = false;

    // First, merge images for each user folder
    for (const userFolder of userFolders) {
      const userDir = path.join(imagesDir, userFolder);
      console.log(`\n🔄 Merging images for user: ${userFolder}`);
      
      // // Merge images vertically (default)
      // const verticalMergeResult = await imageProcessor.mergeImagesInFolder(
      //   userDir, 
      //   `${userFolder}-vertical`, 
      //   { 
      //     direction: 'vertical',
      //     margin: 10,
      //     outputFormat: 'jpeg',
      //     quality: 90 
      //   }
      // );

      // if (verticalMergeResult.success) {
      //   console.log(`✅ Vertical merge successful: ${verticalMergeResult.outputPath}`);
      // } else {
      //   console.error(`❌ Failed to merge images vertically: ${verticalMergeResult.error}`);
      // }

      // Merge images horizontally with 2 images per row
      const horizontalMergeResult = await imageProcessor.mergeImagesInFolder(
        userDir, 
        `${userFolder}-horizontal`, 
        { 
          direction: 'horizontal',
          maxImagesPerRow: 2,
          margin: 10,
          outputFormat: 'jpeg',
          quality: 90 
        }
      );

      if (horizontalMergeResult.success) {
        console.log(`✅ Horizontal merge successful: ${horizontalMergeResult.outputPath}`);
      } else {
        console.error(`❌ Failed to merge images horizontally: ${horizontalMergeResult.error}`);
      }
    }

    // Then analyze the merged horizontal images instead of individual images
    for (const userFolder of userFolders) {
      const userDir = path.join(imagesDir, userFolder);
      const mergedDir = path.join(userDir, 'merged');
      const horizontalImagePath = path.join(mergedDir, `${userFolder}-horizontal.jpeg`);
      
      console.log(`\n👤 Processing merged image for user: ${userFolder}`);
      
      // Store results for this user
      const userResults: ImageAnalysisResult[] = [];

      // Skip if quota is already exceeded
      if (quotaExceeded) {
        userResults.push({
          image: `${userFolder}-horizontal.jpeg`,
          error: "Skipped due to API quota limit"
        });
      } else {
        try {
          // Check if the merged image exists
          if (!fs.existsSync(horizontalImagePath)) {
            console.error(`❌ Merged horizontal image not found: ${horizontalImagePath}`);
            userResults.push({
              image: `${userFolder}-horizontal.jpeg`,
              error: "Merged image not found"
            });
            continue;
          }
          
          console.log(`📷 Analyzing merged horizontal image for user ${userFolder}`);
          
          // Use the merged horizontal image for analysis
          const content = await visionLoader.analyzeImage(horizontalImagePath);
          
          // Try to parse the content as JSON
          let parsedResult;
          try {
            parsedResult = JSON.parse(content);
          } catch (parseError) {
            // If GPT didn't return valid JSON, use the raw text
            parsedResult = { rawText: content };
          }
          
          // Add the image filename to the result
          userResults.push({
            image: `${userFolder}-horizontal.jpeg`,
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
            
            // Mark quota as exceeded to skip remaining users
            quotaExceeded = true;
            
            userResults.push({
              image: `${userFolder}-horizontal.jpeg`,
              error: "OpenAI API quota exceeded"
            });
          } else {
            console.error(`❌ Error analyzing merged image for ${userFolder}:`, err);
            userResults.push({
              image: `${userFolder}-horizontal.jpeg`,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
      
      // Add user results to the all results object
      allResults[userFolder] = userResults;
    }

    // Output the final results as JSON
    console.log("\n===== ANALYSIS RESULTS BY USER =====\n");
    console.log(JSON.stringify(allResults, null, 2));

    // Save results to file
    const outputFile = path.join(__dirname, "results.json");
    fs.writeFileSync(outputFile, JSON.stringify(allResults, null, 2));
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
