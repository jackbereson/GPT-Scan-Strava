import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

// Importing results file for demonstration
import resultsData from '../../results.json';

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

      // In a real application, this is where we would process the images
      // For now, we'll simulate processing by returning the pre-existing results
      
      // Check if we have analysis data for this user in results.json
      const userData = resultsData[userId as keyof typeof resultsData];
      
      if (!userData) {
        // If no data exists for this user, return a simulated result
        return res.status(200).json({
          success: true,
          message: 'Images processed successfully',
          data: { 
            [userId]: [{
              image: `${userId}-horizontal.jpeg`,
              analysis: {
                rawText: '```json\n{"activity_name": "Sample Run", "distance": "1.5 mi", "pace": "5:30 /mi", "time": "8m 15s", "date": "April 14, 2025", "location": "Sample Location", "achievements": 2}\n```'
              }
            }]
          }
        });
      }

      // Return the actual results from results.json
      return res.status(200).json({
        success: true,
        message: 'Images processed successfully',
        data: { [userId]: userData }
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