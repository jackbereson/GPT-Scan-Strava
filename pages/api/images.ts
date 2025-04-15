import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import GPTVisionLoader from '../../services/gptVision.loader';
import ImageProcessor from '../../services/imageProcessor.service';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Handle GET requests to retrieve images
  if (req.method === 'GET') {
    try {
      // Get userId from query parameter
      const userId = req.query.userId as string;

      if (!userId || userId.trim() === '') {
        return res.status(400).json({
          message: 'User ID is required',
          images: []
        });
      }

      // Define user directory path
      const userDir = path.join(process.cwd(), 'public', 'images', userId);
      
      // Check if directory exists
      if (!fs.existsSync(userDir)) {
        return res.status(200).json({
          message: 'No images found for this user',
          images: []
        });
      }

      // Get all files in the directory
      const files = await fs.promises.readdir(userDir);
      
      // Filter for image files and ignore directories
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
      const imageFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        const fileStat = fs.statSync(path.join(userDir, file));
        return !fileStat.isDirectory() && imageExtensions.includes(ext);
      });

      // Convert to public URLs
      const imageUrls = imageFiles.map(file => `/images/${userId}/${file}`);
      
      return res.status(200).json({
        message: 'Images retrieved successfully',
        images: imageUrls
      });
    } catch (error) {
      console.error('Error retrieving images:', error);
      return res.status(500).json({
        message: 'Error retrieving images',
        images: []
      });
    }
  } 
  // Handle POST requests for image processing
  else if (req.method === 'POST') {
    try {
      // Get userId from query parameter
      const userId = req.query.userId as string;

      if (!userId || userId.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      // Define user directory path
      const userDir = path.join(process.cwd(), 'public', 'images', userId);
      
      // Check if directory exists
      if (!fs.existsSync(userDir)) {
        return res.status(404).json({
          success: false,
          message: 'No images found for this user'
        });
      }

      // Get all image files for this user
      const files = await fs.promises.readdir(userDir);
      
      // Filter for image files
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
      const imageFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        const fileStat = fs.statSync(path.join(userDir, file));
        return !fileStat.isDirectory() && imageExtensions.includes(ext);
      });

      if (imageFiles.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No image files found for this user'
        });
      }

      // Make sure to set your OpenAI API key in environment variables
      const openaiApiKey = process.env.OPENAI_API_KEY;
      
      if (!openaiApiKey) {
        return res.status(500).json({
          success: false,
          message: 'OpenAI API key not configured'
        });
      }
      
      // Initialize services
      const visionLoader = new GPTVisionLoader(openaiApiKey);
      const imageProcessor = new ImageProcessor();
      
      // First, merge images horizontally with 2 images per row
      console.log(`🔄 Merging images for user: ${userId}`);
      const horizontalMergeResult = await imageProcessor.mergeImagesInFolder(
        userDir, 
        `${userId}-horizontal`, 
        { 
          direction: 'horizontal',
          maxImagesPerRow: 2,
          margin: 10,
          outputFormat: 'jpeg',
          quality: 90 
        }
      );

      if (!horizontalMergeResult.success) {
        return res.status(500).json({
          success: false,
          message: `Failed to merge images: ${horizontalMergeResult.error}`
        });
      }

      console.log(`✅ Horizontal merge successful: ${horizontalMergeResult.outputPath}`);

      // Use the merged horizontal image for analysis
      const mergedImagePath = horizontalMergeResult.outputPath as string;
      const analysis = await visionLoader.analyzeImage(mergedImagePath);
      
      const processedResult = {
        image: path.basename(mergedImagePath),
        analysis: analysis // Store the analysis object directly since it's already parsed
      };

      // Save results for this user to a file
      const resultsDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }
      
      const userResultsPath = path.join(resultsDir, `${userId}-results.json`);
      fs.writeFileSync(userResultsPath, JSON.stringify(processedResult, null, 2));

      // Return the results
      return res.status(200).json({
        success: true,
        message: 'Images merged and processed successfully',
        data: { [userId]: processedResult }
      });
    } catch (error) {
      console.error('Error processing images:', error);
      return res.status(500).json({
        success: false,
        message: 'Error processing images'
      });
    }
  } else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}