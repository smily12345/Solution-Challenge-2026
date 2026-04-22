import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface AIAnalysis {
  category: string;
  nudge: string;
}

export async function analyzeQuestion(title: string, content: string): Promise<AIAnalysis> {
  const result = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze this student question from an Indian educational context. 
    Question Title: ${title}
    Question Content: ${content}
    
    The goal is to reduce fear of judgment. Generate a 'nudge' that validates the question and encourages others to discuss.
    Categorize it into one of: 'Conceptual', 'Social/Peer', 'Career/Future', 'Exam/Academic', or 'Curiosity'.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          nudge: { type: Type.STRING, description: "A supportive message to encourage peer discussion." }
        },
        required: ["category", "nudge"]
      }
    }
  });

  try {
    return JSON.parse(result.text || "{}") as AIAnalysis;
  } catch (e) {
    return {
      category: "General",
      nudge: "This is a meaningful question that deserves attention. Let's discuss!"
    };
  }
}
