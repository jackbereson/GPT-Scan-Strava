import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

export interface MergedImageResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

export class ImageProcessor {
  /**
   * Merges all images in a folder into one large image
   * @param folderPath The path to the folder containing the images to merge
   * @param outputFileName The name of the output file (without extension)
   * @param options Configuration options for the merge operation
   * @returns Promise with result information
   */
  public async mergeImagesInFolder(
    folderPath: string,
    outputFileName: string = 'merged-images',
    options: {
      direction: 'horizontal' | 'vertical',
      margin: number, // Margin between images in pixels
      maxImagesPerRow?: number, // Only used when direction is horizontal but want to wrap to multiple rows
      outputFormat: 'jpeg' | 'png',
      quality: number, // 1-100 for jpeg
    } = {
      direction: 'vertical',
      margin: 10,
      outputFormat: 'jpeg',
      quality: 90,
    }
  ): Promise<MergedImageResult> {
    try {
      // Check if directory exists
      if (!fs.existsSync(folderPath)) {
        return { 
          success: false, 
          error: `Directory not found: ${folderPath}` 
        };
      }

      // Get all image files from the directory
      const imageFiles = fs.readdirSync(folderPath)
        .filter(file => {
          const ext = path.extname(file).toLowerCase();
          return ext === '.jpg' || ext === '.jpeg' || ext === '.png';
        })
        .map(file => path.join(folderPath, file));

      if (imageFiles.length === 0) {
        return { 
          success: false, 
          error: `No image files found in directory: ${folderPath}` 
        };
      }

      console.log(`Found ${imageFiles.length} images to merge in ${folderPath}`);

      // Load all images using sharp
      const images = await Promise.all(
        imageFiles.map(async (file) => {
          try {
            const metadata = await sharp(file).metadata();
            return {
              path: file,
              width: metadata.width || 0,
              height: metadata.height || 0,
              buffer: await sharp(file).toBuffer()
            };
          } catch (err) {
            console.error(`Error processing image ${file}:`, err);
            throw err;
          }
        })
      );

      let outputImage;
      
      // Horizontal merge (side by side)
      if (options.direction === 'horizontal') {
        outputImage = await this.mergeImagesHorizontally(images, options);
      } 
      // Vertical merge (stacked)
      else {
        outputImage = await this.mergeImagesVertically(images, options);
      }

      // Create output directory if it doesn't exist
      const outputDir = path.join(folderPath, 'merged');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Save the merged image
      const outputPath = path.join(
        outputDir, 
        `${outputFileName}.${options.outputFormat}`
      );
      
      await outputImage.toFile(outputPath);

      console.log(`✅ Successfully merged images into: ${outputPath}`);
      return {
        success: true,
        outputPath
      };
    } catch (error) {
      console.error('❌ Error merging images:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Merges images horizontally (side by side)
   * @param images Array of image objects with metadata
   * @param options Merge options
   * @returns Sharp instance with the merged image
   */
  private async mergeImagesHorizontally(
    images: Array<{ path: string; width: number; height: number; buffer: Buffer }>,
    options: { margin: number; maxImagesPerRow?: number; quality: number }
  ): Promise<sharp.Sharp> {
    // If maxImagesPerRow is set, organize images into rows
    if (options.maxImagesPerRow && options.maxImagesPerRow > 0) {
      return this.mergeImagesInGrid(images, options);
    }

    // Calculate total width and find maximum height
    const totalWidth = images.reduce(
      (sum, img, i) => sum + img.width + (i > 0 ? options.margin : 0), 
      0
    );
    const maxHeight = Math.max(...images.map(img => img.height));

    // Create a new image with the calculated dimensions
    const composite = images.map((img, i) => {
      // Calculate x position (including margins)
      let x = images
        .slice(0, i)
        .reduce((sum, prevImg, j) => sum + prevImg.width + (j > 0 ? options.margin : 0), 0);
      
      // Add margin for all but the first image
      if (i > 0) x += options.margin;
      
      // Center vertically if needed
      const y = Math.floor((maxHeight - img.height) / 2);
      
      return {
        input: img.buffer,
        left: x,
        top: y,
      };
    });

    return sharp({
      create: {
        width: totalWidth,
        height: maxHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
    .composite(composite)
    .jpeg({ quality: options.quality });
  }

  /**
   * Merges images vertically (stacked)
   * @param images Array of image objects with metadata
   * @param options Merge options
   * @returns Sharp instance with the merged image
   */
  private async mergeImagesVertically(
    images: Array<{ path: string; width: number; height: number; buffer: Buffer }>,
    options: { margin: number; quality: number }
  ): Promise<sharp.Sharp> {
    // Calculate total height and find maximum width
    const totalHeight = images.reduce(
      (sum, img, i) => sum + img.height + (i > 0 ? options.margin : 0), 
      0
    );
    const maxWidth = Math.max(...images.map(img => img.width));

    // Create a new image with the calculated dimensions
    const composite = images.map((img, i) => {
      // Calculate y position (including margins)
      let y = images
        .slice(0, i)
        .reduce((sum, prevImg, j) => sum + prevImg.height + (j > 0 ? options.margin : 0), 0);
      
      // Add margin for all but the first image
      if (i > 0) y += options.margin;
      
      // Center horizontally if needed
      const x = Math.floor((maxWidth - img.width) / 2);
      
      return {
        input: img.buffer,
        top: y,
        left: x,
      };
    });

    return sharp({
      create: {
        width: maxWidth,
        height: totalHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
    .composite(composite)
    .jpeg({ quality: options.quality });
  }

  /**
   * Merges images in a grid layout (for horizontal with maxImagesPerRow)
   * @param images Array of image objects with metadata
   * @param options Merge options
   * @returns Sharp instance with the merged image
   */
  private async mergeImagesInGrid(
    images: Array<{ path: string; width: number; height: number; buffer: Buffer }>,
    options: { margin: number; maxImagesPerRow?: number; quality: number }
  ): Promise<sharp.Sharp> {
    const maxImagesPerRow = options.maxImagesPerRow || 3;
    const rows = Math.ceil(images.length / maxImagesPerRow);
    
    // Create array of rows, each containing up to maxImagesPerRow images
    const imagesByRow = Array.from({ length: rows }, (_, rowIndex) => {
      const startIdx = rowIndex * maxImagesPerRow;
      const endIdx = Math.min(startIdx + maxImagesPerRow, images.length);
      return images.slice(startIdx, endIdx);
    });
    
    // Calculate dimensions for each row
    const rowDimensions = imagesByRow.map(rowImages => {
      const rowWidth = rowImages.reduce(
        (sum, img, i) => sum + img.width + (i > 0 ? options.margin : 0), 
        0
      );
      const rowHeight = Math.max(...rowImages.map(img => img.height));
      return { width: rowWidth, height: rowHeight };
    });
    
    // Calculate overall dimensions
    const totalWidth = Math.max(...rowDimensions.map(dim => dim.width));
    const totalHeight = rowDimensions.reduce(
      (sum, dim, i) => sum + dim.height + (i > 0 ? options.margin : 0), 
      0
    );
    
    // Create composite operations for all images
    const composite = [];
    let currentY = 0;
    
    for (let rowIndex = 0; rowIndex < imagesByRow.length; rowIndex++) {
      const rowImages = imagesByRow[rowIndex];
      const rowHeight = rowDimensions[rowIndex].height;
      
      let currentX = 0;
      
      for (let colIndex = 0; colIndex < rowImages.length; colIndex++) {
        const img = rowImages[colIndex];
        
        // Add margin between images
        if (colIndex > 0) currentX += options.margin;
        
        // Center vertically within the row if needed
        const y = currentY + Math.floor((rowHeight - img.height) / 2);
        
        composite.push({
          input: img.buffer,
          left: currentX,
          top: y,
        });
        
        currentX += img.width;
      }
      
      currentY += rowHeight;
      // Add margin between rows
      if (rowIndex < imagesByRow.length - 1) currentY += options.margin;
    }
    
    return sharp({
      create: {
        width: totalWidth,
        height: totalHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
    .composite(composite)
    .jpeg({ quality: options.quality });
  }
}

export default ImageProcessor;