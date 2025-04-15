import { OpenAI } from "openai";
import fs from "fs";

class GPTVisionLoader {
  private openai: OpenAI;
  private maxRetries: number;
  private initialRetryDelay: number;

  constructor(apiKey: string, maxRetries = 3, initialRetryDelay = 1000) {
    this.openai = new OpenAI({
      apiKey,
    });
    this.maxRetries = maxRetries;
    this.initialRetryDelay = initialRetryDelay;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async analyzeImage(imagePath: string): Promise<any> {
    let retries = 0;

    while (true) {
      try {
        const base64Image = fs.readFileSync(imagePath, { encoding: "base64" });

        const response = await this.openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract all activity data from this Strava screenshot, including: activity name, distance, pace, moving time, elevation gain, calories, heart rate, date, and location (if available). Return result in JSON format with exact values as shown in the image, preserving all units.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 1000,
        });

        const content = response.choices[0]?.message?.content;

        console.log("✅ Parsed Result:\n", content);
        
        // Parse the JSON content to return an object instead of a string
        try {
          if (content) {
            // Extract JSON from the content (in case it contains markdown code block)
            let jsonString = content;
            
            // Try to extract JSON from markdown code blocks
            const jsonMatch = content.match(/```(?:json)?([\s\S]*?)```/);
            if (jsonMatch) {
              jsonString = jsonMatch[1].trim();
            }
            
            // If there's no code block but we see a JSON object directly
            if (jsonString.trim().startsWith("{") && jsonString.trim().endsWith("}")) {
              return JSON.parse(jsonString);
            }
            
            // If the result already contained parsed JSON (like your example that started with "✅ Parsed Result:")
            const parsedResultMatch = content.match(/✅\s*Parsed\s*Result:\s*(?:```(?:json)?([\s\S]*?)```|([\s\S]*))/i);
            if (parsedResultMatch) {
              const extractedJson = (parsedResultMatch[1] || parsedResultMatch[2]).trim();
              return JSON.parse(extractedJson);
            }
            
            // Final fallback - just try to parse the whole content
            return JSON.parse(jsonString);
          }
          return null;
        } catch (jsonError) {
          console.warn("⚠️ Failed to parse JSON result:", jsonError);
          // Return the raw content if JSON parsing fails
          return content;
        }
      } catch (error: any) {
        // Check specifically for quota errors
        if (
          error.error?.type === "insufficient_quota" ||
          (error.message && error.message.includes("quota"))
        ) {
          const quotaError = new Error(
            "OpenAI API quota exceeded. Please check your billing details at https://platform.openai.com/account/billing"
          );
          quotaError.name = "QuotaExceededError";
          throw quotaError;
        }

        // Handle rate limiting and other potential temporary errors
        if (
          (error.status === 429 ||
            error.status === 500 ||
            error.status === 503) &&
          retries < this.maxRetries
        ) {
          retries++;
          const delay = this.initialRetryDelay * Math.pow(2, retries - 1);
          console.warn(
            `⚠️ API request failed. Retrying in ${delay}ms (${retries}/${this.maxRetries})...`
          );
          await this.sleep(delay);
          continue;
        }

        console.error("❌ Error analyzing image:", error);
        throw error;
      }
    }
  }

  public async analyzeMultipleImages(imagePaths: string[]): Promise<any[]> {
    const results = [];

    for (const imagePath of imagePaths) {
      try {
        console.log(`Processing image: ${imagePath}`);
        const result = await this.analyzeImage(imagePath);
        results.push({
          path: imagePath,
          data: result,
        });
      } catch (error: any) {
        console.error(`Failed to analyze image ${imagePath}:`, error);
        results.push({
          path: imagePath,
          error: error.message || "Unknown error occurred",
        });
      }
    }

    return results;
  }
}

export default GPTVisionLoader;
